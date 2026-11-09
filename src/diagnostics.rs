//! Crash-safe diagnostics: legacy facade redirecting to the central logger.
//!
//! A GPUI app started from Explorer has no console, so everything notable
//! is appended to daily log files in `~/.synapse/logs/` (and mirrored to stderr
//! when a console exists).

use std::path::PathBuf;

/// Active log file path for the current day.
pub fn log_path() -> PathBuf {
    crate::logger::current_log_path()
}

/// Active log directory (`~/.synapse/logs`).
pub fn log_dir() -> PathBuf {
    crate::logger::log_dir()
}

/// Append one timestamped line through the central logger. Never panics.
pub fn line(message: &str) {
    log::info!("{message}");
}

/// Initialize the central logger with automatic 7-day retention and install panic hook.
pub fn install() {
    crate::logger::init();
}
