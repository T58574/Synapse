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
