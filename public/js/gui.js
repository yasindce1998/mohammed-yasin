// Tiny live parameter editor. Toggle with the "G" key.
// Values persist to localStorage and can be exported/imported as JSON presets,
// so look-dev tweaks don't require code changes.

const STORAGE_KEY = 'yasin-portfolio.params.v1';

export class Gui {
    constructor(params, schema) {
        this.params = params;
        this.defaults = structuredClone(params);
        this.schema = schema;
        this.load();

        this.el = document.createElement('div');
        this.el.className = 'gui';
        this.el.hidden = true;
        this.el.setAttribute('role', 'dialog');
        this.el.setAttribute('aria-label', 'Parameters');
        document.body.appendChild(this.el);
        this.build();

        window.addEventListener('keydown', (e) => {
            // Plain G only: no browser-shortcut combos (Ctrl/Cmd+G) or key repeat
            if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat
                && !e.target.closest?.('input, textarea')) this.toggle();
        });
    }

    toggle() {
        this.el.hidden = !this.el.hidden;
    }

    build() {
        this.el.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'gui-header';
        header.innerHTML = '<strong>Parameters</strong><span>G to hide</span>';
        this.el.appendChild(header);

        for (const [group, fields] of Object.entries(this.schema)) {
            const details = document.createElement('details');
            details.open = group === Object.keys(this.schema)[0];
            const summary = document.createElement('summary');
            summary.textContent = group;
            details.appendChild(summary);

            for (const [key, [min, max, step]] of Object.entries(fields)) {
                const row = document.createElement('label');
                row.className = 'gui-row';
                const name = document.createElement('span');
                name.textContent = key;
                const input = document.createElement('input');
                input.type = 'range';
                input.min = min;
                input.max = max;
                input.step = step;
                input.value = this.params[key];
                const out = document.createElement('output');
                out.textContent = this.format(this.params[key], step);
                input.addEventListener('input', () => {
                    this.params[key] = Number(input.value);
                    out.textContent = this.format(this.params[key], step);
                    this.save();
                });
                row.append(name, input, out);
                details.appendChild(row);
            }
            this.el.appendChild(details);
        }

        const actions = document.createElement('div');
        actions.className = 'gui-actions';
        const button = (label, fn) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.addEventListener('click', fn);
            actions.appendChild(b);
        };
        button('Copy JSON', () => navigator.clipboard?.writeText(JSON.stringify(this.params, null, 2)));
        button('Paste JSON', async () => {
            try {
                const text = await navigator.clipboard.readText();
                this.apply(JSON.parse(text));
            } catch (err) {
                console.warn('Could not import preset:', err);
            }
        });
        button('Reset', () => this.apply(this.defaults));
        this.el.appendChild(actions);
    }

    apply(values) {
        for (const key of Object.keys(this.defaults)) {
            if (typeof values[key] === 'number') this.params[key] = values[key];
        }
        this.save();
        this.build();
    }

    format(v, step) {
        const decimals = String(step).split('.')[1]?.length ?? 0;
        return Number(v).toFixed(decimals);
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.params));
        } catch { /* storage may be unavailable (private mode) */ }
    }

    load() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (saved) {
                for (const key of Object.keys(this.params)) {
                    if (typeof saved[key] === 'number') this.params[key] = saved[key];
                }
            }
        } catch { /* ignore corrupt data */ }
    }
}
