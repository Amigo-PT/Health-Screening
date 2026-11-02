/* =========================================================
   Homepage impact strip
   Summarises both screening programmes through the shared
   data layer so the homepage never fetches Google Sheets on
   its own.
   ========================================================= */
(function () {
    'use strict';

    var PROGRAMS = {
        hu: {
            entityColumn: 'Sector',
            matches: [
                ['student'], ['physical', 'pt'], ['pharmacy'], ['engineer'],
                ['business'], ['agri'], ['worker']
            ]
        },
        sekem: {
            entityColumn: 'Company',
            matches: [
                ['atos'], ['biodynamic'], ['eco energy'], ['eco health'], ['eco village'],
                ['isis'], ['lotus'], ['naturetex'], ['sdf'], ['sekem lab'],
                ['sekem reclamation', 'reclamation']
            ]
        }
    };

    function $(id) { return document.getElementById(id); }
    function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
    function fmt(value) { return num(value).toLocaleString(); }

    function matches(value, patterns) {
        var v = String(value == null ? '' : value).toLowerCase().trim();
        if (!v) return false;
        return patterns.some(function (list) {
            return list.some(function (pattern) { return v.indexOf(pattern) !== -1; });
        });
    }

    function summarise(key, rows) {
        var program = PROGRAMS[key];
        var periods = {};
        var entities = {};

        rows.forEach(function (row) {
            var year = parseInt(row.Year, 10);
            var month = parseInt(row.Month, 10);
            if (!year || !month) return;
            if (!matches(row[program.entityColumn], program.matches)) return;

            var periodKey = year + '-' + month;
            if (!periods[periodKey]) periods[periodKey] = { year: year, month: month, screened: 0 };
            periods[periodKey].screened += num(row.Total_Count);
            entities[key + ':' + String(row[program.entityColumn]).toLowerCase().trim()] = true;
        });

        var latest = Object.keys(periods)
            .map(function (periodKey) { return periods[periodKey]; })
            .sort(function (a, b) { return a.year - b.year || a.month - b.month; })
            .pop();

        return { screened: latest ? latest.screened : 0, groups: Object.keys(entities).length };
    }

    function render(summaries) {
        var screened = summaries.reduce(function (sum, item) { return sum + item.screened; }, 0);
        var groups = summaries.reduce(function (sum, item) { return sum + item.groups; }, 0);

        var screenedEl = $('impactScreened');
        if (screenedEl) {
            if (window.HIG) HIG.countUp(screenedEl, screened, 1200);
            else screenedEl.textContent = fmt(screened);
        }
        var groupsEl = $('impactGroups');
        if (groupsEl) groupsEl.textContent = String(groups);
        var programsEl = $('impactPrograms');
        if (programsEl) programsEl.textContent = '2';
    }

    function stamp(timestamp, stale) {
        var el = $('impactUpdated');
        if (!el) return;
        if (!timestamp) {
            el.textContent = 'Not yet updated';
            return;
        }
        el.textContent = window.HIG ? HIG.relativeTime(timestamp) : new Date(timestamp).toLocaleString();
        el.title = window.HIG ? HIG.formatTime(timestamp) : '';
        el.classList.toggle('is-stale', stale === true);
    }

    function load() {
        var updatedAt = null;
        var stale = false;

        Promise.all(Object.keys(PROGRAMS).map(function (key) {
            return HIGData.get(key)
                .then(function (result) {
                    if (!updatedAt || result.updatedAt > updatedAt) updatedAt = result.updatedAt;
                    if (result.stale) stale = true;
                    return summarise(key, result.rows);
                })
                .catch(function (error) {
                    console.error('Impact data failed for ' + key + ':', error);
                    stale = true;
                    var cached = HIGData.updatedAt(key);
                    if (cached && (!updatedAt || cached > updatedAt)) updatedAt = cached;
                    return { screened: 0, groups: 0 };
                });
        })).then(function (summaries) {
            if (!summaries.some(function (item) { return item.screened > 0; })) {
                stamp(null);
                var box = document.querySelector('.impact-strip');
                if (box) box.hidden = true;
                return;
            }
            render(summaries);
            stamp(updatedAt, stale);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', load);
    } else {
        load();
    }
})();
