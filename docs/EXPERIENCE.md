# Engineering Experience & Lessons Learned

## Audio Engine & C++ DSP

### Cue (Symptom): Windows non-ASCII / Cyrillic file paths fail to load
- **Lesson (Takeaway)**: Always convert UTF-8 strings to UTF-16 `std::wstring` using `MultiByteToWideChar(CP_UTF8, ...)` on Windows, and invoke `ma_decoder_init_file_w` / `_wfopen`.
- **Evidence**: `audio_engine.cpp:25-30,166-170`, fixed in Audit Cycle 3.

### Cue (Symptom): Real-time audio stutter during background file loading
- **Lesson (Takeaway)**: Never initialize decoders or parse file headers inside the critical section locked by the real-time audio playback mutex (`ts.mtx`). Initialize the decoder first, then lock briefly to swap pointers.
- **Evidence**: Commit `c7b34b5`, fixed in `load_track`.

### Cue (Symptom): Access violation crash (`0xc0000005`) on repeated audio device init
- **Lesson (Takeaway)**: Always guard audio engine initialization with cleanup if already initialized (`g_device_initialized`).
- **Evidence**: `audio_engine.cpp:561-587`, fixed in Audit Cycle 3.

### Cue (Symptom): Automix crossfade cuts out abruptly when play is pressed
- **Lesson (Takeaway)**: Guard mixer state transitions; do not unconditionally overwrite mixer crossfade state (states 1 and 3) during simple play/pause commands.
- **Evidence**: `audio_engine.cpp:540-548`, fixed in Audit Cycle 2.

### Cue (Symptom): Audio crash or out-of-bounds on mono audio files
- **Lesson (Takeaway)**: Force decoders and internal DSP pipelines to 2 channels (stereo), and perform downmixing only at final hardware output callback.
- **Evidence**: Commit `c7b34b5`, `init_decoder_fixed`.

## Frontend & React State

### Cue (Symptom): High CPU usage / tearing in canvas waveform drawing
- **Lesson (Takeaway)**: Hoist `getComputedStyle()` and CSS variable reads outside rendering loops (`for` bars).
- **Evidence**: `App.tsx:467`, fixed in Audit Cycle 2.

### Cue (Symptom): Infinite re-renders and stale closures in 100ms polling interval
- **Lesson (Takeaway)**: Use a stable snapshot ref (`stateRef`, `handleLoadDeckRef`) instead of putting mutable playback state arrays in `useEffect` dependency array. Keep polling interval `useEffect` deps as `[]`.
- **Evidence**: `App.tsx:363-410,511`, fixed in Audit Cycle 2 & 3.

### Cue (Symptom): DOM node remount glitch when filtering track lists
- **Lesson (Takeaway)**: Never use array index (`idx`) as React list key for filtered/sorted lists; use stable unique identity (`track.filePath`).
- **Evidence**: `App.tsx:598`, fixed in Audit Cycle 2.

## Backend & Go Runtime

### Cue (Symptom): Extremely slow initial library scan (>45s) on medium/large folders
- **Lesson (Takeaway)**: Cache audio analysis results (BPM, Key, Waveform peaks) in persistent `cache.json` indexed by path, file size, and modification time.
- **Evidence**: `app.go:149-175`, reduced scan time from 47.6s to 0.3s (135x speedup).

### Cue (Symptom): Windows environment variable tests failing on `UserHomeDir`
- **Lesson (Takeaway)**: Go's `os.UserHomeDir` on Windows checks `USERPROFILE` before `HOME`. Always mock both in tests.
- **Evidence**: `logger_test.go:37-240`, fixed in Audit Cycle 4.

## CPU Optimization & Performance

### Cue (Symptom): High CPU usage (>25-40%) when player is running or minimized in background
- **Lesson (Takeaway)**: 
  1. Window visibility (`document.visibilityState === 'hidden'`) must pause WebGL `requestAnimationFrame` loops immediately.
  2. Signal backend to halt 60 FPS spectrum FFT calculations and IPC broadcasts (`SetVisualizerActive(false)`).
  3. Pre-allocate static/thread-local buffers in C++ DSP routines (`get_track_spectrum`) to prevent heap allocation churn.
  4. Throttle playback position polling from 100ms to 1000ms when hidden, skipping React state re-renders until visible again.
- **Evidence**: Added `useWindowVisibility`, `SetVisualizerActive`, and throttled `useAudioPlayback`.

### Cue (Symptom): Entire library UI re-rendering 10 times a second on track playback
- **Lesson (Takeaway)**: Playback position updates must not trigger re-renders in `LibraryTable`, `LibrarySidebar`, or `LibraryHero`. Wrap presentation containers in `React.memo` and memoize search/filter calculations via `useMemo`.
- **Evidence**: `LibraryTable`, `LibrarySidebar`, `LibraryHero`, `MusiciansView` memoized in `frontend/src/components/`.

### Cue (Symptom): God-file maintenance bottleneck (`App.tsx` >1300 lines)
- **Lesson (Takeaway)**: Deconstruct UI orchestrator into dedicated custom hooks (`useThemeEngine`, `useEqualizer`, `usePlaylists`, `useLibrary`, `useAudioPlayback`, `useWindowVisibility`).
- **Evidence**: Reduced `App.tsx` from 1335 lines to 499 lines, keeping all modules under 700 lines.

## Media & Everyday Player UX

### Cue (Symptom): Missing album art makes interface feel sterile and generic
- **Lesson (Takeaway)**: Extract embedded picture frames (APIC in ID3v2, METADATA_BLOCK_PICTURE in FLAC/Vorbis) via `tag.Metadata.Picture()` in Go, convert to Base64 data URL, and cache in memory on the frontend to avoid disk writes and asset server overhead.
- **Evidence**: `backend/scanner.go:GetTrackCover`, `useAudioPlayback.ts`, `PlaybackBar.tsx`.

### Cue (Symptom): Users need on-the-fly queueing ("Play Next") without creating a playlist
- **Lesson (Takeaway)**: Implement an in-memory `queue: TrackInfo[]` buffer. `handleNext` and the Automix transition engine should prioritize the queue before defaulting to sequential playlist progression.
- **Evidence**: Implemented in `useAudioPlayback.ts`, `PlaybackBar.tsx` queue popover, and `LibraryTable.tsx` quick-add button.

### Cue (Symptom): Backend `app.go` growing into a monolithic God-file (>800 lines)
- **Lesson (Takeaway)**: Group `*App` methods by domain into separate files within `package backend` (`playlists.go`, `scanner.go`, `track_ops.go`). Go package-level cohesion preserves all Wails bindings without changing method receivers or types.
- **Evidence**: Split `backend/app.go` into 4 cohesive files, all under 350 lines.

## Code Quality & Technical Debt

### Cue (Symptom): Redundant utility duplication and prop-drilling (`getFilename`, `formatTime`)
- **Lesson (Takeaway)**: Extract pure string/time formatting utilities to a central `utils.ts` module with unit test coverage. Direct component imports eliminate multi-level prop drilling and unnecessary render churn.
- **Evidence**: Consolidated into `frontend/src/utils.ts`, removed from `PlaybackBarProps` and `LibraryTableProps`, covered by `frontend/src/utils.test.ts`.

### Cue (Symptom): Accumulated dead CSS and unreferenced SVG icon assets
- **Lesson (Takeaway)**: Regularly audit CSS class declarations and icon definitions against JSX components. Legacy styles (e.g., deprecated popover equalizers, old sidebar buttons) bloat the bundle and mislead developers.
- **Evidence**: Removed 220+ lines of dead CSS from `App.css` and 4 unused icons (`ResetIcon`, `LibraryIcon`, `DecksIcon`, `SearchIcon`) from `Icons.tsx`.

### Cue (Symptom): Lax TypeScript typing (`: any`) on event buses and timers
- **Lesson (Takeaway)**: Replace loose `any` signatures with explicit interface contracts (`TrackInfo`, `{ deck0?: number[]; deck1?: number[] }`) and `ReturnType<typeof setTimeout>`. This ensures type safety across IPC events and timers without runtime overhead.
- **Evidence**: Fixed `any` signatures in `useLibrary.ts`, `useAudioPlayback.ts`, and `AudioEffectsModal.tsx`.

## UI/UX & Webview Rendering

### Cue (Symptom): Native HTML `<select>` triggers ugly, unstyled Windows OS dropdowns in Wails WebView
- **Lesson (Takeaway)**: Never rely on native `<select>` tags in dark or stylized desktop webviews. Build custom accessible dropdown components (`CyberSelect`) with synthetic popup menus, chamfered polygon clip-paths, and theme CSS variable inheritance.
- **Evidence**: Resolved in `frontend/src/components/CyberSelect.tsx` and `SettingsView.tsx`.

## Testing & Toolchain Diagnostics

### Cue (Symptom): `go test ./...` fails with `pattern all:frontend/dist: no matching files found`
- **Lesson (Takeaway)**: Go's `//go:embed all:frontend/dist` requires the directory to exist at compile time. In headless or CI/CD test environments where frontend build hasn't run yet, build scripts must generate a stub `frontend/dist/index.html`.
- **Evidence**: Added `ensureFrontendDistStub()` in `scripts/build-menu.js`.

### Cue (Symptom): Linux Cgo fails linking with `/usr/bin/ld: cannot find -lasound`
- **Lesson (Takeaway)**: Linux environments with only runtime ALSA have `/usr/lib/.../libasound.so.2` but miss `/usr/lib/.../libasound.so` (from `libasound2-dev`). Automatically symlink `libasound.so.2` to a temporary library path and augment `LIBRARY_PATH` in build orchestrators.
- **Evidence**: Added `augmentLinuxAudioLibs()` in `scripts/build-menu.js`.

### Cue (Symptom): `ScanMusicDir` silently swallows directory traversal errors
- **Lesson (Takeaway)**: When implementing `filepath.WalkFunc`, never return `nil` when `walkErr != nil` unless intentional ignore. Return `walkErr` to bubble traversal and permission errors.
- **Evidence**: Fixed `backend/scanner.go:90-93`, verified in `backend/audio_engine_test.go:TestAppMocks`.

### Cue (Symptom): Testing Library `getByText` fails on Cyberpunk UI headings
- **Lesson (Takeaway)**: Do not call `.toUpperCase()` directly in JSX templates for localized strings. Use CSS `text-transform: uppercase` so that the underlying DOM text node retains standard casing, keeping i18n text queries and accessibility labels consistent.
- **Evidence**: `LibraryTable.tsx:273`, `MusiciansView.tsx:112`, and `App.css:.terminal-main-heading`.

### Cue (Symptom): Regex delimiter in `splitArtists` leaves dot on featured artist (`. Nile Rodgers`)
- **Lesson (Takeaway)**: `\b` word boundary does not match between a non-word punctuation character (like `.`) and whitespace. Use `\b(?:feat|ft)\.?` without trailing word boundary after the dot, and strip residual leading punctuation.
- **Evidence**: Fixed `frontend/src/utils.ts:5-10`, verified in `frontend/src/utils.test.ts`.

### Cue (Symptom): Unstyled white Windows native scrollbar cuts across dark application interface
- **Lesson (Takeaway)**: Standard CSS scoped scrollbars on specific containers (like `.sidebar::-webkit-scrollbar`) leave `body`, `.content-panel`, and main tables unstyled, prompting Windows to render glaring white tracks. Always define universal `*::-webkit-scrollbar` rules with `scrollbar-width: thin`.
- **Evidence**: Fixed in `frontend/src/App.css:8-70`.

### Cue (Symptom): CSS syntax errors pass unit tests but crash production Vite builds (`Unexpected }`)
- **Lesson (Takeaway)**: JSDOM unit test runners (Vitest) mock or ignore CSS imports and do not parse PostCSS stylesheets. Always include `tsc && vite build` as an automated stage in test suites to catch PostCSS syntax, Rollup asset errors, and type check breaks before deployment.
- **Evidence**: Integrated into `scripts/build-menu.js:handleAction('7')`.

### Cue (Symptom): Monolithic CSS "god file" (>3000 lines) causes selector conflicts and merge collisions
- **Lesson (Takeaway)**: Decompose monolithic stylesheets by component domain (`AppHeader.css`, `PlaybackBar.css`, `CyberSelect.css`, `AudioEffectsModal.css`, `theme.css`) imported into a clean master manifest. Keeps all modules within 100-450 lines and eliminates dead duplicate rules.
- **Evidence**: Decomposed `frontend/src/App.css` (3138 lines -> 35 lines) into 11 modular CSS files, shrinking output CSS bundle by ~3KB.

### Cue (Symptom): Playback crash / access violation in miniaudio during track playback
- **Lesson (Takeaway)**: Never copy `ma_decoder` by value (e.g. `ts.decoder = temp_decoder`). `ma_decoder` embeds a `ma_resampler` whose `pBackend` pointer points directly to its own internal state (`&resampler.state`). Shallow-copying from a stack variable leaves `pBackend` pointing to dead stack memory, triggering segfaults in `audio_callback`. Always allocate `ma_decoder*` on the heap and initialize in-place.
- **Evidence**: Fixed in `backend/audio_engine.cpp:load_track`.

### Cue (Symptom): Scrollbars fail to scroll on non-library views (Settings, Musicians)
- **Lesson (Takeaway)**: In nested Flexbox layouts, children default to `min-height: auto`. Without `min-height: 0` and `height: 100%` on intermediary flex wrappers (`.app-main-layout`, `.content-panel`), content expands past the viewport and gets clipped by parent `overflow: hidden`, preventing inner `overflow-y: auto` from engaging. Always set `min-height: 0` on flex containers and ensure `8px` minimum scrollbar width for mouse accessibility.
- **Evidence**: Fixed in `frontend/src/styles/theme.css`, `SettingsView.css`, `MusiciansView.css`.

### Cue (Symptom): BPM displays floating-point decimals and drifts across sampling rates
- **Lesson (Takeaway)**: Autocorrelation lag-to-BPM calculation must compute the exact downsampled envelope sample rate (`(double)outputSampleRate / downsample_ratio`) rather than assuming nominal target rate. Standard DJ workstations expect strictly whole integer BPM; round with `std::round` / `math.Round` / `Math.round` across all C++, Go, and React boundaries.
- **Evidence**: Fixed in `backend/audio_engine.cpp:analyze_audio`, `scanner.go`, `track_ops.go`, and `LibraryTable.tsx`.

### Cue (Symptom): Wails `EventsEmit` panics during test runs (`An invalid context was passed`)
- **Lesson (Takeaway)**: Background ticker routines (such as `broadcastSpectrum`) spawned during `Startup` with an arbitrary context will leak and persist across unit tests unless explicitly cancelled. Always wrap incoming context with `context.WithCancel(ctx)`, store `cancel context.CancelFunc` on the application struct, invoke it in `Shutdown`, and pass `nil` to `Startup` in unit tests that do not mock Wails runtime events.
- **Evidence**: Fixed in `backend/app.go:Startup/Shutdown` and `audio_engine_test.go:TestLogFromJS`.

## Rust + Slint Migration Architecture

### Cue (Symptom): Idle audio spectrum query returns 0 bins instead of allocated buffer size
- **Lesson (Takeaway)**: C++ DSP engine returns 0 and zeros out output memory if no decoder is loaded or track is not playing (`ts.has_decoder == false`). FFI wrappers must treat 0 as an expected idle condition, zeroing Slint visualizer state without allocation or assertion failure.
- **Evidence**: `cpp/audio_engine.cpp:1264-1266` and verified in `src/audio/mod.rs:test_audio_manager_lifecycle`.

### Cue (Symptom): Massive heap memory bloat from unconstrained embedded album artwork in Slint
- **Lesson (Takeaway)**: High-resolution embedded album covers (up to 3000x3000px, 15-30MB raw RGBA) quickly consume hundreds of megabytes in UI memory. Always downscale artwork to a fixed bounding box (max 300x300px) using `image::imageops::resize` with `FilterType::Lanczos3` before passing pixel buffers to `slint::Image::from_rgba8`.
- **Evidence**: `src/library/metadata.rs:resize_cover` and `test_cover_downscaling`.

### Cue (Symptom): Legacy cache corruption or data loss when switching from JSON to SQLite
- **Lesson (Takeaway)**: On initial startup, check if the SQLite `tracks` table is empty and legacy `~/.synapse/cache.json` / `playlists.json` exist. Run the migration inside a single atomic SQLite transaction (`conn.transaction()`) with Little-Endian binary BLOB packing for waveform data, ensuring backwards compatibility and zero data loss.
- **Evidence**: `src/library/db.rs:migrate_legacy_cache_if_needed` and `test_legacy_migration`.

### Cue (Symptom): IPC serialisation bottleneck and frame drops on 60 FPS spectrum visualizer
- **Lesson (Takeaway)**: Replace WebView OS pipes and JSON string serialization with direct native `slint::Timer` polling at 30 FPS. Pass stack-allocated `[f32; 64]` buffers directly into C++ FFI and update Slint reactive models in process memory with zero JSON overhead.
- **Evidence**: Implemented in `src/ui_bridge.rs` and benchmarked with 13 passing unit tests.

### Cue (Symptom): Windows MSVC `cl.exe` exit code 2 when compiling C++ audio engine via `cc-rs`
- **Lesson (Takeaway)**: When compiling `audio_engine.cpp` with MSVC (`cl.exe`):
  1. `<windows.h>` defines `min` and `max` macros that break standard `std::min` / `std::max` in template headers like `signalsmith-stretch.h`. Always define `NOMINMAX`, `WIN32_LEAN_AND_MEAN`, and `_USE_MATH_DEFINES` before any header inclusion.
  2. Always include standard C++ headers (`<vector>`, `<string>`, `<cmath>`, `<complex>`, `<algorithm>`) *before* `miniaudio.h` and `signalsmith-stretch.h`.
  3. In `build.rs`, pass `/EHsc` (C++ exception unwind model), `/utf-8` (UTF-8 source and execution charset for Cyrillic comments/strings), and `/permissive-` to `cc::Build`.
  4. Link `ole32`, `winmm`, `user32`, and `avrt` for WASAPI multimedia device threading.
- **Evidence**: Fixed in `build.rs` and `cpp/audio_engine.cpp:1-20`.

### Cue (Symptom): `winit` panics on Windows with `OleInitialize failed! Result was: RPC_E_CHANGED_MODE`
- **Lesson (Takeaway)**: `miniaudio` defaults internal `CoInitializeEx` calls to `COINIT_MULTITHREADED` (0). If `AudioManager::new()` is invoked before GUI initialization on the main thread, the thread is locked into an MTA apartment. When `winit` (Slint's windowing backend) subsequently calls `OleInitialize()` (which strictly requires STA `COINIT_APARTMENTTHREADED`), Windows returns `RPC_E_CHANGED_MODE` and `winit` panics immediately.
  To resolve:
  1. Always instantiate `MainWindow::new()?` first on the main thread so `OleInitialize()` establishes STA cleanly.
  2. Set `#define MA_COINIT_VALUE 2` (`COINIT_APARTMENTTHREADED`) in `audio_engine.cpp` and `build.rs` so miniaudio uses matching concurrency mode.
- **Evidence**: Fixed in `src/main.rs`, `cpp/audio_engine.cpp`, and `build.rs`.

### Cue (Symptom): Idle CPU usage ~1% on 20-core CPU when playback is paused or stopped
- **Lesson (Takeaway)**: Setting Slint reactive model properties (`win.set_spectrum_data`) inside a 33ms timer while idle marks Slint scene nodes dirty and forces the GPU backend to re-render all visualizer bars 30 FPS non-stop. Use an `is_idle_zeroed` state tracker: zero the spectrum model exactly once upon transitioning to pause/stop, then return early immediately with 0 allocations and 0 property updates while idle.
- **Evidence**: `src/ui_bridge.rs:670-745`, verified idle CPU dropped to 0.0%.

### Cue (Symptom): Excessive heap memory (~90 MB) from duplicated tracks and waveforms in UI state
- **Lesson (Takeaway)**:
  1. `UiState` should store filtered tracks as `Vec<usize>` indices into `all_tracks` rather than cloning the entire track list and all embedded waveform vectors.
  2. Strip and shrink waveform vectors for in-memory UI track caches (`track.waveform.clear()`), fetching detailed waveforms from SQLite on demand.
  3. Pre-allocate and `shrink_to_fit()` Slint `VecModel` rows before attaching to window properties.
  4. Run `PRAGMA shrink_memory;` and tune SQLite cache (`cache_size = -1000`) after startup scans and directory indexing.
  5. Reduce Tokio runtime worker threads from 4 to 2 with explicit 1MB stack size.
- **Evidence**: `src/ui_bridge.rs`, `src/library/db.rs`, `src/library/scanner.rs`, and `src/main.rs`. All 14 tests passing.

### Cue (Symptom): Row TouchArea intercepts clicks to nested action buttons in Slint virtualized lists
- **Lesson (Takeaway)**: In Slint, elements declared later in markup have higher Z-order and intercept mouse clicks. When implementing table/list rows that are clickable as a whole but contain action buttons (`+`, `✕`), declare the background row `TouchArea` *before* the inner `HorizontalLayout` / action button components so buttons are stacked on top and receive user events cleanly. Also note that `vertical-alignment` is a text property and cannot be declared on `Rectangle`.
- **Evidence**: Fixed in `ui/views/library_table.slint`, `ui/views/sidebar.slint`, and verified via `cargo check` & `cargo test --bin synapse`.

### Cue (Symptom): Mobile emojis and text unicode icons cause platform font mismatches, blurry rendering, and unprofessional DAW aesthetics
- **Lesson (Takeaway)**:
  1. Do not use unicode emojis or fallback text symbols (`📁`, `🔄`, `🎛`, `⚡`, `▶`, `⏸`, `|◀`, `▶|`, `✕`, `✓`, `♬`, `◈`, `◎`) in high-performance cyber DAW interfaces. Mobile emoji fonts vary widely across Linux/Windows/macOS distributions, often rendering in clashing multi-color bitmap styles.
  2. Implement an authentic vector iconography module in `ui/components/icons.slint` using Slint's `Path` primitive with fixed viewBoxes (`viewbox-width: 24; viewbox-height: 24`) and SVG path `commands`.
  3. Ensure all icons take `in property <color> icon_color` and `in property <length> size: 16px` for razor-sharp, resolution-independent vector scaling.
  4. For authentic cyberpunk chamfers, replace square corner rectangles with 45-degree angle corner notches (`Path` with triangular polygon commands like `"M 0 0 L 7 0 L 7 7 Z"`).
- **Evidence**: Created `ui/components/icons.slint` with 17 custom vector components; updated `button.slint`, `playback_bar.slint`, `sidebar.slint`, `library_table.slint`, `main.slint`, `equalizer.slint`, `settings.slint`, and `modal.slint`. Verified with `cargo check` and 14/14 unit tests passing.

### Cue (Symptom): Linear FFT binning leaves upper frequency visualizer bars dead and motionless
- **Lesson (Takeaway)**: Linear FFT binning (`bin_step = 512 / N`) concentrates 80% of musical energy in the first few bins (bass/low-mids), leaving upper bins empty and flat. Use logarithmic frequency binning from 35 Hz to 18,000 Hz (`f(i) = f_min * (f_max / f_min)^(i/N)`), apply pink-noise tilt compensation (`tilt = 1.0 + 2.4 * (i/N)`) to balance the natural 1/f rolloff of music, and apply power-law dynamic compression (`pow(mag, 0.68)`) to animate all 64 bands vividly.
- **Evidence**: `cpp/audio_engine.cpp:get_track_spectrum`, verified full 64-band activity.

### Cue (Symptom): Spectrum visualizer jumps erratically instead of smooth Winamp-style ballistics
- **Lesson (Takeaway)**: Raw FFT values refreshed every frame produce chaotic visual jitter. Implement dual-state ballistics:
  1. Main bar smoothing: fast attack (`val * 0.85 + prev * 0.15`) and exponential decay (`prev * 0.82`).
  2. Winamp falling peak dots ("падающие частички"): store peak positions, hold for ~165ms (5 ticks) on peak rise, then drop with gravitational acceleration (`vel += 0.007; peak -= vel`) until landing on the current bar.
  3. On pause/stop, smoothly decay both to zero over ~15 frames before halting ticker updates for zero idle CPU.
- **Evidence**: `src/ui_bridge.rs:720-775`, `ui/visualizer/spectrum.slint`, verified with 14 passing tests.

### Cue (Symptom): Cramped playback seeker and misaligned table column headers
- **Lesson (Takeaway)**:
  1. Avoid duplicating visualizers across header and playback dock. Removing redundant mini-spectrums frees over 300px in the bottom dock, allowing the seeker slider to expand to `horizontal-stretch: 1` (>620px width).
  2. Unify transport button heights (`height: 34px`) across Prev, Play/Pause, Next, and Automix to prevent jagged vertical misalignment.
  3. In virtualized tables, match explicit column widths and `horizontal-alignment` (left, center, right) identically between header `Text` and row data cells (centering Artist, BPM, Key, Duration, and Action icons).
- **Evidence**: `ui/views/playback_bar.slint`, `ui/views/library_table.slint`, `ui/main.slint`.

### Cue (Symptom): Search text placeholder overflows horizontally into sidebar and clips icons
- **Lesson (Takeaway)**: In Slint, a child `Text` placed inside an unconstrained `Rectangle { horizontal-stretch: 1; }` computes width based on text length without bound. Always set `clip: true` on the input wrapper and specify `width: 100%; height: 100%; horizontal-alignment: left; vertical-alignment: center;` on both the placeholder `Text` and `TextInput`.
- **Evidence**: `ui/views/library_table.slint`, verified search box layout stability.

### Cue (Symptom): Huge empty vertical gap in sidebar pushing navigation to bottom of viewport
- **Lesson (Takeaway)**: Slint's `VerticalLayout` defaults to distributing unallocated space across children unless `alignment: start` is explicitly declared. Without it, preceding items expand away from each other. Always specify `alignment: start` on static header/nav groups and enclose dynamic list items (`playlists`) in a dedicated `ScrollView { vertical-stretch: 1; }`.
- **Evidence**: `ui/views/sidebar.slint`, fixed layout collapsing.

### Cue (Symptom): Missing fonts causing ugly default OS font fallbacks in Slint
- **Lesson (Takeaway)**: Specifying `font-family: "JetBrains Mono"` in Slint without locally imported `.ttf` files causes Linux/Windows to fallback to system fonts (Arial/DejaVu). Download font binaries into `ui/fonts/` and declare `import "./fonts/JetBrainsMono-Regular.ttf";` at the top of the root Slint manifest.
- **Evidence**: `ui/main.slint`, `ui/fonts/`, verified pixel-perfect monospace rendering.

### Cue (Symptom): Button icons and text misalign, shift vertically, or drift off-center in Slint
- **Lesson (Takeaway)**:
  1. A layout (`HorizontalLayout`) placed inside a non-layout container (`Rectangle`) collapses to intrinsic content size at `(0, 0)` unless explicit `width: 100%; height: 100%;` are declared. Without this, button contents stick to the left boundary instead of being centered.
  2. Slint's `HorizontalLayout` defaults `cross-axis-alignment` to `stretch`. Without `cross-axis-alignment: center;`, child `Path` icons are vertically stretched to the container height, distorting vectors against text glyphs.
  3. `Text` elements inside layouts stretch horizontally by default. Declare `horizontal-stretch: 0; vertical-stretch: 0;` on both `Text` and vector icons (`Path`) to ensure strict intrinsic sizing.
  4. Slint compiler rejects specifying both `width`/`height` and `min-width`/`max-width` on the same element; define fixed dimensions solely with `width: size; height: size;` combined with `horizontal-stretch: 0; vertical-stretch: 0;`.
  5. If a custom component (`Rectangle`) declares `min-width: 0px; horizontal-stretch: 0;` without an explicit `width` or `preferred-width`, Slint collapses its width to `0px`. Always bind `min-width: content_layout.min-width; preferred-width: content_layout.preferred-width;` and center the inner layout with `x: (parent.width - self.width) / 2; y: (parent.height - self.height) / 2;` so both unconstrained and fixed-width buttons size and center reliably.
- **Evidence**: `ui/components/button.slint`, `ui/components/icons.slint`, `ui/components/slider.slint`, `ui/views/playback_bar.slint`. Verified via `cargo check` and 15/15 unit tests.

### Cue (Symptom): Application freeze/deadlock and crash on EOF (track end) or Next Track
- **Lesson (Takeaway)**:
  1. **Self-Deadlock on Mutex re-acquisition**: `parking_lot::Mutex` is not re-entrant. If `handle_next_track` holds `let mut p = player.lock()` and invokes a helper (`update_queue_model`) that calls `player.lock()`, the main UI thread self-deadlocks instantaneously. Refactor queue UI synchronization into `update_queue_ui(win, &p.queue)` taking an explicit reference to the already-locked queue.
  2. **Inverted Lock Ordering Deadlock**: `refresh_tracks_table` locked `ui_state` then `player`, whereas `handle_next_track` locked `player` then `ui_state`. In `handle_next_track`, query `p.pop_next_track()`, release `player`, lock `ui_state` to determine the next track, release `ui_state`, and only then lock `player` to execute `play_track`. Never hold both mutexes concurrently.
  3. **Timer Event Loop Flooding**: When a track finishes in C++ (`ts.is_playing = false`), Rust's `p.is_playing` remained `true` and `pos >= duration - threshold` was continuously satisfied, triggering `next_track_fn` every 33ms in a tight loop. Add an atomic transition flag (`Arc<AtomicBool>`) and detect track end via `audio_clone.is_playing(slot)` to prevent duplicate triggers.
- **Evidence**: Fixed in `src/ui_bridge/mod.rs` (`handle_next_track`, `update_queue_ui`, timer loop). Verified with 16/16 unit tests.

### Cue (Symptom): Audio dropouts, buffer underrun, or crash when Automix is enabled
- **Lesson (Takeaway)**:
  1. In `cpp/audio_engine.cpp:get_audio_frames`, `if (!g_automix_enabled && ts.tempo_ratio == 1.0 && ts.pitch_semi == 0.0)` forced the audio thread to bypass direct PCM reads and run heavy STFT/FFT time-stretching (`SignalsmithStretch`) 100% of the time whenever Automix was toggled ON.
  2. When `tempo_ratio == 1.0 && pitch_semi == 0.0`, direct PCM reading must always be used regardless of automix mode. Running phase vocoders on standard 1.0x playback introduces 120ms internal buffering latency, memory allocation spikes, and WASAPI buffer underruns.
  3. Automix crossfading should use constant-power sinusoidal volume curves (`cos/sin`) across slots 0 and 1 without warping pitch or forcing unaligned tempo stretching. Rust manages track sequencing and initiates the transition into the alternate slot (`1 - active_slot`), while C++ executes the crossfade.
- **Evidence**: `cpp/audio_engine.cpp:818,918-970,1257`, `src/state/player.rs`, `src/ui_bridge/mod.rs`. All 16 unit tests passing.
