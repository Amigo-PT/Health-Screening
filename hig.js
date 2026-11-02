(() => {
    "use strict";

    const HIG = {};
    const root = document.documentElement;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const countUpFrames = new WeakMap();

    HIG.escapeHtml = (str = "") =>
        String(str).replace(/[&<>"']/g, (m) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[m]));

    HIG.setAccent = (color) => {
        if (color) root.style.setProperty("--accent-color", color);
    };

    HIG.countUp = (el, target, duration = 1400, format, from = 0) => {
        if (!el) return;
        const fmt = typeof format === "function"
            ? format
            : (value) => Math.round(Number(value)).toLocaleString();
        const previousFrame = countUpFrames.get(el);
        if (previousFrame) cancelAnimationFrame(previousFrame);
        countUpFrames.delete(el);
        if (prefersReduced) {
            el.textContent = fmt(target);
            return;
        }
        const start = performance.now();
        const startValue = Number(from) || 0;
        const tick = (now) => {
            /* A frame timestamp can precede `start` when the animation begins
               inside the current frame, so clamp progress to 0–1. */
            const p = Math.min(Math.max((now - start) / duration, 0), 1);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = fmt(startValue + (Number(target) - startValue) * eased);
            if (p < 1) {
                countUpFrames.set(el, requestAnimationFrame(tick));
            } else {
                countUpFrames.delete(el);
            }
        };
        countUpFrames.set(el, requestAnimationFrame(tick));
    };

    let scrollTicking = false;
    const onScroll = () => {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(() => {
            document.body.classList.toggle("is-scrolled", window.scrollY > 24);
            root.style.setProperty("--scroll-float", Math.min(window.scrollY, 800));
            scrollTicking = false;
        });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("revealed");
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

    HIG.refreshReveals = (scope = document) => {
        scope.querySelectorAll("[data-reveal]:not(.revealed)").forEach((el) => {
            const delay = el.getAttribute("data-reveal-delay");
            if (delay) el.style.setProperty("--reveal-delay", delay + "ms");
            revealObserver.observe(el);
        });
    };

    HIG.initSegmented = (control, onChange) => {
        if (!control || control.dataset.segReady === "true") return;
        control.dataset.segReady = "true";

        let indicator = control.querySelector(".seg-indicator");
        if (!indicator) {
            indicator = document.createElement("span");
            indicator.className = "seg-indicator";
            control.prepend(indicator);
        }

        const buttons = Array.from(control.querySelectorAll(".seg-btn"));

        const place = (btn) => {
            if (!btn) return;
            indicator.style.width = btn.offsetWidth + "px";
            indicator.style.transform = `translateX(${btn.offsetLeft}px)`;
        };

        const activate = (btn, fire = true) => {
            if (!btn) return;
            buttons.forEach((b) => {
                const on = b === btn;
                b.classList.toggle("active", on);
                b.setAttribute("aria-pressed", on ? "true" : "false");
            });
            place(btn);
            if (fire && onChange) onChange(btn.dataset.value || btn.textContent.trim(), btn);
        };

        buttons.forEach((b) => b.addEventListener("click", () => activate(b)));

        window.addEventListener("resize", () => place(control.querySelector(".seg-btn.active")));
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => place(control.querySelector(".seg-btn.active")));
        }

        activate(buttons.find((b) => b.classList.contains("active")) || buttons[0], false);
    };

    let lbEl = null, lbImg = null, lbCurrent = null, lbTotal = null, lbTrigger = null;
    let lbImages = [], lbIndex = 0;

    const preload = (i) => {
        const item = lbImages[i];
        if (!item) return;
        const im = new Image();
        im.src = item.src;
    };

    const renderLbImage = () => {
        const item = lbImages[lbIndex];
        if (!item || !lbImg) return;
        const reveal = () => {
            requestAnimationFrame(() => {
                lbImg.style.opacity = "1";
                lbImg.style.transform = "scale(1)";
            });
        };
        lbImg.style.opacity = "0";
        lbImg.style.transform = "scale(0.985)";
        lbImg.onload = reveal;
        lbImg.onerror = reveal;
        lbImg.alt = item.alt || "";
        lbImg.src = item.src;
        if (lbImg.complete && lbImg.naturalWidth > 0) reveal();
        if (lbCurrent) lbCurrent.textContent = lbIndex + 1;
        if (lbTotal) lbTotal.textContent = lbImages.length;
        preload(lbIndex + 1);
        preload(lbIndex - 1);
    };

    const closeLightbox = () => {
        if (!lbEl) return;
        lbEl.classList.remove("open");
        document.body.style.overflow = "";
        const trigger = lbTrigger;
        lbTrigger = null;
        window.setTimeout(() => {
            if (!lbEl.classList.contains("open")) {
                lbEl.style.visibility = "";
                if (trigger && trigger.isConnected) trigger.focus();
            }
        }, 500);
    };

    const stepLightbox = (dir) => {
        if (!lbImages.length) return;
        lbIndex = (lbIndex + dir + lbImages.length) % lbImages.length;
        renderLbImage();
    };

    const ensureLightbox = () => {
        if (lbEl) return;
        lbEl = document.createElement("div");
        lbEl.className = "lightbox";
        lbEl.setAttribute("role", "dialog");
        lbEl.setAttribute("aria-modal", "true");
        lbEl.setAttribute("aria-label", "Photo viewer");
        lbEl.innerHTML = `
            <div class="lb-stage"><img class="lb-img" alt=""></div>
            <button type="button" class="lb-btn lb-close" aria-label="Close"><i class="bi bi-x-lg"></i></button>
            <button type="button" class="lb-btn lb-prev" aria-label="Previous"><i class="bi bi-chevron-left"></i></button>
            <button type="button" class="lb-btn lb-next" aria-label="Next"><i class="bi bi-chevron-right"></i></button>
            <div class="lb-counter" aria-live="polite" aria-atomic="true"><span class="lb-current">1</span><span class="lb-sep">/</span><span class="lb-total">1</span></div>`;
        document.body.appendChild(lbEl);

        lbImg = lbEl.querySelector(".lb-img");
        lbCurrent = lbEl.querySelector(".lb-current");
        lbTotal = lbEl.querySelector(".lb-total");

        lbEl.querySelector(".lb-close").addEventListener("click", closeLightbox);
        lbEl.querySelector(".lb-prev").addEventListener("click", (e) => { e.stopPropagation(); stepLightbox(-1); });
        lbEl.querySelector(".lb-next").addEventListener("click", (e) => { e.stopPropagation(); stepLightbox(1); });

        lbEl.addEventListener("click", (e) => {
            if (e.target === lbEl || e.target.classList.contains("lb-stage")) closeLightbox();
        });

        document.addEventListener("keydown", (e) => {
            if (!lbEl.classList.contains("open")) return;
            if (e.key === "Escape") closeLightbox();
            else if (e.key === "ArrowRight") stepLightbox(1);
            else if (e.key === "ArrowLeft") stepLightbox(-1);
            else if (e.key === "Tab") {
                const controls = Array.from(lbEl.querySelectorAll("button:not([disabled])"));
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (!lbEl.contains(document.activeElement)) {
                    e.preventDefault();
                    first.focus();
                } else if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        });
    };

    HIG.lightbox = {
        open(images, index = 0, trigger = null) {
            if (!images || !images.length) return;
            lbImages = images.map((i) => (typeof i === "string" ? { src: i } : i));
            ensureLightbox();
            lbTrigger = trigger || (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null);
            lbEl.style.visibility = "visible";
            lbIndex = Math.max(0, Math.min(index, lbImages.length - 1));
            renderLbImage();
            requestAnimationFrame(() => {
                lbEl.classList.add("open");
                lbEl.querySelector(".lb-close").focus();
            });
            document.body.style.overflow = "hidden";
        },
        close: closeLightbox,
        next: () => stepLightbox(1),
        prev: () => stepLightbox(-1)
    };

    /* ---------- Shared UI helpers ---------- */

    HIG.formatNumber = (value) => Number(value || 0).toLocaleString();

    HIG.formatPercent = (value, digits = 1) =>
        `${Number(value || 0).toFixed(digits)}%`;

    /**
     * Sanitize HTML string by escaping dangerous characters while preserving
     * safe formatting tags: <b>, <i>, <br>, <ul>, <li>, <strong>, <em>.
     * Use for trusted JSON data only.
     */
    HIG.sanitizeHtml = (html = "") => {
        const str = String(html == null ? "" : html);
        const div = document.createElement('div');
        div.textContent = str;
        // Escape all HTML first, then re-allow only safe tags
        let safe = div.innerHTML;
        safe = safe
            .replace(/&lt;b&gt;/g, '<b>')
            .replace(/&lt;\/b&gt;/g, '</b>')
            .replace(/&lt;i&gt;/g, '<i>')
            .replace(/&lt;\/i&gt;/g, '</i>')
            .replace(/&lt;strong&gt;/g, '<strong>')
            .replace(/&lt;\/strong&gt;/g, '</strong>')
            .replace(/&lt;em&gt;/g, '<em>')
            .replace(/&lt;\/em&gt;/g, '</em>')
            .replace(/&lt;br\s*\/?&gt;/g, '<br>')
            .replace(/&lt;ul&gt;/g, '<ul>')
            .replace(/&lt;\/ul&gt;/g, '</ul>')
            .replace(/&lt;li&gt;/g, '<li>')
            .replace(/&lt;\/li&gt;/g, '</li>');
        return safe;
    };

    /**
     * Render trusted HTML content (e.g. from local JSON files that may contain
     * <b>, <i>, <br>, <ul> etc. formatting tags).
     * Use ONLY for data you control/trust — NOT for user-provided input.
     * Returns sanitized HTML safe for innerHTML injection.
     */
    HIG.renderHtml = (html = "") => HIG.sanitizeHtml(String(html == null ? "" : html));

    /* ---------- Pagination helpers ---------- */

    /**
     * Paginate an array of items.
     * @param {Array} items - full array of items
     * @param {number} page - current page (1-based)
     * @param {number} pageSize - items per page
     * @returns {object} { page, pageSize, totalPages, totalItems, items, start, end, hasPrev, hasNext }
     */
    HIG.paginate = (items = [], page = 1, pageSize = 10) => {
        const totalItems = items.length;
        const pageSizeN = Math.max(1, Number(pageSize) || 10);
        const totalPages = Math.ceil(totalItems / pageSizeN) || 1;
        const pageN = Math.max(1, Math.min(Number(page) || 1, totalPages));
        const start = (pageN - 1) * pageSizeN;
        const end = Math.min(start + pageSizeN, totalItems);
        return {
            page: pageN,
            pageSize: pageSizeN,
            totalPages,
            totalItems,
            items: items.slice(start, end),
            start: start + 1,
            end,
            hasPrev: pageN > 1,
            hasNext: pageN < totalPages
        };
    };

    /**
     * Render pagination controls HTML (Arabic labels).
     * @param {object} pg - result from HIG.paginate
     * @param {string} onPageChange - name of global function to call on page change
     * @param {string} containerId - id of the paginated container (for aria-controls)
     * @returns {string} HTML string
     */
    HIG.paginationControls = (pg, onPageChange = 'onPageChange', containerId = '') => {
        if (pg.totalPages <= 1) return '';
        const btn = (label, p, disabled) => `
            <button type="button" class="btn btn-sm ${disabled ? 'btn-outline-secondary disabled' : 'btn-outline-secondary'}"
                ${disabled ? 'disabled aria-disabled="true"' : ''}
                onclick="${onPageChange}(${p})">${label}</button>`;
        const pages = [];
        pages.push(btn('Previous', pg.page - 1, !pg.hasPrev));
        for (let i = 1; i <= pg.totalPages; i++) {
            pages.push(`<button type="button" class="btn btn-sm ${i === pg.page ? 'btn-primary' : 'btn-outline-secondary'}"
                onclick="${onPageChange}(${i})">${i}</button>`);
        }
        pages.push(btn('Next', pg.page + 1, !pg.hasNext));
        return `<div class="pagination-controls d-flex justify-content-center align-items-center gap-2 mt-3" role="navigation" aria-label="التنقل بين الصفحات" ${containerId ? `aria-controls="${containerId}"` : ''}>
            ${pages.join('')}
            <span class="text-muted small">Page ${pg.page} of ${pg.totalPages}</span>
        </div>`;
    };

    /**
     * Unified empty / loading / error panel markup.
     * Always returns escaped-safe markup.
     */
    HIG.statePanel = ({ icon = "bi-info-circle", title = "", text = "", action = "" } = {}) => `
        <div class="glass-panel state-panel">
            <div class="state-icon"><i class="bi ${icon}" aria-hidden="true"></i></div>
            <h5 class="state-title">${HIG.escapeHtml(title)}</h5>
            <p class="state-text">${HIG.escapeHtml(text)}</p>
            ${action}
        </div>`;

    /**
     * Render "Updated 3 minutes ago" plus an optional refresh button.
     * The button is wired to the supplied handler.
     */
    /**
     * Show a toast notification that auto-dismisses.
     * kind: 'ok' | 'error' | 'loading' | 'info'
     */
    HIG.toast = (message, kind = 'ok', duration = 3000) => {
        let el = document.getElementById('hig-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'hig-toast';
            el.className = 'hig-toast';
            el.setAttribute('aria-live', 'polite');
            el.setAttribute('role', 'status');
            document.body.appendChild(el);
        }
        const iconMap = {
            ok: 'bi-check-circle',
            error: 'bi-exclamation-circle',
            loading: 'bi-arrow-repeat',
            info: 'bi-info-circle'
        };
        el.innerHTML = `<i class="bi ${iconMap[kind] || 'bi-info-circle'}"></i>
            <span>${HIG.escapeHtml(message)}</span>`;
        el.className = 'hig-toast hig-toast-show hig-toast-' + kind;
        clearTimeout(HIG.toast._timer);
        HIG.toast._timer = setTimeout(() => {
            el.classList.remove('hig-toast-show');
        }, duration);
    };

    /**
     * Elegant empty state panel using HIG.statePanel tokens.
     */
    HIG.emptyState = ({ icon = "bi-inbox", title = "No data available", text = "", action = "" } = {}) => `
        <div class="glass-panel state-panel empty-state">
            <div class="state-icon"><i class="bi ${icon}" aria-hidden="true"></i></div>
            <h5 class="state-title">${HIG.escapeHtml(title)}</h5>
            <p class="state-text">${HIG.escapeHtml(text)}</p>
            ${action}
        </div>`;

    HIG.lastUpdated = (el, timestamp, options = {}) => {
        if (!el) return;
        const ts = timestamp ? new Date(timestamp).getTime() : null;
        const stale = options.stale === true;
        el.classList.add("sync-stamp");
        el.classList.toggle("is-stale", stale);

        const icon = stale ? "bi-cloud-slash" : "bi-clock-history";
        const label = ts ? `Updated ${HIG.relativeTime(ts)}` : "Not updated yet";
        const exact = ts ? HIG.formatTime(ts) : "";

        el.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i><span>${HIG.escapeHtml(label)}</span>`
            + (exact ? `<span class="sync-stamp-exact">${HIG.escapeHtml(exact)}</span>` : "");
        el.title = exact || "";

        if (options.refreshTarget) {
            options.refreshTarget.addEventListener("click", options.onRefresh);
        }
    };

    HIG.relativeTime = (ts) => {
        if (!ts) return "not yet updated";
        const diff = Math.max(0, Date.now() - new Date(ts).getTime());
        const minutes = Math.round(diff / 60000);
        if (minutes < 1) return "just now";
        if (minutes === 1) return "1 minute ago";
        if (minutes < 60) return `${minutes} minutes ago`;
        const hours = Math.round(minutes / 60);
        if (hours === 1) return "1 hour ago";
        if (hours < 24) return `${hours} hours ago`;
        const days = Math.round(hours / 24);
        return days === 1 ? "yesterday" : `${days} days ago`;
    };

    HIG.formatTime = (ts) => {
        if (!ts) return "";
        return new Date(ts).toLocaleString("en-US", {
            year: "numeric", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit"
        });
    };

    /** Keep every "last updated" label on the page in sync. */
    HIG.syncStamps = (timestamp, options = {}) => {
        document.querySelectorAll("[data-updated-stamp]").forEach((el) => {
            HIG.lastUpdated(el, timestamp, options);
        });
    };

    /* ---------- Dark mode (theme) ---------- */
    const THEME_KEY = "theme";
    const applyTheme = (theme) => {
        if (theme === "dark") {
            root.setAttribute("data-theme", "dark");
            root.setAttribute("data-bs-theme", "dark");
        } else {
            root.removeAttribute("data-theme");
            root.removeAttribute("data-bs-theme");
        }
    };
    const savedTheme = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
        applyTheme("dark");
    }
    const themeToggle = document.getElementById("themeToggle");
    const themeIcon = document.getElementById("themeIcon");
    const updateThemeIcon = () => {
        if (!themeIcon) return;
        if (root.getAttribute("data-theme") === "dark") {
            themeIcon.className = "bi bi-sun-fill text-warning";
        } else {
            themeIcon.className = "bi bi-moon-stars-fill text-secondary";
        }
    };
    updateThemeIcon();
    const runToggle = () => {
        if (root.getAttribute("data-theme") === "dark") {
            applyTheme("light");
            localStorage.removeItem(THEME_KEY);
        } else {
            applyTheme("dark");
            localStorage.setItem(THEME_KEY, "dark");
        }
        updateThemeIcon();
        window.dispatchEvent(new CustomEvent("themechange"));
    };

    if (themeToggle) {
        themeToggle.addEventListener("click", () => {
            if (typeof document.startViewTransition === "function") {
                document.startViewTransition(runToggle);
            } else {
                runToggle();
            }
        });
    }
    try {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
            if (!localStorage.getItem(THEME_KEY)) {
                applyTheme(e.matches ? "dark" : "light");
                updateThemeIcon();
            }
        });
    } catch (e) {}

    const boot = () => HIG.refreshReveals();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }

    /* ---------- Security utilities ---------- */

    /**
     * Safely set element content. If allowHtml is true, uses sanitized HTML;
     * otherwise uses textContent to prevent XSS.
     */
    HIG.safeSet = (el, content, allowHtml = false) => {
        if (!el) return;
        if (allowHtml) {
            el.innerHTML = HIG.renderHtml(content);
        } else {
            el.textContent = String(content == null ? "" : content);
        }
    };

    /**
     * Escape a string for safe use inside HTML attribute values (onclick, data-*).
     */
    HIG.escapeAttr = (value = "") => {
        return String(value)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    /**
     * Global error handler to prevent uncaught exceptions from breaking the UI.
     */
    window.addEventListener('error', (event) => {
        console.error('HIG Error:', event.message, 'at', event.filename, ':', event.lineno);
        event.preventDefault();
    });

    window.addEventListener('unhandledrejection', (event) => {
        console.error('HIG Unhandled Rejection:', event.reason);
        event.preventDefault();
    });

    window.HIG = HIG;
})();
