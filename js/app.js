/* Chaajao Analytics - app (UI, charts, routing, PWA). Data ka kaam js/data.js karta hai. */
(function () {
  'use strict';
  var C = CONFIG, Data = window.CData;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }
  function signed(n) { return n > 0 ? '+' + fmtNum(n) : n < 0 ? '-' + fmtNum(-n) : '0'; }
  function compact(n) {
    var a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(Math.round(n));
  }
  function fmtDate(iso) { var p = iso.split('-'); return +p[2] + ' ' + MON[p[1] - 1] + ' ' + p[0]; }
  function fmtShort(iso) { var p = iso.split('-'); return +p[2] + ' ' + MON[p[1] - 1]; }
  function fmtMonthYr(iso) { var p = iso.split('-'); return MON[p[1] - 1] + " '" + p[0].slice(2); }
  function ago(ts) {
    var s = (Date.now() - ts) / 1000;
    if (s < 45) return 'abhi abhi';
    var m = Math.round(s / 60); if (m < 60) return m + ' min pehle';
    var h = Math.round(m / 60); if (h < 24) return h + ' ghante pehle';
    return Math.round(h / 24) + ' din pehle';
  }
  var Store = {
    mem: {},
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return this.mem[k] == null ? null : this.mem[k]; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { this.mem[k] = v; return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } delete this.mem[k]; }
  };
  var platByKey = {}; C.platforms.forEach(function (p) { platByKey[p.key] = p; });

  /* ---------- state ---------- */
  var S = { model: null, stats: null, mode: null, fetchedAt: 0, error: null, loading: false, range: C.defaultRange,
            view: null, detail: null, detailPushed: false, deferred: null, pendingDetail: null };

  /* ---------- cache (last good data) ---------- */
  function cacheTag() { return C.sheet.id + '|' + (C.sheet.gid || C.sheet.tabName); }
  function saveCache(csv, mode) {
    Store.set(C.cache.key, JSON.stringify({ schema: C.schemaVersion, tag: cacheTag(), savedAt: Date.now(), mode: mode, csv: csv }));
  }
  function readCache() {
    try {
      var o = JSON.parse(Store.get(C.cache.key) || 'null');
      if (!o || o.schema !== C.schemaVersion || o.tag !== cacheTag() || !o.csv) return null;
      return o;
    } catch (e) { return null; }
  }

  /* ---------- fetching ---------- */
  function mkErr(kind, status, msg) { var e = new Error(msg || kind); e.kind = kind; e.status = status; return e; }
  function exportUrl() { return 'https://docs.google.com/spreadsheets/d/' + C.sheet.id + '/export?format=csv&gid=' + encodeURIComponent(C.sheet.gid); }
  function gvizUrl() { return 'https://docs.google.com/spreadsheets/d/' + C.sheet.id + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(C.sheet.tabName); }

  function fetchText(url) {
    var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, C.sheet.timeoutMs);
    return fetch(url, { signal: ctrl.signal, credentials: 'omit', cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw mkErr(res.status === 401 || res.status === 403 ? 'private' : 'http', res.status);
      var stale = res.headers.get('x-chaajao-cache') === '1';
      return res.text().then(function (text) {
        if (/^\s*<(!doctype|html)/i.test(text)) throw mkErr('private');   // Google login page
        return { text: text, stale: stale };
      });
    }, function (e) {
      throw e && e.kind ? e : mkErr(e && e.name === 'AbortError' ? 'timeout' : (navigator.onLine === false ? 'offline' : 'unreachable'));
    }).then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
  }
  function fetchSheet() {
    var tries = []; if (C.sheet.gid) tries.push({ url: exportUrl(), mode: 'export' }); tries.push({ url: gvizUrl(), mode: 'gviz' });
    var firstErr = null;
    return tries.reduce(function (chain, t) {
      return chain.catch(function (prev) {
        if (prev && prev.kind === 'offline') throw prev;
        if (prev && !firstErr) firstErr = prev;
        return fetchText(t.url).then(function (r) { r.mode = t.mode; return r; });
      });
    }, Promise.reject(null)).catch(function (e) { throw (firstErr && e && e.kind !== 'offline') ? firstErr : e; });
  }

  function explain(err) {
    var k = err && err.kind;
    if (k === 'offline') return { title: 'Internet nahi hai', msg: 'Phone offline hai. Internet on karke dobara try karein.' };
    if (k === 'timeout') return { title: 'Connection bohat slow hai', msg: 'Google Sheet ne ' + Math.round(C.sheet.timeoutMs / 1000) + ' second mein jawab nahi diya. Dobara try karein.' };
    if (k === 'private') return { title: 'Sheet tak access nahi mila', msg: 'Google Sheet private lagti hai. Sheet mein Share > General access > "Anyone with the link" > Viewer set karein.' };
    if (k === 'format') return { title: 'Sheet ka format badal gaya hai', msg: (err.message || '') + ' Tab ka naam ya header row check karein.' };
    if (k === 'empty') return { title: 'Sheet mein data nahi mila', msg: err.message || 'Date wali koi row nahi mili.' };
    if (k === 'http') return { title: 'Google ne error diya (' + err.status + ')', msg: 'Sheet ID, tab ka naam ya gid galat ho sakta hai. config.js check karein.' };
    return { title: 'Data nahi mila', msg: 'Google Sheet tak pohanch nahi saka. Ya to sheet private hai ya connection mein masla hai.' };
  }

  function applyData(csv, meta) {
    var model = Data.buildModel(csv, C), stats = Data.computeStats(model, C);
    S.model = model; S.stats = stats; S.mode = meta.mode; S.fetchedAt = meta.fetchedAt;
    renderAll();
    if (S.pendingDetail) { var k = S.pendingDetail; S.pendingDetail = null; route(); if (!S.detail) openSheet(k); }
  }

  function loadData() {
    if (S.loading) return Promise.resolve();
    S.loading = true; $('refresh-btn').classList.add('spin'); renderStatus();
    return fetchSheet().then(function (r) {
      applyData(r.text, { mode: r.mode, fetchedAt: r.stale ? S.fetchedAt || Date.now() : Date.now() });
      if (r.stale) { S.error = mkErr('offline'); } else { S.error = null; saveCache(r.text, r.mode); }
    }).catch(function (e) { if (e && !e.kind) console.error(e); S.error = e || mkErr('unreachable'); }).then(function () {
      S.loading = false; $('refresh-btn').classList.remove('spin'); renderStatus(); renderBanners(); renderErrorState();
    });
  }

  /* ---------- status chip + banners + error state ---------- */
  function renderStatus() {
    var dot = $('status-dot'), txt = $('status-text'), chip = $('status-chip');
    dot.className = 'dot';
    if (S.loading && !S.model) { txt.textContent = 'Load ho raha hai'; }
    else if (S.loading) { txt.textContent = 'Refresh ho raha hai'; dot.classList.add('stale'); }
    else if (S.model && !S.error) { txt.textContent = 'Updated ' + ago(S.fetchedAt); dot.classList.add('ok'); }
    else if (S.model) { txt.textContent = (S.error.kind === 'offline' ? 'Offline' : 'Purana data') + ' · ' + ago(S.fetchedAt); dot.classList.add(S.error.kind === 'offline' ? 'stale' : 'bad'); }
    else if (S.error) { txt.textContent = 'Data nahi mila'; dot.classList.add('bad'); }
    else { txt.textContent = 'Load ho raha hai'; }
    chip.setAttribute('aria-label', txt.textContent + '. Dobara load karne ke liye dabayein');
  }
  function bannerHtml(cls, icon, body, retry) {
    return '<div class="banner ' + cls + '" role="' + (cls === 'info' ? 'status' : 'alert') + '"><svg><use href="#' + icon + '"/></svg><div class="b-body">' + body +
      (retry ? '<div class="b-act"><button class="link" type="button" data-act="retry">Dobara Try Karein</button></div>' : '') + '</div></div>';
  }
  function renderBanners() {
    var out = [];
    if (navigator.onLine === false) out.push(bannerHtml('info', 'i-offline', 'Aap offline hain. ' + (S.model ? 'Aakhri saved data dikha rahe hain.' : '')));
    else if (S.error && S.model) { var x = explain(S.error); out.push(bannerHtml('', 'i-alert', '<b>' + esc(x.title) + '.</b> ' + esc(x.msg) + ' Purana data dikha rahe hain (' + ago(S.fetchedAt) + ').', true)); }
    if (S.model) {
      var m = S.model;
      if (m.missing.length) out.push(bannerHtml('', 'i-alert', '<b>Sheet mein ye column nahi mile:</b> ' + esc(m.missing.join(', ')) + '. Header ka naam badla ho sakta hai. js/config.js mein aliases update karein.'));
      if (m.badText.length) out.push(bannerHtml('', 'i-alert', '<b>' + m.badText.length + ' cell(s) mein number ki jagah text hai</b> (ignore kiye gaye): ' + esc(m.badText.slice(0, 3).join('; ')) + (m.badText.length > 3 ? '...' : '')));
      if (S.mode === 'gviz') out.push(bannerHtml('', 'i-alert', '<b>Tab ka gid set nahi.</b> Google kuch cells (College Board / Intermediate) khali bhej sakta hai. DEPLOY.md ka "gid" step karein.'));
    }
    $('banners').innerHTML = out.join('');
  }
  function renderErrorState() {
    var el = $('error-state'), show = !S.model && S.error;
    el.hidden = !show; $('hero').hidden = !!show; $('cards').hidden = !!show; $('cards-title').hidden = !!show;
    if (!show) return;
    var x = explain(S.error);
    el.innerHTML = '<div class="state-icon"><svg><use href="#' + (S.error.kind === 'offline' ? 'i-offline' : 'i-alert') + '"/></svg></div><h2>' + esc(x.title) + '</h2><p class="muted">' + esc(x.msg) + '</p><button class="btn" type="button" data-act="retry">Dobara Try Karein</button>';
  }

  /* ---------- badges / sparkline ---------- */
  function badge(delta, extra) {
    if (delta == null) return '<span class="badge none" aria-label="Pichla data nahi">&mdash;</span>';
    var cls = delta > 0 ? 'up' : delta < 0 ? 'dn' : 'flat';
    return '<span class="badge ' + cls + '">' + (delta ? '<span class="tri" aria-hidden="true"></span>' : '') + signed(delta) + (extra ? ' ' + extra : '') + '</span>';
  }
  function spark(series) {
    var pts = series.slice(-C.sparkWeeks);
    if (pts.length < 2) return '<div class="spark" aria-hidden="true"></div>';
    var vs = pts.map(function (p) { return p.v; }), mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs), rg = mx - mn || 1;
    function X(i) { return (i / (pts.length - 1)) * 100; }
    function Y(v) { return mx === mn ? 16 : 28 - ((v - mn) / rg) * 24; }
    var d = '', a = '', start = 0;
    pts.forEach(function (p, i) {
      var newSeg = i === 0 || p.src !== pts[i - 1].src;
      d += (newSeg ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(p.v).toFixed(1);
      if (newSeg) start = i;
      var last = i === pts.length - 1 || pts[i + 1].src !== p.src;
      if (last && i > start) a += 'M' + X(start).toFixed(1) + ' 32L' + d.slice(d.lastIndexOf('M') + 1).replace(/L/g, ' L') + ' L' + X(i).toFixed(1) + ' 32Z';
    });
    return '<svg class="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="' + a + '"/><path class="l" d="' + d + '"/></svg>';
  }

  /* ---------- overview ---------- */
  function renderHero() {
    var st = S.stats, el = $('hero'), lacking = C.platforms.filter(function (p) { return st.perPlat[p.key].latest == null; }).map(function (p) { return p.label; });
    el.className = 'hero'; el.removeAttribute('aria-busy');
    var deltaTxt = st.delta == null ? 'Pichla data nahi' : signed(st.delta) + ' is hafte';
    var b = st.delta == null ? '<span class="badge none">' + deltaTxt + '</span>' : badge(st.delta, 'is hafte');
    var sub = st.prevTotal != null ? 'Pichla hafta (' + fmtShort(st.previousDate) + '): ' + fmtNum(st.prevTotal) : '';
    if (lacking.length) sub += (sub ? ' &middot; ' : '') + st.platformsWithData + '/' + st.platformsTotal + ' platforms ka data (' + esc(lacking.join(', ')) + ' ka nahi)';
    el.innerHTML = '<p class="eyebrow">Total Community</p><p class="hero-num" id="hero-total">' + fmtNum(st.total) + '</p>' +
      '<div class="hero-row">' + b + '<span class="when">Data: ' + fmtDate(st.latestDate) + '</span></div>' + (sub ? '<p class="sub">' + sub + '</p>' : '');
  }
  function renderCards() {
    var st = S.stats, el = $('cards'); el.removeAttribute('aria-busy');
    el.innerHTML = C.platforms.map(function (p) {
      var pp = st.perPlat[p.key], col = S.model.columns[p.key], noCol = col.main === -1 && col.fallback === -1, v = pp.latest;
      var numHtml = v == null ? '<span class="pc-num empty">&mdash;</span>' : '<span class="pc-num">' + fmtNum(v) + '</span>';
      var note = noCol ? 'Header nahi mila' : v == null ? 'Is hafte data nahi' : (pp.delta == null ? 'Naya / pichla data nahi' : '');
      var label = p.label + ': ' + (v == null ? 'data nahi' : fmtNum(v) + ', ' + (pp.delta == null ? 'pichla data nahi' : signed(pp.delta) + ' is hafte')) + '. Tafseel ke liye dabayein';
      return '<button class="pcard" type="button" data-plat="' + p.key + '" style="--pc:' + p.color + '" aria-label="' + esc(label) + '">' +
        '<span class="pc-top"><span class="pic" aria-hidden="true"><svg><use href="#' + p.icon + '"/></svg></span><span class="pc-name">' + esc(p.label) + '</span></span>' +
        numHtml + '<span class="pc-foot">' + (v == null ? '<span class="badge none">&mdash;</span>' : badge(pp.delta)) + (note ? '<span class="pc-note">' + note + '</span>' : '') + '</span>' +
        spark(pp.series) + '</button>';
    }).join('');
  }
  function renderLinks() {
    var html = '';
    Object.keys(C.groups).forEach(function (g) {
      var items = C.platforms.filter(function (p) { return p.group === g && p.url; });
      if (!items.length) return;
      html += '<div class="lk-group"><h3>' + esc(C.groups[g]) + '</h3><div class="lk-row">' + items.map(function (p) {
        return '<a class="lk" style="--pc:' + p.color + '" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(p.label) + ' kholein (naye tab mein)" title="' + esc(p.label) + '"><svg aria-hidden="true"><use href="#' + p.icon + '"/></svg></a>';
      }).join('') + '</div></div>';
    });
    $('links').innerHTML = html;
  }

  /* ---------- charts ---------- */
  function niceStep(raw) { var p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
  function lineChart(el, pts, opt) {
    if (el._off) el._off();
    if (!pts.length) { el.innerHTML = '<p class="muted small">Is muddat ka data nahi.</p>'; return; }
    var W = Math.max(260, Math.round(el.clientWidth || 320)), H = W < 480 ? 210 : 250;
    var vs = pts.map(function (p) { return p.v; }), mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs);
    if (mn === mx) { mn -= 1; mx += 1; }
    var allPos = Math.min.apply(null, vs) >= 0, pad = (mx - mn) * 0.14; mn -= pad; mx += pad; if (allPos && mn < 0) mn = 0;
    var step = niceStep((mx - mn) / 4), ticks = [], t0 = Math.ceil(mn / step) * step, t;
    for (t = t0; t <= mx; t += step) ticks.push(t);
    var dec = step >= 1000 && step % 1000 === 0 ? 0 : step >= 100 ? 1 : 2;
    function tickFmt(v) { return Math.abs(v) >= 1000 ? (v / 1000).toFixed(dec) + 'k' : String(Math.round(v)); }
    var maxLbl = Math.max.apply(null, ticks.map(function (v) { return tickFmt(v).length; }));
    var padL = Math.round(maxLbl * 6.8 + 12), padR = 14, padT = 12, padB = 28, iw = W - padL - padR, ih = H - padT - padB;
    var tA = pts[0].t, tB = pts[pts.length - 1].t;
    function X(p) { return tB === tA ? padL + iw / 2 : padL + ((p.t - tA) / (tB - tA)) * iw; }
    function Y(v) { return padT + ih - ((v - mn) / (mx - mn)) * ih; }
    var grid = ticks.map(function (v) { var y = Y(v).toFixed(1); return '<line class="c-grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y + '" y2="' + y + '"/><text class="c-axis" x="' + (padL - 8) + '" y="' + (+y + 4) + '" text-anchor="end">' + tickFmt(v) + '</text>'; }).join('');
    var long = (tB - tA) / 86400000 > 330, nLbl = W < 360 ? 3 : W < 560 ? 4 : 6, xl = '';
    for (var i = 0; i < nLbl && pts.length > 1; i++) {
      var idx = Math.round(i * (pts.length - 1) / (nLbl - 1)), p = pts[idx];
      xl += '<text class="c-axis" x="' + X(p).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + (i === 0 ? 'start' : i === nLbl - 1 ? 'end' : 'middle') + '">' + (long ? fmtMonthYr(p.date) : fmtShort(p.date)) + '</text>';
    }
    if (pts.length === 1) xl = '<text class="c-axis" x="' + X(pts[0]).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmtShort(pts[0].date) + '</text>';
    var d = '', a = '', segStart = 0;
    pts.forEach(function (p, i) {
      var nu = i === 0 || p.seg !== pts[i - 1].seg;
      d += (nu ? 'M' : 'L') + X(p).toFixed(1) + ' ' + Y(p.v).toFixed(1) + ' ';
      if (nu) segStart = i;
      if ((i === pts.length - 1 || pts[i + 1].seg !== p.seg) && i > segStart) {
        a += 'M' + X(pts[segStart]).toFixed(1) + ' ' + (padT + ih);
        for (var j = segStart; j <= i; j++) a += 'L' + X(pts[j]).toFixed(1) + ' ' + Y(pts[j].v).toFixed(1);
        a += 'L' + X(p).toFixed(1) + ' ' + (padT + ih) + 'Z';
      }
    });
    var lastP = pts[pts.length - 1], first = pts[0];
    var aria = (opt.label || 'Chart') + ': ' + fmtDate(first.date) + ' se ' + fmtDate(lastP.date) + ' tak, ' + fmtNum(first.v) + ' se ' + fmtNum(lastP.v) + '. Left aur right arrow se points dekhein.';
    el.style.setProperty('--cc', opt.color || '');
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" tabindex="0" aria-label="' + esc(aria) + '">' + grid +
      '<path class="c-area" d="' + a + '"/><path class="c-line" d="' + d + '"/>' + xl +
      '<line class="c-guide" id="cg" y1="' + padT + '" y2="' + (padT + ih) + '" hidden/><circle class="c-dot" id="cd" r="5" hidden/>' +
      '<circle class="c-dot" cx="' + X(lastP).toFixed(1) + '" cy="' + Y(lastP.v).toFixed(1) + '" r="4.5"/>' +
      '<rect x="' + padL + '" y="0" width="' + iw + '" height="' + H + '" fill="transparent"/></svg><div class="tip" hidden></div>';
    var svg = el.querySelector('svg'), tip = el.querySelector('.tip'), g = el.querySelector('#cg'), dot = el.querySelector('#cd'), cur = -1;
    function hide() { tip.hidden = true; g.setAttribute('hidden', ''); dot.setAttribute('hidden', ''); cur = -1; }
    function show(i) {
      i = Math.max(0, Math.min(pts.length - 1, i)); cur = i;
      var p = pts[i], x = X(p), y = Y(p.v);
      g.removeAttribute('hidden'); dot.removeAttribute('hidden');
      g.setAttribute('x1', x); g.setAttribute('x2', x); dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      var dl = p.delta == null ? (p.note || 'Pichle hafte se muqabla nahi') : signed(p.delta) + ' pichle hafte se';
      tip.innerHTML = '<b>' + fmtNum(p.v) + '</b><span class="d">' + fmtDate(p.date) + '</span><br><span class="d">' + esc(dl) + '</span>';
      tip.hidden = false;
      var tw = tip.offsetWidth, left = Math.max(0, Math.min(W - tw, x - tw / 2));
      tip.style.left = left + 'px'; tip.style.top = (y < 90 ? H - padB - tip.offsetHeight - 6 : 2) + 'px';
    }
    function pick(e) {
      var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width), best = 0, bd = 1e9;
      pts.forEach(function (p, i) { var dd = Math.abs(X(p) - x); if (dd < bd) { bd = dd; best = i; } });
      show(best);
    }
    svg.addEventListener('pointerdown', pick);
    svg.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse' || e.buttons) pick(e); });
    svg.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
    svg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { show(cur < 0 ? pts.length - 1 : cur - 1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { show(cur < 0 ? pts.length - 1 : cur + 1); e.preventDefault(); }
      else if (e.key === 'Home') { show(0); e.preventDefault(); } else if (e.key === 'End') { show(pts.length - 1); e.preventDefault(); }
      else if (e.key === 'Escape') hide();
    });
    function outside(e) { if (!el.contains(e.target)) hide(); }
    document.addEventListener('pointerdown', outside);
    el._off = function () { document.removeEventListener('pointerdown', outside); };
    el._w = W;
  }
  function watchWidth(el, redraw) {
    if (!window.ResizeObserver) return null;
    var ro = new ResizeObserver(function () { if (el.isConnected && Math.abs((el.clientWidth || 0) - (el._w || 0)) > 1 && el.clientWidth > 0) redraw(); });
    ro.observe(el); return ro;
  }
  function rangeWeeks() { var r = C.chartRanges.filter(function (x) { return x.id === S.range; })[0]; return r ? r.weeks : 0; }
  function sliceLast(arr) { var w = rangeWeeks(); return w ? arr.slice(-(w + 1)) : arr; }
  function renderSeg(el) {
    el.innerHTML = C.chartRanges.map(function (r) { return '<button type="button" data-range="' + r.id + '" aria-pressed="' + (r.id === S.range) + '">' + r.label + '</button>'; }).join('');
  }
  function totalPoints() {
    var all = S.stats.totals.map(function (t, i, arr) {
      var prev = i ? arr[i - 1] : null, same = prev && prev.n === t.n;
      return { t: t.t, date: t.date, v: t.v, seg: 0, n: t.n, delta: same ? t.v - prev.v : null, note: prev && !same ? 'Platforms ki ginti badli' : '' };
    });
    return sliceLast(all);
  }
  function platformPoints(key) {
    var pp = S.stats.perPlat[key], dm = {}; pp.pairs.forEach(function (x) { dm[x.date] = x.delta; });
    var all = pp.series.map(function (s) { return { t: s.t, date: s.date, v: s.v, seg: s.src, delta: dm[s.date] == null ? null : dm[s.date], note: '' }; });
    return sliceLast(all);
  }
  function rangeGrowth() {
    var rows = sliceLast(S.model.rows); if (rows.length < 2) return null;
    var a = rows[0], b = rows[rows.length - 1], s0 = 0, s1 = 0, n = 0, avail = 0;
    C.platforms.forEach(function (p) {
      if (b.v[p.key] != null) avail++;
      if (a.v[p.key] != null && b.v[p.key] != null && a.src[p.key] === b.src[p.key]) { s0 += a.v[p.key]; s1 += b.v[p.key]; n++; }
    });
    return { delta: s1 - s0, from: a.date, to: b.date, weeks: rows.length - 1, n: n, avail: avail };
  }
  function renderGrowth() {
    if (!S.model) return;
    renderSeg($('range-seg'));
    var g = rangeGrowth(), sum = $('growth-sum');
    sum.innerHTML = g ? '<b>' + signed(g.delta) + '</b> <span class="muted">' + g.weeks + ' hafte mein (' + fmtShort(g.from) + ' se ' + fmtShort(g.to) + ')</span>' : '<span class="muted">Muqabla ke liye kam data hai.</span>';
    var pts = totalPoints(), box = $('growth-chart');
    lineChart(box, pts, { label: 'Total community growth' });
    var varying = pts.some(function (p) { return p.n !== pts[0].n; });
    $('growth-note').textContent = (varying ? 'Kuch platforms is dauran track hona shuru hue, isliye total line mein achanak uchhal aa sakta hai. ' : '') + (g && g.n < g.avail ? 'Growth sirf un ' + g.n + ' platforms ka hai jinka data dono tareekhon par maujood tha. ' : '') + 'Y-axis zero se shuru nahi hota.';
  }
  function renderCompare() {
    if (!S.model) return;
    var st = S.stats, items = C.platforms.map(function (p) { return { p: p, pp: st.perPlat[p.key] }; }).filter(function (x) { return x.pp.latest != null; })
      .sort(function (a, b) { return b.pp.latest - a.pp.latest; });
    var mx = Math.max.apply(null, items.map(function (x) { return x.pp.latest; }).concat([1]));
    $('compare').innerHTML = items.map(function (x) {
      var share = (x.pp.latest / st.total) * 100, w = Math.max(0.8, (x.pp.latest / mx) * 100);
      return '<button class="cmp-row" type="button" data-plat="' + x.p.key + '" style="--pc:' + x.p.color + '" aria-label="' + esc(x.p.label + ': ' + fmtNum(x.pp.latest) + ', total ka ' + share.toFixed(1) + ' percent. Tafseel ke liye dabayein') + '">' +
        '<span class="cmp-name">' + esc(x.p.label) + '</span><span class="cmp-track"><span class="cmp-fill" style="width:' + w.toFixed(1) + '%"></span></span>' +
        '<span class="cmp-val">' + fmtNum(x.pp.latest) + '<small>' + (share < 0.1 ? '<0.1' : share.toFixed(1)) + '%</small></span></button>';
    }).join('');
    var no = C.platforms.filter(function (p) { return st.perPlat[p.key].latest == null; }).map(function (p) { return p.label; });
    $('compare-note').textContent = no.length ? 'Is hafte data nahi: ' + no.join(', ') + '.' : '';
  }
  function renderCharts() { renderGrowth(); renderCompare(); }

  /* ---------- detail sheet ---------- */
  var sheetRO = null, lastFocus = null;
  function histRows(key) {
    var pp = S.stats.perPlat[key], out = [];
    for (var i = pp.series.length - 1; i >= 0; i--) {
      var s = pp.series[i], prev = pp.series[i - 1], d = prev && prev.src === s.src ? s.v - prev.v : null;
      out.push({ date: s.date, v: s.v, d: d });
    }
    return out;
  }
  function histTable(key, all) {
    var rows = histRows(key), shown = all ? rows : rows.slice(0, 12);
    return '<table class="hist"><caption>History (naye se purane)</caption><thead><tr><th scope="col">Tareekh</th><th scope="col">Followers</th><th scope="col">Farq</th></tr></thead><tbody>' +
      shown.map(function (r) { return '<tr><td>' + fmtDate(r.date) + '</td><td>' + fmtNum(r.v) + '</td><td class="' + (r.d > 0 ? 'up-t' : r.d < 0 ? 'dn-t' : '') + '">' + (r.d == null ? '&mdash;' : signed(r.d)) + '</td></tr>'; }).join('') + '</tbody></table>' +
      (!all && rows.length > 12 ? '<button class="btn btn-ghost btn-block" type="button" data-act="hist-all" data-key="' + key + '">Poori history dikhayen (' + rows.length + ' hafte)</button>' : '');
  }
  function detailHtml(p) {
    var pp = S.stats.perPlat[p.key], v = pp.latest, srcChange = pp.series.some(function (s, i) { return i && s.src !== pp.series[i - 1].src; });
    var avg = pp.avgWeekly == null ? '&mdash;' : (Math.abs(pp.avgWeekly) < 10 ? (pp.avgWeekly > 0 ? '+' : '') + pp.avgWeekly.toFixed(1) : signed(pp.avgWeekly));
    var top = v == null ? '<span class="d-num muted">&mdash;</span><span class="muted">Is hafte data nahi' + (pp.lastKnown ? '. Aakhri maloom: ' + fmtNum(pp.lastKnown.v) + ' (' + fmtDate(pp.lastKnown.date) + ')' : '') + '</span>'
      : '<span class="d-num">' + fmtNum(v) + '</span>' + badge(pp.delta, pp.delta == null ? '' : 'is hafte') + (pp.prevDate ? '<span class="muted small">pichla: ' + fmtDate(pp.prevDate) + '</span>' : '');
    var note = '';
    if (srcChange && p.metrics) { var sw = pp.series.filter(function (s, i) { return i && s.src !== pp.series[i - 1].src; })[0]; note = '<p class="muted small">Metric ' + fmtDate(sw.date) + ' se badla: pehle ' + p.metrics.fallback + ', ab ' + p.metrics.main + '. Line wahan se alag hai aur farq (change) us hafte ke liye nahi nikala gaya.</p>'; }
    return '<div class="d-top">' + top + '</div>' +
      '<div class="stats"><div class="stat"><div class="k">Sab se behtar hafta</div><div class="v">' + (pp.best ? signed(pp.best.delta) : '&mdash;') + '</div><div class="s">' + (pp.best ? fmtDate(pp.best.date) : 'Abhi history kam hai') + '</div></div>' +
      '<div class="stat"><div class="k">Average hafta-wari growth</div><div class="v">' + avg + '</div><div class="s">poori history</div></div>' +
      '<div class="stat"><div class="k">Tracking shuru</div><div class="v">' + (pp.firstDate ? fmtShort(pp.firstDate) : '&mdash;') + '</div><div class="s">' + (pp.firstDate ? pp.firstDate.slice(0, 4) + ' &middot; ' + pp.points + ' hafte' : '') + '</div></div></div>' +
      '<div class="panel" style="margin:0"><div class="panel-head"><h3 class="panel-title" style="font-size:15px">Growth</h3><div class="seg" id="detail-seg" role="group" aria-label="Muddat chunein"></div></div><div class="chart-box" id="detail-chart"></div></div>' + note +
      '<div id="hist-wrap">' + histTable(p.key, false) + '</div>' +
      (p.url ? '<a class="btn btn-ghost btn-block" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">Platform kholein<svg aria-hidden="true"><use href="#i-external"/></svg></a>' : '');
  }
  function drawDetailChart() {
    if (!S.detail) return;
    var p = platByKey[S.detail], box = $('detail-chart'); if (!box) return;
    renderSeg($('detail-seg'));
    lineChart(box, platformPoints(p.key), { color: p.color, label: p.label + ' growth' });
  }
  function openSheet(key) {
    var p = platByKey[key]; if (!p || !S.model) return;
    S.detail = key; lastFocus = document.activeElement;
    $('sheet').style.setProperty('--pc', p.color);
    $('sheet-icon').style.setProperty('--pc', p.color);
    $('sheet-icon').innerHTML = '<svg aria-hidden="true"><use href="#' + p.icon + '"/></svg>';
    $('sheet-title').textContent = p.label;
    $('sheet-body').innerHTML = detailHtml(p);
    $('sheet-backdrop').hidden = false; $('sheet').hidden = false; document.body.style.overflow = 'hidden';
    $('sheet-body').scrollTop = 0;
    drawDetailChart();
    if (sheetRO) sheetRO.disconnect(); sheetRO = watchWidth($('detail-chart'), drawDetailChart);
    $('sheet-close').focus();
  }
  function closeSheetUI() {
    if (!S.detail) return;
    S.detail = null; S.detailPushed = false; $('sheet').hidden = true; $('sheet-backdrop').hidden = true; document.body.style.overflow = '';
    if (sheetRO) { sheetRO.disconnect(); sheetRO = null; }
    var dc = $('detail-chart'); if (dc && dc._off) dc._off();
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
  }
  function requestCloseSheet() {
    if (!S.detail) return;
    if (S.detailPushed) { S.detailPushed = false; history.back(); } else { location.hash = viewHash(S.view); }
  }

  /* ---------- router ---------- */
  var TITLES = { overview: 'Social Media Report', charts: 'Growth Charts', video: 'Video Report' };
  var SHORT = { overview: 'Report', charts: 'Charts', video: 'Video' };
  function viewHash(v) { return v === 'overview' ? '#/' : '#/' + v; }
  function route() {
    var h = location.hash.replace(/^#\/?/, ''), plat = null, view;
    if (h.indexOf('p/') === 0) { plat = h.slice(2); view = S.view || 'overview'; } else view = TITLES[h] ? h : 'overview';
    if (view !== S.view) {
      var first = S.view === null; S.view = view;
      Object.keys(TITLES).forEach(function (v) { $('view-' + v).hidden = v !== view; });
      document.querySelectorAll('[data-route]').forEach(function (a) { if (a.dataset.route === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      $('page-title').innerHTML = '<span class="t-long">' + TITLES[view] + '</span><span class="t-short">' + SHORT[view] + '</span>'; document.title = TITLES[view] + ' - Chaajao Analytics';
      if (!first) window.scrollTo(0, 0);
      if (view === 'charts' && S.model) renderCharts();
    }
    if (plat) {
      if (!platByKey[plat]) { location.replace(viewHash(S.view)); return; }
      if (!S.model) { S.pendingDetail = plat; return; }
      if (S.detail !== plat) openSheet(plat);
    } else if (S.detail) closeSheetUI();
  }

  /* ---------- install + toast ---------- */
  function isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function dismissed() { var t = +Store.get('chaajao_install_dismissed') || 0; return Date.now() - t < C.installHintDays * 86400000; }
  function renderInstall() {
    var card = $('install-card'), side = $('install-side');
    side.hidden = true; card.hidden = true;
    if (isStandalone()) return;
    if (S.deferred) {
      side.hidden = false;
      if (!dismissed()) {
        card.hidden = false;
        card.innerHTML = '<h2>App install karein</h2><p class="muted small">Home screen par Chaajao ka icon aa jayega aur ye bina browser ke app ki tarah khulega.</p><div class="install-actions"><button class="btn" type="button" data-act="install"><svg aria-hidden="true"><use href="#i-download"/></svg>Install</button><button class="btn btn-ghost" type="button" data-act="dismiss-install">Baad mein</button></div>';
      }
    } else if (isIOS() && !dismissed()) {
      card.hidden = false;
      card.innerHTML = '<h2>iPhone par home screen mein add karein</h2><ol><li>Safari mein neeche <svg class="inline-ic" aria-hidden="true"><use href="#i-share"/></svg> <b>Share</b> button dabayein.</li><li><b>Add to Home Screen</b> chunein.</li><li>Upar <b>Add</b> dabayein.</li></ol><p class="muted small">Agar Safari nahi hai to ye link Safari mein kholein.</p><div class="install-actions"><button class="btn btn-ghost" type="button" data-act="dismiss-install">Samajh gaya</button></div>';
    }
  }
  var toastTimer = null;
  function toast(msg, action, sticky) {
    var t = $('toast'); t.textContent = msg;
    if (action) { var b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.addEventListener('click', action.fn); t.appendChild(b); }
    t.classList.add('show'); clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3500);
  }

  /* ---------- service worker (clean update flow) ---------- */
  function setupSW() {
    if (!('serviceWorker' in navigator)) return;
    var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!secure) return;
    var hadController = !!navigator.serviceWorker.controller, reloading = false;
    function offerUpdate(worker) { toast('Naya version tayyar hai.', { label: 'Update', fn: function () { worker.postMessage({ type: 'SKIP_WAITING' }); } }, true); }
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (!hadController || reloading) return; reloading = true; location.reload(); });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(function (reg) {
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
        reg.addEventListener('updatefound', function () {
          var nw = reg.installing; if (!nw) return;
          nw.addEventListener('statechange', function () { if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw); });
        });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) reg.update().catch(function () {}); });
        setInterval(function () { reg.update().catch(function () {}); }, 3600000);
      }).catch(function (e) { console.warn('Service worker register nahi hua:', e); });
    });
  }

  /* ---------- render all + events ---------- */
  function renderAll() {
    renderHero(); renderCards(); renderLinks(); renderBanners(); renderErrorState();
    renderStatus();
    if (S.view === 'charts') renderCharts(); else { renderCompare(); }
  }
  function bind() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-plat],[data-act],[data-range]'); if (!el) return;
      if (el.dataset.plat) { S.detailPushed = true; location.hash = '#/p/' + el.dataset.plat; return; }
      if (el.dataset.range) { S.range = el.dataset.range; renderGrowth(); drawDetailChart(); return; }
      var act = el.dataset.act;
      if (act === 'retry') loadData();
      else if (act === 'install' && S.deferred) { S.deferred.prompt(); S.deferred.userChoice.then(function (r) { if (r.outcome === 'accepted') toast('Install ho raha hai...'); S.deferred = null; renderInstall(); }); }
      else if (act === 'dismiss-install') { Store.set('chaajao_install_dismissed', String(Date.now())); renderInstall(); }
      else if (act === 'hist-all') { $('hist-wrap').innerHTML = histTable(el.dataset.key, true); }
    });
    $('install-side').addEventListener('click', function () { if (S.deferred) { S.deferred.prompt(); S.deferred.userChoice.then(function () { S.deferred = null; renderInstall(); }); } });
    $('refresh-btn').addEventListener('click', loadData);
    $('status-chip').addEventListener('click', loadData);
    $('sheet-close').addEventListener('click', requestCloseSheet);
    $('sheet-backdrop').addEventListener('click', requestCloseSheet);
    document.addEventListener('keydown', function (e) {
      if (!S.detail) return;
      if (e.key === 'Escape') { requestCloseSheet(); return; }
      if (e.key === 'Tab') {
        var f = Array.prototype.slice.call($('sheet').querySelectorAll('button, a[href], [tabindex="0"]')).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
        if (!f.length) return; var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      }
    });
    window.addEventListener('hashchange', route);
    window.addEventListener('online', function () { renderBanners(); loadData(); });
    window.addEventListener('offline', function () { renderBanners(); renderStatus(); });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.deferred = e; renderInstall(); });
    window.addEventListener('appinstalled', function () { S.deferred = null; renderInstall(); toast('App install ho gayi.'); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - S.fetchedAt > C.sheet.refreshMinutes * 60000) loadData(); });
    setInterval(function () { if (!document.hidden && navigator.onLine !== false && S.model) loadData(); }, C.sheet.refreshMinutes * 60000);
    setInterval(renderStatus, 30000);
    if (window.ResizeObserver) watchWidth($('growth-chart'), function () { if (S.model && S.view === 'charts') renderGrowth(); });
  }

  /* ---------- init ---------- */
  function init() {
    C.oldCacheKeys.forEach(function (k) { Store.del(k); });
    $('ver').textContent = 'v' + C.version;
    document.querySelectorAll('[data-route]').forEach(function (a) { a.addEventListener('click', function () { S.detailPushed = false; }); });
    bind(); renderInstall(); renderLinks(); route(); setupSW(); renderStatus();
    var cached = readCache();
    if (cached) { try { applyData(cached.csv, { mode: cached.mode, fetchedAt: cached.savedAt }); route(); } catch (e) { Store.del(C.cache.key); } }
    loadData();
  }
  if (!Data) { document.body.innerHTML = '<p style="padding:20px">js/data.js load nahi hua. Files dobara upload karein.</p>'; return; }
  init();
})();
