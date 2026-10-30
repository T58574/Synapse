use crate::library::TrackRecord;
use crate::state::TrackItem;
use crate::{ArtistCardItem, TrackRow};
use slint::SharedString;
use std::collections::HashMap;

pub fn format_duration(seconds: f64) -> String {
    let total_secs = seconds.max(0.0).round() as u64;
    let mins = total_secs / 60;
    let secs = total_secs % 60;
    format!("{:02}:{:02}", mins, secs)
}

pub fn format_total_duration(seconds: f64) -> String {
    let total_secs = seconds.max(0.0).round() as u64;
    let hours = total_secs / 3600;
    let mins = (total_secs % 3600) / 60;
    let secs = total_secs % 60;
    if hours > 0 {
        format!("{:02}:{:02}:{:02}", hours, mins, secs)
    } else {
        format!("{:02}:{:02}", mins, secs)
    }
}

pub fn create_track_row(t: &TrackRecord, is_playing: bool) -> TrackRow {
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

pub fn record_to_item(r: &TrackRecord) -> TrackItem {
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

pub fn split_artists(raw: &str) -> Vec<String> {
    let mut results = Vec::new();
    for part in raw.split(&[',', ';', '/'][..]) {
        let trimmed = part.trim();
        if !trimmed.is_empty() {
            // Check for feat / ft
            let sub_parts: Vec<&str> = trimmed.split(" feat. ").collect();
            for sub in sub_parts {
                let sub_trimmed = sub.trim();
                if !sub_trimmed.is_empty() {
                    results.push(sub_trimmed.to_string());
                }
            }
        }
    }
    if results.is_empty() && !raw.trim().is_empty() {
        results.push(raw.trim().to_string());
    }
    results
}

pub fn build_artist_cards(tracks: &[TrackRecord]) -> Vec<ArtistCardItem> {
    let mut counts: HashMap<String, (usize, String)> = HashMap::new();

    for t in tracks {
        let artists = split_artists(&t.artist);
        for a in artists {
            let entry = counts.entry(a).or_insert((0, t.genre.clone()));
            entry.0 += 1;
            if entry.1.is_empty() && !t.genre.is_empty() {
                entry.1 = t.genre.clone();
            }
        }
    }

    let mut list: Vec<(String, usize, String)> = counts
        .into_iter()
        .map(|(name, (cnt, genre))| (name, cnt, genre))
        .collect();

    list.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));

    list.into_iter()
        .map(|(name, cnt, genre)| ArtistCardItem {
            name: SharedString::from(name),
            track_count: cnt as i32,
            genre: SharedString::from(genre),
        })
        .collect()
}
