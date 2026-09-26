/* ─────────────────────────────────────────────────────────────
   CONTROLLING — SHARED UI
   controlling-ui.js

   One set of building blocks for every tab, so Dashboard, Einnahmen,
   Ausgaben, Einmalig and Setup look and behave identically:
     · month selector (same place on every tab, "Stand" date)
     · pills (one colour = one meaning, everywhere)
     · Soll │ → │ Ist row
     · summary card, property card with fold-up
     · money formatting / parsing (German)
   ───────────────────────────────────────────────────────────── */

'use strict';

/* ── Design system styles (injected once, so the look is right even if an
      older controlling.html is still being served) ── */
const _CX_CSS = `
    /* ════════ Controlling design system (cx) ════════
       Inter everywhere (wordmark excepted) · brown / beige tones, no black ·
       one pill colour = one meaning · 34 px fields, 13 px text.            */
    :root { --cx-ink:#4A3726; --cx-amt:#5C3D1E; --cx-mut:#A89A86; --cx-sub:#BBA98F; --cx-acc:#8A6535;
            --cx-neg:#A0533A; --cx-line:#EFE9E0; --cx-rule:#E6DED2; --cx-card:#FDFCFA; --cx-bg:#F5F2ED; }
    body.is-landlord { color:var(--cx-ink); }
    #appTabs .cc-tab { color:var(--cx-mut); }
    #appTabs .cc-tab.active { color:var(--cx-ink); border-bottom-color:var(--cx-acc) !important; }
    #appTabs .cc-tab.active::after { background:var(--cx-acc) !important; }
    .cx-page { max-width:560px; margin:0 auto; padding:16px 16px 48px; display:flex; flex-direction:column; gap:8px;
               font-family:'Inter',system-ui,sans-serif; color:var(--cx-ink); }
    .cx-lbl { font-size:9px; font-weight:500; letter-spacing:.14em; text-transform:uppercase; color:var(--cx-mut); }
    .cx-head { display:flex; justify-content:space-between; padding:6px 4px 0; }
    .cx-row-sb { display:flex; justify-content:space-between; align-items:center; gap:8px; }
    .cx-card { background:var(--cx-card); border:.5px solid var(--cx-rule); border-radius:12px; overflow:hidden; }
    .cx-title { font-size:18px; font-weight:600; color:var(--cx-ink); }
    .cx-title__s { font-size:11px; color:var(--cx-mut); margin:-4px 0 4px; }
    .cx-empty { padding:14px; font-size:12px; color:var(--cx-mut); text-align:center; }
    /* month selector */
    .cx-month { display:flex; justify-content:space-between; align-items:center; padding:2px 0 4px; }
    .cx-month__t { text-align:center; }
    .cx-month__m { font-size:16px; font-weight:600; color:var(--cx-ink); }
    .cx-month__s { font-size:10px; color:var(--cx-mut); margin-top:1px; }
    .cx-arw { width:32px; height:32px; border-radius:50%; border:.5px solid var(--cx-rule); background:transparent; color:var(--cx-mut);
              display:flex; align-items:center; justify-content:center; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    /* pills */
    .cx-pill { display:inline-block; font-size:9px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; padding:2px 7px;
               border-radius:20px; border:.5px solid; white-space:nowrap; line-height:1.5; }
    .cx-pill--open  { background:#FAEEDA; color:#7A4A12; border-color:#E9B06A; }
    .cx-pill--ok    { background:#EEF0DD; color:#55622A; border-color:#B9C28A; }
    .cx-pill--diff  { background:#F7E4DC; color:#8A3B22; border-color:#D9957C; }
    .cx-pill--grey  { background:#EFE9E0; color:var(--cx-mut); border-color:var(--cx-rule); }
    .cx-pill--beige { background:#F3EADC; color:var(--cx-acc); border-color:#D4B896; }
    /* buttons */
    .cx-btn { height:36px; padding:0 16px; border-radius:8px; font-family:inherit; font-size:11px; font-weight:500; letter-spacing:.07em;
              text-transform:uppercase; display:inline-flex; align-items:center; justify-content:center; gap:6px; cursor:pointer;
              border:.5px solid transparent; -webkit-tap-highlight-color:transparent; }
    .cx-btn--p { background:var(--cx-amt); color:#FBF6EE; border-color:var(--cx-amt); }
    .cx-btn--s { background:transparent; color:var(--cx-acc); border-color:#D4B896; }
    .cx-btn--full { width:100%; }
    .cx-btn:disabled { opacity:.4; cursor:default; }
    .cx-link { background:none; border:none; font-family:inherit; font-size:11px; color:var(--cx-acc); padding:8px 4px; text-align:left; cursor:pointer; }
    /* summary + hero */
    .cx-sum { padding:14px; }
    .cx-sum__v { display:flex; align-items:baseline; gap:6px; margin-top:6px; font-variant-numeric:tabular-nums; }
    .cx-sum__big { font-size:24px; font-weight:600; color:var(--cx-amt); }
    .cx-sum__of { font-size:12px; color:var(--cx-mut); }
    .cx-bar { height:10px; border-radius:5px; background:#E3D5BF; overflow:hidden; }
    .cx-bar > div { height:100%; background:var(--cx-acc); border-radius:5px 0 0 5px; transition:width .25s; }
    .cx-bar > div.over { background:var(--cx-neg); border-radius:5px; }
    .cx-bar--thin { height:6px; margin:8px 0 12px; background:var(--cx-line); }
    .cx-hero { padding:16px; }
    .cx-hero__v { font-size:40px; font-weight:500; letter-spacing:-.02em; text-align:center; margin-top:6px; color:var(--cx-amt);
                  font-variant-numeric:tabular-nums; white-space:nowrap; }
    .cx-hero__v.neg { color:var(--cx-neg); }
    .cx-hero__c { font-size:11px; color:var(--cx-mut); text-align:center; margin:4px 0 14px; }
    .cx-io { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:10px; }
    .cx-io__v { font-size:16px; font-weight:600; color:var(--cx-amt); margin-top:2px; font-variant-numeric:tabular-nums; }
    .cx-sw { display:inline-block; width:7px; height:7px; border-radius:2px; margin-right:5px; }
    .cx-sw--in { background:#E3D5BF; border:.5px solid #D4B896; } .cx-sw--out { background:var(--cx-acc); }
    .cx-stat { display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%; margin-top:14px; padding:12px 0 0;
               border:none; border-top:.5px solid var(--cx-line); background:none; font-family:inherit; font-size:12px; text-align:left; }
    button.cx-stat { cursor:pointer; }
    .cx-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:8px; vertical-align:0; }
    .cx-stat--open { color:#7A4A12; } .cx-stat--open .cx-dot { background:#E9B06A; }
    .cx-stat--ok { color:#55622A; }   .cx-stat--ok .cx-dot { background:#B9C28A; }
    .cx-stat--muted { color:var(--cx-mut); } .cx-stat--muted .cx-dot { background:var(--cx-rule); }
    .cx-stat__go { font-size:11px; font-weight:500; letter-spacing:.06em; text-transform:uppercase; }
    /* property card */
    .cx-ph { width:100%; display:flex; justify-content:space-between; align-items:center; gap:8px; padding:11px 14px; background:none; border:none;
             font-family:inherit; text-align:left; cursor:pointer; color:inherit; -webkit-tap-highlight-color:transparent; }
    .cx-ph__l { display:flex; flex-direction:column; min-width:0; }
    .cx-ph__r { display:flex; align-items:center; gap:6px; flex-shrink:0; }
    .cx-ph__sum { font-size:12px; color:#8A7B68; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .cx-pn { font-size:14px; font-weight:600; color:var(--cx-ink); line-height:1.3; }
    .cx-pn--s { font-size:13px; }
    .cx-src { font-size:10.5px; color:var(--cx-mut); margin-top:1px; }
    .cx-chev { color:var(--cx-sub); font-size:14px; }
    .cx-cf { font-size:15px; font-weight:600; color:var(--cx-acc); white-space:nowrap; font-variant-numeric:tabular-nums; }
    .cx-cf.neg { color:var(--cx-neg); }
    .cx-det { padding:0 14px 10px; }
    .cx-kv { display:flex; justify-content:space-between; gap:10px; font-size:12px; padding:5px 0; border-top:.5px solid var(--cx-line); font-variant-numeric:tabular-nums; }
    .cx-kv span:first-child { color:var(--cx-mut); } .cx-kv--sub span { font-size:11px; color:var(--cx-sub) !important; }
    .cx-kv--open { color:#7A4A12; }
    .cx-year { padding:14px 16px; display:flex; justify-content:space-between; align-items:baseline; }
    .cx-year__v { font-size:18px; font-weight:600; color:var(--cx-amt); font-variant-numeric:tabular-nums; }
    .cx-year__v.neg { color:var(--cx-neg); }
    /* Soll │ → │ Ist row */
    .cx-r { display:grid; grid-template-columns:minmax(0,1fr) 30px 104px; gap:8px; align-items:center; padding:8px 14px; border-top:.5px solid var(--cx-line); }
    .cx-r__l { min-width:0; }
    .cx-r__u { font-size:11px; color:var(--cx-mut); }
    .cx-r__s { font-size:14px; font-weight:600; color:var(--cx-amt); font-variant-numeric:tabular-nums; margin-top:1px; }
    .cx-r__sub { font-size:10px; color:var(--cx-sub); margin-top:1px; }
    .cx-from { color:#C9B89D; }
    .cx-r__note { font-size:10px; color:var(--cx-acc); margin-top:2px; }
    .cx-r__p { grid-column:1/-1; display:flex; justify-content:flex-end; margin-top:-2px; }
    .cx-take { width:30px; height:30px; border-radius:50%; border:.5px solid #D4B896; background:#F5EFE6; color:var(--cx-acc); padding:0;
               display:flex; align-items:center; justify-content:center; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    .cx-take.on { background:#EEF0DD; border-color:#B9C28A; color:#55622A; }
    .cx-take:disabled { opacity:.3; cursor:default; }
    .cx-f { display:flex; align-items:center; height:34px; box-sizing:border-box; padding:0 8px; border-radius:6px; border:1px solid var(--cx-rule); background:var(--cx-card); min-width:0; }
    .cx-f:focus-within { border-color:#B8956A; }
    html .cx-f input, html .cx-f select { flex:1; min-width:0; width:100%; height:100%; border:none !important; outline:none; background:transparent !important;
               padding:0 !important; margin:0; box-shadow:none !important; font-family:'Inter',system-ui,sans-serif; font-size:13px !important;
               font-weight:400; color:var(--cx-ink); text-align:right; font-variant-numeric:tabular-nums; -webkit-appearance:none; appearance:none; }
    html .cx-f--l input, html .cx-f--l select { text-align:left; }
    html .cx-f input::placeholder { color:#D6CBBB; }
    html .cx-f input.cc-cal { padding-right:24px !important; background-position:right 0 center !important; background-size:15px 15px !important; }
    .cx-f > span { font-size:11px; color:var(--cx-mut); margin-left:4px; }
    .cx-f > i { color:var(--cx-mut); font-size:13px; margin-left:4px; pointer-events:none; }
    .cx-f--s { width:120px; flex-shrink:0; }
    .cx-f--off { opacity:.6; }
    .cx-nd { display:flex; align-items:center; gap:8px; padding:9px 14px; border-top:.5px solid var(--cx-line); font-size:10.5px; color:var(--cx-mut); }
    /* Einmalig */
    .cx-form { display:flex; flex-direction:column; gap:8px; margin-top:12px; padding-top:12px; border-top:.5px solid var(--cx-line); }
    .cx-grid2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .cx-chips { display:flex; flex-wrap:wrap; gap:6px; }
    .cx-chip { height:30px; padding:0 12px; border-radius:15px; border:.5px solid var(--cx-rule); background:transparent; font-family:inherit;
               font-size:12px; color:var(--cx-mut); cursor:pointer; }
    .cx-chip.on { background:var(--cx-amt); border-color:var(--cx-amt); color:#FBF6EE; }
    .cx-seg { display:flex; border:.5px solid var(--cx-rule); border-radius:8px; overflow:hidden; height:34px; }
    .cx-seg button { flex:1; border:none; background:transparent; font-family:inherit; font-size:12px; color:var(--cx-mut); cursor:pointer; }
    .cx-seg button.on { background:var(--cx-amt); color:#FBF6EE; }
    .cx-sug { display:grid; grid-template-columns:minmax(0,1fr) auto 30px; gap:8px; align-items:center; padding:10px 14px; }
    .cx-it { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; padding:11px 14px; }
    .cx-it__l { min-width:0; } .cx-it__t { font-size:13px; font-weight:500; color:var(--cx-ink); }
    .cx-it__p { margin-top:5px; }
    .cx-it__r { display:flex; align-items:center; gap:8px; flex-shrink:0; }
    .cx-amt { font-size:14px; font-weight:600; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .cx-amt.pos { color:var(--cx-acc); } .cx-amt.neg { color:var(--cx-neg); }
    .cx-del { width:30px; height:30px; border-radius:50%; border:.5px solid var(--cx-rule); background:transparent; color:var(--cx-mut); cursor:pointer;
              display:flex; align-items:center; justify-content:center; padding:0; }
    /* Setup */
    .cx-set { padding:0 14px 12px; display:flex; flex-direction:column; gap:6px; }
    .cx-set__row { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:4px; }
    .cx-set__k { font-size:11px; color:var(--cx-mut); }
    .cx-set__sub { font-size:9px; font-weight:500; letter-spacing:.14em; text-transform:uppercase; color:var(--cx-mut); margin-top:10px; padding-top:10px; border-top:.5px solid var(--cx-line); }
    .cx-mchips { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:3px; }
    .cx-mchip { height:28px; border-radius:6px; border:.5px solid var(--cx-rule); background:transparent; font-family:inherit; font-size:11px; color:var(--cx-mut); cursor:pointer; padding:0; }
    .cx-mchip.on { background:#F3EADC; border-color:#D4B896; color:var(--cx-acc); font-weight:600; }
    .cx-cat { padding:12px 14px; border-top:.5px solid var(--cx-line); display:flex; flex-direction:column; gap:6px; }
    .cx-cat:first-child { border-top:none; }
`;
(function () {
  if (typeof document === 'undefined' || document.getElementById('cx-styles')) return;
  const s = document.createElement('style');
  s.id = 'cx-styles';
  s.textContent = _CX_CSS;
  (document.head || document.documentElement).appendChild(s);
})();

const CX = {
  month: (() => {
    try { const v = Number(localStorage.getItem('cx_month')); if (v >= 1 && v <= 12) return v; } catch (e) {}
    return new Date().getMonth() + 1;
  })(),
  open: {},            // fold state per card key
  tab: 'dashboard',
};

const CX_MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

/* ── Money ── */
const cxR    = v => Math.round((Number(v) || 0) * 100) / 100;
const cxE2   = v => cxR(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cxEur  = v => cxE2(v) + '\u202f€';
const cxW    = v => { const n = Math.round(Number(v) || 0); return (n < 0 ? '\u2212\u202f' : '') + Math.abs(n).toLocaleString('de-DE') + '\u202f€'; };
const cxWS   = v => { const n = Math.round(Number(v) || 0); return (n < 0 ? '\u2212\u202f' : n > 0 ? '+\u202f' : '') + Math.abs(n).toLocaleString('de-DE') + '\u202f€'; };
const cxEsc  = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function cxParse(s) {
  if (typeof ccParseEUR === 'function') { const n = ccParseEUR(s); return (n === null || n === undefined || isNaN(n)) ? null : n; }
  s = String(s ?? '').replace(/[€\s\u202f]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) ? n : null;
}
function cxToday() {
  if (typeof ccTodayISO === 'function') return ccTodayISO();
  const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const cxFmtDate = iso => { const s = String(iso || '').slice(0, 10); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; };

/* ── Pills: one colour = one meaning ── */
const cxPill = (cls, text) => '<span class="cx-pill cx-pill--' + cls + '">' + cxEsc(text) + '</span>';
function cxStatus(soll, ist, emptyText) {
  if (!soll && (ist === null || ist === undefined)) return ['grey', emptyText || 'leer'];
  if (ist === null || ist === undefined) return ['open', 'offen'];
  const d = cxR(ist - soll);
  if (!d) return ['ok', 'bezahlt'];
  return ['diff', (d < 0 ? '\u2212 ' : '+ ') + cxEur(Math.abs(d)) + (d < 0 ? ' weniger' : ' mehr')];
}
function cxGroupStatus(rows) {
  const act = rows.filter(r => r.soll || (r.ist !== null && r.ist !== undefined));
  const open = act.filter(r => r.ist === null || r.ist === undefined).length;
  const diff = act.some(r => r.ist !== null && r.ist !== undefined && cxR(r.ist - r.soll) !== 0);
  if (diff) return ['diff', 'Abweichung'];
  if (open) return ['open', open + ' offen'];
  return act.length ? ['ok', 'erfasst'] : ['grey', 'leer'];
}

/* ── Month selector (same on every tab) ── */
function cxMonthBar() {
  const today = cxFmtDate(cxToday());
  return '<div class="cx-month">' +
    '<button class="cx-arw" data-cx="prev" aria-label="Vorheriger Monat"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<div class="cx-month__t"><div class="cx-month__m">' + CX_MONTHS[CX.month - 1] + ' ' + window._ctrl.year + '</div>' +
    '<div class="cx-month__s">Stand ' + today + '</div></div>' +
    '<button class="cx-arw" data-cx="next" aria-label="Nächster Monat"><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
}
async function cxStepMonth(delta) {
  let m = CX.month + delta, y = window._ctrl.year;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  CX.month = m; CX.open = {};
  try { localStorage.setItem('cx_month', String(m)); } catch (e) {}
  if (y !== window._ctrl.year) {
    if (typeof ctlShowLoading === 'function') ctlShowLoading(true);
    try { await ctlLoadAll(y); } catch (e) { cxToastErr(e); }
    if (typeof ctlShowLoading === 'function') ctlShowLoading(false);
  }
  cxRenderActive();
}
function cxRenderActive() {
  const f = { dashboard: 'renderDashboard', income: 'renderIncome', expenses: 'renderExpenses', onetime: 'renderOneTime', setup: 'renderSetup' }[CX.tab];
  if (f && typeof window[f] === 'function') window[f]();
}
function cxGoto(tab) { if (typeof switchTab === 'function') switchTab(tab); }

/* ── Summary card (Einnahmen / Ausgaben) ── */
function cxSummary(o) {
  const pct = o.plan ? Math.min(100, o.done / o.plan * 100) : 0;
  return '<div class="cx-card cx-sum">' +
    '<div class="cx-row-sb"><span class="cx-lbl">' + cxEsc(o.label) + '</span>' + (o.open ? cxPill('open', o.open + ' offen') : cxPill('ok', 'alles erfasst')) + '</div>' +
    '<div class="cx-sum__v"><span class="cx-sum__big">' + cxW(o.done) + '</span><span class="cx-sum__of">von ' + cxW(o.plan) + ' geplant</span></div>' +
    '<div class="cx-bar cx-bar--thin"><div style="width:' + pct + '%"></div></div>' +
    '<button class="cx-btn cx-btn--p cx-btn--full" data-cx="all"' + (o.open ? '' : ' disabled') + '><i class="ti ti-checks" aria-hidden="true"></i>Alle offenen wie geplant</button>' +
  '</div>';
}

/* ── Property card with fold-up ── */
function cxCard(o) {
  const g = o.status;
  const isOpen = CX.open[o.key] !== undefined ? CX.open[o.key] : (g[0] === 'open' || g[0] === 'diff');   // only what needs you
  return '<div class="cx-card">' +
    '<button class="cx-ph" data-cx="fold" data-k="' + cxEsc(o.key) + '" aria-expanded="' + isOpen + '">' +
      '<span class="cx-ph__l"><span class="cx-pn">' + cxEsc(o.title) + '</span><span class="cx-src">' + cxEsc(o.sub || '') + '</span></span>' +
      '<span class="cx-ph__r">' + (o.extraPill || '') + (o.sum !== undefined ? '<span class="cx-ph__sum">' + cxW(o.sum) + '</span>' : '') +
        cxPill(g[0], g[1]) + '<i class="ti ti-chevron-' + (isOpen ? 'up' : 'down') + ' cx-chev" aria-hidden="true"></i></span>' +
    '</button>' + (isOpen ? o.body : '') + '</div>';
}

/* ── Soll │ → │ Ist row ── */
function cxRow(o) {
  const s = cxStatus(o.soll, o.ist, o.emptyText);
  const can = !!o.soll || (o.ist !== null && o.ist !== undefined);
  const took = o.ist !== null && o.ist !== undefined && o.soll && cxR(o.ist - o.soll) === 0;
  return '<div class="cx-r">' +
    '<div class="cx-r__l"><div class="cx-r__u">' + cxEsc(o.label) + (o.badge ? ' ' + cxPill('beige', o.badge) : '') + '</div>' +
      '<div class="cx-r__s">' + (o.soll ? cxEur(o.soll) : '\u2014') + '</div>' +
      (o.sub ? '<div class="cx-r__sub">' + o.sub + '</div>' : '') +
      (o.notes || []).map(n => '<div class="cx-r__note"><i class="ti ti-arrow-up-right" aria-hidden="true"></i> ' + cxEsc(n) + '</div>').join('') +
    '</div>' +
    '<button class="cx-take' + (took ? ' on' : '') + '" data-cx="take" data-id="' + cxEsc(o.id) + '" aria-label="Soll übernehmen"' + (o.soll ? '' : ' disabled') + '><i class="ti ti-arrow-right" aria-hidden="true"></i></button>' +
    '<label class="cx-f' + (can || o.allowEmpty ? '' : ' cx-f--off') + '"><input type="text" inputmode="decimal" data-cx-in="' + cxEsc(o.id) + '" value="' + (o.ist === null || o.ist === undefined ? '' : cxE2(o.ist)) + '" placeholder="' + (o.soll || o.allowEmpty ? 'Betrag' : '\u2014') + '"' + (o.soll || o.allowEmpty || can ? '' : ' disabled') + ' aria-label="Ist-Betrag ' + cxEsc(o.label) + '"><span>€</span></label>' +
    '<div class="cx-r__p">' + cxPill(s[0], s[1]) + '</div>' +
  '</div>';
}
function cxNotDue(list) {
  if (!list || !list.length) return '';
  return '<div class="cx-nd">' + cxPill('grey', 'nicht fällig') + '<span>' + list.map(n => cxEsc(n.label) + (n.next ? ' · nächste im ' + n.next : '')).join(' · ') + '</span></div>';
}

/* ── Toasts ── */
function cxToastErr(e) {
  console.error('[controlling]', e);
  if (typeof ctlToast === 'function') ctlToast('Speichern fehlgeschlagen – bitte erneut versuchen');
}

/* ── Wire a tab host once: month arrows, fold, take-over, inputs ── */
function cxWire(host, h) {
  if (host._cxWired) return;
  host._cxWired = true;
  host.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-cx]');
    if (!b || b.disabled) return;
    const a = b.dataset.cx;
    if (a === 'prev') return cxStepMonth(-1);
    if (a === 'next') return cxStepMonth(1);
    if (a === 'fold') { const k = b.dataset.k; const cur = b.getAttribute('aria-expanded') === 'true'; CX.open[k] = !cur; return h.render(); }
    if (h.click) return h.click(a, b, ev);
  });
  host.addEventListener('change', ev => {
    const id = ev.target && ev.target.dataset && ev.target.dataset.cxIn;
    if (id && h.input) h.input(id, cxParse(ev.target.value), ev.target);
  });
  host.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target && ev.target.dataset && ev.target.dataset.cxIn) ev.target.blur();
  });
}
