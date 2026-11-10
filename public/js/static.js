// Tiny enhancement layer for the crawlable static pages. The pages are fully
// readable and navigable without JavaScript; this only wires the print button.

document.querySelectorAll('[data-print]').forEach((button) => {
    button.addEventListener('click', () => window.print());
});

// Same opt-in service-worker registration as the main experience. Localhost is
// skipped unless ?sw=1 is present so development never gets a stale cache.
if ('serviceWorker' in navigator) {
    const allowSW = location.protocol === 'https:' || /[?&]sw=1(?:&|$)/.test(location.search);
    if (allowSW) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        });
    }
}
