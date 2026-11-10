// Portfolio UI, Dynamic Cursor & Case Study Modal

import { damp } from './math.js';
import { OWNER, ABOUT, EXPERIENCE, CLIENT_WORK } from './config.js';
import { track } from './analytics.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const GLYPHS = '01<>/\\[]{}#%&*+=-_ABCDEFGHJKLMNPRSTUVWXYZ';

function decode(el, text, { duration = 800, delay = 0 } = {}) {
    if (!el) return;
    if (el._decodeRaf) cancelAnimationFrame(el._decodeRaf);
    // Keep the real text available to assistive tech while it is scrambled
    el.setAttribute('aria-label', text);
    if (reduceMotion) {
        el.textContent = text;
        return;
    }
    const start = performance.now() + delay;
    const tick = (now) => {
        const t = Math.max(0, (now - start) / duration);
        let out = '';
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            const settle = i / text.length;
            if (ch === ' ' || t > settle + 0.25) out += ch;
            else if (t > settle - 0.15) out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            else out += '\u00a0';
        }
        el.textContent = out;
        if (t < 1.3) el._decodeRaf = requestAnimationFrame(tick);
        else el.textContent = text;
    };
    el._decodeRaf = requestAnimationFrame(tick);
}

const pad = (n, l = 2) => String(Math.floor(n)).padStart(l, '0');

export class UI {
    constructor(projects, input, audio, gui, cards) {
        this.projects = projects;
        this.input = input;
        this.audio = audio;
        this.gui = gui;
        this.cards = cards;

        // -1 forces the first updateProjectUI(0) call to populate the counter,
        // subtitle, accent, and aria-label from config instead of trusting the
        // hand-written defaults in index.html.
        this.current = -1;
        this.onEnter = null;
        this.entered = false;
        this.modalOpen = false;
        this.infoOpen = false;

        // DOM elements
        this.cursor = document.getElementById('cursor');
        this.cursorLabel = document.getElementById('cursor-label');
        this.counterBadge = document.getElementById('project-counter');
        this.telemetryTime = document.getElementById('telemetry-time');
        this.soundBtn = document.getElementById('sound');
        this.infoBtn = document.getElementById('info-toggle');
        this.guiBtn = document.getElementById('gui-toggle');

        this.projectCategory = document.getElementById('project-category');
        this.projectTitle = document.getElementById('project-title');
        this.projectSubtitle = document.getElementById('project-subtitle');
        this.btnViewProject = document.getElementById('btn-view-project');

        this.pagination = document.getElementById('project-pagination');
        this.filterTabs = document.getElementById('filter-tabs');

        // Case study modal elements
        this.modal = document.getElementById('case-study-modal');
        this.modalBackdrop = document.getElementById('modal-backdrop');
        this.modalClose = document.getElementById('modal-close');
        this.modalMeta = document.getElementById('modal-meta');
        this.modalTitle = document.getElementById('modal-title');
        this.modalTagline = document.getElementById('modal-tagline');
        this.modalHeroGlow = document.getElementById('modal-hero-glow');
        this.modalHeroArt = document.getElementById('modal-hero-art');
        this.modalDesc = document.getElementById('modal-desc');
        this.modalYear = document.getElementById('modal-year');
        this.modalTags = document.getElementById('modal-tags');
        this.modalFullPage = document.getElementById('modal-fullpage');

        // Info modal
        this.infoModal = document.getElementById('info-modal');
        this.infoBackdrop = document.getElementById('info-backdrop');
        this.infoClose = document.getElementById('info-close');

        // Cursor smoothing
        this.cursorPos = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            tx: window.innerWidth / 2,
            ty: window.innerHeight / 2,
            state: 'drag' // 'drag' | 'view' | 'close' | 'hidden'
        };

        if (this.cursor) {
            this.cursor.style.transform = `translate(${this.cursorPos.x}px, ${this.cursorPos.y}px) translate(-50%, -50%)`;
        }

        this.initEnter();
        this.initClocks();
        this.initPagination();
        this.initFilters();
        this.initModals();
        this.initA11y();
        this.initCursorEvents();
        this.updateProjectUI(0);
    }

    initEnter() {
        const enter = document.getElementById('enter');
        const go = (withSound) => {
            if (this.entered) return;
            this.entered = true;
            document.documentElement.classList.add('entered');
            this.cursor?.classList.remove('button-hover');
            this.cursor?.classList.add('visible');
            this.onEnter?.(withSound);
            if (withSound) this.setSound(true);

            // Deep link (#/project-id): jump the ribbon there and open its case study
            const linked = this.projects.findIndex(p => `#/${p.id}` === location.hash);
            if (linked !== -1) {
                // goTo expects a slot in the filtered ribbon, not a project index
                const slot = this.cards ? this.cards.visibleList.indexOf(linked) : linked;
                this.input.goTo(slot === -1 ? 0 : slot);
                setTimeout(() => this.openCaseStudy(this.projects[linked]), reduceMotion ? 0 : 1200);
            }
            setTimeout(() => {
                // this.current is a project index; map it back to its ribbon slot
                const slot = this.cards ? this.cards.visibleList.indexOf(this.current) : this.current;
                this.updateProjectUI(slot === -1 ? 0 : slot, true);
            }, reduceMotion ? 0 : 800);
        };

        document.getElementById('enter-sound').addEventListener('click', () => go(true));
        document.getElementById('enter-silent').addEventListener('click', () => go(false));

        enter.querySelectorAll('[data-decode]').forEach((el, i) => {
            decode(el, el.dataset.decode, { delay: 200 + i * 220, duration: 900 });
        });

        this.soundBtn.addEventListener('click', () => this.setSound(this.audio.toggle()));
        this.guiBtn?.addEventListener('click', () => this.gui?.toggle());
    }

    initClocks() {
        const updateTimes = () => {
            try {
                const now = new Date();
                const blr = new Intl.DateTimeFormat('en-US', {
                    timeZone: OWNER.timezone,
                    hour: '2-digit', minute: '2-digit', hour12: false
                }).format(now);
                if (this.telemetryTime) {
                    this.telemetryTime.textContent = `BLR ${blr} // ${OWNER.coords}`;
                }
            } catch (e) {
                // Fallback
            }
        };
        updateTimes();
        setInterval(updateTimes, 1000);
    }

    initPagination() {
        if (!this.pagination) return;
        this.pagination.innerHTML = '';
        this.pagDots = this.projects.map((p, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `pag-dot ${i === 0 ? 'active' : ''}`;
            btn.textContent = p.num;
            btn.setAttribute('aria-label', `Navigate to ${p.title}`);
            btn.addEventListener('click', () => {
                // Map project index to its slot in the filtered ribbon
                if (!this.cards) return this.input.goTo(i);
                const slot = this.cards.visibleList.indexOf(i);
                if (slot !== -1) this.input.goTo(slot);
                this.audio.tick(2200);
            });
            btn.addEventListener('mouseenter', () => this.audio.blip(80, 0.02));
            this.pagination.appendChild(btn);
            return btn;
        });
    }

    initFilters() {
        if (!this.filterTabs) return;
        this.filterTabs.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                // Only mark the tab active if the filter actually applied
                if (!this.applyFilter(btn.dataset.filter)) return;
                this.filterTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.audio.tick(1600);
                track('filter', { category: btn.dataset.filter });
            });
        });
    }

    // Applies a category filter to the ribbon and re-anchors navigation.
    // Returns false when the filter matches nothing (state left untouched).
    applyFilter(filter) {
        const cards = this.cards;
        if (!cards) return false;

        if (filter === 'ALL') {
            cards.setVisible(null);
            this.input.visibleCount = this.projects.length;
        } else {
            const indices = this.projects
                .map((p, i) => p.category === filter ? i : -1)
                .filter(i => i !== -1);
            if (indices.length === 0) return false;
            cards.setVisible(indices);
            this.input.visibleCount = indices.length;
        }

        // Re-anchor: ribbon target moves to slot 0 of the filtered set,
        // wrapping from wherever it currently is
        const N = this.input.visibleCount;
        const from = Math.round(this.input.scroll.target);
        const cur = ((from % N) + N) % N;
        this.input.scroll.target = from - cur;
        this.input.scroll.velocity = 0;

        // Hide pagination dots for filtered-out projects
        this.pagDots?.forEach((dot, i) =>
            dot.classList.toggle('filtered-out', cards.visibleList.indexOf(i) === -1));
        return true;
    }

    initModals() {
        // Case study trigger
        this.btnViewProject?.addEventListener('click', () => {
            this.openCaseStudy(this.projects[this.current]);
        });

        // Close handlers
        this.modalClose?.addEventListener('click', () => this.closeCaseStudy());
        this.modalBackdrop?.addEventListener('click', () => this.closeCaseStudy());

        // Info modal handlers
        this.infoBtn?.addEventListener('click', () => this.openInfo());
        this.infoClose?.addEventListener('click', () => this.closeInfo());
        this.infoBackdrop?.addEventListener('click', () => this.closeInfo());

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeCaseStudy();
                this.closeInfo();
            } else if (e.key === 'Tab') {
                // Keep focus inside whichever dialog is open
                const modal = this.modalOpen ? this.modal : (this.infoOpen ? this.infoModal : null);
                if (modal) this.trapFocus(e, modal);
            }
        });
    }

    // Simple focus trap: wraps Tab/Shift+Tab within the given modal
    trapFocus(e, modal) {
        const focusables = modal.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) {
            e.preventDefault();
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !modal.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || !modal.contains(active))) {
            e.preventDefault();
            first.focus();
        }
    }

    // GLA11y-style accessibility layer: a visually hidden DOM mirror of the
    // WebGL ribbon so keyboard and screen-reader users can open every project.
    // The list only becomes visible when focused (see .sr-only:focus-within).
    initA11y() {
        this.srStatus = document.getElementById('sr-status');

        const nav = document.createElement('nav');
        nav.className = 'sr-only sr-nav';
        nav.setAttribute('aria-label', 'Projects');

        this.projects.forEach((p, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = `${p.num}. ${p.title} — ${p.tagline}`;
            btn.setAttribute('aria-haspopup', 'dialog');
            btn.addEventListener('click', () => {
                const slot = this.cards ? this.cards.visibleList.indexOf(i) : i;
                if (slot !== -1) this.input.goTo(slot);
                this.openCaseStudy(p);
            });
            nav.appendChild(btn);
        });

        document.body.appendChild(nav);
    }

    // Keep the page behind a dialog out of the tab order and the accessibility
    // tree. `inert` is supported in every browser targeted by this site.
    setBackgroundInert(on) {
        document.querySelectorAll('header.top, .bottom-bar, #content, .frame').forEach((el) => {
            if (on) el.setAttribute('inert', '');
            else el.removeAttribute('inert');
        });
    }

    setModalVisible(modal, visible, focusEl) {
        modal.classList.toggle('active', visible);
        modal.setAttribute('aria-hidden', String(!visible));
        this.input.locked = this.modalOpen || this.infoOpen;
        const anyOpen = this.modalOpen || this.infoOpen;
        if (visible) this.lastFocus = document.activeElement;
        this.setBackgroundInert(anyOpen);
        if (visible) {
            focusEl?.focus({ preventScroll: true });
        } else if (!anyOpen) {
            this.lastFocus?.focus?.({ preventScroll: true });
        }
    }

    openInfo() {
        if (this.infoOpen || !this.infoModal) return;
        this.infoOpen = true;
        this.setModalVisible(this.infoModal, true, this.infoClose);
        this.audio.tick(2000);
        track('about:open');
    }

    closeInfo() {
        if (!this.infoOpen) return;
        this.infoOpen = false;
        this.setModalVisible(this.infoModal, false);
        this.audio.tick(1400);
    }

    // Fills the About modal with experience timeline and client work (once)
    initAboutContent() {
        if (this._aboutPopulated) return;
        this._aboutPopulated = true;

        const summary = document.getElementById('info-summary');
        if (summary && ABOUT?.summary) summary.textContent = ABOUT.summary;

        const stats = document.getElementById('info-stats');
        if (stats && ABOUT?.stats) {
            stats.innerHTML = ABOUT.stats.map(s => `
                <div class="stat">
                    <strong>${s.value}</strong>
                    <span>${s.label}</span>
                </div>`).join('');
        }

        const expList = document.getElementById('exp-list');
        if (expList) {
            expList.innerHTML = EXPERIENCE.map(e => `
                <div class="exp-item">
                    <span class="exp-role">${e.role}</span>
                    <span class="exp-company">${e.company}</span>
                    <span class="exp-period">${e.period}</span>
                </div>`).join('');
        }

        const clientList = document.getElementById('client-list');
        if (clientList) {
            clientList.innerHTML = CLIENT_WORK.map(c => `
                <div class="client-item">
                    <span class="client-name">${c.client}</span>
                    <span class="client-via">via ${c.via}</span>
                    <span class="client-note">${c.note}</span>
                </div>`).join('');
        }
    }

    initCursorEvents() {
        window.addEventListener('pointermove', (e) => {
            this.cursorPos.tx = e.clientX;
            this.cursorPos.ty = e.clientY;
            this.cursor.classList.add('visible');
        }, { passive: true });

        document.addEventListener('mouseleave', () => this.cursor.classList.remove('visible'));

        // Magnetic buttons
        document.querySelectorAll('[data-magnetic]').forEach((el) => {
            el.addEventListener('pointermove', (e) => {
                if (reduceMotion) return;
                const r = el.getBoundingClientRect();
                const x = (e.clientX - r.left - r.width / 2) * 0.25;
                const y = (e.clientY - r.top - r.height / 2) * 0.25;
                el.style.transform = `translate(${x}px, ${y}px)`;
                this.cursor.classList.add('button-hover');
            });
            el.addEventListener('pointerleave', () => {
                el.style.transform = '';
                this.cursor.classList.remove('button-hover');
            });
        });
    }

    setCursorState(state) {
        if (this.cursorPos.state === state) return;
        this.cursorPos.state = state;

        this.cursor.classList.remove('view-state', 'close-state');

        if (state === 'view') {
            this.cursor.classList.add('view-state');
            this.cursorLabel.textContent = 'VIEW';
        } else if (state === 'close') {
            this.cursor.classList.add('close-state');
            this.cursorLabel.textContent = 'CLOSE';
        } else {
            this.cursorLabel.textContent = 'DRAG';
        }
    }

    setSound(on) {
        this.soundBtn.setAttribute('aria-pressed', String(on));
        this.soundBtn.querySelector('span').textContent = on ? 'AUDIO ON' : 'AUDIO OFF';
    }

    openCaseStudy(project) {
        if (!project || this.modalOpen) return;
        this.modalOpen = true;
        this.originalTitle = this.originalTitle || document.title;

        this.modalMeta.textContent = `[ ${project.num} // ${project.category} · ${project.year} ]`;
        this.modalTitle.textContent = project.title;
        this.modalTagline.textContent = project.tagline;
        this.modalDesc.textContent = project.description;

        const focus = document.getElementById('modal-focus');
        const status = document.getElementById('modal-status');
        const repo = document.getElementById('modal-repo');
        const launch = document.getElementById('modal-launch');
        if (focus) focus.textContent = project.focus || '—';
        if (status) status.textContent = project.status || '—';
        if (this.modalYear) this.modalYear.textContent = project.year || '—';
        if (repo) {
            repo.textContent = project.url ? project.url.replace('https://', '') : '—';
            if (project.url) repo.href = project.url;
        }
        if (launch && project.url) {
            launch.href = project.url;
            launch.textContent = 'VIEW SOURCE ↗';
        }
        if (this.modalFullPage) this.modalFullPage.href = `/work/${project.id}/`;

        // Accent glow
        const accent = project.accent || '#00f2fe';
        this.modalHeroGlow.style.background = `radial-gradient(circle at 80% 20%, ${accent}40, transparent 70%)`;
        document.documentElement.style.setProperty('--accent', accent);
        this.drawModalHeroArt(project, accent);

        // Tags
        this.modalTags.innerHTML = project.tags.map(t => `<span class="tech-tag">${t}</span>`).join('');

        // Populate About modal once on first open
        this.initAboutContent();

        this.setModalVisible(this.modal, true, this.modalClose);
        this.modal.querySelector('.modal-container').scrollTop = 0;
        document.title = `${project.title} — Mohammed Yasin`;
        history.replaceState(null, '', `#/${project.id}`);
        this.setCursorState('close');
        this.audio.modalOpen();
        track('project:open', {
            id: project.id,
            title: project.title,
            category: project.category
        });
    }

    // Reuses the ribbon card's schematic so the case-study hero matches the card
    drawModalHeroArt(project, accent) {
        const canvas = this.modalHeroArt;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !this.cards) return;
        const { width: w, height: h } = canvas;

        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(120, 160, 200, 0.06)';
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 40) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = 0; y < h; y += 40) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        ctx.save();
        ctx.translate(w * 0.72, h * 0.5);
        ctx.scale(1.25, 1.25);
        this.cards.drawProjectArt(ctx, project.id, accent);
        ctx.restore();
    }

    closeCaseStudy() {
        if (!this.modalOpen) return;
        this.modalOpen = false;
        this.setModalVisible(this.modal, false);
        document.title = this.originalTitle || document.title;
        history.replaceState(null, '', location.pathname);
        document.documentElement.style.setProperty('--accent', this.projects[this.current].accent);
        this.setCursorState('drag');
        this.audio.modalClose();
        track('project:close', { id: this.projects[this.current]?.id });
    }

    updateProjectUI(logicalIndex, force = false) {
        // Map ribbon slot through the active filter to the real project
        const p = this.cards ? this.cards.projectAt(logicalIndex) : this.projects[logicalIndex];
        if (!p) return;
        const index = this.projects.indexOf(p);
        if (index === this.current && !force) return;
        this.current = index;

        // Update accent CSS variable
        document.documentElement.style.setProperty('--accent', p.accent);

        // Update counter badge
        if (this.counterBadge) {
            this.counterBadge.textContent = `[ ${p.num} / ${pad(this.projects.length)} ]`;
        }

        // Update active project info
        if (this.projectCategory) {
            this.projectCategory.textContent = `[ ${p.num} // ${p.category} ]`;
        }
        if (this.projectTitle) {
            decode(this.projectTitle, p.title, { duration: 550 });
        }
        if (this.projectSubtitle) {
            this.projectSubtitle.textContent = p.subtitle;
        }

        // Update pagination dots
        this.pagDots?.forEach((dot, i) => dot.classList.toggle('active', i === index));

        // Announce the focused project to assistive tech
        if (this.srStatus) {
            this.srStatus.textContent = `${p.num}. ${p.title} — ${p.tagline}`;
        }
    }

    update(dt, velocity) {
        // Cursor damping
        const c = this.cursorPos;
        c.x = damp(c.x, c.tx, 26, dt);
        c.y = damp(c.y, c.ty, 26, dt);

        // Dynamic slight velocity skew
        const skew = Math.max(-25, Math.min(25, velocity * 40));
        this.cursor.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -50%) skewX(${-skew * 0.4}deg)`;
    }
}
