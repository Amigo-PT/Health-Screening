(function () {
    'use strict';

    var root = document.documentElement;
    root.style.visibility = 'hidden';

    function revealSite() {
        root.style.visibility = '';
    }

    function renderMaintenance(message, preserveNavigation) {
        var style = document.createElement('style');
        style.textContent = [
            'html:not(.maintenance-page-only) body > :not(.maintenance-screen) { visibility: hidden !important; }',
            'html.maintenance-page-only body > :not(.maintenance-screen):not(nav.navbar) { visibility: hidden !important; }',
            '.maintenance-screen { box-sizing: border-box; position: fixed; inset: 0; z-index: 2147483647; min-height: 100vh; display: grid; place-items: center; overflow: auto; padding: 28px 20px; color: var(--text-primary, #191919); text-align: center; background: radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--accent-color, #ff6900) 7%, var(--bg-base, #f7f7f8)) 0%, transparent 64%), var(--bg-base, #f7f7f8); font-family: var(--font-hig, "MiSans", system-ui, sans-serif); }',
            'html.maintenance-page-only .maintenance-screen { top: var(--maintenance-nav-bottom, 0px); }',
            '.maintenance-card { box-sizing: border-box; width: min(100%, 560px); padding: clamp(32px, 7vw, 52px) clamp(24px, 6vw, 44px); border: 1px solid var(--hairline, #ececec); border-radius: var(--radius-xl, 24px); background: var(--surface-1, #fff); box-shadow: var(--shadow-pop, 0 12px 32px rgba(0,0,0,.1)); }',
            '.maintenance-icon { display: grid; place-items: center; width: 68px; height: 68px; margin: 0 auto 24px; border-radius: var(--radius-lg, 18px); background: var(--accent-soft, #fff1e6); color: var(--accent-color, #ff6900); font-size: 30px; }',
            '.maintenance-eyebrow { margin: 0 0 10px; color: var(--accent-text, #c24e00); font-size: .76rem; font-weight: 650; letter-spacing: .12em; text-transform: uppercase; }',
            '.maintenance-card h1 { margin: 0 0 14px; color: var(--text-primary, #191919); font-size: clamp(1.75rem, 5vw, 2.25rem); font-weight: 650; letter-spacing: -.025em; }',
            '.maintenance-card p:not(.maintenance-eyebrow) { margin: 0; color: var(--text-secondary, #5c5c5c); font-size: clamp(.96rem, 2.5vw, 1.04rem); line-height: 1.75; white-space: pre-wrap; }'
        ].join('\n');
        document.head.appendChild(style);
        root.classList.toggle('maintenance-page-only', Boolean(preserveNavigation));

        var screen = document.createElement('main');
        screen.className = 'maintenance-screen';
        screen.lang = 'en';
        screen.dir = 'ltr';

        var card = document.createElement('section');
        card.className = 'maintenance-card';

        var icon = document.createElement('div');
        icon.className = 'maintenance-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '⚙';

        var eyebrow = document.createElement('p');
        eyebrow.className = 'maintenance-eyebrow';
        eyebrow.textContent = 'Temporarily unavailable';

        var title = document.createElement('h1');
        title.textContent = 'We’ll be back soon';

        var detail = document.createElement('p');
        detail.textContent = message || 'We’re performing scheduled maintenance to improve your experience. Please check back soon.';

        card.append(icon, eyebrow, title, detail);
        screen.appendChild(card);
        Array.from(document.body.children).forEach(function (child) {
            if (preserveNavigation && child.matches('nav.navbar')) return;
            child.inert = true;
            child.setAttribute('aria-hidden', 'true');
        });
        document.body.insertBefore(screen, document.body.firstChild);
        if (preserveNavigation) {
            var navigation = document.querySelector('nav.navbar');
            if (navigation) {
                var updateNavigationOffset = function () {
                    root.style.setProperty('--maintenance-nav-bottom', Math.max(0, navigation.getBoundingClientRect().bottom) + 'px');
                };
                updateNavigationOffset();
                window.addEventListener('resize', updateNavigationOffset);
                if (window.ResizeObserver) {
                    new ResizeObserver(updateNavigationOffset).observe(navigation);
                }
            }
        }
        document.title = 'Maintenance in progress';

        var robots = document.querySelector('meta[name="robots"]');
        if (robots) robots.content = 'noindex, nofollow';
    }

    function applyConfig(config) {
        if (!config || typeof config.enabled !== 'boolean') {
            throw new Error('Invalid maintenance configuration.');
        }

        var path = window.location.pathname.split('/').pop() || 'index.html';
        var target = config.scope === 'all' ||
            (config.scope === 'pages' && Array.isArray(config.pages) && config.pages.indexOf(path) !== -1);

        if (!config.enabled || !target) {
            revealSite();
            return;
        }

        var message = typeof config.message === 'string' ? config.message : '';
        if (document.body) {
            renderMaintenance(message, config.scope === 'pages');
            revealSite();
        } else {
            document.addEventListener('DOMContentLoaded', function () {
                renderMaintenance(message, config.scope === 'pages');
                revealSite();
            }, { once: true });
        }
    }

    fetch('data/maintenance.json', { cache: 'no-store', credentials: 'omit' })
        .then(function (response) {
            if (!response.ok) throw new Error('Maintenance settings request failed: ' + response.status);
            return response.json();
        })
        .then(applyConfig)
        .catch(function (error) {
            console.error('Unable to load maintenance settings; showing the site normally.', error);
            revealSite();
        });
})();
