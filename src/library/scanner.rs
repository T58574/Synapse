use std::ffi::{CStr, CString};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use tokio::sync::Semaphore;

use crate::audio::{ffi, AudioManager, TrackAnalysis};
use super::db::{LibraryDb, TrackRecord};
use super::metadata::{determine_mood, extract_metadata};

/// Checks if a file path is a supported audio extension (.mp3, .wav, .flac).
pub fn is_supported_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let lower = ext.to_lowercase();
            lower == "mp3" || lower == "wav" || lower == "flac"
        })
        .unwrap_or(false)
}

/// Recursively gathers all supported audio files within a directory.
pub fn collect_audio_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut stack = vec![dir.to_path_buf()];

    while let Some(current_dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&current_dir) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if is_supported_audio(&path) {
                files.push(path);
            }
        }
    }

    files.sort();
    files
}

/// Extract audio analysis (duration, bpm, key, waveform) directly via C++ FFI.
pub fn analyze_audio_file(file_path: &str) -> Option<TrackAnalysis> {
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

#[derive(Clone)]
pub struct LibraryScanner {
    db: LibraryDb,
    audio: Option<AudioManager>,
}

impl LibraryScanner {
    pub fn new(db: LibraryDb, audio: Option<AudioManager>) -> Self {
        Self { db, audio }
    }

    pub fn default_music_dir() -> Option<PathBuf> {
        LibraryDb::default_dir()
    }

    /// Synchronously analyze a single audio file and construct a TrackRecord.
    pub fn analyze_single_file(
        &self,
        path: &Path,
        size: i64,
        mod_time: i64,
    ) -> Option<TrackRecord> {
        let path_str = path.to_string_lossy().to_string();

        let analysis = if let Some(audio) = &self.audio {
            audio.analyze_file(&path_str)
        } else {
            analyze_audio_file(&path_str)
        }?;

        if analysis.duration_sec <= 0.0 {
            return None;
        }

        let metadata = extract_metadata(path);
        let mood = determine_mood(analysis.bpm, &analysis.key_signature, &metadata.genre);

        Some(TrackRecord {
            file_path: path_str,
            title: metadata.title,
            artist: metadata.artist,
            genre: metadata.genre,
            mood,
            bpm: analysis.bpm,
            key_signature: analysis.key_signature,
            duration_sec: analysis.duration_sec,
            waveform: analysis.waveform,
            size,
            mod_time,
        })
    }

    /// Fast async parallel directory scanner.
    /// Files matching cached size & mod_time skip audio decoding.
    pub async fn scan_directory(&self, dir: &Path) -> std::io::Result<Vec<TrackRecord>> {
        if !dir.exists() {
            return Ok(Vec::new());
        }

        let audio_files = collect_audio_files(dir);
        let mut final_tracks = Vec::with_capacity(audio_files.len());
        let mut to_analyze = Vec::new();

        for file in audio_files {
            let metadata = match fs::metadata(&file) {
                Ok(m) => m,
                Err(_) => continue,
            };

            let size = metadata.len() as i64;
            let mod_time = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);

            let path_str = file.to_string_lossy().to_string();

            if let Ok(Some(cached)) = self.db.get_track(&path_str) {
                if cached.size == size && cached.mod_time == mod_time {
                    // Cache hit - audio decoding skipped!
                    if cached.title.is_empty()
                        || cached.artist == "Unknown Artist"
                        || cached.mood.is_empty()
                    {
                        let meta = extract_metadata(&file);
                        let mood = if cached.mood.is_empty() {
                            determine_mood(cached.bpm, &cached.key_signature, &meta.genre)
                        } else {
                            cached.mood.clone()
                        };

                        let updated = TrackRecord {
                            title: if cached.title.is_empty() {
                                meta.title
                            } else {
                                cached.title
                            },
                            artist: if cached.artist == "Unknown Artist"
                                && meta.artist != "Unknown Artist"
                            {
                                meta.artist
                            } else {
                                cached.artist
                            },
                            genre: if cached.genre == "Unknown Genre"
                                && meta.genre != "Unknown Genre"
                            {
                                meta.genre
                            } else {
                                cached.genre
                            },
                            mood,
                            ..cached
                        };
                        let _ = self.db.upsert_track(&updated);
                        final_tracks.push(updated);
                    } else {
                        final_tracks.push(cached);
                    }
                    continue;
                }
            }

            to_analyze.push((file, size, mod_time));
        }

        if !to_analyze.is_empty() {
            let concurrency = std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(4);
            let semaphore = Arc::new(Semaphore::new(concurrency));
            let mut join_handles = Vec::with_capacity(to_analyze.len());

            for (path, size, mod_time) in to_analyze {
                let sem = semaphore.clone();
                let scanner = self.clone();

                let handle = tokio::spawn(async move {
                    let _permit = sem.acquire().await.ok();
                    tokio::task::spawn_blocking(move || {
                        scanner.analyze_single_file(&path, size, mod_time)
                    })
                    .await
                    .ok()
                    .flatten()
                });

                join_handles.push(handle);
            }

            for handle in join_handles {
                if let Ok(Some(track)) = handle.await {
                    let _ = self.db.upsert_track(&track);
                    final_tracks.push(track);
                }
            }
        }

        final_tracks.sort_by(|a, b| a.artist.cmp(&b.artist).then_with(|| a.title.cmp(&b.title)));
        Ok(final_tracks)
    }

    /// Scan default directory `~/.synapse`.
    pub async fn scan_default(&self) -> std::io::Result<Vec<TrackRecord>> {
        let dir = Self::default_music_dir().ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Could not locate ~/.synapse music directory",
            )
        })?;
        self.scan_directory(&dir).await
    }
}
