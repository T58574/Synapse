use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use super::metadata::determine_mood;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TrackRecord {
    pub file_path: String,
    pub title: String,
    pub artist: String,
    pub genre: String,
    pub mood: String,
    pub bpm: f64,
    pub key_signature: String,
    pub duration_sec: f64,
    pub waveform: Vec<f32>,
    pub size: i64,
    pub mod_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlaylistRecord {
    pub id: i64,
    pub name: String,
    pub track_paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct LegacyCacheEntry {
    #[serde(rename = "filePath")]
    file_path: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    artist: String,
    #[serde(default)]
    genre: String,
    #[serde(default)]
    mood: String,
    #[serde(default)]
    bpm: f64,
    #[serde(rename = "keySignature", default)]
    key_signature: String,
    #[serde(rename = "durationSec", default)]
    duration_sec: f64,
    #[serde(default)]
    waveform: Vec<f32>,
    #[serde(default)]
    size: i64,
    #[serde(rename = "modTime", default)]
    mod_time: i64,
}

#[derive(Debug, Deserialize)]
struct LegacyPlaylist {
    name: String,
    #[serde(rename = "trackPaths", default)]
    track_paths: Vec<String>,
}

pub fn encode_waveform(waveform: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(waveform.len() * 4);
    for &sample in waveform {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    bytes
}

pub fn decode_waveform(blob: &[u8]) -> Vec<f32> {
    if blob.is_empty() {
        return Vec::new();
    }
    if blob[0] == b'[' {
        if let Ok(vec) = serde_json::from_slice::<Vec<f32>>(blob) {
            return vec;
        }
    }
    blob.chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

#[derive(Clone)]
pub struct LibraryDb {
    conn: Arc<Mutex<Connection>>,
}

impl LibraryDb {
    pub fn default_db_path() -> Option<PathBuf> {
        dirs::home_dir().map(|h| h.join(".synapse").join("library.db"))
    }

    pub fn default_dir() -> Option<PathBuf> {
        dirs::home_dir().map(|h| h.join(".synapse"))
    }

    /// Open or create database at `~/.synapse/library.db` and run migrations.
    pub fn open_default() -> rusqlite::Result<Self> {
        let db_path = Self::default_db_path()
            .ok_or_else(|| rusqlite::Error::InvalidPath(PathBuf::from("~/.synapse/library.db")))?;
        Self::open(db_path)
    }

    /// Open or create database at a specific path.
    pub fn open<P: AsRef<Path>>(path: P) -> rusqlite::Result<Self> {
        let path_ref = path.as_ref();
        if let Some(parent) = path_ref.parent() {
            if !parent.as_os_str().is_empty() && !parent.exists() {
                let _ = fs::create_dir_all(parent);
            }
        }

        let conn = Connection::open(path_ref)?;
        let db = Self::from_connection(conn)?;

        if let Some(parent) = path_ref.parent() {
            let _ = db.migrate_legacy_if_empty(parent);
        }

        Ok(db)
    }

    /// In-memory database for testing and ephemeral workloads.
    pub fn in_memory() -> rusqlite::Result<Self> {
        let conn = Connection::open_in_memory()?;
        Self::from_connection(conn)
    }

    /// Initialize schema from an existing connection.
    pub fn from_connection(conn: Connection) -> rusqlite::Result<Self> {
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> rusqlite::Result<()> {
        let conn = self.conn.lock();
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA cache_size = -1000;
            PRAGMA temp_store = MEMORY;

            CREATE TABLE IF NOT EXISTS tracks (
                file_path TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                genre TEXT NOT NULL,
                mood TEXT NOT NULL,
                bpm REAL NOT NULL,
                key_signature TEXT NOT NULL,
                duration_sec REAL NOT NULL,
                waveform_blob BLOB NOT NULL,
                size INTEGER NOT NULL,
                mod_time INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
                track_path TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                PRIMARY KEY (playlist_id, track_path)
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_playlist_tracks_order 
                ON playlist_tracks(playlist_id, sort_order);",
        )?;
        Ok(())
    }

    /// Migrate legacy cache.json and playlists.json if tracks table is empty.
    pub fn migrate_legacy_if_empty<P: AsRef<Path>>(&self, base_dir: P) -> rusqlite::Result<()> {
        let base = base_dir.as_ref();
        let track_count: i64 = {
            let conn = self.conn.lock();
            conn.query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))?
        };

        if track_count > 0 {
            return Ok(());
        }

        let cache_path = base.join("cache.json");
        let playlists_path = base.join("playlists.json");

        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;

        if cache_path.exists() {
            if let Ok(bytes) = fs::read(&cache_path) {
                if let Ok(entries) = serde_json::from_slice::<Vec<LegacyCacheEntry>>(&bytes) {
                    let mut stmt = tx.prepare(
                        "INSERT OR REPLACE INTO tracks (
                            file_path, title, artist, genre, mood, bpm,
                            key_signature, duration_sec, waveform_blob, size, mod_time
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    )?;

                    for entry in entries {
                        let mood = if entry.mood.is_empty() {
                            determine_mood(entry.bpm, &entry.key_signature, &entry.genre)
                        } else {
                            entry.mood
                        };
                        let wf_blob = encode_waveform(&entry.waveform);

                        stmt.execute(params![
                            entry.file_path,
                            entry.title,
                            entry.artist,
                            entry.genre,
                            mood,
                            entry.bpm,
                            entry.key_signature,
                            entry.duration_sec,
                            wf_blob,
                            entry.size,
                            entry.mod_time,
                        ])?;
                    }
                }
            }
        }

        if playlists_path.exists() {
            if let Ok(bytes) = fs::read(&playlists_path) {
                if let Ok(playlists) = serde_json::from_slice::<Vec<LegacyPlaylist>>(&bytes) {
                    for p in playlists {
                        let playlist_id = {
                            let mut stmt = tx.prepare(
                                "INSERT INTO playlists (name) VALUES (?1)
                                 ON CONFLICT(name) DO UPDATE SET name = excluded.name
                                 RETURNING id",
                            )?;
                            stmt.query_row(params![p.name], |row| row.get::<_, i64>(0))?
                        };

                        let mut track_stmt = tx.prepare(
                            "INSERT OR REPLACE INTO playlist_tracks (playlist_id, track_path, sort_order)
                             VALUES (?1, ?2, ?3)",
                        )?;

                        for (idx, track_path) in p.track_paths.into_iter().enumerate() {
                            track_stmt.execute(params![playlist_id, track_path, idx as i64])?;
                        }
                    }
                }
            }
        }

        tx.commit()?;
        drop(conn);
        self.shrink_memory();
        Ok(())
    }

    /// Reclaim memory held by SQLite statement caches, page cache, and schemas.
    pub fn shrink_memory(&self) {
        let conn = self.conn.lock();
        let _ = conn.execute_batch("PRAGMA shrink_memory;");
    }

    pub fn get_all_tracks(&self) -> rusqlite::Result<Vec<TrackRecord>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT file_path, title, artist, genre, mood, bpm, key_signature,
                    duration_sec, waveform_blob, size, mod_time
             FROM tracks
             ORDER BY artist ASC, title ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            let blob: Vec<u8> = row.get(8)?;
            Ok(TrackRecord {
                file_path: row.get(0)?,
                title: row.get(1)?,
                artist: row.get(2)?,
                genre: row.get(3)?,
                mood: row.get(4)?,
                bpm: row.get(5)?,
                key_signature: row.get(6)?,
                duration_sec: row.get(7)?,
                waveform: decode_waveform(&blob),
                size: row.get(9)?,
                mod_time: row.get(10)?,
            })
        })?;

        let mut tracks = Vec::new();
        for track in rows {
            tracks.push(track?);
        }
        Ok(tracks)
    }

    pub fn get_track(&self, path: &str) -> rusqlite::Result<Option<TrackRecord>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT file_path, title, artist, genre, mood, bpm, key_signature,
                    duration_sec, waveform_blob, size, mod_time
             FROM tracks
             WHERE file_path = ?1",
        )?;

        let track = stmt
            .query_row(params![path], |row| {
                let blob: Vec<u8> = row.get(8)?;
                Ok(TrackRecord {
                    file_path: row.get(0)?,
                    title: row.get(1)?,
                    artist: row.get(2)?,
                    genre: row.get(3)?,
                    mood: row.get(4)?,
                    bpm: row.get(5)?,
                    key_signature: row.get(6)?,
                    duration_sec: row.get(7)?,
                    waveform: decode_waveform(&blob),
                    size: row.get(9)?,
                    mod_time: row.get(10)?,
                })
            })
            .optional()?;

        Ok(track)
    }

    pub fn upsert_track(&self, track: &TrackRecord) -> rusqlite::Result<()> {
        let conn = self.conn.lock();
        let wf_blob = encode_waveform(&track.waveform);

        conn.execute(
            "INSERT INTO tracks (
                file_path, title, artist, genre, mood, bpm,
                key_signature, duration_sec, waveform_blob, size, mod_time
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            ON CONFLICT(file_path) DO UPDATE SET
                title = excluded.title,
                artist = excluded.artist,
                genre = excluded.genre,
                mood = excluded.mood,
                bpm = excluded.bpm,
                key_signature = excluded.key_signature,
                duration_sec = excluded.duration_sec,
                waveform_blob = excluded.waveform_blob,
                size = excluded.size,
                mod_time = excluded.mod_time",
            params![
                track.file_path,
                track.title,
                track.artist,
                track.genre,
                track.mood,
                track.bpm,
                track.key_signature,
                track.duration_sec,
                wf_blob,
                track.size,
                track.mod_time,
            ],
        )?;

        Ok(())
    }

    pub fn delete_track(&self, path: &str) -> rusqlite::Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM playlist_tracks WHERE track_path = ?1", params![path])?;
        conn.execute("DELETE FROM tracks WHERE file_path = ?1", params![path])?;
        Ok(())
    }

    pub fn get_playlists(&self) -> rusqlite::Result<Vec<PlaylistRecord>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT id, name FROM playlists ORDER BY name ASC")?;
        let playlist_pairs: Vec<(i64, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;

        let mut track_stmt = conn.prepare(
            "SELECT track_path FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY sort_order ASC",
        )?;

        let mut playlists = Vec::with_capacity(playlist_pairs.len());
        for (id, name) in playlist_pairs {
            let track_paths = track_stmt
                .query_map(params![id], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;

            playlists.push(PlaylistRecord {
                id,
                name,
                track_paths,
            });
        }

        Ok(playlists)
    }

    pub fn create_playlist(&self, name: &str) -> rusqlite::Result<i64> {
        let conn = self.conn.lock();
        conn.execute("INSERT INTO playlists (name) VALUES (?1)", params![name])?;
        Ok(conn.last_insert_rowid())
    }

    pub fn delete_playlist(&self, name: &str) -> rusqlite::Result<()> {
        let conn = self.conn.lock();
        let rows_affected = conn.execute("DELETE FROM playlists WHERE name = ?1", params![name])?;
        if rows_affected == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn add_track_to_playlist(&self, playlist_name: &str, track_path: &str) -> rusqlite::Result<()> {
        let conn = self.conn.lock();
        let playlist_id: i64 = conn.query_row(
            "SELECT id FROM playlists WHERE name = ?1",
            params![playlist_name],
            |row| row.get(0),
        )?;

        let already_exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?1 AND track_path = ?2",
            params![playlist_id, track_path],
            |row| row.get(0),
        )?;

        if already_exists > 0 {
            return Ok(());
        }

        let next_sort_order: i64 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )?;

        conn.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_path, sort_order) VALUES (?1, ?2, ?3)",
            params![playlist_id, track_path, next_sort_order],
        )?;

        Ok(())
    }

    pub fn remove_track_from_playlist(&self, playlist_name: &str, track_path: &str) -> rusqlite::Result<()> {
        let conn = self.conn.lock();
        let playlist_id: i64 = conn.query_row(
            "SELECT id FROM playlists WHERE name = ?1",
            params![playlist_name],
            |row| row.get(0),
        )?;

        let rows_affected = conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_path = ?2",
            params![playlist_id, track_path],
        )?;

        if rows_affected == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> rusqlite::Result<Option<String>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let res = stmt.query_row(params![key], |row| row.get(0)).optional()?;
        Ok(res)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn make_test_track(path: &str, title: &str) -> TrackRecord {
        TrackRecord {
            file_path: path.to_string(),
            title: title.to_string(),
            artist: "Artist".to_string(),
            genre: "Synthwave".to_string(),
            mood: "energetic".to_string(),
            bpm: 128.0,
            key_signature: "8A".to_string(),
            duration_sec: 210.5,
            waveform: vec![0.1, 0.5, 0.9, 0.2],
            size: 1048576,
            mod_time: 1700000000,
        }
    }

    #[test]
    fn test_track_crud() {
        let db = LibraryDb::in_memory().expect("in-memory db");
        let track = make_test_track("/music/cyber.mp3", "Night City");

        db.upsert_track(&track).expect("upsert track");

        let fetched = db.get_track("/music/cyber.mp3").expect("get track");
        assert!(fetched.is_some());
        let fetched = fetched.unwrap();
        assert_eq!(fetched.title, "Night City");
        assert_eq!(fetched.bpm, 128.0);
        assert_eq!(fetched.waveform, vec![0.1, 0.5, 0.9, 0.2]);

        // Upsert update
        let mut updated = track.clone();
        updated.title = "Night City 2.0".to_string();
        db.upsert_track(&updated).expect("update track");

        let all = db.get_all_tracks().expect("get all tracks");
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].title, "Night City 2.0");

        // Delete track
        db.delete_track("/music/cyber.mp3").expect("delete track");
        assert!(db.get_track("/music/cyber.mp3").expect("get track").is_none());
        assert!(db.get_all_tracks().expect("get all").is_empty());
    }

    #[test]
    fn test_playlist_crud_and_ordering() {
        let db = LibraryDb::in_memory().expect("in-memory db");

        let id = db.create_playlist("Cyber Vibes").expect("create playlist");
        assert!(id > 0);

        db.add_track_to_playlist("Cyber Vibes", "/music/track1.mp3")
            .expect("add track 1");
        db.add_track_to_playlist("Cyber Vibes", "/music/track2.mp3")
            .expect("add track 2");

        // Adding duplicate track is a no-op
        db.add_track_to_playlist("Cyber Vibes", "/music/track1.mp3")
            .expect("re-add track 1");

        let playlists = db.get_playlists().expect("get playlists");
        assert_eq!(playlists.len(), 1);
        assert_eq!(playlists[0].name, "Cyber Vibes");
        assert_eq!(
            playlists[0].track_paths,
            vec!["/music/track1.mp3", "/music/track2.mp3"]
        );

        // Remove track
        db.remove_track_from_playlist("Cyber Vibes", "/music/track1.mp3")
            .expect("remove track 1");
        let playlists = db.get_playlists().expect("get playlists");
        assert_eq!(playlists[0].track_paths, vec!["/music/track2.mp3"]);

        // Delete playlist
        db.delete_playlist("Cyber Vibes").expect("delete playlist");
        assert!(db.get_playlists().expect("get playlists").is_empty());
    }

    #[test]
    fn test_legacy_migration() {
        let dir = tempdir().expect("tempdir");
        let cache_json = r#"[
            {
                "filePath": "/legacy/track1.mp3",
                "title": "Legacy One",
                "artist": "Old School",
                "genre": "electronic",
                "bpm": 120.0,
                "keySignature": "8A",
                "durationSec": 150.0,
                "waveform": [0.2, 0.4, 0.6],
                "size": 2048,
                "modTime": 1600000000,
                "mood": ""
            }
        ]"#;

        let playlists_json = r#"[
            {
                "name": "Classics",
                "trackPaths": ["/legacy/track1.mp3"]
            }
        ]"#;

        fs::write(dir.path().join("cache.json"), cache_json).expect("write cache.json");
        fs::write(dir.path().join("playlists.json"), playlists_json).expect("write playlists.json");

        let db = LibraryDb::in_memory().expect("in-memory db");
        db.migrate_legacy_if_empty(dir.path()).expect("migrate");

        let tracks = db.get_all_tracks().expect("get tracks");
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, "Legacy One");
        // Empty mood in legacy cache was computed via determine_mood(120, "8A", "electronic") -> "energetic"
        assert_eq!(tracks[0].mood, "energetic");
        assert_eq!(tracks[0].waveform, vec![0.2, 0.4, 0.6]);

        let playlists = db.get_playlists().expect("get playlists");
        assert_eq!(playlists.len(), 1);
        assert_eq!(playlists[0].name, "Classics");
        assert_eq!(playlists[0].track_paths, vec!["/legacy/track1.mp3"]);
    }

    #[test]
    fn test_settings_persistence() {
        let db = LibraryDb::in_memory().expect("in-memory db");
        assert_eq!(db.get_setting("theme").unwrap(), None);

        db.set_setting("theme", "Arasaka").unwrap();
        assert_eq!(db.get_setting("theme").unwrap(), Some("Arasaka".to_string()));

        db.set_setting("theme", "Netrunner").unwrap();
        assert_eq!(db.get_setting("theme").unwrap(), Some("Netrunner".to_string()));
    }
}
