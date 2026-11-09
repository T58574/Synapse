//! Single source of truth for the UI: library data, playback mirror,
//! DSP/settings state and every command the views can issue.

use crate::audio::{AudioDevice, AudioManager, DspParams};
use crate::library::{
    extract_metadata, AudioMetadata, LibraryManager, PlaylistRecord, TrackRecord,
};
use crate::state::{PlayerState, TrackItem};

use super::artists::{self, ArtistCard};
use super::format;
use super::shuffle::ShuffleDeck;
use crate::diagnostics;

use gpui_kit::component::input::{InputEvent, InputState};
use gpui_kit::*;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const TICK_PLAYING: Duration = Duration::from_millis(33);
const TICK_IDLE: Duration = Duration::from_millis(250);
pub const SPECTRUM_BANDS: usize = 64;

pub use super::model::{Playback, UiMsg, View};

pub struct AppState {
    pub rt: tokio::runtime::Runtime,
    pub audio: AudioManager,
    pub library: LibraryManager,
    pub player: PlayerState,

    pub tracks: Vec<TrackRecord>,
    pub filtered: Vec<usize>,
    pub playlists: Vec<PlaylistRecord>,
    pub artists: Vec<ArtistCard>,
    pub selected_playlist: Option<String>,
    pub search: String,
    pub search_input: Entity<InputState>,

    pub view: View,
    pub show_equalizer: bool,
    pub show_queue: bool,
    pub playback: Playback,
    pub playing_path: Option<String>,
    /// Cached toolbar text, rebuilt by `refresh_filter`.
    pub summary: String,
    /// Last operation result, shown under the library toolbar.
    pub status: String,

    pub volume: f32,
    pub shuffle: bool,
    pub shuffle_deck: ShuffleDeck,
    pub repeat: bool,
    pub automix: bool,
    pub crossfade: f64,
    pub visualizer: bool,

    pub devices: Vec<AudioDevice>,
    pub device_id: String,
    pub music_dir: String,

    pub eq: [f32; 10],
    pub dsp: DspParams,

    pub spectrum: [f32; SPECTRUM_BANDS],
    pub peaks: [f32; SPECTRUM_BANDS],
    peak_holds: [u8; SPECTRUM_BANDS],
    peak_velocity: [f32; SPECTRUM_BANDS],

    pending: Arc<Mutex<Vec<UiMsg>>>,
}

impl AppState {
    pub fn bootstrap(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .thread_stack_size(1024 * 1024)
            .enable_all()
            .build()
            .expect("tokio runtime");

        let audio = AudioManager::new(44100, 2).expect("audio engine");
        let db = crate::library::LibraryDb::open_default().expect("library db");
        let library = LibraryManager::new(db, Some(audio.clone()));
        let player = PlayerState::new(audio.clone());

        let search_input =
            cx.new(|cx| InputState::new(window, cx).placeholder("Search title, artist or key"));
        cx.subscribe(
            &search_input,
            |this: &mut Self, _, event: &InputEvent, cx| {
                if matches!(event, InputEvent::Change) {
                    let text = this.search_input.read(cx).value().to_string();
                    this.set_search(text);
                    cx.notify();
                }
            },
        )
        .detach();

        let mut tracks = library.get_all_tracks().unwrap_or_default();
        for track in &mut tracks {
            track.waveform.clear();
            track.waveform.shrink_to_fit();
        }
        tracks.shrink_to_fit();
        library.shrink_memory();

        let playlists = library.get_playlists().unwrap_or_default();
        let artists = artists::build_artist_cards(&tracks);
        let filtered = (0..tracks.len()).collect();
        let devices = audio.get_audio_devices();

        let setting = |key: &str| library.get_setting(key).ok().flatten();
        let volume = setting("volume")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0.8);
        let crossfade = setting("crossfade")
            .and_then(|v| v.parse().ok())
            .unwrap_or(4.0);
        let automix = setting("automix").map(|v| v == "true").unwrap_or(false);
        let visualizer = setting("visualizer").map(|v| v == "true").unwrap_or(true);
        let device_id = setting("device").unwrap_or_else(|| {
            devices
                .iter()
                .find(|d| d.is_default)
                .map(|d| d.id.clone())
                .unwrap_or_default()
        });
        let music_dir = setting("music_dir").unwrap_or_else(default_music_dir);

        let mut state = Self {
            rt,
            audio,
            library,
            player,
            tracks,
            filtered,
            playlists,
            artists,
            selected_playlist: None,
            search: String::new(),
            search_input,
            view: View::Library,
            show_equalizer: false,
            show_queue: false,
            playback: Playback::default(),
            playing_path: None,
            summary: String::new(),
            status: String::new(),
            volume,
            shuffle: false,
            shuffle_deck: ShuffleDeck::new(),
            repeat: false,
            automix,
            crossfade,
            visualizer,
            devices,
            device_id,
            music_dir,
            eq: [0.0; 10],
            dsp: DspParams::default(),
            spectrum: [0.0; SPECTRUM_BANDS],
            peaks: [0.0; SPECTRUM_BANDS],
            peak_holds: [0; SPECTRUM_BANDS],
            peak_velocity: [0.0; SPECTRUM_BANDS],
            pending: Arc::new(Mutex::new(Vec::new())),
        };

        state.player.set_volume(state.volume);
        state.player.set_crossfade(state.crossfade);
        state.player.set_automix(state.automix);
        state.apply_eq();
        state.apply_dsp();
        state.refresh_filter();

        state.scan_default();
        state.spawn_ticker(cx);
        state
    }

    // ---------------------------------------------------------------- ticker

    fn spawn_ticker(&self, cx: &mut Context<Self>) {
        cx.spawn(async move |this, cx| loop {
            let playing = this
                .read_with(cx, |state: &Self, _| state.player.is_playing)
                .unwrap_or(false);
            cx.background_executor()
                .timer(if playing { TICK_PLAYING } else { TICK_IDLE })
                .await;
            let ok = this.update(cx, |state, cx| {
                if state.tick() {
                    cx.notify();
                }
            });
            if ok.is_err() {
                break;
            }
        })
        .detach();
    }

    fn tick(&mut self) -> bool {
        let mut changed = self.drain_messages();

        if self.player.is_playing {
            let slot = self.player.active_slot;
            let position = self.audio.get_position(slot);
            if (position - self.playback.position).abs() > 0.02 {
                self.playback.position = position;
                changed = true;
            }

            if self.visualizer {
                changed |= self.update_spectrum(slot);
            }

            let engine_playing = self.audio.is_playing(slot);
            let duration = self.playback.duration;
            let threshold = if self.automix {
                self.crossfade.min(duration * 0.4).max(0.5)
            } else {
                0.25
            };
            let at_end = (duration > 0.0 && position >= duration - threshold)
                || (position > 0.5 && !engine_playing);
            if at_end {
                if self.repeat {
                    self.audio.seek(slot, 0.0);
                    self.audio.play(slot);
                } else {
                    self.play_next();
                }
                changed = true;
            }
        }

        changed
    }

    fn update_spectrum(&mut self, slot: usize) -> bool {
        let mut raw = [0.0f32; SPECTRUM_BANDS];
        self.audio.get_spectrum(slot, &mut raw);

        for (i, raw_value) in raw.iter().enumerate() {
            let value = raw_value.clamp(0.0, 1.0);
            if value >= self.spectrum[i] {
                self.spectrum[i] = value * 0.85 + self.spectrum[i] * 0.15;
            } else {
                self.spectrum[i] *= 0.82;
            }

            let bar = self.spectrum[i];
            if bar >= self.peaks[i] {
                self.peaks[i] = bar;
                self.peak_holds[i] = 5;
                self.peak_velocity[i] = 0.0;
            } else if self.peak_holds[i] > 0 {
                self.peak_holds[i] -= 1;
            } else {
                self.peak_velocity[i] += 0.007;
                self.peaks[i] = (self.peaks[i] - self.peak_velocity[i]).max(bar);
            }
        }
        true
    }

    fn drain_messages(&mut self) -> bool {
        let messages = {
            let mut queue = self.pending.lock().unwrap();
            std::mem::take(&mut *queue)
        };
        if messages.is_empty() {
            return false;
        }

        let mut changed = false;
        for message in messages {
            match message {
                UiMsg::LibraryChanged => {
                    self.reload_library();
                    self.status = format!("{} tracks indexed", self.tracks.len());
                    diagnostics::line(&format!("scan finished: {} tracks", self.tracks.len()));
                    changed = true;
                }
                UiMsg::ScanFailed(error) => {
                    self.status = format!("Scan failed: {error}");
                    diagnostics::line(&format!("scan failed: {error}"));
                    changed = true;
                }
                UiMsg::Cover { path, image } => {
                    if self.playing_path.as_deref() == Some(path.as_str()) {
                        self.playback.cover = image;
                        changed = true;
                    }
                }
                UiMsg::FolderPicked(Some(dir)) => {
                    self.set_music_dir(dir);
                    changed = true;
                }
                UiMsg::FolderPicked(None) => {}
            }
        }
        changed
    }

    // --------------------------------------------------------------- library

    fn reload_library(&mut self) {
        let mut tracks = self.library.get_all_tracks().unwrap_or_default();
        for track in &mut tracks {
            track.waveform.clear();
            track.waveform.shrink_to_fit();
        }
        tracks.shrink_to_fit();
        self.library.shrink_memory();
        self.tracks = tracks;
        self.playlists = self.library.get_playlists().unwrap_or_default();
        self.artists = artists::build_artist_cards(&self.tracks);
        self.refresh_filter();
    }

    pub fn refresh_playlists(&mut self) {
        self.playlists = self.library.get_playlists().unwrap_or_default();
    }

    pub fn create_playlist(&mut self, name: &str) -> bool {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            self.status = "Playlist name cannot be empty".to_string();
            return false;
        }
        match self.library.create_playlist(trimmed) {
            Ok(_) => {
                self.refresh_playlists();
                self.select_playlist(Some(trimmed.to_string()));
                self.status = format!("Created playlist: {trimmed}");
                diagnostics::line(&format!("created playlist: {trimmed}"));
                true
            }
            Err(err) => {
                self.status = format!("Failed to create playlist: {err}");
                diagnostics::line(&format!("create playlist failed: {err}"));
                false
            }
        }
    }

    pub fn delete_playlist(&mut self, name: &str) -> bool {
        match self.library.delete_playlist(name) {
            Ok(_) => {
                if self.selected_playlist.as_deref() == Some(name) {
                    self.selected_playlist = None;
                }
                self.refresh_playlists();
                self.refresh_filter();
                self.status = format!("Deleted playlist: {name}");
                diagnostics::line(&format!("deleted playlist: {name}"));
                true
            }
            Err(err) => {
                self.status = format!("Failed to delete playlist: {err}");
                diagnostics::line(&format!("delete playlist failed: {err}"));
                false
            }
        }
    }

    pub fn add_track_to_playlist(&mut self, playlist_name: &str, track_path: &str) -> bool {
        match self.library.add_track_to_playlist(playlist_name, track_path) {
            Ok(_) => {
                self.refresh_playlists();
                self.refresh_filter();
                self.status = format!("Added track to {playlist_name}");
                diagnostics::line(&format!("added track {track_path} to {playlist_name}"));
                true
            }
            Err(err) => {
                self.status = format!("Failed to add track to playlist: {err}");
                diagnostics::line(&format!("add track failed: {err}"));
                false
            }
        }
    }

    pub fn remove_track_from_playlist(&mut self, playlist_name: &str, track_path: &str) -> bool {
        match self.library.remove_track_from_playlist(playlist_name, track_path) {
            Ok(_) => {
                self.refresh_playlists();
                self.refresh_filter();
                self.status = format!("Removed track from {playlist_name}");
                diagnostics::line(&format!("removed track {track_path} from {playlist_name}"));
                true
            }
            Err(err) => {
                self.status = format!("Failed to remove track from playlist: {err}");
                diagnostics::line(&format!("remove track failed: {err}"));
                false
            }
        }
    }

    pub fn set_search(&mut self, query: String) {
        self.search = query;
        self.refresh_filter();
    }

    pub fn refresh_filter(&mut self) {
        let needle = self.search.trim().to_lowercase();
        let playlist_paths: Option<std::collections::HashSet<&str>> = self
            .selected_playlist
            .as_ref()
            .and_then(|name| self.playlists.iter().find(|p| &p.name == name))
            .map(|p| p.track_paths.iter().map(String::as_str).collect());

        self.filtered = self
            .tracks
            .iter()
            .enumerate()
            .filter(|(_, track)| {
                if let Some(paths) = &playlist_paths {
                    if !paths.contains(track.file_path.as_str()) {
                        return false;
                    }
                }
                if needle.is_empty() {
                    return true;
                }
                track.title.to_lowercase().contains(&needle)
                    || track.artist.to_lowercase().contains(&needle)
                    || track.key_signature.to_lowercase().contains(&needle)
            })
            .map(|(index, _)| index)
            .collect();
        if self.shuffle {
            let current = self.playing_path.as_ref().and_then(|path| {
                self.filtered
                    .iter()
                    .position(|&i| &self.tracks[i].file_path == path)
            });
            self.shuffle_deck.rebuild(self.filtered.len(), current);
        }
        self.summary = self.compute_summary();
    }

    /// Rendered in the library toolbar; cached so a 30 FPS ticker does not
    /// rebuild a `HashSet` of artists on every frame.
    pub fn summary(&self) -> &str {
        &self.summary
    }

    fn compute_summary(&self) -> String {
        let artists = self
            .filtered
            .iter()
            .map(|&i| self.tracks[i].artist.as_str())
            .collect::<std::collections::HashSet<_>>()
            .len();
        format!(
            "{} tracks · {} · {} artists",
            self.filtered.len(),
            format::format_total_duration(self.total_duration()),
            artists
        )
    }

    pub fn select_playlist(&mut self, name: Option<String>) {
        self.selected_playlist = name;
        self.refresh_filter();
    }

    pub fn total_duration(&self) -> f64 {
        self.filtered
            .iter()
            .map(|&i| self.tracks[i].duration_sec)
            .sum()
    }

    pub fn scan_default(&mut self) {
        self.scan_directory(PathBuf::from(self.music_dir.clone()));
    }

    pub fn scan_directory(&mut self, dir: PathBuf) {
        if !dir.is_dir() {
            self.status = format!("Folder not found: {}", dir.display());
            diagnostics::line(&format!("scan skipped, not a directory: {}", dir.display()));
            return;
        }
        self.status = format!("Scanning {} …", dir.display());
        diagnostics::line(&format!("scan started: {}", dir.display()));

        let library = self.library.clone();
        let pending = self.pending.clone();
        self.rt.spawn(async move {
            match library.scan_directory(&dir).await {
                Ok(tracks) => {
                    library.shrink_memory();
                    diagnostics::line(&format!("scan ok: {} tracks", tracks.len()));
                    pending.lock().unwrap().push(UiMsg::LibraryChanged);
                }
                Err(error) => {
                    pending
                        .lock()
                        .unwrap()
                        .push(UiMsg::ScanFailed(error.to_string()));
                }
            }
        });
    }

    /// Native folder picker. It must never run on the UI thread: on Windows the
    /// modal dialog pumps its own message loop and re-enters winit, which kills
    /// the process. Run it on a blocking pool thread and hand the result back
    /// through the ticker.
    pub fn choose_folder(&self) {
        let pending = self.pending.clone();
        self.rt.spawn_blocking(move || {
            let picked = rfd::FileDialog::new().pick_folder();
            diagnostics::line(&format!("folder picker returned: {picked:?}"));
            pending.lock().unwrap().push(UiMsg::FolderPicked(picked));
        });
    }

    // -------------------------------------------------------------- playback

    pub fn play_index(&mut self, filtered_index: usize) {
        let Some(&track_index) = self.filtered.get(filtered_index) else {
            return;
        };
        let track = self.tracks[track_index].clone();
        if self.playing_path.as_deref() == Some(track.file_path.as_str()) {
            self.toggle_play();
            return;
        }
        if self.shuffle {
            self.shuffle_deck
                .rebuild(self.filtered.len(), Some(filtered_index));
        }
        self.start_track(track);
    }

    pub fn play_path(&mut self, file_path: &str) {
        if self.playing_path.as_deref() == Some(file_path) {
            self.toggle_play();
            return;
        }
        if let Some(track) = self
            .tracks
            .iter()
            .find(|track| track.file_path == file_path)
            .cloned()
        {
            if self.shuffle {
                let current_in_filtered = self
                    .filtered
                    .iter()
                    .position(|&i| self.tracks[i].file_path == file_path);
                self.shuffle_deck
                    .rebuild(self.filtered.len(), current_in_filtered);
            }
            self.start_track(track);
        } else {
            diagnostics::line(&format!("play_path: track not found: {file_path}"));
        }
    }

    fn start_track(&mut self, track: TrackRecord) {
        let item = TrackItem {
            file_path: track.file_path.clone(),
            title: track.title.clone(),
            artist: track.artist.clone(),
            genre: track.genre.clone(),
            mood: track.mood.clone(),
            bpm: track.bpm,
            key_signature: track.key_signature.clone(),
            duration_sec: track.duration_sec,
            waveform: Vec::new(),
        };
        if !self.player.play_track(item) {
            self.status = format!("Playback failed (unreadable or missing file): {}", track.title);
            diagnostics::line(&format!("failed to play track: {}", track.file_path));
            return;
        }

        self.status = format!("Playing: {} - {}", track.artist, track.title);
        diagnostics::line(&format!("now playing: {} - {}", track.artist, track.title));

        self.playback = Playback {
            title: track.title.clone(),
            artist: track.artist.clone(),
            album_meta: track.mood.clone(),
            bpm: track.bpm,
            key: track.key_signature.clone(),
            duration: track.duration_sec,
            position: 0.0,
            playing: true,
            cover: None,
        };
        self.playing_path = Some(track.file_path.clone());
        self.load_cover(track.file_path);
    }

    fn load_cover(&self, path: String) {
        let pending = self.pending.clone();
        self.rt.spawn(async move {
            let worker_path = path.clone();
            let meta = tokio::task::spawn_blocking(move || {
                extract_metadata(std::path::Path::new(&worker_path))
            })
            .await
            .ok();
            let image = meta
                .and_then(|meta: AudioMetadata| meta.cover)
                .filter(|cover| !cover.png_bytes.is_empty())
                .map(|cover| Arc::new(Image::from_bytes(ImageFormat::Png, cover.png_bytes)));
            pending.lock().unwrap().push(UiMsg::Cover { path, image });
        });
    }

    pub fn toggle_play(&mut self) {
        if self.playing_path.is_none() {
            let start_slot = if self.shuffle && !self.filtered.is_empty() {
                if self.shuffle_deck.len() != self.filtered.len() {
                    self.shuffle_deck.rebuild(self.filtered.len(), None);
                }
                self.shuffle_deck.first().unwrap_or(0)
            } else {
                0
            };
            if start_slot < self.filtered.len() {
                self.play_index(start_slot);
            } else {
                self.status = "No tracks to play".to_string();
                diagnostics::line("toggle_play: no tracks available");
            }
            return;
        }
        self.player.toggle_play();
        self.playback.playing = self.player.is_playing;
        diagnostics::line(&format!("toggle_play: playing={}", self.playback.playing));
    }

    pub fn play_next(&mut self) {
        let max_attempts = (self.player.queue.len() + self.filtered.len()).max(1);
        let mut attempts = 0;

        while attempts < max_attempts {
            attempts += 1;
            let next = if let Some(queued) = self.player.pop_next_track() {
                Some(queued)
            } else if self.filtered.is_empty() {
                None
            } else if self.shuffle {
                let slot = self.shuffle_deck.next(self.filtered.len());
                slot.and_then(|i| self.filtered.get(i).copied())
                    .map(|track_idx| self.track_item(track_idx))
            } else {
                let current = self.playing_path.as_ref().and_then(|path| {
                    self.filtered
                        .iter()
                        .position(|&i| &self.tracks[i].file_path == path)
                });
                let slot = current
                    .map(|position| (position + 1) % self.filtered.len())
                    .unwrap_or(0);
                Some(self.track_item(self.filtered[slot]))
            };

            let Some(item) = next else {
                self.player.is_playing = false;
                self.playback.playing = false;
                return;
            };

            let item_path = item.file_path.clone();
            let item_title = item.title.clone();
            if self.player.play_track(item) {
                self.sync_from_player();
                return;
            } else {
                diagnostics::line(&format!(
                    "play_next: unreadable or missing file {item_path}, skipping"
                ));
                self.status = format!("Skipped unreadable track: {item_title}");
            }
        }

        self.player.is_playing = false;
        self.playback.playing = false;
        self.status = "No playable tracks found".to_string();
    }

    pub fn play_prev(&mut self) {
        if self.shuffle {
            self.shuffle_deck.prev();
        }
        if let Some(previous) = self.player.history.pop() {
            if self.player.play_track(previous) {
                self.sync_from_player();
                return;
            }
        }
        self.player.seek(0.0);
        self.playback.position = 0.0;
    }

    fn track_item(&self, index: usize) -> TrackItem {
        let track = &self.tracks[index];
        TrackItem {
            file_path: track.file_path.clone(),
            title: track.title.clone(),
            artist: track.artist.clone(),
            genre: track.genre.clone(),
            mood: track.mood.clone(),
            bpm: track.bpm,
            key_signature: track.key_signature.clone(),
            duration_sec: track.duration_sec,
            waveform: Vec::new(),
        }
    }

    fn sync_from_player(&mut self) {
        if let Some(track) = self.player.current_track.clone() {
            self.playback = Playback {
                title: track.title.clone(),
                artist: track.artist.clone(),
                album_meta: track.mood.clone(),
                bpm: track.bpm,
                key: track.key_signature.clone(),
                duration: track.duration_sec,
                position: 0.0,
                playing: self.player.is_playing,
                cover: None,
            };
            self.playing_path = Some(track.file_path.clone());
            self.load_cover(track.file_path);
        }
    }

    pub fn seek(&mut self, seconds: f64) {
        let seconds = seconds.clamp(0.0, self.playback.duration.max(0.0));
        self.player.seek(seconds);
        self.playback.position = seconds;
    }

    pub fn set_volume(&mut self, volume: f32) {
        self.volume = volume.clamp(0.0, 1.0);
        self.player.set_volume(self.volume);
    }

    pub fn toggle_shuffle(&mut self) {
        self.shuffle = !self.shuffle;
        if self.shuffle {
            let current = self.playing_path.as_ref().and_then(|path| {
                self.filtered
                    .iter()
                    .position(|&i| &self.tracks[i].file_path == path)
            });
            self.shuffle_deck.rebuild(self.filtered.len(), current);
        }
    }

    pub fn toggle_repeat(&mut self) {
        self.repeat = !self.repeat;
    }

    pub fn toggle_automix(&mut self) {
        self.automix = !self.automix;
        self.player.set_automix(self.automix);
        self.library
            .set_setting("automix", if self.automix { "true" } else { "false" })
            .ok();
    }

    pub fn toggle_visualizer(&mut self) {
        self.visualizer = !self.visualizer;
        self.library
            .set_setting("visualizer", if self.visualizer { "true" } else { "false" })
            .ok();
    }

    pub fn toggle_equalizer(&mut self) {
        self.show_equalizer = !self.show_equalizer;
    }

    pub fn toggle_queue(&mut self) {
        self.show_queue = !self.show_queue;
    }

    pub fn set_view(&mut self, view: View) {
        self.view = view;
    }

    // ----------------------------------------------------------------- queue

    pub fn queue_add(&mut self, filtered_index: usize) {
        let Some(&index) = self.filtered.get(filtered_index) else {
            return;
        };
        let item = self.track_item(index);
        self.player.queue_track(item);
    }

    pub fn queue_add_by_path(&mut self, path: &str) {
        if let Some(index) = self.tracks.iter().position(|track| track.file_path == path) {
            let item = self.track_item(index);
            self.player.queue_track(item);
        }
    }

    pub fn queue_remove(&mut self, position: usize) {
        if position < self.player.queue.len() {
            self.player.queue.remove(position);
        }
    }

    pub fn queue_clear(&mut self) {
        self.player.queue.clear();
    }

    // ------------------------------------------------------------------- DSP

    pub fn set_eq_band(&mut self, band: usize, value: f32) {
        if band < self.eq.len() {
            self.eq[band] = value;
            self.apply_eq();
        }
    }

    pub fn reset_eq(&mut self) {
        self.eq = [0.0; 10];
        self.apply_eq();
    }

    fn apply_eq(&mut self) {
        let slot = self.player.active_slot;
        self.player.set_eq10(self.eq);
        self.audio.set_eq10(slot, &self.eq);
    }

    pub fn set_dsp_param(&mut self, key: &'static str, value: f32) {
        match key {
            "limiter" => self.dsp.limiter_boost = value,
            "width" => self.dsp.stereo_width = value,
            "reverb" => self.dsp.reverb_mix = value,
            "bass" => self.dsp.bass_boost = value,
            "treble" => self.dsp.treble_exciter = value,
            _ => return,
        }
        self.apply_dsp();
    }

    fn apply_dsp(&mut self) {
        let dsp = self.dsp;
        let slot = self.player.active_slot;
        self.player.set_dsp(dsp);
        self.audio.set_dsp(slot, &dsp);
    }

    // -------------------------------------------------------------- settings

    pub fn set_crossfade(&mut self, duration: f64) {
        self.crossfade = duration;
        self.player.set_crossfade(duration);
        self.library
            .set_setting("crossfade", &duration.to_string())
            .ok();
    }

    pub fn persist_volume(&self) {
        self.library
            .set_setting("volume", &self.volume.to_string())
            .ok();
    }

    pub fn set_device(&mut self, device_id: String) {
        if self.audio.set_audio_device(&device_id) {
            self.device_id = device_id.clone();
            self.library.set_setting("device", &device_id).ok();
        }
    }

    pub fn set_music_dir(&mut self, dir: PathBuf) {
        self.music_dir = dir.to_string_lossy().to_string();
        self.library.set_setting("music_dir", &self.music_dir).ok();
        self.scan_directory(dir);
    }
}

pub fn default_music_dir() -> String {
    dirs::home_dir()
        .map(|home| home.join(".synapse").join("music"))
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| "music".to_string())
}
