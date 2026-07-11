const performBaseline = async () => {
    const mockState = {
        tracks: [true, true],
        playing: [false, false],
        positions: [0, 0]
    };

    const IsPlaying = async (slot) => {
        return new Promise(resolve => setTimeout(() => resolve(true), 10)); // simulate 10ms delay
    };

    const GetPosition = async (slot) => {
        return new Promise(resolve => setTimeout(() => resolve(1.23), 10)); // simulate 10ms delay
    };

    const runSeq = async () => {
        const st = mockState;
        const updatedPlaying = [...st.playing];
        const updatedPos = [...st.positions];

        for (let slot = 0; slot < 2; slot++) {
            if (st.tracks[slot]) {
                const isPlay = await IsPlaying(slot);
                updatedPlaying[slot] = isPlay;
                if (isPlay) {
                    const pos = await GetPosition(slot);
                    updatedPos[slot] = pos;
                }
            }
        }
    };

    const runParallel = async () => {
        const st = mockState;
        const updatedPlaying = [...st.playing];
        const updatedPos = [...st.positions];

        await Promise.all([0, 1].map(async (slot) => {
            if (st.tracks[slot]) {
                const isPlay = await IsPlaying(slot);
                updatedPlaying[slot] = isPlay;
                if (isPlay) {
                    const pos = await GetPosition(slot);
                    updatedPos[slot] = pos;
                }
            }
        }));
    };

    const measure = async (name, fn) => {
        const start = performance.now();
        for (let i = 0; i < 100; i++) {
            await fn();
        }
        const end = performance.now();
        console.log(`${name}: ${end - start} ms`);
    };

    await measure('Sequential Baseline', runSeq);
    await measure('Parallel Optimized', runParallel);
};

performBaseline();
