(function() {
    const STORAGE_KEY = 'healthScreeningSoundEnabled';
    let audioContext = null;
    let enabled = localStorage.getItem(STORAGE_KEY);
    enabled = enabled === null ? true : enabled === 'true';
    let lastSound = 0;
    const MIN_INTERVAL = 120;

    function initAudioContext() {
        if (audioContext) return audioContext;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        audioContext = new AudioContext();
        return audioContext;
    }

    function playSoftClick() {
        if (!enabled) return;
        const now = Date.now();
        if (now - lastSound < MIN_INTERVAL) return;
        lastSound = now;

        const ctx = initAudioContext();
        if (!ctx) return;

        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(400, t + 0.06);

        gain.gain.setValueAtTime(0.04, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.08);
    }

    function setEnabled(value) {
        enabled = !!value;
        localStorage.setItem(STORAGE_KEY, enabled);
        document.body.classList.toggle('sound-disabled', !enabled);
    }

    function isInternalNavLink(anchor, event) {
        if (!anchor || !anchor.href) return false;
        if (anchor.target === '_blank' || anchor.download) return false;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
        const url = new URL(href, location.href);
        return url.origin === location.origin;
    }

    function handleClick(event) {
        if (!enabled) return;
        if (event.defaultPrevented) return;

        const anchor = event.target.closest('a');
        if (anchor && isInternalNavLink(anchor, event)) {
            event.preventDefault();
            playSoftClick();
            setTimeout(() => {
                location.href = new URL(anchor.getAttribute('href'), location.href).href;
            }, 120);
            return;
        }

        playSoftClick();
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.body.addEventListener('click', handleClick, true);
    });

    window.soundEffects = {
        isEnabled: () => enabled,
        enable: () => setEnabled(true),
        disable: () => setEnabled(false),
        toggle: () => setEnabled(!enabled),
        play: playSoftClick
    };
})();
