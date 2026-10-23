/* Run:  node tests/parser.test.js path/to/export.csv
   CSV = Google Sheet ke "Weekly Engagment" tab ka export (File > Download > CSV). */
const fs = require('fs');
const CONFIG = require('../js/config.js');
const D = require('../js/data.js');
let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}

/* ---- unit cases ---- */
eq('NBSP+comma " 1,084" -> 1084', D.parseNumber('\u00a01,084'), 1084);
eq('NBSP " 841" -> 841', D.parseNumber('\u00a0841'), 841);
eq('"-" -> null', D.parseNumber('-'), null);
eq('" " -> null', D.parseNumber(' '), null);
eq('"" -> null', D.parseNumber(''), null);
eq('"-126" -> -126', D.parseNumber('-126'), -126);
eq('"abc" -> NaN (warning)', Number.isNaN(D.parseNumber('abc')), true);
eq('date 19-Oct-2026', D.parseDate('19-Oct-2026', 'dmy').iso, '2026-10-19');
eq('date Total -> null', D.parseDate('Total', 'dmy'), null);
eq('date gviz Date(2026,9,19)', D.parseDate('Date(2026,9,19)', 'dmy').iso, '2026-10-19');
eq('norm header w/ line break', D.norm('Facebook\n(Likes)'), 'facebooklikes');
eq('CSV: quotes + newline in header', D.parseCSV('a,"b\nc","d""e"\n1,2,3\r\n')[0], ['a', 'b\nc', 'd"e']);

/* ---- full sheet ---- */
const file = process.argv[2];
if (!file) { console.log('\n(CSV path nahi diya - sirf unit cases chale)'); process.exit(fail ? 1 : 0); }
const m = D.buildModel(fs.readFileSync(file, 'utf8'), CONFIG);
const s = D.computeStats(m, CONFIG);
const L = ['linkedin','youtube','facebook','instagram','tiktok','wa_main','wa_mdcat','wa_ecat','wa_bcat','wa_cb','wa_inter'];
const latestWant = [2235,24266,49415,10500,13500,2967,12774,1560,628,212,477];
const prevWant   = [2218,24174,49165,10418,13458,2954,12900,1550,634,209,479];
const deltaWant  = [17,92,250,82,42,13,-126,10,-6,3,-2];
eq('latest date', s.latestDate, '2026-10-19');
eq('previous date', s.previousDate, '2026-10-12');
eq('latest values (11)', L.map(k => s.perPlat[k].latest), latestWant);
eq('previous values (11)', L.map(k => s.perPlat[k].prev), prevWant);
eq('weekly deltas (11)', L.map(k => s.perPlat[k].delta), deltaWant);
eq('total 118534', s.total, 118534);
eq('prev total 118159', s.prevTotal, 118159);
eq('delta +375', s.delta, 375);
eq('Total row skipped (no row dated "Total")', m.rows.every(r => /^\d{4}-\d\d-\d\d$/.test(r.date)), true);
eq('first date', m.rows[0].date, '2024-09-01');
eq('row count (weeks)', m.rows.length, 103);
eq('no missing headers', m.missing, []);
eq('no unparseable text', m.badText, []);
eq('MDCAT 2026-01-06 = 1084 (NBSP row)', m.rows.find(r => r.date === '2026-01-06').v.wa_mdcat, 1084);
eq('"-" cells are null not 0 (ECAT before start)', m.rows[0].v.wa_ecat, null);
eq('Facebook old date uses Likes (fallback)', [m.rows[0].v.facebook, m.rows[0].src.facebook], [15824, 'fallback']);
eq('Facebook new date uses Follows (main)', [m.rows[m.rows.length - 1].v.facebook, m.rows[m.rows.length - 1].src.facebook], [49415, 'main']);
eq('Facebook never double-counted (one value per week)', m.rows.every(r => typeof r.v.facebook === 'number' || r.v.facebook === null), true);
eq('College Board numeric rows = 11', m.rows.filter(r => r.v.wa_cb != null).length, 11);
eq('College Board starts 2026-08-10', s.perPlat.wa_cb.firstDate, '2026-08-10');
const fbSwitch = s.perPlat.facebook.pairs.some(p => p.date === '2025-03-29');
eq('No delta across Likes->Follows switch', fbSwitch, false);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
