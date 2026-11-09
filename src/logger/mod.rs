//! Application-wide logging infrastructure for Synapse.
//!
//! Provides a standard `log` crate implementation backed by `LogHandler`,
//! rotating daily log files in `~/.synapse/logs`, retaining 7 days of history,
//! and automatically cleaning older logs.

pub mod handler;
pub use handler::LogHandler;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use parking_lot::Mutex;

static INITIALIZED: AtomicBool = AtomicBool::new(false);
static HANDLER_REF: Mutex<Option<Arc<Mutex<LogHandler>>>> = Mutex::new(None);

pub struct SynapseLogger {
    handler: Arc<Mutex<LogHandler>>,
    level: log::LevelFilter,
}

impl SynapseLogger {
    pub fn new(handler: Arc<Mutex<LogHandler>>, level: log::LevelFilter) -> Self {
        Self { handler, level }
    }
}

impl log::Log for SynapseLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= self.level
    }

    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }

        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let level_str = match record.level() {
            log::Level::Error => "ERROR",
            log::Level::Warn => "WARN ",
            log::Level::Info => "INFO ",
            log::Level::Debug => "DEBUG",
            log::Level::Trace => "TRACE",
        };

        let formatted = format!(
            "[{timestamp}] [{level_str}] [{}] {}",
            record.target(),
            record.args()
        );

        // Best effort write to stderr (safe on Windows when GUI app has no console)
        let mut stderr = std::io::stderr();
        let _ = std::io::Write::write_all(&mut stderr, formatted.as_bytes());
        let _ = std::io::Write::write_all(&mut stderr, b"\n");

        self.handler.lock().write_entry(&formatted);
    }

    fn flush(&self) {
        // LogHandler flushes immediately on each write_entry
    }
}

/// Initialize the global logger with automatic 7-day retention file handler
/// and install the crash panic hook.
pub fn init() {
    if INITIALIZED.swap(true, Ordering::SeqCst) {
        return;
    }

    let level = std::env::var("SYNAPSE_LOG")
        .or_else(|_| std::env::var("RUST_LOG"))
        .ok()
        .and_then(|val| match val.to_lowercase().as_str() {
            "trace" => Some(log::LevelFilter::Trace),
            "debug" => Some(log::LevelFilter::Debug),
            "info" => Some(log::LevelFilter::Info),
            "warn" => Some(log::LevelFilter::Warn),
            "error" => Some(log::LevelFilter::Error),
            "off" => Some(log::LevelFilter::Off),
            _ => None,
        })
        .unwrap_or(log::LevelFilter::Info);

    let handler = Arc::new(Mutex::new(LogHandler::new(LogHandler::default_dir())));

    // Run startup cleanup of stale log files
    handler.lock().cleanup_old_logs();

    *HANDLER_REF.lock() = Some(handler.clone());

    let logger = SynapseLogger::new(handler, level);
    if let Err(err) = log::set_boxed_logger(Box::new(logger)) {
        eprintln!("Failed to set Synapse logger: {err}");
    }
    log::set_max_level(level);

    install_panic_hook();

    log::info!("---- synapse start (v{}) ----", env!("CARGO_PKG_VERSION"));
    log::info!(
        "logging initialized: retention={} days, dir={}",
        handler::DEFAULT_RETENTION_DAYS,
        LogHandler::default_dir().display()
    );
}

fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        log::error!("PANIC at {location}: {info}");
        default_hook(info);
    }));
}

/// Active daily log file path (e.g. `~/.synapse/logs/synapse-2026-11-08.log`).
pub fn current_log_path() -> PathBuf {
    if let Some(handler) = HANDLER_REF.lock().as_ref() {
        handler.lock().current_log_path()
    } else {
        LogHandler::default_dir().join(format!(
            "{}-{}{}",
            handler::LOG_PREFIX,
            chrono::Local::now().format("%Y-%m-%d"),
            handler::LOG_EXT
        ))
    }
}

/// Active log directory (`~/.synapse/logs`).
pub fn log_dir() -> PathBuf {
    LogHandler::default_dir()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_synapse_logger_formatting() {
        let dir = tempdir().unwrap();
        let handler = Arc::new(Mutex::new(LogHandler::new(dir.path().to_path_buf())));
        let logger = SynapseLogger::new(handler.clone(), log::LevelFilter::Debug);

        use log::Log;
        let record = log::Record::builder()
            .args(format_args!("hello test world"))
            .level(log::Level::Info)
            .target("synapse::test")
            .build();

        logger.log(&record);

        let path = handler.lock().current_log_path();
        assert!(path.exists());
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("[INFO ]"));
        assert!(content.contains("[synapse::test]"));
        assert!(content.contains("hello test world"));
    }
}
