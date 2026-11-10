// Provider-neutral analytics hooks. The site ships no tracker and makes no
// network calls by itself; this module only forwards events to a provider that
// the host explicitly enabled (Vercel Analytics, Plausible, or gtag), and emits
// a DOM event for custom consumers.
//
// Enabled Vercel Analytics injects window.va, so `vercel.json` CSP already
// allows same-origin script/connect requests. To opt out entirely, remove the
// track() calls or ignore the events.

const EVENT_NAME = 'portfolio:analytics';

export function track(name, props = {}) {
    const detail = { name, props, ts: Date.now() };
    try {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
    } catch (e) { /* CustomEvent can be unavailable in exotic embeds */ }

    try {
        if (typeof window.va === 'function') {
            window.va('event', { name, ...props });
        } else if (typeof window.plausible === 'function') {
            window.plausible(name, { props });
        } else if (typeof window.gtag === 'function') {
            window.gtag('event', name, props);
        }
    } catch (e) {
        // Analytics must never break the portfolio.
    }
}

export function onTrack(handler) {
    if (typeof handler !== 'function') return () => {};
    const listener = (event) => handler(event.detail);
    window.addEventListener(EVENT_NAME, listener);
    return () => window.removeEventListener(EVENT_NAME, listener);
}
