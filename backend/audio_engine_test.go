package backend

import (
	"context"
	"encoding/binary"
	"fmt"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"math"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func createTestWav(path string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	sampleRate := 44100
	duration := 1.0
	numSamples := int(float64(sampleRate) * duration)
	numChannels := 2

	writeString(f, "RIFF")
	writeInt32(f, int32(36+numSamples*numChannels*2))
	writeString(f, "WAVE")
	writeString(f, "fmt ")
	writeInt32(f, 16)
	writeInt16(f, 1)
	writeInt16(f, int16(numChannels))
	writeInt32(f, int32(sampleRate))
	writeInt32(f, int32(sampleRate*numChannels*2))
	writeInt16(f, int16(numChannels*2))
	writeInt16(f, 16)
	writeString(f, "data")
	writeInt32(f, int32(numSamples*numChannels*2))

	for i := 0; i < numSamples; i++ {
		t := float64(i) / float64(sampleRate)
		val := int16(math.Sin(2.0*math.Pi*440.0*t) * 32767.0)
		for c := 0; c < numChannels; c++ {
			binary.Write(f, binary.LittleEndian, val)
		}
	}
	return nil
}

func writeString(f *os.File, s string) {
	f.Write([]byte(s))
}

func writeInt32(f *os.File, v int32) {
	binary.Write(f, binary.LittleEndian, v)
}

func writeInt16(f *os.File, v int16) {
	binary.Write(f, binary.LittleEndian, v)
}

func TestAudioEngine(t *testing.T) {
	tmpDir := t.TempDir()
	wavPath := filepath.Join(tmpDir, "test.wav")
	err := createTestWav(wavPath)
	if err != nil {
		t.Fatalf("failed to create test wav: %v", err)
	}

	ok := InitAudioEngine(44100, 2)
	if !ok {
		t.Fatalf("failed to initialize audio engine")
	}
	defer CleanupAudioEngine()

	app := NewApp()
	app.Startup(nil)
	defer app.Shutdown(nil)

	meta, err := app.LoadTrack(0, wavPath)
	if err != nil {
		t.Fatalf("failed to load track: %v", err)
	}

	if meta.DurationSec <= 0.0 {
		t.Errorf("expected positive duration, got %f", meta.DurationSec)
	}

	for i := 0; i < 40; i++ {
		meta = GetTrackMetadata(0, wavPath)
		if len(meta.Waveform) > 0 {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	if meta.BPM <= 0.0 {
		t.Errorf("expected positive BPM, got %f", meta.BPM)
	}

	if meta.KeySignature == "" {
		t.Errorf("expected non-empty key signature")
	}

	if len(meta.Waveform) == 0 {
		t.Errorf("expected non-empty waveform")
	}

	app.Play(0)
	if !app.IsPlaying(0) {
		t.Errorf("expected track to be playing")
	}

	app.SetVolume(0, 0.5)
	app.SetEQ(0, -2.0, 1.5, 3.0)
	app.SetTempo(0, 1.1)
	app.SetPitch(0, 1.0)
	app.Seek(0, 0.2)

	pos := app.GetPosition(0)
	if pos < 0.0 {
		t.Errorf("expected non-negative position, got %f", pos)
	}

	app.ToggleAutoMix(true)
	app.ToggleAutoMix(false)
	app.SetCrossfadeDuration(5.0)

	app.Pause(0)
	if app.IsPlaying(0) {
		t.Errorf("expected track to be paused")
	}

	dir, err := app.GetMusicDir()
	if err != nil {
		t.Errorf("failed to get music dir: %v", err)
	}
	if dir == "" {
		t.Errorf("expected non-empty music dir")
	}

	testWavInDir := filepath.Join(dir, "temp_test_suite.wav")
	err = createTestWav(testWavInDir)
	if err != nil {
		t.Errorf("failed to create wav in dir: %v", err)
	}
	defer os.Remove(testWavInDir)

	list, err := app.ScanMusicDir()
	if err != nil {
		t.Errorf("failed to scan music dir: %v", err)
	}
	if len(list) == 0 {
		t.Errorf("expected scanned tracks")
	}

	app.OpenMusicDir()
}

func TestAppMocks(t *testing.T) {
	app := NewApp()
	app.Startup(nil)
	defer app.Shutdown(nil)

	origOpenFileDialog := openFileDialog
	defer func() { openFileDialog = origOpenFileDialog }()
	openFileDialog = func(ctx context.Context, dialogOptions wailsRuntime.OpenDialogOptions) (string, error) {
		return "mock_file.wav", nil
	}

	file, err := app.SelectAudioFile()
	if err != nil || file != "mock_file.wav" {
		t.Errorf("expected mock_file.wav, got %v (error: %v)", file, err)
	}

	origGoos := osRuntimeGOOS
	origStartCmd := startCmd
	defer func() {
		osRuntimeGOOS = origGoos
		startCmd = origStartCmd
	}()

	startCmdCalled := false
	startCmd = func(name string, args ...string) error {
		startCmdCalled = true
		return nil
	}

	osRuntimeGOOS = "windows"
	app.OpenMusicDir()
	if !startCmdCalled {
		t.Errorf("expected startCmd to be called on windows")
	}

	startCmdCalled = false
	osRuntimeGOOS = "darwin"
	app.OpenMusicDir()
	if !startCmdCalled {
		t.Errorf("expected startCmd to be called on darwin")
	}

	startCmdCalled = false
	osRuntimeGOOS = "linux"
	app.OpenMusicDir()
	if !startCmdCalled {
		t.Errorf("expected startCmd to be called on linux")
	}

	_, err = app.LoadTrack(0, "non_existent_file.wav")
	if err == nil {
		t.Errorf("expected error loading non-existent file")
	}

	tmpDir := t.TempDir()

	origHomeDir := osUserHomeDir
	osUserHomeDir = func() (string, error) {
		return "", fmt.Errorf("mock home error")
	}
	_, err = app.GetMusicDir()
	if err == nil {
		t.Errorf("expected error from GetMusicDir when home dir fails")
	}
	osUserHomeDir = origHomeDir

	origMkdirAll := osMkdirAll
	osMkdirAll = func(path string, perm os.FileMode) error {
		return fmt.Errorf("mock mkdir error")
	}
	osUserHomeDir = func() (string, error) {
		return filepath.Join(tmpDir, "non_existent_subdir"), nil
	}
	_, err = app.GetMusicDir()
	if err == nil {
		t.Errorf("expected error from GetMusicDir when mkdir fails")
	}
	osUserHomeDir = origHomeDir
	osMkdirAll = origMkdirAll

	origWalk := filepathWalk
	filepathWalk = func(root string, fn filepath.WalkFunc) error {
		return fmt.Errorf("mock walk error")
	}
	_, err = app.ScanMusicDir()
	if err == nil {
		t.Errorf("expected error from ScanMusicDir when walk fails")
	}
	filepathWalk = origWalk

	filepathWalk = func(root string, fn filepath.WalkFunc) error {
		return fn("mock_path", nil, fmt.Errorf("mock visit error"))
	}
	_, err = app.ScanMusicDir()
	if err == nil {
		t.Errorf("expected error from ScanMusicDir when walk callback fails")
	}
	filepathWalk = origWalk
}

func TestLogFromJS(t *testing.T) {
	// Reset global logger state for tests to capture output
	appLoggerOnce = &sync.Once{}
	appLogger = nil
	appLogFile = nil
	appLoggerOn = true

	tempHome, err := os.MkdirTemp("", "logfromjs_test_home_*")
	if err != nil {
		t.Fatalf("Failed to create temp home: %v", err)
	}
	defer os.RemoveAll(tempHome)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)

	os.Setenv("HOME", tempHome)

	InitLogger()

	logDir := filepath.Join(tempHome, ".0xplayer")
	logFile := filepath.Join(logDir, "player.log")

	app := NewApp()
	ctx := context.Background()

	// We call Startup but wait, Startup also calls InitLogger and Log.
	// We already called InitLogger, which is safe.
	app.Startup(ctx)
	defer app.Shutdown(ctx)

	// Clear the log file so we only see our LogFromJS calls
	os.WriteFile(logFile, []byte(""), 0600)

	app.LogFromJS("DEBUG", "test debug message")
	app.LogFromJS("WARN", "test warn message")
	app.LogFromJS("ERROR", "test error message")
	app.LogFromJS("UNKNOWN", "test default info message")
}

func TestMalformedCache(t *testing.T) {
	tmpDir := t.TempDir()

	origHomeDir := osUserHomeDir
	osUserHomeDir = func() (string, error) {
		return tmpDir, nil
	}
	defer func() { osUserHomeDir = origHomeDir }()

	app := NewApp()
	app.Startup(nil)
	defer app.Shutdown(nil)

	dir, err := app.GetMusicDir()
	if err != nil {
		t.Fatalf("failed to get music dir: %v", err)
	}

	cachePath := filepath.Join(dir, "cache.json")
	err = os.WriteFile(cachePath, []byte("{malformed: json}"), 0644)
	if err != nil {
		t.Fatalf("failed to write malformed cache.json: %v", err)
	}

	testWavInDir := filepath.Join(dir, "test.wav")
	err = createTestWav(testWavInDir)
	if err != nil {
		t.Fatalf("failed to create wav in dir: %v", err)
	}

	list, err := app.ScanMusicDir()
	if err != nil {
		t.Errorf("expected no error when scan falls back, got: %v", err)
	}
	if len(list) != 1 {
		t.Errorf("expected 1 track scanned, got %d", len(list))
	}
}

func TestAnalyzeFile(t *testing.T) {
	tmpDir := t.TempDir()
	wavPath := filepath.Join(tmpDir, "test_analyze.wav")
	err := createTestWav(wavPath)
	if err != nil {
		t.Fatalf("failed to create test wav: %v", err)
	}

	ok := InitAudioEngine(44100, 2)
	if !ok {
		t.Fatalf("failed to initialize audio engine")
	}
	defer CleanupAudioEngine()

	meta := AnalyzeFile(wavPath)

	if meta.FilePath != wavPath {
		t.Errorf("expected FilePath to be %s, got %s", wavPath, meta.FilePath)
	}

	if meta.DurationSec <= 0.0 {
		t.Errorf("expected positive duration, got %f", meta.DurationSec)
	}

	if meta.BPM <= 0.0 {
		t.Errorf("expected positive BPM, got %f", meta.BPM)
	}

	if meta.KeySignature == "" {
		t.Errorf("expected non-empty key signature")
	}

	if len(meta.Waveform) == 0 {
		t.Errorf("expected non-empty waveform")
	}
}

func TestDetermineMood(t *testing.T) {
	tests := []struct {
		bpm    float64
		key    string
		genre  string
		expect string
	}{
		{80, "8A", "lofi", "chill"},
		{130, "8A", "metal", "energetic"},
		{90, "8A", "electronic", "dark"},
		{135, "8A", "pop", "dark"},
		{135, "8B", "pop", "energetic"},
		{110, "8A", "pop", "chill"},
		{110, "8B", "pop", "happy"},
		{90, "8A", "pop", "calm"},
		{90, "8B", "pop", "peaceful"},
	}

	for _, tc := range tests {
		res := DetermineMood(tc.bpm, tc.key, tc.genre)
		if res != tc.expect {
			t.Errorf("DetermineMood(%f, %s, %s) expected %s, got %s", tc.bpm, tc.key, tc.genre, tc.expect, res)
		}
	}
}
