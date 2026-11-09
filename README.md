# SYNAPSE // Audio Player & Mixing Workstation

Native desktop music player and DJ mixing workstation built with **Rust**, **GPUI**, and the **Synapse C++ DSP Audio Engine**.

## Highlights

- **Native GPU UI:** Rust + GPUI (via [GPUI Kit](https://gpui-kit.com)) — no webview, no Electron.
- **Dual-Deck Engine with Automix:** Smooth equal-power sinusoidal crossfading between tracks.
- **Studio DSP & 10-Band Equalizer:** Real-time peaking biquad EQ, peak limiter/maximizer, stereo widener, reverb, bass enhancer, and treble exciter.
- **64-Band Visualizer:** Live FFT spectrum with logarithmic binning, pink-noise tilt compensation, and falling peak dots.
- **Plain Dark Theme:** Neutral surfaces, a single accent color, Lucide vector icons.
- **Local Library:** Instant filtering, artist browsing, playlists, and smart search backed by SQLite.

## Architecture

Synapse is structured into modular components:

- **Frontend & UI:** `src/ui/` — a single GPUI `AppState` entity driving views through `gpui-kit` components.
- **Application Core:** Pure safe Rust managing state, concurrency, SQLite database, and file metadata via [Lofty](https://github.com/Serial-ATA/lofty-rs).
- **DSP Engine:** Standalone C++ audio core packaged in [synapse-audio-engine](https://github.com/T58574/synapse-audio-engine).

```
src/
├── main.rs        # application + assets bootstrap
├── ui/            # GPUI layer
│   ├── state.rs   # AppState entity: library, playback, DSP, settings, ticker
│   ├── theme.rs   # dark palette + bundled fonts
│   ├── format.rs  # duration formatting helpers
│   ├── artists.rs # artist aggregation
│   └── views/     # header/body shell, library, player, settings, equalizer
├── state/         # PlayerState, queue, history, DSP params
├── library/       # SQLite, scanner, metadata extraction
└── audio/         # safe wrapper over the C++ FFI
```

## Building & Running

### Requirements

- [Rust & Cargo](https://rustup.rs/) (stable, edition 2021)
- C++17 compatible compiler (MSVC on Windows, GCC/Clang on Linux/macOS)

### Build Commands

```bash
# Build release binary
cargo build --release

# Run application
cargo run --release

# Type-check everything
cargo check --all-targets

# Lint
cargo clippy --all-targets -- -D warnings

# Run unit tests
cargo test --bin synapse
```

## Dependency Pins

`gpui` on crates.io is stale (`0.2.x`) and type-incompatible with the current GPUI
stack. Synapse depends on `gpui-kit` only and imports GPUI through its re-export:

```toml
gpui-kit = "=0.9.0"   # pins gpui-pre 0.3.11, gpui-component 0.9
```

Verified against crates.io on 2026-11-06. `Cargo.lock` is committed.

## License

MIT
