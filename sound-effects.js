(function() {
    const STORAGE_KEY = 'healthScreeningSoundEffectsEnabled';
    const CLICK_STORAGE_KEY = 'healthScreeningClickSoundEnabled';
    const NAV_STORAGE_KEY = 'healthScreeningNavSoundEnabled';
    let audioContext = null;
    let enabled = localStorage.getItem(STORAGE_KEY);
    let clickEnabled = localStorage.getItem(CLICK_STORAGE_KEY);
    let navEnabled = localStorage.getItem(NAV_STORAGE_KEY);
    enabled = enabled === null ? true : enabled === 'true';
    clickEnabled = clickEnabled === null ? true : clickEnabled === 'true';
    navEnabled = navEnabled === null ? true : navEnabled === 'true';
    let lastClickSound = 0;
    const NAV_DELAY = 140;

    function initAudioContext() {
        if (audioContext) return audioContext;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        audioContext = new AudioContext();
        return audioContext;
    }

    function playTone(frequency, duration = 0.08, type = 'sine', volume = 0.12) {
        if (!enabled) return;
        const ctx = initAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.02);
    }

    function playClickSound() {
        if (!enabled || !clickEnabled) return;
        playTone(700, 0.04, 'triangle', 0.12);
    }

    function playNavSound() {
        if (!enabled || !navEnabled) return;
        playTone(390, 0.06, 'sine', 0.14);
        setTimeout(() => playTone(520, 0.04, 'sine', 0.1), 60);
    }

    function playLoadSound() {
        playTone(260, 0.1, 'sine', 0.14);
        setTimeout(() => playTone(340, 0.08, 'sine', 0.1), 100);
        setTimeout(() => playTone(420, 0.06, 'sine', 0.08), 180);
    }

    function setEnabled(value) {
        enabled = !!value;
        localStorage.setItem(STORAGE_KEY, enabled);
        document.body.classList.toggle('sound-effects-disabled', !enabled);
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

    function handleAnchorClick(event) {
        const anchor = event.target.closest('a');
        if (!anchor || !anchor.href) return;
        if (!isInternalNavLink(anchor, event)) return;
        if (!navEnabled || !enabled) return;
        event.preventDefault();
        playNavSound();
        setTimeout(() => {
            location.href = new URL(anchor.getAttribute('href'), location.href).href;
        }, NAV_DELAY);
    }

    function setClickEnabled(value) {
        clickEnabled = !!value;
        localStorage.setItem(CLICK_STORAGE_KEY, clickEnabled);
    }

    function setNavEnabled(value) {
        navEnabled = !!value;
        localStorage.setItem(NAV_STORAGE_KEY, navEnabled);
    }

    function attachToggle(selector, stateGetter, stateSetter, trueText, falseText) {
        const toggle = document.querySelector(selector);
        if (!toggle) return;
        const updateLabel = () => {
            toggle.textContent = stateGetter() ? falseText : trueText;
            toggle.setAttribute('aria-pressed', stateGetter());
        };
        updateLabel();
        toggle.addEventListener('click', () => {
            stateSetter(!stateGetter());
            updateLabel();
        });
    }

    function attachSoundToggle() {
        attachToggle('[data-sound-toggle]',
            () => enabled,
            setEnabled,
            'Enable Sounds',
            'Disable Sounds'
        );
    }

    function attachClickToggle() {
        attachToggle('[data-click-toggle]',
            () => clickEnabled,
            setClickEnabled,
            'Enable Click Sound',
            'Disable Click Sound'
        );
    }

    function attachNavToggle() {
        attachToggle('[data-nav-toggle]',
            () => navEnabled,
            setNavEnabled,
            'Enable Nav Sound',
            'Disable Nav Sound'
        );
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (enabled) {
            setTimeout(playLoadSound, 120);
        }

        attachSoundToggle();
        attachClickToggle();
        attachNavToggle();

        document.body.addEventListener('click', event => {
            if (event.defaultPrevented) return;
            const anchor = event.target.closest('a');
            const isNavLink = anchor && isInternalNavLink(anchor, event);
            if (isNavLink && navEnabled && enabled) {
                handleAnchorClick(event);
                return;
            }

            const now = Date.now();
            if (now - lastClickSound > 70) {
                lastClickSound = now;
                playClickSound();
            }
        }, true);

    });

    window.soundEffects = {
        isEnabled: () => enabled,
        enable: () => setEnabled(true),
        disable: () => setEnabled(false),
        toggle: () => setEnabled(!enabled),
    };
})();
