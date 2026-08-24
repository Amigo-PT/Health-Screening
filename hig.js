(() => {
    "use strict";

    const HIG = {};
    const root = document.documentElement;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

    HIG.countUp = (el, target, duration = 1400) => {
        if (!el) return;
        if (prefersReduced) {
            el.textContent = Number(target).toLocaleString();
            return;
        }
        const start = performance.now();
        const tick = (now) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(target * eased).toLocaleString();
            if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
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
                b.setAttribute("aria-selected", on ? "true" : "false");
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

    let lbEl = null, lbImg = null, lbCurrent = null, lbTotal = null;
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
        window.setTimeout(() => {
            if (!lbEl.classList.contains("open")) lbEl.style.visibility = "";
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
        lbEl.innerHTML = `
            <div class="lb-stage"><img class="lb-img" alt=""></div>
            <button type="button" class="lb-btn lb-close" aria-label="Close"><i class="bi bi-x-lg"></i></button>
            <button type="button" class="lb-btn lb-prev" aria-label="Previous"><i class="bi bi-chevron-left"></i></button>
            <button type="button" class="lb-btn lb-next" aria-label="Next"><i class="bi bi-chevron-right"></i></button>
            <div class="lb-counter"><span class="lb-current">1</span><span class="lb-sep">/</span><span class="lb-total">1</span></div>`;
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
        });
    };

    HIG.lightbox = {
        open(images, index = 0) {
            if (!images || !images.length) return;
            lbImages = images.map((i) => (typeof i === "string" ? { src: i } : i));
            ensureLightbox();
            lbEl.style.visibility = "visible";
            lbIndex = Math.max(0, Math.min(index, lbImages.length - 1));
            renderLbImage();
            requestAnimationFrame(() => lbEl.classList.add("open"));
            document.body.style.overflow = "hidden";
        },
        close: closeLightbox,
        next: () => stepLightbox(1),
        prev: () => stepLightbox(-1)
    };

    const boot = () => HIG.refreshReveals();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }

    window.HIG = HIG;
})();
