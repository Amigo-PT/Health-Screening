/* =========================================================
   Shared screening dashboard engine
   One codebase for HU Staff and SEKEM (and any future entity).
   The page supplies window.DASHBOARD_CONFIG before this file.
   ========================================================= */
(function () {
    'use strict';

    var config = window.DASHBOARD_CONFIG;
    if (!config || !Array.isArray(config.entities)) return;

    var MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var MONTHS_LONG = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var BMI_KEYS = ['Under_weight', 'Normal_Weight', 'Over_weight', 'Obesity'];
    var BMI_CATEGORIES = [
        { key: 'Under_weight', name: 'Underweight', short: 'Under', color: '#3e8bff', recommendation: 'Nutritional counseling recommended. Increase nutrient-dense intake and monitor for underlying conditions.' },
        { key: 'Normal_Weight', name: 'Normal', short: 'Normal', color: '#22ac38', recommendation: 'Maintain current lifestyle with regular physical activity and a balanced diet.' },
        { key: 'Over_weight', name: 'Overweight', short: 'Over', color: '#ff9500', recommendation: 'Calorie control and physical activity counseling. A structured weight-management programme is recommended.' },
        { key: 'Obesity', name: 'Obesity', short: 'Obese', color: '#eb4435', recommendation: 'Medical evaluation, structured weight management, and screening for metabolic syndrome.' }
    ];

    var VIZ = {
        font: 'MiSans, Cairo, sans-serif',
        ink: '#191919',
        text: '#5c5c5c',
        hair: 'rgba(0,0,0,0.08)',
        surface: '#ffffff',
        accent: '#ff6900',
        bmi: ['#5b9cf5', '#42b883', '#f5b13d', '#ef6b5a'],
        bmiLabels: ['Underweight', 'Normal', 'Overweight', 'Obesity']
    };

    function isDarkTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    function syncVizTheme() {
        if (isDarkTheme()) {
            VIZ.ink = '#f5f5f7';
            VIZ.text = '#a1a1a6';
            VIZ.hair = 'rgba(255,255,255,0.12)';
            VIZ.surface = '#1c1c1e';
        } else {
            VIZ.ink = '#191919';
            VIZ.text = '#5c5c5c';
            VIZ.hair = 'rgba(0,0,0,0.08)';
            VIZ.surface = '#ffffff';
        }
    }

    var entityKeys = config.entities.map(function (e) { return e.key; });
    var byKey = {};
    config.entities.forEach(function (e) { byKey[e.key] = e; });

    var state = {
        periods: {},
        years: [],
        year: null,
        month: null,
        filter: 'all',
        comparison: null,
        currentPeriod: null,
        rows: [],
        updatedAt: null,
        entityModal: null,
        categoryModal: null,
        loaded: false
    };
    var chart = null;
    var REDUCED_MOTION = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

    /* ---------------------------------------------------------
       Utilities
       --------------------------------------------------------- */
    function $(id) { return document.getElementById(id); }
    function pct(part, total) { return total > 0 ? (part / total) * 100 : 0; }
    function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
    function escape(value) { return window.HIG ? HIG.escapeHtml(value) : String(value == null ? '' : value); }
    function fmt(value) { return num(value).toLocaleString(); }
    function fixed(value, digits) { return num(value).toFixed(digits == null ? 1 : digits); }

    var countTimers = new WeakMap();

    /* Queue a count-up with an optional stagger delay. Starting from the value
       already on screen keeps filter changes smooth instead of resetting to 0. */
    function staggedCount(el, target, duration, delay) {
        if (!el) return;
        var pending = countTimers.get(el);
        if (pending) clearTimeout(pending);
        var current = Number(String(el.textContent).replace(/[^\d.-]/g, ''));
        var from = Number.isFinite(current) ? current : 0;
        var id = setTimeout(function () {
            countTimers.delete(el);
            if (window.HIG && HIG.countUp) HIG.countUp(el, target, duration, null, from);
            else el.textContent = fmt(target);
        }, delay || 0);
        countTimers.set(el, id);
    }

    function periodLabel(year, month) {
        return (MONTHS[month] || '') + ' ' + year;
    }

    /* ---------------------------------------------------------
       Data model
       --------------------------------------------------------- */
    function blankBmi() {
        return { Under_weight: 0, Normal_Weight: 0, Over_weight: 0, Obesity: 0 };
    }

    function emptyPeriod() {
        var p = { entities: {}, totals: {}, participation: {}, complaints: {}, rawData: {}, details: {}, rows: [] };
        entityKeys.forEach(function (key) {
            p.entities[key] = 0;
            p.totals[key] = 0;
            p.participation[key] = 0;
            p.complaints[key] = [0, 0, 0, 0];
            p.rawData[key] = blankBmi();
            p.details[key] = [];
        });
        return p;
    }

    function matchEntity(value) {
        var v = String(value == null ? '' : value).toLowerCase().trim();
        if (!v) return '';
        for (var i = 0; i < config.entities.length; i++) {
            var entity = config.entities[i];
            var patterns = entity.matches || [entity.key, entity.name.toLowerCase()];
            for (var j = 0; j < patterns.length; j++) {
                if (v.indexOf(String(patterns[j]).toLowerCase()) !== -1) return entity.key;
            }
        }
        return '';
    }

    function processRows(rows) {
        var periods = {};
        var years = {};
        var column = config.entityColumn || 'Sector';

        rows.forEach(function (row) {
            if (row.Year == null || row.Month == null) return;
            var year = parseInt(row.Year, 10);
            var month = parseInt(row.Month, 10);
            if (!year || !month) return;

            var key = year + '-' + month;
            if (!periods[key]) periods[key] = emptyPeriod();
            var period = periods[key];

            var entityKey = matchEntity(row[column]);
            if (!entityKey) return;

            var screened = num(row.Total_Count);
            var target = num(row.Total);
            period.entities[entityKey] = screened;
            period.totals[entityKey] = target;
            period.participation[entityKey] = pct(screened, target);

            var bmi = [];
            BMI_KEYS.forEach(function (col) {
                period.rawData[entityKey][col] = num(row[col]);
                bmi.push(num(row[col]));
            });
            period.complaints[entityKey] = bmi;
            period.details[entityKey].push(row);
            period.rows.push(row);
            years[year] = true;
        });

        state.periods = periods;
        state.years = Object.keys(years).map(Number).sort(function (a, b) { return b - a; });
        if (!state.year || state.years.indexOf(state.year) === -1) {
            state.year = state.years[0] || config.yearFallback || new Date().getFullYear();
        }
    }

    function getPeriod(year, month) {
        return state.periods[year + '-' + month] || emptyPeriod();
    }

    function monthsForYear(year) {
        return Object.keys(state.periods)
            .map(function (key) { return key.split('-').map(Number); })
            .filter(function (pair) { return pair[0] === year; })
            .filter(function (pair) {
                return totalScreened(state.periods[pair[0] + '-' + pair[1]]) > 0;
            })
            .map(function (pair) { return pair[1]; })
            .sort(function (a, b) { return a - b; });
    }

    function totalScreened(period) {
        return entityKeys.reduce(function (sum, key) { return sum + (period.entities[key] || 0); }, 0);
    }

    function totalTarget(period) {
        return entityKeys.reduce(function (sum, key) { return sum + (period.totals[key] || 0); }, 0);
    }

    function bmiTotals(period, keys) {
        var totals = [0, 0, 0, 0];
        (keys || entityKeys).forEach(function (key) {
            var bmi = period.complaints[key] || [];
            for (var i = 0; i < 4; i++) totals[i] += num(bmi[i]);
        });
        return totals;
    }

    function selectedKeys() {
        return state.filter === 'all' ? entityKeys.slice() : [state.filter];
    }

    function applyFilter(period) {
        if (state.filter === 'all') return period;
        var filtered = emptyPeriod();
        var key = state.filter;
        filtered.entities[key] = period.entities[key] || 0;
        filtered.totals[key] = period.totals[key] || 0;
        filtered.participation[key] = period.participation[key] || 0;
        filtered.complaints[key] = (period.complaints[key] || [0, 0, 0, 0]).slice();
        filtered.rawData[key] = Object.assign({}, period.rawData[key] || blankBmi());
        filtered.details[key] = (period.details[key] || []).slice();
        filtered.rows = (period.rows || []).slice();
        return filtered;
    }

    function riskFor(period, key) {
        var total = period.entities[key] || 0;
        var raw = period.rawData[key] || blankBmi();
        var counts = BMI_KEYS.map(function (col) { return num(raw[col]); });
        var overweightObesity = counts[2] + counts[3];
        var score = total > 0 ? overweightObesity / total : 0;
        var level = score > 0.30 ? 'high' : score > 0.10 ? 'moderate' : 'low';
        return {
            key: key,
            name: byKey[key] ? byKey[key].name : key,
            total: total,
            counts: counts,
            overweightObesity: overweightObesity,
            score: score,
            level: level,
            bmiList: BMI_CATEGORIES.map(function (category, index) {
                return Object.assign({}, category, {
                    count: counts[index],
                    percentage: total > 0 ? fixed((counts[index] / total) * 100) : '0.0'
                });
            })
        };
    }

    function allRisks(period) {
        return entityKeys
            .map(function (key) { return riskFor(period, key); })
            .filter(function (risk) { return risk.total > 0; });
    }

    /* ---------------------------------------------------------
       Formatters / shared UI
       --------------------------------------------------------- */
    function setStatus(status, message) {
        var dot = $('statusDot');
        var text = $('statusText');
        var wrapper = document.querySelector('.status-indicator');
        if (dot) dot.className = 'status-dot status-' + status;
        if (wrapper) wrapper.className = 'status-indicator status-' + status;
        if (text) text.textContent = message || ({
            ok: 'Live data connected',
            error: 'Connection lost',
            loading: 'Connecting to server…'
        }[status] || 'Status unknown');
    }

    function notice(kind, message, retry) {
        var el = $('dataNotice');
        if (!el) return;
        el.hidden = false;
        el.className = 'data-notice data-notice-' + kind;
        el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
        el.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
        el.replaceChildren();

        var icon = document.createElement('i');
        icon.className = 'bi ' + (kind === 'error' ? 'bi-wifi-off' : kind === 'loading' ? 'bi-arrow-repeat' : 'bi-info-circle');
        icon.setAttribute('aria-hidden', 'true');

        var span = document.createElement('span');
        span.className = 'data-notice-message';
        span.textContent = message;
        el.append(icon, span);

        if (retry) {
            var button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Try again';
            button.addEventListener('click', function () { load({ force: true }); });
            el.append(button);
        }
    }

    function hideNotice() {
        var el = $('dataNotice');
        if (el) el.hidden = true;
    }

    function updateStamps() {
        var stamp = state.updatedAt;
        document.querySelectorAll('[data-updated-stamp]').forEach(function (el) {
            if (window.HIG) {
                HIG.lastUpdated(el, stamp, { stale: state.stale === true });
            }
        });
        var sticky = $('stickyUpdated');
        if (sticky) {
            sticky.textContent = stamp ? HIG.relativeTime(stamp) : 'not yet updated';
            sticky.classList.toggle('is-stale', state.stale === true);
        }
    }

    /* ---------------------------------------------------------
       Entity cards
       --------------------------------------------------------- */
    function renderEntityCards() {
        var mount = $('entityCards');
        if (!mount) return;
        mount.innerHTML = config.entities.map(function (entity, index) {
            var delay = Math.min(60 + index * 60, 660);
            return '<div class="col-md-3 col-6" data-reveal data-reveal-delay="' + delay + '">'
                + '<div class="hig-card info-card center sector-card is-clickable" data-entity="' + entity.key + '" style="--tile:' + entity.color + '">'
                + '<span class="info-icon"><i class="bi ' + entity.icon + '" aria-hidden="true"></i></span>'
                + '<div class="entity-num" id="num-' + entity.key + '">0</div>'
                + '<p class="entity-name sector-name mb-0">' + escape(entity.name) + '</p>'
                + '<div class="participation-rate" id="part-' + entity.key + '"></div>'
                + '<button type="button" class="sector-risk-detail-btn" data-detail="' + entity.key + '" aria-label="View details for ' + escape(entity.name) + '"><i class="bi bi-info-circle" aria-hidden="true"></i> View details</button>'
                + '</div></div>';
        }).join('');

        mount.querySelectorAll('.sector-card').forEach(function (card) {
            var key = card.dataset.entity;
            card.addEventListener('click', function () {
                if (!state.comparison) showDrilldown(key);
            });
        });

        mount.querySelectorAll('[data-detail]').forEach(function (button) {
            button.addEventListener('click', function (event) {
                event.stopPropagation();
                var period = state.currentPeriod || getPeriod(state.year, state.month);
                openEntityModal(button.dataset.detail, riskFor(period, button.dataset.detail));
            });
        });

        if (window.HIG) HIG.refreshReveals(mount);
    }

    function updateEntityCards(period) {
        entityKeys.forEach(function (key, index) {
            var value = period.entities[key] || 0;
            var numberEl = $('num-' + key);
            if (numberEl) {
                staggedCount(numberEl, value, 700, index * 55);
                numberEl.parentElement.querySelectorAll('.comparison-change').forEach(function (el) { el.remove(); });
            }
            var partEl = $('part-' + key);
            if (partEl) {
                var target = period.totals[key] || 0;
                partEl.innerHTML = target > 0
                    ? '<span>' + fixed(period.participation[key]) + '%&nbsp;participation</span>'
                        + '<span class="participation-count">(' + fmt(value) + ' / ' + fmt(target) + ')</span>'
                    : '';
            }
        });
        updateEntityVisibility(period);
    }

    function updateEntityVisibility() {
        var allowed = state.filter === 'all' ? null : state.filter;
        entityKeys.forEach(function (key) {
            var numberEl = $('num-' + key);
            if (!numberEl) return;
            var card = numberEl.closest('.sector-card');
            if (!card) return;
            card.style.display = (!allowed || allowed === key) ? '' : 'none';
        });
    }

    /* ---------------------------------------------------------
       Filter UI
       --------------------------------------------------------- */
    function buildEntityFilter() {
        var select = $('entityFilter');
        if (!select) return;
        select.innerHTML = '<option value="all">' + escape(config.filterAllLabel || 'Show all') + '</option>'
            + config.entities.map(function (entity) {
                return '<option value="' + entity.key + '">' + escape(entity.name) + '</option>';
            }).join('');
        select.value = 'all';
        select.addEventListener('change', function () {
            state.filter = select.value || 'all';
            if (state.comparison) {
                renderComparison();
            } else {
                render();
            }
        });
    }

    function renderYearTabs() {
        var mount = $('yearContainer');
        if (!mount) return;
        var years = state.years.length ? state.years : [state.year];
        mount.innerHTML = years.map(function (year) {
            return '<button type="button" class="year-tab' + (year === state.year ? ' active' : '') + '" data-year="' + year + '" aria-pressed="' + (year === state.year) + '">' + year + '</button>';
        }).join('');
        mount.querySelectorAll('.year-tab').forEach(function (button) {
            button.addEventListener('click', function () {
                var year = Number(button.dataset.year);
                if (year === state.year) return;
                state.year = year;
                var months = monthsForYear(year);
                state.month = months.length ? months[months.length - 1] : 1;
                resetComparison();
                renderYearTabs();
                renderMonths();
                render();
            });
        });
    }

    function renderMonths() {
        var mount = $('monthContainer');
        if (!mount) return;
        var months = monthsForYear(state.year);
        if (!months.length) {
            mount.innerHTML = '<span class="sync-note mt-0">No data for this year</span>';
            return;
        }
        if (months.indexOf(state.month) === -1) state.month = months[months.length - 1];
        mount.innerHTML = months.map(function (month) {
            var active = month === state.month;
            return '<button type="button" class="month-item has-data' + (active ? ' active' : '') + '" data-month="' + month + '" aria-label="' + MONTHS_LONG[month] + ' ' + state.year + '" aria-pressed="' + active + '">'
                + '<span class="month-dot" aria-hidden="true"></span><span class="month-lbl">' + MONTHS[month] + '</span></button>';
        }).join('');
        mount.querySelectorAll('.month-item').forEach(function (button) {
            button.addEventListener('click', function () {
                state.month = Number(button.dataset.month);
                resetComparison();
                renderMonths();
                render();
            });
        });
    }

    function renderComparisonSelects() {
        var years = state.years.slice();
        var year1 = $('compareYear1');
        var year2 = $('compareYear2');
        var month1 = $('compareMonth1');
        var month2 = $('compareMonth2');
        if (!year1 || !year2) return;

        var options = years.map(function (year) { return '<option value="' + year + '">' + year + '</option>'; }).join('');
        year1.innerHTML = options;
        year2.innerHTML = options;

        if (years.length > 1) {
            var index = years.indexOf(state.year);
            if (index > 0) {
                year2.value = String(state.year);
                year1.value = String(years[index - 1]);
            } else {
                year2.value = String(years[0]);
                year1.value = String(years[1]);
            }
        } else if (years.length === 1) {
            year1.value = String(years[0]);
            year2.value = String(years[0]);
        }

        var monthOptions = '<option value="">Month</option>' + MONTHS.slice(1).map(function (month, index) {
            return '<option value="' + (index + 1) + '">' + month + '</option>';
        }).join('');
        month1.innerHTML = monthOptions;
        month2.innerHTML = monthOptions;
        month1.value = String(state.month);
        month2.value = String(state.month);
    }

    function compareLabels() {
        var y1 = $('compareYear1') && $('compareYear1').value;
        var m1 = parseInt($('compareMonth1') && $('compareMonth1').value, 10);
        var y2 = $('compareYear2') && $('compareYear2').value;
        var m2 = parseInt($('compareMonth2') && $('compareMonth2').value, 10);
        return {
            a: m1 && y1 ? periodLabel(Number(y1), m1) : 'Period 1',
            b: m2 && y2 ? periodLabel(Number(y2), m2) : 'Period 2'
        };
    }

    function reportingPeriods() {
        return Object.keys(state.periods).filter(function (key) {
            return totalScreened(state.periods[key]) > 0;
        });
    }

    function toggleComparison() {
        var controls = $('comparisonControls');
        if (!controls) return;
        if (reportingPeriods().length < 2) {
            notice('info', 'Period comparison needs at least two reporting periods. Once a second month is published you can compare them here.');
            return;
        }
        var visible = controls.style.display !== 'none' && controls.style.display !== '';
        controls.style.display = visible ? 'none' : 'flex';
        if (!visible) {
            renderComparisonSelects();
            if (window.CustomSelect && typeof window.CustomSelect.refresh === 'function') {
                window.CustomSelect.refresh(controls);
            }
        }
    }

    function runComparison() {
        var y1 = parseInt($('compareYear1').value, 10);
        var m1 = parseInt($('compareMonth1').value, 10);
        var y2 = parseInt($('compareYear2').value, 10);
        var m2 = parseInt($('compareMonth2').value, 10);
        if (!m1 || !m2) return;
        if (y1 === y2 && m1 === m2) {
            notice('info', 'Choose two different periods to compare.');
            return;
        }
        hideNotice();

        state.comparison = {
            aRaw: getPeriod(y1, m1),
            bRaw: getPeriod(y2, m2),
            labels: compareLabels()
        };
        hideDrilldown();
        renderComparison();

        var filterCard = document.querySelector('.filter-card');
        var badge = filterCard && filterCard.querySelector('.comparison-badge');
        if (filterCard && !badge) {
            badge = document.createElement('span');
            badge.className = 'comparison-badge';
            var label = filterCard.querySelector('.filter-label');
            if (label) label.after(badge); else filterCard.prepend(badge);
        }
        if (badge) {
            badge.innerHTML = '<i class="bi bi-graph-up" aria-hidden="true"></i> Comparing ' + escape(state.comparison.labels.a) + ' vs ' + escape(state.comparison.labels.b);
        }
    }

    function resetComparison() {
        if (!state.comparison) return;
        state.comparison = null;
        document.querySelectorAll('.comparison-change').forEach(function (el) { el.remove(); });
        var badge = document.querySelector('.comparison-badge');
        if (badge) badge.remove();
        var summary = $('periodComparisonSummary');
        if (summary) summary.hidden = true;
        render();
    }

    function changeBetween(first, second) {
        var difference = second - first;
        return {
            difference: difference,
            percentage: first === 0 ? null : (difference / first) * 100,
            direction: difference > 0 ? 'up' : difference < 0 ? 'down' : 'steady'
        };
    }

    function changeMarkup(first, second) {
        var change = changeBetween(first, second);
        var arrow = change.direction === 'up' ? '↑' : change.direction === 'down' ? '↓' : '→';
        var sign = change.difference > 0 ? '+' : change.difference < 0 ? '−' : '';
        var percentage = change.percentage === null
            ? (second === 0 ? '0.0%' : 'N/A')
            : fixed(Math.abs(change.percentage)) + '%';
        return {
            className: 'comparison-change is-' + change.direction,
            text: arrow + ' ' + sign + fmt(Math.abs(change.difference)) + ' (' + percentage + ') · ' + fmt(first) + ' → ' + fmt(second),
            change: change
        };
    }

    function renderComparison() {
        var comparison = state.comparison;
        if (!comparison) return;
        var a = applyFilter(comparison.aRaw);
        var b = applyFilter(comparison.bRaw);

        entityKeys.forEach(function (key, index) {
            var numberEl = $('num-' + key);
            if (!numberEl) return;
            var parent = numberEl.closest('.sector-card');
            parent.querySelectorAll('.comparison-change').forEach(function (el) { el.remove(); });
            var change = changeMarkup(a.entities[key] || 0, b.entities[key] || 0);
            var span = document.createElement('div');
            span.className = change.className;
            span.textContent = change.text;
            numberEl.after(span);
            staggedCount(numberEl, b.entities[key] || 0, 700, index * 55);
        });

        var totalEl = $('total-participants');
        var totalA = totalScreened(a);
        var totalB = totalScreened(b);
        if (totalEl) totalEl.textContent = fmt(totalB);
        renderComparisonSummary(totalA, totalB, comparison.labels);
        renderChartFromBmi(buildComparisonRows(a, b, comparison.labels));
        renderSticky(b);
        updateStamps();
    }

    function renderComparisonSummary(first, second, labels) {
        var box = $('periodComparisonSummary');
        if (!box) return;
        var change = changeMarkup(first, second);
        var arrow = change.change.direction === 'up' ? '↑' : change.change.direction === 'down' ? '↓' : '→';
        var sign = change.change.difference > 0 ? '+' : change.change.difference < 0 ? '−' : '';
        var direction = change.change.direction === 'up' ? 'Increase' : change.change.direction === 'down' ? 'Decrease' : 'No change';
        var percentage = change.change.percentage === null ? 'N/A' : fixed(Math.abs(change.change.percentage)) + '%';

        box.innerHTML = '<div class="comparison-summary-period"><span>' + escape(labels.a) + '</span><strong>' + fmt(first) + '</strong></div>'
            + '<div class="comparison-summary-period"><span>' + escape(labels.b) + '</span><strong>' + fmt(second) + '</strong></div>'
            + '<div class="comparison-summary-result is-' + change.change.direction + '"><span>' + direction + '</span><strong>' + arrow + ' ' + sign + fmt(Math.abs(change.change.difference)) + ' (' + percentage + ')</strong></div>';
        box.hidden = false;
    }

    /* ---------------------------------------------------------
       Charts
       --------------------------------------------------------- */
    function tooltipConfig(callbacks) {
        return {
            backgroundColor: isDarkTheme() ? '#2c2c2e' : '#ffffff',
            titleColor: VIZ.ink,
            bodyColor: VIZ.text,
            titleFont: { family: VIZ.font, size: 13, weight: '600' },
            bodyFont: { family: VIZ.font, size: 12 },
            padding: { top: 12, bottom: 12, left: 16, right: 18 },
            cornerRadius: 14,
            caretSize: 8,
            caretPadding: 8,
            displayColors: false,
            borderColor: isDarkTheme() ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            borderWidth: 1,
            titleMarginBottom: 6,
            boxPadding: 6,
            usePointStyle: false,
            position: 'nearest',
            intersect: false,
            mode: 'index',
            axis: 'y',
            callbacks: callbacks
        };
    }

    function groupCounts(period, group) {
        var members = group.members;
        var sum = [0, 0, 0, 0];
        var present = 0;
        members.forEach(function (key) {
            var counts = period.complaints[key] || [];
            var hasData = counts.some(function (value) { return num(value) > 0; });
            if (hasData) present += 1;
            for (var i = 0; i < 4; i++) sum[i] += num(counts[i]);
        });
        if (group.mode === 'average') {
            return sum.map(function (value) { return present ? Math.round(value / present) : 0; });
        }
        return sum;
    }

    function buildRows(period) {
        return config.groups.map(function (group) {
            var counts = groupCounts(period, group);
            return {
                label: group.label,
                counts: counts,
                total: counts.reduce(function (a, b) { return a + b; }, 0)
            };
        }).filter(function (row) { return row.total > 0; });
    }

    function buildComparisonRows(a, b, labels) {
        var rows = [];
        [[a, labels.a], [b, labels.b]].forEach(function (pair) {
            var counts = bmiTotals(pair[0]);
            var total = counts.reduce(function (x, y) { return x + y; }, 0);
            if (total > 0) rows.push({ label: pair[1], counts: counts, total: total });
        });
        return rows;
    }

    function renderLegend(items) {
        var box = $('bmiLegend');
        if (!box) return;
        box.classList.add('viz-legend-inline');
        box.innerHTML = items.map(function (item, index) {
            return '<button type="button" class="viz-legend-item" data-dataset-index="' + index + '" aria-pressed="true" aria-label="Hide ' + escape(item.label) + ' data"><span class="viz-legend-dot" style="background:' + item.color + '" aria-hidden="true"></span>' + escape(item.label) + '</button>';
        }).join('');
        box.querySelectorAll('.viz-legend-item').forEach(function (button) {
            button.addEventListener('click', function () {
                if (!chart) return;
                var index = Number(button.dataset.datasetIndex);
                var visible = !chart.isDatasetVisible(index);
                chart.setDatasetVisibility(index, visible);
                chart.update();
                button.setAttribute('aria-pressed', String(visible));
                button.classList.toggle('is-hidden', !visible);
                var label = items[index].label;
                button.setAttribute('aria-label', (visible ? 'Hide ' : 'Show ') + label + ' data');
            });
        });
    }

    var segmentLabels = {
        id: 'segmentLabels',
        afterDatasetsDraw: function (chart) {
            if (!chart || chart.options.indexAxis !== 'y') return;
            var canvas = chart.ctx;
            canvas.save();
            canvas.font = '600 11px ' + VIZ.font;
            canvas.textAlign = 'center';
            canvas.textBaseline = 'middle';
            chart.data.datasets.forEach(function (dataset, datasetIndex) {
                var meta = chart.getDatasetMeta(datasetIndex);
                if (!meta || meta.hidden) return;
                meta.data.forEach(function (bar, index) {
                    if (!bar) return;
                    var base = typeof bar.base === 'number' ? bar.base : bar.x;
                    var width = Math.abs(bar.x - base);
                    var value = dataset.data[index] || 0;
                    if (width < 40 || value < 7) return;
                    canvas.fillStyle = datasetIndex === 2 ? '#191919' : '#ffffff';
                    canvas.shadowColor = 'rgba(0,0,0,0.12)';
                    canvas.shadowBlur = 2;
                    canvas.fillText(value.toFixed(0) + '%', (bar.x + base) / 2, bar.y);
                });
            });
            canvas.restore();
        }
    };

    function renderChartFromBmi(rows) {
        if (chart) { chart.destroy(); chart = null; }
        renderLegend(VIZ.bmiLabels.map(function (label, index) { return { label: label, color: VIZ.bmi[index] }; }));

        var note = $('bmiNote');
        if (note) note.textContent = rows.length ? '' : 'No BMI data for this selection. Choose another period or adjust the filters.';

        var table = $('bmiDataTable');
        if (table) {
            if (!rows.length) {
                table.innerHTML = '<summary>View chart data</summary><p>No BMI records are available for this selection.</p>';
            } else {
                var head = VIZ.bmiLabels.map(function (label) { return '<th scope="col">' + label + ' count (%)</th>'; }).join('');
                var body = rows.map(function (row) {
                    return '<tr><th scope="row">' + escape(row.label) + '</th>' + row.counts.map(function (count) {
                        return '<td>' + fmt(count) + ' (' + fixed(pct(count, row.total)) + '%)</td>';
                    }).join('') + '</tr>';
                }).join('');
                table.innerHTML = '<summary>View chart data</summary><div class="table-responsive"><table class="table table-sm align-middle"><caption class="visually-hidden">BMI category counts and percentages by group</caption><thead><tr><th scope="col">Group</th>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
            }
        }

        var canvas = $('comparisonChart');
        if (canvas) {
            canvas.setAttribute('aria-label', rows.length
                ? 'Stacked percentage bar chart showing BMI categories for ' + rows.map(function (row) { return row.label; }).join(', ') + '. Expand the chart data table for exact counts.'
                : 'No BMI data is available for this selection.');
        }

        var datasets = VIZ.bmiLabels.map(function (label, index) {
            return {
                label: label,
                /* Bars start empty and grow once the chart scrolls into view. */
                data: rows.map(function () { return 0; }),
                target: rows.map(function (row) { return pct(row.counts[index], row.total); }),
                counts: rows.map(function (row) { return row.counts[index]; }),
                backgroundColor: VIZ.bmi[index],
                borderColor: VIZ.surface,
                borderWidth: 1,
                borderRadius: index === 0 ? { topLeft: 8, bottomLeft: 8 }
                    : index === VIZ.bmiLabels.length - 1 ? { topRight: 8, bottomRight: 8 } : 0,
                borderSkipped: false,
                barPercentage: 0.72,
                categoryPercentage: 0.86,
                maxBarThickness: config.chartBarThickness || 40
            };
        });

        chart = new Chart(canvas, {
            type: 'bar',
            data: { labels: rows.map(function (row) { return row.label; }), datasets: datasets },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', axis: 'y', intersect: false },
                animation: {
                    duration: REDUCED_MOTION ? 0 : 700,
                    easing: 'easeOutQuart',
                    delay: function (context) {
                        return REDUCED_MOTION ? 0 : Math.max(0, context.dataIndex || 0) * 70;
                    }
                },
                layout: { padding: { top: 8, right: 4, left: 4 } },
                scales: {
                    x: {
                        stacked: true, min: 0, max: 100,
                        grid: { color: VIZ.hair, lineWidth: 1, drawTicks: false },
                        border: { display: false },
                        ticks: { color: VIZ.text, font: { family: VIZ.font, size: 11, weight: '500' }, padding: 8, callback: function (v) { return v + '%'; } }
                    },
                    y: {
                        stacked: true,
                        grid: { display: false },
                        border: { display: false },
                        ticks: { color: VIZ.ink, padding: 8, font: { family: VIZ.font, size: 12, weight: '500' } }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: tooltipConfig({
                        title: function (items) {
                            return items[0].label || 'Group';
                        },
                        label: function (context) {
                            var count = context.dataset.counts[context.dataIndex] || 0;
                            var pct = fixed(context.parsed.x);
                            return context.dataset.label + ': ' + fmt(count) + ' (' + pct + '%)';
                        },
                        footer: function (items) {
                            var sum = items.reduce(function (acc, item) { return acc + (item.dataset.counts[item.dataIndex] || 0); }, 0);
                            return 'Total: ' + fmt(sum) + ' people';
                        }
                    })
                }
            },
            plugins: [segmentLabels]
        });
        /* Paint the first frame immediately: some browsers throttle the
           animation loop while the tab is in the background. */
        chart.draw();

        var instance = chart;
        var targets = datasets.map(function (dataset) { return dataset.target.slice(); });
        function growBars() {
            if (!chart || chart !== instance) return;
            instance.data.datasets.forEach(function (dataset, index) {
                dataset.data = targets[index];
            });
            instance.update();
        }

        if (REDUCED_MOTION) {
            growBars();
        } else if ('IntersectionObserver' in window) {
            var chartObserver = new IntersectionObserver(function (entries) {
                if (entries.some(function (entry) { return entry.isIntersecting; })) {
                    chartObserver.disconnect();
                    growBars();
                }
            }, { threshold: 0.2 });
            chartObserver.observe(canvas);
        } else {
            growBars();
        }
    }

    /* ---------------------------------------------------------
       Drilldown + modals
       --------------------------------------------------------- */
    function drilldownCard(title, value, note) {
        return '<div class="col-md-4"><div class="drilldown-card"><div class="drilldown-card-title">' + escape(title) + '</div><div class="drilldown-card-value">' + escape(value) + '</div><div class="drilldown-card-sub">' + escape(note) + '</div></div></div>';
    }

    function showDrilldown(key) {
        var period = getPeriod(state.year, state.month);
        var entity = byKey[key];
        if (!entity) return;
        var risk = riskFor(period, key);
        var cards = [];
        cards.push(drilldownCard(config.entitySingular, entity.name, 'Detailed insight for ' + entity.name));
        cards.push(drilldownCard('Participation', fixed(period.participation[key]) + '%',
            fmt(period.entities[key]) + ' / ' + fmt(period.totals[key]) + ' people reached'));
        risk.bmiList.forEach(function (category) {
            cards.push(drilldownCard(category.name, fmt(category.count), category.percentage + '% of screened'));
        });
        var mount = $('drilldownCards');
        if (mount) mount.innerHTML = cards.join('');
        var section = $('drilldownSection');
        if (section) {
            section.style.display = 'block';
            section.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function hideDrilldown() {
        var section = $('drilldownSection');
        if (section) section.style.display = 'none';
    }

    function dismissOpenModals() {
        if (!window.bootstrap) return 0;
        var open = document.querySelectorAll('.modal.show');
        open.forEach(function (modal) {
            var instance = window.bootstrap.Modal.getInstance(modal);
            if (instance) instance.hide();
        });
        return open.length;
    }

    function openEntityModal(key, risk) {
        if (!risk || !risk.total) return;
        var period = getPeriod(state.year, state.month);
        var count = dismissOpenModals();
        window.setTimeout(function () {
            var modalEl = $('entityRiskModal');
            if (!modalEl) return;
            if (!state.entityModal) state.entityModal = new window.bootstrap.Modal(modalEl, { backdrop: true, keyboard: true });

            var nameEl = $('modalEntityName');
            if (nameEl) nameEl.textContent = risk.name;
            var statsEl = $('modalEntityStats');
            if (statsEl) {
                statsEl.textContent = fmt(risk.total) + ' screened · ' + fixed(period.participation[key]) + '% participation (' + fmt(period.entities[key]) + ' / ' + fmt(period.totals[key]) + ')';
            }
            var scoreEl = $('modalRiskScore');
            if (scoreEl) {
                scoreEl.innerHTML = '';
                var tone = risk.level === 'high' ? 'high' : risk.level === 'moderate' ? 'moderate' : 'low';
                var label = risk.level === 'high' ? 'High overweight + obesity' : risk.level === 'moderate' ? 'Moderate overweight + obesity' : 'Low overweight + obesity';
                scoreEl.innerHTML = '<span class="risk-level-badge risk-' + tone + '"><span class="risk-level-dot" aria-hidden="true"></span>' + label + '</span>'
                    + ' <span class="modal-risk-numbers">Overweight ' + risk.bmiList[2].percentage + '% · Obesity ' + risk.bmiList[3].percentage + '%</span>';
            }

            var list = $('diseaseListContainer');
            if (list) {
                list.innerHTML = risk.bmiList.map(function (category) {
                    return '<div class="disease-item">'
                        + '<div class="d-flex justify-content-between align-items-start flex-wrap gap-2">'
                        + '<div class="disease-name"><span class="disease-dot" style="background:' + category.color + '" aria-hidden="true"></span><span>' + escape(category.name) + '</span></div>'
                        + '<div class="disease-count">' + fmt(category.count) + ' <small>(' + category.percentage + '%)</small></div>'
                        + '</div>'
                        + '<div class="progress-risk"><div class="progress-risk-fill" style="width:' + Math.min(parseFloat(category.percentage), 100) + '%;background:' + category.color + ';"></div></div>'
                        + '<div class="disease-advice"><i class="bi bi-arrow-right" aria-hidden="true"></i> ' + escape(category.recommendation) + '</div>'
                        + '</div>';
                }).join('');
            }

            var box = $('recommendationBox');
            var text = $('recommendationText');
            if (box && text) {
                var summary = risk.bmiList.map(function (category) { return category.name + ': ' + category.count + ' (' + category.percentage + '%)'; }).join(' | ');
                text.innerHTML = '<div class="mb-1"><i class="bi bi-check2-circle me-2" aria-hidden="true"></i>' + escape(summary) + '</div>'
                    + '<div class="mb-1"><i class="bi bi-check2-circle me-2" aria-hidden="true"></i>' + (risk.level === 'high'
                        ? 'Action required: high overweight/obesity prevalence. Prioritise a structured weight-management programme.'
                        : risk.level === 'moderate'
                            ? 'Action recommended: promote healthy lifestyle initiatives and track this group next period.'
                            : 'Status: healthy BMI distribution. Maintain current wellness programmes.') + '</div>';
                box.style.display = 'block';
            }

            state.entityModal.show();
        }, count > 0 ? 260 : 0);
    }

    function openCategoryModal(bmiKey) {
        var period = state.currentPeriod || getPeriod(state.year, state.month);
        var category = BMI_CATEGORIES.filter(function (item) { return item.key === bmiKey; })[0] || BMI_CATEGORIES[1];
        var title = $('categoryModalTitle');
        var subtitle = $('categoryModalSubtitle');
        if (title) title.textContent = category.name + ' by ' + config.entitySingular;
        if (subtitle) subtitle.textContent = config.entityPlural + ' ranked by ' + category.name.toLowerCase() + ' count';

        var container = $('categoryDetailsContainer');
        var risks = allRisks(period).sort(function (a, b) {
            return (b.bmiList.filter(function (item) { return item.key === bmiKey; })[0].count) - (a.bmiList.filter(function (item) { return item.key === bmiKey; })[0].count);
        });

        if (container) {
            if (!risks.length) {
                container.innerHTML = HIG.emptyState({
                icon: 'bi-emoji-smile',
                title: 'No data yet',
                text: 'No ' + config.entityPlural.toLowerCase() + ' have BMI data for this selection.'
            });
            } else {
                container.innerHTML = risks.map(function (risk) {
                    var categoryData = risk.bmiList.filter(function (item) { return item.key === bmiKey; })[0];
                    var summary = risk.bmiList.map(function (item) { return item.name + ': ' + item.count; }).join(' | ');
                    return '<button type="button" class="category-row" data-category-entity="' + risk.key + '">'
                        + '<span class="category-row-main"><strong>' + escape(risk.name) + '</strong><span>' + fmt(risk.total) + ' screened · ' + escape(summary) + '</span></span>'
                        + '<span class="category-row-count">' + fmt(categoryData.count) + '</span>'
                        + '<i class="bi bi-chevron-right" aria-hidden="true"></i>'
                        + '</button>';
                }).join('');
                container.querySelectorAll('[data-category-entity]').forEach(function (button) {
                    button.addEventListener('click', function () {
                        openEntityModal(button.dataset.categoryEntity, riskFor(period, button.dataset.categoryEntity));
                    });
                });
            }
        }

        var modalEl = $('riskCategoryModal');
        if (modalEl) {
            if (!state.categoryModal) state.categoryModal = new window.bootstrap.Modal(modalEl, { backdrop: true, keyboard: true });
            state.categoryModal.show();
        }
    }

    /* ---------------------------------------------------------
       Risk summary
       --------------------------------------------------------- */
    function renderRiskSummary(period) {
        var counts = bmiTotals(period);
        ['countUnderweight', 'countNormal', 'countOverweight', 'countObesity'].forEach(function (id, index) {
            var el = $(id);
            if (el) staggedCount(el, counts[index], 700, index * 70);
        });
    }

    /* ---------------------------------------------------------
       Sticky summary
       --------------------------------------------------------- */
    function renderSticky(period) {
        var periodEl = $('stickyPeriod');
        var entityEl = $('stickyEntity');
        var totalEl = $('stickyTotal');
        var rateEl = $('stickyRate');
        if (periodEl) periodEl.textContent = periodLabel(state.year, state.month);
        if (entityEl) {
            entityEl.textContent = state.filter === 'all' ? 'All ' + config.entityPlural.toLowerCase() : byKey[state.filter].name;
        }
        var screened = totalScreened(period);
        var target = totalTarget(period);
        if (totalEl) staggedCount(totalEl, screened, 800, 0);
        if (rateEl) rateEl.textContent = fixed(pct(screened, target)) + '%';
    }

    function initSticky() {
        var bar = $('stickySummary');
        var filterCard = document.querySelector('.filter-card');
        if (!bar || !filterCard) return;
        if ('IntersectionObserver' in window) {
            var observer = new IntersectionObserver(function (entries) {
                var entry = entries[0];
                var show = !entry.isIntersecting && entry.boundingClientRect.top < 0;
                bar.classList.toggle('is-visible', show);
            }, { threshold: 0, rootMargin: '-72px 0px 0px 0px' });
            observer.observe(filterCard);
        } else {
            window.addEventListener('scroll', function () {
                bar.classList.toggle('is-visible', filterCard.getBoundingClientRect().bottom < 0);
            }, { passive: true });
        }
    }

    /* ---------------------------------------------------------
       Main render
       --------------------------------------------------------- */
    function render() {
        syncVizTheme();
        if (!state.loaded) return;
        var period = applyFilter(getPeriod(state.year, state.month));
        state.currentPeriod = period;

        hideDrilldown();
        updateEntityCards(period);

        var totalEl = $('total-participants');
        if (totalEl) {
            if (window.HIG) HIG.countUp(totalEl, totalScreened(period), 900);
            else totalEl.textContent = fmt(totalScreened(period));
        }

        renderRiskSummary(period);
        renderChartFromBmi(buildRows(period));
        renderSticky(period);
        updateStamps();
    }

    /* ---------------------------------------------------------
       Loading
       --------------------------------------------------------- */
    function load(options) {
        var force = options && options.force;
        setStatus('loading');
        notice('loading', 'Loading ' + config.datasetLabel + '…');
        if (force) {
            var buttons = [document.querySelector('[data-refresh]'), $('stickyRefresh')];
            buttons.forEach(function (button) {
                if (!button) return;
                button.classList.add('is-busy');
                button.disabled = true;
            });
        }

        var request = force ? HIGData.refresh(config.dataKey) : HIGData.get(config.dataKey);

        request.then(function (result) {
            state.updatedAt = result.updatedAt;
            state.stale = result.stale === true;
            processRows(result.rows);
            state.loaded = true;
            setStatus(state.stale ? 'error' : 'ok', state.stale ? 'Showing cached data' : 'Live data connected');
            updateStamps();

            if (state.stale) {
                notice('error', 'Live refresh failed. Showing cached data from ' + HIG.formatTime(result.updatedAt) + '.');
                if (window.HIG) HIG.toast('Showing cached data', 'info', 2500);
            } else {
                hideNotice();
                if (window.HIG) HIG.toast('Data updated successfully', 'ok', 2000);
            }

            renderYearTabs();
            renderMonths();
            render();
            window.dispatchEvent(new CustomEvent('higdashboard:ready', { detail: { key: config.dataKey, rows: result.rows } }));
        }).catch(function (error) {
            console.error('Dashboard data failed to load:', error);
            state.loaded = state.years.length > 0;
            setStatus('error');
            notice('error', 'Unable to load screening data. Check your connection and try again.', true);
            if (window.HIG) HIG.toast('Update failed, please try again', 'error', 3000);
            if (!state.loaded) {
                var cards = $('entityCards');
                if (cards) {
                    cards.innerHTML = '<div class="col-12">' + HIG.emptyState({
                        icon: 'bi-wifi-off',
                        title: 'Data unavailable',
                        text: 'We could not reach the screening data source. Please try again in a moment.'
                    }) + '</div>';
                }
            }
        }).finally(function () {
            [document.querySelector('[data-refresh]'), $('stickyRefresh')].forEach(function (button) {
                if (!button) return;
                button.classList.remove('is-busy');
                button.disabled = false;
            });
        });
    }

    /* ---------------------------------------------------------
       Boot
       --------------------------------------------------------- */
    function init() {
        if (window.Chart) {
            Chart.defaults.font.family = VIZ.font;
            Chart.defaults.color = VIZ.text;
        }

        buildEntityFilter();
        renderEntityCards();

        var compareToggle = $('btnCompareToggle');
        if (compareToggle) compareToggle.addEventListener('click', toggleComparison);

        var compareBtn = $('btnCompare');
        if (compareBtn) compareBtn.addEventListener('click', runComparison);

        var resetBtn = $('btnResetCompare');
        if (resetBtn) resetBtn.addEventListener('click', function () {
            resetComparison();
            var controls = $('comparisonControls');
            if (controls) controls.style.display = 'none';
        });

        document.querySelectorAll('[data-refresh], #stickyRefresh').forEach(function (button) {
            button.addEventListener('click', function () {
                if (window.HIG) HIG.toast('Updating data…', 'loading', 2500);
                load({ force: true });
            });
        });

        document.querySelectorAll('.risk-stat-item[role="button"]').forEach(function (item) {
            item.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                item.click();
            });
            item.addEventListener('click', function () {
                openCategoryModal(item.dataset.bmi);
            });
        });

        var title = $('bmiChartTitle');
        if (title && config.chartTitle) title.textContent = config.chartTitle;

        var entityLabel = $('stat-entity-label');
        if (entityLabel) entityLabel.textContent = config.statLabel;
        var breakdownLabel = $('entitySectionLabel');
        if (breakdownLabel) breakdownLabel.textContent = config.breakdownLabel || 'Breakdown';
        var entityCount = $('stat-entity-count');
        if (entityCount) entityCount.textContent = String(config.entities.length);

        var modalEl = $('entityRiskModal');
        if (modalEl) {
            var glyph = modalEl.querySelector('.modal-glyph i');
            if (glyph && config.modalIcon) glyph.className = 'bi ' + config.modalIcon;
            var heading = modalEl.querySelector('.modal-analysis-title span');
            if (heading) heading.textContent = config.modalAnalysisTitle || 'BMI analysis';
        }

        initSticky();

        window.addEventListener('themechange', function () {
            syncVizTheme();
            if (state.loaded) render();
        });

        load({ force: false });

        /* Re-render trend relative labels when the tab had been idle. */
        document.addEventListener('visibilitychange', function () {
            if (document.hidden || !state.loaded) return;
            updateStamps();
            if (chart) chart.resize();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.HIGDashboard = {
        state: state,
        render: render,
        refresh: function () { load({ force: true }); },
        openEntity: function (key) { openEntityModal(key, riskFor(getPeriod(state.year, state.month), key)); }
    };
})();
