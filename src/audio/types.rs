use serde::{Deserialize, Serialize};

pub use synapse_audio_engine::TrackMetadataC;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    #[serde(rename = "isDefault", default)]
    pub is_default: bool,
}

#[derive(Debug, Clone, Default)]
pub struct TrackAnalysis {
    pub duration_sec: f64,
    pub bpm: f64,
    pub key_signature: String,
    pub waveform: Vec<f32>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DspParams {
    pub limiter_boost: f32,
    pub stereo_width: f32,
    pub reverb_mix: f32,
    pub bass_boost: f32,
    pub treble_exciter: f32,
}

impl Default for DspParams {
    fn default() -> Self {
        Self {
            limiter_boost: 0.0,
            stereo_width: 1.0,
            reverb_mix: 0.0,
            bass_boost: 0.0,
            treble_exciter: 0.0,
        }
    }
}
