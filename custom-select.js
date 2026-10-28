/* =========================================================
   Custom select — Xiaomi-style dropdown
   Replaces the browser-drawn option list with a styled,
   accessible listbox while keeping the native <select>
   as the source of truth (form value + change events).
   ========================================================= */
(function () {
    'use strict';

    var SELECTOR = 'select.comparison-select, select.mi-select';
    var uid = 0;
    var measureCanvas = document.createElement('canvas');
    var measureCtx = measureCanvas.getContext('2d');

    function initSelect(sel) {
        if (!sel || sel.dataset.customSelect === 'ready') return;
        sel.dataset.customSelect = 'ready';

        var isBlock = sel.classList.contains('mi-input');
        var isDashboard = sel.classList.contains('comparison-select');

        /* ---- Build the visible trigger ---- */
        var wrapper = document.createElement('div');
        wrapper.className = 'custom-select'
            + (isBlock ? ' custom-select--block' : '')
            + (isDashboard ? ' custom-select--dashboard' : '');

        sel.parentNode.insertBefore(wrapper, sel);
        wrapper.appendChild(sel);

        sel.classList.add('custom-select__native');
        sel.setAttribute('tabindex', '-1');
        sel.setAttribute('aria-hidden', 'true');

        var trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'custom-select__trigger';
        trigger.setAttribute('role', 'combobox');
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');

        var label = document.createElement('span');
        label.className = 'custom-select__label';

        var chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        chevron.setAttribute('class', 'custom-select__chevron');
        chevron.setAttribute('width', '14');
        chevron.setAttribute('height', '14');
        chevron.setAttribute('viewBox', '0 0 24 24');
        chevron.setAttribute('fill', 'none');
        chevron.setAttribute('stroke', 'currentColor');
        chevron.setAttribute('stroke-width', '2');
        chevron.setAttribute('stroke-linecap', 'round');
        chevron.setAttribute('stroke-linejoin', 'round');
        chevron.setAttribute('aria-hidden', 'true');
        var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        poly.setAttribute('points', '6 9 12 15 18 9');
        chevron.appendChild(poly);

        trigger.appendChild(label);
        trigger.appendChild(chevron);

        var menu = document.createElement('ul');
        menu.className = 'custom-select__menu';
        menu.id = 'custom-select-menu-' + (++uid);
        menu.setAttribute('role', 'listbox');
        menu.tabIndex = -1;
        menu.hidden = true;
        trigger.setAttribute('aria-controls', menu.id);

        var accessibleName = sel.getAttribute('aria-label')
            || (sel.labels && sel.labels[0] && sel.labels[0].textContent.trim())
            || '';
        if (accessibleName) trigger.setAttribute('aria-label', accessibleName);

        wrapper.appendChild(trigger);
        /* Menu lives on <body>: it escapes reveal transforms and card clipping. */
        document.body.appendChild(menu);

        var open = false;
        var typeBuffer = '';
        var typeTimer = null;
        var rafId = 0;

        /* ---- Keep the native value as the single source of truth ---- */
        var valueDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        if (valueDescriptor && valueDescriptor.get && valueDescriptor.set) {
            try {
                Object.defineProperty(sel, 'value', {
                    configurable: true,
                    enumerable: true,
                    get: function () { return valueDescriptor.get.call(this); },
                    set: function (next) {
                        valueDescriptor.set.call(this, next);
                        syncFromSelect();
                    }
                });
            } catch (err) { /* non-fatal: label still syncs on open */ }
        }

        function getOptions() {
            return Array.prototype.slice.call(sel.options);
        }

        function getItems() {
            return Array.prototype.slice.call(menu.querySelectorAll('.custom-select__option'))
                .filter(function (item) { return item.getAttribute('aria-disabled') !== 'true'; });
        }

        function syncFromSelect() {
            var option = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
            label.textContent = option ? option.textContent.trim() : 'Select';
            trigger.disabled = sel.disabled;
            wrapper.classList.toggle('is-disabled', sel.disabled);

            var items = menu.querySelectorAll('.custom-select__option');
            for (var i = 0; i < items.length; i++) {
                var selected = Number(items[i].dataset.index) === sel.selectedIndex;
                items[i].classList.toggle('is-selected', selected);
                items[i].setAttribute('aria-selected', selected ? 'true' : 'false');
            }
        }

        function updateWidth() {
            if (isBlock) {
                wrapper.style.minWidth = '';
                return;
            }
            var styles = window.getComputedStyle(trigger);
            var options = getOptions();
            var widest = 0;
            if (measureCtx) {
                measureCtx.font = styles.fontWeight + ' ' + styles.fontSize + ' ' + styles.fontFamily;
                options.forEach(function (option) {
                    var text = option.textContent.trim();
                    if (text) widest = Math.max(widest, measureCtx.measureText(text).width);
                });
            }
            var padding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight) + 2;
            var max = Math.max(120, Math.min(window.innerWidth - 32, 340));
            var width = widest ? Math.min(Math.ceil(widest + padding), max) : 0;
            wrapper.style.minWidth = width ? width + 'px' : '';
        }

        function rebuild() {
            menu.innerHTML = '';
            var options = getOptions();

            if (!options.length) {
                var empty = document.createElement('li');
                empty.className = 'custom-select__empty';
                empty.setAttribute('role', 'presentation');
                empty.textContent = 'No options available';
                menu.appendChild(empty);
            } else {
                options.forEach(function (option, index) {
                    var item = document.createElement('li');
                    item.className = 'custom-select__option';
                    item.id = menu.id + '-option-' + index;
                    item.setAttribute('role', 'option');
                    item.setAttribute('aria-selected', 'false');
                    item.tabIndex = -1;
                    item.dataset.index = String(index);
                    if (option.disabled) item.setAttribute('aria-disabled', 'true');

                    var text = document.createElement('span');
                    text.className = 'custom-select__option-label';
                    text.textContent = option.textContent.trim();

                    var check = document.createElement('i');
                    check.className = 'bi bi-check2 custom-select__check';
                    check.setAttribute('aria-hidden', 'true');

                    item.appendChild(text);
                    item.appendChild(check);

                    item.addEventListener('click', function () {
                        if (option.disabled) return;
                        choose(index);
                    });

                    menu.appendChild(item);
                });
            }

            syncFromSelect();
            updateWidth();
            if (open) positionMenu();
        }

        function queueRebuild() {
            if (sel.dataset.customSelectQueued === '1') return;
            sel.dataset.customSelectQueued = '1';
            queueMicrotask(function () {
                sel.dataset.customSelectQueued = '0';
                rebuild();
            });
        }

        function ensureVisible(item) {
            if (!item) return;
            var itemRect = item.getBoundingClientRect();
            var menuRect = menu.getBoundingClientRect();
            var pad = 8;
            if (itemRect.top < menuRect.top + pad) {
                menu.scrollTop -= (menuRect.top + pad) - itemRect.top;
            } else if (itemRect.bottom > menuRect.bottom - pad) {
                menu.scrollTop += itemRect.bottom - (menuRect.bottom - pad);
            }
        }

        function focusItem(item, preventScroll) {
            if (!item) return;
            item.focus({ preventScroll: preventScroll !== false });
            ensureVisible(item);
        }

        function positionMenu() {
            var rect = trigger.getBoundingClientRect();
            var margin = 12;
            var gap = 8;
            var maxNatural = 300;

            menu.style.minWidth = Math.round(rect.width) + 'px';
            menu.style.maxHeight = '';

            var naturalHeight = Math.min(menu.offsetHeight, maxNatural);
            var spaceBelow = window.innerHeight - rect.bottom - gap - margin;
            var spaceAbove = rect.top - gap - margin;

            /* Prefer dropping down; flip up only when it clearly helps. */
            var up = naturalHeight > spaceBelow && spaceBelow < 200 && spaceAbove > spaceBelow;
            var available = up ? spaceAbove : spaceBelow;
            menu.style.maxHeight = Math.round(Math.max(120, Math.min(maxNatural, available))) + 'px';

            var menuWidth = menu.offsetWidth;
            var menuHeight = menu.offsetHeight;

            var left = rect.left;
            if (left + menuWidth > window.innerWidth - margin) {
                left = window.innerWidth - margin - menuWidth;
            }
            if (left < margin) left = margin;

            var top = up ? rect.top - gap - menuHeight : rect.bottom + gap;
            if (top < margin) top = margin;
            if (top + menuHeight > window.innerHeight - margin) {
                top = Math.max(margin, window.innerHeight - margin - menuHeight);
            }

            menu.style.left = Math.round(left) + 'px';
            menu.style.top = Math.round(top) + 'px';
            menu.classList.toggle('is-up', up);
        }

        function openMenu(direction) {
            if (open || sel.disabled) return;
            open = true;
            menu.hidden = false;
            wrapper.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');

            /* Catch any programmatic value changes made while closed. */
            syncFromSelect();
            positionMenu();

            var items = getItems();
            var selected = items.filter(function (item) {
                return Number(item.dataset.index) === sel.selectedIndex;
            })[0];
            var target = selected || items[direction === -1 ? items.length - 1 : 0];
            focusItem(target);
        }

        function closeMenu(refocus) {
            if (!open) return;
            open = false;
            menu.hidden = true;
            wrapper.classList.remove('is-open');
            trigger.setAttribute('aria-expanded', 'false');
            if (refocus) trigger.focus({ preventScroll: true });
        }

        function choose(index) {
            var option = sel.options[index];
            if (!option || option.disabled) return;

            var changed = sel.value !== option.value;
            sel.value = option.value;
            if (changed) sel.dispatchEvent(new Event('change', { bubbles: true }));

            syncFromSelect();
            closeMenu(true);
        }

        function moveFocus(items, from, step) {
            if (!items.length) return;
            var next = from < 0
                ? (step > 0 ? 0 : items.length - 1)
                : (from + step + items.length) % items.length;
            focusItem(items[next]);
        }

        /* ---- Events ---- */
        trigger.addEventListener('click', function () {
            if (open) closeMenu(false);
            else openMenu(1);
        });

        trigger.addEventListener('keydown', function (event) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (!open) openMenu(event.key === 'ArrowUp' ? -1 : 1);
            } else if (event.key === 'Escape' && open) {
                event.preventDefault();
                closeMenu(true);
            }
        });

        menu.addEventListener('keydown', function (event) {
            var items = getItems();
            var active = items.indexOf(document.activeElement);

            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    moveFocus(items, active, 1);
                    return;
                case 'ArrowUp':
                    event.preventDefault();
                    moveFocus(items, active, -1);
                    return;
                case 'Home':
                    event.preventDefault();
                    focusItem(items[0]);
                    return;
                case 'End':
                    event.preventDefault();
                    focusItem(items[items.length - 1]);
                    return;
                case 'Enter':
                case ' ':
                    event.preventDefault();
                    if (active >= 0) items[active].click();
                    return;
                case 'Escape':
                    event.preventDefault();
                    closeMenu(true);
                    return;
                case 'Tab':
                    closeMenu(true);
                    return;
            }

            if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
                typeBuffer += event.key.toLowerCase();
                window.clearTimeout(typeTimer);
                typeTimer = window.setTimeout(function () { typeBuffer = ''; }, 600);

                var start = active + 1;
                for (var i = 0; i < items.length; i++) {
                    var item = items[(start + i) % items.length];
                    var text = item.textContent.trim().toLowerCase();
                    if (text.indexOf(typeBuffer) === 0) {
                        focusItem(item);
                        break;
                    }
                }
            }
        });

        menu.addEventListener('mousedown', function (event) {
            /* Keep focus on the option being clicked, but leave scrollbar drags alone. */
            if (event.target.closest && event.target.closest('.custom-select__option')) {
                event.preventDefault();
            }
        });

        document.addEventListener('pointerdown', function (event) {
            if (!open) return;
            if (wrapper.contains(event.target) || menu.contains(event.target)) return;
            closeMenu(false);
        }, true);

        window.addEventListener('scroll', function (event) {
            if (!open) return;
            /* Ignore scrolling inside the menu itself. */
            if (event.target instanceof Element && (event.target === menu || menu.contains(event.target))) return;
            window.cancelAnimationFrame(rafId);
            rafId = window.requestAnimationFrame(positionMenu);
        }, true);

        window.addEventListener('resize', function () {
            if (!open) return;
            window.cancelAnimationFrame(rafId);
            rafId = window.requestAnimationFrame(positionMenu);
        });

        var observer = new MutationObserver(function (records) {
            var structural = records.some(function (record) {
                return record.type === 'childList' || record.type === 'characterData';
            });
            if (structural) queueRebuild();
            else syncFromSelect();
        });
        observer.observe(sel, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['disabled']
        });

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(updateWidth).catch(function () {});
        }

        rebuild();
    }

    function boot() {
        Array.prototype.forEach.call(document.querySelectorAll(SELECTOR), initSelect);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
