import { generateUniquePuzzle } from './puzzle.js';

self.onmessage = event => {
    const { rows, columns, minimumColors, maximumColors, seed } = event.data;
    let lastProgress = -Infinity;
    try {
        const puzzle = generateUniquePuzzle(rows, columns, minimumColors, maximumColors, seed, {
            onProgress: progress => {
                const now = performance.now();
                if (progress.fraction < 1 && now - lastProgress < 50) return;
                lastProgress = now;
                self.postMessage({ type: 'progress', ...progress });
            },
        });
        self.postMessage({ type: 'result', puzzle });
    } catch (error) {
        self.postMessage({ type: 'error', message: error?.message || String(error) });
    }
};
