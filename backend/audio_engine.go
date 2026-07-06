package backend

/*
#cgo CXXFLAGS: -std=c++11
#cgo windows LDFLAGS: -lole32 -lwinmm -lm
#cgo darwin LDFLAGS: -framework CoreAudio -framework CoreFoundation -lm
#cgo linux LDFLAGS: -lasound -lpthread -lm -ldl
#include "audio_engine.h"
#include <stdlib.h>
*/
import "C"
import (
	"unsafe"
)

type TrackMetadata struct {
	FilePath     string    `json:"filePath"`
	DurationSec  float64   `json:"durationSec"`
	BPM          float64   `json:"bpm"`
	KeySignature string    `json:"keySignature"`
	Waveform     []float32 `json:"waveform"`
	Artist       string    `json:"artist"`
	Genre        string    `json:"genre"`
	Mood         string    `json:"mood"`
}

func InitAudioEngine(sampleRate int, channels int) bool {
	Log(LogInfo, "engine", "init_audio_engine sampleRate=%d channels=%d", sampleRate, channels)
	res := C.init_audio_engine(C.int(sampleRate), C.int(channels))
	ok := res != 0
	if ok {
		Log(LogInfo, "engine", "init_audio_engine OK")
	} else {
		Log(LogError, "engine", "init_audio_engine FAILED")
	}
	return ok
}

func CleanupAudioEngine() {
	Log(LogInfo, "engine", "cleanup_audio_engine")
	C.cleanup_audio_engine()
}

func LoadTrack(slot int, filePath string) bool {
	Log(LogInfo, "engine", "load_track slot=%d path=%q", slot, filePath)
	cPath := C.CString(filePath)
	defer C.free(unsafe.Pointer(cPath))
	res := C.load_track(C.int(slot), cPath)
	ok := res != 0
	if ok {
		Log(LogInfo, "engine", "load_track OK slot=%d", slot)
	} else {
		Log(LogError, "engine", "load_track FAILED slot=%d path=%q", slot, filePath)
	}
	return ok
}

func extractWaveform(metaC C.TrackMetadataC) []float32 {
	var waveform []float32
	if metaC.waveformSize > 0 && metaC.waveformData != nil {
		waveformSlice := (*[1 << 28]float32)(unsafe.Pointer(metaC.waveformData))[:metaC.waveformSize:metaC.waveformSize]
		waveform = make([]float32, metaC.waveformSize)
		copy(waveform, waveformSlice)
	}
	return waveform
}

func GetTrackMetadata(slot int, filePath string) TrackMetadata {
	Log(LogDebug, "engine", "get_track_metadata slot=%d", slot)
	metaC := C.get_track_metadata(C.int(slot))
	defer C.free_track_metadata(metaC)

	waveform := extractWaveform(metaC)

	key := ""
	if metaC.keySignature != nil {
		key = C.GoString(metaC.keySignature)
	}

	return TrackMetadata{
		FilePath:     filePath,
		DurationSec:  float64(metaC.durationSec),
		BPM:          float64(metaC.bpm),
		KeySignature: key,
		Waveform:     waveform,
	}
}

func SetTrackMetadata(slot int, meta TrackMetadata) {
	cKey := C.CString(meta.KeySignature)
	defer C.free(unsafe.Pointer(cKey))
	var cWaveform *C.float
	if len(meta.Waveform) > 0 {
		cWaveform = (*C.float)(&meta.Waveform[0])
	}
	C.set_track_metadata(C.int(slot), C.double(meta.DurationSec), C.double(meta.BPM), cKey, cWaveform, C.int(len(meta.Waveform)))
}

func PlayTrack(slot int) {
	Log(LogInfo, "engine", "play_track slot=%d", slot)
	C.play_track(C.int(slot))
}

func PauseTrack(slot int) {
	Log(LogInfo, "engine", "pause_track slot=%d", slot)
	C.pause_track(C.int(slot))
}

func SeekTrack(slot int, positionSec float64) {
	Log(LogInfo, "engine", "seek_track slot=%d pos=%.3fs", slot, positionSec)
	C.seek_track(C.int(slot), C.double(positionSec))
}

func SetTrackVolume(slot int, volume float32) {
	Log(LogDebug, "engine", "set_track_volume slot=%d vol=%.2f", slot, volume)
	C.set_track_volume(C.int(slot), C.float(volume))
}

func SetTrackTempo(slot int, tempoRatio float64) {
	Log(LogInfo, "engine", "set_track_tempo slot=%d ratio=%.3f", slot, tempoRatio)
	C.set_track_tempo(C.int(slot), C.double(tempoRatio))
}

func SetTrackPitch(slot int, pitchSemi float64) {
	Log(LogInfo, "engine", "set_track_pitch slot=%d semi=%.1f", slot, pitchSemi)
	C.set_track_pitch(C.int(slot), C.double(pitchSemi))
}

func GetTrackPosition(slot int) float64 {
	pos := float64(C.get_track_position(C.int(slot)))
	Log(LogDebug, "engine", "get_track_position slot=%d -> %.3fs", slot, pos)
	return pos
}

func IsTrackPlaying(slot int) bool {
	playing := C.is_track_playing(C.int(slot)) != 0
	Log(LogDebug, "engine", "is_track_playing slot=%d -> %v", slot, playing)
	return playing
}

func SetAutomixEnabled(enabled bool) {
	val := 0
	if enabled {
		val = 1
	}
	Log(LogInfo, "engine", "set_automix_enabled=%v", enabled)
	C.set_automix_enabled(C.int(val))
}

func SetCrossfadeDuration(durationSec float64) {
	Log(LogInfo, "engine", "set_crossfade_duration=%.1fs", durationSec)
	C.set_crossfade_duration(C.double(durationSec))
}

func AnalyzeFile(filePath string) TrackMetadata {
	Log(LogInfo, "engine", "analyze_file path=%q", filePath)
	cPath := C.CString(filePath)
	defer C.free(unsafe.Pointer(cPath))
	metaC := C.analyze_file(cPath)
	defer C.free_track_metadata(metaC)

	waveform := extractWaveform(metaC)

	key := ""
	if metaC.keySignature != nil {
		key = C.GoString(metaC.keySignature)
	}

	result := TrackMetadata{
		FilePath:     filePath,
		DurationSec:  float64(metaC.durationSec),
		BPM:          float64(metaC.bpm),
		KeySignature: key,
		Waveform:     waveform,
	}
	Log(LogInfo, "engine", "analyze_file done %s duration=%.3fs bpm=%.1f key=%s",
		filePath, result.DurationSec, result.BPM, result.KeySignature)
	return result
}

func GetTrackSpectrum(slot int, maxSize int) []float32 {
	out := make([]float32, maxSize)
	count := int(C.get_track_spectrum(C.int(slot), (*C.float)(unsafe.Pointer(&out[0])), C.int(maxSize)))
	if count == 0 {
		return out
	}
	return out
}

func GetAudioDevices() string {
	cStr := C.get_audio_devices_json()
	defer C.free(unsafe.Pointer(cStr))
	return C.GoString(cStr)
}

func SetAudioDevice(deviceId string) bool {
	cStr := C.CString(deviceId)
	defer C.free(unsafe.Pointer(cStr))
	return C.set_audio_device(cStr) != 0
}
