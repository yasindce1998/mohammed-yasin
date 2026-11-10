// Boot watchdog: if the WebGL module never reaches a usable state, replace the
// splash with the static project index instead of leaving a dead enter screen.
// Loaded as a classic deferred script so it still runs if the module graph fails.
(function () {
    'use strict';

    var TIMEOUT_MS = 15000;
    var settled = false;
    var timer = 0;

    var setState = function (state) {
        window.__portfolioBoot = state;
        try {
            document.documentElement.dataset.boot = state;
        } catch (e) { /* noop */ }
    };

    var settle = function (state) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        setState(state);
    };

    var fail = function (reason) {
        if (settled) return;
        settle('timeout');
        document.documentElement.classList.add('boot-timeout');
        var message = document.getElementById('fallback-message');
        if (message) {
            message.textContent = 'The interactive WebGL experience did not finish initialising. ' +
                'The static project index below has every case study and the résumé.';
        }
        try {
            window.dispatchEvent(new CustomEvent('portfolio:boot-timeout', { detail: { reason: reason } }));
        } catch (e) { /* noop */ }
    };

    window.addEventListener('portfolio:boot-ready', function () { settle('ready'); });
    window.addEventListener('portfolio:boot-settled', function () { settle('static'); });
    window.addEventListener('portfolio:boot-error', function (event) {
        fail((event && event.detail && event.detail.message) || 'initialization error');
    });

    // A failed module request fires an error event on the script element.
    window.addEventListener('error', function (event) {
        var target = event.target;
        if (target && target.tagName === 'SCRIPT' && /\/js\/main\.js(?:\?|$)/.test(target.src || '')) {
            fail('module load error');
        }
    }, true);

    timer = setTimeout(function () {
        if (document.documentElement.classList.contains('no-webgl')) {
            settle('static');
            return;
        }
        fail('timeout');
    }, TIMEOUT_MS);

    document.addEventListener('DOMContentLoaded', function () {
        if (document.documentElement.classList.contains('no-webgl')) settle('static');
    });

    // Offline/PWA support. Skip localhost by default so iterative development
    // never serves a stale cached module; append ?sw=1 to test it locally.
    if ('serviceWorker' in navigator) {
        var allowSW = location.protocol === 'https:' || /[?&]sw=1(?:&|$)/.test(location.search);
        if (allowSW) {
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('/sw.js').catch(function () { /* offline support is optional */ });
            });
        }
    }
})();
