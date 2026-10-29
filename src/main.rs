pub mod audio;
pub mod library;
pub mod state;
pub mod ui_bridge;

slint::include_modules!();

use audio::AudioManager;
use library::{LibraryDb, LibraryManager};
use state::PlayerState;
use std::sync::Arc;
use parking_lot::Mutex;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize Slint Main Window FIRST on the main thread.
    // This allows winit/Slint to invoke OleInitialize() on Windows without
    // RPC_E_CHANGED_MODE COM concurrency collisions.
    let main_window = MainWindow::new()?;

    // 2. Initialize Tokio runtime for async file scanning and background workers
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .thread_stack_size(1024 * 1024)
        .enable_all()
        .build()?;
    let tokio_handle = rt.handle().clone();

    // 3. Initialize Audio Engine FFI
    let audio_manager = AudioManager::new(44100, 2)
        .map_err(|e| format!("Failed to initialize audio engine: {}", e))?;

    // 4. Initialize SQLite Database & Library Manager
    let db = LibraryDb::open_default()?;
    let library_manager = LibraryManager::new(db, Some(audio_manager.clone()));

    // 5. Initialize Player State
    let player_state = Arc::new(Mutex::new(PlayerState::new(audio_manager.clone())));

    // 6. Connect UI Bridge
    ui_bridge::setup_ui_bridge(
        &main_window,
        audio_manager,
        library_manager.clone(),
        player_state,
        tokio_handle.clone(),
    );

    // 7. Initial background scan of default music folder (~/.synapse)
    let lib_for_scan = library_manager.clone();
    tokio_handle.spawn(async move {
        let _ = lib_for_scan.scan_default().await;
        lib_for_scan.shrink_memory();
    });

    // 8. Run Slint event loop
    main_window.run()?;

    Ok(())
}
