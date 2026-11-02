/* =========================================================
   Shared data layer (JSON-backed)
   - data is served from /data/<key>.json
   - one fetch per dataset per session
   - sessionStorage cache with a short TTL
   - stale-while-revalidate fallback when the network fails
   - a single source of truth for "last updated"
   ========================================================= */
(function () {
    'use strict';

    var BASE = 'data/';

    var REGISTRY = {
        hu:            { file: 'hu.json',            label: 'HU Staff screening' },
        sekem:         { file: 'sekem.json',         label: 'SEKEM screening' },
        reports:       { file: 'reports.json',       label: 'Project reports' },
        interventions: { file: 'interventions.json', label: 'Interventions' },
        activities:    { file: 'activities.json',    label: 'Activities' },
        surveys:       { file: 'surveys.json',       label: 'Surveys' },
        issues:        { file: 'issues.json',        label: 'Reported issues' }
    };

    var CACHE_PREFIX = 'hig:data:v2:';
    var TTL = 12 * 60 * 1000;          /* 12 minutes */
    var inflight = Object.create(null);
    var memory = Object.create(null);

    function url(key) {
        var set = REGISTRY[key];
        if (!set) throw new Error('Unknown dataset: ' + key);
        return BASE + set.file;
    }

    function cacheKey(key) {
        return CACHE_PREFIX + key + ':' + (REGISTRY[key] ? REGISTRY[key].file : key);
    }

    function readCache(key) {
        if (memory[key]) return memory[key];
        try {
            var raw = window.sessionStorage.getItem(cacheKey(key));
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.rows)) return null;
            memory[key] = parsed;
            return parsed;
        } catch (err) {
            return null;
        }
    }

    function writeCache(key, entry) {
        memory[key] = entry;
        try {
            window.sessionStorage.setItem(cacheKey(key), JSON.stringify(entry));
        } catch (err) {
            /* Quota or private mode: memory cache still works. */
        }
    }

    function download(key) {
        return fetch(url(key), { cache: 'no-store', credentials: 'omit' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Request failed with status ' + response.status);
                }
                return response.json();
            })
            .then(function (rows) {
                if (!Array.isArray(rows)) rows = [];
                return rows.filter(function (row) {
                    return row && Object.keys(row).some(function (k) {
                        return row[k] !== '' && row[k] !== null && row[k] !== undefined;
                    });
                });
            });
    }

    /**
     * Load a dataset.
     * @param {string} key registry key
     * @param {object} [options] { force: boolean }
     * @returns {Promise<{key,rows,updatedAt,fromCache,stale}>}
     */
    function get(key, options) {
        options = options || {};
        var now = Date.now();
        var cached = readCache(key);

        if (!options.force && cached && (now - cached.updatedAt) < TTL) {
            return Promise.resolve({
                key: key,
                rows: cached.rows,
                updatedAt: cached.updatedAt,
                fromCache: true,
                stale: false
            });
        }

        if (inflight[key]) return inflight[key];

        inflight[key] = download(key)
            .then(function (rows) {
                var entry = { rows: rows, updatedAt: Date.now() };
                writeCache(key, entry);
                delete inflight[key];
                return {
                    key: key,
                    rows: rows,
                    updatedAt: entry.updatedAt,
                    fromCache: false,
                    stale: false
                };
            })
            .catch(function (error) {
                delete inflight[key];
                var fallback = readCache(key);
                if (fallback) {
                    return {
                        key: key,
                        rows: fallback.rows,
                        updatedAt: fallback.updatedAt,
                        fromCache: true,
                        stale: true,
                        error: error
                    };
                }
                throw error;
            });

        return inflight[key];
    }

    function refresh(key) {
        return get(key, { force: true });
    }

    function updatedAt(key) {
        var cached = readCache(key);
        return cached ? cached.updatedAt : null;
    }

    function formatTime(ts, withDate) {
        if (!ts) return 'not available';
        var date = new Date(ts);
        var opts = withDate
            ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
            : { hour: '2-digit', minute: '2-digit' };
        return date.toLocaleString('en-US', opts);
    }

    function relative(ts) {
        if (!ts) return 'not yet updated';
        var diff = Math.max(0, Date.now() - ts);
        var minutes = Math.round(diff / 60000);
        if (minutes < 1) return 'just now';
        if (minutes === 1) return '1 minute ago';
        if (minutes < 60) return minutes + ' minutes ago';
        var hours = Math.round(minutes / 60);
        if (hours === 1) return '1 hour ago';
        if (hours < 24) return hours + ' hours ago';
        var days = Math.round(hours / 24);
        return days === 1 ? 'yesterday' : days + ' days ago';
    }

    window.HIGData = {
        base: BASE,
        registry: REGISTRY,
        ttl: TTL,
        url: url,
        get: get,
        refresh: refresh,
        updatedAt: updatedAt,
        formatTime: formatTime,
        relative: relative,
        clear: function (key) {
            delete memory[key];
            try { window.sessionStorage.removeItem(cacheKey(key)); } catch (err) {}
        }
    };
})();
