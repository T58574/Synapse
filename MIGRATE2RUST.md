# Synapse: Migration Blueprint to Rust + Slint

> **Purpose**: This specification guides the complete architectural rewrite of Synapse from the hybrid Go + Wails (WebView2/Chromium) + React stack to a native **Rust + Slint + C++ DSP** stack.
>
> **Core Objective**: Reduce memory usage from **~500 MB** down to **<30 MB**, reduce active CPU usage from **~9%** down to **<1%**, and eliminate all IPC/JSON serialization overhead.

---

## 1. Architectural Transformation

### Current Architecture (Legacy)
```text
[C++ Audio Engine]
       ↕ (Cgo - goroutine stack switches)
[Go Backend (Wails)]
       ↕ (Wails IPC: JSON over OS pipe/socket @ 60 FPS)
[Microsoft Edge WebView2 (Chromium Blink + V8 + GPU Process ~500MB)]
       ↕
[React 18 + TypeScript + WebGL Fragment Shader]
```

### Target Architecture (Rust + Slint)
```text
[C++ Audio Engine (miniaudio + Signalsmith Stretch)]
       ↕ (Zero-Cost FFI via cc / cxx / extern "C")
[Rust Core Engine (Audio Threading, Scanner, SQLite / Fjall)]
       ↕ (Native Rust function calls & reactive Slint properties)
[Slint UI Engine (.slint compiled to native Rust structs)]
       ↕
[GPU Hardware Renderer (FemtoVG / Skia: DirectX 11 / Vulkan / Metal)]
```

---

## 2. Target Technology Stack

| Layer | Component | Crates / Libraries | Notes |
| :--- | :--- | :--- | :--- |
| **GUI Framework** | Slint 1.x | `slint = "1.8"`, `slint-build = "1.8"` | Native declarative GUI, compiles to Rust code. Zero HTML/CSS/DOM. |
| **GUI Rendering** | GPU Renderer | Skia or FemtoVG backend (default in Slint) | DirectX 11 / Vulkan native rendering on Windows. |
| **C++ Audio FFI** | Bridge | `cc = "1.0"` or `cxx = "1.0"` | Compiles `audio_engine.cpp` directly with MSVC/GCC/Clang. Zero-cost calls. |
| **Audio Metadata** | ID3 / FLAC / Vorbis | `lofty = "0.21"` or `symphonia = "0.5"` | Ultra-fast metadata and embedded cover extraction without Cgo or external tools. |
| **Local Database** | Library Cache | `rusqlite = { version = "0.31", features = ["bundled"] }` | Replaces `cache.json` with an atomic SQLite database. |
| **Concurrency** | Async Runtime | `tokio = { version = "1", features = ["full"] }` or `rayon` | Parallel file scanning and non-blocking background analysis. |
| **Audio Core** | Existing DSP Engine | `backend/audio_engine.cpp`, `miniaudio.h`, `signalsmith-stretch.h` | Keep existing, tested C++ DSP engine; link directly to Rust. |

---

## 3. Directory Layout (Target Workspace)

```text
Synapse/
├── Cargo.toml                  # Cargo workspace manifest
├── build.rs                    # Slint compiler & C++ audio engine compilation (via cc)
├── src/
│   ├── main.rs                 # App entry point, Slint event loop initialization
│   ├── audio/
│   │   ├── mod.rs              # Safe Rust audio manager API
│   │   ├── ffi.rs              # extern "C" bindings to audio_engine.cpp
│   │   └── types.rs            # Rust mirrors of TrackMetadata, SpectrumData
│   ├── library/
│   │   ├── mod.rs              # Library manager
│   │   ├── scanner.rs          # Directory walker & audio analyzer (Rayon / Tokio)
│   │   ├── metadata.rs         # Lofty ID3/FLAC tag parser & cover art extractor
│   │   └── db.rs               # SQLite storage for track cache and playlists
│   ├── state/
│   │   ├── mod.rs              # Global application state & models
│   │   └── player.rs           # Playback controller (active slot, automix, volume)
│   └── ui_bridge.rs            # Synchronization between Rust state and Slint models
├── ui/
│   ├── main.slint              # Main application window
│   ├── theme.slint             # Cyberpunk design system (Night City, Arasaka, Netrunner)
│   ├── components/
│   │   ├── button.slint        # Custom chamfered cyber buttons
│   │   ├── slider.slint        # Neon volume/track seeker slider
│   │   ├── cyber_select.slint  # Dropdown menu replacement
│   │   └── modal.slint         # Settings & Equalizer popups
│   ├── views/
│   │   ├── library_table.slint # Virtualized track table
│   │   ├── playback_bar.slint  # Track info, cover, waveforms, transport controls
│   │   ├── sidebar.slint       # Navigation and playlist list
│   │   └── equalizer.slint     # 10-band EQ & DSP rack
│   └── visualizer/
│       └── spectrum.slint      # 64-band visualizer or custom OpenGL canvas
└── cpp/                        # Relocated C++ audio engine
    ├── audio_engine.cpp
    ├── audio_engine.h
    ├── miniaudio.h
    └── signalsmith-stretch.h
```

---

## 4. Phase-by-Phase Implementation Plan

### Phase 1: Project Scaffolding & Cargo Setup
1. **Initialize Rust Project**:
   ```bash
   cargo init --bin .
   ```
2. **Configure `Cargo.toml`**:
   ```toml
   [package]
   name = "synapse"
   version = "0.2.0"
   edition = "2021"
   build = "build.rs"

   [dependencies]
   slint = { version = "1.8", features = ["backend-default"] }
   lofty = "0.21"
   rusqlite = { version = "0.31", features = ["bundled"] }
   tokio = { version = "1", features = ["rt-multi-thread", "sync", "macros"] }
   parking_lot = "0.12"
   image = { version = "0.25", default-features = false, features = ["png", "jpeg"] }

   [build-dependencies]
   slint-build = "1.8"
   cc = { version = "1.0", features = ["parallel"] }
   ```
3. **Configure `build.rs`**:
   - Compile `.slint` files with `slint_build::compile("ui/main.slint")`.
   - Compile `audio_engine.cpp` with `cc::Build::new()` (flags: C++17, link with Windows WASAPI / ALSA on Linux).

---

### Phase 2: C++ Audio Engine FFI Binding
1. **Create `src/audio/ffi.rs`**:
   - Expose C functions from `audio_engine.h`:
     ```rust
     extern "C" {
         pub fn init_audio_engine(sample_rate: u32, channels: u32) -> bool;
         pub fn cleanup_audio_engine();
         pub fn load_track(slot: i32, file_path: *const libc::c_char) -> bool;
         pub fn play_track(slot: i32);
         pub fn pause_track(slot: i32);
         pub fn seek_track(slot: i32, position_sec: f64);
         pub fn set_track_volume(slot: i32, volume: f64);
         pub fn get_track_position(slot: i32) -> f64;
         pub fn is_track_playing(slot: i32) -> bool;
         pub fn get_track_spectrum(slot: i32, num_bins: i32, out_spectrum: *mut f32);
         pub fn set_eq_params(slot: i32, low: f32, mid: f32, high: f32);
         pub fn set_eq10_bands(slot: i32, bands: *const f32);
         pub fn toggle_automix(enabled: bool);
         pub fn set_crossfade_duration(duration_sec: f64);
     }
     ```
2. **Safe Wrapper `src/audio/mod.rs`**:
   - Provide safe, thread-safe Rust methods around `unsafe` FFI calls.
   - For spectrum queries: pass a stack-allocated buffer `[f32; 64]` into `get_track_spectrum` directly into Rust. **Zero memory allocations and zero JSON serialization!**

---

### Phase 3: Metadata Scanner & SQLite Database
1. **Metadata Parsing (`src/library/metadata.rs`)**:
   - Use `lofty::read_from_path` to read MP3, FLAC, and WAV tags (Artist, Title, BPM, Album, embedded picture).
   - Downscale album art thumbnails to a maximum of 300×300 px using the `image` crate before creating a `slint::Image`. This prevents bloating memory with multi-megabyte raw bitmaps.
2. **Database Engine (`src/library/db.rs`)**:
   - Replace `cache.json` with an atomic SQLite database `~/.synapse/library.db`.
   - Tables:
     - `tracks` (file_path PRIMARY KEY, title, artist, genre, bpm, key, duration, waveform_blob, mod_time, size).
     - `playlists` (id PRIMARY KEY, name).
     - `playlist_tracks` (playlist_id, track_path, sort_order).
3. **Directory Scanner (`src/library/scanner.rs`)**:
   - Async background scanner checking file size and modification time against SQLite. Only unanalyzed tracks are scheduled for decoding analysis.

---

### Phase 4: Slint UI & Cyberpunk Design System
1. **Tokens & Theme (`ui/theme.slint`)**:
   - Define palettes matching Synapse branding:
     - `Night City`: Yellow `#FCEE0A`, Dark `#08090D`, Cyan `#00F0FF`
     - `Arasaka`: Red `#E50012`, Onyx `#050507`
     - `Netrunner`: Matrix Green `#00FF66`, Slate `#04090C`
2. **Component Mapping**:
   | Legacy React Component | Target Slint Component | Key Slint Elements |
   | :--- | :--- | :--- |
   | `PlaybackBar.tsx` | `ui/views/playback_bar.slint` | `HorizontalLayout`, custom `Slider`, play/pause buttons, cover `Image` |
   | `LibraryTable.tsx` | `ui/views/library_table.slint` | `StandardTableView` or custom `ListView` with virtual scrolling |
   | `LibrarySidebar.tsx` | `ui/views/sidebar.slint` | Navigation items, playlist list, "My Wave" toggle |
   | `AudioEffectsModal.tsx`| `ui/views/equalizer.slint` | 10 vertical sliders for EQ bands, toggle switches |
   | `CyberSelect.tsx` | `ui/components/cyber_select.slint`| Chamfered polygon box with popup list |
3. **Waveform & Spectrum Rendering**:
   - Implement custom line/bar drawing inside Slint using `Path` elements or a lightweight custom canvas painter callback:
     ```slint
     export component SpectrumBar inherits Rectangle {
         in property <float> magnitude: 0.0;
         width: 4px;
         height: parent.height * root.magnitude;
         background: #00F0FF;
     }
     ```

---

### Phase 5: Event Loop & State Binding (`src/ui_bridge.rs`)
1. **Slint Property Models**:
   - Represent track list in Slint via `slint::VecModel<TrackRow>`.
   - Slint list views are inherently virtualized (only visible rows are instantiated in memory).
2. **Spectrum & Playback Refresh**:
   - Replace the legacy 16ms JSON ticker with a native `slint::Timer`:
     ```rust
     let timer = slint::Timer::default();
     timer.start(slint::TimerMode::Repeated, std::time::Duration::from_millis(33), move || {
         // Query C++ audio engine directly (30 FPS)
         let mut spectrum = [0.0f32; 64];
         audio_engine.get_spectrum(0, &mut spectrum);
         // Update Slint UI properties directly in memory
     });
     ```
   - Auto-pause the timer when the window is minimized using Slint window state hooks.

---

## 5. Performance Verification Checklist

Before considering the migration complete, verify the following benchmarks on Windows Task Manager:

- [ ] **Working Set Memory (RAM)**:
  - Idle after startup: `< 25 MB`
  - Playing track with active cover art: `< 35 MB`
  - After scrolling a library of 10,000 tracks: `< 50 MB`
- [ ] **CPU Usage**:
  - Window visible, playing track with active spectrum: `< 1.2%`
  - Window minimized / background playback: `< 0.2%`
- [ ] **Executable Size**:
  - Release `.exe` binary: `< 20 MB` (single file without external runtime dependencies).
- [ ] **Audio Stability**:
  - Zero audible dropouts, stuttering, or clicks during library scrolling or window resizing.

---

## 6. Migration Command Reference for Next Agent

```bash
# 1. Setup Rust Toolchain
rustup default stable

# 2. Check Slint & C++ Compilation
cargo build

# 3. Run Slint Live Preview during UI development
cargo install slint-viewer
slint-viewer -i ui/main.slint

# 4. Run Synapse in Release Mode
cargo run --release
```
