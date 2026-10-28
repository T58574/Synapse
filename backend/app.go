package backend

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
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
	ctx                context.Context
	cancel             context.CancelFunc
	currentPaths       [2]string
	currentPathsMu     sync.Mutex
	SyncScan           bool
	visualizerActive   bool
	visualizerActiveMu sync.Mutex
}

func NewApp() *App {
	app := &App{
		visualizerActive: true,
	}
	if flag.Lookup("test.v") != nil {
		app.SyncScan = true
	}
	return app
}

func (a *App) Startup(ctx context.Context) {
	InitLogger()
	Log(LogInfo, "app", "=== Synapse startup ===")
	if ctx != nil {
		childCtx, cancel := context.WithCancel(ctx)
		a.ctx = childCtx
		a.cancel = cancel
	} else {
		a.ctx = nil
		a.cancel = nil
	}
	Log(LogInfo, "app", "init audio engine: sampleRate=44100 channels=2")
	InitAudioEngine(44100, 2)
	a.GetMusicDir()
	if a.ctx != nil {
		go a.broadcastSpectrum()
	}
}

func (a *App) SetVisualizerActive(active bool) {
	a.visualizerActiveMu.Lock()
	a.visualizerActive = active
	a.visualizerActiveMu.Unlock()
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
			a.visualizerActiveMu.Lock()
			visActive := a.visualizerActive
			a.visualizerActiveMu.Unlock()

			if !visActive {
				if wasPlaying {
					zeroSpec := make([]float32, 64)
					wailsRuntime.EventsEmit(a.ctx, "spectrum", map[string][]float32{
						"deck0": zeroSpec,
						"deck1": zeroSpec,
					})
					wasPlaying = false
				}
				continue
			}

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
	Log(LogInfo, "app", "=== Synapse shutdown ===")
	if a.cancel != nil {
		a.cancel()
		a.cancel = nil
	}
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
	title, artist, genre := extractTagsOrFilename(filePath)
	meta.Title = title
	meta.Artist = artist
	meta.Genre = genre
	meta.Mood = DetermineMood(meta.BPM, meta.KeySignature, genre)

	go func(s int, path string, initialMeta TrackMetadata) {
		analyzed := AnalyzeFile(path)
		analyzed.Title = initialMeta.Title
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
