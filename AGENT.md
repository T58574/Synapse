# 0xSoundPlayer Architecture & Design Specification

## 1. System Architecture Diagram

```mermaid
graph TD
    TS[TypeScript Frontend] <-->|Wails IPC Binding| Go[Go Backend]
    Go <-->|Cgo / C API| CEngine[C/C++ Audio Engine]
    CEngine <-->|miniaudio| Decoders[Built-in Decoders: dr_mp3, dr_wav, dr_flac]
    CEngine <-->|Signalsmith Stretch| PitchTime[Time-Stretching & Pitch-Shifting]
    CEngine <-->|Analysis Pipeline| Analysis[BPM & Key Detection]
    CEngine <-->|Output Callback| OS[OS Audio Layer: WASAPI / ALSA / CoreAudio]
```

---

## 2. Technical Stack Details

### 2.1 Backend Core (Go)
*   **Wails v2**: Bridge between Go backend and TypeScript frontend.
*   **Cgo**: Low-latency communication layer with the C++ audio engine.

### 2.2 Audio Engine (C / C++)
*   **miniaudio.h**: Core engine for low-level audio I/O. Supports MP3, WAV, and FLAC natively through embedded decoders `dr_mp3`, `dr_wav`, and `dr_flac`. This eliminates the need for external codecs, binary downloads, or dynamic library loaders.
*   **Signalsmith Stretch**: Modern C++11 header-only DSP library for high-quality Pitch Shifting and Time-Stretching (tempo adjustments without pitch modification).
*   **Custom DSP**: Real-time DSP routines for Key and BPM analysis, including FFT and autocorrelation.

### 2.3 Frontend UI (TypeScript)
*   **HTML5 Canvas**: Waveform rendering using pre-computed peak arrays.
*   **React + CSS**: Premium dark-mode interface styled like desktop Spotify, compliant with the **UI/UX Pro Max** design guidelines.

---

## 3. Data Flow & Processing Pipeline

### 3.1 Audio Analysis Pipeline
When a local file is added to the library:
1.  **Decoding**: The file is parsed via miniaudio's decoder to extract PCM data.
2.  **Peak Calculation**: High-resolution waveform peaks are extracted by calculating Root-Mean-Square (RMS) values of blocks.
3.  **BPM Detection**: Downsample the envelope of the track's middle 30 seconds to 200Hz, and run an autocorrelation to find the lag with the highest peak in the 60-180 BPM range.
4.  **Key Detection**: 
    *   The PCM stream is windowed (Hanning) and processed via FFT.
    *   Frequencies are mapped to a 12-dimensional chroma vector (pitch classes).
    *   The chroma vector is correlated with Krumhansl-Schmuckler profiles for 24 musical keys.
    *   The output is mapped to Camelot Wheel codes (e.g., 8A for A minor, 8B for C major).

### 3.2 Mixing and Transition Engine (Smart Harmonic Transitions)
When "Auto-Mix" is enabled and Track A (slot 0) transitions to Track B (slot 1):
1.  **Beat-Aligned Start**: The transition is triggered exactly on a musical bar boundary close to the end of Track A. The actual crossfade duration is calculated dynamically to span an integer number of bars (e.g. 16 beats / 4 bars) based on Track A's BPM:
    $$T_{\text{fade}} = \text{round}\left(\frac{C \cdot \text{BPM}_A}{240.0}\right) \cdot \frac{240.0}{\text{BPM}_A}$$
    where $C$ is the target crossfade duration (default 8s).
2.  **Dynamic BPM Sync**: Rather than a static rate shift, the tempo of the outgoing Track A is continuously and smoothly ramped to meet the native tempo of the incoming Track B over the transition:
    $$\text{tempo\_ratio}_A(t) = 1.0 \cdot (1 - t) + \frac{\text{BPM}_B}{\text{BPM}_A} \cdot t$$
    where $t = \frac{\text{elapsed}}{T_{\text{fade}}} \in [0, 1]$. The incoming Track B starts playing immediately at its native tempo:
    $$\text{tempo\_ratio}_B(t) = 1.0$$
3.  **Pitch Invariance**: The pitch/key signature of both tracks is kept strictly invariant ($\text{pitch\_semi} = 0.0$ at all times) to preserve their original musical keys.
4.  **Equal-Power Crossfade**: An equal-power crossfade is performed to prevent dips in volume in the middle of the transition:
    $$\text{vol}_A(t) = \cos\left(t \cdot \frac{\pi}{2}\right), \quad \text{vol}_B(t) = \sin\left(t \cdot \frac{\pi}{2}\right)$$

### 3.3 Music Directory Synchronization
*   The application creates and manages a folder `.0xplayer` under the user's home directory (`~/.0xplayer`).
*   On startup or request, Go recursively scans this folder for `.mp3`, `.wav`, and `.flac` files, calls the C++ analyzer on any new tracks, and compiles a playlist table.
*   Users can launch the native file browser (Windows Explorer, Finder, or xdg-open) directly from the player interface to drop music files.

---

## 4. State Management & Interaction Fixes

### 4.1 Track Seek / Progress Slider Freezing
*   **Problem**: Dragging or clicking the track seek/progress slider caused the slider to freeze permanently at the clicked position, even though the backend successfully performed the track seek. This also kept the slider frozen when playing subsequent tracks.
*   **Root Cause**: 
    1. A race condition occurred between React's asynchronous state update (`setDragPosition`) and the synchronous DOM `mouseup`/`touchend` events. When `onChange` triggered a state update, React scheduled a re-render. If `onMouseUp` executed before the re-render finished, the handler read `dragPosition` as `null` from the previous render, skipping the seek finalization.
    2. If the user dragged the mouse outside the slider boundaries and released, the local `onMouseUp` event on the slider input element never fired at all, leaving `dragPosition` in a non-null state.
*   **Solution**:
    1. Added `dragPositionRef` (`useRef`) to store the temporary drag position synchronously.
    2. Added global `window` event listeners for `mouseup` and `touchend` when dragging is active, ensuring release events are captured anywhere on the screen.
    3. The global release handler reads from `dragPositionRef.current` synchronously to perform `Seek` and resets `dragPosition` back to `null`.

### 4.2 Audio Stutter and Micro-Pauses during Automix Transitions
*   **Problem**: In Auto-Mix mode, transitioning between tracks (e.g. at 53 seconds) resulted in a micropause (short silence/stutter). Furthermore, when the crossfade completed (after 8 seconds), the entire audio output would freeze/buffer for a couple of seconds (an unpleasant loading pause).
*   **Root Causes**:
    1. **Path-switching Latency**: The engine has a fast path (direct PCM read from decoder) and a slow time-stretching path (using signalsmith-stretch for pitch and tempo ratio changes). At the start of a transition (e.g. at 53 seconds), the tempo ratio begins to ramp. This switched the outgoing track from the fast path to the stretch path on the fly. Since the signalsmith-stretch buffers were empty, it introduced a sudden ~150ms delay/silence gap while the STFT window populated, causing a micropause.
    2. **Audio Thread Mutex Contention**: When a transition finishes, the React frontend automatically loads the next track in the queue. The Go backend's `LoadTrack` is called, which calls C++ `load_track`. This function acquired the track's state mutex (`ts.mtx`) and, while holding it, ran the slow `analyze_audio` routine (decoding the whole file to compute waveform peaks, running autocorrelation for BPM detection, and performing FFT chroma analysis for key detection). Since the real-time audio callback thread (`audio_callback`) still calls `get_audio_frames` for both slots and locks `ts.mtx`, it blocked waiting for the metadata analysis to finish (which took several seconds), freezing all audio output.
*   **Solutions**:
    1. **Continuous Stretch in Automix**: Bypassed the fast path and forced the use of the time-stretching signalsmith-stretch pipeline from the beginning of playback whenever Auto-Mix is enabled. This ensures that the STFT history buffers are already warmed up, maintaining a constant latency and preventing any stutter when the transition begins.
    2. **Lock-Free Metadata Analysis**: Moved the slow `analyze_audio` calculations in `load_track` to execute *before* acquiring the track's state mutex `ts.mtx`. The mutex is now only locked for the final, near-instantaneous swap of decoders and state metadata update (taking < 1ms), entirely eliminating audio thread starvation.

---

## 5. API Schema & Interface Definitions

### 5.1 Go to Frontend Wails Bindings
```go
package main

type TrackMetadata struct {
	FilePath     string    `json:"filePath"`
	DurationSec  float64   `json:"durationSec"`
	BPM          float64   `json:"bpm"`
	KeySignature string    `json:"keySignature"`
	Waveform     []float32 `json:"waveform"`
	Artist       string    `json:"artist"`
	Genre        string    `json:"genre"`
}

type SoundCloudResult struct {
	Title    string  `json:"title"`
	Uploader string  `json:"uploader"`
	URL      string  `json:"url"`
	Duration float64 `json:"duration"`
}

type Playlist struct {
	Name       string   `json:"name"`
	TrackPaths []string `json:"trackPaths"`
}

type App struct {}

func (a *App) LoadTrack(slot int, filePath string) (TrackMetadata, error)
func (a *App) Play(slot int)
func (a *App) Pause(slot int)
func (a *App) Seek(slot int, positionSec float64)
func (a *App) SetVolume(slot int, volume float64)
func (a *App) SetTempo(slot int, tempoRatio float64)
func (a *App) SetPitch(slot int, pitchSemi float64)
func (a *App) GetPosition(slot int) float64
func (a *App) IsPlaying(slot int) bool
func (a *App) ToggleAutoMix(enabled bool)
func (a *App) SetCrossfadeDuration(durationSec float64)
func (a *App) SelectAudioFile() (string, error)
func (a *App) GetMusicDir() (string, error)
func (a *App) ScanMusicDir() ([]TrackMetadata, error)
func (a *App) OpenMusicDir()
func (a *App) GetPlaylists() ([]Playlist, error)
func (a *App) SavePlaylists(playlists []Playlist) error
func (a *App) CreatePlaylist(name string) error
func (a *App) DeletePlaylist(name string) error
func (a *App) AddTrackToPlaylist(playlistName string, trackPath string) error
func (a *App) RemoveTrackFromPlaylist(playlistName string, trackPath string) error
func (a *App) SearchSoundCloud(query string) ([]SoundCloudResult, error)
func (a *App) DownloadFromSoundCloud(trackURL string) error
```

### 5.2 Real-Time IPC Events (Broadcasting)

The Go backend broadcasts real-time DSP event packets to the React frontend at ~60 FPS when tracks are active.

#### `spectrum`
*   **Payload Type**: `map[string][]float32` (JSON: `{"deck0": [...], "deck1": [...]}`)
*   **Description**: Concurrently calculated FFT spectrum bins (64 bins per deck, frequency range 0 - 22,050Hz).
*   **Go Broadcast Routine**:
    ```go
    wailsRuntime.EventsEmit(a.ctx, "spectrum", map[string][]float32{
        "deck0": spec0,
        "deck1": spec1,
    })
    ```
*   **React Frontend Subscription**:
    ```javascript
    import { EventsOn } from "../wailsjs/runtime/runtime";

    useEffect(() => {
        const unsubscribe = EventsOn("spectrum", (data) => {
            drawSpectrum(canvas0, data.deck0, 0);
            drawSpectrum(canvas1, data.deck1, 1);
        });
        return () => unsubscribe();
    }, []);
    ```

#### Examples of API Usage:
```javascript
// Load and scan user music directory
const dir = await App.GetMusicDir();
const tracks = await App.ScanMusicDir();
console.log(`Directory: ${dir}, Found ${tracks.length} files.`);

// Play a selected track
await App.LoadTrack(0, tracks[0].filePath);
await App.Play(0);

// Adjust mixing settings
await App.ToggleAutoMix(true);
await App.SetCrossfadeDuration(10.0);

// Playlist Management
const playlists = await App.GetPlaylists();
await App.CreatePlaylist("Chill Beats");
await App.AddTrackToPlaylist("Chill Beats", tracks[0].filePath);
await App.RemoveTrackFromPlaylist("Chill Beats", tracks[0].filePath);
await App.DeletePlaylist("Chill Beats");

// SoundCloud Integration
const results = await App.SearchSoundCloud("lofi study");
console.log(`Found ${results.length} results on SoundCloud.`);
if (results.length > 0) {
    // Download first track to ~/.0xplayer/soundcloud/
    await App.DownloadFromSoundCloud(results[0].url);
}
```

---

## 6. Project Updates & Changelog
* **2026-06-19**: Updated `README.md` with beautiful Russian documentation structure, including system architecture mermaid diagram fixes (closed code block syntax), automix LaTeX equations formatting, key features detail, tech stack components, instructions for development/build, and GitHub Actions CI/CD pipeline documentation.
* **2026-07-01**: Removed DJ decks and Search SoundCloud tabs. Replaced the global left sidebar with a top header layout. Moved the settings button to the top-right of the header, and removed the "0xPlay" title. Embedded the playlist and filter categories inside a sidebar in the library view.
* **2026-07-01 (2)**: Refactored application's theme colors to use five custom semantic UI themes (Modern SaaS, Elevated Neutrals, Fintech & AI Innovation, Classic Trust, Eco-Digital & Wellness) mapping Background, Surface, Text, Border, Accent/Primary, and dynamic Contrast controls.
* **2026-07-01 (3)**: Refactored the monolithic frontend structure by decomposing `App.tsx` into a highly-modular component architecture under `src/components/` (`AppHeader`, `LibrarySidebar`, `LibraryHero`, `LibraryTable`, `DeckView`, `SettingsView`, `PlaybackBar`, and `Icons`) and shared TypeScript interfaces (`src/types.ts`). Passed state coordinations via clean React props mappings.
* **2026-07-01 (4)**: Implemented a high-performance WebGL fluid wave visualizer under `src/features/visualizer/` (`VisualizerContainer.tsx`, `FluidWaveShader.ts`) inspired by Yandex Music's "My Wave" shader, mapping real-time frequency bands (Bass/Mid/High) to shader displacements and transitioning colors dynamically based on track mood. Added backend mood classification (`DetermineMood`) in `app.go`.
* **2026-07-01 (5)**: Removed the theme selection panel from the AppHeader component (rendering it strictly in Settings). Added localStorage hook persistence to make the theme configuration persist across player restarts. Fixed the track page background rendering bug by applying background transparent bindings to `.library-main-content`.
* **2026-07-02**: Redesigned and centered the settings page. Updated layout spacing (`max-width: 720px; margin: 0 auto;`), added glassmorphism panel styles (`color-mix(in srgb, var(--surface-color) 55%, transparent)` with backdrop blurs), set custom cards transitions, refined theme color preview circles borders, and unified text properties to follow the UI design system.
* **2026-07-02 (2)**: Refactored the track row action buttons and playlist dropdown menu (`.playlist-dropdown-menu`, `.dropdown-menu-item`) to apply consistent glassmorphic styling, borders, and colors. Removed the music cover placeholder square (`.hero-cover`) in `LibraryHero.tsx`. Relocated the search bar input container from `LibraryTable.tsx` to the center of `AppHeader.tsx`.
* **2026-07-02 (3)**: Reorganized project directory structure by moving all backend Go logic and C/C++ audio engine files (including miniaudio, signalsmith-stretch, and signalsmith-linear) from the root folder to the newly created `backend` subfolder. Refactored package declarations to `backend`, created a forwarding `main.go` entrypoint and `main_test.go` at the root to comply with Wails CLI expectations, and validated all automated tests.
* **2026-07-02 (4)**: Implemented "Musicians Library" feature, grouping tracks by artist automatically. Created the `MusiciansView` tab with a responsive card grid, and added a search filter to look up artists. Designed `ArtistShape` which dynamically generates unique, abstract geometric SVG vector patterns (using deterministic hashes of artist names, gradients, blurs, and shapes) following the active theme design system. When an artist is clicked, it opens their track list in the library view with a customized header showing their generated shape.
* **2026-07-02 (5)**: Fixed a frontend compilation issue caused by moving `App` backend package location (updated wailsjs import paths to `../wailsjs/go/backend/App` in `App.tsx` and `App.test.tsx`). Added a Windows `build.bat` script automating backend tests, frontend validations, and the final standalone Wails compilation.
* **2026-07-02 (6)**: Fixed an issue in the "Musicians Library" where tracks with multiple artists (separated by commas, ampersands, or featuring tags) were grouped under a single composite string rather than split into individual artists. Created `splitArtists` utility inside `frontend/src/utils.ts` and refactored `App.tsx` and `MusiciansView.tsx` to group and filter tracks dynamically on split values, so collaborative tracks correctly appear under each individual artist.
* **2026-07-02 (7)**: Optimized WebGL fluid visualizer to minimize GPU/CPU utilization. Throttled rendering loop to a strict 30 FPS using delta time checks and downsampled the WebGL canvas dimensions by a factor of 3 to run at 1/9th pixel count (relying on bilinear CSS scaling). Redesigned the fragment shader to use hardware-optimized trigonometric domain warping instead of complex multi-octave FBM noise loops.
* **2026-07-02 (8)**: Redesigned the WebGL fluid visualizer into a right-localized, floating "liquid matter" blob entity with an orbiting satellite. Blended elements using smooth distance fields inside the shader. Implemented a deterministic track palette generator hashing track file paths to produce a unique, dynamic 4-color HSL gradient palette for each track, transitioning colors dynamically during seek, load, and playback.
* **2026-07-02 (9)**: Implemented click-to-copy utility for track titles (in both track list and bottom playback bar) and active artist names using the clipboard API. Configured the artist names in the track row metadata to split collaborative artists, rendering each as a separate link that navigates and filters the library view to that specific artist's collection upon clicking.
* **2026-07-02 (10)**: Refactored UI typography across the player. Loaded Unbounded (for large titles/branding/headers), Plus Jakarta Sans (for primary interface elements, titles, artists, sidebars), and JetBrains Mono (for numeric, technical and telemetry columns like BPM, Key, and Durations) to prevent visual layout jiggling.
* **2026-07-02 (11)**: Implemented audio output device routing and volume state persistence. Added C++ helper functions to serialize `ma_device_id` as hex strings and deserialize them back for cross-platform hardware device selection. Created Go bindings `GetAudioDevices` and `SetAudioDevice` to expose native device list to React, rendering a styled settings dropdown. Persisted individual deck volume levels and routed device choices in `localStorage`, restoring them on application startup. Added a glassmorphic toast notification component providing visual feedback for metadata copying and active routing updates.
* **2026-07-06**: Audited the application and resolved critical bugs:
  1. Fixed a critical heap memory corruption and crash bug in `backend/audio_engine.cpp` during format reading on mono (1-channel) output devices by decoupling internal stereo processing (2-channels decode & stretch) from device configuration and converting the format in `audio_callback` before writing to output.
  2. Optimized status polling interval in React (`frontend/src/App.tsx`) to avoid spams of Wails IPC calls (~40 calls/sec) when nothing is playing, eliminating redundant `IsPlaying` and `GetPosition` calls.
  3. Fixed waveform peaks and spectrum canvas peak indicators visibility in light themes (`neutrals`, `trust`, `eco`) by using theme variables (`theme.border` and `theme.text` / transparent styling) instead of hardcoded white colors.
  4. Redesigned header (`.app-header`) and footer (`.playback-bar`) panels, buttons, and volume/progress sliders to be fully adaptive to light and dark themes using custom CSS properties on `:root` rather than hardcoded pitch black backgrounds and white texts.
  5. Corrected WebGL visualizer background aura rendering in light themes inside `VisualizerContainer.tsx` by introducing theme-sensitive HSL scaling (light background and surfaces) when a track plays.
* **2026-07-07**: Fixed a potential read-modify-write race condition and deadlocks in the playlist manager and concurrent scans of the music directory inside `backend/app.go` by introducing a thread-safe synchronized design using `sync.Mutex` locks (`playlistMu` and `scanMu`) across all read and write transactions.
* **2026-07-07 (2)**: Implemented asynchronous non-blocking audio analysis engine. De-blocked C++ `load_track` call to perform instant decoder initialization and estimated duration parsing (under 10ms startup latency), shifting heavy wave-peak and BPM/key analysis to a background Go goroutine. Added `SetTrackMetadata` thread-safe C++ binding, Wails `"track_analyzed"` event notifications, and frontend cache lookup overrides to provide instantaneous audio playback start.
* **2026-07-07 (3)**: Implemented 3-Band Parametric Equalizer (Bass, Mid, Treble) for each deck. Designed a low-latency crossover-summation filter structure in C++ ([audio_engine.cpp](file:///c:/Users/user/Documents/projects/0xSoundPlayerv2/backend/audio_engine.cpp)) using first-order low-pass and high-pass IIR filters with dynamic coefficients calculated from the active sample rate. Bound the EQ parameters through Go ([app.go](file:///c:/Users/user/Documents/projects/0xSoundPlayerv2/backend/app.go)) to dynamic range sliders (-12dB to +12dB) with interactive Reset badges on the frontend ([DeckView.tsx](file:///c:/Users/user/Documents/projects/0xSoundPlayerv2/frontend/src/components/DeckView.tsx)).
* **2026-07-07 (4)**: Improved UI navigation and usability. Added "All Tracks" button at the top of the sidebar ([LibrarySidebar.tsx](file:///c:/Users/user/Documents/projects/0xSoundPlayerv2/frontend/src/components/LibrarySidebar.tsx)) to instantly reset all active filters (playlists, artists, genres).
* **2026-07-07 (5)**: **[BREAKING]** Removed DJ Decks UI entirely per user directive — this is a music player, not a DJ station. Deleted [DeckView.tsx](file:///c:/Users/user/Documents/projects/0xSoundPlayerv2/frontend/src/components/DeckView.tsx) component. Removed from [App.tsx](file:///c:/Users/user/Documents/projects/0xSoundPlayerv2/frontend/src/App.tsx): DeckView import, `activeTab === 'decks'` rendering block, `handleTempo`, `handlePitch`, `handleEq`, `handleCanvasClick`, `drawSpectrum`, `draw`, all canvas/spectrum refs and useEffects, `tempos`/`pitches`/`eqs` state, `SetEQ`/`SetTempo`/`SetPitch` imports. Cleaned `activeTab` union type across [AppHeader.tsx](file:///c:/Users/user/Documents/projects/0xSoundPlayerv2/frontend/src/components/AppHeader.tsx), [LibrarySidebar.tsx](file:///c:/Users/user/Documents/projects/0xSoundPlayerv2/frontend/src/components/LibrarySidebar.tsx), [MusiciansView.tsx](file:///c:/Users/user/Documents/projects/0xSoundPlayerv2/frontend/src/components/MusiciansView.tsx), [PlaybackBar.tsx](file:///c:/Users/user/Documents/projects/0xSoundPlayerv2/frontend/src/components/PlaybackBar.tsx). JS bundle reduced ~10KB. Backend C++ engine left intact (EQ, tempo, pitch APIs still exist for potential future use). All tests pass.

---

## 7. WebGL Fluid Visualizer & Mood Classification API

### 7.1 Mood Classification Engine (Go)
The Go backend classifies the track mood on the fly during audio loading and library scanning:

```go
func DetermineMood(bpm float64, key string, genre string) string
```

**Classification Rules**:
*   *Chill Genre Match*: "Lofi", "Ambient", "Chill", "Classical", "Relax" $\rightarrow$ `chill`
*   *High BPM (>110) & Heavy/Electronic Genre Match*: "Metal", "Rock", "EDM", "Dance", "Electronic" $\rightarrow$ `energetic`
*   *Heavy/Electronic Genre Match*: $\rightarrow$ `dark`
*   *High BPM ($\ge$ 125)*: Minor key $\rightarrow$ `dark`, Major key $\rightarrow$ `energetic`
*   *Mid BPM (100 - 125)*: Minor key $\rightarrow$ `chill`, Major key $\rightarrow$ `happy`
*   *Low BPM (<100)*: Minor key $\rightarrow$ `calm`, Major key $\rightarrow$ `peaceful`

### 7.2 WebGL Fluid Wave Visualizer (Frontend)
The isolated feature module `src/features/visualizer/` handles raw WebGL fluid blob drawing:

#### Component Signature:
```typescript
interface VisualizerContainerProps {
    activeSlot: 0 | 1;
    tracks: [TrackInfo | null, TrackInfo | null];
    playing: [boolean, boolean];
    currentTheme: string;
}

export const VisualizerContainer: React.FC<VisualizerContainerProps>
```

#### Deterministic Track Color Aura:
To make each track visually unique, the frontend computes a deterministic HSL color palette based on a hash of the track's absolute `filePath`:
*   `baseHue`: `hash % 360`
*   `secondaryHue`: `(baseHue + 40 + hash % 80) % 360`
*   `accentHue`: `(baseHue + 120 + hash % 120) % 360`
These hues are converted to HSL tuples: `bg` (dark/ambient, $L=4\%$), `accent` (neon highlight, $L=55\%$), `surface` (mid-tone core, $L=45\%$), and `muted` (warm shadow, $L=40\%$) before being passed to WebGL.

#### Phase Integration for Smoothness:
To prevent jerkiness and sudden twitches, the rendering pipeline integrates frequency energy into phase variables rather than mapping frequencies directly to vertex or coordinate displacements:
$$\text{phase}_i(t) = \text{phase}_i(t-\Delta t) + \Delta t \cdot \left(c_{\text{base}} + c_{\text{scale}} \cdot \text{energy}_i\right)$$
This accumulates momentum. When beats hit, the fluid accelerates; when beats fade, the fluid slows down to a gentle drift, ensuring continuous and smooth forward movement without snapping backward.

#### Localized Fluid Matter and Satellite Orbit:
The fragment shader draws a localized liquid blob entity on the right half of the canvas:
*   Main Blob: Centered at `vec2(aspect * 0.4, -0.05)`, warped dynamically by trigonometric space warping using phase variables.
*   Satellite Blob: Orbits the main body dynamically via `orbit = vec2(0.45 * sin(u_time * 0.5 + u_phaseMid * 0.3), 0.35 * cos(u_time * 0.4 + u_phaseHigh * 0.2))`.
*   Blend & Glow: Both fields are joined via a smooth union ($glow + satelliteGlow$), blending them organically when they touch. Swirling internal patterns mix the generated track colors to form rich multi-color gradients inside the matter. Capped at 30 FPS and downsampled 3x for maximum system efficiency and near-zero GPU load.