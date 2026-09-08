export class PuzzleHistory {
    constructor(view, apply, refresh) {
        this.view = view; this.apply = apply; this.refresh = refresh;
        this.undo = []; this.redo = [];
        this.key = event => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
            if (event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
            const key = event.key.toLowerCase();
            if (key !== 'z' && key !== 'y') return;
            if (view.host?.app?._isPaused || view.app?._isPaused) return;
            event.preventDefault(); event.stopPropagation();
            this.step(key === 'y' || event.shiftKey);
        };
        window.addEventListener('keydown', this.key, true);
    }
    record(move) { this.undo.push(move); this.redo.length = 0; }
    clear() { this.undo.length = 0; this.redo.length = 0; }
    step(forward) {
        this.view.onPause();
        const from = forward ? this.redo : this.undo, to = forward ? this.undo : this.redo;
        const move = from.pop();
        if (!move) return;
        this.apply(move, forward ? 1 : -1); to.push(move);
        this.view.moves = this.view.scoredRun ? this.undo.length : 0;
        this.view.phase = 'playing';
        this.view.currentScore = this.view.model.score();
        this.refresh(); this.view._renderHud();
        if (this.view.currentScore === this.view.model.maximumScore) this.view._completeRun();
    }
    dispose() { window.removeEventListener('keydown', this.key, true); }
}
