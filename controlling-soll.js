/* ─────────────────────────────────────────────────────────────
   CONTROLLING — SOLL ENGINE
   controlling-soll.js

   Planned amounts ("Soll") are never typed in Controlling. They are
   read from the app where they already live (same database):

     Rent per unit   Rentals  rnt_tenant_records · rentals_pricing ·
                              rentals_parking_pricing ·
                              rnt_staffelmiete_history ·
                              rnt_nk_vorauszahlung_history
                     Casa     tenant_records · rooms ·
                              nk_vorauszahlung_history
     Hausgeld,       Rentals  rentals_verwaltung (hausgeld_mtl,
     Grundsteuer              grundsteuer_mtl per quarter) ·
                              rentals_hausgeld_history
     Kreditrate      Properties  properties (rate, zinsen, tilgung)
     Casa costs      Controlling ctrl_castel_categories
                              (default_amount, frequency, due_months)
     NK settlements  Rentals rnt_nk_entries · Casa nk_entries
     Fallback        Controlling plan values (def_*) when unlinked

   Rules
     · Links: a saved link wins; otherwise matched by name.
     · Rent: day by day for the tenant active that day, averaged over
       the month (move-in / move-out / change mid-month = to the day).
       Kalt  = Staffel step (on/after move-in) › tenant card › price
       NK    = NK history (on/after move-in)  › tenant card › price
       No tenant → "leer" (Soll 0).
     · Costs: value valid on the 1st of the month; Grundsteuer only in
       its months; Casa costs by frequency / due months.
   ───────────────────────────────────────────────────────────── */

'use strict';

window._src = {
  loaded: false,
  apts: [], pricing: [], verw: [], hgHist: [], parking: [], pkPricing: [],
  rntTen: [], staffel: [], rntNkV: [], rntNk: [],
  rooms: [], casaTen: [], casaNkV: [], casaNk: [],
  loans: [],
};

const _CX_SRC = [
  ['apts', 'rentals_apartments'], ['pricing', 'rentals_pricing'], ['verw', 'rentals_verwaltung'],
  ['hgHist', 'rentals_hausgeld_history'], ['parking', 'rentals_parking'], ['pkPricing', 'rentals_parking_pricing'],
  ['rntTen', 'rnt_tenant_records'], ['staffel', 'rnt_staffelmiete_history'], ['rntNkV', 'rnt_nk_vorauszahlung_history'],
  ['rntNk', 'rnt_nk_entries'], ['rooms', 'rooms'], ['casaTen', 'tenant_records'],
  ['casaNkV', 'nk_vorauszahlung_history'], ['casaNk', 'nk_entries'], ['loans', 'properties'],
];

/* Load every source once. A missing table never blocks Controlling —
   that part simply falls back to the plan values. */
async function ctlSollLoad() {
  const res = await Promise.all(_CX_SRC.map(([, t]) =>
    _ctlSupa.from(t).select('*').then(r => r, e => ({ data: null, error: e }))));
  _CX_SRC.forEach(([k, t], i) => {
    if (res[i].error) console.warn('[controlling] source ' + t + ':', res[i].error.message || res[i].error);
    window._src[k] = res[i].data || [];
  });
  window._src.loaded = true;
}

/* ── small helpers ── */
const _cxNum  = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
const _cxN0   = v => _cxNum(v) ?? 0;
const _cxR    = v => Math.round((Number(v) || 0) * 100) / 100;
const _cxNorm = s => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
const _cxIso  = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
/* Any date the apps store → 'YYYY-MM-DD' (ISO, German TT.MM.JJJJ, timestamps).
   Plain text comparison of '25.04.2025' with '2026-09-01' was the New York bug. */
const _cxD = v => {
  if (!v) return '';
  if (typeof ccParseDate === 'function') { const r = ccParseDate(v); if (r) return r; }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
  const d = new Date(s);
  return isNaN(d) ? '' : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const _cxFmtD = iso => { const s = _cxD(iso); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; };
const _cxEurS = v => { const n = Number(v) || 0, whole = Math.abs(n - Math.round(n)) < 0.005;
  return n.toLocaleString('de-DE', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }) + '\u202f€'; };   // 330 € · 359,10 €
const _cxIsParking = u => /garage|stellplatz|\btg\b/i.test(String(u.unit_type || '') + ' ' + String(u.name || ''));

/* ── Links ─────────────────────────────────────────────────── */
function ctlPropLinks(p) {
  const S = window._src;
  let apt = null, aptAuto = false, loan = null, loanAuto = false;
  if (p.rentals_apartment_ref) apt = S.apts.find(a => String(a.id) === String(p.rentals_apartment_ref)) || null;
  else if (p.id !== CASA_PROP_ID) { apt = S.apts.find(a => _cxNorm(a.name) === _cxNorm(p.name)) || null; aptAuto = !!apt; }
  if (p.loan_ref) loan = S.loans.find(l => String(l.id) === String(p.loan_ref)) || null;
  else { loan = S.loans.find(l => _cxNorm(l.name) === _cxNorm(p.name)) || null; loanAuto = !!loan; }
  return { apt, aptAuto, loan, loanAuto };
}

function ctlUnitLink(u, p) {
  const S = window._src;
  if (u.source_type && u.source_ref) {
    const ref = String(u.source_ref);
    if (u.source_type === 'rentals_apartment') { const o = S.apts.find(a => String(a.id) === ref);     return o ? { type: u.source_type, ref, obj: o, auto: false } : null; }
    if (u.source_type === 'rentals_parking')   { const o = S.parking.find(a => String(a.id) === ref);  return o ? { type: u.source_type, ref, obj: o, auto: false } : null; }
    if (u.source_type === 'casa_room')         { const o = S.rooms.find(r => r.name === ref);          return o ? { type: u.source_type, ref, obj: o, auto: false } : null; }
    return null;
  }
  if (!p) return null;
  if (p.id === CASA_PROP_ID) {
    const r = S.rooms.find(r => _cxNorm(r.name) === _cxNorm(u.name));
    return r ? { type: 'casa_room', ref: r.name, obj: r, auto: true } : null;
  }
  if (_cxIsParking(u)) {
    const pk = S.parking.find(x => _cxNorm(x.name) === _cxNorm(u.name));
    return pk ? { type: 'rentals_parking', ref: String(pk.id), obj: pk, auto: true } : null;
  }
  const pl = ctlPropLinks(p);
  if (!pl.apt) return null;
  const living = ctlUnitsOf(p.id).filter(x => !_cxIsParking(x));
  return living.length === 1 ? { type: 'rentals_apartment', ref: String(pl.apt.id), obj: pl.apt, auto: true } : null;
}

/* Units of a property + Casa Castel rooms that have no unit yet (e.g. Berlin).
   A virtual unit gets its database row on the first save.                */
function ctlUnitsFor(pid) {
  const units = ctlUnitsOf(pid).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (pid !== CASA_PROP_ID) return units;
  const p = ctlProp(pid);
  const taken = new Set(units.map(u => { const l = ctlUnitLink(u, p); return l && l.type === 'casa_room' ? l.ref : null; }).filter(Boolean));
  const extra = (window._src.rooms || [])
    .filter(r => r.active !== false && !taken.has(r.name))
    .map(r => ({ id: null, virtual: true, property_id: pid, name: r.name, unit_type: 'Zimmer', source_type: 'casa_room', source_ref: r.name }));
  return units.concat(extra);
}

/* ── Rent Soll per unit and month ─────────────────────────── */
function _cxTenantsFor(link) {
  const S = window._src;
  let list = [];
  if (link.type === 'rentals_apartment') list = S.rntTen.filter(t => String(t.apartment_id) === link.ref);
  else if (link.type === 'rentals_parking') list = S.rntTen.filter(t => String(t.parking_id) === link.ref);
  else if (link.type === 'casa_room') list = S.casaTen.filter(t => _cxNorm(t.room) === _cxNorm(link.ref));   // "New york" = "New York"
  return list.filter(t => t.mietbeginn || t.status === 'active')
    .sort((a, b) => _cxD(b.mietbeginn).localeCompare(_cxD(a.mietbeginn)));
}
/* The Auszug date wins: no rent after it, even if the status is still "active"
   (the data check asks to set the tenant to former). */
const _cxActiveOn = (t, iso) => (!t.mietbeginn || _cxD(t.mietbeginn) <= iso) && (!t.mietende || _cxD(t.mietende) >= iso);

function _cxRoomPricing(room, t) {
  if (!room) return { k: null, nk: null };
  const hasMv = !!(room.kaltmiete || room.mietvertrag_miete), hasKz = !!room.kurzzeit_kaltmiete;
  let type = t && t.contract_type === 'kurzzeit' ? 'kurzzeit' : (t && t.contract_type === 'mietvertrag' ? 'mietvertrag' : null);
  if (!type) type = room.active_price_type === 'kurzzeit' && hasKz ? 'kurzzeit' : (hasMv ? 'mietvertrag' : (hasKz ? 'kurzzeit' : null));
  if (type === 'kurzzeit' && hasKz) return { k: _cxNum(room.kurzzeit_kaltmiete), nk: _cxNum(room.kurzzeit_nk) };
  if (room.kaltmiete) return { k: _cxNum(room.kaltmiete), nk: _cxNum(room.nk_pauschale) };
  if (room.mietvertrag_miete) { const nk = _cxN0(room.nk_pauschale); return { k: _cxN0(room.mietvertrag_miete) - nk, nk }; }
  return { k: null, nk: null };
}

function _cxBase(link, t) {
  const S = window._src;
  if (link.type === 'rentals_apartment') {
    const pr = S.pricing.find(x => String(x.apartment_id) === link.ref) || {};
    return { k: _cxNum(t.kaltmiete) ?? _cxN0(pr.kaltmiete), nk: _cxNum(t.nebenkosten) ?? _cxN0(pr.nk_pauschale) };
  }
  if (link.type === 'rentals_parking') {
    const pr = S.pkPricing.find(x => String(x.parking_id) === link.ref) || {};
    return { k: _cxNum(t.kaltmiete) ?? _cxN0(pr.miete), nk: _cxNum(t.nebenkosten) ?? 0 };
  }
  const rp = _cxRoomPricing(link.obj, t);
  return { k: _cxNum(t.kaltmiete) ?? _cxN0(rp.k), nk: _cxNum(t.nebenkosten) ?? _cxN0(rp.nk) };
}

function _cxHist(link, kind) {
  const S = window._src;
  if (kind === 'staffel') {
    const col = link.type === 'rentals_parking' ? 'parking_id' : 'apartment_id';
    return link.type === 'casa_room' ? [] : S.staffel.filter(h => String(h[col]) === link.ref);
  }
  if (link.type === 'rentals_apartment') return S.rntNkV.filter(h => String(h.apartment_id) === link.ref);
  if (link.type === 'casa_room') return S.casaNkV.filter(h => h.room === link.ref);
  return [];
}
function _cxStepAt(hist, t, iso) {
  const from = _cxD(t.mietbeginn);
  let best = null;
  for (const h of hist) {
    const d = _cxD(h.effective_date);
    if (d && d <= iso && d >= from && (!best || d > _cxD(best.effective_date))) best = h;
  }
  return best ? _cxNum(best.amount) : null;
}

const _cxUnitCache = new Map();
function ctlSollReset() { _cxUnitCache.clear(); }

/* → { k, nk, soll, empty, link, notes:[..], badge, partial, src } */
/* The rent a tenant agreed, in this order:
     1 stored on the tenant (fixed at move-in, or edited by hand)
     2 learned from what you entered in Controlling during their tenancy (other months)
     3 today's room / apartment price — flagged if the tenant is no longer there   */
function _cxLearned(u, t, y, m) {
  if (u.id == null) return null;
  const count = new Map();
  for (const r of (window._ctrl.income || [])) {
    if (r.unit_id !== u.id || (r.year === y && r.month === m)) continue;
    const n = new Date(r.year, r.month, 0).getDate();
    if (!_cxActiveOn(t, _cxIso(r.year, r.month, 1)) || !_cxActiveOn(t, _cxIso(r.year, r.month, n))) continue;   // full months only
    const k = _cxR(r.kaltmiete), nk = _cxR(r.nebenkosten);
    if (!(k + nk)) continue;
    const key = k + '|' + nk, c = count.get(key) || { k, nk, n: 0, last: 0 };
    c.n++; c.last = Math.max(c.last, r.year * 12 + r.month);
    count.set(key, c);
  }
  let best = null;
  for (const c of count.values()) if (!best || c.n > best.n || (c.n === best.n && c.last > best.last)) best = c;
  return best ? { k: best.k, nk: best.nk } : null;
}
function _cxTenantBase(link, t, u, y, m) {
  const sk = _cxNum(t.kaltmiete), snk = _cxNum(t.nebenkosten);
  if (sk !== null || snk !== null) {
    const p = _cxBase(link, t);
    return { k: sk ?? p.k, nk: snk ?? p.nk, src: 'tenant' };
  }
  const h = _cxLearned(u, t, y, m);
  if (h) return { k: h.k, nk: h.nk, src: 'history' };
  const p = _cxBase(link, t);
  return { k: p.k, nk: p.nk, src: 'price' };
}

/* → { k, nk, soll, empty, link, notes, badge, partial, days, N, parts, check, src } */
function ctlUnitSoll(u, pid, y, m) {
  const key = [pid, u.id ?? 'v:' + u.name, y, m, u.source_type || '', u.source_ref || ''].join('|');
  if (_cxUnitCache.has(key)) return _cxUnitCache.get(key);
  const p = ctlProp(pid);
  const link = ctlUnitLink(u, p);
  let out;
  if (!link) {
    const k = _cxN0(u.def_kaltmiete), nk = _cxN0(u.def_nebenkosten);
    out = { k, nk, soll: _cxR(k + nk), empty: !(k + nk), link: null, notes: [], badge: null, partial: false, days: 0, N: 0, parts: [], src: 'Planwert',
            check: !(k + nk) ? 'Nicht verknüpft und kein Planwert – in Setup verknüpfen' : null };
  } else {
    const tens = _cxTenantsFor(link), staffel = _cxHist(link, 'staffel'), nkH = _cxHist(link, 'nk');
    const N = new Date(y, m, 0).getDate();
    const first = _cxIso(y, m, 1), last = _cxIso(y, m, N), inM = d => d && d >= first && d <= last;
    // Casa Castel: a room marked occupied in the Rooms tab (rooms.vacant = false) counts as occupied
    // even without a tenant entry — same rule as the Casa Castel app. Only from the current month on.
    const today = typeof cxToday === 'function' ? cxToday() : new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 8) + '01';
    const roomBusy = link.type === 'casa_room' && link.obj && link.obj.vacant === false;
    const roomFill = roomBusy && !tens.length;     // only a room with NO tenant entries at all: tenant dates always win
    let roomGap = false;
    const bases = new Map(), parts = new Map();
    let sk = 0, snk = 0, occ = 0, roomOnly = 0, noPrice = 0;
    for (let d = 1; d <= N; d++) {
      const iso = _cxIso(y, m, d);
      const t = tens.find(x => _cxActiveOn(x, iso));
      let dk, dnk, pk;
      if (!t) {
        if (roomBusy && tens.length && iso >= thisMonth && iso <= today) roomGap = true;
        if (!(roomFill && iso >= thisMonth)) continue;
        const rp = _cxRoomPricing(link.obj, null);
        dk = _cxN0(rp.k); dnk = _cxN0(rp.nk); roomOnly++; pk = 'room';
      } else {
        if (!bases.has(t.id)) bases.set(t.id, _cxTenantBase(link, t, u, y, m));
        const b = bases.get(t.id);
        dk = _cxStepAt(staffel, t, iso) ?? b.k;
        dnk = _cxStepAt(nkH, t, iso) ?? b.nk;
        pk = t.id;
      }
      occ++; sk += dk; snk += dnk;
      if (!dk && !dnk) noPrice++;
      const pt = parts.get(pk) || { from: d, to: d, sum: 0, t };
      pt.to = d; pt.sum += dk + dnk; parts.set(pk, pt);
    }
    const k = _cxR(sk / N), nk = _cxR(snk / N);

    // What changed in this month (shown under the row)
    const notes = [];
    let badge = null;
    for (const t of [...tens].reverse()) {                 // chronological
      const mb = _cxD(t.mietbeginn), me = _cxD(t.mietende);
      if (inM(mb)) {
        const earlier = tens.some(x => x !== t && _cxD(x.mietbeginn) < mb);
        const days = N - Number(mb.slice(8, 10)) + 1;
        notes.push((earlier ? 'Mieterwechsel' : 'Neu vermietet') + ' · ab ' + _cxFmtD(t.mietbeginn) + (mb !== first ? ' · ' + days + ' von ' + N + ' Tagen' : ''));
        if (!earlier) badge = 'neu';
      }
      if (inM(me) && me !== last) notes.push('Auszug ' + _cxFmtD(t.mietende) + ' · ' + Number(me.slice(8, 10)) + ' von ' + N + ' Tagen');
    }
    const prevVal = (hist, d, kind) => {
      let b = null;
      for (const h of hist) { const x = _cxD(h.effective_date); if (x < d && (!b || x > _cxD(b.effective_date))) b = h; }
      if (b) return _cxNum(b.amount);
      const dd = new Date(d + 'T12:00:00'); dd.setDate(dd.getDate() - 1);
      const before = _cxIso(dd.getFullYear(), dd.getMonth() + 1, dd.getDate());
      const t = tens.find(x => _cxActiveOn(x, before));
      if (!t) return null;
      const bb = bases.get(t.id) || _cxTenantBase(link, t, u, y, m);
      return kind === 'k' ? bb.k : bb.nk;
    };
    for (const h of staffel) if (inM(_cxD(h.effective_date))) {
      const pv = prevVal(staffel, _cxD(h.effective_date), 'k');
      notes.push('Staffel · ' + (pv !== null && pv !== _cxNum(h.amount) ? _cxEurS(pv) + ' → ' : '') + _cxEurS(h.amount) + ' ab ' + _cxFmtD(h.effective_date));
    }
    for (const h of nkH) if (inM(_cxD(h.effective_date))) {
      const pv = prevVal(nkH, _cxD(h.effective_date), 'nk');
      notes.push('NK angepasst · ' + (pv !== null && pv !== _cxNum(h.amount) ? _cxEurS(pv) + ' → ' : '') + _cxEurS(h.amount) + ' ab ' + _cxFmtD(h.effective_date));
    }
    for (const b of bases.values()) if (b.src === 'history') { notes.push('Miete aus Ihren früheren Einträgen (beim Mieter nicht gespeichert)'); break; }

    // Data check: what doesn't add up is shown, never silently turned into a number or "leer"
    const checks = [];
    if (noPrice) checks.push('Belegt, aber kein Mietpreis hinterlegt – bitte im ' + (link.type === 'casa_room' ? 'Casa Castel Zimmer' : 'Mieter') + ' eintragen');
    if (roomOnly && !noPrice) checks.push('Belegt laut Casa Castel, aber kein Mieter eingetragen – Soll aus dem Zimmerpreis');
    for (const [tid, b] of bases) {
      const t = tens.find(x => x.id === tid);
      const gone = t && (t.status !== 'active' || (t.mietende && _cxD(t.mietende) < today));
      if (b.src === 'price' && gone) checks.push('Miete des früheren Mieters unbekannt – aktueller Preis verwendet, bitte beim Mieter hinterlegen');
    }
    for (const t of tens) {
      const me = _cxD(t.mietende);
      if (t.status === 'active' && me && me < today && me < last && !tens.some(x => _cxD(x.mietbeginn) > me))
        checks.push('Auszug ' + _cxFmtD(t.mietende) + ' eingetragen, Status noch aktiv – bitte auf ehemalig setzen oder Auszug verlängern');
    }
    if (roomGap && !checks.some(c => /Auszug/.test(c))) checks.push('Zimmer als belegt markiert, aber für diese Tage kein Mieter eingetragen – bitte Mieter oder Zimmerstatus prüfen');
    if (occ === 0 && tens.length) {
      const next = tens.filter(t => _cxD(t.mietbeginn) > last).sort((a, b) => _cxD(a.mietbeginn).localeCompare(_cxD(b.mietbeginn)))[0];
      const prev = tens.filter(t => t.mietende && _cxD(t.mietende) < first).sort((a, b) => _cxD(b.mietende).localeCompare(_cxD(a.mietende)))[0];
      if (next) notes.push('Mieter ab ' + _cxFmtD(next.mietbeginn) + ' (noch nicht eingezogen)');
      else if (prev) notes.push('Letzter Mieter bis ' + _cxFmtD(prev.mietende));
      else if (!checks.length) checks.push('Mieter eingetragen, aber ohne gültiges Einzugsdatum – bitte im Mieter-Tab prüfen');
    }
    const partList = [...parts.values()].sort((a, b) => a.from - b.from)
      .map(pt => ({ from: pt.from, to: pt.to, amount: _cxR(pt.sum / N) }));
    out = { k, nk, soll: _cxR(k + nk), empty: occ === 0, link, notes, badge,
            partial: occ > 0 && (occ < N || partList.length > 1), days: occ, N, parts: partList,
            check: checks.length ? [...new Set(checks)].join(' · ') : null,
            src: link.type === 'casa_room' ? 'Casa Castel' : 'Rentals' };
  }
  _cxUnitCache.set(key, out);
  return out;
}

/* Data check for a month: every unit whose Soll doesn't add up */
function ctlDataChecks(y, m) {
  const out = [];
  for (const p of window._ctrl.properties.filter(x => x.active)) {
    for (const u of ctlUnitsFor(p.id)) {
      const s = ctlUnitSoll(u, p.id, y, m);
      if (s.check) out.push({ prop: p.name, unit: u.name, text: s.check });
    }
  }
  return out;
}

/* ── Cost Soll per property and month ─────────────────────── */
const _CX_Q = [2, 5, 8, 11];
const _cxMonthShort = m => ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][m - 1];
function _cxNextDue(months, m) {
  const s = months.map(Number).filter(x => x >= 1 && x <= 12).sort((a, b) => a - b);
  if (!s.length) return null;
  return s.find(x => x > m) || s[0];
}

/* Apartments: Kreditrate · Hausgeld · Grundsteuer · Strom
   → { rows:[{key,label,soll,sub,src,split,note}], notDue:[{label,next}] } */
function ctlCostRows(p, y, m) {
  const S = window._src, pl = ctlPropLinks(p), first = _cxIso(y, m, 1);
  const N = new Date(y, m, 0).getDate(), last = _cxIso(y, m, N);
  const rows = [], notDue = [];

  const L = pl.loan;
  const rate = L ? _cxN0(L.rate) : _cxN0(p.def_rate);
  const z = L ? _cxN0(L.zinsen) : _cxN0(p.def_zinsen);
  const t = L ? _cxN0(L.tilgung) : _cxN0(p.def_tilgung);
  if (rate) rows.push({ key: 'rate', label: 'Kreditrate', soll: _cxR(rate),
    sub: 'Zins ' + _cxEurS(z) + ' · Tilgung ' + _cxEurS(t), src: L ? 'Properties' : 'Planwert', split: { zinsen: z, tilgung: t } });

  let hg = null, hgNote = null;
  if (pl.apt) {
    const hist = S.hgHist.filter(h => String(h.apartment_id) === String(pl.apt.id));
    let cur = null;
    for (const h of hist) { const d = _cxD(h.effective_date); if (d && d <= first && (!cur || d > _cxD(cur.effective_date))) cur = h; }
    const v = S.verw.find(x => String(x.apartment_id) === String(pl.apt.id));
    hg = cur ? _cxNum(cur.amount) : (v ? _cxNum(v.hausgeld_mtl) : null);
    const ch = hist.find(h => { const d = _cxD(h.effective_date); return d >= first && d <= last; });
    if (ch) {
      let pv = null;
      for (const h of hist) { const d = _cxD(h.effective_date); if (d < _cxD(ch.effective_date) && (!pv || d > _cxD(pv.effective_date))) pv = h; }
      hgNote = 'Hausgeld neu · ' + (pv ? _cxEurS(pv.amount) + ' → ' : '') + _cxEurS(ch.amount) + ' ab ' + _cxFmtD(ch.effective_date) +
               (_cxD(ch.effective_date) > first ? ' (gilt ab nächstem Monat)' : '');
    }
  }
  if (hg === null) hg = _cxNum(p.def_hausgeld);
  if (hg) rows.push({ key: 'hausgeld', label: 'Hausgeld', soll: _cxR(hg), sub: 'durchlaufend', src: pl.apt ? 'Rentals' : 'Planwert', note: hgNote });

  const months = Array.isArray(p.grundsteuer_months) && p.grundsteuer_months.length ? p.grundsteuer_months.map(Number) : _CX_Q;
  let gs = null;
  if (pl.apt) { const v = S.verw.find(x => String(x.apartment_id) === String(pl.apt.id)); gs = v ? _cxNum(v.grundsteuer_mtl) : null; }
  if (gs === null) gs = _cxNum(p.def_grundsteuer);
  if (gs) {
    if (months.includes(m)) rows.push({ key: 'grundsteuer', label: 'Grundsteuer', soll: _cxR(gs), sub: 'fällig 15.' + String(m).padStart(2, '0') + '.', src: pl.apt ? 'Rentals' : 'Planwert' });
    else { const nx = _cxNextDue(months, m); notDue.push({ label: 'Grundsteuer', next: nx ? _cxMonthShort(nx) : '' }); }
  }

  const st = _cxN0(p.def_strom);
  if (st) rows.push({ key: 'strom', label: 'Strom', soll: _cxR(st), sub: 'monatlich', src: 'Planwert' });
  return { rows, notDue };
}

/* Casa Castel: cost types by frequency / due months */
const _cxBedarf = f => /sporad|bedarf/i.test(String(f || ''));
function ctlCasaCostRows(p, y, m) {
  const pl = ctlPropLinks(p), rows = [], notDue = [];
  for (const c of (window._ctrl.categories || [])) {
    if (c.active === false) continue;
    const isRate = c.code === 'RATE';
    const label = c.name || (isRate ? 'Kreditrate' : 'Kosten');
    const freq = c.frequency || 'monatlich';
    if (_cxBedarf(freq)) continue;                               // → Einmalig
    const dm = Array.isArray(c.due_months) ? c.due_months.map(Number) : [];
    const due = freq === 'monatlich' ? (!dm.length || dm.includes(m)) : dm.includes(m);
    const amount = isRate && pl.loan ? _cxN0(pl.loan.rate) : _cxN0(c.default_amount);
    if (due) rows.push({ key: 'cat:' + c.id, catId: c.id, label, soll: _cxR(amount), sub: freq,
      src: isRate && pl.loan ? 'Properties' : 'Setup',
      split: isRate && pl.loan ? { zinsen: _cxN0(pl.loan.zinsen), tilgung: _cxN0(pl.loan.tilgung) } : null });
    else if (dm.length) { const nx = _cxNextDue(dm, m); notDue.push({ label, next: nx ? _cxMonthShort(nx) : '' }); }
  }
  return { rows, notDue };
}

/* ── NK settlement suggestions for Einmalig ───────────────── */
function ctlOtSuggestions() {
  const S = window._src, out = [];
  const taken = new Set((window._ctrl.one_time || []).map(o => o.source_ref).filter(Boolean));
  const props = window._ctrl.properties.filter(p => p.active);
  const aptProp = aptId => props.find(p => { const l = ctlPropLinks(p); return l.apt && String(l.apt.id) === String(aptId); });
  for (const e of S.rntNk) {
    const amt = _cxNum(e.amount);
    if (!e.paid || !amt || taken.has('rnt_nk:' + e.id)) continue;
    const t = S.rntTen.find(x => x.id === e.tenant_id);
    const p = t && t.apartment_id ? aptProp(t.apartment_id) : null;
    if (!p) continue;
    out.push({ ref: 'rnt_nk:' + e.id, pid: p.id, prop: p.name, text: 'NK-Abrechnung ' + (e.period || '') + (amt > 0 ? ' · Nachzahlung Mieter' : ' · Guthaben Mieter'), amount: Math.abs(amt), direction: amt > 0 ? 1 : -1 });
  }
  const casa = props.find(p => p.id === CASA_PROP_ID);
  if (casa) for (const e of S.casaNk) {
    const amt = _cxNum(e.amount);
    if (!e.paid || !amt || taken.has('nk:' + e.id)) continue;
    const t = S.casaTen.find(x => x.id === e.tenant_id);
    out.push({ ref: 'nk:' + e.id, pid: casa.id, prop: casa.name + (t && t.room ? ' · ' + t.room : ''), text: 'NK-Abrechnung ' + (e.period || '') + (amt > 0 ? ' · Nachzahlung Mieter' : ' · Guthaben Mieter'), amount: Math.abs(amt), direction: amt > 0 ? 1 : -1 });
  }
  return out;
}
