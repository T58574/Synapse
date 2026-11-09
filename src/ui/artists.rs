//! Artist aggregation for the sidebar / artist list.

use crate::library::TrackRecord;
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct ArtistCard {
    pub name: String,
    pub track_count: usize,
    pub genre: String,
}

pub fn split_artists(raw: &str) -> Vec<String> {
    let mut results = Vec::new();
    for part in raw.split([',', ';', '/']) {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        for sub in trimmed.split(" feat. ") {
            let sub = sub.trim();
            if !sub.is_empty() {
                results.push(sub.to_string());
            }
        }
    }
    if results.is_empty() && !raw.trim().is_empty() {
        results.push(raw.trim().to_string());
    }
    results
}

pub fn build_artist_cards(tracks: &[TrackRecord]) -> Vec<ArtistCard> {
    let mut counts: HashMap<String, (usize, String)> = HashMap::new();
    for track in tracks {
        for artist in split_artists(&track.artist) {
            let entry = counts.entry(artist).or_insert((0, track.genre.clone()));
            entry.0 += 1;
            if entry.1.is_empty() && !track.genre.is_empty() {
                entry.1 = track.genre.clone();
            }
        }
    }

    let mut list: Vec<ArtistCard> = counts
        .into_iter()
        .map(|(name, (track_count, genre))| ArtistCard {
            name,
            track_count,
            genre,
        })
        .collect();
    list.sort_by_key(|card| card.name.to_lowercase());
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_featured_artists() {
        assert_eq!(
            split_artists("Daft Punk, Nile Rodgers"),
            vec!["Daft Punk", "Nile Rodgers"]
        );
        assert_eq!(split_artists("A feat. B"), vec!["A", "B"]);
        assert_eq!(split_artists(""), Vec::<String>::new());
    }

    #[test]
    fn aggregates_artist_counts() {
        let track = |artist: &str| TrackRecord {
            file_path: format!("/m/{}.flac", artist),
            title: "t".into(),
            artist: artist.into(),
            genre: "Synth".into(),
            mood: "chill".into(),
            bpm: 120.0,
            key_signature: "8A".into(),
            duration_sec: 100.0,
            waveform: vec![],
            size: 0,
            mod_time: 0,
        };
        let cards = build_artist_cards(&[track("A, B"), track("B")]);
        assert_eq!(cards.len(), 2);
        assert_eq!(cards[0].name, "A");
        assert_eq!(cards[1].track_count, 2);
    }
}
