import { useState, useEffect } from 'react';
import { SetEQ, SetEQ10, SetDSP } from '../../wailsjs/go/backend/App';

export interface DSPParams {
    limiterBoost: number;
    stereoWidth: number;
    reverbMix: number;
    bassBoost: number;
    trebleExciter: number;
}

export function useEqualizer(uiLog: (level: 'INFO' | 'WARN' | 'ERROR', msg: string) => void) {
    const [showEqualizer, setShowEqualizer] = useState<boolean>(false);

    const [eqValues, setEQValues] = useState<[number, number, number]>(() => {
        try {
            const val = localStorage.getItem('soundplayer_eq');
            if (val) {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed) && parsed.length === 3) {
                    return [Number(parsed[0]), Number(parsed[1]), Number(parsed[2])];
                }
            }
        } catch {}
        return [0.0, 0.0, 0.0];
    });

    const [eq10Values, setEQ10Values] = useState<[number, number, number, number, number, number, number, number, number, number]>(() => {
        try {
            const val = localStorage.getItem('soundplayer_eq10');
            if (val) {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed) && parsed.length === 10) {
                    return parsed as any;
                }
            }
        } catch {}
        return [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    });

    const [dspParams, setDSPParams] = useState<DSPParams>({
        limiterBoost: 0.0,
        stereoWidth: 1.0,
        reverbMix: 0.0,
        bassBoost: 0.0,
        trebleExciter: 0.0
    });

    useEffect(() => {
        try {
            const val = localStorage.getItem('soundplayer_dsp');
            if (val) {
                const parsed = JSON.parse(val);
                if (parsed && typeof parsed === 'object') {
                    setDSPParams({
                        limiterBoost: Number(parsed.limiterBoost ?? 0.0),
                        stereoWidth: Number(parsed.stereoWidth ?? 1.0),
                        reverbMix: Number(parsed.reverbMix ?? 0.0),
                        bassBoost: Number(parsed.bassBoost ?? 0.0),
                        trebleExciter: Number(parsed.trebleExciter ?? 0.0)
                    });
                }
            }
        } catch {}
    }, []);

    const [customPresets, setCustomPresets] = useState<Record<string, number[]>>(() => {
        try {
            const val = localStorage.getItem('soundplayer_custom_presets');
            if (val) {
                return JSON.parse(val);
            }
        } catch {}
        return {};
    });

    const setEQValue = async (bandIndex: number, val: number) => {
        const newEq = [...eqValues] as [number, number, number];
        newEq[bandIndex] = val;
        setEQValues(newEq);
        uiLog('INFO', `EQ change band=${bandIndex} val=${val.toFixed(1)}`);
        try {
            await SetEQ(0, newEq[0], newEq[1], newEq[2]);
            await SetEQ(1, newEq[0], newEq[1], newEq[2]);
        } catch (err) {
            uiLog('ERROR', `Failed to SetEQ: ${String(err)}`);
        }
        try {
            localStorage.setItem('soundplayer_eq', JSON.stringify(newEq));
        } catch {}
    };

    const setEQ10Value = async (bandIndex: number, val: number) => {
        const newEq = [...eq10Values] as [number, number, number, number, number, number, number, number, number, number];
        newEq[bandIndex] = val;
        setEQ10Values(newEq);
        uiLog('INFO', `EQ10 change band=${bandIndex} val=${val.toFixed(1)}`);
        try {
            await SetEQ10(0, newEq);
            await SetEQ10(1, newEq);
        } catch (err) {
            uiLog('ERROR', `Failed to SetEQ10: ${String(err)}`);
        }
        try {
            localStorage.setItem('soundplayer_eq10', JSON.stringify(newEq));
        } catch {}
    };

    const setEQ10Whole = async (bands: number[]) => {
        if (bands.length !== 10) return;
        const newEq = [...bands] as [number, number, number, number, number, number, number, number, number, number];
        setEQ10Values(newEq);
        uiLog('INFO', `EQ10 preset apply`);
        try {
            await SetEQ10(0, newEq);
            await SetEQ10(1, newEq);
        } catch (err) {
            uiLog('ERROR', `Failed to SetEQ10 whole: ${String(err)}`);
        }
        try {
            localStorage.setItem('soundplayer_eq10', JSON.stringify(newEq));
        } catch {}
    };

    const setDSPParam = async (param: string, val: number) => {
        setDSPParams(prev => {
            const updated = { ...prev, [param]: val };
            uiLog('INFO', `DSP change param=${param} val=${val.toFixed(2)}`);
            SetDSP(0, updated.limiterBoost, updated.stereoWidth, updated.reverbMix, updated.bassBoost, updated.trebleExciter).catch(err => {
                uiLog('ERROR', `Failed to SetDSP deck0: ${String(err)}`);
            });
            SetDSP(1, updated.limiterBoost, updated.stereoWidth, updated.reverbMix, updated.bassBoost, updated.trebleExciter).catch(err => {
                uiLog('ERROR', `Failed to SetDSP deck1: ${String(err)}`);
            });
            try {
                localStorage.setItem('soundplayer_dsp', JSON.stringify(updated));
            } catch {}
            return updated;
        });
    };

    const handleSavePreset = (name: string, bands: number[]) => {
        const updated = { ...customPresets, [name]: bands };
        setCustomPresets(updated);
        try {
            localStorage.setItem('soundplayer_custom_presets', JSON.stringify(updated));
        } catch {}
        uiLog('INFO', `Saved custom preset: ${name}`);
    };

    const handleDeletePreset = (name: string) => {
        const updated = { ...customPresets };
        delete updated[name];
        setCustomPresets(updated);
        try {
            localStorage.setItem('soundplayer_custom_presets', JSON.stringify(updated));
        } catch {}
        uiLog('INFO', `Deleted custom preset: ${name}`);
    };

    return {
        showEqualizer,
        setShowEqualizer,
        eqValues,
        setEQValue,
        eq10Values,
        setEQ10Value,
        setEQ10Whole,
        dspParams,
        setDSPParam,
        customPresets,
        handleSavePreset,
        handleDeletePreset
    };
}
