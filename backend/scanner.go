package backend

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/dhowden/tag"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type CacheEntry struct {
	FilePath     string    `json:"filePath"`
	Title        string    `json:"title"`
	DurationSec  float64   `json:"durationSec"`
	BPM          float64   `json:"bpm"`
	KeySignature string    `json:"keySignature"`
	Waveform     []float32 `json:"waveform"`
	Size         int64     `json:"size"`
	ModTime      int64     `json:"modTime"`
	Artist       string    `json:"artist"`
	Genre        string    `json:"genre"`
	Mood         string    `json:"mood"`
}

func (a *App) GetMusicDir() (string, error) {
	home, err := osUserHomeDir()
	if err != nil {
		Log(LogError, "app", "GetMusicDir: home dir error: %v", err)
		return "", err
	}
	dir := filepath.Join(home, ".0xplayer")
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		err = osMkdirAll(dir, 0755)
		if err != nil {
			Log(LogError, "app", "GetMusicDir: mkdir %s error: %v", dir, err)
			return "", err
		}
	}
	Log(LogInfo, "app", "GetMusicDir -> %s", dir)
	return dir, nil
}

func (a *App) ScanMusicDir() ([]TrackMetadata, error) {
	Log(LogInfo, "library", "ScanMusicDir start")
	dir, err := a.GetMusicDir()
	if err != nil {
		return nil, err
	}

	cachePath := filepath.Join(dir, "cache.json")
	cacheMap := make(map[string]CacheEntry)

	scanMu.Lock()
	defer scanMu.Unlock()

	if cacheBytes, readErr := os.ReadFile(cachePath); readErr == nil {
		var cachedList []CacheEntry
		if jsonErr := json.Unmarshal(cacheBytes, &cachedList); jsonErr == nil {
			for _, entry := range cachedList {
				cacheMap[entry.FilePath] = entry
			}
		}
	}

	var initialList []TrackMetadata
	for _, entry := range cacheMap {
		initialList = append(initialList, TrackMetadata{
			FilePath:     entry.FilePath,
			Title:        entry.Title,
			Artist:       entry.Artist,
			Genre:        entry.Genre,
			DurationSec:  entry.DurationSec,
			BPM:          entry.BPM,
			KeySignature: entry.KeySignature,
			Waveform:     entry.Waveform,
			Mood:         entry.Mood,
		})
	}

	runScan := func() ([]TrackMetadata, error) {
		var list []TrackMetadata
		freshCacheMap := make(map[string]CacheEntry)
		var activeCacheList []CacheEntry

		walkErr := filepathWalk(dir, func(path string, info os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if !info.IsDir() {
				ext := strings.ToLower(filepath.Ext(path))
				if ext == ".mp3" || ext == ".wav" || ext == ".flac" {
					if cached, found := cacheMap[path]; found && cached.Size == info.Size() && cached.ModTime == info.ModTime().Unix() {
						tagTitle, tagArtist, tagGenre := extractTagsOrFilename(path)
						if cached.Title == "" {
							cached.Title = tagTitle
						}
						if cached.Artist == "" || cached.Artist == "Unknown Artist" {
							cached.Artist = tagArtist
						}
						if cached.Genre == "" || cached.Genre == "Unknown Genre" {
							cached.Genre = tagGenre
						}
						if cached.Mood == "" {
							cached.Mood = DetermineMood(cached.BPM, cached.KeySignature, cached.Genre)
						}

						meta := TrackMetadata{
							FilePath:     path,
							Title:        cached.Title,
							Artist:       cached.Artist,
							Genre:        cached.Genre,
							DurationSec:  cached.DurationSec,
							BPM:          cached.BPM,
							KeySignature: cached.KeySignature,
							Waveform:     cached.Waveform,
							Mood:         cached.Mood,
						}
						freshCacheMap[path] = cached
						activeCacheList = append(activeCacheList, cached)
						list = append(list, meta)
						return nil
					}

					meta := AnalyzeFile(path)
					if meta.DurationSec > 0 {
						meta.Title, meta.Artist, meta.Genre = extractTagsOrFilename(path)
						meta.Mood = DetermineMood(meta.BPM, meta.KeySignature, meta.Genre)

						newCacheEntry := CacheEntry{
							FilePath:     path,
							Title:        meta.Title,
							DurationSec:  meta.DurationSec,
							BPM:          meta.BPM,
							KeySignature: meta.KeySignature,
							Waveform:     meta.Waveform,
							Size:         info.Size(),
							ModTime:      info.ModTime().Unix(),
							Artist:       meta.Artist,
							Genre:        meta.Genre,
							Mood:         meta.Mood,
						}
						freshCacheMap[path] = newCacheEntry
						activeCacheList = append(activeCacheList, newCacheEntry)
					}
					list = append(list, meta)
				}
			}
			return nil
		})

		if walkErr == nil {
			if cacheBytes, marshalErr := json.Marshal(activeCacheList); marshalErr == nil {
				_ = os.WriteFile(cachePath, cacheBytes, 0600)
			}
			Log(LogInfo, "library", "scan completed: %d tracks found", len(list))
			if a.ctx != nil {
				wailsRuntime.EventsEmit(a.ctx, "library_changed", list)
			}
			return list, nil
		}
		Log(LogError, "library", "scan walk failed: %v", walkErr)
		return nil, walkErr
	}

	if a.SyncScan {
		return runScan()
	}

	go func() {
		_, _ = runScan()
	}()

	return initialList, nil
}

func (a *App) OpenMusicDir() {
	dir, err := a.GetMusicDir()
	if err != nil {
		return
	}
	Log(LogInfo, "app", "OpenMusicDir %s", dir)
	if goos := osRuntimeGOOS; goos == "windows" {
		startCmd("explorer", dir)
	} else if goos == "darwin" {
		startCmd("open", dir)
	} else {
		startCmd("xdg-open", dir)
	}
}

// GetTrackCover extracts embedded ID3 / FLAC / Vorbis album cover art and returns a Data URL
func (a *App) GetTrackCover(filePath string) (string, error) {
	if filePath == "" {
		return "", nil
	}
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	m, err := tag.ReadFrom(f)
	if err != nil {
		return "", nil
	}

	pic := m.Picture()
	if pic == nil || len(pic.Data) == 0 {
		return "", nil
	}

	mime := pic.MIMEType
	if mime == "" {
		ext := strings.ToLower(pic.Ext)
		if ext == "png" {
			mime = "image/png"
		} else {
			mime = "image/jpeg"
		}
	}

	b64 := base64.StdEncoding.EncodeToString(pic.Data)
	return fmt.Sprintf("data:%s;base64,%s", mime, b64), nil
}
