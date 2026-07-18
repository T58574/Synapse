package backend

import (
	"context"
	"encoding/json"
	"fmt"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
	"github.com/dhowden/tag"
)

var (
	openFileDialog = wailsRuntime.OpenFileDialog
	osRuntimeGOOS  = runtime.GOOS
	startCmd       = func(name string, args ...string) error {
		return exec.Command(name, args...).Start()
	}
	osUserHomeDir = os.UserHomeDir
	osMkdirAll    = os.MkdirAll
	filepathWalk  = filepath.Walk
	playlistMu    sync.Mutex
	scanMu        sync.Mutex
)

type App struct {
	ctx            context.Context
	currentPaths   [2]string
	currentPathsMu sync.Mutex
}

func NewApp() *App {
	return &App{}
}

func (a *App) Startup(ctx context.Context) {
	InitLogger()
	Log(LogInfo, "app", "=== 0xSoundPlayer startup ===")
	a.ctx = ctx
	Log(LogInfo, "app", "init audio engine: sampleRate=44100 channels=2")
	InitAudioEngine(44100, 2)
	a.GetMusicDir()
	if ctx != nil {
		go a.broadcastSpectrum()
	}
}

func (a *App) broadcastSpectrum() {
	ticker := time.NewTicker(16 * time.Millisecond)
	defer ticker.Stop()

	wasPlaying := false
	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			p0 := IsTrackPlaying(0)
			p1 := IsTrackPlaying(1)

			if p0 || p1 {
				wasPlaying = true
				spec0 := GetTrackSpectrum(0, 64)
				spec1 := GetTrackSpectrum(1, 64)

				wailsRuntime.EventsEmit(a.ctx, "spectrum", map[string][]float32{
					"deck0": spec0,
					"deck1": spec1,
				})
			} else if wasPlaying {
				zeroSpec := make([]float32, 64)
				wailsRuntime.EventsEmit(a.ctx, "spectrum", map[string][]float32{
					"deck0": zeroSpec,
					"deck1": zeroSpec,
				})
				wasPlaying = false
			}
		}
	}
}

func (a *App) Shutdown(ctx context.Context) {
	Log(LogInfo, "app", "=== 0xSoundPlayer shutdown ===")
	CleanupAudioEngine()
	CloseLogger()
}

func (a *App) LoadTrack(slot int, filePath string) (TrackMetadata, error) {
	Log(LogInfo, "app", "LoadTrack slot=%d path=%q", slot, filePath)
	
	a.currentPathsMu.Lock()
	a.currentPaths[slot] = filePath
	a.currentPathsMu.Unlock()

	ok := LoadTrack(slot, filePath)
	if !ok {
		Log(LogError, "app", "LoadTrack: движок не смог загрузить slot=%d path=%q", slot, filePath)
		return TrackMetadata{}, fmt.Errorf("failed to load track")
	}
	meta := GetTrackMetadata(slot, filePath)
	artist, genre := extractTagsOrFilename(filePath)
	meta.Artist = artist
	meta.Genre = genre
	meta.Mood = DetermineMood(meta.BPM, meta.KeySignature, genre)

	go func(s int, path string, initialMeta TrackMetadata) {
		analyzed := AnalyzeFile(path)
		analyzed.Artist = initialMeta.Artist
		analyzed.Genre = initialMeta.Genre
		analyzed.Mood = DetermineMood(analyzed.BPM, analyzed.KeySignature, analyzed.Genre)
		
		a.currentPathsMu.Lock()
		stillSame := a.currentPaths[s] == path
		a.currentPathsMu.Unlock()

		if stillSame {
			SetTrackMetadata(s, analyzed)
			if a.ctx != nil {
				wailsRuntime.EventsEmit(a.ctx, "track_analyzed", s, analyzed)
			}
		}
	}(slot, filePath, meta)

	Log(LogInfo, "app", "LoadTrack OK slot=%d duration=%.3fs bpm=%.1f key=%s waveform=%d mood=%s",
		slot, meta.DurationSec, meta.BPM, meta.KeySignature, len(meta.Waveform), meta.Mood)
	return meta, nil
}

func DetermineMood(bpm float64, key string, genre string) string {
	genre = strings.ToLower(genre)
	key = strings.ToUpper(key)
	if strings.Contains(genre, "lofi") || strings.Contains(genre, "ambient") || strings.Contains(genre, "chill") || strings.Contains(genre, "classical") || strings.Contains(genre, "relax") {
		return "chill"
	}
	if strings.Contains(genre, "metal") || strings.Contains(genre, "rock") || strings.Contains(genre, "edm") || strings.Contains(genre, "dance") || strings.Contains(genre, "electronic") || strings.Contains(genre, "synthwave") {
		if bpm > 110 {
			return "energetic"
		}
		return "dark"
	}
	isMinor := strings.HasSuffix(key, "A")
	if bpm >= 125 {
		if isMinor {
			return "dark"
		}
		return "energetic"
	} else if bpm >= 100 {
		if isMinor {
			return "chill"
		}
		return "happy"
	} else {
		if isMinor {
			return "calm"
		}
		return "peaceful"
	}
}

func (a *App) Play(slot int) {
	Log(LogInfo, "app", "Play slot=%d", slot)
	PlayTrack(slot)
}

func (a *App) Pause(slot int) {
	Log(LogInfo, "app", "Pause slot=%d", slot)
	PauseTrack(slot)
}

func (a *App) Seek(slot int, positionSec float64) {
	Log(LogInfo, "app", "Seek slot=%d pos=%.3fs", slot, positionSec)
	SeekTrack(slot, positionSec)
}

func (a *App) SetVolume(slot int, volume float64) {
	Log(LogDebug, "app", "SetVolume slot=%d vol=%.2f", slot, volume)
	SetTrackVolume(slot, float32(volume))
}

func (a *App) SetEQ(slot int, bass, mid, treble float64) {
	Log(LogInfo, "app", "SetEQ slot=%d bass=%.1f mid=%.1f treble=%.1f", slot, bass, mid, treble)
	SetTrackEQ(slot, float32(bass), float32(mid), float32(treble))
}

func (a *App) SetEQ10(slot int, bands []float64) {
	Log(LogInfo, "app", "SetEQ10 slot=%d count=%d", slot, len(bands))
	bandsF32 := make([]float32, len(bands))
	for i, v := range bands {
		bandsF32[i] = float32(v)
	}
	SetTrackEQ10(slot, bandsF32)
}

func (a *App) SetDSP(slot int, limiterBoost, stereoWidth, reverbMix, bassBoost, trebleExciter float64) {
	Log(LogInfo, "app", "SetDSP slot=%d limiterBoost=%.2f stereoWidth=%.2f reverbMix=%.2f bassBoost=%.2f trebleExciter=%.2f",
		slot, limiterBoost, stereoWidth, reverbMix, bassBoost, trebleExciter)
	SetTrackDSP(slot, float32(limiterBoost), float32(stereoWidth), float32(reverbMix), float32(bassBoost), float32(trebleExciter))
}

func (a *App) SetTempo(slot int, tempoRatio float64) {
	Log(LogInfo, "app", "SetTempo slot=%d ratio=%.3f", slot, tempoRatio)
	SetTrackTempo(slot, tempoRatio)
}

func (a *App) SetPitch(slot int, pitchSemi float64) {
	Log(LogInfo, "app", "SetPitch slot=%d semi=%.1f", slot, pitchSemi)
	SetTrackPitch(slot, pitchSemi)
}

func (a *App) GetPosition(slot int) float64 {
	pos := GetTrackPosition(slot)
	Log(LogDebug, "app", "GetPosition slot=%d -> %.3fs", slot, pos)
	return pos
}

func (a *App) IsPlaying(slot int) bool {
	playing := IsTrackPlaying(slot)
	Log(LogDebug, "app", "IsPlaying slot=%d -> %v", slot, playing)
	return playing
}

func (a *App) ToggleAutoMix(enabled bool) {
	Log(LogInfo, "app", "ToggleAutoMix enabled=%v", enabled)
	SetAutomixEnabled(enabled)
}

func (a *App) SetCrossfadeDuration(durationSec float64) {
	Log(LogInfo, "app", "SetCrossfadeDuration=%.1fs", durationSec)
	SetCrossfadeDuration(durationSec)
}

func (a *App) GetSpectrum(slot int) []float32 {
	return GetTrackSpectrum(slot, 64)
}

func (a *App) SelectAudioFile() (string, error) {
	Log(LogInfo, "app", "SelectAudioFile dialog open")
	path, err := openFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Select Audio File",
		Filters: []wailsRuntime.FileFilter{
			{
				DisplayName: "Audio Files (*.mp3, *.wav, *.flac)",
				Pattern:     "*.mp3;*.wav;*.flac",
			},
		},
	})
	if err != nil {
		Log(LogError, "app", "SelectAudioFile error: %v", err)
	} else {
		Log(LogInfo, "app", "SelectAudioFile selected=%q", path)
	}
	return path, err
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

type CacheEntry struct {
	FilePath     string    `json:"filePath"`
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

func (a *App) ScanMusicDir() ([]TrackMetadata, error) {
	scanMu.Lock()
	defer scanMu.Unlock()
	Log(LogInfo, "library", "ScanMusicDir start")
	dir, err := a.GetMusicDir()
	if err != nil {
		return nil, err
	}
	cachePath := filepath.Join(dir, "cache.json")
	cacheMap := make(map[string]CacheEntry)
	if cacheBytes, readErr := os.ReadFile(cachePath); readErr == nil {
		var cachedList []CacheEntry
		if unmarshalErr := json.Unmarshal(cacheBytes, &cachedList); unmarshalErr == nil {
			for _, entry := range cachedList {
				cacheMap[entry.FilePath] = entry
			}
			Log(LogInfo, "library", "loaded %d cached entries", len(cacheMap))
		}
	}
	var list []TrackMetadata
	var activeCacheList []CacheEntry
	err = filepathWalk(dir, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			Log(LogWarn, "library", "walk error on %s: %v", path, walkErr)
			return walkErr
		}
		if !info.IsDir() {
			ext := filepath.Ext(path)
			if ext == ".mp3" || ext == ".wav" || ext == ".flac" {
				var meta TrackMetadata
				cached, found := cacheMap[path]
				if found && cached.Size == info.Size() && cached.ModTime == info.ModTime().Unix() {
					meta = TrackMetadata{
						FilePath:     cached.FilePath,
						DurationSec:  cached.DurationSec,
						BPM:          cached.BPM,
						KeySignature: cached.KeySignature,
						Waveform:     cached.Waveform,
						Artist:       cached.Artist,
						Genre:        cached.Genre,
						Mood:         cached.Mood,
					}
					if meta.Mood == "" {
						meta.Mood = DetermineMood(meta.BPM, meta.KeySignature, meta.Genre)
						cached.Mood = meta.Mood
						cacheMap[path] = cached
					}
					activeCacheList = append(activeCacheList, cached)
				} else {
					meta = AnalyzeFile(path)
					artist, genre := extractTagsOrFilename(path)
					meta.Artist = artist
					meta.Genre = genre
					meta.Mood = DetermineMood(meta.BPM, meta.KeySignature, genre)
					newCacheEntry := CacheEntry{
						FilePath:     meta.FilePath,
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
					cacheMap[path] = newCacheEntry
					activeCacheList = append(activeCacheList, newCacheEntry)
				}
				list = append(list, meta)
			}
		}
		return nil
	})
	if err == nil {
		if cacheBytes, marshalErr := json.Marshal(activeCacheList); marshalErr == nil {
			_ = os.WriteFile(cachePath, cacheBytes, 0600)
		}
	}
	Log(LogInfo, "library", "ScanMusicDir done: %d tracks, err=%v", len(list), err)
	return list, err
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

type AudioDevice struct {
	Name      string `json:"name"`
	ID        string `json:"id"`
	IsDefault bool   `json:"isDefault"`
}

func (a *App) GetAudioDevices() ([]AudioDevice, error) {
	jsonStr := GetAudioDevices()
	var list []AudioDevice
	if err := json.Unmarshal([]byte(jsonStr), &list); err != nil {
		return nil, err
	}
	return list, nil
}

func (a *App) SetAudioDevice(deviceId string) bool {
	Log(LogInfo, "app", "SetAudioDevice: %s", deviceId)
	return SetAudioDevice(deviceId)
}

func (a *App) LogFromJS(level string, message string) {
	var logLevel LogLevel
	switch level {
	case "DEBUG":
		logLevel = LogDebug
	case "WARN":
		logLevel = LogWarn
	case "ERROR":
		logLevel = LogError
	default:
		logLevel = LogInfo
	}
	Log(logLevel, "ui", "%s", message)
}

type Playlist struct {
	Name       string   `json:"name"`
	TrackPaths []string `json:"trackPaths"`
}

func (a *App) getPlaylistsPath() (string, error) {
	dir, err := a.GetMusicDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "playlists.json"), nil
}

func (a *App) getPlaylistsInternal() ([]Playlist, error) {
	path, err := a.getPlaylistsPath()
	if err != nil {
		return nil, err
	}
	bytes, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []Playlist{}, nil
		}
		return nil, err
	}
	var playlists []Playlist
	if err := json.Unmarshal(bytes, &playlists); err != nil {
		return nil, err
	}
	if playlists == nil {
		return []Playlist{}, nil
	}
	return playlists, nil
}

func (a *App) savePlaylistsInternal(playlists []Playlist) error {
	path, err := a.getPlaylistsPath()
	if err != nil {
		return err
	}
	bytes, err := json.Marshal(playlists)
	if err != nil {
		return err
	}
	return os.WriteFile(path, bytes, 0600)
}

func (a *App) GetPlaylists() ([]Playlist, error) {
	playlistMu.Lock()
	defer playlistMu.Unlock()
	return a.getPlaylistsInternal()
}

func (a *App) SavePlaylists(playlists []Playlist) error {
	playlistMu.Lock()
	defer playlistMu.Unlock()
	return a.savePlaylistsInternal(playlists)
}

func (a *App) CreatePlaylist(name string) error {
	playlistMu.Lock()
	defer playlistMu.Unlock()
	playlists, err := a.getPlaylistsInternal()
	if err != nil {
		return err
	}
	for _, p := range playlists {
		if p.Name == name {
			return fmt.Errorf("playlist already exists")
		}
	}
	playlists = append(playlists, Playlist{Name: name, TrackPaths: []string{}})
	return a.savePlaylistsInternal(playlists)
}

func (a *App) DeletePlaylist(name string) error {
	playlistMu.Lock()
	defer playlistMu.Unlock()
	playlists, err := a.getPlaylistsInternal()
	if err != nil {
		return err
	}
	index := -1
	for i, p := range playlists {
		if p.Name == name {
			index = i
			break
		}
	}
	if index == -1 {
		return fmt.Errorf("playlist not found")
	}
	playlists = append(playlists[:index], playlists[index+1:]...)
	return a.savePlaylistsInternal(playlists)
}

func (a *App) AddTrackToPlaylist(playlistName string, trackPath string) error {
	playlistMu.Lock()
	defer playlistMu.Unlock()
	playlists, err := a.getPlaylistsInternal()
	if err != nil {
		return err
	}
	for i, p := range playlists {
		if p.Name == playlistName {
			for _, pt := range p.TrackPaths {
				if pt == trackPath {
					return nil
				}
			}
			playlists[i].TrackPaths = append(playlists[i].TrackPaths, trackPath)
			return a.savePlaylistsInternal(playlists)
		}
	}
	return fmt.Errorf("playlist not found")
}

func (a *App) RemoveTrackFromPlaylist(playlistName string, trackPath string) error {
	playlistMu.Lock()
	defer playlistMu.Unlock()
	playlists, err := a.getPlaylistsInternal()
	if err != nil {
		return err
	}
	for i, p := range playlists {
		if p.Name == playlistName {
			var updatedPaths []string
			for _, pt := range p.TrackPaths {
				if pt != trackPath {
					updatedPaths = append(updatedPaths, pt)
				}
			}
			playlists[i].TrackPaths = updatedPaths
			return a.savePlaylistsInternal(playlists)
		}
	}
	return fmt.Errorf("playlist not found")
}

type SoundCloudResult struct {
	Title    string  `json:"title"`
	Uploader string  `json:"uploader"`
	URL      string  `json:"url"`
	Duration float64 `json:"duration"`
}

func extractTagsOrFilename(path string) (string, string) {
	artist := ""
	genre := ""
	f, err := os.Open(path)
	if err == nil {
		defer f.Close()
		m, err := tag.ReadFrom(f)
		if err == nil {
			artist = m.Artist()
			genre = m.Genre()
		}
	}
	if artist == "" {
		filename := filepath.Base(path)
		filenameNoExt := strings.TrimSuffix(filename, filepath.Ext(path))
		parts := strings.SplitN(filenameNoExt, " - ", 2)
		if len(parts) == 2 {
			artist = strings.TrimSpace(parts[0])
		} else {
			artist = "Unknown Artist"
		}
	}
	if genre == "" {
		genre = "Unknown Genre"
	}
	return artist, genre
}

var execCommand = exec.Command

func (a *App) SearchSoundCloud(query string) ([]SoundCloudResult, error) {
	cmd := execCommand("yt-dlp", "--flat-playlist", "--dump-json", "scsearch10:"+query)
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	lines := strings.Split(string(output), "\n")
	var results []SoundCloudResult
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var item struct {
			Title    string  `json:"title"`
			Uploader string  `json:"uploader"`
			URL      string  `json:"url"`
			Webpage  string  `json:"webpage_url"`
			Duration float64 `json:"duration"`
		}
		if err := json.Unmarshal([]byte(line), &item); err == nil {
			targetURL := item.URL
			if targetURL == "" {
				targetURL = item.Webpage
			}
			results = append(results, SoundCloudResult{
				Title:    item.Title,
				Uploader: item.Uploader,
				URL:      targetURL,
				Duration: item.Duration,
			})
		}
	}
	return results, nil
}

func (a *App) DownloadFromSoundCloud(trackURL string) error {
	musicDir, err := a.GetMusicDir()
	if err != nil {
		return err
	}
	soundcloudDir := filepath.Join(musicDir, "soundcloud")
	if err := os.MkdirAll(soundcloudDir, 0755); err != nil {
		return err
	}
	outputPath := filepath.Join(soundcloudDir, "%(uploader)s - %(title)s.%(ext)s")
	cmd := execCommand("yt-dlp", "-x", "--audio-format", "mp3", "--embed-metadata", "-o", outputPath, trackURL)
	return cmd.Run()
}
