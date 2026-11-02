/* =========================================================
   Combined screening overview
   Reads both screening datasets through the shared data layer
   and summarises them on screening.html.
   ========================================================= */
(function () {
    'use strict';

    var PROGRAMS = {
        hu: {
            key: 'hu',
            label: 'HU Staff',
            short: 'HU',
            href: 'hu_staff.html',
            color: '#ff6900',
            icon: 'bi-mortarboard-fill',
            entityLabel: 'sector',
            entities: [
                { key: 'students', name: 'Students', matches: ['student'] },
                { key: 'pt', name: 'Faculty of Physical Therapy', matches: ['physical', 'pt'] },
                { key: 'pharmacy', name: 'Faculty of Pharmacy', matches: ['pharmacy'] },
                { key: 'eng', name: 'Faculty of Engineering', matches: ['engineer'] },
                { key: 'business', name: 'Faculty of Business', matches: ['business'] },
                { key: 'agri', name: 'Faculty of Agriculture', matches: ['agri'] },
                { key: 'workers', name: 'University Workers', matches: ['worker'] }
            ]
        },
        sekem: {
            key: 'sekem',
            label: 'SEKEM',
            short: 'SEKEM',
            href: 'sekem.html',
            color: '#22ac38',
            icon: 'bi-buildings-fill',
            entityLabel: 'company',
            entities: [
                { key: 'atos-pharma', name: 'Atos Pharma', matches: ['atos'] },
                { key: 'biodynamic-association', name: 'Biodynamic Association', matches: ['biodynamic'] },
                { key: 'eco-energy', name: 'Eco Energy', matches: ['eco energy'] },
                { key: 'eco-health', name: 'Eco Health', matches: ['eco health'] },
                { key: 'eco-village', name: 'Eco Village', matches: ['eco village'] },
                { key: 'isis-foods', name: 'ISIS Foods', matches: ['isis'] },
                { key: 'lotus-organic', name: 'Lotus Organic', matches: ['lotus'] },
                { key: 'naturetex', name: 'Naturetex', matches: ['naturetex'] },
                { key: 'sdf-association', name: 'SDF Association', matches: ['sdf'] },
                { key: 'sekem-lab', name: 'Sekem Lab', matches: ['sekem lab'] },
                { key: 'sekem-reclamation', name: 'Sekem Reclamation', matches: ['sekem reclamation', 'reclamation'] }
            ]
        }
    };

    var MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    var state = {
        updatedAt: null,
        stale: false,
        rows: { hu: [], sekem: [] }
    };

    function $(id) { return document.getElementById(id); }
    function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
    function fmt(value) { return num(value).toLocaleString(); }
    function fixed(value, digits) { return num(value).toFixed(digits == null ? 1 : digits); }
    function pct(part, total) { return total > 0 ? (part / total) * 100 : 0; }
    function escape(value) { return window.HIG ? HIG.escapeHtml(value) : String(value == null ? '' : value); }
    function periodLabel(year, month) { return (MONTHS[month] || '') + ' ' + year; }

    function matchEntity(program, value) {
        var v = String(value == null ? '' : value).toLowerCase().trim();
        if (!v) return null;
        for (var i = 0; i < program.entities.length; i++) {
            var entity = program.entities[i];
            var patterns = entity.matches || [entity.key, entity.name.toLowerCase()];
            for (var j = 0; j < patterns.length; j++) {
                if (v.indexOf(patterns[j]) !== -1) return entity;
            }
        }
        return null;
    }

    /** Group rows into periods with per-entity totals and BMI counts. */
    function buildPeriods(program, rows) {
        var periods = {};
        var column = program.key === 'hu' ? 'Sector' : 'Company';

        rows.forEach(function (row) {
            var year = parseInt(row.Year, 10);
            var month = parseInt(row.Month, 10);
            if (!year || !month) return;

            var key = year + '-' + month;
            if (!periods[key]) {
                periods[key] = { year: year, month: month, screened: 0, target: 0, bmi: [0, 0, 0, 0], entities: {} };
            }
            var period = periods[key];
            var entity = matchEntity(program, row[column]);
            if (!entity) return;

            var screened = num(row.Total_Count);
            var target = num(row.Total);
            var bmi = [num(row.Under_weight), num(row.Normal_Weight), num(row.Over_weight), num(row.Obesity)];

            period.screened += screened;
            period.target += target;
            for (var i = 0; i < 4; i++) period.bmi[i] += bmi[i];
            period.entities[entity.key] = {
                name: entity.name,
                screened: screened,
                target: target,
                participation: pct(screened, target),
                bmi: bmi
            };
        });

        return periods;
    }

    function latestPeriod(periods) {
        return Object.keys(periods)
            .map(function (key) { return periods[key]; })
            .sort(function (a, b) { return a.year - b.year || a.month - b.month; })
            .pop() || null;
    }

    function bmiTotal(period) {
        return period ? period.bmi.reduce(function (a, b) { return a + b; }, 0) : 0;
    }

    function riskLevel(excessShare) {
        return excessShare > 0.30 ? 'high' : excessShare > 0.10 ? 'moderate' : 'low';
    }

    /* ---------------------------------------------------------
       Rendering
       --------------------------------------------------------- */
    function notice(kind, message, retry) {
        var el = $('overviewNotice');
        if (!el) return;
        el.hidden = false;
        el.className = 'data-notice data-notice-' + kind;
        el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
        el.replaceChildren();

        var icon = document.createElement('i');
        icon.className = 'bi ' + (kind === 'error' ? 'bi-wifi-off' : 'bi-info-circle');
        icon.setAttribute('aria-hidden', 'true');

        var span = document.createElement('span');
        span.className = 'data-notice-message';
        span.textContent = message;
        el.append(icon, span);

        if (retry) {
            var button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Try again';
            button.addEventListener('click', function () { load(true); });
            el.append(button);
        }
    }

    function hideNotice() {
        var el = $('overviewNotice');
        if (el) el.hidden = true;
    }

    function updateStamps() {
        document.querySelectorAll('[data-updated-stamp]').forEach(function (el) {
            if (window.HIG) HIG.lastUpdated(el, state.updatedAt, { stale: state.stale });
        });
    }

    function programmeSummary(key) {
        var program = PROGRAMS[key];
        var periods = buildPeriods(program, state.rows[key] || []);
        var period = latestPeriod(periods);
        if (!period) return { program: program, period: null, periods: periods, excess: 0, obesity: 0, participation: 0 };
        var totalBmi = bmiTotal(period);
        return {
            program: program,
            period: period,
            periods: periods,
            excess: pct(period.bmi[2] + period.bmi[3], totalBmi),
            obesity: pct(period.bmi[3], totalBmi),
            participation: pct(period.screened, period.target)
        };
    }

    function combinedTotals(summaries) {
        var totals = { screened: 0, target: 0, bmi: [0, 0, 0, 0] };
        summaries.forEach(function (summary) {
            if (!summary.period) return;
            totals.screened += summary.period.screened;
            totals.target += summary.period.target;
            for (var i = 0; i < 4; i++) totals.bmi[i] += summary.period.bmi[i];
        });
        return totals;
    }

    function renderStats(summaries) {
        var totals = combinedTotals(summaries);
        var totalBmi = totals.bmi.reduce(function (a, b) { return a + b; }, 0);

        var values = {
            'ovScreened': [totals.screened, 900, null],
            'ovParticipation': [pct(totals.screened, totals.target), 950, pctText],
            'ovExcess': [pct(totals.bmi[2] + totals.bmi[3], totalBmi), 1050, pctText],
            'ovObesity': [pct(totals.bmi[3], totalBmi), 1150, pctText]
        };
        Object.keys(values).forEach(function (id) {
            var el = $(id);
            if (!el) return;
            var spec = values[id];
            if (window.HIG && HIG.countUp) HIG.countUp(el, spec[0], spec[1], spec[2] || undefined);
            else el.textContent = spec[2] ? spec[2](spec[0]) : fmt(spec[0]);
        });

        var sub = $('ovScreenedSub');
        if (sub) sub.textContent = totals.target > 0
            ? fmt(totals.screened) + ' of ' + fmt(totals.target) + ' people reached'
            : 'No participation target recorded';
    }

    function renderProgrammeRows(summaries) {
        var mount = $('programmeRows');
        if (!mount) return;
        mount.innerHTML = summaries.map(function (summary, index) {
            var program = summary.program;
            if (!summary.period) {
                return '<div class="programme-row" style="--i:' + index + '"><span class="programme-mark" style="--tile:' + program.color + '"><i class="bi ' + program.icon + '" aria-hidden="true"></i></span>'
                    + '<span class="programme-body"><strong>' + escape(program.label) + '</strong><span>No screening data recorded yet</span></span></div>';
            }
            return '<div class="programme-row" style="--i:' + index + '">'
                + '<span class="programme-mark" style="--tile:' + program.color + '"><i class="bi ' + program.icon + '" aria-hidden="true"></i></span>'
                + '<span class="programme-body"><strong>' + escape(program.label) + '</strong>'
                + '<span>' + periodLabel(summary.period.year, summary.period.month) + ' · ' + fmt(summary.period.screened) + ' screened</span></span>'
                + '<span class="programme-metric"><strong>' + fixed(summary.participation) + '%</strong><span>participation</span></span>'
                + '<span class="programme-track" role="img" aria-label="' + escape(program.label) + ' participation ' + fixed(summary.participation) + '%"><span data-bar="' + Math.min(100, summary.participation) + '" style="width:0%;background:' + program.color + '"></span></span>'
                + '</div>';
        }).join('');
        animateBars(mount);
    }

    var REDUCED = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

    function pctText(value) {
        return fixed(value) + '%';
    }

    /* Bars are rendered at 0% and then eased to their real width, so the
       reader sees the proportions fill in rather than appear already full. */
    function animateBars(scope) {
        if (!scope) return;
        var bars = scope.querySelectorAll('[data-bar]');
        if (!bars.length) return;
        function apply() {
            Array.prototype.forEach.call(bars, function (bar, index) {
                bar.style.transitionDelay = (index * 80) + 'ms';
                bar.style.width = bar.getAttribute('data-bar') + '%';
            });
        }
        if (REDUCED) { apply(); return; }
        requestAnimationFrame(function () { requestAnimationFrame(apply); });
    }

    function topRiskGroups(summaries) {
        var groups = [];
        summaries.forEach(function (summary) {
            if (!summary.period) return;
            Object.keys(summary.period.entities).forEach(function (key) {
                var entity = summary.period.entities[key];
                var total = entity.bmi.reduce(function (a, b) { return a + b; }, 0);
                if (total <= 0 || entity.screened < 10) return;
                groups.push({
                    name: entity.name,
                    programme: summary.program.short,
                    color: summary.program.color,
                    screened: entity.screened,
                    excess: pct(entity.bmi[2] + entity.bmi[3], total),
                    obesity: pct(entity.bmi[3], total)
                });
            });
        });
        return groups.sort(function (a, b) { return b.excess - a.excess; }).slice(0, 6);
    }

    function renderTopRisk(summaries) {
        var mount = $('topRiskList');
        if (!mount) return;
        var groups = topRiskGroups(summaries);
        if (!groups.length) {
            mount.innerHTML = HIG.emptyState({
                icon: 'bi-bar-chart',
                title: 'No priority data',
                text: 'No groups with BMI data available for the selected period.'
            });
            return;
        }
        mount.innerHTML = '<div class="rank-list">' + groups.map(function (group, index) {
            var tone = riskLevel(group.excess / 100);
            return '<div class="rank-row" style="--i:' + index + '">'
                + '<div><div class="rank-name">' + escape(group.name) + ' <span class="rank-tag" style="--tile:' + group.color + '">' + escape(group.programme) + '</span></div>'
                + '<div class="rank-meta">' + fmt(group.screened) + ' screened · obesity ' + fixed(group.obesity) + '%</div></div>'
                + '<div class="rank-value is-' + tone + '">' + fixed(group.excess) + '%</div>'
                + '<div class="rank-bar"><span class="is-' + tone + '" data-bar="' + Math.min(100, group.excess) + '" style="width:0%"></span></div>'
                + '</div>';
        }).join('') + '</div>';
        animateBars(mount);
    }

    function renderEmpty() {
        ['programmeRows', 'topRiskList'].forEach(function (id) {
            var el = $(id);
            if (el && !el.innerHTML) {
                el.innerHTML = HIG.emptyState({
                    icon: 'bi-inbox',
                    title: 'No data available',
                    text: 'The selected period or filter contains no screening data. Please try another filter.'
                });
            }
        });
    }

    function render() {
        var summaries = ['hu', 'sekem'].map(programmeSummary);
        renderStats(summaries);
        renderProgrammeRows(summaries);
        renderTopRisk(summaries);
        renderEmpty();
        updateStamps();
        if (window.HIG) HIG.refreshReveals();
    }

    /* ---------------------------------------------------------
       Loading
       --------------------------------------------------------- */
    function load(force) {
        return ['hu', 'sekem'].map(function (key) {
            return (force ? HIGData.refresh(key) : HIGData.get(key))
                .then(function (result) {
                    state.rows[key] = result.rows;
                    if (!state.updatedAt || result.updatedAt > state.updatedAt) state.updatedAt = result.updatedAt;
                    if (result.stale) state.stale = true;
                    return true;
                })
                .catch(function (error) {
                    console.error('Overview data failed for ' + key + ':', error);
                    var cached = HIGData.updatedAt(key);
                    if (cached) {
                        state.stale = true;
                        if (!state.updatedAt || cached > state.updatedAt) state.updatedAt = cached;
                    }
                    return false;
                });
        }).reduce(function (chain, request) {
            return chain.then(function (ok) { return request.then(function (value) { return ok && value; }); });
        }, Promise.resolve(true)).then(function (ok) {
            var hasData = state.rows.hu.length || state.rows.sekem.length;
            if (!hasData) {
                notice('error', 'Unable to load screening data. Check your connection and try again.', true);
                var panel = $('overviewEmptyState');
                if (panel) {
                    panel.hidden = false;
                    panel.innerHTML = HIG.statePanel({
                        icon: 'bi-wifi-off',
                        title: 'Data unavailable',
                        text: 'We could not reach the screening data source. Please retry in a moment.'
                    });
                }
                return;
            }
            if (state.stale) {
                notice('error', 'Some data could not be refreshed. Showing the last saved snapshot from ' + HIG.formatTime(state.updatedAt) + '.');
            } else {
                hideNotice();
            }
            render();
        });
    }

    function init() {
        load(false);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.HIGOverview = { state: state, reload: function () { load(true); } };
})();
