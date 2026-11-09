//! Small value types shared between the state entity and the views.

use gpui_kit::*;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum View {
    Library,
    Artists,
    Settings,
}

/// Work handed back from a Tokio / blocking task to the UI thread.
pub enum UiMsg {
    LibraryChanged,
    ScanFailed(String),
    Cover {
        path: String,
        image: Option<Arc<Image>>,
    },
    FolderPicked(Option<PathBuf>),
}

/// Mirror of what the bottom deck shows. Owned by `AppState`, read by the views.
#[derive(Default)]
pub struct Playback {
    pub title: String,
    pub artist: String,
    pub album_meta: String,
    pub bpm: f64,
    pub key: String,
    pub duration: f64,
    pub position: f64,
    pub playing: bool,
    pub cover: Option<Arc<Image>>,
}
