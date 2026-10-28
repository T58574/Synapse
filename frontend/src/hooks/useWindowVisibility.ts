import { useState, useEffect } from 'react';
import { SetVisualizerActive } from '../../wailsjs/go/backend/App';

export function useWindowVisibility(visualizerEnabled: boolean) {
    const [isVisible, setIsVisible] = useState<boolean>(() => {
        return typeof document !== 'undefined' ? !document.hidden : true;
    });

    useEffect(() => {
        if (typeof document === 'undefined') return;

        const onVisibilityChange = () => {
            const visible = !document.hidden;
            setIsVisible(visible);
            // Tell Go backend to halt FFT calculation & IPC spectrum emits when minimized/hidden or disabled
            SetVisualizerActive(visible && visualizerEnabled).catch(() => {});
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        // Initial sync
        SetVisualizerActive(!document.hidden && visualizerEnabled).catch(() => {});

        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [visualizerEnabled]);

    return { isVisible };
}
