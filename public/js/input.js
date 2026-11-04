// High-Performance Momentum Physics & Input Solver for the Portfolio
// Supports direct pointer dragging, fling inertia decay, wheel momentum,
// magnetic spring snapping, and click vs drag discrimination.

import { clamp, damp } from './math.js';

export class Input {
    constructor(el, { sections = 6, params = {} } = {}) {
        this.sections = sections;
        this.params = params;

        // Pointer state in normalized screen coords [0..1]
        this.pointer = {
            x: 0.5, y: 0.5,
            px: 0.5, py: 0.5,
            dx: 0, dy: 0,
            screenX: window.innerWidth / 2,
            screenY: window.innerHeight / 2,
            speed: 0,
            down: false,
            moved: false,
            type: 'mouse',
            isDragging: false
        };

        // Ribbon scroll & physics state
        this.scroll = {
            target: 0,
            current: 0,
            velocity: 0,       // Momentum, in sections per 60Hz frame
            speed: 0,          // Visual speed of `current`, in sections per second
            dragVelocity: 0,
            unwrapped: 0
        };

        // Drag tracking internals
        this.drag = {
            startX: 0,
            startY: 0,
            lastX: 0,
            lastTime: performance.now(),
            threshold: 6,      // Pixels to exceed before qualifying as a drag
            history: []        // Recent pointer samples for smooth release velocity
        };

        this.enabled = false;  // Set once the splash screen is dismissed
        this.locked = false;   // Set while a modal is open
        this.clickHandler = null;
        this.sectionChangeListeners = [];
        this.lastSectionIndex = 0;

        this.initEvents(el);
    }

    initEvents(el) {
        const onPointerMove = (e) => {
            const now = performance.now();
            const sx = e.clientX;
            const sy = e.clientY;

            this.pointer.screenX = sx;
            this.pointer.screenY = sy;
            this.pointer.x = sx / window.innerWidth;
            this.pointer.y = sy / window.innerHeight;
            this.pointer.moved = true;
            this.pointer.type = e.pointerType;

            if (this.pointer.down) {
                const totalDx = sx - this.drag.startX;
                const totalDy = sy - this.drag.startY;
                if (!this.pointer.isDragging && Math.hypot(totalDx, totalDy) > this.drag.threshold) {
                    this.pointer.isDragging = true;
                }

                if (this.pointer.isDragging) {
                    const stepDx = sx - this.drag.lastX;
                    const dragSpeed = this.params.dragSpeed || 0.0034;
                    // Horizontal drag drives the ribbon
                    this.scroll.target -= stepDx * dragSpeed;
                    
                    // Track velocity sample
                    const dt = Math.max((now - this.drag.lastTime) / 1000, 0.001);
                    const v = -(stepDx * dragSpeed) / dt;
                    this.drag.history.push({ v, t: now });
                    if (this.drag.history.length > 5) this.drag.history.shift();

                    this.drag.lastX = sx;
                    this.drag.lastTime = now;
                }
            }
        };

        window.addEventListener('pointermove', onPointerMove, { passive: true });

        window.addEventListener('pointerdown', (e) => {
            if (!this.enabled) return;
            if (e.target.closest?.('.gui, .modal, .enter, button, a, nav, header')) return;
            this.pointer.down = true;
            this.pointer.isDragging = false;
            this.drag.startX = e.clientX;
            this.drag.startY = e.clientY;
            this.drag.lastX = e.clientX;
            this.drag.lastTime = performance.now();
            this.drag.history = [];
            // Stop current momentum fling on grab
            this.scroll.velocity = 0;
            onPointerMove(e);
        });

        window.addEventListener('pointerup', (e) => {
            if (!this.pointer.down) return;
            const now = performance.now();
            
            if (this.pointer.isDragging) {
                // Compute release fling velocity from recent history
                const recent = this.drag.history.filter(h => now - h.t < 120);
                if (recent.length > 0) {
                    const avgV = recent.reduce((sum, h) => sum + h.v, 0) / recent.length;
                    this.scroll.velocity = clamp(avgV * 0.016, -0.6, 0.6);
                }
            } else {
                // Valid click (distance did not exceed threshold)
                this.clickHandler?.(e);
            }

            this.pointer.down = false;
            setTimeout(() => { this.pointer.isDragging = false; }, 30);
        });

        // Touch scrolls can be cancelled by the browser mid-gesture
        window.addEventListener('pointercancel', () => {
            this.pointer.down = false;
            this.pointer.isDragging = false;
        });

        window.addEventListener('wheel', (e) => {
            if (e.target.closest?.('.gui, .modal')) return;
            if (!this.enabled) return;   // don't hijack scrolling before the splash is dismissed
            if (e.ctrlKey) return;       // let browser pinch/zoom gestures through
            e.preventDefault();
            const scale = e.deltaMode === 1 ? 28 : e.deltaMode === 2 ? window.innerHeight : 1;
            const wheelFactor = (this.params.wheelSpeed || 0.0016) * 0.45;
            const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * scale;
            this.scroll.velocity += delta * wheelFactor;
            this.scroll.velocity = clamp(this.scroll.velocity, -0.7, 0.7);
        }, { passive: false });

        // Touch drags arrive through the pointer events above (#gl has touch-action: none)

        // Keyboard navigation
        window.addEventListener('keydown', (e) => {
            if (!this.enabled || this.locked) return;
            if (e.target.closest?.('input, textarea, .gui')) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'd') {
                e.preventDefault();
                this.step(1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'a') {
                e.preventDefault();
                this.step(-1);
            } else if (e.key === 'Home') {
                this.goTo(0);
            } else if (e.key === 'End') {
                this.goTo(this.visibleCount - 1);
            }
        });
    }

    onClick(fn) {
        this.clickHandler = fn;
    }

    // Number of cards in the active filter (set by UI when filtering)
    set visibleCount(n) {
        this._visibleCount = n;
    }

    get visibleCount() {
        return this._visibleCount || this.sections;
    }

    // Moves to a project index along the shortest path around the looping ribbon
    goTo(index) {
        const N = this.visibleCount;
        const from = Math.round(this.scroll.target);
        const diff = index - (((from % N) + N) % N);
        this.step(((diff % N) + N * 1.5) % N - N * 0.5);
    }

    step(count) {
        this.scroll.target = Math.round(this.scroll.target) + count;
        this.scroll.velocity = 0;
    }

    update(dt) {
        const p = this.pointer;
        const s = this.scroll;
        const params = this.params;

        p.dx = p.x - p.px;
        p.dy = p.y - p.py;
        p.px = p.x;
        p.py = p.y;
        const instant = Math.hypot(p.dx, p.dy) / Math.max(dt, 1e-3);
        p.speed = damp(p.speed, instant, 10, dt);

        // Momentum coasting with exponential friction decay
        if (!p.isDragging) {
            const friction = params.friction !== undefined ? params.friction : 0.92;
            s.target += s.velocity * (dt * 60);
            s.velocity *= Math.pow(friction, dt * 60);

            // Magnetic spring snapping when slowing down
            const snapActive = params.magneticSnap !== undefined ? params.magneticSnap : 1;
            if (snapActive && Math.abs(s.velocity) < 0.08) {
                const snapStrength = params.snapStrength || 5.5;
                const nearest = Math.round(s.target);
                const snapDelta = nearest - s.target;
                s.target += snapDelta * (1 - Math.exp(-snapStrength * dt));
                if (Math.abs(snapDelta) < 0.001) {
                    s.target = nearest;
                    s.velocity = 0;
                }
            }
        }

        // Recover from any non-finite state rather than freezing the render loop
        if (!Number.isFinite(s.target) || !Number.isFinite(s.velocity)) {
            s.target = Number.isFinite(s.current) ? Math.round(s.current) : 0;
            s.velocity = 0;
        }

        // Smooth camera/ribbon position follow
        const prevCurrent = s.current;
        s.current = damp(s.current, s.target, 14, dt);

        // Signed visual speed (sections per second). Kept separate from the
        // momentum velocity above so it never feeds back into the target.
        s.speed = (s.current - prevCurrent) / Math.max(dt, 1e-3);

        // Notify section change if active index changed
        const N = this.visibleCount;
        const activeIdx = ((Math.round(s.current) % N) + N) % N;
        if (activeIdx !== this.lastSectionIndex) {
            this.lastSectionIndex = activeIdx;
            this.sectionChangeListeners.forEach(fn => fn(activeIdx));
        }
    }

    onSectionChange(fn) {
        this.sectionChangeListeners.push(fn);
    }

    get activeIndex() {
        const N = this.visibleCount;
        return ((Math.round(this.scroll.current) % N) + N) % N;
    }

    get progress() {
        return this.scroll.current / this.sections;
    }
}
