export class NetNavigation {
    constructor(view) {
        this.view = view;
        this.scale = 1; this.x = 0; this.y = 0;
        this.wheel = event => {
            event.preventDefault();
            const rect = view.netCanvas.getBoundingClientRect();
            const x = event.clientX - rect.left, y = event.clientY - rect.top;
            const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 16 : 1) * 0.0015);
            const next = Math.max(0.02, Math.min(1000, this.scale * factor));
            const ratio = next / this.scale;
            this.x = x - (x - this.x) * ratio;
            this.y = y - (y - this.y) * ratio;
            this.scale = next;
            view._drawNet();
        };
        this.down = event => {
            if (event.button !== 2) return;
            event.preventDefault(); event.stopPropagation();
            this.pan = { x: event.clientX, y: event.clientY };
        };
        this.move = event => {
            if (!this.pan) return;
            this.x += event.clientX - this.pan.x; this.y += event.clientY - this.pan.y;
            this.pan = { x: event.clientX, y: event.clientY };
            view._drawNet();
        };
        this.up = event => { if (event.button === 2) this.pan = null; };
        this.menu = event => event.preventDefault();
        view.netCanvas.addEventListener('wheel', this.wheel, { passive: false });
        view.netCanvas.addEventListener('mousedown', this.down);
        view.netCanvas.addEventListener('contextmenu', this.menu);
        window.addEventListener('mousemove', this.move);
        window.addEventListener('mouseup', this.up);
    }
    point(x, y) { return [(x - this.x) / this.scale, (y - this.y) / this.scale]; }
    transform(ctx) { ctx.translate(this.x, this.y); ctx.scale(this.scale, this.scale); }
    dispose() {
        const canvas = this.view.netCanvas;
        canvas.removeEventListener('wheel', this.wheel);
        canvas.removeEventListener('mousedown', this.down);
        canvas.removeEventListener('contextmenu', this.menu);
        window.removeEventListener('mousemove', this.move);
        window.removeEventListener('mouseup', this.up);
    }
}

export function resizeNet(view, event) {
    const resize = view.netResizing;
    if (!resize) return;
    const width = event.clientX <= 6 ? window.innerWidth
        : Math.min(window.innerWidth, Math.max(150, resize.width - event.clientX + resize.startX));
    const height = event.clientY >= window.innerHeight - 6 ? window.innerHeight
        : Math.min(window.innerHeight, Math.max(100, resize.height + event.clientY - resize.startY));
    Object.assign(view.netPanel.style, {
        width: `${width}px`, height: `${height}px`,
        right: `${Math.min(14, window.innerWidth - width)}px`,
        top: `${Math.min(14, window.innerHeight - height)}px`,
    });
    view._drawNet();
}
