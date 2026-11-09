# ALT PROJECT JOURNAL: Synapse

- **last_updated**: 2026-11-09T23:21:00Z
- **scope**: Native desktop audio workstation & mixing player (Rust + GPUI + C++ DSP)
- **owner**: User & Alt

---

## Current State

- **Stack**: Rust 2021, `gpui-kit = "=0.9.0"` (pinned to `gpui-pre 0.3.11`), `synapse-audio-engine` (C++ DSP via git), SQLite (rusqlite 0.31 bundled), Lofty 0.21.
- **Build Status**:
  - `cargo check --all-targets`: PASS (0 warnings, clean).
  - `cargo test --bin synapse`: 24 unit tests passed (verifying ongoing run).
- **Core Features**:
  - Dual-deck mixing with equal-power automix crossfading.
  - 10-band peaking biquad EQ, 5-stage DSP (limiter, stereo width, reverb, bass boost, treble).
  - 64-band live FFT visualizer with logarithmic binning.
  - SQLite track database, metadata extraction, cover art caching.
  - Unbiased Fisher-Yates shuffle deck without replacement.
  - Daily rotating logger (`~/.synapse/logs`) with 7-day retention.
  - **Keyboard Navigation & Global Shortcuts**: Space (play/pause), Left/Right (seek ±5s), Up/Down (volume ±5%), M (mute), N/J (next), P/K (prev), S (shuffle), R (repeat), Q (queue), E (EQ), Esc (clear search / close panels).
  - **Playlist Management**: UI sidebar creation (`+ New`), deletion (`×`), track addition (`+P`), and track removal (`−`) with immediate SQLite synchronization.
  - **Playback Queue Resilience**: Automatic skipping and user status notification for missing or unreadable audio files without stalling the playback loop.

## Active Decisions

- **2026-11-10**: Single persistent journal rule — repository stores only `docs/ALT_JOURNAL.md` as the single source of truth; extraneous documentation and non-Rust build harnesses (`AGENT.md`, `EXPERIENCE.md`, Node build scripts) removed.
- **2026-11-10**: UI Framework constraint — strictly use `gpui-kit` re-exports (`use gpui_kit::*;`).
- **2026-11-10**: Global instruction updated — agent must never poll background compilation tasks, relying entirely on reactive event notifications.

## Risks and Mitigations

- **Risk**: Event bubbling collision between global keyboard shortcuts and search text input.
  - *Mitigation*: `handle_key_down` checks `search_input.focus_handle().is_focused(window)` before capturing keystrokes, reserving `Escape` to clear search.
- **Risk**: Infinite skipping loop if entire library files are deleted/missing on disk.
  - *Mitigation*: `play_next` bounds skip attempts to `(queue.len() + filtered.len())`, gracefully stopping and alerting the user if no playable files remain.

## Config and Environment

- Target platforms: Windows (MSVC), Linux (ALSA/Pulse/PipeWire, X11/Wayland), macOS (CoreAudio).
- State directories: `~/.synapse/` (DB: `library.db`, Logs: `logs/synapse-YYYY-MM-DD.log`).
- Environment overrides: `SYNAPSE_LOG` or `RUST_LOG` (trace, debug, info, warn, error).

## Hygiene Debt

- Clean: zero compiler warnings, zero dead npm scripts, minimal clean repository root.

## Verification Log

- **2026-11-10**: `cargo check --all-targets` verified clean (0 warnings, 0 errors, 1.56s).
- **2026-11-10**: `cargo test --bin synapse` verified (24/24 passed, 0 failed, 0 warnings).
