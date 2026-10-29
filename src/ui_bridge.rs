use crate::audio::AudioManager;
use crate::library::metadata::extract_metadata;
use crate::library::{LibraryManager, TrackRecord};
use crate::state::{PlayerState, TrackItem};
use crate::{AudioDeviceItem, MainWindow, PlaylistRow, TrackRow};

use parking_lot::Mutex;
use slint::{ComponentHandle, SharedPixelBuffer, SharedString, VecModel};
use std::collections::HashSet;
use std::rc::Rc;
use std::sync::Arc;
use tokio::runtime::Handle;

pub struct UiState {
    pub all_tracks: Vec<TrackRecord>,
    pub filtered_indices: Vec<usize>,
    pub selected_playlist_id: i32,
    pub selected_nav: i32,
    pub search_query: String,
    pub is_my_wave: bool,
}

pub fn format_duration(seconds: f64) -> String {
    let total_secs = seconds.max(0.0).round() as u64;
    let mins = total_secs / 60;
    let secs = total_secs % 60;
    format!("{:02}:{:02}", mins, secs)
}

fn create_track_row(t: &TrackRecord, is_playing: bool) -> TrackRow {
    TrackRow {
        file_path: SharedString::from(&t.file_path),
        title: SharedString::from(&t.title),
        artist: SharedString::from(&t.artist),
        bpm: t.bpm as f32,
        key_sig: SharedString::from(&t.key_signature),
        duration: SharedString::from(format_duration(t.duration_sec)),
        is_playing,
    }
}

fn record_to_item(r: &TrackRecord) -> TrackItem {
    TrackItem {
        file_path: r.file_path.clone(),
        title: r.title.clone(),
        artist: r.artist.clone(),
        genre: r.genre.clone(),
        mood: r.mood.clone(),
        bpm: r.bpm,
        key_signature: r.key_signature.clone(),
        duration_sec: r.duration_sec,
        waveform: r.waveform.clone(),
    }
}

pub fn setup_ui_bridge(
    window: &MainWindow,
    audio: AudioManager,
    library: LibraryManager,
    player: Arc<Mutex<PlayerState>>,
    tokio_handle: Handle,
) {
    // 1. Initial Data Loading
    let mut initial_tracks = library.get_all_tracks().unwrap_or_default();
    library.shrink_memory();
    for t in &mut initial_tracks {
        t.waveform.clear();
        t.waveform.shrink_to_fit();
    }
    initial_tracks.shrink_to_fit();

    let initial_playlists = library.get_playlists().unwrap_or_default();
    let initial_devices = audio.get_audio_devices();

    let initial_indices: Vec<usize> = (0..initial_tracks.len()).collect();

    // Populate Slint Models
    let mut track_rows: Vec<TrackRow> = initial_tracks
        .iter()
        .map(|t| create_track_row(t, false))
        .collect();
    track_rows.shrink_to_fit();
    window.set_tracks(Rc::new(VecModel::from(track_rows)).into());

    let playlist_rows: Vec<PlaylistRow> = initial_playlists
        .iter()
        .map(|p| PlaylistRow {
            id: p.id as i32,
            name: SharedString::from(&p.name),
            track_count: p.track_paths.len() as i32,
        })
        .collect();
    window.set_playlists(Rc::new(VecModel::from(playlist_rows)).into());

    let device_rows: Vec<AudioDeviceItem> = initial_devices
        .iter()
        .map(|d| AudioDeviceItem {
            id: SharedString::from(&d.id),
            name: SharedString::from(&d.name),
            is_default: d.is_default,
        })
        .collect();
    window.set_audio_devices(Rc::new(VecModel::from(device_rows)).into());

    let ui_state = Arc::new(Mutex::new(UiState {
        all_tracks: initial_tracks,
        filtered_indices: initial_indices,
        selected_playlist_id: -1,
        selected_nav: 0,
        search_query: String::new(),
        is_my_wave: false,
    }));

    // Helper: Refresh displayed tracks
    let refresh_tracks_table = {
        let window_weak = window.as_weak();
        let ui_state = Arc::clone(&ui_state);
        let player = Arc::clone(&player);
        let library = library.clone();

        move || {
            let Some(win) = window_weak.upgrade() else {
                return;
            };
            let mut state = ui_state.lock();
            let current_playing_path = player
                .lock()
                .current_track
                .as_ref()
                .map(|t| t.file_path.clone());

            let playlist_filter = if state.selected_playlist_id > 0 {
                let playlists = library.get_playlists().unwrap_or_default();
                playlists
                    .into_iter()
                    .find(|p| p.id == state.selected_playlist_id as i64)
                    .map(|pl| pl.track_paths.into_iter().collect::<HashSet<_>>())
            } else {
                None
            };

            let query_lower = if !state.search_query.is_empty() {
                Some(state.search_query.to_lowercase())
            } else {
                None
            };

            let mut indices = Vec::with_capacity(state.all_tracks.len());
            for (idx, t) in state.all_tracks.iter().enumerate() {
                if let Some(ref set) = playlist_filter {
                    if !set.contains(&t.file_path) {
                        continue;
                    }
                }
                if let Some(ref q) = query_lower {
                    let matches = t.title.to_lowercase().contains(q)
                        || t.artist.to_lowercase().contains(q)
                        || t.genre.to_lowercase().contains(q)
                        || t.key_signature.to_lowercase().contains(q);
                    if !matches {
                        continue;
                    }
                }
                indices.push(idx);
            }
            indices.shrink_to_fit();

            let mut rows = Vec::with_capacity(indices.len());
            for &idx in &indices {
                let t = &state.all_tracks[idx];
                let is_active = current_playing_path
                    .as_ref()
                    .map(|p| p == &t.file_path)
                    .unwrap_or(false);
                rows.push(create_track_row(t, is_active));
            }
            rows.shrink_to_fit();

            state.filtered_indices = indices;

            win.set_tracks(Rc::new(VecModel::from(rows)).into());
        }
    };

    // Callback: play_track
    {
        let window_weak = window.as_weak();
        let player = Arc::clone(&player);
        let ui_state = Arc::clone(&ui_state);
        let refresh_table = refresh_tracks_table.clone();
        let tokio_handle_clone = tokio_handle.clone();

        window.on_play_track(move |idx, file_path| {
            let Some(win) = window_weak.upgrade() else {
                return;
            };
            let state = ui_state.lock();
            let path_str = file_path.to_string();

            let target_track = if idx >= 0 {
                state
                    .filtered_indices
                    .get(idx as usize)
                    .and_then(|&i| state.all_tracks.get(i))
                    .cloned()
            } else {
                None
            }
            .or_else(|| {
                state.all_tracks.iter().find(|t| t.file_path == path_str).cloned()
            });

            let Some(track) = target_track else {
                return;
            };
            drop(state);

            let track_item = record_to_item(&track);
            let mut p = player.lock();
            let success = p.play_track(track_item);
            if !success {
                return;
            }

            win.set_is_playing(true);
            win.set_active_track_index(idx);
            win.set_current_title(SharedString::from(&track.title));
            win.set_current_artist(SharedString::from(&track.artist));
            win.set_current_mood(SharedString::from(&track.mood));
            win.set_current_bpm(track.bpm as f32);
            win.set_current_key(SharedString::from(&track.key_signature));
            win.set_total_duration(track.duration_sec as f32);
            win.set_total_time_str(SharedString::from(format_duration(track.duration_sec)));
            win.set_current_pos(0.0);
            win.set_current_time_str(SharedString::from("00:00"));

            // Async cover extraction
            let win_weak_cover = window_weak.clone();
            let cover_path = track.file_path.clone();
            tokio_handle_clone.spawn(async move {
                let meta = tokio::task::spawn_blocking(move || {
                    extract_metadata(std::path::Path::new(&cover_path))
                })
                .await
                .ok();

                if let Some(m) = meta {
                    if let Some(c) = m.cover {
                        if !c.rgba_bytes.is_empty() && c.width > 0 && c.height > 0 {
                            let _ = slint::invoke_from_event_loop(move || {
                                if let Some(w) = win_weak_cover.upgrade() {
                                    let mut buffer = SharedPixelBuffer::new(c.width, c.height);
                                    buffer.make_mut_bytes().copy_from_slice(&c.rgba_bytes);
                                    let img = slint::Image::from_rgba8(buffer);
                                    w.set_current_cover(img);
                                    w.set_has_cover(true);
                                }
                            });
                            return;
                        }
                    }
                }

                let _ = slint::invoke_from_event_loop(move || {
                    if let Some(w) = win_weak_cover.upgrade() {
                        w.set_has_cover(false);
                    }
                });
            });

            drop(p);
            refresh_table();
        });
    }

    // Callback: toggle_play
    {
        let window_weak = window.as_weak();
        let player = Arc::clone(&player);
        let refresh_table = refresh_tracks_table.clone();

        window.on_toggle_play(move || {
            let Some(win) = window_weak.upgrade() else {
                return;
            };
            let mut p = player.lock();
            p.toggle_play();
            win.set_is_playing(p.is_playing);
            drop(p);
            refresh_table();
        });
    }

    // Callback: prev_track
    {
        let window_weak = window.as_weak();
        let player = Arc::clone(&player);

        window.on_prev_track(move || {
            let mut p = player.lock();
            if let Some(prev) = p.history.pop() {
                if p.play_track(prev) {
                    if let Some(win) = window_weak.upgrade() {
                        win.set_is_playing(true);
                        if let Some(ref cur) = p.current_track {
                            win.set_current_title(SharedString::from(&cur.title));
                            win.set_current_artist(SharedString::from(&cur.artist));
                            win.set_current_mood(SharedString::from(&cur.mood));
                            win.set_current_bpm(cur.bpm as f32);
                            win.set_current_key(SharedString::from(&cur.key_signature));
                            win.set_total_duration(cur.duration_sec as f32);
                            win.set_total_time_str(SharedString::from(format_duration(cur.duration_sec)));
                        }
                    }
                }
            } else {
                p.seek(0.0);
            }
        });
    }

    // Callback: next_track
    let handle_next_track = {
        let window_weak = window.as_weak();
        let player = Arc::clone(&player);
        let ui_state = Arc::clone(&ui_state);
        let refresh_table = refresh_tracks_table.clone();

        move || {
            let mut p = player.lock();
            let next_item = if let Some(queued) = p.pop_next_track() {
                Some(queued)
            } else {
                let state = ui_state.lock();
                if state.filtered_indices.is_empty() {
                    None
                } else if state.is_my_wave {
                    // Smart shuffle: pick random track from list
                    let rand_slot = (std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as usize)
                        % state.filtered_indices.len();
                    let track_idx = state.filtered_indices[rand_slot];
                    Some(record_to_item(&state.all_tracks[track_idx]))
                } else {
                    let current_path = p.current_track.as_ref().map(|t| &t.file_path);
                    let current_pos = current_path
                        .and_then(|path| {
                            state
                                .filtered_indices
                                .iter()
                                .position(|&idx| &state.all_tracks[idx].file_path == path)
                        })
                        .unwrap_or(0);
                    let next_slot = (current_pos + 1) % state.filtered_indices.len();
                    let track_idx = state.filtered_indices[next_slot];
                    Some(record_to_item(&state.all_tracks[track_idx]))
                }
            };

            if let Some(item) = next_item {
                let success = p.play_track(item);
                if success {
                    if let Some(win) = window_weak.upgrade() {
                        win.set_is_playing(true);
                        if let Some(ref cur) = p.current_track {
                            win.set_current_title(SharedString::from(&cur.title));
                            win.set_current_artist(SharedString::from(&cur.artist));
                            win.set_current_mood(SharedString::from(&cur.mood));
                            win.set_current_bpm(cur.bpm as f32);
                            win.set_current_key(SharedString::from(&cur.key_signature));
                            win.set_total_duration(cur.duration_sec as f32);
                            win.set_total_time_str(SharedString::from(format_duration(cur.duration_sec)));
                        }
                    }
                }
            }
            drop(p);
            refresh_table();
        }
    };

    {
        let next_fn = handle_next_track.clone();
        window.on_next_track(move || {
            next_fn();
        });
    }

    // Callback: seek_track
    {
        let player = Arc::clone(&player);
        window.on_seek_track(move |pos_sec| {
            player.lock().seek(pos_sec as f64);
        });
    }

    // Callback: set_volume
    {
        let player = Arc::clone(&player);
        window.on_set_volume(move |vol| {
            player.lock().set_volume(vol);
        });
    }

    // Callback: toggle_automix
    {
        let window_weak = window.as_weak();
        let player = Arc::clone(&player);
        window.on_toggle_automix(move || {
            let mut p = player.lock();
            let new_val = !p.automix;
            p.set_automix(new_val);
            if let Some(win) = window_weak.upgrade() {
                win.set_is_automix(new_val);
            }
        });
    }

    // Callback: set_eq_band
    {
        let player = Arc::clone(&player);
        window.on_set_eq_band(move |band_idx, gain_db| {
            if band_idx >= 0 && band_idx < 10 {
                let mut p = player.lock();
                p.eq10[band_idx as usize] = gain_db;
                let bands = p.eq10;
                p.set_eq10(bands);
            }
        });
    }

    // Callback: reset_eq
    {
        let window_weak = window.as_weak();
        let player = Arc::clone(&player);
        window.on_reset_eq(move || {
            let mut p = player.lock();
            p.set_eq10([0.0; 10]);
            if let Some(win) = window_weak.upgrade() {
                win.set_eq_bands(Rc::new(VecModel::from(vec![0.0f32; 10])).into());
            }
        });
    }

    // Callback: set_dsp_param
    {
        let player = Arc::clone(&player);
        window.on_set_dsp_param(move |param_name, val| {
            let mut p = player.lock();
            let mut dsp = p.dsp;
            match param_name.as_str() {
                "limiter_boost" => dsp.limiter_boost = val,
                "stereo_width" => dsp.stereo_width = val,
                "reverb_mix" => dsp.reverb_mix = val,
                "bass_boost" => dsp.bass_boost = val,
                "treble_exciter" => dsp.treble_exciter = val,
                _ => {}
            }
            p.set_dsp(dsp);
        });
    }

    // Callback: search_tracks
    {
        let ui_state = Arc::clone(&ui_state);
        let refresh_table = refresh_tracks_table.clone();
        window.on_search_tracks(move |query| {
            ui_state.lock().search_query = query.to_string();
            refresh_table();
        });
    }

    // Callback: select_playlist
    {
        let ui_state = Arc::clone(&ui_state);
        let refresh_table = refresh_tracks_table.clone();
        window.on_select_playlist(move |pl_id, _name| {
            ui_state.lock().selected_playlist_id = pl_id;
            refresh_table();
        });
    }

    // Callback: create_playlist
    {
        let window_weak = window.as_weak();
        let library = library.clone();
        window.on_create_playlist(move |name| {
            let name_str = name.trim();
            if name_str.is_empty() {
                return;
            }
            if let Ok(_) = library.create_playlist(name_str) {
                if let Ok(playlists) = library.get_playlists() {
                    let rows: Vec<PlaylistRow> = playlists
                        .iter()
                        .map(|p| PlaylistRow {
                            id: p.id as i32,
                            name: SharedString::from(&p.name),
                            track_count: p.track_paths.len() as i32,
                        })
                        .collect();
                    if let Some(win) = window_weak.upgrade() {
                        win.set_playlists(Rc::new(VecModel::from(rows)).into());
                    }
                }
            }
        });
    }

    // Callback: delete_playlist
    {
        let window_weak = window.as_weak();
        let library = library.clone();
        let ui_state = Arc::clone(&ui_state);
        let refresh_table = refresh_tracks_table.clone();
        window.on_delete_playlist(move |pl_id, name| {
            let _ = library.delete_playlist(name.as_str());
            let mut state = ui_state.lock();
            if state.selected_playlist_id == pl_id {
                state.selected_playlist_id = -1;
            }
            drop(state);

            if let Ok(playlists) = library.get_playlists() {
                let rows: Vec<PlaylistRow> = playlists
                    .iter()
                    .map(|p| PlaylistRow {
                        id: p.id as i32,
                        name: SharedString::from(&p.name),
                        track_count: p.track_paths.len() as i32,
                    })
                    .collect();
                if let Some(win) = window_weak.upgrade() {
                    win.set_playlists(Rc::new(VecModel::from(rows)).into());
                }
            }
            refresh_table();
        });
    }

    // Callback: add_to_playlist
    {
        let window_weak = window.as_weak();
        let library = library.clone();
        let ui_state = Arc::clone(&ui_state);
        window.on_add_to_playlist(move |pl_id, track_path| {
            let state = ui_state.lock();
            let target_id = if pl_id >= 0 { pl_id } else { state.selected_playlist_id };
            drop(state);

            if target_id <= 0 {
                return;
            }
            let playlists = library.get_playlists().unwrap_or_default();
            if let Some(pl) = playlists.iter().find(|p| p.id == target_id as i64) {
                let _ = library.add_track_to_playlist(&pl.name, track_path.as_str());
                if let Ok(updated) = library.get_playlists() {
                    let rows: Vec<PlaylistRow> = updated
                        .iter()
                        .map(|p| PlaylistRow {
                            id: p.id as i32,
                            name: SharedString::from(&p.name),
                            track_count: p.track_paths.len() as i32,
                        })
                        .collect();
                    if let Some(win) = window_weak.upgrade() {
                        win.set_playlists(Rc::new(VecModel::from(rows)).into());
                    }
                }
            }
        });
    }

    // Callback: remove_from_playlist
    {
        let window_weak = window.as_weak();
        let library = library.clone();
        let ui_state = Arc::clone(&ui_state);
        let refresh_table = refresh_tracks_table.clone();
        window.on_remove_from_playlist(move |pl_id, track_path| {
            let state = ui_state.lock();
            let target_id = if pl_id >= 0 { pl_id } else { state.selected_playlist_id };
            drop(state);

            if target_id <= 0 {
                return;
            }
            let playlists = library.get_playlists().unwrap_or_default();
            if let Some(pl) = playlists.iter().find(|p| p.id == target_id as i64) {
                let _ = library.remove_track_from_playlist(&pl.name, track_path.as_str());
                if let Ok(updated) = library.get_playlists() {
                    let rows: Vec<PlaylistRow> = updated
                        .iter()
                        .map(|p| PlaylistRow {
                            id: p.id as i32,
                            name: SharedString::from(&p.name),
                            track_count: p.track_paths.len() as i32,
                        })
                        .collect();
                    if let Some(win) = window_weak.upgrade() {
                        win.set_playlists(Rc::new(VecModel::from(rows)).into());
                    }
                }
            }
            refresh_table();
        });
    }

    // Callback: set_crossfade
    {
        let player = Arc::clone(&player);
        window.on_set_crossfade(move |duration| {
            player.lock().set_crossfade(duration as f64);
        });
    }

    // Callback: set_audio_device
    {
        let audio = audio.clone();
        window.on_set_audio_device(move |device_id| {
            audio.set_audio_device(device_id.as_str());
        });
    }

    // Callback: toggle_my_wave
    {
        let ui_state = Arc::clone(&ui_state);
        let refresh_table = refresh_tracks_table.clone();
        window.on_toggle_my_wave(move || {
            let mut state = ui_state.lock();
            state.is_my_wave = !state.is_my_wave;
            drop(state);
            refresh_table();
        });
    }

    // Callback: open_directory (rfd native folder picker)
    {
        let window_weak = window.as_weak();
        let library = library.clone();
        let ui_state = Arc::clone(&ui_state);
        let refresh_table = refresh_tracks_table.clone();
        let tokio_handle_clone = tokio_handle.clone();

        window.on_open_directory(move || {
            let folder_opt = rfd::FileDialog::new().pick_folder();
            let Some(folder) = folder_opt else {
                return;
            };

            let win_weak = window_weak.clone();
            let lib = library.clone();
            let ui = Arc::clone(&ui_state);
            let refresh = refresh_table.clone();

            tokio_handle_clone.spawn(async move {
                if let Ok(mut scanned) = lib.scan_directory(&folder).await {
                    for t in &mut scanned {
                        t.waveform.clear();
                        t.waveform.shrink_to_fit();
                    }
                    scanned.shrink_to_fit();
                    lib.shrink_memory();

                    let _ = slint::invoke_from_event_loop(move || {
                        let mut state = ui.lock();
                        state.all_tracks = scanned;
                        drop(state);
                        refresh();
                        if let Some(w) = win_weak.upgrade() {
                            w.set_music_dir(SharedString::from(folder.to_string_lossy().as_ref()));
                        }
                    });
                }
            });
        });
    }

    // Callback: scan_directory
    {
        let library = library.clone();
        let ui_state = Arc::clone(&ui_state);
        let refresh_table = refresh_tracks_table.clone();
        let tokio_handle_clone = tokio_handle.clone();

        window.on_scan_directory(move || {
            let lib = library.clone();
            let ui = Arc::clone(&ui_state);
            let refresh = refresh_table.clone();

            tokio_handle_clone.spawn(async move {
                if let Ok(mut scanned) = lib.scan_default().await {
                    for t in &mut scanned {
                        t.waveform.clear();
                        t.waveform.shrink_to_fit();
                    }
                    scanned.shrink_to_fit();
                    lib.shrink_memory();

                    let _ = slint::invoke_from_event_loop(move || {
                        let mut state = ui.lock();
                        state.all_tracks = scanned;
                        drop(state);
                        refresh();
                    });
                }
            });
        });
    }

    // 2. Real-time 30 FPS Playback & Visualizer Ticker (Slint Timer)
    let timer = slint::Timer::default();
    let window_weak = window.as_weak();
    let audio_clone = audio.clone();
    let player_clone = Arc::clone(&player);
    let next_track_fn = handle_next_track.clone();

    // Winamp-style spectrum ballistics state
    let mut smoothed_spectrum = [0.0f32; 64];
    let mut peak_spectrum = [0.0f32; 64];
    let mut peak_holds = [0u8; 64];
    let mut peak_velocities = [0.0f32; 64];
    let mut is_idle_zeroed = false;

    timer.start(
        slint::TimerMode::Repeated,
        std::time::Duration::from_millis(33),
        move || {
            let Some(win) = window_weak.upgrade() else {
                return;
            };
            let p = player_clone.lock();
            let is_playing = p.is_playing;
            let slot = p.active_slot;
            let current_dur = p.current_track.as_ref().map(|t| t.duration_sec).unwrap_or(0.0);
            drop(p);

            if !is_playing {
                if !is_idle_zeroed {
                    let mut any_active = false;
                    for i in 0..64 {
                        smoothed_spectrum[i] *= 0.75;
                        if peak_spectrum[i] > 0.005 {
                            peak_velocities[i] += 0.008;
                            peak_spectrum[i] = (peak_spectrum[i] - peak_velocities[i]).max(0.0);
                        } else {
                            peak_spectrum[i] = 0.0;
                        }
                        if smoothed_spectrum[i] > 0.005 || peak_spectrum[i] > 0.005 {
                            any_active = true;
                        }
                    }

                    if !any_active {
                        is_idle_zeroed = true;
                        smoothed_spectrum = [0.0f32; 64];
                        peak_spectrum = [0.0f32; 64];
                    }

                    win.set_spectrum_data(Rc::new(VecModel::from(smoothed_spectrum.to_vec())).into());
                    win.set_spectrum_peaks(Rc::new(VecModel::from(peak_spectrum.to_vec())).into());
                }
                return;
            }

            is_idle_zeroed = false;

            let pos = audio_clone.get_position(slot);
            win.set_current_pos(pos as f32);
            win.set_current_time_str(SharedString::from(format_duration(pos)));

            // Query C++ FFT spectrum (logarithmically distributed across 64 bands)
            let mut raw_spectrum = [0.0f32; 64];
            let _count = audio_clone.get_spectrum(slot, &mut raw_spectrum);

            // Winamp ballistics: snappy attack, smooth decay, and falling peak dots
            for i in 0..64 {
                let raw = raw_spectrum[i].clamp(0.0, 1.0);
                if raw >= smoothed_spectrum[i] {
                    smoothed_spectrum[i] = raw * 0.85 + smoothed_spectrum[i] * 0.15;
                } else {
                    smoothed_spectrum[i] = smoothed_spectrum[i] * 0.82;
                }

                let current_bar = smoothed_spectrum[i];
                if current_bar >= peak_spectrum[i] {
                    peak_spectrum[i] = current_bar;
                    peak_holds[i] = 5; // hold for ~165ms (5 ticks)
                    peak_velocities[i] = 0.0;
                } else {
                    if peak_holds[i] > 0 {
                        peak_holds[i] -= 1;
                    } else {
                        peak_velocities[i] += 0.007; // gravitational acceleration
                        peak_spectrum[i] = (peak_spectrum[i] - peak_velocities[i]).max(current_bar);
                    }
                }
            }

            win.set_spectrum_data(Rc::new(VecModel::from(smoothed_spectrum.to_vec())).into());
            win.set_spectrum_peaks(Rc::new(VecModel::from(peak_spectrum.to_vec())).into());

            // Detect Track End
            if current_dur > 0.0 && pos >= (current_dur - 0.25) {
                next_track_fn();
            }
        },
    );

    // Keep timer alive on the UI struct or heap
    Box::leak(Box::new(timer));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_duration() {
        assert_eq!(format_duration(0.0), "00:00");
        assert_eq!(format_duration(5.2), "00:05");
        assert_eq!(format_duration(59.9), "01:00");
        assert_eq!(format_duration(125.0), "02:05");
        assert_eq!(format_duration(3661.0), "61:01");
    }

    #[test]
    fn test_record_to_item_and_row_conversion() {
        let rec = TrackRecord {
            file_path: "/music/test.flac".to_string(),
            title: "Cyber City".to_string(),
            artist: "Alt Cunningham".to_string(),
            genre: "Synthwave".to_string(),
            mood: "energetic".to_string(),
            bpm: 130.0,
            key_signature: "7A".to_string(),
            duration_sec: 245.5,
            waveform: vec![0.0, 0.5, 1.0],
            size: 1024 * 1024,
            mod_time: 1700000000,
        };

        let item = record_to_item(&rec);
        assert_eq!(item.file_path, rec.file_path);
        assert_eq!(item.bpm, 130.0);

        let row = create_track_row(&rec, true);
        assert_eq!(row.title.as_str(), "Cyber City");
        assert_eq!(row.duration.as_str(), "04:06");
        assert!(row.is_playing);
    }

    #[test]
    fn test_ui_state_filtered_indices_and_waveform_trimming() {
        let mut rec = TrackRecord {
            file_path: "/music/track.mp3".to_string(),
            title: "Neon".to_string(),
            artist: "Cyber".to_string(),
            genre: "EDM".to_string(),
            mood: "energetic".to_string(),
            bpm: 128.0,
            key_signature: "11B".to_string(),
            duration_sec: 180.0,
            waveform: vec![0.1, 0.2, 0.3, 0.4],
            size: 2048,
            mod_time: 1700000001,
        };

        // Memory optimization: clear waveform for UI state
        rec.waveform.clear();
        rec.waveform.shrink_to_fit();
        assert!(rec.waveform.is_empty());

        let state = UiState {
            all_tracks: vec![rec],
            filtered_indices: vec![0],
            selected_playlist_id: -1,
            selected_nav: 0,
            search_query: String::new(),
            is_my_wave: false,
        };

        assert_eq!(state.filtered_indices.len(), 1);
        assert_eq!(state.all_tracks[state.filtered_indices[0]].title, "Neon");
    }
}
