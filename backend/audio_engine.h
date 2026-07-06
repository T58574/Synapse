#ifndef AUDIO_ENGINE_H
#define AUDIO_ENGINE_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    double durationSec;
    double bpm;
    const char* keySignature;
    float* waveformData;
    int waveformSize;
} TrackMetadataC;

int init_audio_engine(int sample_rate, int channels);
void cleanup_audio_engine();
int load_track(int slot, const char* file_path);
TrackMetadataC get_track_metadata(int slot);
void play_track(int slot);
void pause_track(int slot);
void seek_track(int slot, double position_sec);
void set_track_volume(int slot, float volume);
void set_track_tempo(int slot, double tempo_ratio);
void set_track_pitch(int slot, double pitch_semi);
double get_track_position(int slot);
int is_track_playing(int slot);
void set_automix_enabled(int enabled);
void set_crossfade_duration(double duration_sec);
void free_track_metadata(TrackMetadataC metadata);
void set_track_metadata(int slot, double duration, double bpm, const char* key, const float* waveform, int waveform_size);
TrackMetadataC analyze_file(const char* file_path);
int get_track_spectrum(int slot, float* out_buffer, int max_size);
const char* get_audio_devices_json();
int set_audio_device(const char* device_id_hex);

#ifdef __cplusplus
}
#endif

#endif
