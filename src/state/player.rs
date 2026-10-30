use crate::audio::{AudioManager, DspParams};
use std::collections::VecDeque;

#[derive(Debug, Clone, PartialEq)]
pub struct TrackItem {
    pub file_path: String,
    pub title: String,
    pub artist: String,
    pub genre: String,
    pub mood: String,
    pub bpm: f64,
    pub key_signature: String,
    pub duration_sec: f64,
    pub waveform: Vec<f32>,
}

pub struct PlayerState {
    pub audio: AudioManager,
    pub active_slot: usize,
    pub current_track: Option<TrackItem>,
    pub queue: VecDeque<TrackItem>,
    pub history: Vec<TrackItem>,
    pub is_playing: bool,
    pub volume: f32,
    pub automix: bool,
    pub crossfade_duration: f64,
    pub eq10: [f32; 10],
    pub dsp: DspParams,
}

impl PlayerState {
    pub fn new(audio: AudioManager) -> Self {
        Self {
            audio,
            active_slot: 0,
            current_track: None,
            queue: VecDeque::new(),
            history: Vec::new(),
            is_playing: false,
            volume: 0.8,
            automix: false,
            crossfade_duration: 4.0,
            eq10: [0.0; 10],
            dsp: DspParams::default(),
        }
    }

    pub fn play_track(&mut self, track: TrackItem) -> bool {
        let target_slot = if self.automix {
            1 - self.active_slot
        } else {
            0
        };

        if !self.audio.load_track(target_slot, &track.file_path) {
            return false;
        }

        self.audio.set_volume(target_slot, self.volume);
        self.audio.set_eq10(target_slot, &self.eq10);
        self.audio.set_dsp(target_slot, &self.dsp);
        self.audio.play(target_slot);

        if let Some(prev) = self.current_track.take() {
            self.history.push(prev);
        }

        self.active_slot = target_slot;
        self.current_track = Some(track);
        self.is_playing = true;
        true
    }

    pub fn toggle_play(&mut self) {
        if self.is_playing {
            self.audio.pause(self.active_slot);
            self.audio.pause(1 - self.active_slot);
            self.is_playing = false;
        } else if self.current_track.is_some() {
            self.audio.play(self.active_slot);
            self.is_playing = true;
        }
    }

    pub fn seek(&self, position_sec: f64) {
        self.audio.seek(self.active_slot, position_sec);
    }

    pub fn set_volume(&mut self, volume: f32) {
        self.volume = volume.clamp(0.0, 1.0);
        self.audio.set_volume(self.active_slot, self.volume);
    }

    pub fn set_eq10(&mut self, bands: [f32; 10]) {
        self.eq10 = bands;
        self.audio.set_eq10(self.active_slot, &self.eq10);
    }

    pub fn set_dsp(&mut self, dsp: DspParams) {
        self.dsp = dsp;
        self.audio.set_dsp(self.active_slot, &self.dsp);
    }

    pub fn set_automix(&mut self, enabled: bool) {
        self.automix = enabled;
        self.audio.set_automix_enabled(enabled);
    }

    pub fn set_crossfade(&mut self, duration_sec: f64) {
        self.crossfade_duration = duration_sec;
        self.audio.set_crossfade_duration(duration_sec);
    }

    pub fn queue_track(&mut self, track: TrackItem) {
        self.queue.push_back(track);
    }

    pub fn pop_next_track(&mut self) -> Option<TrackItem> {
        self.queue.pop_front()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_player_state_queue_and_controls() {
        let audio = AudioManager::new(44100, 2).expect("Audio init");
        let mut player = PlayerState::new(audio);

        let t1 = TrackItem {
            file_path: "/dummy/t1.mp3".to_string(),
            title: "Track 1".to_string(),
            artist: "Artist 1".to_string(),
            genre: "Synthwave".to_string(),
            mood: "energetic".to_string(),
            bpm: 128.0,
            key_signature: "8A".to_string(),
            duration_sec: 210.0,
            waveform: vec![0.1, 0.5, 0.9],
        };

        let t2 = TrackItem {
            file_path: "/dummy/t2.mp3".to_string(),
            title: "Track 2".to_string(),
            artist: "Artist 2".to_string(),
            genre: "Cyberpunk".to_string(),
            mood: "dark".to_string(),
            bpm: 140.0,
            key_signature: "11B".to_string(),
            duration_sec: 185.0,
            waveform: vec![0.2, 0.4, 0.8],
        };

        player.queue_track(t1.clone());
        player.queue_track(t2.clone());

        assert_eq!(player.queue.len(), 2);
        let popped = player.pop_next_track();
        assert_eq!(popped, Some(t1));
        assert_eq!(player.queue.len(), 1);

        player.set_volume(1.5);
        assert_eq!(player.volume, 1.0);

        player.set_volume(-0.5);
        assert_eq!(player.volume, 0.0);

        player.set_automix(true);
        assert!(player.automix);

        player.set_crossfade(6.5);
        assert_eq!(player.crossfade_duration, 6.5);
    }

    #[test]
    fn test_player_toggle_play_behavior() {
        let audio = AudioManager::new(44100, 2).expect("Audio init");
        let mut player = PlayerState::new(audio);
        assert!(!player.is_playing);

        // Cannot play without current track
        player.toggle_play();
        assert!(!player.is_playing);

        // When track is present, toggle switches state
        player.current_track = Some(TrackItem {
            file_path: "/dummy/test.mp3".to_string(),
            title: "Test".to_string(),
            artist: "Test Artist".to_string(),
            genre: "Synth".to_string(),
            mood: "chill".to_string(),
            bpm: 120.0,
            key_signature: "8A".to_string(),
            duration_sec: 100.0,
            waveform: vec![],
        });
        player.toggle_play();
        assert!(player.is_playing);

        // Toggle again pauses
        player.toggle_play();
        assert!(!player.is_playing);
    }
}
