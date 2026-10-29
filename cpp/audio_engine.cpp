#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef _CRT_SECURE_NO_WARNINGS
#define _CRT_SECURE_NO_WARNINGS
#endif
#ifndef _USE_MATH_DEFINES
#define _USE_MATH_DEFINES
#endif
#ifndef MA_COINIT_VALUE
#define MA_COINIT_VALUE 2 // 2 = COINIT_APARTMENTTHREADED (matches Windows GUI winit/OleInitialize)
#endif
#endif

#include <vector>
#include <string>
#include <cmath>
#include <algorithm>
#include <complex>
#include <mutex>
#include <cstdio>
#include <cstdarg>
#include <cstring>
#include <cstdlib>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#ifdef _WIN32
#include <windows.h>
static std::wstring utf8_to_wstring(const std::string& str) {
    if (str.empty()) return L"";
    int size_needed = MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), NULL, 0);
    std::wstring wstrTo(size_needed, 0);
    MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), &wstrTo[0], size_needed);
    return wstrTo;
}
#endif

#define MINIAUDIO_IMPLEMENTATION
#include "miniaudio.h"
#include "signalsmith-stretch.h"
#include "signalsmith-linear/fft.h"
#include "audio_engine.h"

// Простой лог в stderr + файл (~/.synapse/engine.log) для отладки C++ движка.
static FILE* g_log_file = nullptr;

static void engine_log_open() {
    if (g_log_file) return;
    const char* home = std::getenv("USERPROFILE");
    if (!home) home = std::getenv("HOME");
    if (!home) return;
    std::string path = std::string(home) + "/.synapse/engine.log";
#ifdef _WIN32
    std::wstring wpath = utf8_to_wstring(path);
    g_log_file = _wfopen(wpath.c_str(), L"a");
#else
    g_log_file = std::fopen(path.c_str(), "a");
#endif
}

static void engine_log(const char* level, const char* fmt, ...) {
    va_list args1;
    va_start(args1, fmt);
    va_list args2;
    va_copy(args2, args1);
    char buf[1024];
    std::vsnprintf(buf, sizeof(buf), fmt, args1);
    va_end(args1);
    char line[1280];
    std::snprintf(line, sizeof(line), "[%-5s] %s\n", level, buf);
    va_end(args2);
    std::fwrite(line, 1, std::strlen(line), stderr);
    if (g_log_file) {
        std::fseek(g_log_file, 0, SEEK_END);
        std::fwrite(line, 1, std::strlen(line), g_log_file);
        std::fflush(g_log_file);
    }
}

#define ENGINE_LOGI(...) engine_log("INFO", __VA_ARGS__)
#define ENGINE_LOGW(...) engine_log("WARN", __VA_ARGS__)
#define ENGINE_LOGE(...) engine_log("ERROR", __VA_ARGS__)

static const float EQ_FREQS[10] = { 31.25f, 62.5f, 125.0f, 250.0f, 500.0f, 1000.0f, 2000.0f, 4000.0f, 8000.0f, 16000.0f };

struct EqFilter {
    float lp_state[2] = {0.0f, 0.0f};
    float hp_state[2] = {0.0f, 0.0f};
    float hp_prev_in[2] = {0.0f, 0.0f};
    
    float bass_gain = 1.0f;
    float mid_gain = 1.0f;
    float treble_gain = 1.0f;

    void process(const float* in_frame, float* out_frame, float alpha_lp, float alpha_hp) {
        for (int c = 0; c < 2; ++c) {
            float in_val = in_frame[c];
            lp_state[c] = lp_state[c] + (1.0f - alpha_lp) * (in_val - lp_state[c]);
            float low_val = lp_state[c];
            hp_state[c] = alpha_hp * (hp_state[c] + in_val - hp_prev_in[c]);
            hp_prev_in[c] = in_val;
            float high_val = hp_state[c];
            float mid_val = in_val - low_val - high_val;
            out_frame[c] = low_val * bass_gain + mid_val * mid_gain + high_val * treble_gain;
        }
    }
};

struct BiquadFilter {
    float b0 = 1.0f, b1 = 0.0f, b2 = 0.0f, a1 = 0.0f, a2 = 0.0f;
    float x1[2] = {0.0f, 0.0f};
    float x2[2] = {0.0f, 0.0f};
    float y1[2] = {0.0f, 0.0f};
    float y2[2] = {0.0f, 0.0f};

    void reset() {
        x1[0] = x1[1] = x2[0] = x2[1] = 0.0f;
        y1[0] = y1[1] = y2[0] = y2[1] = 0.0f;
    }

    void init_peaking(float sample_rate, float frequency, float q, float db_gain) {
        float w0 = 2.0f * 3.14159265358979323846f * frequency / sample_rate;
        float alpha = sinf(w0) / (2.0f * q);
        float A = powf(10.0f, db_gain / 40.0f);
        float cos_w0 = cosf(w0);
        float a0 = 1.0f + alpha / A;
        b0 = (1.0f + alpha * A) / a0;
        b1 = (-2.0f * cos_w0) / a0;
        b2 = (1.0f - alpha * A) / a0;
        a1 = (-2.0f * cos_w0) / a0;
        a2 = (1.0f - alpha / A) / a0;
    }

    void process(const float* in, float* out) {
        for (int c = 0; c < 2; ++c) {
            float x = in[c];
            float y = b0 * x + b1 * x1[c] + b2 * x2[c] - a1 * y1[c] - a2 * y2[c];
            if (std::isnan(y) || std::isinf(y)) {
                y = 0.0f;
            }
            x2[c] = x1[c];
            x1[c] = x;
            y2[c] = y1[c];
            y1[c] = y;
            out[c] = y;
        }
    }
};

struct Limiter {
    float envelope = 0.0f;
    float threshold = 0.95f; 
    float attack = 0.9999f;
    float release = 0.992f;
    float boost_db = 0.0f;

    void reset() {
        envelope = 0.0f;
    }

    void process(float* frame) {
        float boost_gain = powf(10.0f, boost_db / 20.0f);
        float l = frame[0] * boost_gain;
        float r = frame[1] * boost_gain;
        float peak = std::max(fabsf(l), fabsf(r));
        if (peak > envelope) {
            envelope = envelope + (1.0f - attack) * (peak - envelope);
        } else {
            envelope = envelope + (1.0f - release) * (peak - envelope);
        }
        float gain = 1.0f;
        if (envelope > threshold) {
            gain = threshold / envelope;
        }
        frame[0] = l * gain;
        frame[1] = r * gain;
    }
};

struct DelayLine {
    std::vector<float> buffer;
    size_t write_ptr = 0;
    void init(int size) {
        buffer.assign(size, 0.0f);
        write_ptr = 0;
    }
    void reset() {
        if (!buffer.empty()) {
            std::fill(buffer.begin(), buffer.end(), 0.0f);
        }
        write_ptr = 0;
    }
    float read(int delay_samples) {
        if (buffer.empty()) return 0.0f;
        int read_ptr = (int)write_ptr - delay_samples;
        while (read_ptr < 0) read_ptr += buffer.size();
        return buffer[read_ptr % buffer.size()];
    }
    void write(float val) {
        if (buffer.empty()) return;
        buffer[write_ptr] = val;
        write_ptr = (write_ptr + 1) % buffer.size();
    }
};

struct Reverb {
    DelayLine delay_l;
    DelayLine delay_r;
    float room_size = 0.6f;
    float mix = 0.0f;
    float wet_l_prev = 0.0f;
    float wet_r_prev = 0.0f;
    bool initialized = false;

    void init(int sample_rate) {
        delay_l.init((int)(sample_rate * 0.25f));
        delay_r.init((int)(sample_rate * 0.28f));
        wet_l_prev = 0.0f;
        wet_r_prev = 0.0f;
        initialized = true;
    }

    void reset() {
        delay_l.reset();
        delay_r.reset();
        wet_l_prev = 0.0f;
        wet_r_prev = 0.0f;
    }

    void process(float* frame, int sample_rate) {
        if (!initialized) init(sample_rate);
        if (mix <= 0.0f) return;
        
        float wet_l = delay_l.read((int)(sample_rate * 0.045f)) + 0.35f * delay_r.read((int)(sample_rate * 0.085f));
        float wet_r = delay_r.read((int)(sample_rate * 0.055f)) + 0.35f * delay_l.read((int)(sample_rate * 0.095f));

        wet_l_prev = wet_l_prev + 0.25f * (wet_l - wet_l_prev);
        wet_r_prev = wet_r_prev + 0.25f * (wet_r - wet_r_prev);

        float dry_l = frame[0];
        float dry_r = frame[1];

        delay_l.write(dry_l + wet_l_prev * room_size);
        delay_r.write(dry_r + wet_r_prev * room_size);

        frame[0] = dry_l * (1.0f - mix) + wet_l_prev * mix;
        frame[1] = dry_r * (1.0f - mix) + wet_r_prev * mix;
    }
};

struct BassEnhancer {
    float lp_state[2] = {0.0f, 0.0f};
    float amount = 0.0f;

    void reset() {
        lp_state[0] = lp_state[1] = 0.0f;
    }

    void process(float* frame, float sample_rate) {
        if (amount <= 0.0f) return;
        float alpha = (float)exp(-2.0 * 3.14159265358979323846 * 120.0 / sample_rate);
        for (int c = 0; c < 2; ++c) {
            float in = frame[c];
            lp_state[c] = lp_state[c] + (1.0f - alpha) * (in - lp_state[c]);
            float bass = lp_state[c];
            float harmonics = sinf(bass * 1.6f);
            frame[c] = in + harmonics * amount * 0.3f;
        }
    }
};

struct Exciter {
    float hp_state[2] = {0.0f, 0.0f};
    float amount = 0.0f;

    void reset() {
        hp_state[0] = hp_state[1] = 0.0f;
    }

    void process(float* frame, float sample_rate) {
        if (amount <= 0.0f) return;
        float alpha = (float)exp(-2.0 * 3.14159265358979323846 * 5500.0 / sample_rate);
        for (int c = 0; c < 2; ++c) {
            float in = frame[c];
            float hp = in - (hp_state[c] + (1.0f - alpha) * (in - hp_state[c]));
            hp_state[c] = hp_state[c] + (1.0f - alpha) * (in - hp_state[c]);
            float saturated = tanhf(hp * 2.5f);
            frame[c] = in + saturated * amount * 0.25f;
        }
    }
};

struct TrackState {
    ma_decoder* decoder = nullptr;
    bool has_decoder = false;
    signalsmith::stretch::SignalsmithStretch<float> stretch;
    bool stretch_initialized = false;
    bool is_playing = false;
    double seek_position = -1.0;
    float volume = 1.0f;
    double tempo_ratio = 1.0;
    double pitch_semi = 0.0;
    double duration = 0.0;
    double bpm = 120.0;
    std::string key = "8A";
    std::vector<float> waveform;
    std::vector<float> recent_samples;
    int recent_ptr = 0;
    EqFilter eq;
    BiquadFilter eq10[10];
    float eq10_gains[10] = {0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
    Limiter limiter;
    Reverb reverb;
    BassEnhancer bass_enhancer;
    Exciter exciter;
    float stereo_width = 1.0f;
    std::mutex mtx;
};

static ma_device g_device;
static bool g_device_initialized = false;
static std::string g_device_id_hex = "default";

static std::string device_id_to_hex(const ma_device_id& id) {
    char buf[1024];
    char* p = buf;
    const unsigned char* bytes = (const unsigned char*)&id;
    for (size_t i = 0; i < sizeof(ma_device_id); i++) {
        p += sprintf(p, "%02x", bytes[i]);
    }
    return std::string(buf);
}

static ma_device_id hex_to_device_id(const std::string& hex) {
    ma_device_id id;
    memset(&id, 0, sizeof(ma_device_id));
    if (hex.length() != sizeof(ma_device_id) * 2) {
        return id;
    }
    unsigned char* bytes = (unsigned char*)&id;
    for (size_t i = 0; i < sizeof(ma_device_id); i++) {
        unsigned int val;
        sscanf(hex.substr(i * 2, 2).c_str(), "%x", &val);
        bytes[i] = (unsigned char)val;
    }
    return id;
}

static std::string json_escape(const std::string& str) {
    std::string escaped = "\"";
    for (char c : str) {
        if (c == '\\') escaped += "\\\\";
        else if (c == '"') escaped += "\\\"";
        else if (c == '\n') escaped += "\\n";
        else if (c == '\r') escaped += "\\r";
        else if (c == '\t') escaped += "\\t";
        else if ((unsigned char)c < 32) {
            char buf[8];
            sprintf(buf, "\\u%04x", (int)c);
            escaped += buf;
        } else {
            escaped += c;
        }
    }
    escaped += "\"";
    return escaped;
}

static TrackState g_tracks[2];
static bool g_automix_enabled = false;
static int g_mixer_state = 0;
static double g_crossfade_elapsed = 0.0;
static double g_crossfade_duration = 8.0;
static int g_sample_rate = 44100;
static int g_channels = 2;

static const double major_template[12] = {6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88};
static const double minor_template[12] = {6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17};

static const char* get_camelot_key(int key_index, bool is_minor) {
    int val = 0;
    if (is_minor) {
        val = ((key_index * 7) + 5) % 12;
    } else {
        val = ((key_index * 7) + 8) % 12;
    }
    if (val == 0) val = 12;
    
    static const char* buf[24] = {
        "1A", "2A", "3A", "4A", "5A", "6A", "7A", "8A", "9A", "10A", "11A", "12A",
        "1B", "2B", "3B", "4B", "5B", "6B", "7B", "8B", "9B", "10B", "11B", "12B"
    };
    int idx = val - 1;
    if (!is_minor) idx += 12;
    return buf[idx];
}

static const char* get_shifted_key(const char* camelot, int semitones) {
    bool is_minor = (camelot[strlen(camelot) - 1] == 'A');
    int idx = 0;
    if (is_minor) {
        for (int i = 0; i < 12; i++) {
            if (strcmp(get_camelot_key(i, true), camelot) == 0) {
                idx = i;
                break;
            }
        }
        return get_camelot_key((idx + semitones + 120) % 12, true);
    } else {
        for (int i = 0; i < 12; i++) {
            if (strcmp(get_camelot_key(i, false), camelot) == 0) {
                idx = i;
                break;
            }
        }
        return get_camelot_key((idx + semitones + 120) % 12, false);
    }
}

static bool keys_compatible(const char* k1, const char* k2) {
    bool m1 = (k1[strlen(k1) - 1] == 'A');
    bool m2 = (k2[strlen(k2) - 1] == 'A');
    int n1 = atoi(k1);
    int n2 = atoi(k2);
    if (n1 == n2) return true;
    if (m1 == m2) {
        int diff = abs(n1 - n2);
        if (diff == 1 || diff == 11) return true;
    }
    return false;
}

static void fft(std::vector<std::complex<double>>& a) {
    int n = a.size();
    static thread_local signalsmith::linear::SimpleFFT<double> fft_helper(0);
    static thread_local size_t current_size = 0;
    if (current_size != n) {
        fft_helper.resize(n);
        current_size = n;
    }
    std::vector<std::complex<double>> out(n);
    fft_helper.fft(a.data(), out.data());
    a = std::move(out);
}

// Создаёт декодер с фиксированным выходным форматом: f32, 2 канала, 44100 Гц.
// Это критично: без явного формата dec.outputSampleRate/outputChannels могут
// быть нулевыми/моно, а ma_decoder_get_length_in_pcm_frames для MP3 без
// Xing/LAME-заголовка часто возвращает 0 — отсюда баг "0:00".
static ma_result init_decoder_fixed(const char* file_path, ma_decoder* dec) {
    ma_decoder_config cfg = ma_decoder_config_init(
        ma_format_f32, 2, g_sample_rate);
#ifdef _WIN32
    std::wstring wpath = utf8_to_wstring(file_path);
    return ma_decoder_init_file_w(wpath.c_str(), &cfg, dec);
#else
    return ma_decoder_init_file(file_path, &cfg, dec);
#endif
}

// Надёжно вычисляет длительность в секундах. Сначала пробует быстрый путь
// через ma_decoder_get_length_in_pcm_frames; если он возвращает 0 (типично
// для VBR MP3 без заголовка), делает полный проход подсчёта фреймов.
static double compute_decoder_duration(ma_decoder* dec) {
    ma_uint64 total_frames = 0;
    ma_result r = ma_decoder_get_length_in_pcm_frames(dec, &total_frames);
    if (r == MA_SUCCESS && total_frames > 0 && dec->outputSampleRate > 0) {
        ENGINE_LOGI("duration: fast path frames=%llu sr=%u",
                    (unsigned long long)total_frames, dec->outputSampleRate);
        return (double)total_frames / (double)dec->outputSampleRate;
    }
    ENGINE_LOGW("duration: fast path дал 0/ошибку (r=%d), выполняю полный проход", (int)r);
    ma_uint64 cursor_before = 0;
    ma_decoder_get_cursor_in_pcm_frames(dec, &cursor_before);

    // Полный проход: читаем чанками и суммируем.
    const int chunk = 8192;
    std::vector<float> tmp(chunk * dec->outputChannels);
    ma_uint64 total = 0;
    while (true) {
        ma_uint64 read = 0;
        ma_decoder_read_pcm_frames(dec, tmp.data(), chunk, &read);
        if (read == 0) break;
        total += read;
    }
    // Возвращаем курсор в начало, чтобы дальше декодер можно было
    // использовать для воспроизведения/анализа BPM.
    ma_decoder_seek_to_pcm_frame(dec, 0);
    double dur = dec->outputSampleRate > 0 ? (double)total / (double)dec->outputSampleRate : 0.0;
    ENGINE_LOGI("duration: full scan frames=%llu sr=%u -> %.3fs",
                (unsigned long long)total, dec->outputSampleRate, dur);
    return dur;
}

static void analyze_audio(const char* file_path, double* out_duration, double* out_bpm, const char** out_key, std::vector<float>& out_waveform) {
    ENGINE_LOGI("analyze_audio: %s", file_path);
    ma_decoder dec;
    if (init_decoder_fixed(file_path, &dec) != MA_SUCCESS) {
        ENGINE_LOGE("analyze_audio: ma_decoder_init_file FAILED for %s", file_path);
        *out_duration = 0.0;
        *out_bpm = 120.0;
        *out_key = "8A";
        return;
    }
    ENGINE_LOGI("analyze_audio: decoder sr=%u ch=%u", dec.outputSampleRate, dec.outputChannels);

    double duration = compute_decoder_duration(&dec);
    *out_duration = duration;

    // После compute_decoder_duration курсор сброшен в 0 — читаем форму волны с
    // начала.
    std::vector<float> peaks;
    int chunk_size = (int)(dec.outputSampleRate * 2.0);
    std::vector<float> chunk_buf(chunk_size * dec.outputChannels);
    while (true) {
        ma_uint64 read_frames = 0;
        ma_decoder_read_pcm_frames(&dec, chunk_buf.data(), chunk_size, &read_frames);
        if (read_frames == 0) break;
        float max_val = 0.0f;
        for (ma_uint64 i = 0; i < read_frames * dec.outputChannels; i++) {
            float val = fabsf(chunk_buf[i]);
            if (val > max_val) max_val = val;
        }
        peaks.push_back(max_val);
    }
    out_waveform = peaks;

    // BPM/ключ анализируем на фрагменте: для коротких файлов с 0, для длинных — с 25% длительности.
    ma_uint64 analysis_start = 0;
    if (duration > 35.0) {
        analysis_start = (ma_uint64)(duration * 0.25 * dec.outputSampleRate);
    }
    ma_decoder_seek_to_pcm_frame(&dec, analysis_start);
    int analysis_frames = (int)(dec.outputSampleRate * 30.0);
    std::vector<float> analysis_buf(analysis_frames * dec.outputChannels);
    ma_uint64 read_analysis = 0;
    ma_decoder_read_pcm_frames(&dec, analysis_buf.data(), analysis_frames, &read_analysis);
    
    if (read_analysis == 0) {
        *out_bpm = 120.0;
        *out_key = "8A";
        ma_decoder_uninit(&dec);
        return;
    }

    std::vector<float> mono_buf(read_analysis);
    for (ma_uint64 i = 0; i < read_analysis; i++) {
        float sum = 0.0f;
        for (ma_uint32 c = 0; c < dec.outputChannels; c++) {
            sum += analysis_buf[i * dec.outputChannels + c];
        }
        mono_buf[i] = sum / dec.outputChannels;
    }
    
    double target_fs = 200.0;
    int downsample_ratio = (int)(dec.outputSampleRate / target_fs);
    if (downsample_ratio < 1) downsample_ratio = 1;
    double actual_env_fs = (double)dec.outputSampleRate / (double)downsample_ratio;
    size_t env_size = mono_buf.size() / downsample_ratio;
    if (env_size < 2) {
        *out_bpm = 120.0;
        *out_key = "8A";
        ma_decoder_uninit(&dec);
        return;
    }
    std::vector<float> env(env_size);
    const float* src = mono_buf.data();
    float* dst = env.data();
    float inv_ratio = 1.0f / downsample_ratio;

    for (size_t i = 0; i < env_size; ++i) {
        float sum = 0.0f;
        int offset = i * downsample_ratio;

        int j = 0;
        for (; j <= downsample_ratio - 4; j += 4) {
            sum += fabsf(src[offset + j]) +
                   fabsf(src[offset + j + 1]) +
                   fabsf(src[offset + j + 2]) +
                   fabsf(src[offset + j + 3]);
        }
        for (; j < downsample_ratio; ++j) {
            sum += fabsf(src[offset + j]);
        }
        dst[i] = sum * inv_ratio;
    }
    
    std::vector<float> onset(env.size(), 0.0f);
    for (size_t i = 1; i < env.size(); i++) {
        float diff = env[i] - env[i - 1];
        onset[i] = diff > 0.0f ? diff : 0.0f;
    }
    
    int min_lag = (int)(actual_env_fs * 60.0 / 300.0);
    int max_lag = (int)(actual_env_fs * 60.0 / 60.0);
    if (max_lag >= (int)onset.size()) {
        max_lag = (int)onset.size() - 1;
    }
    if (min_lag < 1) min_lag = 1;

    std::vector<double> corrs(max_lag + 2, 0.0);
    double max_corr = -1.0;
    int best_lag = min_lag;
    for (int lag = min_lag; lag <= max_lag; lag++) {
        double corr = 0.0;
        int count = 0;
        for (size_t i = lag; i < onset.size(); i++) {
            corr += (double)onset[i] * onset[i - lag];
            count++;
        }
        if (count > 0) {
            corr /= count;
            corrs[lag] = corr;
            if (corr > max_corr) {
                max_corr = corr;
                best_lag = lag;
            }
        }
    }

    int half_lag = best_lag / 2;
    if (half_lag >= min_lag && corrs[half_lag] > max_corr * 0.7) {
        best_lag = half_lag;
    }

    double fractional_lag = (double)best_lag;
    if (best_lag > min_lag && best_lag < max_lag) {
        double alpha = corrs[best_lag - 1];
        double beta  = corrs[best_lag];
        double gamma = corrs[best_lag + 1];
        double denom = alpha - 2.0 * beta + gamma;
        if (denom != 0.0) {
            double p = 0.5 * (alpha - gamma) / denom;
            if (p >= -1.0 && p <= 1.0) {
                fractional_lag = best_lag + p;
            }
        }
    }

    double calc_bpm = 120.0;
    if (fractional_lag > 0.0) {
        calc_bpm = 60.0 * actual_env_fs / fractional_lag;
    }
    while (calc_bpm < 70.0) calc_bpm *= 2.0;
    while (calc_bpm > 180.0) calc_bpm /= 2.0;
    *out_bpm = std::round(calc_bpm);
    if (*out_bpm < 40.0 || *out_bpm > 250.0 || std::isnan(*out_bpm)) {
        *out_bpm = 120.0;
    }
    
    int fft_size = 4096;
    std::vector<std::complex<double>> fft_in(fft_size);
    std::vector<double> chroma(12, 0.0);
    int step_size = fft_size / 2;
    for (size_t offset = 0; offset + fft_size <= mono_buf.size(); offset += step_size) {
        for (int i = 0; i < fft_size; i++) {
            double w = 0.5 * (1.0 - cos(2.0 * M_PI * i / (fft_size - 1)));
            fft_in[i] = std::complex<double>(mono_buf[offset + i] * w, 0.0);
        }
        fft(fft_in);
        for (int k = 1; k < fft_size / 2; k++) {
            double freq = k * (double)dec.outputSampleRate / fft_size;
            if (freq >= 50.0 && freq <= 2000.0) {
                double pitch = 12.0 * log2(freq / 440.0) + 69.0;
                double bin_frac = pitch - floor(pitch);
                int bin_low = (int)floor(pitch) % 12;
                int bin_high = (bin_low + 1) % 12;
                if (bin_low < 0) bin_low += 12;
                if (bin_high < 0) bin_high += 12;
                double mag = abs(fft_in[k]);
                chroma[bin_low] += mag * (1.0 - bin_frac);
                chroma[bin_high] += mag * bin_frac;
            }
        }
    }
    
    double max_r = -2.0;
    int best_key_idx = 0;
    bool best_is_minor = false;
    for (int k = 0; k < 24; k++) {
        int key_idx = k % 12;
        bool is_minor = k >= 12;
        const double* temp = is_minor ? minor_template : major_template;
        
        double sum_x = 0.0, sum_y = 0.0;
        for (int i = 0; i < 12; i++) {
            sum_x += chroma[i];
            sum_y += temp[(i - key_idx + 12) % 12];
        }
        double mean_x = sum_x / 12.0;
        double mean_y = sum_y / 12.0;
        
        double num = 0.0, den_x = 0.0, den_y = 0.0;
        for (int i = 0; i < 12; i++) {
            double diff_x = chroma[i] - mean_x;
            double diff_y = temp[(i - key_idx + 12) % 12] - mean_y;
            num += diff_x * diff_y;
            den_x += diff_x * diff_x;
            den_y += diff_y * diff_y;
        }
        double r = 0.0;
        if (den_x > 0.0 && den_y > 0.0) {
            r = num / sqrt(den_x * den_y);
        }
        if (r > max_r) {
            max_r = r;
            best_key_idx = key_idx;
            best_is_minor = is_minor;
        }
    }
    if (max_r > -1.0) {
        *out_key = get_camelot_key(best_key_idx, best_is_minor);
    } else {
        *out_key = "8A";
    }
    ma_decoder_uninit(&dec);
}

static void get_audio_frames(TrackState& ts, float* out_buffer, int frame_count, int channels, int sample_rate) {
    std::lock_guard<std::mutex> lock(ts.mtx);
    if (!ts.has_decoder || !ts.decoder || !ts.is_playing) {
        memset(out_buffer, 0, frame_count * channels * sizeof(float));
        return;
    }

    auto apply_eq = [&](float* buf, int f_count) {
        double cutoff_lp = 250.0;
        double cutoff_hp = 4000.0;
        float alpha_lp = (float)exp(-2.0 * M_PI * cutoff_lp / sample_rate);
        float alpha_hp = (float)exp(-2.0 * M_PI * cutoff_hp / sample_rate);
        for (int i = 0; i < f_count; i++) {
            float in_frame[2] = { buf[i * channels], buf[i * channels + 1] };
            float out_frame[2] = { 0.0f, 0.0f };
            ts.eq.process(in_frame, out_frame, alpha_lp, alpha_hp);
            buf[i * channels] = out_frame[0];
            buf[i * channels + 1] = out_frame[1];
        }
    };

    auto apply_dsp = [&](float* buf, int f_count) {
        // 1. 10-band EQ
        for (int i = 0; i < f_count; i++) {
            float out_frame[2] = { buf[i * channels], buf[i * channels + 1] };
            for (int b = 0; b < 10; b++) {
                float tmp[2];
                ts.eq10[b].process(out_frame, tmp);
                out_frame[0] = tmp[0];
                out_frame[1] = tmp[1];
            }
            buf[i * channels] = out_frame[0];
            buf[i * channels + 1] = out_frame[1];
        }

        // 2. Enhancers (Bass, Exciter)
        for (int i = 0; i < f_count; i++) {
            float frame[2] = { buf[i * channels], buf[i * channels + 1] };
            ts.bass_enhancer.process(frame, (float)sample_rate);
            ts.exciter.process(frame, (float)sample_rate);
            buf[i * channels] = frame[0];
            buf[i * channels + 1] = frame[1];
        }

        // 3. Stereo Widener
        if (ts.stereo_width != 1.0f) {
            for (int i = 0; i < f_count; i++) {
                float l = buf[i * channels];
                float r = buf[i * channels + 1];
                float mid = (l + r) * 0.5f;
                float side = (l - r) * 0.5f;
                side *= ts.stereo_width;
                buf[i * channels] = mid + side;
                buf[i * channels + 1] = mid - side;
            }
        }

        // 4. Reverb
        for (int i = 0; i < f_count; i++) {
            float frame[2] = { buf[i * channels], buf[i * channels + 1] };
            ts.reverb.process(frame, sample_rate);
            buf[i * channels] = frame[0];
            buf[i * channels + 1] = frame[1];
        }

        // 5. Limiter / Maximizer
        for (int i = 0; i < f_count; i++) {
            float frame[2] = { buf[i * channels], buf[i * channels + 1] };
            ts.limiter.process(frame);
            buf[i * channels] = frame[0];
            buf[i * channels + 1] = frame[1];
        }
    };
    
    if (ts.seek_position >= 0.0) {
        ma_uint64 target_frame = (ma_uint64)(ts.seek_position * ts.decoder->outputSampleRate);
        ts.recent_samples.assign(1024, 0.0f);
        ts.recent_ptr = 0;
        ma_uint64 total_frames = 0;
        if (ma_decoder_get_length_in_pcm_frames(ts.decoder, &total_frames) == MA_SUCCESS) {
            if (target_frame >= total_frames) {
                target_frame = total_frames > 0 ? total_frames - 1 : 0;
            }
        }
        ma_decoder_seek_to_pcm_frame(ts.decoder, target_frame);
        ts.seek_position = -1.0;
        if (ts.stretch_initialized) {
            ts.stretch.reset();
        }
    }
    
    if (!g_automix_enabled && ts.tempo_ratio == 1.0 && ts.pitch_semi == 0.0) {
        ma_uint64 read_frames = 0;
        ma_decoder_read_pcm_frames(ts.decoder, out_buffer, frame_count, &read_frames);
        for (ma_uint64 i = 0; i < read_frames * channels; i++) {
            volatile float* p = &out_buffer[i];
            *p = *p * ts.volume;
        }
        if (read_frames < (ma_uint64)frame_count) {
            memset(out_buffer + read_frames * channels, 0, (frame_count - read_frames) * channels * sizeof(float));
            if (read_frames == 0) {
                ts.is_playing = false;
                ENGINE_LOGI("get_audio_frames: трек дошёл до конца (EOF) duration=%.3fs", ts.duration);
            }
        }

        apply_eq(out_buffer, frame_count);
        apply_dsp(out_buffer, frame_count);

        if (ts.recent_samples.empty()) {
            ts.recent_samples.assign(1024, 0.0f);
        }
        for (int i = 0; i < frame_count; i++) {
            float mono = out_buffer[i * channels];
            if (channels > 1) {
                mono = (mono + out_buffer[i * channels + 1]) * 0.5f;
            }
            ts.recent_samples[ts.recent_ptr] = mono;
            ts.recent_ptr = (ts.recent_ptr + 1) % 1024;
        }
        return;
    }
    
    if (!ts.stretch_initialized) {
        ts.stretch.presetDefault(channels, sample_rate);
        ts.stretch_initialized = true;
    }
    
    int M = (int)round(frame_count * ts.tempo_ratio);
    if (M <= 0) M = 1;
    
    std::vector<float> temp_in(M * channels);
    ma_uint64 read_frames = 0;
    ma_decoder_read_pcm_frames(ts.decoder, temp_in.data(), M, &read_frames);
    if (read_frames < (ma_uint64)M) {
        memset(temp_in.data() + read_frames * channels, 0, (M - read_frames) * channels * sizeof(float));
        if (read_frames == 0) {
            memset(out_buffer, 0, frame_count * channels * sizeof(float));
            ts.is_playing = false;
            return;
        }
    }
    
    std::vector<float> chan_in[2];
    chan_in[0].resize(M);
    chan_in[1].resize(M);
    for (int i = 0; i < M; i++) {
        chan_in[0][i] = temp_in[i * channels];
        chan_in[1][i] = temp_in[i * channels + 1];
    }
    
    std::vector<float> chan_out[2];
    chan_out[0].resize(frame_count);
    chan_out[1].resize(frame_count);
    
    float* input_ptrs[2] = { chan_in[0].data(), chan_in[1].data() };
    float* output_ptrs[2] = { chan_out[0].data(), chan_out[1].data() };
    
    ts.stretch.setTransposeSemitones(ts.pitch_semi);
    ts.stretch.process(input_ptrs, M, output_ptrs, frame_count);
    
    for (int i = 0; i < frame_count; i++) {
        out_buffer[i * channels] = chan_out[0][i] * ts.volume;
        out_buffer[i * channels + 1] = chan_out[1][i] * ts.volume;
    }

    apply_eq(out_buffer, frame_count);
    apply_dsp(out_buffer, frame_count);

    if (ts.recent_samples.empty()) {
        ts.recent_samples.assign(1024, 0.0f);
    }
    for (int i = 0; i < frame_count; i++) {
        float mono = out_buffer[i * channels];
        if (channels > 1) {
            mono = (mono + out_buffer[i * channels + 1]) * 0.5f;
        }
        ts.recent_samples[ts.recent_ptr] = mono;
        ts.recent_ptr = (ts.recent_ptr + 1) % 1024;
    }
}

static double g_actual_crossfade_duration = 8.0;

static void audio_callback(ma_device* pDevice, void* pOutput, const void* pInput, ma_uint32 frameCount) {
    if (!pDevice || !pOutput || frameCount == 0) return;
    float* out = (float*)pOutput;
    int channels = pDevice->playback.channels;
    int sample_rate = pDevice->sampleRate;
    if (channels <= 0 || sample_rate <= 0) return;

    if (g_mixer_state == 1 || g_mixer_state == 3) {
        g_crossfade_elapsed += (double)frameCount / sample_rate;
        double t = g_crossfade_elapsed / g_actual_crossfade_duration;
        if (t < 0.0) t = 0.0;
        if (t > 1.0) t = 1.0;

        double bpm0 = g_tracks[0].bpm;
        double bpm1 = g_tracks[1].bpm;
        if (bpm0 < 30.0 || bpm0 > 300.0) bpm0 = 120.0;
        if (bpm1 < 30.0 || bpm1 > 300.0) bpm1 = 120.0;

        if (g_mixer_state == 1) {
            {
                std::lock_guard<std::mutex> lock0(g_tracks[0].mtx);
                g_tracks[0].tempo_ratio = 1.0 * (1.0 - t) + (bpm1 / bpm0) * t;
            }
            {
                std::lock_guard<std::mutex> lock1(g_tracks[1].mtx);
                g_tracks[1].tempo_ratio = 1.0;
            }
        } else {
            {
                std::lock_guard<std::mutex> lock1(g_tracks[1].mtx);
                g_tracks[1].tempo_ratio = 1.0 * (1.0 - t) + (bpm0 / bpm1) * t;
            }
            {
                std::lock_guard<std::mutex> lock0(g_tracks[0].mtx);
                g_tracks[0].tempo_ratio = 1.0;
            }
        }
    }

    std::vector<float> buf0(frameCount * 2);
    std::vector<float> buf1(frameCount * 2);
    
    get_audio_frames(g_tracks[0], buf0.data(), frameCount, 2, sample_rate);
    get_audio_frames(g_tracks[1], buf1.data(), frameCount, 2, sample_rate);

    std::vector<float> mixed_stereo(frameCount * 2, 0.0f);

    if (g_mixer_state == 1) {
        double t = g_crossfade_elapsed / g_actual_crossfade_duration;
        if (t < 0.0) t = 0.0;
        if (t > 1.0) t = 1.0;

        float vol0 = (float)std::cos(t * M_PI * 0.5);
        float vol1 = (float)std::sin(t * M_PI * 0.5);

        for (ma_uint32 i = 0; i < frameCount * 2; i++) {
            mixed_stereo[i] = buf0[i] * vol0 + buf1[i] * vol1;
        }

        if (t >= 1.0) {
            {
                std::lock_guard<std::mutex> lock0(g_tracks[0].mtx);
                g_tracks[0].is_playing = false;
                g_tracks[0].tempo_ratio = 1.0;
                g_tracks[0].pitch_semi = 0.0;
            }
            {
                std::lock_guard<std::mutex> lock1(g_tracks[1].mtx);
                g_tracks[1].tempo_ratio = 1.0;
                g_tracks[1].pitch_semi = 0.0;
            }
            g_mixer_state = 2;
        }
    } else if (g_mixer_state == 3) {
        double t = g_crossfade_elapsed / g_actual_crossfade_duration;
        if (t < 0.0) t = 0.0;
        if (t > 1.0) t = 1.0;

        float vol1 = (float)std::cos(t * M_PI * 0.5);
        float vol0 = (float)std::sin(t * M_PI * 0.5);

        for (ma_uint32 i = 0; i < frameCount * 2; i++) {
            mixed_stereo[i] = buf0[i] * vol0 + buf1[i] * vol1;
        }

        if (t >= 1.0) {
            {
                std::lock_guard<std::mutex> lock1(g_tracks[1].mtx);
                g_tracks[1].is_playing = false;
                g_tracks[1].tempo_ratio = 1.0;
                g_tracks[1].pitch_semi = 0.0;
            }
            {
                std::lock_guard<std::mutex> lock0(g_tracks[0].mtx);
                g_tracks[0].tempo_ratio = 1.0;
                g_tracks[0].pitch_semi = 0.0;
            }
            g_mixer_state = 0;
        }
    } else if (g_mixer_state == 0) {
        std::memcpy(mixed_stereo.data(), buf0.data(), frameCount * 2 * sizeof(float));

        if (g_automix_enabled && g_tracks[0].is_playing && g_tracks[1].has_decoder) {
            double pos0 = get_track_position(0);
            double dur0 = g_tracks[0].duration;

            double bpm0 = g_tracks[0].bpm;
            if (bpm0 < 30.0 || bpm0 > 300.0) bpm0 = 120.0;
            double bar_dur0 = 240.0 / bpm0;
            double num_bars0 = std::round(g_crossfade_duration / bar_dur0);
            if (num_bars0 < 1.0) num_bars0 = 1.0;
            double actual_crossfade_dur = num_bars0 * bar_dur0;
            if (actual_crossfade_dur > dur0 * 0.5) {
                actual_crossfade_dur = dur0 * 0.5;
            }

            if (dur0 > 0.0 && pos0 >= dur0 - actual_crossfade_dur) {
                g_mixer_state = 1;
                g_crossfade_elapsed = 0.0;
                g_actual_crossfade_duration = actual_crossfade_dur;
                {
                    std::lock_guard<std::mutex> lock1(g_tracks[1].mtx);
                    g_tracks[1].is_playing = true;
                    g_tracks[1].pitch_semi = 0.0;
                }
            }
        }
    } else if (g_mixer_state == 2) {
        std::memcpy(mixed_stereo.data(), buf1.data(), frameCount * 2 * sizeof(float));

        if (g_automix_enabled && g_tracks[1].is_playing && g_tracks[0].has_decoder) {
            double pos1 = get_track_position(1);
            double dur1 = g_tracks[1].duration;

            double bpm1 = g_tracks[1].bpm;
            if (bpm1 < 30.0 || bpm1 > 300.0) bpm1 = 120.0;
            double bar_dur1 = 240.0 / bpm1;
            double num_bars1 = std::round(g_crossfade_duration / bar_dur1);
            if (num_bars1 < 1.0) num_bars1 = 1.0;
            double actual_crossfade_dur = num_bars1 * bar_dur1;
            if (actual_crossfade_dur > dur1 * 0.5) {
                actual_crossfade_dur = dur1 * 0.5;
            }

            if (dur1 > 0.0 && pos1 >= dur1 - actual_crossfade_dur) {
                g_mixer_state = 3;
                g_crossfade_elapsed = 0.0;
                g_actual_crossfade_duration = actual_crossfade_dur;
                {
                    std::lock_guard<std::mutex> lock0(g_tracks[0].mtx);
                    g_tracks[0].is_playing = true;
                    g_tracks[0].pitch_semi = 0.0;
                }
            }
        }
    }

    if (channels == 1) {
        for (ma_uint32 i = 0; i < frameCount; i++) {
            out[i] = (mixed_stereo[i * 2] + mixed_stereo[i * 2 + 1]) * 0.5f;
        }
    } else if (channels == 2) {
        std::memcpy(out, mixed_stereo.data(), frameCount * 2 * sizeof(float));
    } else {
        for (ma_uint32 i = 0; i < frameCount; i++) {
            out[i * channels] = mixed_stereo[i * 2];
            out[i * channels + 1] = mixed_stereo[i * 2 + 1];
            for (int c = 2; c < channels; c++) {
                out[i * channels + c] = 0.0f;
            }
        }
    }
}

int init_audio_engine(int sample_rate, int channels) {
    engine_log_open();
    ENGINE_LOGI("init_audio_engine sample_rate=%d channels=%d", sample_rate, channels);
    if (g_device_initialized) {
        cleanup_audio_engine();
    }
    g_sample_rate = sample_rate;
    g_channels = channels;

    ma_device_config config = ma_device_config_init(ma_device_type_playback);
    config.playback.format = ma_format_f32;
    config.playback.channels = channels;
    config.sampleRate = sample_rate;
    config.dataCallback = audio_callback;

    ma_device_id dev_id;
    if (g_device_id_hex != "default") {
        dev_id = hex_to_device_id(g_device_id_hex);
        config.playback.pDeviceID = &dev_id;
    } else {
        config.playback.pDeviceID = NULL;
    }

    if (ma_device_init(NULL, &config, &g_device) != MA_SUCCESS) {
        ENGINE_LOGE("init_audio_engine: ma_device_init FAILED");
        return 0;
    }

    if (g_device.sampleRate > 0) {
        g_sample_rate = g_device.sampleRate;
    }
    if (g_device.playback.channels > 0) {
        g_channels = g_device.playback.channels;
    }

    if (ma_device_start(&g_device) != MA_SUCCESS) {
        ENGINE_LOGE("init_audio_engine: ma_device_start FAILED");
        ma_device_uninit(&g_device);
        return 0;
    }

    g_device_initialized = true;
    ENGINE_LOGI("init_audio_engine OK (actual sr=%d channels=%d)", g_sample_rate, g_channels);
    return 1;
}

void cleanup_audio_engine() {
    if (g_device_initialized) {
        ma_device_stop(&g_device);
        ma_device_uninit(&g_device);
        g_device_initialized = false;
    }
    for (int i = 0; i < 2; i++) {
        std::lock_guard<std::mutex> lock(g_tracks[i].mtx);
        if (g_tracks[i].has_decoder && g_tracks[i].decoder) {
            ma_decoder_uninit(g_tracks[i].decoder);
            delete g_tracks[i].decoder;
            g_tracks[i].decoder = nullptr;
            g_tracks[i].has_decoder = false;
        }
    }
}

int load_track(int slot, const char* file_path) {
    ENGINE_LOGI("load_track slot=%d path=%s", slot, file_path);
    engine_log_open();
    if (slot < 0 || slot > 1) return 0;

    ma_decoder* new_decoder = new ma_decoder();
    if (init_decoder_fixed(file_path, new_decoder) != MA_SUCCESS) {
        ENGINE_LOGE("load_track: decoder init FAILED slot=%d path=%s", slot, file_path);
        delete new_decoder;
        return 0;
    }

    double duration = 0.0;
    ma_uint64 total_frames = 0;
    if (ma_decoder_get_length_in_pcm_frames(new_decoder, &total_frames) == MA_SUCCESS && new_decoder->outputSampleRate > 0) {
        duration = (double)total_frames / new_decoder->outputSampleRate;
    }

    TrackState& ts = g_tracks[slot];
    std::lock_guard<std::mutex> lock(ts.mtx);
    if (ts.has_decoder && ts.decoder) {
        ma_decoder_uninit(ts.decoder);
        delete ts.decoder;
        ts.decoder = nullptr;
        ts.has_decoder = false;
    }

    ts.decoder = new_decoder;
    ts.has_decoder = true;
    ts.duration = duration;

    ts.stretch.presetDefault(2, g_sample_rate);
    ts.stretch_initialized = true;
    ts.is_playing = false;
    ts.seek_position = -1.0;
    ts.tempo_ratio = 1.0;
    ts.pitch_semi = 0.0;
    ts.recent_samples.assign(1024, 0.0f);
    ts.recent_ptr = 0;
    ts.eq.lp_state[0] = ts.eq.lp_state[1] = 0.0f;
    ts.eq.hp_state[0] = ts.eq.hp_state[1] = 0.0f;
    ts.eq.hp_prev_in[0] = ts.eq.hp_prev_in[1] = 0.0f;
    for (int b = 0; b < 10; b++) {
        ts.eq10[b].reset();
        ts.eq10[b].init_peaking((float)g_sample_rate, EQ_FREQS[b], 1.414f, ts.eq10_gains[b]);
    }
    ts.limiter.reset();
    ts.reverb.reset();
    ts.bass_enhancer.reset();
    ts.exciter.reset();

    ts.bpm = 120.0;
    ts.key = "8A";
    ts.waveform.clear();

    ENGINE_LOGI("load_track OK slot=%d duration=%.3fs bpm=%.1f key=%s waveform=%zu",
                slot, ts.duration, ts.bpm, ts.key.c_str(), ts.waveform.size());

    return 1;
}

TrackMetadataC get_track_metadata(int slot) {
    TrackMetadataC meta = {0.0, 120.0, "8A", NULL, 0};
    if (slot < 0 || slot > 1) return meta;
    TrackState& ts = g_tracks[slot];
    std::lock_guard<std::mutex> lock(ts.mtx);
    if (!ts.has_decoder || !ts.decoder) return meta;
    
    meta.durationSec = ts.duration;
    meta.bpm = ts.bpm;
    meta.keySignature = strdup(ts.key.c_str());
    if (!ts.waveform.empty()) {
        meta.waveformSize = ts.waveform.size();
        meta.waveformData = (float*)malloc(ts.waveform.size() * sizeof(float));
        memcpy(meta.waveformData, ts.waveform.data(), ts.waveform.size() * sizeof(float));
    }
    return meta;
}

void set_track_metadata(int slot, double duration, double bpm, const char* key, const float* waveform, int waveform_size) {
    if (slot < 0 || slot > 1) return;
    TrackState& ts = g_tracks[slot];
    std::lock_guard<std::mutex> lock(ts.mtx);
    ts.duration = duration;
    ts.bpm = std::round(bpm);
    if (key) {
        ts.key = key;
    }
    if (waveform && waveform_size > 0) {
        ts.waveform.assign(waveform, waveform + waveform_size);
    }
    ENGINE_LOGI("set_track_metadata OK slot=%d duration=%.3fs bpm=%.1f key=%s waveform=%zu",
                slot, ts.duration, ts.bpm, ts.key.c_str(), ts.waveform.size());
}

void set_track_eq(int slot, float bass, float mid, float treble) {
    if (slot < 0 || slot > 1) return;
    TrackState& ts = g_tracks[slot];
    std::lock_guard<std::mutex> lock(ts.mtx);
    ts.eq.bass_gain = powf(10.0f, bass / 20.0f);
    ts.eq.mid_gain = powf(10.0f, mid / 20.0f);
    ts.eq.treble_gain = powf(10.0f, treble / 20.0f);
    ENGINE_LOGI("set_track_eq slot=%d bass=%.2fdB(%.2f) mid=%.2fdB(%.2f) treble=%.2fdB(%.2f)",
                slot, bass, ts.eq.bass_gain, mid, ts.eq.mid_gain, treble, ts.eq.treble_gain);
}

void set_track_eq10(int slot, const float* bands) {
    if (slot < 0 || slot > 1) return;
    TrackState& ts = g_tracks[slot];
    std::lock_guard<std::mutex> lock(ts.mtx);
    for (int b = 0; b < 10; b++) {
        ts.eq10_gains[b] = bands[b];
        ts.eq10[b].init_peaking((float)g_sample_rate, EQ_FREQS[b], 1.414f, bands[b]);
    }
    ENGINE_LOGI("set_track_eq10 slot=%d", slot);
}

void set_track_dsp(int slot, float limiter_boost, float stereo_width, float reverb_mix, float bass_boost, float treble_exciter) {
    if (slot < 0 || slot > 1) return;
    TrackState& ts = g_tracks[slot];
    std::lock_guard<std::mutex> lock(ts.mtx);
    ts.limiter.boost_db = limiter_boost;
    ts.stereo_width = stereo_width;
    ts.reverb.mix = reverb_mix;
    ts.bass_enhancer.amount = bass_boost;
    ts.exciter.amount = treble_exciter;
    ENGINE_LOGI("set_track_dsp slot=%d limiter=%.1fdB width=%.2f reverb=%.2f bass=%.2f exciter=%.2f",
                slot, limiter_boost, stereo_width, reverb_mix, bass_boost, treble_exciter);
}

int get_track_spectrum(int slot, float* out_buffer, int max_size) {
    if (slot < 0 || slot > 1 || max_size <= 0) return 0;
    TrackState& ts = g_tracks[slot];
    static thread_local std::vector<float> samples(1024, 0.0f);
    {
        std::lock_guard<std::mutex> lock(ts.mtx);
        if (!ts.has_decoder || !ts.decoder || !ts.is_playing || ts.recent_samples.size() != 1024) {
            memset(out_buffer, 0, max_size * sizeof(float));
            return 0;
        }
        int ptr = ts.recent_ptr;
        for (int i = 0; i < 1024; i++) {
            samples[i] = ts.recent_samples[(ptr + i) % 1024];
        }
    }

    static thread_local std::vector<std::complex<double>> fft_in(1024);
    for (int i = 0; i < 1024; i++) {
        double w = 0.5 * (1.0 - cos(2.0 * M_PI * i / 1023.0));
        fft_in[i] = std::complex<double>(samples[i] * w, 0.0);
    }

    fft(fft_in);

    int num_bins = 512;
    int bin_step = num_bins / max_size;
    if (bin_step < 1) bin_step = 1;

    for (int i = 0; i < max_size; i++) {
        double max_mag = 0.0;
        for (int j = 0; j < bin_step; j++) {
            int idx = i * bin_step + j;
            if (idx >= num_bins) break;
            double mag = std::abs(fft_in[idx]);
            if (mag > max_mag) max_mag = mag;
        }
        out_buffer[i] = (float)max_mag;
    }
    return max_size;
}

void play_track(int slot) {
    ENGINE_LOGI("play_track slot=%d", slot);
    if (slot < 0 || slot > 1) return;
    if (!g_device_initialized) {
        ENGINE_LOGW("play_track: device not initialized, attempting init...");
        init_audio_engine(g_sample_rate > 0 ? g_sample_rate : 44100, 2);
    }
    std::lock_guard<std::mutex> lock(g_tracks[slot].mtx);
    if (g_tracks[slot].has_decoder && g_tracks[slot].decoder) {
        g_tracks[slot].is_playing = true;
        if (g_mixer_state != 1 && g_mixer_state != 3) {
            if (slot == 0) g_mixer_state = 0;
            else g_mixer_state = 2;
        }
        ENGINE_LOGI("play_track: playing=true slot=%d mixer_state=%d", slot, g_mixer_state);
    } else {
        ENGINE_LOGW("play_track: нет декодера на slot=%d", slot);
    }
}

void pause_track(int slot) {
    ENGINE_LOGI("pause_track slot=%d", slot);
    if (slot < 0 || slot > 1) return;
    std::lock_guard<std::mutex> lock(g_tracks[slot].mtx);
    g_tracks[slot].is_playing = false;
}

void seek_track(int slot, double position_sec) {
    ENGINE_LOGI("seek_track slot=%d pos=%.3fs", slot, position_sec);
    if (slot < 0 || slot > 1) return;
    std::lock_guard<std::mutex> lock(g_tracks[slot].mtx);
    g_tracks[slot].seek_position = position_sec;
}

void set_track_volume(int slot, float volume) {
    if (slot < 0 || slot > 1) return;
    std::lock_guard<std::mutex> lock(g_tracks[slot].mtx);
    g_tracks[slot].volume = volume;
}

void set_track_tempo(int slot, double tempo_ratio) {
    ENGINE_LOGI("set_track_tempo slot=%d ratio=%.3f", slot, tempo_ratio);
    if (slot < 0 || slot > 1) return;
    std::lock_guard<std::mutex> lock(g_tracks[slot].mtx);
    g_tracks[slot].tempo_ratio = tempo_ratio;
}

void set_track_pitch(int slot, double pitch_semi) {
    ENGINE_LOGI("set_track_pitch slot=%d semi=%.1f", slot, pitch_semi);
    if (slot < 0 || slot > 1) return;
    std::lock_guard<std::mutex> lock(g_tracks[slot].mtx);
    g_tracks[slot].pitch_semi = pitch_semi;
}

double get_track_position(int slot) {
    if (slot < 0 || slot > 1) return 0.0;
    TrackState& ts = g_tracks[slot];
    std::lock_guard<std::mutex> lock(ts.mtx);
    if (!ts.has_decoder || !ts.decoder) return 0.0;
    ma_uint64 current_frame = 0;
    ma_decoder_get_cursor_in_pcm_frames(ts.decoder, &current_frame);
    if (ts.decoder->outputSampleRate == 0) return 0.0;
    return (double)current_frame / ts.decoder->outputSampleRate;
}

int is_track_playing(int slot) {
    if (slot < 0 || slot > 1) return 0;
    TrackState& ts = g_tracks[slot];
    std::lock_guard<std::mutex> lock(ts.mtx);
    return ts.is_playing ? 1 : 0;
}

void set_automix_enabled(int enabled) {
    g_automix_enabled = enabled ? true : false;
    ENGINE_LOGI("set_automix_enabled=%d (mixer_state=%d crossfade=%.1fs)",
                enabled ? 1 : 0, g_mixer_state, g_crossfade_duration);
}

void set_crossfade_duration(double duration_sec) {
    if (duration_sec < 1.0) duration_sec = 1.0;
    if (duration_sec > 30.0) duration_sec = 30.0;
    g_crossfade_duration = duration_sec;
    ENGINE_LOGI("set_crossfade_duration=%.1fs", duration_sec);
}

void free_track_metadata(TrackMetadataC metadata) {
    if (metadata.keySignature) {
        free((void*)metadata.keySignature);
    }
    if (metadata.waveformData) {
        free(metadata.waveformData);
    }
}

TrackMetadataC analyze_file(const char* file_path) {
    TrackMetadataC meta = {0.0, 120.0, "8A", NULL, 0};
    double dur = 0.0;
    double bpm = 120.0;
    const char* key = "8A";
    std::vector<float> wf;
    analyze_audio(file_path, &dur, &bpm, &key, wf);
    meta.durationSec = dur;
    meta.bpm = bpm;
    meta.keySignature = strdup(key);
    if (!wf.empty()) {
        meta.waveformSize = wf.size();
        meta.waveformData = (float*)malloc(wf.size() * sizeof(float));
        memcpy(meta.waveformData, wf.data(), wf.size() * sizeof(float));
    }
    return meta;
}

const char* get_audio_devices_json() {
    ma_context context;
    if (ma_context_init(NULL, 0, NULL, &context) != MA_SUCCESS) {
        return strdup("[]");
    }
    ma_device_info* pPlaybackDeviceInfos;
    ma_uint32 playbackDeviceCount;
    if (ma_context_get_devices(&context, &pPlaybackDeviceInfos, &playbackDeviceCount, NULL, NULL) != MA_SUCCESS) {
        ma_context_uninit(&context);
        return strdup("[]");
    }
    std::string json = "[";
    json += "{\"name\":\"Default Device\",\"id\":\"default\",\"isDefault\":true}";
    for (ma_uint32 i = 0; i < playbackDeviceCount; i++) {
        json += ",{";
        json += "\"name\":" + json_escape(pPlaybackDeviceInfos[i].name) + ",";
        json += "\"id\":\"" + device_id_to_hex(pPlaybackDeviceInfos[i].id) + "\",";
        json += "\"isDefault\":" + std::string(pPlaybackDeviceInfos[i].isDefault ? "true" : "false");
        json += "}";
    }
    json += "]";
    ma_context_uninit(&context);
    return strdup(json.c_str());
}

int set_audio_device(const char* device_id_hex) {
    ENGINE_LOGI("set_audio_device: %s", device_id_hex);
    g_device_id_hex = device_id_hex;
    if (g_device_initialized) {
        int sr = g_sample_rate;
        int ch = g_channels;
        cleanup_audio_engine();
        return init_audio_engine(sr, ch);
    }
    return 1;
}
