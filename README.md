# 🎧 0xPlay — High-Performance DSP Audio Workstation & Smart DJ Automixer

<div align="center">

[![Go](https://img.shields.io/badge/Go-1.23%2B-00ADD8?style=flat-square&logo=go&logoColor=white)](https://golang.org/)
[![C++11](https://img.shields.io/badge/C%2B%2B-11%20%2F%20DSP-00599C?style=flat-square&logo=c%2B%2B&logoColor=white)](https://isocpp.org/)
[![Wails v2](https://img.shields.io/badge/Framework-Wails_v2-DF0000?style=flat-square&logo=wails&logoColor=white)](https://wails.io/)
[![React](https://img.shields.io/badge/React-18%2B-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![WebGL](https://img.shields.io/badge/Render-WebGL_Shaders-990000?style=flat-square&logo=webgl&logoColor=white)](https://www.khronos.org/webgl/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

**An ultra-low latency desktop audio player and DJ automix workstation featuring embedded C++ DSP signal analysis, harmonic Camelot key detection, dynamic tempo ramping, phase-vocoded time stretching, and real-time WebGL fluid visualizers.**

[Key Features](#-key-features) • [Architecture](#-architecture) • [DSP Mathematics](#-dsp--automix-mathematics) • [Tech Stack](#-tech-stack) • [Quick Start](#-quick-start) • [Project Structure](#-project-structure) • [License](#-license)

</div>

---

## 📖 Overview

**0xPlay** (0xSoundPlayer) is a desktop audio player and harmonic mixing engine written in **Go**, **C++11**, and **React/TypeScript** using the **Wails v2** framework. Engineered for audiophiles, DJs, and music enthusiasts, it merges low-level digital signal processing with a fluid glassmorphic user interface.

Unlike traditional media players that rely on external system codecs, 0xPlay embeds lightweight C/C++ audio decoders directly into the binary, delivering instantaneous track decoding, sub-millisecond seek times, background BPM/key detection, and automated harmonic crossfades between tracks.

---

## ✨ Key Features

- ⚡ **Zero External Codec Dependencies**
  - Powered by header-only `miniaudio.h` with embedded static decoders for `MP3` (`dr_mp3`), `WAV` (`dr_wav`), and `FLAC` (`dr_flac`). Zero external `.dll` files, codecs, or runtime installations required.
- 🔬 **Real-Time DSP Signal Analysis Engine**
  - **RMS Waveform Peak Extraction**: Computes sample-block root-mean-square values to render interactive, high-framerate waveform timelines.
  - **Autocorrelation BPM Detection**: Downsamples 30-second audio envelopes to 200 Hz and applies autocorrelation to detect tempo within 60–180 BPM.
  - **Harmonic Key Detection (Camelot Wheel)**: Processes audio with Hanning windowed 2048-point FFT, projects frequency bins onto a 12-dimensional pitch-class chroma vector, correlates with Krumhansl-Schmuckler tonal profiles, and outputs standard Camelot keys (e.g., `8A` - A minor, `8B` - C major).
- 🎛️ **Intelligent DJ Automix Transition Engine**
  - **Beat-Aligned Quantization**: Automatically calculates transition start points aligned to full musical measures.
  - **Dynamic Continuous BPM Sync**: Seamlessly ramps playback speed of outgoing and incoming tracks on-the-fly inside the audio callback without phase discontinuity.
  - **Harmonic Pitch Matching**: Utilizes the high-quality **Signalsmith Stretch** phase vocoder to shift incoming track pitch ($\pm 2$ semitones) to the nearest compatible Camelot harmonic key without altering tempo.
  - **Equal-Power Trigonometric Crossfader**: Non-linear trigonometric fade curves maintain consistent acoustic energy throughout transitions.
- 🌊 **Hardware-Accelerated WebGL Liquid Wave Visualizer**
  - GPU-rendered fluid shader reacting in real-time to multi-band audio frequencies (sub-bass, mid, presence, air).
- 📁 **Asynchronous Library Indexing & Cache Management**
  - Multi-threaded non-blocking directory scanning (`~/.0xplayer`) with fast ID3 tag extraction and persistent JSON caching (`cache.json`).

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   0xPlay React / TypeScript UI                   │
│      (Glassmorphic Controls + WebGL Fluid Visualizer + Canvas)   │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ Wails v2 IPC Bridge / Events
┌─────────────────────────────────▼────────────────────────────────┐
│                        Go Backend Core                           │
│   (App Lifecycle + Library Scanner + Mutex Guards + Cache Sync)  │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ Cgo Low-Latency Boundary
┌─────────────────────────────────▼────────────────────────────────┐
│                    C++11 Real-Time Audio Engine                  │
│                                                                  │
│  ┌────────────────────────┐  ┌────────────────────────────────┐  │
│  │ miniaudio I/O Core     │  │ Signalsmith Stretch Vocoder    │  │
│  │ (dr_mp3, dr_wav, flac) │  │ (Pitch Shift & Time Stretch)   │  │
│  └────────────────────────┘  └────────────────────────────────┘  │
│  ┌────────────────────────┐  ┌────────────────────────────────┐  │
│  │ DSP Analysis Pipeline  │  │ Dynamic Automix Controller     │  │
│  │ (FFT, Chroma, Key, BPM)│  │ (Equal-Power Fade & BPM Sync)  │  │
│  └────────────────────────┘  └────────────────────────────────┘  │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ OS Native Audio Output
┌─────────────────────────────────▼────────────────────────────────┐
│              WASAPI (Windows) / CoreAudio (macOS) / ALSA (Linux) │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📐 DSP & Automix Mathematics

### 1. Equal-Power Crossfade
To prevent acoustic volume drops in the center of the mix, non-linear trigonometric curves are applied:

$$\text{Gain}_A(t) = \cos\left(t \cdot \frac{\pi}{2}\right), \quad \text{Gain}_B(t) = \sin\left(t \cdot \frac{\pi}{2}\right) \quad \text{where } t \in [0, 1]$$

### 2. Measure-Aligned Fade Duration
Crossfade duration ($T_{\text{fade}}$) is locked to whole musical bars ($C$ beats):

$$T_{\text{fade}} = \text{round}\left(\frac{C \cdot \text{BPM}_A}{240.0}\right) \cdot \frac{240.0}{\text{BPM}_A}$$

### 3. Dynamic Tempo Ramping
Tempo ratio is continuously recalculated per audio buffer frame:

$$\text{BPM}(t) = \text{BPM}_A \cdot (1 - t) + \text{BPM}_B \cdot t$$

---

## 🛠 Tech Stack

| Component | Technology | Description |
|---|---|---|
| **Backend & IPC** | Go 1.23, Wails v2 | Native desktop lifecycle, thread synchronization, and IPC binding |
| **Audio Core** | C++11, Cgo | Real-time audio rendering, buffer management, and multi-channel mix |
| **I/O & Decoders** | `miniaudio.h` | Multi-platform low-level audio driver and static decoders |
| **Phase Vocoder** | `Signalsmith Stretch` | High-fidelity spectral time-stretching and formant-clean pitch shifting |
| **Frontend UI** | React 18, TypeScript | Reactive library table, audio effects rack, and playback HUD |
| **Visual Effects** | WebGL, GLSL Shaders | GPU fluid dynamics audio visualizer with frequency response |
| **Audio Metadata** | `dhowden/tag` | Fast ID3v1/ID3v2, Vorbis, and FLAC metadata tag extraction |

---

## 🚀 Quick Start

### Prerequisites
- **Go**: `v1.21` or higher
- **Node.js**: `v18.0.0` or higher
- **C++ Compiler**:
  - **Windows**: MinGW-w64 (`mingw-w64-x86_64-gcc` via MSYS2)
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential` and `libasound2-dev`
- **Wails CLI**:
  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  ```

### 1. Clone the Repository
```bash
git clone https://github.com/T58574/0xPlay.git
cd 0xPlay
```

### 2. Run in Live Development Mode
Starts the Go backend watcher and Vite HMR dev server:
```bash
wails dev
```

### 3. Build Standalone Production Executable
Compiles optimized, zero-dependency native executable for Windows:
```bash
wails build -platform windows/amd64
```
Output executable will be generated at: `build/bin/SoundPlayer.exe`.

---

## 📁 Project Structure

```
0xPlay/
├── .github/
│   └── workflows/
│       └── release.yml      # Automated CI/CD Cgo compilation pipeline
├── backend/                 # Go & C++ Core Engine
│   ├── audio_engine.cpp     # Real-time C++ audio mixing, DSP & Automix logic
│   ├── audio_engine.h       # C interface headers for Cgo
│   ├── audio_engine.go      # Go wrapper and memory management
│   ├── app.go               # Wails API bindings and library management
│   ├── miniaudio.h          # Low-level audio device abstraction and decoders
│   └── signalsmith-stretch.h# Phase vocoder time-stretching and pitch-shifting
├── frontend/                # React / TypeScript Application
│   ├── src/
│   │   ├── components/      # UI Components (PlaybackBar, LibraryTable, AudioEffects)
│   │   ├── features/        # WebGL Fluid Wave Visualizer shaders & container
│   │   ├── App.tsx          # Main application orchestrator
│   │   └── App.css          # Glassmorphic styling and design tokens
│   ├── index.html           # Web viewport entry point
│   ├── package.json         # Frontend package manifest
│   └── vite.config.ts       # Vite bundler configuration
├── main.go                  # Wails application bootstrap
├── go.mod                   # Go module dependencies
├── wails.json               # Wails desktop configuration
├── LICENSE                  # MIT License
└── README.md                # Project documentation
```

---

## 📜 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
