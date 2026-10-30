pub mod helpers;

use helpers::{
    build_artist_cards, create_track_row, format_duration, format_total_duration, record_to_item,
};

use crate::audio::AudioManager;
use crate::library::metadata::extract_metadata;
use crate::library::{LibraryManager, TrackRecord};
use crate::state::PlayerState;
use crate::{
    AudioDeviceItem, MainWindow, PlaylistRow, QueueRow, SelectOption, TrackRow,
};

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
    pub selected_playlist_name: String,
    pub selected_artist: Option<String>,
    pub selected_nav: i32,
    pub search_query: String,
    pub is_my_wave: bool,
    pub is_shuffle: bool,
    pub is_repeat: bool,
    pub visualizer_enabled: bool,
    pub current_language: String,
}

fn trigger_toast(win: &MainWindow, msg: &str) {
    win.set_toast_message(SharedString::from(msg));
    win.set_is_toast_visible(true);

    let win_weak = win.as_weak();
    slint::Timer::single_shot(std::time::Duration::from_millis(2200), move || {
        if let Some(w) = win_weak.upgrade() {
            w.set_is_toast_visible(false);
        }
    });
}

fn update_queue_model(win: &MainWindow, player: &Arc<Mutex<PlayerState>>) {
    let p = player.lock();
    let rows: Vec<QueueRow> = p
        .queue
        .iter()
        .map(|item| QueueRow {
            file_path: SharedString::from(&item.file_path),
            title: SharedString::from(&item.title),
            artist: SharedString::from(&item.artist),
        })
        .collect();
    win.set_queue_count(rows.len() as i32);
    win.set_queue_items(Rc::new(VecModel::from(rows)).into());
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

    // Populate Initial Slint Models
    let track_rows: Vec<TrackRow> = initial_tracks
        .iter()
        .map(|t| create_track_row(t, false))
        .collect();
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

    let select_options: Vec<SelectOption> = initial_devices
        .iter()
        .map(|d| SelectOption {
            id: SharedString::from(&d.id),
            text: SharedString::from(&d.name),
            badge: SharedString::from(if d.is_default { "DEFAULT" } else { "OUTPUT" }),
        })
        .collect();
    window.set_device_select_options(Rc::new(VecModel::from(select_options)).into());

    let artist_cards = build_artist_cards(&initial_tracks);
    window.set_artists(Rc::new(VecModel::from(artist_cards)).into());

    let total_secs: f64 = initial_tracks.iter().map(|t| t.duration_sec).sum();
    window.set_total_library_duration(SharedString::from(format_total_duration(total_secs)));

    // Restore Saved Settings from SQLite
    let saved_theme = library
        .get_setting("theme")
        .ok()
        .flatten()
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(0);
    window.global::<crate::CyberTheme>().invoke_set_theme(saved_theme);

    let saved_volume = library
        .get_setting("volume")
        .ok()
        .flatten()
        .and_then(|s| s.parse::<f32>().ok())
        .unwrap_or(0.8);
    player.lock().set_volume(saved_volume);
    window.set_master_volume(saved_volume);

    let saved_crossfade = library
        .get_setting("crossfade")
        .ok()
        .flatten()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(4.0);
    player.lock().set_crossfade(saved_crossfade);
    window.set_crossfade_duration(saved_crossfade as f32);

    let saved_automix = library
        .get_setting("automix")
        .ok()
        .flatten()
        .map(|s| s == "true")
        .unwrap_or(false);
    player.lock().set_automix(saved_automix);
    window.set_is_automix(saved_automix);

    let saved_viz = library
        .get_setting("visualizer")
        .ok()
        .flatten()
        .map(|s| s == "true")
        .unwrap_or(true);
    window.set_visualizer_enabled(saved_viz);

    let saved_lang = library
        .get_setting("language")
        .ok()
        .flatten()
        .unwrap_or_else(|| "EN".to_string());
    window.set_current_language(SharedString::from(&saved_lang));

    let ui_state = Arc::new(Mutex::new(UiState {
        all_tracks: initial_tracks,
        filtered_indices: initial_indices,
        selected_playlist_id: -1,
        selected_playlist_name: String::new(),
        selected_artist: None,
        selected_nav: 0,
        search_query: String::new(),
        is_my_wave: false,
        is_shuffle: false,
        is_repeat: false,
        visualizer_enabled: saved_viz,
        current_language: saved_lang,
    }));

    // Helper: Refresh tracks table & hero stats
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
            let mut filtered_duration = 0.0f64;

            for (idx, t) in state.all_tracks.iter().enumerate() {
                if let Some(ref set) = playlist_filter {
                    if !set.contains(&t.file_path) {
                        continue;
                    }
                }
                if let Some(ref artist) = state.selected_artist {
                    if !t.artist.to_lowercase().contains(&artist.to_lowercase()) {
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
                filtered_duration += t.duration_sec;
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

            // Update Hero Banner Details
            if let Some(ref a) = state.selected_artist {
                win.set_hero_category_tag(SharedString::from("ARTIST STREAM"));
                win.set_hero_title(SharedString::from(format!("ARTIST // {}", a)));
            } else if state.selected_playlist_id > 0 {
                win.set_hero_category_tag(SharedString::from("CUSTOM PLAYLIST"));
                win.set_hero_title(SharedString::from(format!(
                    "PLAYLIST // {}",
                    state.selected_playlist_name
                )));
            } else {
                win.set_hero_category_tag(SharedString::from("LOCAL REPOSITORY"));
                win.set_hero_title(SharedString::from("ALL TRACKS"));
            }

            win.set_total_library_duration(SharedString::from(format_total_duration(
                filtered_duration,
            )));
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
                } else if state.is_shuffle || state.is_my_wave {
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
                        update_queue_model(&win, &player);
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
        let lib = library.clone();
        window.on_set_volume(move |vol| {
            player.lock().set_volume(vol);
            let _ = lib.set_setting("volume", &vol.to_string());
        });
    }

    // Callback: toggle_automix
    {
        let window_weak = window.as_weak();
        let player = Arc::clone(&player);
        let lib = library.clone();
        window.on_toggle_automix(move || {
            let mut p = player.lock();
            let new_val = !p.automix;
            p.set_automix(new_val);
            let _ = lib.set_setting("automix", if new_val { "true" } else { "false" });
            if let Some(win) = window_weak.upgrade() {
                win.set_is_automix(new_val);
                trigger_toast(&win, if new_val { "Automix mode: ON" } else { "Automix mode: OFF" });
            }
        });
    }

    // Callback: toggle_shuffle
    {
        let window_weak = window.as_weak();
        let ui_state = Arc::clone(&ui_state);
        window.on_toggle_shuffle(move || {
            let mut state = ui_state.lock();
            state.is_shuffle = !state.is_shuffle;
            let val = state.is_shuffle;
            drop(state);
            if let Some(win) = window_weak.upgrade() {
                win.set_is_shuffle(val);
                trigger_toast(&win, if val { "Shuffle: ENABLED" } else { "Shuffle: OFF" });
            }
        });
    }

    // Callback: toggle_repeat
    {
        let window_weak = window.as_weak();
        let ui_state = Arc::clone(&ui_state);
        window.on_toggle_repeat(move || {
            let mut state = ui_state.lock();
            state.is_repeat = !state.is_repeat;
            let val = state.is_repeat;
            drop(state);
            if let Some(win) = window_weak.upgrade() {
                win.set_is_repeat(val);
                trigger_toast(&win, if val { "Repeat: ENABLED" } else { "Repeat: OFF" });
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
                trigger_toast(&win, "Equalizer reset to Flat");
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
        window.on_select_playlist(move |pl_id, name| {
            let mut state = ui_state.lock();
            state.selected_playlist_id = pl_id;
            state.selected_playlist_name = name.to_string();
            state.selected_artist = None;
            drop(state);
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
                        trigger_toast(&win, &format!("Created playlist: {}", name_str));
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
                state.selected_playlist_name.clear();
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
                    trigger_toast(&win, &format!("Deleted playlist: {}", name.as_str()));
                }
            }
            refresh_table();
        });
    }

    // Callback: add_to_playlist
    {
        let window_weak = window.as_weak();
        let library = library.clone();
        window.on_add_to_playlist(move |pl_id, track_path| {
            let playlists = library.get_playlists().unwrap_or_default();
            if let Some(pl) = playlists.iter().find(|p| p.id == pl_id as i64) {
                let pl_name = pl.name.clone();
                let _ = library.add_track_to_playlist(&pl_name, track_path.as_str());
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
                        trigger_toast(&win, &format!("Added to {}", pl_name));
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
        window.on_remove_from_playlist(move |_idx, track_path| {
            let state = ui_state.lock();
            let current_pl_id = state.selected_playlist_id;
            let current_pl_name = state.selected_playlist_name.clone();
            drop(state);

            if current_pl_id > 0 {
                let _ = library.remove_track_from_playlist(&current_pl_name, track_path.as_str());
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
                        trigger_toast(&win, "Removed from playlist");
                    }
                }
            } else {
                let _ = library.delete_track(track_path.as_str());
                let mut state = ui_state.lock();
                state.all_tracks.retain(|t| t.file_path != track_path.as_str());
                drop(state);
                if let Some(win) = window_weak.upgrade() {
                    trigger_toast(&win, "Track removed from library");
                }
            }
            refresh_table();
        });
    }

    // Callback: add_to_queue
    {
        let window_weak = window.as_weak();
        let player = Arc::clone(&player);
        let ui_state = Arc::clone(&ui_state);
        window.on_add_to_queue(move |_idx, track_path| {
            let state = ui_state.lock();
            let track_opt = state.all_tracks.iter().find(|t| t.file_path == track_path.as_str()).cloned();
            drop(state);

            if let Some(track) = track_opt {
                let title = track.title.clone();
                let item = record_to_item(&track);
                player.lock().queue_track(item);

                if let Some(win) = window_weak.upgrade() {
                    update_queue_model(&win, &player);
                    trigger_toast(&win, &format!("Queued: {}", title));
                }
            }
        });
    }

    // Callback: remove_from_queue
    {
        let window_weak = window.as_weak();
        let player = Arc::clone(&player);
        window.on_remove_from_queue(move |q_idx| {
            let mut p = player.lock();
            if (q_idx as usize) < p.queue.len() {
                p.queue.remove(q_idx as usize);
            }
            drop(p);
            if let Some(win) = window_weak.upgrade() {
                update_queue_model(&win, &player);
            }
        });
    }

    // Callback: clear_queue
    {
        let window_weak = window.as_weak();
        let player = Arc::clone(&player);
        window.on_clear_queue(move || {
            player.lock().queue.clear();
            if let Some(win) = window_weak.upgrade() {
                update_queue_model(&win, &player);
                trigger_toast(&win, "Playback queue cleared");
            }
        });
    }

    // Callback: set_crossfade
    {
        let player = Arc::clone(&player);
        let lib = library.clone();
        window.on_set_crossfade(move |duration| {
            player.lock().set_crossfade(duration as f64);
            let _ = lib.set_setting("crossfade", &duration.to_string());
        });
    }

    // Callback: set_audio_device
    {
        let window_weak = window.as_weak();
        let audio = audio.clone();
        window.on_set_audio_device(move |device_id| {
            audio.set_audio_device(device_id.as_str());
            if let Some(win) = window_weak.upgrade() {
                trigger_toast(&win, &format!("Switched audio device: {}", device_id.as_str()));
            }
        });
    }

    // Callback: toggle_my_wave
    {
        let window_weak = window.as_weak();
        let ui_state = Arc::clone(&ui_state);
        let refresh_table = refresh_tracks_table.clone();
        window.on_toggle_my_wave(move || {
            let mut state = ui_state.lock();
            state.is_my_wave = !state.is_my_wave;
            let val = state.is_my_wave;
            drop(state);
            refresh_table();
            if let Some(win) = window_weak.upgrade() {
                trigger_toast(&win, if val { "Neural Wave stream: ACTIVE" } else { "Neural Wave: OFF" });
            }
        });
    }

    // Callback: play_all_library
    {
        let next_fn = handle_next_track.clone();
        window.on_play_all_library(move || {
            next_fn();
        });
    }

    // Callback: select_artist
    {
        let ui_state = Arc::clone(&ui_state);
        let refresh_table = refresh_tracks_table.clone();
        window.on_select_artist(move |name| {
            let mut state = ui_state.lock();
            state.selected_artist = Some(name.to_string());
            state.selected_playlist_id = -1;
            state.selected_playlist_name.clear();
            drop(state);
            refresh_table();
        });
    }

    // Callback: play_artist
    {
        let window_weak = window.as_weak();
        let ui_state = Arc::clone(&ui_state);
        let player = Arc::clone(&player);
        let refresh_table = refresh_tracks_table.clone();

        window.on_play_artist(move |artist_name| {
            let state = ui_state.lock();
            let target = state
                .all_tracks
                .iter()
                .find(|t| t.artist.to_lowercase().contains(&artist_name.as_str().to_lowercase()))
                .cloned();
            drop(state);

            if let Some(track) = target {
                let item = record_to_item(&track);
                let success = player.lock().play_track(item);
                if success {
                    if let Some(win) = window_weak.upgrade() {
                        win.set_is_playing(true);
                        win.set_current_title(SharedString::from(&track.title));
                        win.set_current_artist(SharedString::from(&track.artist));
                        win.set_current_mood(SharedString::from(&track.mood));
                        win.set_current_bpm(track.bpm as f32);
                        win.set_current_key(SharedString::from(&track.key_signature));
                        win.set_total_duration(track.duration_sec as f32);
                        win.set_total_time_str(SharedString::from(format_duration(track.duration_sec)));
                        trigger_toast(&win, &format!("Playing artist: {}", artist_name.as_str()));
                    }
                }
                refresh_table();
            }
        });
    }

    // Callback: title_clicked & artist_clicked
    {
        let window_weak = window.as_weak();
        window.on_title_clicked(move |title| {
            if let Some(win) = window_weak.upgrade() {
                trigger_toast(&win, &format!("Title: {}", title.as_str()));
            }
        });
    }
    {
        let window_weak = window.as_weak();
        let ui_state = Arc::clone(&ui_state);
        let refresh_table = refresh_tracks_table.clone();
        window.on_artist_clicked(move |artist| {
            let mut state = ui_state.lock();
            state.selected_artist = Some(artist.to_string());
            state.selected_playlist_id = -1;
            drop(state);
            refresh_table();
            if let Some(win) = window_weak.upgrade() {
                win.set_active_tab(0);
                trigger_toast(&win, &format!("Filtered by: {}", artist.as_str()));
            }
        });
    }

    // Callback: language_changed & visualizer_toggled
    {
        let window_weak = window.as_weak();
        let ui_state = Arc::clone(&ui_state);
        let lib = library.clone();
        window.on_language_changed(move |lang| {
            ui_state.lock().current_language = lang.to_string();
            let _ = lib.set_setting("language", lang.as_str());
            if let Some(win) = window_weak.upgrade() {
                trigger_toast(&win, &format!("Language set to {}", lang.as_str()));
            }
        });
    }
    {
        let window_weak = window.as_weak();
        let ui_state = Arc::clone(&ui_state);
        let lib = library.clone();
        window.on_visualizer_toggled(move |enabled| {
            ui_state.lock().visualizer_enabled = enabled;
            let _ = lib.set_setting("visualizer", if enabled { "true" } else { "false" });
            if let Some(win) = window_weak.upgrade() {
                trigger_toast(&win, if enabled { "Visualizer: ON" } else { "Visualizer: OFF" });
            }
        });
    }
    {
        let lib = library.clone();
        window.on_theme_selected(move |idx, _name| {
            let _ = lib.set_setting("theme", &idx.to_string());
        });
    }

    // Callback: open_directory
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

                    let cards = build_artist_cards(&scanned);

                    let _ = slint::invoke_from_event_loop(move || {
                        let mut state = ui.lock();
                        state.all_tracks = scanned;
                        drop(state);
                        refresh();
                        if let Some(w) = win_weak.upgrade() {
                            w.set_artists(Rc::new(VecModel::from(cards)).into());
                            w.set_music_dir(SharedString::from(folder.to_string_lossy().as_ref()));
                            trigger_toast(&w, "Directory scanned & indexed");
                        }
                    });
                }
            });
        });
    }

    // Callback: scan_directory
    {
        let window_weak = window.as_weak();
        let library = library.clone();
        let ui_state = Arc::clone(&ui_state);
        let refresh_table = refresh_tracks_table.clone();
        let tokio_handle_clone = tokio_handle.clone();

        window.on_scan_directory(move || {
            let win_weak = window_weak.clone();
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

                    let cards = build_artist_cards(&scanned);

                    let _ = slint::invoke_from_event_loop(move || {
                        let mut state = ui.lock();
                        state.all_tracks = scanned;
                        drop(state);
                        refresh();
                        if let Some(w) = win_weak.upgrade() {
                            w.set_artists(Rc::new(VecModel::from(cards)).into());
                            trigger_toast(&w, "Library refresh complete");
                        }
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
    let ui_state_clone = Arc::clone(&ui_state);
    let next_track_fn = handle_next_track.clone();

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

            let viz_enabled = ui_state_clone.lock().visualizer_enabled;

            if !is_playing || !viz_enabled {
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
                if !is_playing {
                    return;
                }
            }

            is_idle_zeroed = false;

            let pos = audio_clone.get_position(slot);
            win.set_current_pos(pos as f32);
            win.set_current_time_str(SharedString::from(format_duration(pos)));

            if viz_enabled {
                let mut raw_spectrum = [0.0f32; 64];
                let _count = audio_clone.get_spectrum(slot, &mut raw_spectrum);

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
                        peak_holds[i] = 5;
                        peak_velocities[i] = 0.0;
                    } else {
                        if peak_holds[i] > 0 {
                            peak_holds[i] -= 1;
                        } else {
                            peak_velocities[i] += 0.007;
                            peak_spectrum[i] = (peak_spectrum[i] - peak_velocities[i]).max(current_bar);
                        }
                    }
                }

                win.set_spectrum_data(Rc::new(VecModel::from(smoothed_spectrum.to_vec())).into());
                win.set_spectrum_peaks(Rc::new(VecModel::from(peak_spectrum.to_vec())).into());
            }

            // Detect Track End
            if current_dur > 0.0 && pos >= (current_dur - 0.25) {
                let is_rep = ui_state_clone.lock().is_repeat;
                if is_rep {
                    audio_clone.seek(slot, 0.0);
                } else {
                    next_track_fn();
                }
            }
        },
    );

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

        rec.waveform.clear();
        rec.waveform.shrink_to_fit();
        assert!(rec.waveform.is_empty());

        let state = UiState {
            all_tracks: vec![rec],
            filtered_indices: vec![0],
            selected_playlist_id: -1,
            selected_playlist_name: String::new(),
            selected_artist: None,
            selected_nav: 0,
            search_query: String::new(),
            is_my_wave: false,
            is_shuffle: false,
            is_repeat: false,
            visualizer_enabled: true,
            current_language: "EN".to_string(),
        };

        assert_eq!(state.filtered_indices.len(), 1);
        assert_eq!(state.all_tracks[state.filtered_indices[0]].title, "Neon");
    }
}
