/* ─────────────────────────────────────────────────────────────
   SETTLEMENTS — SHARED UI (one look for Dashboard · Rentals · Casa Castel)
   settlements-ui.js  (loaded right after settlements-app.js)

   · NK labels       always "NK dd.mm.yyyy–dd.mm.yyyy" (never a slash, never "NK 2025")
   · money colours   money that comes to you = green · money that goes out = red · nothing yet = beige
   · building blocks progress ring · money tile · "Needs you" card · section title · unit circle
   · summary sheet   the detail sheet behind a Tenants / Hausgeld tile
   · stConfirm()     the in-app confirm sheet (replaces every iPhone pop-up)
   · deep links      settlements.html#tab=casa&y=2025&t=<tenant>  ·  #tab=rentals&y=2026&p=<property>&t=<tenant>
   ───────────────────────────────────────────────────────────── */

'use strict';

/* ── Dates + labels ───────────────────────────────────────── */
const stDe = iso => { const s = String(iso || '').slice(0, 10); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; };
const stPer = (from, to) => stDe(from) + '–' + stDe(to);
const stNkLabel = (from, to) => 'NK ' + stPer(from, to);

/* ── Unit circles: soft pastel pairs, the same list as the Casa Castel rooms ── */
const ST_AV = [['#E8D5B5', '#6B4A1E'], ['#D6E3D0', '#3E5A30'], ['#E3D6E6', '#5E3F66'], ['#D3DEE8', '#2F4A63'],
               ['#F0D9D2', '#7A3B2A'], ['#F3E3C3', '#7A5A12'], ['#D4E6E1', '#2C5A50'], ['#E2E0D8', '#5A574E']];
const stAv = i => ST_AV[((i % ST_AV.length) + ST_AV.length) % ST_AV.length];
/* Short name of an apartment for its circle: "Kaiserstr. WHG 507" → 507 · "Campo Novo" → CNV · "Kostheim" → KOS */
function stAbbr(name) {
  const s = String(name || '').trim();
  const num = s.match(/(?:WHG|Whg\.?|Nr\.?)\s*(\d{1,4})\b/i);
  if (num) return num[1];
  const parts = s.replace(/[0-9]/g, ' ').split(/[\s\-.]+/).filter(w => /[A-Za-zÄÖÜäöüß]/.test(w));
  if (parts.length >= 3) return parts.slice(0, 3).map(w => w[0]).join('').toUpperCase();   // Kaiser-W-R 17 → KWR
  if (parts.length === 2) return (parts[0][0] + parts[1].slice(0, 2)).toUpperCase();         // Campo Novo → CNO
  return ((parts[0] || s).slice(0, 3).toUpperCase()) || '?';
}

/* ── Building blocks ──────────────────────────────────────── */
function stRing(done, sent, total, word, size) {
  size = size || 84;
  const r = size * 34 / 84, sw = size * 9 / 84, c = size / 2, C = 2 * Math.PI * r;
  const a1 = total ? C * (done + sent) / total : 0, a2 = total ? C * done / total : 0;
  return '<svg class="sc-ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
    '<circle cx="' + c + '" cy="' + c + '" r="' + r.toFixed(1) + '" fill="none" stroke="#EDE8E0" stroke-width="' + sw.toFixed(1) + '"/>' +
    '<circle cx="' + c + '" cy="' + c + '" r="' + r.toFixed(1) + '" fill="none" stroke="#D4B896" stroke-width="' + sw.toFixed(1) + '" stroke-linecap="round" transform="rotate(-90 ' + c + ' ' + c + ')" stroke-dasharray="' + a1.toFixed(1) + ' ' + C.toFixed(1) + '"/>' +
    '<circle cx="' + c + '" cy="' + c + '" r="' + r.toFixed(1) + '" fill="none" stroke="#97C459" stroke-width="' + sw.toFixed(1) + '" stroke-linecap="round" transform="rotate(-90 ' + c + ' ' + c + ')" stroke-dasharray="' + a2.toFixed(1) + ' ' + C.toFixed(1) + '"/>' +
    '<text x="' + c + '" y="' + (word ? c - 2 : c + 6) + '" text-anchor="middle" class="sc-ring__n"' + (size < 70 ? ' style="font-size:19px"' : '') + '>' + done + '/' + total + '</text>' +
    (word ? '<text x="' + c + '" y="' + (c + 13) + '" text-anchor="middle" class="sc-ring__s">' + word + '</text>' : '') + '</svg>';
}
/* Progress card: ring + one line for what the tab waits for + to send · waiting for money · settled */
function stProgress(o) {
  return '<div class="sc-card sc-prog">' + stRing(o.done, o.sent, o.total, 'settled') + '<div class="sc-prog__l">' +
    '<span><i class="sc-dot" style="background:#B8956A"></i>' + o.first + '</span>' +
    '<span><i class="sc-dot" style="background:#E9B06A"></i>' + o.open + ' to send</span>' +
    '<span><i class="sc-dot" style="background:#D4B896"></i>' + o.sent + ' waiting for money</span>' +
    '<span><i class="sc-dot" style="background:#97C459"></i>' + o.done + ' settled</span></div></div>';
}
/* One net amount per tile: > 0 money comes to you (green) · < 0 you pay (red) · null nothing yet (beige) */
function stTile(label, icon, net, sub, act) {
  const k = net === null || net === undefined ? 'nil' : net > 0.004 ? 'in' : net < -0.004 ? 'out' : 'nil';
  const dir = net === null || net === undefined ? 'nothing yet' : k === 'in' ? 'you get' : k === 'out' ? 'you pay' : 'balanced';
  const val = net === null || net === undefined ? '—' : stEur(cxR(Math.abs(net)));
  return '<button class="st-tile st-tile--' + k + '"' + (act ? ' ' + act : '') + '>' +
    '<span class="st-tile__l"><i class="ti ti-' + icon + '" aria-hidden="true"></i>' + label + '<i class="ti ti-chevron-right st-tile__c" aria-hidden="true"></i></span>' +
    '<span class="st-tile__d">' + dir + '</span><b>' + val + '</b><small>' + stEsc(sub || '') + '</small></button>';
}
const stSec = (t, n) => '<div class="sc-sec">' + stEsc(t) + (n !== undefined && n !== null ? ' <span>' + n + '</span>' : '') + '</div>';
/* "Needs you": items { tone: red|gold|calm, icon, t, s, btn (html) | act (data attributes → whole row taps) } */
function stNeeds(items, emptyText) {
  if (!items.length) return emptyText ? '<div class="sc-card sc-done"><i class="ti ti-circle-check" aria-hidden="true"></i><div><b>Nothing needs you</b><span>' + stEsc(emptyText) + '</span></div></div>' : '';
  return stSec('Needs you', items.length) + '<div class="sc-card st-need">' + items.map(x => {
    const inner = '<span class="st-need__i is-' + (x.tone || 'gold') + '"><i class="ti ti-' + x.icon + '" aria-hidden="true"></i></span>' +
      '<span class="st-need__t"><b>' + stEsc(x.t) + '</b><span>' + stEsc(x.s || '') + '</span></span>';
    return x.act ? '<button class="st-need__r" ' + x.act + '>' + inner + '<i class="ti ti-chevron-right sc-chev" aria-hidden="true"></i></button>'
                 : '<div class="st-need__r">' + inner + (x.btn || '') + '</div>';
  }).join('') + '</div>';
}
/* Money word for one result: dir > 0 = money comes to you */
function stMoneySay(dir, amount, name) {
  if (!dir || !amount) return ['', 'balanced'];
  return dir > 0 ? ['pos', (name ? name + ' pays you ' : 'pays you ') + stEur(cxR(amount))] : ['neg', (name ? name + ' gets ' : 'gets ') + stEur(cxR(amount)) + ' back'];
}

/* ── Summary sheet (behind a tile) ────────────────────────── */
/* o = { title, sub, net, sub2, groups: [{ title, rows: [{ av, ab, name, sub, amount, dir, chip, set (→ settle line) }] }] } */
function stSumSheet(o, closeAttr) {
  const k = o.net === null || o.net === undefined ? 'nil' : o.net > 0.004 ? 'in' : o.net < -0.004 ? 'out' : 'nil';
  const hero = '<div class="st-hero st-hero--' + k + '"><span>' + (k === 'in' ? 'you get' : k === 'out' ? 'you pay' : o.net === null ? 'nothing yet' : 'balanced') + '</span>' +
    '<b>' + (o.net === null || o.net === undefined ? '—' : stEur(cxR(Math.abs(o.net)))) + '</b><small>' + stEsc(o.sub2 || '') + '</small></div>';
  const groups = o.groups.filter(g => g.rows.length).map(g => {
    const tot = g.rows.reduce((a, r) => a + (r.amount ? (r.dir || 0) * r.amount : 0), 0);
    const gk = tot > 0.004 ? 'pos' : tot < -0.004 ? 'neg' : '';
    return '<div class="srm__card st-sg"><div class="srm__ch"><p class="srm__ct">' + stEsc(g.title) + '</p>' +
      (g.rows.some(r => r.amount) ? '<span class="srm__cs ' + gk + '">' + stEur(cxR(Math.abs(tot))) + '</span>' : '<span class="srm__cs">' + g.rows.length + '</span>') + '</div>' +
      g.rows.map(r => r.set ? stSetRow(r.set) : '<' + (r.act ? 'button ' + r.act : 'div') + ' class="st-sg__r"><span class="sc-av sc-av--s" style="background:' + r.av[0] + ';color:' + r.av[1] + '">' + stEsc(r.ab) + '</span>' +
        '<span class="st-sg__m"><span class="st-sg__n">' + stEsc(r.name) + '</span><span class="st-sg__s">' + stEsc(r.sub || '') + '</span></span>' +
        (r.amount ? '<span class="st-sg__a ' + (r.dir > 0 ? 'pos' : 'neg') + '">' + stEur(cxR(r.amount)) + '</span>' : r.chip ? '<span class="sc-chip sc-chip--' + r.chip[0] + '">' + stEsc(r.chip[1]) + '</span>' : '') +
        '</' + (r.act ? 'button' : 'div') + '>').join('') + '</div>';
  }).join('');
  return '<div class="srm__h"><div class="srm__ht"><p class="srm__t">' + stEsc(o.title) + '</p><p class="srm__s">' + stEsc(o.sub || '') + '</p></div>' +
    '<button class="srm__x" ' + closeAttr + ' aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>' +
    '<div class="srm__b"><div class="srm__one">' + hero + (groups || '<p class="cx-empty">Nothing yet.</p>') + '</div></div>';
}

/* ── Settle right in the sheet ─────────────────────────────── */
/* The Soll once (green = money comes to you · red = money goes out), what really happened, Settled.
   You always type the plain amount; the direction comes from the result. 0 € = nothing moved, still done.
   o = { key, ns ('sr'|'sc'), attrs (data attributes naming the line), av, ab, name, sub, dir, soll, party ('tenant'|'WEG'|<company>),
         state ('open'|'edit'|'settled'|'locked'|'booked'), ist, date, note, lockText, openAttr } */
function stSetNote(o) {
  if (o.note) return o.note;
  const inn = o.dir > 0, ten = o.party === 'tenant', d = o.date ? ' · ' + stDe(o.date) : '';
  if (o.state === 'locked') return o.lockText || 'Send the NK letter first';
  if (o.state === 'open') return ten ? (inn ? '0 € means you let it go' : '0 € means you keep it') : '0 € if it was offset with the Hausgeld';
  if (o.state === 'edit') return 'Change the amount, then tap Settled';
  if (o.state === 'booked') return 'Booked in Controlling' + d;
  const ist = cxR(o.ist || 0), soll = cxR(o.soll), diff = cxR(soll - ist);
  if (Math.abs(diff) < 0.005) return (inn ? 'Received in full' : ten ? 'Paid back in full' : 'Paid in full') + d;
  if (ist < 0.005) return (ten ? (inn ? 'Let go ' + stEur(soll) + ' · not received' : 'Kept ' + stEur(soll) + ' · not paid back') : 'Nothing moved · offset with the Hausgeld') + d;
  if (diff > 0) return (ten ? (inn ? 'Received ' + stEur(ist) + ' · let go ' + stEur(diff) : 'Paid back ' + stEur(ist) + ' · kept ' + stEur(diff))
                            : (inn ? 'Received ' : 'Paid ') + stEur(ist) + ' · ' + stEur(diff) + ' less than the Soll') + d;
  return (inn ? 'Received ' : ten ? 'Paid back ' : 'Paid ') + stEur(ist) + ' · ' + stEur(-diff) + ' more than the Soll' + d;
}
function stSetRow(o) {
  const inn = o.dir > 0, ten = o.party === 'tenant';
  const word = ten ? (inn ? 'Nachzahlung from tenant' : 'Guthaben to tenant') : (inn ? 'Guthaben from ' : 'Nachzahlung to ') + o.party;
  const lab = inn ? 'Actually received' : ten ? 'Actually paid back' : 'Actually paid';
  const id = 'stSet_' + String(o.key).replace(/[^A-Za-z0-9_-]/g, '_');
  const act = a => 'data-' + o.ns + '="' + a + '" ' + o.attrs;
  const edit = o.state === 'open' || o.state === 'edit', done = o.state === 'settled' || o.state === 'booked';
  const val = done || o.state === 'edit' ? cxE2(cxR(o.ist || 0)) : '';
  const field = '<label class="st-f" for="' + id + '"><span class="st-f__l">' + lab + '</span><span class="st-amt"><input class="st-in" id="' + id + '" inputmode="decimal" autocomplete="off" value="' + stEsc(val) + '"' +
    (edit ? ' data-stset="' + stEsc(o.key) + '"' : o.state === 'locked' ? ' disabled' : ' readonly') + '/><span>€</span></span></label>';
  const btn = edit ? '<button type="button" class="cx-btn cx-btn--p st-set__btn" ' + act('setOk') + '>Settled</button>'
    : o.state === 'locked' ? '<button type="button" class="cx-btn cx-btn--s st-set__btn" ' + (o.openAttr || '') + '>Open</button>'
    : '<span class="st-set__done"><i class="ti ti-check" aria-hidden="true"></i>' + (o.state === 'booked' ? 'Booked' : 'Settled') + '</span>';
  const kept = o.state === 'settled' && !o.note && cxR(o.ist || 0) < cxR(o.soll) - 0.004;
  const links = o.state === 'settled' ? '<span class="st-set__a"><button type="button" class="cx-link" ' + act('setEdit') + '>edit</button><button type="button" class="cx-link" ' + act('setUndo') + '>undo</button></span>'
    : o.state === 'edit' ? '<span class="st-set__a"><button type="button" class="cx-link" ' + act('setCancel') + '>cancel</button></span>' : '';
  const who = '<span class="st-sg__n">' + stEsc(o.name) + '</span><span class="st-sg__s">' + stEsc(o.sub || '') + '</span>';
  return '<div class="st-set">' +
    '<div class="st-set__top"><span class="sc-av sc-av--s" style="background:' + o.av[0] + ';color:' + o.av[1] + '">' + stEsc(o.ab) + '</span>' +
      (o.openAttr ? '<button type="button" class="st-sg__m st-set__who" ' + o.openAttr + '>' + who + '</button>' : '<span class="st-sg__m">' + who + '</span>') + '</div>' +
    '<div class="st-set__soll ' + (inn ? 'pos' : 'neg') + '"><span>Soll · ' + stEsc(word) + '</span><b>' + stEur(cxR(o.soll)) + '</b></div>' +
    '<div class="st-set__f">' + field + btn + '</div>' +
    '<p class="st-set__note' + (kept ? ' is-kept' : '') + '"><span>' + stEsc(stSetNote(o)) + '</span>' + links + '</p></div>';
}
/* The typed amount of the line a button belongs to */
const stSetVal = b => { const r = b && b.closest('.st-set'), i = r && r.querySelector('input[data-stset]'); return i ? i.value : null; };
/* Enter in the amount = Settled */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.closest) return;
  const inp = e.target.closest('input[data-stset]'); if (!inp) return;
  e.preventDefault();
  const b = inp.closest('.st-set').querySelector('.st-set__btn'); if (b) b.click();
});

/* ── In-app confirm sheet (replaces confirm() / alert()) ──── */
/* stConfirm({ title, text, ok, danger }) → Promise<boolean> */
function stConfirm(o) {
  o = typeof o === 'string' ? { title: o } : (o || {});
  return new Promise(resolve => {
    const old = document.getElementById('stConfirm'); if (old) old.remove();
    const h = document.createElement('div'); h.id = 'stConfirm'; h.className = 'stc';
    h.innerHTML = '<div class="stc__bg" data-v="0"></div><div class="stc__s" role="alertdialog" aria-modal="true" aria-labelledby="stcT">' +
      '<p class="stc__t" id="stcT">' + stEsc(o.title || 'Are you sure?') + '</p>' +
      (o.text ? '<p class="stc__x">' + stEsc(o.text).replace(/\n/g, '<br>') + '</p>' : '') +
      '<div class="stc__b"><button class="cx-btn ' + (o.danger ? 'stc__d' : 'cx-btn--p') + '" data-v="1">' + stEsc(o.ok || 'OK') + '</button>' +
      (o.cancel === false ? '' : '<button class="cx-btn cx-btn--s" data-v="0">' + stEsc(o.cancel || 'Cancel') + '</button>') + '</div></div>';
    document.body.appendChild(h);
    const done = v => { document.removeEventListener('keydown', key, true); h.remove(); resolve(v); };
    const key = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); done(false); } };
    document.addEventListener('keydown', key, true);
    h.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { e.stopPropagation(); done(b.dataset.v === '1'); } });
    setTimeout(() => { const b = h.querySelector('[data-v="1"]'); if (b) b.focus(); }, 0);
  });
}
/* A message that needs no answer (was alert()) */
function stNotice(msg) { stSay(msg); }

/* ── Deep links ───────────────────────────────────────────── */
/* #tab=casa&y=2025&t=12 · #tab=rentals&y=2026&p=4&t=31 — opened from the tenant cards ("Open NK-Abrechnung") */
function stReadLink() {
  const h = String(location.hash || '').replace(/^#/, ''); if (!h) return null;
  const q = {}; h.split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
  if (!['casa', 'rentals', 'dashboard'].includes(q.tab)) return null;
  return q;
}
function stOpenLink(q) {
  if (!q) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  const y = Number(q.y) || null;
  if (q.tab === 'casa') {
    if (y) SC.year = y;
    stSwitchTab('casa');
    if (!q.t) return;
    let n = 0;
    const tryOpen = () => {
      const M = SC.model;
      if (M && Number(M.y) === Number(SC.year)) {
        const t = M.ten.find(x => String(x.tenantId) === String(q.t));
        if (t) { SC.modal = { view: 'ten', key: t.key }; scRenderModal(); }
        return;
      }
      if (n++ < 40) setTimeout(tryOpen, 150);
    };
    tryOpen();
    return;
  }
  if (q.tab === 'rentals') {
    if (y) SR.year = y;
    stSwitchTab('rentals');
    if (!q.p) return;
    let n = 0;
    const tryOpen = () => {
      const c = Object.values(typeof _srCards !== 'undefined' ? _srCards : {}).find(x => String(x.p.id) === String(q.p));
      if (c) {
        const it = q.t ? c.items.find(i => String(i.r.tenant_id) === String(q.t)) : null;
        if (it) _srOpen({ ck: c.ck, view: 'tenant', tid: String(it.r.id), from: 'tracker' });
        else _srOpen({ ck: c.ck, view: 'hv', from: 'tracker' });
        return;
      }
      if (n++ < 40) setTimeout(tryOpen, 150);
    };
    tryOpen();
    return;
  }
  stSwitchTab('dashboard');
}
