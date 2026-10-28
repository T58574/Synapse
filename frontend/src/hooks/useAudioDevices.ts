import { useState, useEffect } from 'react';
import { GetAudioDevices, SetAudioDevice } from '../../wailsjs/go/backend/App';

export interface AudioDevice {
    name: string;
    id: string;
    isDefault: boolean;
}

export function useAudioDevices(
    language: string,
    uiLog: (level: 'INFO' | 'WARN' | 'ERROR', msg: string) => void,
    showToast: (msg: string) => void
) {
    const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<string>(() => {
        try {
            return localStorage.getItem('soundplayer_device') || 'default';
        } catch {
            return 'default';
        }
    });

    useEffect(() => {
        GetAudioDevices().then(list => {
            setAudioDevices(list || []);
        }).catch(err => {
            uiLog('ERROR', `Failed to load audio devices: ${String(err)}`);
        });

        if (selectedDevice && selectedDevice !== 'default') {
            SetAudioDevice(selectedDevice).catch(err => {
                uiLog('ERROR', `Failed to set audio device ${selectedDevice}: ${String(err)}`);
            });
        }
    }, []);

    const handleDeviceChange = async (deviceId: string) => {
        uiLog('INFO', `handleDeviceChange: ${deviceId}`);
        const ok = await SetAudioDevice(deviceId);
        if (ok) {
            setSelectedDevice(deviceId);
            try {
                localStorage.setItem('soundplayer_device', deviceId);
            } catch {}
            const defaultDevName = language === 'ru' ? 'Устройство по умолчанию' : 'Default Device';
            const name = audioDevices.find(d => d.id === deviceId)?.name || defaultDevName;
            showToast(language === 'ru' ? `Аудио перенаправлено на ${name}` : `Audio routed to ${name}`);
        } else {
            uiLog('ERROR', `Failed to route audio output to ${deviceId}`);
        }
    };

    return {
        audioDevices,
        selectedDevice,
        handleDeviceChange
    };
}
