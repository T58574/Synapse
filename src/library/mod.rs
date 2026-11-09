pub mod db;
pub mod metadata;
pub mod scanner;

pub use db::{LibraryDb, PlaylistRecord, TrackRecord};
pub use metadata::{
    determine_mood, extract_cover_art_data_url, extract_metadata, AudioMetadata, CoverArt,
};
pub use scanner::{analyze_audio_file, is_supported_audio, LibraryScanner};

use std::path::Path;

/// Unified library manager coordinating persistent database storage and directory scanning.
#[derive(Clone)]
pub struct LibraryManager {
    db: LibraryDb,
    scanner: LibraryScanner,
}

impl LibraryManager {
    pub fn new(db: LibraryDb, audio: Option<crate::audio::AudioManager>) -> Self {
        let scanner = LibraryScanner::new(db.clone(), audio);
        Self { db, scanner }
    }

    pub fn db(&self) -> &LibraryDb {
        &self.db
    }

    pub fn scanner(&self) -> &LibraryScanner {
        &self.scanner
    }

    pub async fn scan_directory(&self, dir: &Path) -> std::io::Result<Vec<TrackRecord>> {
        self.scanner.scan_directory(dir).await
    }

    pub async fn scan_default(&self) -> std::io::Result<Vec<TrackRecord>> {
        self.scanner.scan_default().await
    }

    pub fn get_all_tracks(&self) -> rusqlite::Result<Vec<TrackRecord>> {
        self.db.get_all_tracks()
    }

    pub fn get_track(&self, path: &str) -> rusqlite::Result<Option<TrackRecord>> {
        self.db.get_track(path)
    }

    pub fn upsert_track(&self, track: &TrackRecord) -> rusqlite::Result<()> {
        self.db.upsert_track(track)
    }

    pub fn delete_track(&self, path: &str) -> rusqlite::Result<()> {
        self.db.delete_track(path)
    }

    pub fn get_playlists(&self) -> rusqlite::Result<Vec<PlaylistRecord>> {
        self.db.get_playlists()
    }

    pub fn create_playlist(&self, name: &str) -> rusqlite::Result<i64> {
        self.db.create_playlist(name)
    }

    pub fn delete_playlist(&self, name: &str) -> rusqlite::Result<()> {
        self.db.delete_playlist(name)
    }

    pub fn add_track_to_playlist(
        &self,
        playlist_name: &str,
        track_path: &str,
    ) -> rusqlite::Result<()> {
        self.db.add_track_to_playlist(playlist_name, track_path)
    }

    pub fn remove_track_from_playlist(
        &self,
        playlist_name: &str,
        track_path: &str,
    ) -> rusqlite::Result<()> {
        self.db.remove_track_from_playlist(playlist_name, track_path)
    }

    pub fn shrink_memory(&self) {
        self.db.shrink_memory();
    }

    pub fn get_setting(&self, key: &str) -> rusqlite::Result<Option<String>> {
        self.db.get_setting(key)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        self.db.set_setting(key, value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_library_manager_lifecycle() {
        let db = LibraryDb::in_memory().expect("in-memory db");
        let manager = LibraryManager::new(db, None);

        let test_dir = tempdir().expect("tempdir");
        let scanned = manager
            .scan_directory(test_dir.path())
            .await
            .expect("scan empty dir");
        assert!(scanned.is_empty());

        let track = TrackRecord {
            file_path: "/music/test.flac".to_string(),
            title: "Test Track".to_string(),
            artist: "Tester".to_string(),
            genre: "Synth".to_string(),
            mood: "chill".to_string(),
            bpm: 100.0,
            key_signature: "8B".to_string(),
            duration_sec: 120.0,
            waveform: vec![0.0, 0.5, 1.0],
            size: 5000,
            mod_time: 12345,
        };

        manager.upsert_track(&track).expect("upsert");
        let fetched = manager.get_track("/music/test.flac").expect("get");
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().title, "Test Track");

        manager.create_playlist("Chill Wave").expect("create playlist");
        manager
            .add_track_to_playlist("Chill Wave", "/music/test.flac")
            .expect("add track");
        let playlists = manager.get_playlists().expect("get playlists");
        assert_eq!(playlists.len(), 1);
        assert_eq!(playlists[0].track_paths, vec!["/music/test.flac"]);
    }
}
