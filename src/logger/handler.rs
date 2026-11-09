//! Rotating daily file log handler with automatic 7-day retention and cleanup.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

pub const DEFAULT_RETENTION_DAYS: u64 = 7;
pub const MAX_LOG_FILE_BYTES: u64 = 10 * 1024 * 1024; // 10 MB limit per file
pub const LOG_PREFIX: &str = "synapse";
pub const LOG_EXT: &str = ".log";

/// Manages log files on disk, handles daily rotation, and auto-cleans logs older than retention period.
pub struct LogHandler {
    log_dir: PathBuf,
    retention_days: u64,
    max_file_bytes: u64,
    current_date: String,
    current_file: Option<File>,
}

impl LogHandler {
    /// Create a new log handler targeting `log_dir`.
    pub fn new(log_dir: PathBuf) -> Self {
        Self {
            log_dir,
            retention_days: DEFAULT_RETENTION_DAYS,
            max_file_bytes: MAX_LOG_FILE_BYTES,
            current_date: String::new(),
            current_file: None,
        }
    }

    /// Override the log retention window in days.
    pub fn with_retention(mut self, days: u64) -> Self {
        self.retention_days = days;
        self
    }

    /// Override the maximum log file size in bytes before cleanup.
    pub fn with_max_bytes(mut self, max_bytes: u64) -> Self {
        self.max_file_bytes = max_bytes;
        self
    }

    /// Default log directory: `~/.synapse/logs`.
    pub fn default_dir() -> PathBuf {
        let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        base.join(".synapse").join("logs")
    }

    /// Current target log directory.
    pub fn log_dir(&self) -> &Path {
        &self.log_dir
    }

    /// Path to the active daily log file.
    pub fn current_log_path(&self) -> PathBuf {
        let date = if self.current_date.is_empty() {
            chrono::Local::now().format("%Y-%m-%d").to_string()
        } else {
            self.current_date.clone()
        };
        self.log_dir.join(format!("{}-{}{}", LOG_PREFIX, date, LOG_EXT))
    }

    /// Write a pre-formatted entry to the active daily log file.
    ///
    /// Automatically handles daily rotation and cleanup when the calendar date changes.
    /// Never panics on I/O failure.
    pub fn write_entry(&mut self, entry: &str) {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();

        if self.current_file.is_none() || self.current_date != today {
            // Drop existing file handle before rotation/cleanup
            self.current_file = None;
            self.current_date = today.clone();

            // Ensure directory exists
            let _ = fs::create_dir_all(&self.log_dir);

            // Clean up logs older than retention period
            self.cleanup_old_logs();

            // Open or create current day's log file in append mode
            let file_path = self.current_log_path();
            self.current_file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(file_path)
                .ok();
        }

        if let Some(file) = &mut self.current_file {
            let _ = writeln!(file, "{entry}");
            let _ = file.flush();
        }
    }

    /// Scans the log directory and deletes any log files older than `retention_days` (default 7 days)
    /// or files that exceed `max_file_bytes`.
    pub fn cleanup_old_logs(&self) {
        if !self.log_dir.exists() {
            return;
        }

        let Ok(entries) = fs::read_dir(&self.log_dir) else {
            return;
        };

        let today = chrono::Local::now().date_naive();
        let retention_duration = Duration::from_secs(self.retention_days.saturating_mul(86_400));
        let now_system = SystemTime::now();
        let active_log = self.current_log_path();

        for entry in entries.flatten() {
            let path = entry.path();

            // Never delete the currently active log file
            if path == active_log {
                continue;
            }

            // Only inspect files, skip directories
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !file_type.is_file() {
                continue;
            }

            let file_name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n,
                None => continue,
            };

            // Check if this is a log file (*.log or *.log.*)
            if !file_name.ends_with(LOG_EXT) && !file_name.contains(".log.") {
                continue;
            }

            let mut should_delete = false;

            // 1. Try to extract date from filename: e.g. synapse-2026-11-08.log
            if let Some(date_part) = extract_date_from_filename(file_name) {
                if let Ok(file_date) = chrono::NaiveDate::parse_from_str(&date_part, "%Y-%m-%d") {
                    let age_days = today.signed_duration_since(file_date).num_days();
                    if age_days >= self.retention_days as i64 {
                        should_delete = true;
                    }
                }
            } else {
                // Fallback to file modification time if filename date could not be parsed
                if let Ok(metadata) = entry.metadata() {
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(age) = now_system.duration_since(modified) {
                            if age >= retention_duration {
                                should_delete = true;
                            }
                        }
                    }
                }
            }

            // Check if file exceeds max size limit (e.g. 10 MB)
            if !should_delete {
                if let Ok(metadata) = entry.metadata() {
                    if metadata.len() > self.max_file_bytes {
                        should_delete = true;
                    }
                }
            }

            if should_delete {
                let _ = fs::remove_file(&path);
            }
        }
    }
}

/// Helper to parse YYYY-MM-DD from filenames like `synapse-2026-11-08.log`.
pub fn extract_date_from_filename(name: &str) -> Option<String> {
    let stem = name.strip_suffix(LOG_EXT).unwrap_or(name);
    if let Some(rest) = stem.strip_prefix(LOG_PREFIX) {
        let candidate = rest.trim_start_matches(['-', '_']);
        if candidate.len() == 10 && candidate.chars().all(|c| c.is_ascii_digit() || c == '-') {
            return Some(candidate.to_string());
        }
    }
    if stem.len() == 10 && stem.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Some(stem.to_string());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_extract_date_from_filename() {
        assert_eq!(
            extract_date_from_filename("synapse-2026-11-08.log"),
            Some("2026-11-08".to_string())
        );
        assert_eq!(
            extract_date_from_filename("synapse_2026-11-08.log"),
            Some("2026-11-08".to_string())
        );
        assert_eq!(
            extract_date_from_filename("2026-11-08.log"),
            Some("2026-11-08".to_string())
        );
        assert_eq!(extract_date_from_filename("synapse.log"), None);
        assert_eq!(extract_date_from_filename("random.txt"), None);
    }

    #[test]
    fn test_log_handler_writes_entry() {
        let dir = tempdir().unwrap();
        let mut handler = LogHandler::new(dir.path().to_path_buf());

        handler.write_entry("test log message 123");

        let log_path = handler.current_log_path();
        assert!(log_path.exists());
        let content = fs::read_to_string(&log_path).unwrap();
        assert!(content.contains("test log message 123"));
    }

    #[test]
    fn test_cleanup_removes_old_files() {
        let dir = tempdir().unwrap();
        let log_dir = dir.path().to_path_buf();

        // Create a 10-day old log file
        let old_date = (chrono::Local::now().date_naive() - chrono::Duration::days(10))
            .format("%Y-%m-%d")
            .to_string();
        let old_file = log_dir.join(format!("{LOG_PREFIX}-{old_date}{LOG_EXT}"));
        fs::write(&old_file, "old log content").unwrap();

        // Create a 3-day old log file
        let recent_date = (chrono::Local::now().date_naive() - chrono::Duration::days(3))
            .format("%Y-%m-%d")
            .to_string();
        let recent_file = log_dir.join(format!("{LOG_PREFIX}-{recent_date}{LOG_EXT}"));
        fs::write(&recent_file, "recent log content").unwrap();

        // Create a non-log file
        let other_file = log_dir.join("notes.txt");
        fs::write(&other_file, "do not delete").unwrap();

        let handler = LogHandler::new(log_dir.clone()).with_retention(7);
        handler.cleanup_old_logs();

        assert!(!old_file.exists(), "Files older than 7 days should be removed");
        assert!(recent_file.exists(), "Files within 7 days should be kept");
        assert!(other_file.exists(), "Non-log files should not be touched");
    }
}
