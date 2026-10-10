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
/* ── One-level modals (Oct 2026): amount on top · switches with dates · details below ─────────
   Own duotone icon set in the app's colours (no emoji) · the same frame in Rentals and Casa Castel */
/* Wohnungsnummer in an address line: shown as stored ("WHG 03", "WHG 0.71");
   only a bare number (old style, e.g. "3") gets "Whg." in front. */
function stWhg(v) { const s = String(v || '').trim(); return !s ? '' : /^\d/.test(s) ? 'Whg. ' + s : s; }
const ST_ICONS = {
  bld: '<rect x="5" y="3.5" width="14" height="17" rx="2" fill="#BFD0E0"/><path d="M5 20.5h14M8.5 7.5h2M13.5 7.5h2M8.5 11h2M13.5 11h2M8.5 14.5h2M13.5 14.5h2M10.5 20.5v-3h3v3" fill="none" stroke="#2F5470" stroke-width="1.5" stroke-linecap="round"/><rect x="5" y="3.5" width="14" height="17" rx="2" fill="none" stroke="#2F5470" stroke-width="1.5"/>',
  inbox: '<path d="M4 13l2.5-7.5h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="#D7CCEA"/><path d="M4 13l2.5-7.5h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 13h4.5l1 2h5l1-2H20" fill="none" stroke="#5B4A7A" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 3.5v6M9.5 7l2.5 2.5L14.5 7" fill="none" stroke="#5B4A7A" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  coins: '<ellipse cx="10" cy="7" rx="6" ry="2.6" fill="#C9DDB0"/><path d="M4 7v4c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6V7" fill="#C9DDB0"/><path d="M4 7c0 1.4 2.7 2.6 6 2.6S16 8.4 16 7s-2.7-2.6-6-2.6S4 5.6 4 7zm0 0v4c0 1.4 2.7 2.6 6 2.6M16 7v2.4" fill="none" stroke="#46682A" stroke-width="1.5"/><ellipse cx="15" cy="15" rx="5" ry="2.2" fill="#E8C98F"/><path d="M10 15c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2-2.2-2.2-5-2.2-5 1-5 2.2zm0 0v3c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2v-3" fill="none" stroke="#7A5A22" stroke-width="1.5"/>',
  mail: '<rect x="3.5" y="6" width="17" height="12.5" rx="2.2" fill="#F1D9A8"/><rect x="3.5" y="6" width="17" height="12.5" rx="2.2" fill="none" stroke="#7A5A22" stroke-width="1.5"/><path d="M4.5 7.5l7.5 5.5 7.5-5.5" fill="none" stroke="#7A5A22" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  doc: '<path d="M6.5 3.5h7.5l4 4v12a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19.5v-14.5a1.5 1.5 0 0 1 1.5-1.5z" fill="#F1D9A8"/><path d="M6.5 3.5h7.5l4 4v12a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19.5v-14.5a1.5 1.5 0 0 1 1.5-1.5zM14 3.5v4h4M8.5 12h7M8.5 15.5h5" fill="none" stroke="#7A5A22" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  bank: '<path d="M3.5 9L12 4l8.5 5z" fill="#BFD0E0"/><path d="M3.5 9L12 4l8.5 5zM5.5 9.5v7M10 9.5v7M14 9.5v7M18.5 9.5v7M3.5 19.5h17" fill="none" stroke="#2F5470" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  house: '<path d="M5 10.5L12 4.5l7 6v8.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19z" fill="#C9DDB0"/><path d="M3.5 11.5L12 4.5l8.5 7M5.5 10v9a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-9M10 20.5v-5h4v5" fill="none" stroke="#46682A" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  safe: '<rect x="4" y="4.5" width="16" height="15" rx="2.5" fill="#D7CCEA"/><rect x="4" y="4.5" width="16" height="15" rx="2.5" fill="none" stroke="#5B4A7A" stroke-width="1.5"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#5B4A7A" stroke-width="1.5"/><path d="M12 8.8v1.2M12 14v1.2M8.8 12H10M14 12h1.2" stroke="#5B4A7A" stroke-width="1.5" stroke-linecap="round"/>',
  receipt: '<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" fill="#F1D9A8"/><path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3zM9 8h6M9 11.5h6M9 15h3.5" fill="none" stroke="#7A5A22" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  calc: '<rect x="5" y="3.5" width="14" height="17" rx="2.5" fill="#BFD0E0"/><rect x="5" y="3.5" width="14" height="17" rx="2.5" fill="none" stroke="#2F5470" stroke-width="1.5"/><rect x="8" y="6.5" width="8" height="3.5" rx="1" fill="none" stroke="#2F5470" stroke-width="1.5"/><path d="M8.5 13.5h.01M12 13.5h.01M15.5 13.5h.01M8.5 17h.01M12 17h.01M15.5 17h.01" stroke="#2F5470" stroke-width="2.2" stroke-linecap="round"/>',
  lock: '<rect x="5" y="10" width="14" height="10.5" rx="2.5" fill="#E8C98F"/><rect x="5" y="10" width="14" height="10.5" rx="2.5" fill="none" stroke="#7A5A22" stroke-width="1.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10M12 14v2.5" fill="none" stroke="#7A5A22" stroke-width="1.5" stroke-linecap="round"/>',
  bolt: '<path d="M13 3L5.5 13.5H11L10 21l7.5-10.5H12z" fill="#F1D9A8"/><path d="M13 3L5.5 13.5H11L10 21l7.5-10.5H12z" fill="none" stroke="#7A5A22" stroke-width="1.5" stroke-linejoin="round"/>',
  seal: '<path d="M12 2.5l2.1 1.6 2.6-.3 1 2.4 2.4 1-.3 2.6L21.5 12l-1.6 2.1.3 2.6-2.4 1-1 2.4-2.6-.3L12 21.5l-2.1-1.6-2.6.3-1-2.4-2.4-1 .3-2.6L2.5 12l1.6-2.1-.3-2.6 2.4-1 1-2.4 2.6.3z" fill="#9DBF7A"/><path d="M8.3 12.2l2.5 2.5 5-5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};
const ST_TINT = { bld: '#E6EEF6', inbox: '#EFEAF6', coins: '#EAF3E0', mail: '#FAF0DC', doc: '#F8EDD6', bank: '#E6EEF6', house: '#EAF3E0', safe: '#EFEAF6', receipt: '#FAF0DC', calc: '#E6EEF6', lock: '#FAF0DC', bolt: '#FAF0DC' };
const stIc = (k, size) => '<svg class="mx-svg" viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) + '" aria-hidden="true">' + (ST_ICONS[k] || '') + '</svg>';
/* Header: tile (icon or initials) · title · sub · close */
function stMHead(title, sub, tile, closeAttr) {
  const t = tile && tile.ini ? '<span class="mx-tile" style="background:' + (tile.bg || '#F3EEE6') + ';color:' + (tile.fg || '#8A6535') + '"><span class="mx-ini">' + stEsc(tile.ini) + '</span></span>'
    : '<span class="mx-tile" style="background:' + (ST_TINT[tile] || '#F3EEE6') + '">' + stIc(tile, 26) + '</span>';
  return '<div class="mx-hd">' + t + '<div class="mx-hd__m"><p class="mx-t">' + stEsc(title) + '</p><p class="mx-s">' + stEsc(sub || '') + '</p></div>' +
    '<button class="mx-x" ' + closeAttr + ' aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>';
}
/* The amount card: tone get (money to you) · pay (you pay) · zero · none */
function stMHero(o) {
  const v = o.amount === null || o.amount === undefined ? '\u2014' : stEur(cxR(Math.abs(o.amount)));
  return '<div class="mx-hero mx-hero--' + (o.tone || 'none') + '">' +
    '<svg class="mx-orn" viewBox="0 0 120 120" aria-hidden="true"><circle cx="70" cy="50" r="40" fill="none" stroke="#fff" stroke-width="10" opacity=".6"/><circle cx="70" cy="50" r="22" fill="#fff" opacity=".35"/></svg>' +
    '<svg class="mx-orn2" viewBox="0 0 100 100" aria-hidden="true"><circle cx="40" cy="60" r="34" fill="#fff" opacity=".45"/></svg>' +
    '<p class="mx-hl">' + stEsc(o.label || '') + '</p><p class="mx-hv">' + v + '</p>' + (o.sub ? '<p class="mx-hs">' + stEsc(o.sub) + '</p>' : '') +
    (o.extra || '') + (o.settled ? '<span class="mx-done">' + stIc('seal', 22) + 'All settled</span>' : '') + '</div>';
}
/* A switch row: icon · title · sub · (right) · switch (attrs = the action) */
function stMRow(o) {
  const sw = o.switchAttrs === undefined ? '' : '<button type="button" class="mx-tg' + (o.on ? ' is-on' : '') + '" role="switch" aria-checked="' + !!o.on + '" aria-label="' + stEsc(o.title) + '" ' + o.switchAttrs + (o.disabled ? ' disabled' : '') + '></button>';
  return '<div class="mx-row' + (o.on ? ' is-on' : '') + (o.disabled ? ' is-off' : '') + '"><span class="mx-ic" style="background:' + (ST_TINT[o.icon] || '#F3EEE6') + '">' + stIc(o.icon, 24) + '</span>' +
    '<div class="mx-row__m"><p class="mx-rt">' + stEsc(o.title) + '</p>' + (o.sub ? '<p class="mx-rs">' + o.sub + '</p>' : '') + '</div>' + (o.right || '') + sw + '</div>' + (o.below || '');
}
/* A details card below the switches */
function stMCard(title, icon, inner) {
  return '<p class="mx-lbl">' + (icon ? stIc(icon, 16) : '') + stEsc(title) + '</p><div class="mx-det">' + inner + '</div>';
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
    const tot = g.rows.reduce((a, r) => a + (r.amount && !r.dim ? (r.dir || 0) * r.amount : 0), 0);   // faded rows (not counted) stay out
    const gk = tot > 0.004 ? 'pos' : tot < -0.004 ? 'neg' : '';
    return '<div class="srm__card st-sg"><div class="srm__ch"><p class="srm__ct">' + stEsc(g.title) + '</p>' +
      (g.rows.some(r => r.amount) ? '<span class="srm__cs ' + gk + '">' + stEur(cxR(Math.abs(tot))) + '</span>' : '<span class="srm__cs">' + g.rows.length + '</span>') + '</div>' +
      g.rows.map(r => r.set ? stSetRow(r.set) : '<' + (r.act ? 'button ' + r.act : 'div') + ' class="st-sg__r' + (r.dim ? ' is-dim' : '') + '"><span class="sc-av sc-av--s" style="background:' + r.av[0] + ';color:' + r.av[1] + '">' + stEsc(r.ab) + '</span>' +
        '<span class="st-sg__m"><span class="st-sg__n">' + stEsc(r.name) + '</span><span class="st-sg__s">' + stEsc(r.sub || '') + '</span></span>' +
        (r.amount ? '<span class="st-sg__a ' + (r.dir > 0 ? 'pos' : 'neg') + '">' + stEur(cxR(r.amount)) + '</span>' : r.chip ? '<span class="sc-chip sc-chip--' + r.chip[0] + '">' + stEsc(r.chip[1]) + '</span>' : '') + (r.extra || '') +
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
