// Dot-matrix splash title, Active Theory style: the name is sampled into a
// grid of dots that converge on load, repel from the pointer, and scatter
// into the scene when you enter.

const FONT_STACK = '"Space Grotesk", "Inter", -apple-system, sans-serif';

export class SplashTitle {
    constructor(canvas, text, { reduceMotion = false } = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.text = text;
        this.reduceMotion = reduceMotion;
        this.dots = [];
        this.pointer = { x: -9999, y: -9999, active: false };
        this.rect = { left: 0, top: 0, width: 1, height: 1 };
        this.dpr = 1;
        this.state = 'forming'; // forming -> idle -> scattered
        this.t = 0;
        this.running = false;

        this.onResize = () => this.resize();
        this.onMove = (e) => {
            this.pointer.x = (e.clientX - this.rect.left) * this.dpr;
            this.pointer.y = (e.clientY - this.rect.top) * this.dpr;
            this.pointer.active = true;
        };
        this.onLeave = () => { this.pointer.active = false; };

        window.addEventListener('resize', this.onResize);
        window.addEventListener('pointermove', this.onMove, { passive: true });
        document.addEventListener('mouseleave', this.onLeave);
    }

    async init() {
        // Sample after webfonts settle so the dotted glyphs match the CSS font
        try {
            await Promise.race([
                document.fonts.ready,
                new Promise((resolve) => setTimeout(resolve, 1200))
            ]);
        } catch (e) { /* fonts may be blocked */ }
        if (this.state === 'scattered') return;
        this.resize();
        this.running = true;
        this.raf = requestAnimationFrame((now) => this.loop(now));
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        this.rect = rect;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
        this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
        this.build();
    }

    // Rasterise the text, then keep a dot for every opaque sample cell
    build() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const octx = off.getContext('2d');

        octx.fillStyle = '#fff';
        octx.textAlign = 'center';
        octx.textBaseline = 'middle';

        const setFont = (size) => {
            octx.font = `700 ${size}px ${FONT_STACK}`;
            if ('letterSpacing' in octx) octx.letterSpacing = `${size * 0.06}px`;
        };

        // Fit to the canvas by measuring the real glyphs (letter-spacing and
        // font metrics make estimate-based fitting clip narrow viewports)
        const maxW = w * 0.94;
        let fontSize = Math.min(h * 0.8, maxW / Math.max(1, this.text.length * 0.66));
        setFont(fontSize);
        const measured = octx.measureText(this.text).width;
        if (measured > maxW) {
            fontSize *= maxW / measured;
            setFont(fontSize);
        }
        octx.fillText(this.text, w / 2, h / 2);

        const img = octx.getImageData(0, 0, w, h).data;
        const step = Math.max(3, Math.round(4 * this.dpr));
        const dots = [];
        for (let y = 0; y < h; y += step) {
            for (let x = 0; x < w; x += step) {
                if (img[(y * w + x) * 4 + 3] > 120) {
                    const ox = x + step / 2;
                    const oy = y + step / 2;
                    dots.push({
                        ox,
                        oy,
                        x: this.reduceMotion ? ox : Math.random() * w,
                        y: this.reduceMotion ? oy : Math.random() * h,
                        vx: 0,
                        vy: 0,
                        phase: Math.random() * Math.PI * 2,
                        delay: Math.random() * 0.3,
                        accent: Math.random() < 0.12
                    });
                }
            }
        }
        this.dots = dots;
        this.step = step;
        this.t = 0;
    }

    scatter() {
        this.state = 'scattered';
        this.t = 0;
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        for (const d of this.dots) {
            const dx = d.x - cx;
            const dy = d.y - cy;
            const len = Math.hypot(dx, dy) || 1;
            const speed = 300 + Math.random() * 700;
            d.vx = (dx / len) * speed + (Math.random() - 0.5) * 260;
            d.vy = (dy / len) * speed + (Math.random() - 0.5) * 260;
        }
        if (this.reduceMotion) {
            this.dots.length = 0;
            this.stop();
        }
    }

    stop() {
        this.running = false;
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('pointermove', this.onMove);
        document.removeEventListener('mouseleave', this.onLeave);
        this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    loop(now) {
        if (!this.running) return;
        if (!this.last) this.last = now;
        const dt = Math.min((now - this.last) / 1000, 0.05);
        this.last = now;
        this.t += dt;

        if (this.state === 'forming' && this.t > 0.9 + 0.35) this.state = 'idle';
        if (this.state === 'scattered' && this.t > 1.0) {
            this.stop();
            return;
        }

        this.render(dt);
        this.raf = requestAnimationFrame((n) => this.loop(n));
    }

    render(dt) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        const ptr = this.pointer;
        const repelR = 90 * this.dpr;

        for (const d of this.dots) {
            if (this.state === 'forming') {
                const k = Math.min(1, Math.max(0, (this.t - d.delay) / 0.85));
                const e = 1 - Math.pow(1 - k, 3);
                d.x = d.x * (1 - e) + d.ox * e;
                d.y = d.y * (1 - e) + d.oy * e;
            } else if (this.state === 'idle') {
                // Gentle breathing, then spring back from the pointer.
                // Reduced motion keeps the dots fixed in place.
                if (!this.reduceMotion) {
                    const breathe = Math.sin(this.t * 1.6 + d.phase) * 0.8;
                    let tx = d.ox + breathe;
                    let ty = d.oy + breathe * 0.6;
                    if (ptr.active) {
                        const dx = d.x - ptr.x;
                        const dy = d.y - ptr.y;
                        const dist = Math.hypot(dx, dy);
                        if (dist < repelR && dist > 0.001) {
                            const push = (1 - dist / repelR) * 14 * this.dpr;
                            tx += (dx / dist) * push;
                            ty += (dy / dist) * push;
                        }
                    }
                    d.x += (tx - d.x) * Math.min(1, dt * 14);
                    d.y += (ty - d.y) * Math.min(1, dt * 14);
                }
            } else {
                d.x += d.vx * dt;
                d.y += d.vy * dt;
                d.vx *= 0.94;
                d.vy *= 0.94;
            }

            const fade = this.state === 'scattered' ? Math.max(0, 1 - this.t * 1.1) : 1;
            ctx.fillStyle = d.accent
                ? `rgba(0, 242, 254, ${0.55 * fade})`
                : `rgba(245, 245, 248, ${0.9 * fade})`;
            const s = this.step * 0.55;
            ctx.fillRect(d.x - s / 2, d.y - s / 2, s, s);
        }
    }
}
