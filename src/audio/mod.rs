pub mod ffi;
pub mod types;

pub use types::{AudioDevice, DspParams, TrackAnalysis};

use std::ffi::{CStr, CString};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use parking_lot::Mutex;

static ENGINE_INITIALIZED: AtomicBool = AtomicBool::new(false);

#[derive(Clone)]
pub struct AudioManager {
    inner: Arc<Mutex<AudioEngineInner>>,
}

struct AudioEngineInner {
    sample_rate: u32,
    channels: u32,
}

impl Drop for AudioEngineInner {
    fn drop(&mut self) {
        if ENGINE_INITIALIZED.swap(false, Ordering::SeqCst) {
            unsafe {
                ffi::cleanup_audio_engine();
            }
        }
    }
}

impl AudioManager {
    pub fn new(sample_rate: u32, channels: u32) -> Result<Self, String> {
        let ok = unsafe { ffi::init_audio_engine(sample_rate as i32, channels as i32) != 0 };
        if !ok {
            return Err("Failed to initialize C++ audio engine".to_string());
        }
        ENGINE_INITIALIZED.store(true, Ordering::SeqCst);

        Ok(Self {
            inner: Arc::new(Mutex::new(AudioEngineInner {
                sample_rate,
                channels,
            })),
        })
    }

    pub fn sample_rate(&self) -> u32 {
        self.inner.lock().sample_rate
    }

    pub fn channels(&self) -> u32 {
        self.inner.lock().channels
    }

    pub fn load_track(&self, slot: usize, file_path: &str) -> bool {
        let Ok(c_path) = CString::new(file_path) else {
            return false;
        };
        unsafe { ffi::load_track(slot as i32, c_path.as_ptr()) != 0 }
    }

    pub fn play(&self, slot: usize) {
        unsafe {
            ffi::play_track(slot as i32);
        }
    }

    pub fn pause(&self, slot: usize) {
        unsafe {
            ffi::pause_track(slot as i32);
        }
    }

    pub fn seek(&self, slot: usize, position_sec: f64) {
        unsafe {
            ffi::seek_track(slot as i32, position_sec);
        }
    }

    pub fn set_volume(&self, slot: usize, volume: f32) {
        unsafe {
            ffi::set_track_volume(slot as i32, volume.clamp(0.0, 1.0));
        }
    }

    pub fn set_eq(&self, slot: usize, bass: f32, mid: f32, treble: f32) {
        unsafe {
            ffi::set_track_eq(slot as i32, bass, mid, treble);
        }
    }

    pub fn set_eq10(&self, slot: usize, bands: &[f32; 10]) {
        unsafe {
            ffi::set_track_eq10(slot as i32, bands.as_ptr());
        }
    }

    pub fn set_dsp(&self, slot: usize, dsp: &DspParams) {
        unsafe {
            ffi::set_track_dsp(
                slot as i32,
                dsp.limiter_boost,
                dsp.stereo_width,
                dsp.reverb_mix,
                dsp.bass_boost,
                dsp.treble_exciter,
            );
        }
    }

    pub fn set_tempo(&self, slot: usize, tempo_ratio: f64) {
        unsafe {
            ffi::set_track_tempo(slot as i32, tempo_ratio);
        }
    }

    pub fn set_pitch(&self, slot: usize, pitch_semi: f64) {
        unsafe {
            ffi::set_track_pitch(slot as i32, pitch_semi);
        }
    }

    pub fn get_position(&self, slot: usize) -> f64 {
        unsafe { ffi::get_track_position(slot as i32) }
    }

    pub fn is_playing(&self, slot: usize) -> bool {
        unsafe { ffi::is_track_playing(slot as i32) != 0 }
    }

    pub fn set_automix_enabled(&self, enabled: bool) {
        unsafe {
            ffi::set_automix_enabled(if enabled { 1 } else { 0 });
        }
    }

    pub fn set_crossfade_duration(&self, duration_sec: f64) {
        unsafe {
            ffi::set_crossfade_duration(duration_sec.max(0.5));
        }
    }

    pub fn get_spectrum(&self, slot: usize, out_buffer: &mut [f32]) -> usize {
        if out_buffer.is_empty() {
            return 0;
        }
        let count = unsafe {
            ffi::get_track_spectrum(
                slot as i32,
                out_buffer.as_mut_ptr(),
                out_buffer.len() as i32,
            )
        };
        count.max(0) as usize
    }

    pub fn analyze_file(&self, file_path: &str) -> Option<TrackAnalysis> {
        let c_path = CString::new(file_path).ok()?;
        let meta_c = unsafe { ffi::analyze_file(c_path.as_ptr()) };

        if meta_c.duration_sec <= 0.0 {
            unsafe { ffi::free_track_metadata(meta_c) };
            return None;
        }

        let key_signature = if !meta_c.key_signature.is_null() {
            unsafe { CStr::from_ptr(meta_c.key_signature) }
                .to_string_lossy()
                .into_owned()
        } else {
            String::new()
        };

        let waveform = if meta_c.waveform_size > 0 && !meta_c.waveform_data.is_null() {
            let slice = unsafe {
                std::slice::from_raw_parts(meta_c.waveform_data, meta_c.waveform_size as usize)
            };
            slice.to_vec()
        } else {
            Vec::new()
        };

        let result = TrackAnalysis {
            duration_sec: meta_c.duration_sec,
            bpm: meta_c.bpm.round(),
            key_signature,
            waveform,
        };

        unsafe { ffi::free_track_metadata(meta_c) };
        Some(result)
    }

    pub fn set_track_metadata(&self, slot: usize, meta: &TrackAnalysis) {
        let c_key = CString::new(meta.key_signature.as_str()).unwrap_or_default();
        let wf_ptr = if meta.waveform.is_empty() {
            std::ptr::null()
        } else {
            meta.waveform.as_ptr()
        };

        unsafe {
            ffi::set_track_metadata(
                slot as i32,
                meta.duration_sec,
                meta.bpm,
                c_key.as_ptr(),
                wf_ptr,
                meta.waveform.len() as i32,
            );
        }
    }

    pub fn get_audio_devices(&self) -> Vec<AudioDevice> {
        let json_ptr = unsafe { ffi::get_audio_devices_json() };
        if json_ptr.is_null() {
            return Vec::new();
        }
        let json_str = unsafe { CStr::from_ptr(json_ptr) }.to_string_lossy();
        serde_json::from_str(&json_str).unwrap_or_default()
    }

    pub fn set_audio_device(&self, device_id: &str) -> bool {
        let Ok(c_id) = CString::new(device_id) else {
            return false;
        };
        unsafe { ffi::set_audio_device(c_id.as_ptr()) != 0 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_manager_lifecycle() {
        let manager = AudioManager::new(44100, 2);
        assert!(manager.is_ok(), "Audio manager should initialize");
        let mgr = manager.unwrap();

        // Spectrum check with stack buffer when idle
        let mut spectrum = [1.0f32; 64];
        let count = mgr.get_spectrum(0, &mut spectrum);
        assert_eq!(count, 0, "Idle slot should return 0 spectrum bins");
        assert_eq!(spectrum[0], 0.0, "Idle slot should zero out buffer");

        // Position and playing status on empty slot
        assert_eq!(mgr.get_position(0), 0.0);
        assert!(!mgr.is_playing(0));

        // Volume and EQ updates
        mgr.set_volume(0, 0.75);
        mgr.set_eq(0, 1.0, 0.0, -1.0);
        mgr.set_eq10(0, &[0.0; 10]);
        mgr.set_dsp(0, &DspParams::default());
        mgr.set_automix_enabled(true);
        mgr.set_crossfade_duration(5.0);
    }
}
