use super::types::TrackMetadataC;
use libc::{c_char, c_double, c_float, c_int};

extern "C" {
    pub fn init_audio_engine(sample_rate: c_int, channels: c_int) -> c_int;
    pub fn cleanup_audio_engine();
    pub fn load_track(slot: c_int, file_path: *const c_char) -> c_int;
    pub fn get_track_metadata(slot: c_int) -> TrackMetadataC;
    pub fn play_track(slot: c_int);
    pub fn pause_track(slot: c_int);
    pub fn seek_track(slot: c_int, position_sec: c_double);
    pub fn set_track_volume(slot: c_int, volume: c_float);
    pub fn set_track_eq(slot: c_int, bass: c_float, mid: c_float, treble: c_float);
    pub fn set_track_eq10(slot: c_int, bands: *const c_float);
    pub fn set_track_dsp(
        slot: c_int,
        limiter_boost: c_float,
        stereo_width: c_float,
        reverb_mix: c_float,
        bass_boost: c_float,
        treble_exciter: c_float,
    );
    pub fn set_track_tempo(slot: c_int, tempo_ratio: c_double);
    pub fn set_track_pitch(slot: c_int, pitch_semi: c_double);
    pub fn get_track_position(slot: c_int) -> c_double;
    pub fn is_track_playing(slot: c_int) -> c_int;
    pub fn get_mixer_state() -> c_int;
    pub fn set_automix_enabled(enabled: c_int);
    pub fn set_crossfade_duration(duration_sec: c_double);
    pub fn free_track_metadata(metadata: TrackMetadataC);
    pub fn set_track_metadata(
        slot: c_int,
        duration: c_double,
        bpm: c_double,
        key: *const c_char,
        waveform: *const c_float,
        waveform_size: c_int,
    );
    pub fn analyze_file(file_path: *const c_char) -> TrackMetadataC;
    pub fn get_track_spectrum(slot: c_int, out_buffer: *mut c_float, max_size: c_int) -> c_int;
    pub fn get_audio_devices_json() -> *const c_char;
    pub fn set_audio_device(device_id_hex: *const c_char) -> c_int;
}
