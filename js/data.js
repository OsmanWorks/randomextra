/* ==========================================================================
   Chaajao Analytics - DATA LAYER (pure functions, DOM se koi taluq nahi)
   Browser mein window.CData, Node mein module.exports (testing ke liye).
   ========================================================================== */
(function (root) {
  'use strict';

  var DAY = 86400000;
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

  /* 1. CSV parser (RFC 4180): quotes, "" escape, line breaks inside cells, CRLF, BOM */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], cell = '', inQ = false, i = 0, n = text.length, ch;
    while (i < n) {
      ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cell += ch; i++; continue;
      }
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === ',') { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      cell += ch; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  /* 2. Header normaliser: "Facebook\n(Likes)" -> "facebooklikes", "Linkdin" -> "linkdin" */
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  /* 3. Number parser: NBSP/space/comma hatao. "-", "", "n/a" => null (zero NAHI) */
  function parseNumber(raw) {
    if (raw == null) return null;
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    var s = String(raw).replace(/[\u00a0\u2007\u202f\u200b\s,]/g, '');
    if (s === '' || /^[-\u2013\u2014]+$/.test(s) || /^(n\/?a|null|nan|#n\/a|#div\/0!|#ref!|#value!)$/i.test(s)) return null;
    if (/^[-+]?\d+(\.\d+)?$/.test(s)) return Number(s);
    return NaN; // text jo number nahi - caller isay warning ginta hai
  }

  /* 4. Date parser -> {y,m,d} ya null. order: 'dmy' | 'mdy' (sirf a/b/yyyy ke liye) */
  function parseDate(raw, order) {
    if (raw == null) return null;
    var s = String(raw).replace(/[\u00a0\s]+/g, ' ').trim(), m;
    if (!s) return null;
    if ((m = /^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})/.exec(s))) return ok(+m[1], +m[2] + 1, +m[3]);   // gviz JSON
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s))) return ok(+m[1], +m[2], +m[3]);       // 2026-10-19
    if ((m = /^(\d{1,2})[-\/ .]([A-Za-z]{3,9})[-\/ .,]+(\d{2,4})$/.exec(s))) return ok(yr(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]); // 19-Oct-2026
    if ((m = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{2,4})$/.exec(s))) return ok(yr(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);       // Oct 19, 2026
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s))) {                                    // 19/10/2026 ya 10/19/2026
      var a = +m[1], b = +m[2];
      return order === 'mdy' ? ok(yr(m[3]), a, b) : ok(yr(m[3]), b, a);
    }
    return null;
    function yr(y) { y = +y; return y < 100 ? 2000 + y : y; }
    function ok(y, mo, d) {
      if (!mo || mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
      var t = Date.UTC(y, mo - 1, d), dt = new Date(t);
      if (dt.getUTCMonth() !== mo - 1) return null;
      return { y: y, m: mo, d: d, t: t, iso: y + '-' + p2(mo) + '-' + p2(d) };
    }
    function p2(x) { return (x < 10 ? '0' : '') + x; }
  }

  /* a/b/yyyy wali dates ka order poori column dekh kar tay karo */
  function detectOrder(cells, forced) {
    if (forced === 'dmy' || forced === 'mdy') return forced;
    var dmy = 0, mdy = 0, m;
    cells.forEach(function (c) {
      if ((m = /^\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-]\d{2,4}\s*$/.exec(String(c)))) {
        if (+m[1] > 12) dmy++; if (+m[2] > 12) mdy++;
      }
    });
    return mdy > dmy ? 'mdy' : 'dmy';
  }

  /* 5. Model builder: CSV text -> {rows, columns, warnings, missing} */
  function buildModel(csvText, cfg) {
    var grid = parseCSV(csvText);
    var dateAliases = cfg.dateHeaderAliases.map(norm);
    var hIdx = -1, i;
    for (i = 0; i < Math.min(grid.length, 60); i++) {
      if (grid[i] && dateAliases.indexOf(norm(grid[i][0])) !== -1) { hIdx = i; break; }
    }
    if (hIdx === -1) {
      var e = new Error('Header row nahi mili (column A mein "Date" hona chahiye).');
      e.kind = 'format'; throw e;
    }
    var headers = grid[hIdx].map(norm);
    var used = {};
    function findCol(aliases) {
      var al = aliases.map(norm);
      for (var c = 1; c < headers.length; c++) {
        if (!used[c] && headers[c] && al.indexOf(headers[c]) !== -1) return c;
      }
      return -1;
    }
    var columns = {}, missing = [];
    cfg.platforms.forEach(function (p) {
      var main = findCol(p.aliases); if (main > -1) used[main] = true;
      var fb = p.fallbackAliases ? findCol(p.fallbackAliases) : -1; if (fb > -1) used[fb] = true;
      columns[p.key] = { main: main, fallback: fb };
      if (main === -1 && fb === -1) missing.push(p.label);
    });

    var body = grid.slice(hIdx + 1);
    var order = detectOrder(body.map(function (r) { return r[0]; }), cfg.dateOrder);
    var byDate = {}, skipped = 0, badText = [], dupes = 0;
    body.forEach(function (r, k) {
      var d = parseDate(r[0], order);
      if (!d) { if (String(r[0] || '').trim()) skipped++; return; }   // "Total" jaisi rows yahin ruk jati hain
      var v = {}, src = {}, any = false;
      cfg.platforms.forEach(function (p) {
        var col = columns[p.key], val = null, from = null;
        if (col.main > -1) { val = cell(r[col.main], p, hIdx + 2 + k, col.main); if (val != null) from = 'main'; }
        if (val == null && col.fallback > -1) { val = cell(r[col.fallback], p, hIdx + 2 + k, col.fallback); if (val != null) from = 'fallback'; }
        v[p.key] = val; src[p.key] = from; if (val != null) any = true;
      });
      if (byDate[d.iso]) dupes++;
      byDate[d.iso] = { date: d.iso, t: d.t, v: v, src: src, empty: !any };
    });
    function cell(raw, p, rowNo, colNo) {
      var n = parseNumber(raw);
      if (n !== n) { badText.push(p.label + ' (row ' + rowNo + '): "' + String(raw).trim() + '"'); return null; }
      return n;
    }
    var rows = Object.keys(byDate).sort().map(function (k) { return byDate[k]; });
    // aakhri khali rows (date likhi hai magar koi number nahi) hata do, taake "latest" ghalat na ho
    while (rows.length && rows[rows.length - 1].empty) rows.pop();
    if (!rows.length) { var e2 = new Error('Sheet mein koi date wali row nahi mili.'); e2.kind = 'empty'; throw e2; }
    return { rows: rows, columns: columns, missing: missing, skippedRows: skipped, duplicates: dupes, badText: badText, dateOrder: order };
  }

  /* 6. Stats: har platform ke liye latest, delta, best week, avg weekly growth, sparkline */
  function computeStats(model, cfg) {
    var rows = model.rows, last = rows[rows.length - 1];
    var perPlat = {}, totalNow = 0, deltaTotal = 0, deltaCount = 0, haveCount = 0, prevForDelta = 0;
    cfg.platforms.forEach(function (p) {
      var series = [];
      rows.forEach(function (r) { if (r.v[p.key] != null) series.push({ t: r.t, date: r.date, v: r.v[p.key], src: r.src[p.key] }); });
      var pairs = [], sumDelta = 0, sumDays = 0, best = null, j;
      for (j = 1; j < series.length; j++) {
        var a = series[j - 1], b = series[j];
        if (a.src !== b.src) continue;                     // metric badla (Likes -> Follows): delta nahi
        var dlt = b.v - a.v, days = (b.t - a.t) / DAY;
        pairs.push({ t: b.t, date: b.date, from: a.v, to: b.v, delta: dlt, days: days });
        sumDelta += dlt; sumDays += days;
        if (!best || dlt > best.delta) best = pairs[pairs.length - 1];
      }
      var lastPt = series.length ? series[series.length - 1] : null;
      var latest = last.v[p.key];                          // sirf aakhri sheet-row ki value, warna null
      var prevPt = null, delta = null;
      if (latest != null) {
        var cur = series[series.length - 1];
        for (j = series.length - 2; j >= 0; j--) { if (series[j].src === cur.src) { prevPt = series[j]; break; } }
        if (prevPt) delta = latest - prevPt.v;
      }
      perPlat[p.key] = {
        key: p.key, latest: latest, prev: prevPt ? prevPt.v : null, prevDate: prevPt ? prevPt.date : null, delta: delta,
        lastKnown: lastPt, firstDate: series.length ? series[0].date : null, series: series, pairs: pairs,
        best: best, avgWeekly: sumDays > 0 ? (sumDelta / sumDays) * 7 : null, points: series.length
      };
      if (latest != null) { totalNow += latest; haveCount++; }
      if (delta != null) { deltaTotal += delta; deltaCount++; prevForDelta += prevPt.v; }
    });
    // total ki history: har row ka tracked platforms ka jod
    var totals = rows.map(function (r) {
      var s = 0, n = 0; cfg.platforms.forEach(function (p) { if (r.v[p.key] != null) { s += r.v[p.key]; n++; } });
      return { t: r.t, date: r.date, v: s, n: n };
    });
    var prevRow = rows.length > 1 ? totals[totals.length - 2] : null;
    return {
      latestDate: last.date, previousDate: rows.length > 1 ? rows[rows.length - 2].date : null,
      total: totalNow, prevTotal: prevRow ? prevRow.v : null, delta: deltaCount ? deltaTotal : null,
      platformsWithData: haveCount, platformsTotal: cfg.platforms.length,
      comparable: deltaCount, perPlat: perPlat, totals: totals
    };
  }

  var API = { parseCSV: parseCSV, parseNumber: parseNumber, parseDate: parseDate, norm: norm, buildModel: buildModel, computeStats: computeStats };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CData = API;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
