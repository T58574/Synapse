# SYNAPSE // Cyberpunk Audio Player & DAW

High-performance native desktop music player and DJ mixing workstation built with **Rust**, **Slint**, and the **Synapse C++ DSP Audio Engine**.

## Highlights

- **Ultra-Lightweight Footprint:** Native compiled executable with **<70 MB RAM** usage (compared to 700+ MB on Electron/Chromium).
- **Dual-Deck Engine with Automix:** Smooth equal-power sinusoidal crossfading between tracks.
- **Studio DSP & 10-Band Equalizer:** Real-time peaking biquad EQ, peak limiter/maximizer, stereo widener, reverb, bass enhancer, and treble exciter.
- **Winamp-Style Silky Visualizer:** 64-band live FFT visualizer with logarithmic frequency binning, pink-noise tilt compensation, and falling peak dots.
- **Cyberpunk HUD Aesthetics:** Polished dark UI with vector icons, chamfered corner notches, cyber DAW faders, and toast notifications.
- **Zero-Latency Local Library:** Instant filtering, artist browsing, playlist management, and smart search backed by SQLite.

## Architecture

Synapse is structured into modular components:

- **Frontend & UI:** Declarative vector UI powered by [Slint](https://slint.dev/).
- **Application Core:** Pure safe Rust managing state, concurrency, SQLite database, and file metadata via [Lofty](https://github.com/Serial-ATA/lofty-rs).
- **DSP Engine:** Standalone C++ audio core packaged in [synapse-audio-engine](https://github.com/T58574/synapse-audio-engine).

## Building & Running

### Requirements

- [Rust & Cargo](https://rustup.rs/) (v1.75+)
- C++17 compatible compiler (MSVC on Windows, GCC/Clang on Linux/macOS)

### Build Commands

```bash
# Build release binary
cargo build --release

# Run application
cargo run --release

# Run unit tests
cargo test --bin synapse
```

## License

MIT
