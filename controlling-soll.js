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
     · Links: a saved link wins; otherwise matched by name (Stellplatz →
       Rentals Parking first, for every property incl. Casa Castel).
     · Rent: day by day for the tenancy active that day, summed over the
       month (move-in and move-out day are paid days, D4).
       Base  = rent history (rent_periods, cc-rent-engine.js) in effect that
               day › rent stored on the tenant › learned from your entries ›
               today's price (flagged, never silent)
       Kalt  = latest Staffel step of THIS tenancy on/after the base date
       NK    = latest NK change of THIS tenancy on/after the base date
       Pauschal = one amount (no NK part, NK changes don't apply)
       First / last month "voll" in the contract → the full month's rent.
     · A tenancy without Einzug gives no Soll; a former tenant without
       Auszug ends the day before the next Einzug — both flagged.
     · No tenant → "leer" (Soll 0).
     · Costs: value valid on the 1st of the month; Grundsteuer only in
       its months; Casa costs by frequency / due months.
   ───────────────────────────────────────────────────────────── */

'use strict';

window._src = {
  loaded: false,
  apts: [], pricing: [], verw: [], hgHist: [], parking: [], pkPricing: [],
  rntTen: [], staffel: [], rntNkV: [], rntNk: [],
  rooms: [], casaTen: [], casaNkV: [], casaNk: [],
  loans: [], rentP: [], incAll: [], settle: [],
};

const _CX_SRC = [
  ['apts', 'rentals_apartments'], ['pricing', 'rentals_pricing'], ['verw', 'rentals_verwaltung'],
  ['hgHist', 'rentals_hausgeld_history'], ['parking', 'rentals_parking'], ['pkPricing', 'rentals_parking_pricing'],
  ['rntTen', 'rnt_tenant_records'], ['staffel', 'rnt_staffelmiete_history'], ['rntNkV', 'rnt_nk_vorauszahlung_history'],
  ['rntNk', 'rnt_nk_entries'], ['rooms', 'rooms'], ['casaTen', 'tenant_records'],
  ['casaNkV', 'nk_vorauszahlung_history'], ['casaNk', 'nk_entries'], ['loans', 'properties'],
  ['rentP', 'rent_periods'], ['incAll', 'ctrl_income_months'], ['settle', 'ctrl_settlements'],
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
  if (typeof ccRpSetRows === 'function') ccRpSetRows(window._src.rentP);   // shared store for the history screen
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
  if (_cxIsParking(u)) {                                   // B11: before the Casa room match
    const pk = S.parking.find(x => _cxNorm(x.name) === _cxNorm(u.name));
    return pk ? { type: 'rentals_parking', ref: String(pk.id), obj: pk, auto: true } : null;
  }
  if (p.id === CASA_PROP_ID) {
    const r = S.rooms.find(r => _cxNorm(r.name) === _cxNorm(u.name));
    return r ? { type: 'casa_room', ref: r.name, obj: r, auto: true } : null;
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
function _cxTenantsForV1(link) {   // v1 only (CC_RENT_ENGINE = 'v1')
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
  if (link.type === 'casa_room') return S.casaNkV.filter(h => _cxNorm(h.room) === _cxNorm(link.ref));   // B10
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
    // B5: what is stored on the tenant is the whole rent — an empty NK is 0, never today's price
    return { k: sk ?? 0, nk: snk ?? 0, src: 'tenant' };
  }
  const h = _cxLearned(u, t, y, m);
  if (h) return { k: h.k, nk: h.nk, src: 'learned' };
  const p = _cxBase(link, t);
  return { k: p.k, nk: p.nk, src: 'price' };
}

/* v1 (old logic) — only used when CC_RENT_ENGINE = 'v1' */
function _cxUnitSollV1(u, pid, y, m) {
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
    const tens = _cxTenantsForV1(link), staffel = _cxHist(link, 'staffel'), nkH = _cxHist(link, 'nk');
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
    for (const b of bases.values()) if (b.src === 'learned') { notes.push('Miete aus Ihren früheren Einträgen (beim Mieter nicht gespeichert)'); break; }

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

/* ── v2: tenancy history (rent_periods · B1 B2 B5 B6 B7 B8 B9) ─────────── */
const _cxToday = () => (typeof cxToday === 'function' ? cxToday() : new Date().toISOString().slice(0, 10));
const _cxAddDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return _cxIso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
const _cxApp = link => (link.type === 'casa_room' ? 'casa' : 'rentals');
const _cxTName = t => [t.first_name, t.last_name].filter(Boolean).join(' ') || 'Mieter';

/* Tenancies of a unit → [{ t, id, name, from, to, noStart, noEnd, created }], newest Einzug first.
   Einzug missing → no window (B8). Former tenant without Auszug → ends the day
   before the next Einzug, or today when nobody followed (B9, flagged).        */
function _cxTenancies(link) {
  const S = window._src;
  let list = [];
  if (link.type === 'rentals_apartment') list = S.rntTen.filter(t => String(t.apartment_id) === link.ref);
  else if (link.type === 'rentals_parking') list = S.rntTen.filter(t => String(t.parking_id) === link.ref);
  else if (link.type === 'casa_room') list = S.casaTen.filter(t => _cxNorm(t.room) === _cxNorm(link.ref));   // "New york" = "New York"
  const today = _cxToday();
  const ws = list.map(t => ({ t, id: String(t.id), name: _cxTName(t), from: _cxD(t.mietbeginn), to: _cxD(t.mietende),
                              noStart: !_cxD(t.mietbeginn), noEnd: false, created: String(t.created_at || '') }));
  const dated = ws.filter(w => w.from).sort((a, b) => a.from.localeCompare(b.from));
  dated.forEach((w, i) => {
    if (w.to) return;
    if (w.t.status === 'active') { w.to = '9999-12-31'; return; }
    const next = dated.slice(i + 1).find(x => x.from > w.from);
    w.to = next ? _cxAddDays(next.from, -1) : today;
    w.noEnd = true;
  });
  return ws.sort((a, b) => (b.from || '').localeCompare(a.from || ''));
}

/* Pauschal or Kalt + NK for a tenancy without rent history (same rule as the tenant tabs) */
function _cxLegacyMode(link, t) {
  if (link.type !== 'casa_room' || !link.obj) return 'kalt_nk';
  const r = link.obj;
  let ctype = t && t.contract_type;
  if (!ctype) ctype = r.active_price_type === 'kurzzeit' && r.kurzzeit_kaltmiete ? 'kurzzeit' : ((r.kaltmiete || r.mietvertrag_miete) ? 'mietvertrag' : (r.kurzzeit_kaltmiete ? 'kurzzeit' : 'mietvertrag'));
  const isP = ctype === 'kurzzeit' ? (r.kurzzeit_pricing || 'pauschal') !== 'kalt_nk' : r.mietvertrag_pricing !== 'kalt_nk';
  return isP ? 'pauschal' : 'kalt_nk';
}

/* Does a Staffel / NK step belong to this tenancy? (B6)
   · linked to a tenant → only that tenant
   · old rows without link → by date within the tenancy, but NOT when the step was
     entered before this tenancy existed while an earlier tenant lived there      */
function _cxOwnsStep(h, w, all) {
  if (h.tenant_id !== undefined && h.tenant_id !== null && h.tenant_id !== '') return String(h.tenant_id) === w.id;
  const d = _cxD(h.effective_date);
  if (!d || !w.from || d < w.from || d > w.to) return false;
  if (h.created_at && w.created && String(h.created_at) < w.created && all.some(x => x !== w && x.from && x.from < w.from)) return false;
  return true;
}
/* Steps of the unit that belong to no tenancy (e.g. an old tenant's future Staffel) */
function _cxOrphanSteps(link, all) {
  const out = [];
  for (const kind of ['staffel', 'nk']) for (const h of _cxHist(link, kind))
    if (!all.some(w => _cxOwnsStep(h, w, all))) out.push({ kind, h });
  return out;
}

function _cxAmount(p) {
  if (typeof ccRpAmount === 'function') return ccRpAmount(p);
  if (p.mode === 'pauschal') { const t = _cxNum(p.pauschale) ?? (_cxN0(p.kaltmiete) + _cxN0(p.nebenkosten)); return { mode: 'pauschal', kalt: t, nk: 0, total: t }; }
  return { mode: 'kalt_nk', kalt: _cxN0(p.kaltmiete), nk: _cxN0(p.nebenkosten), total: _cxN0(p.kaltmiete) + _cxN0(p.nebenkosten) };
}
function _cxTenancyData(link, w, all, memo) {
  let c = memo.get(w.id);
  if (!c) {
    const app = _cxApp(link);
    c = {
      per: (window._src.rentP || []).filter(p => p.app === app && String(p.tenant_id) === w.id)
             .sort((a, b) => _cxD(a.valid_from).localeCompare(_cxD(b.valid_from))),
      st: _cxHist(link, 'staffel').filter(h => _cxOwnsStep(h, w, all)),
      nk: _cxHist(link, 'nk').filter(h => _cxOwnsStep(h, w, all)),
      legacy: null,
    };
    memo.set(w.id, c);
  }
  return c;
}
const _cxPerAt = (per, iso) => { let b = null; for (const p of per) { const d = _cxD(p.valid_from); if (d && d <= iso && (!b || d >= _cxD(b.valid_from))) b = p; } return b; };
const _cxStepFrom = (hist, iso, base) => { let b = null; for (const h of hist) { const d = _cxD(h.effective_date); if (d && d <= iso && d >= base && (!b || d > _cxD(b.effective_date))) b = h; } return b ? _cxNum(b.amount) : null; };

/* Rent of one tenancy on one day → { k, nk, mode, src, period } */
function _cxRentDay(link, w, u, y, m, iso, all, memo) {
  const c = _cxTenancyData(link, w, all, memo);
  const per = _cxPerAt(c.per, iso);
  let k, nk, mode, src, base;
  if (per) {
    const a = _cxAmount(per);
    mode = a.mode; k = a.kalt; nk = a.nk; src = 'period'; base = _cxD(per.valid_from);
  } else {
    if (!c.legacy) c.legacy = _cxTenantBase(link, w.t, u, y, m);
    mode = _cxLegacyMode(link, w.t);
    k = _cxN0(c.legacy.k); nk = _cxN0(c.legacy.nk); src = c.legacy.src; base = w.from;
    if (mode === 'pauschal') { k = k + nk; nk = 0; }
  }
  if (mode !== 'pauschal') {                               // Pauschal: one amount, steps don't apply (D5)
    const sk = _cxStepFrom(c.st, iso, base); if (sk !== null) k = sk;
    const sn = _cxStepFrom(c.nk, iso, base); if (sn !== null) nk = sn;
  }
  return { k, nk, mode, src, period: per };
}

/* → { k, nk, soll, empty, link, notes, badge, partial, days, N, parts:[{from,to,amount,tid,name}], check, src } */
function _cxUnitSollV2(u, pid, y, m) {
  const key = 'v2|' + [pid, u.id ?? 'v:' + u.name, y, m, u.source_type || '', u.source_ref || ''].join('|');
  if (_cxUnitCache.has(key)) return _cxUnitCache.get(key);
  const p = ctlProp(pid);
  const link = ctlUnitLink(u, p);
  let out;
  if (!link) {
    const k = _cxN0(u.def_kaltmiete), nk = _cxN0(u.def_nebenkosten);
    out = { k, nk, soll: _cxR(k + nk), empty: !(k + nk), link: null, notes: [], badge: null, partial: false, days: 0, N: 0, parts: [], src: 'Planwert',
            check: !(k + nk) ? 'Nicht verknüpft und kein Planwert – in Setup verknüpfen' : null };
    _cxUnitCache.set(key, out);
    return out;
  }
  const all = _cxTenancies(link), dated = all.filter(w => w.from), memo = new Map();
  const N = new Date(y, m, 0).getDate();
  const first = _cxIso(y, m, 1), last = _cxIso(y, m, N), inM = d => d && d >= first && d <= last;
  const today = _cxToday(), thisMonth = today.slice(0, 8) + '01';
  const roomBusy = link.type === 'casa_room' && link.obj && link.obj.vacant === false;
  const roomFill = roomBusy && !all.length;                 // only a room with NO tenant entries at all
  let roomGap = false, overlap = 0, occ = 0, roomOnly = 0, noPrice = 0;
  const parts = new Map();
  for (let d = 1; d <= N; d++) {
    const iso = _cxIso(y, m, d);
    const act = dated.filter(w => w.from <= iso && iso <= w.to);
    if (act.length > 1) overlap++;
    const w = act[0];                                       // newest Einzug wins, one tenant per day (D4)
    let dk, dnk, pk, r = null;
    if (!w) {
      // days before a move-in / after a move-out in this month are expected to be empty
      const expectedGap = dated.some(w2 => (inM(w2.from) && iso < w2.from) || (inM(w2.to) && iso > w2.to));
      if (roomBusy && all.length && iso >= thisMonth && iso <= today && !expectedGap) roomGap = true;
      if (!(roomFill && iso >= thisMonth)) continue;
      const rp = _cxRoomPricing(link.obj, null);
      dk = _cxN0(rp.k); dnk = _cxN0(rp.nk); roomOnly++; pk = 'room';
    } else {
      r = _cxRentDay(link, w, u, y, m, iso, all, memo);
      dk = r.k; dnk = r.nk; pk = w.id;
    }
    occ++;
    if (!dk && !dnk) noPrice++;
    const pt = parts.get(pk) || { from: d, to: d, sk: 0, snk: 0, days: 0, w: w || null, r0: r, src: r ? r.src : 'room' };
    pt.to = d; pt.sk += dk; pt.snk += dnk; pt.days++;
    parts.set(pk, pt);
  }

  // First / last month "voll" from the contract (B7, D3) → that tenant pays the full month
  const notes = [];
  for (const pt of parts.values()) {
    const w = pt.w; if (!w) continue;
    const c = _cxTenancyData(link, w, all, memo);
    const inAt = inM(w.from) && w.from !== first ? _cxPerAt(c.per, w.from) : null;
    const outAt = inM(w.to) && w.to !== last && !w.noEnd ? _cxPerAt(c.per, w.to) : null;
    const fullIn = inAt && inAt.first_month === 'voll', fullOut = outAt && outAt.last_month === 'voll';
    if (fullIn || fullOut) {
      const r = _cxRentDay(link, w, u, y, m, fullIn ? w.from : w.to, all, memo);
      pt.sk = r.k * N; pt.snk = r.nk * N;
      notes.push((fullIn ? 'Erster' : 'Letzter') + ' Monat laut Vertrag voll · ' + w.name);
    }
  }
  let sk = 0, snk = 0;
  for (const pt of parts.values()) { sk += pt.sk; snk += pt.snk; }
  const k = _cxR(sk / N), nk = _cxR(snk / N);

  // What changed in this month (shown under the row)
  let badge = null;
  for (const w of [...dated].reverse()) {                   // chronological
    if (inM(w.from)) {
      const earlier = dated.some(x => x !== w && x.from < w.from);
      const days = N - Number(w.from.slice(8, 10)) + 1;
      notes.push((earlier ? 'Mieterwechsel' : 'Neu vermietet') + ' · ab ' + _cxFmtD(w.from) + (w.from !== first ? ' · ' + days + ' von ' + N + ' Tagen' : ''));
      if (!earlier) badge = 'neu';
    }
    if (inM(w.to) && w.to !== last && !w.noEnd) notes.push('Auszug ' + _cxFmtD(w.to) + ' · ' + Number(w.to.slice(8, 10)) + ' von ' + N + ' Tagen');
    const c = _cxTenancyData(link, w, all, memo);
    const before = iso => { const dd = _cxAddDays(iso, -1); return dd >= w.from ? _cxRentDay(link, w, u, y, m, dd, all, memo) : null; };
    for (const pr of c.per) {
      const d = _cxD(pr.valid_from);
      if (!inM(d) || d === w.from) continue;
      const a = _cxAmount(pr), b = before(d);
      notes.push((pr.kind === 'renewal' ? 'Verlängerung' : 'Neue Miete') + ' · ' + (b && _cxR(b.k + b.nk) !== _cxR(a.total) ? _cxEurS(b.k + b.nk) + ' → ' : '') + _cxEurS(a.total) + (a.mode === 'pauschal' ? ' pauschal' : '') + ' ab ' + _cxFmtD(d));
    }
    for (const h of c.st) { const d = _cxD(h.effective_date); if (!inM(d)) continue; const b = before(d);
      notes.push('Staffel · ' + (b && b.k !== _cxNum(h.amount) ? _cxEurS(b.k) + ' → ' : '') + _cxEurS(h.amount) + ' ab ' + _cxFmtD(d)); }
    for (const h of c.nk) { const d = _cxD(h.effective_date); if (!inM(d)) continue; const b = before(d);
      notes.push('NK angepasst · ' + (b && b.nk !== _cxNum(h.amount) ? _cxEurS(b.nk) + ' → ' : '') + _cxEurS(h.amount) + ' ab ' + _cxFmtD(d)); }
  }
  for (const pt of parts.values()) if (pt.src === 'learned') { notes.push('Miete aus Ihren früheren Einträgen (beim Mieter nicht gespeichert)'); break; }

  // Data check: what doesn't add up is shown, never silently turned into a number or "leer"
  const checks = [];
  if (noPrice) checks.push('Belegt, aber keine Miete hinterlegt – bitte beim ' + (link.type === 'casa_room' ? 'Mieter (Casa Castel)' : 'Mieter') + ' eintragen');
  if (roomOnly && !noPrice) checks.push('Belegt laut Casa Castel, aber kein Mieter eingetragen – Soll aus dem Zimmerpreis');
  for (const pt of parts.values()) {
    if (!pt.w || pt.src !== 'price') continue;
    const gone = pt.w.t.status !== 'active' || (pt.w.t.mietende && _cxD(pt.w.t.mietende) < today);
    if (gone) checks.push('Miete von ' + pt.w.name + ' unbekannt – aktueller Preis verwendet, bitte beim Mieter hinterlegen');
  }
  for (const w of all) {
    if (w.noStart) checks.push(w.name + ' ohne Einzugsdatum – kein Soll, bitte Einzug eintragen');
    if (w.noEnd && w.from <= last && w.to >= first) checks.push(w.name + ': Auszug fehlt – Ende vorläufig ' + _cxFmtD(w.to) + ', bitte Auszug eintragen');
    const me = _cxD(w.t.mietende);
    if (w.t.status === 'active' && me && me < today && me < last && !dated.some(x => x.from > me))
      checks.push('Auszug ' + _cxFmtD(me) + ' eingetragen, Status noch aktiv – bitte auf ehemalig setzen oder Auszug verlängern');
  }
  for (const w of dated) {                                  // Fix 4
    if (w.to !== '9999-12-31') continue;
    const per = _cxPerAt(_cxTenancyData(link, w, all, memo).per, today);
    const ce = per && _cxD(per.contract_end);
    if (ce && ce < today && ce <= last) checks.push(w.name + ': Vertrag endete am ' + _cxFmtD(ce) + ' – kein Auszug und keine Verlängerung eingetragen');
  }
  if (overlap) checks.push('Zwei Mieter gleichzeitig an ' + overlap + (overlap === 1 ? ' Tag' : ' Tagen') + ' – bitte Ein- und Auszug prüfen (gezählt: der neuere)');
  if (roomGap && !checks.some(c => /Auszug/.test(c))) checks.push('Zimmer als belegt markiert, aber für diese Tage kein Mieter eingetragen – bitte Mieter oder Zimmerstatus prüfen');
  if (occ === 0 && all.length) {
    const next = dated.filter(w => w.from > last).sort((a, b) => a.from.localeCompare(b.from))[0];
    const prev = dated.filter(w => w.to < first).sort((a, b) => b.to.localeCompare(a.to))[0];
    if (next) notes.push('Mieter ab ' + _cxFmtD(next.from) + ' (noch nicht eingezogen)');
    else if (prev) notes.push('Letzter Mieter bis ' + _cxFmtD(prev.to));
  }
  const partList = [...parts.entries()].sort((a, b) => a[1].from - b[1].from)
    .map(([pk, pt]) => ({ from: pt.from, to: pt.to, amount: _cxR((pt.sk + pt.snk) / N), k: _cxR(pt.sk / N), nk: _cxR(pt.snk / N),
                           tid: pk, name: pt.w ? pt.w.name : 'Zimmer', mode: pt.r0 ? pt.r0.mode : 'kalt_nk' }));
  out = { k, nk, soll: _cxR(k + nk), empty: occ === 0, link, notes, badge,
          partial: occ > 0 && (occ < N || partList.length > 1), days: occ, N, parts: partList,
          check: checks.length ? [...new Set(checks)].join(' · ') : null,
          src: link.type === 'casa_room' ? 'Casa Castel' : 'Rentals' };
  _cxUnitCache.set(key, out);
  return out;
}

function ctlUnitSoll(u, pid, y, m) {
  return window.CC_RENT_ENGINE === 'v1' ? _cxUnitSollV1(u, pid, y, m) : _cxUnitSollV2(u, pid, y, m);
}

/* Income of one unit & month split per tenancy (G1): split[tid] when entered per tenant,
   otherwise the whole amount (one tenant) or shared by Soll (several). */
function ctlIstFor(row, s, tid) {
  if (!row) return null;
  const total = _cxN0(row.kaltmiete) + _cxN0(row.nebenkosten);
  const sp = row.split && typeof row.split === 'object' ? row.split : null;
  if (sp && sp[tid] !== undefined && sp[tid] !== null) return _cxR(sp[tid]);
  if (sp && Object.keys(sp).length) return null;
  if (!s.parts || s.parts.length <= 1) return _cxR(total);
  const part = s.parts.find(p => p.tid === tid);
  return part && s.soll ? _cxR(total * part.amount / s.soll) : null;
}

/* Running balance of one tenancy over every month with an entered payment (G1).
   → { soll, ist, saldo, months } · saldo > 0 = Rückstand, < 0 = Guthaben        */
function ctlTenancyBalance(u, pid, tid) {
  const all = window._src.incAll || [];
  const rows = all.filter(r => u.id != null && r.unit_id === u.id);
  let soll = 0, ist = 0, months = 0;
  for (const row of rows) {
    const s = ctlUnitSoll(u, pid, row.year, row.month);
    const part = (s.parts || []).find(p => p.tid === String(tid));
    if (!part) continue;
    const i = ctlIstFor(row, s, String(tid));
    if (i === null) continue;
    soll += part.amount; ist += i; months++;
  }
  // Fix 5: finished months since Controlling started (first entry anywhere) with a Soll for this
  // tenant but nothing entered → "nicht erfasst" (maybe unpaid, maybe just not entered)
  let missing = 0, missingSum = 0;
  const start = all.reduce((a, r) => Math.min(a, r.year * 12 + r.month), Infinity);
  const t = _cxToday(), cur = Number(t.slice(0, 4)) * 12 + Number(t.slice(5, 7));
  if (isFinite(start) && u.id != null) {
    const has = new Set(rows.map(r => r.year * 12 + r.month));
    for (let k = start; k < cur; k++) {
      if (has.has(k)) continue;
      const y = Math.floor((k - 1) / 12), m = k - y * 12;
      const part = (ctlUnitSoll(u, pid, y, m).parts || []).find(p => p.tid === String(tid));
      if (part && part.amount) { missing++; missingSum += part.amount; }
    }
  }
  return { soll: _cxR(soll), ist: _cxR(ist), saldo: _cxR(soll - ist), months, missing, missingSum: _cxR(missingSum) };
}

/* Everything the history screen needs for one unit (Phase 3) */
function ctlUnitHistory(u, pid) {
  const p = ctlProp(pid), link = ctlUnitLink(u, p);
  if (!link) return { link: null, tenancies: [], orphans: [] };
  const all = _cxTenancies(link), memo = new Map();
  const tenancies = all.map(w => {
    const c = _cxTenancyData(link, w, all, memo);
    const today = _cxToday();
    const cur = w.from ? _cxRentDay(link, w, u, Number(today.slice(0, 4)), Number(today.slice(5, 7)), w.to < today ? w.to : today, all, memo) : null;
    return { ...w, app: _cxApp(link), periods: c.per, staffel: c.st, nkSteps: c.nk, legacyMode: _cxLegacyMode(link, w.t),
             current: cur, balance: ctlTenancyBalance(u, pid, w.id) };
  });
  // Payments recorded in months when, by the data, nobody lived there — typically an Einzug
  // that was overwritten by a renewal in the past (B1). Shown so the real Einzug gets entered.
  const istNoTenant = (window._src.incAll || [])
    .filter(r => u.id != null && r.unit_id === u.id && (_cxN0(r.kaltmiete) + _cxN0(r.nebenkosten)) > 0)
    .filter(r => { const f = _cxIso(r.year, r.month, 1), l = _cxIso(r.year, r.month, new Date(r.year, r.month, 0).getDate());
                   return !all.some(w => w.from && w.from <= l && w.to >= f); })
    .sort((a, b) => (a.year - b.year) || (a.month - b.month))
    .map(r => String(r.month).padStart(2, '0') + '.' + r.year);
  return { link, tenancies, orphans: _cxOrphanSteps(link, all), istNoTenant };
}

/* Fix 8: data check over every month of the year up to the selected one (duplicates merged) */
function ctlDataChecksYear(y, upTo) {
  const seen = new Map();
  for (let m = 1; m <= upTo; m++) for (const c of ctlDataChecks(y, m)) for (const text of String(c.text).split(' · ')) {
    const k = c.prop + '|' + c.unit + '|' + text;                // each warning once, with its months
    if (!seen.has(k)) seen.set(k, { ...c, text, months: [m] }); else if (!seen.get(k).months.includes(m)) seen.get(k).months.push(m);
  }
  return [...seen.values()];
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
    const hist = S.hgHist.filter(h => String(h.apt_id ?? h.apartment_id) === String(pl.apt.id));   // B21: Rentals column is apt_id
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

/* Casa Castel: cost types by frequency / due months
   → { rows, notDue, bedarf:[{catId,label}], checks:[label] }
   · sporadisch with months (e.g. Gärtner Apr–Okt) → Soll in those months (B18)
   · sporadisch otherwise → no Soll, but always enterable ("bei Bedarf")
   · vierteljährlich / jährlich without months → flagged, never silently gone (B19) */
const _cxBedarf = f => /sporad|bedarf/i.test(String(f || ''));
function ctlCasaCostRows(p, y, m) {
  const pl = ctlPropLinks(p), rows = [], notDue = [], bedarf = [], checks = [];
  for (const c of (window._ctrl.categories || [])) {
    if (c.active === false) continue;
    const isRate = c.code === 'RATE';
    const label = c.name || (isRate ? 'Kreditrate' : 'Kosten');
    const freq = c.frequency || 'monatlich';
    const dm = Array.isArray(c.due_months) ? c.due_months.map(Number) : [];
    const amount = isRate && pl.loan ? _cxN0(pl.loan.rate) : _cxN0(c.default_amount);
    if (_cxBedarf(freq)) {
      if (dm.includes(m)) rows.push({ key: 'cat:' + c.id, catId: c.id, label, soll: _cxR(amount), sub: 'sporadisch · geplant', src: 'Setup', split: null });
      else bedarf.push({ catId: c.id, label });
      continue;
    }
    if (freq !== 'monatlich' && !dm.length) {
      if (amount) checks.push(label);
      continue;
    }
    const due = freq === 'monatlich' ? (!dm.length || dm.includes(m)) : dm.includes(m);
    if (due) rows.push({ key: 'cat:' + c.id, catId: c.id, label, soll: _cxR(amount), sub: freq,
      src: isRate && pl.loan ? 'Properties' : 'Setup',
      split: isRate && pl.loan ? { zinsen: _cxN0(pl.loan.zinsen), tilgung: _cxN0(pl.loan.tilgung) } : null });
    else if (dm.length) { const nx = _cxNextDue(dm, m); notDue.push({ label, next: nx ? _cxMonthShort(nx) : '' }); }
  }
  return { rows, notDue, bedarf, checks };
}

/* ── NK settlement suggestions for Einmalig ───────────────── */
function ctlOtSuggestions() {
  const S = window._src, out = [];
  const taken = new Set((window._ctrl.one_time || []).map(o => o.source_ref).filter(Boolean));
  // Fix 2: an NK settlement already marked "bezahlt" in the Abrechnungen list is not offered again
  const yr = e => { const m = String(e.period || '').match(/20\d\d/g); return m ? Number(m[m.length - 1]) : null; };
  const done = new Set((S.settle || []).filter(r => r.status === 'bezahlt' && r.kind === 'nk_tenant').map(r => String(r.tenant_id) + '|' + r.covers_year));
  const isDone = (tid, e) => done.has(String(tid) + '|' + yr(e));
  const props = window._ctrl.properties.filter(p => p.active);
  const aptProp = aptId => props.find(p => { const l = ctlPropLinks(p); return l.apt && String(l.apt.id) === String(aptId); });
  for (const e of S.rntNk) {
    const amt = _cxNum(e.amount);
    if (!e.paid || !amt || taken.has('rnt_nk:' + e.id) || isDone(e.tenant_id, e)) continue;
    const t = S.rntTen.find(x => x.id === e.tenant_id);
    const p = t && t.apartment_id ? aptProp(t.apartment_id) : null;
    if (!p) continue;
    out.push({ tid: String(e.tenant_id), year: yr(e), ref: 'rnt_nk:' + e.id, pid: p.id, prop: p.name, text: 'NK-Abrechnung ' + (e.period || '') + (amt > 0 ? ' · Nachzahlung Mieter' : ' · Guthaben Mieter'), amount: Math.abs(amt), direction: amt > 0 ? 1 : -1 });
  }
  const casa = props.find(p => p.id === CASA_PROP_ID);
  if (casa) for (const e of S.casaNk) {
    const amt = _cxNum(e.amount);
    if (!e.paid || !amt || taken.has('nk:' + e.id) || isDone(e.tenant_id, e)) continue;
    const t = S.casaTen.find(x => x.id === e.tenant_id);
    out.push({ tid: String(e.tenant_id), year: yr(e), ref: 'nk:' + e.id, pid: casa.id, prop: casa.name + (t && t.room ? ' · ' + t.room : ''), text: 'NK-Abrechnung ' + (e.period || '') + (amt > 0 ? ' · Nachzahlung Mieter' : ' · Guthaben Mieter'), amount: Math.abs(amt), direction: amt > 0 ? 1 : -1 });
  }
  return out;
}


/* ── Konto | Tatsächlich (change round 3 · D18–D21) ──────────
   Warm rein  = Kaltmiete + NK + one-time income (incl. Abrechnungen received)
   Warm raus  = everything paid: Hausgeld, Grundsteuer, Strom / all Casa house
                costs, invoices, Abrechnungen paid — and the Kreditrate
   Konto       = Warm rein − Warm raus
   Tatsächlich = Warm rein − Warm raus without the Kreditrate
   Meine Kosten = Hausgeld − NK (Rentals) · Hauskosten − NK (Casa Castel)
   Abrechnungen count in the month the money moves (D21). Kaution never (D14).
   Invariant: Tatsächlich = Konto + Kreditrate.                              */
function ctlActualMonth(pid, m) {
  const y = window._ctrl.year, casa = pid === CASA_PROP_ID;
  const x = ctlPropertyMonth(pid, m);
  const lines = [];                                       // [label, signed amount, kontoOnly]
  const warm = _cxR(x.kalt + x.neben);
  if (warm) lines.push(['Miete + NK', warm, false]);
  let rate = 0, costs = 0;
  if (casa) {
    const rateCat = (window._ctrl.categories || []).find(c => c.code === 'RATE');
    for (const e of window._ctrl.castel_expenses) if (e.year === y && e.month === m) {
      if (rateCat && e.category_id === rateCat.id) rate += Number(e.amount) || 0; else costs += Number(e.amount) || 0;
    }
    if (costs) lines.push(['Hauskosten', -_cxR(costs), false]);
  } else {
    const row = window._ctrl.apt_expenses.find(e => e.property_id === pid && e.year === y && e.month === m) || {};
    rate = Number(row.rate) || 0;
    const hg = Number(row.hausgeld) || 0, gs = Number(row.grundsteuer) || 0, st = Number(row.strom) || 0;
    costs = hg;
    if (hg) lines.push(['Hausgeld', -_cxR(hg), false]);
    if (gs) lines.push(['Grundsteuer', -_cxR(gs), false]);
    if (st) lines.push(['Strom', -_cxR(st), false]);
  }
  let abrIn = 0, abrOut = 0;
  for (const o of (window._ctrl.one_time || [])) {
    if (o.property_id !== pid) continue;
    const d = ctlParseDate(o.invoice_date);
    if (d.year !== y || d.month !== m) continue;
    const amt = Number(o.amount) || 0, inn = Number(o.direction) === 1;
    if (/abrechnung/i.test(String(o.kind || ''))) { if (inn) abrIn += amt; else abrOut += amt; }
    lines.push([[o.company, o.item].filter(Boolean).join(' · ') || o.kind || 'Einmalig', inn ? _cxR(amt) : -_cxR(amt), false]);
  }
  if (rate) lines.push(['Kreditrate', -_cxR(rate), true]);
  return {
    rein: _cxR(x.rein), raus: _cxR(x.raus - rate), rausKonto: _cxR(x.raus), rate: _cxR(rate),
    tats: _cxR(x.rein - (x.raus - rate)), konto: _cxR(x.konto),
    meineKosten: _cxR(costs - x.neben), abr: _cxR(abrIn - abrOut), lines,
  };
}

/* ── Phase 5 · Abrechnungen tracker (B13, B14, G3) ──────────
   One row per expected yearly settlement: NK per tenancy period (Kalt + NK
   tenants only) and the WEG Hausgeld-Jahresabrechnung per Rentals apartment. */
/* ── Abrechnungszeiträume (Rule 5 · D23) ─────────────────────
   Every property has its own settlement period: "beginnt am" = ctrl_properties.nk_period_start
   ('MM-DD', default '01-01'). Rentals: usually the WEG's Wirtschaftsjahr; Casa Castel: Lynn's
   own period. A period is offered while it has ended and its Frist (end + 12 months) hasn't. */
const _cxPerStart = p => (/^\d{2}-\d{2}$/.test(String(p.nk_period_start || '')) ? p.nk_period_start : '01-01');
function ctlSettlementPeriods(p, today) {
  today = today || _cxToday();
  const st = _cxPerStart(p), ty = Number(today.slice(0, 4)), out = [];
  for (let y = ty - 3; y <= ty; y++) {
    const from = y + '-' + st, to = _cxAddDays((y + 1) + '-' + st, -1);
    const frist = _cxAddDays((y + 2) + '-' + st, -1);
    if (to < today && frist >= today) out.push({ from, to, frist, label: ctlPeriodLabel(from, to) });
  }
  return out;
}
/* The settlement period of a property that contains a date */
function ctlPeriodOf(p, iso) {
  const st = _cxPerStart(p || {}), d = _cxD(iso);
  if (!d) return null;
  let y = Number(d.slice(0, 4)); if (d < y + '-' + st) y--;
  const from = y + '-' + st, to = _cxAddDays((y + 1) + '-' + st, -1);
  return { from, to, label: ctlPeriodLabel(from, to) };
}
function ctlPeriodLabel(from, to) {
  from = _cxD(from); to = _cxD(to);
  if (!from || !to) return '';
  if (from.slice(5) === '01-01' && to.slice(5) === '12-31' && from.slice(0, 4) === to.slice(0, 4)) return from.slice(0, 4);
  return from.slice(5, 7) + '/' + from.slice(0, 4) + '–' + to.slice(5, 7) + '/' + to.slice(0, 4);
}

/* Expected settlements for every open period (Rules 1, 2, 5):
   · per tenant × span of equal type (Kalt + NK | Pauschal) inside the period — Pauschal spans are
     listed (note 'Pauschal') so they can be set "nicht durchgeführt" (D25)
   · tenants without Einzug still listed ('Einzug fehlt'); units without Rentals link → one row per unit
   · every Rentals property: its Hausgeldabrechnung (WEG) per period; Casa Castel has no WEG (D6)
   · parking spaces: no NK                                                                           */
function ctlExpectedSettlements() {
  const out = [];
  for (const p of window._ctrl.properties.filter(x => x.active)) {
    const casa = p.id === CASA_PROP_ID;
    for (const per of ctlSettlementPeriods(p)) {
      const first = per.from, last = per.to, cy = Number(last.slice(0, 4));
      if (!casa) out.push({ property_id: p.id, tenant_id: null, kind: 'weg_hausgeld', covers_year: cy, period_from: first, period_to: last, note: null });
      for (const u of ctlUnitsFor(p.id)) {
        if (_cxIsParking(u)) continue;
        const link = ctlUnitLink(u, p);
        if (link && link.type === 'rentals_parking') continue;
        if (!link) { out.push({ property_id: p.id, tenant_id: null, kind: 'nk_tenant', covers_year: cy, period_from: first, period_to: last, note: u.name }); continue; }
        const all = _cxTenancies(link), memo = new Map();
        for (const w of all) {
          if (!w.from) {
            if (w.t.status === 'active') out.push({ property_id: p.id, tenant_id: w.id, app: _cxApp(link), kind: 'nk_tenant', covers_year: cy, period_from: first, period_to: last, note: 'Einzug fehlt' });
            continue;
          }
          if (w.from > last || w.to < first) continue;
          const from = w.from > first ? w.from : first, to = w.to < last ? w.to : last;
          // split the tenant's days into spans of equal type (Pauschal ↔ Kalt + NK)
          let spanFrom = from, mode = null;
          for (let d = from; d <= to; d = _cxAddDays(d, 1)) {
            const md = _cxRentDay(link, w, u, Number(d.slice(0, 4)), Number(d.slice(5, 7)), d, all, memo).mode;
            if (mode === null) mode = md;
            if (md !== mode) {
              out.push({ property_id: p.id, tenant_id: w.id, app: _cxApp(link), kind: 'nk_tenant', covers_year: cy, period_from: spanFrom, period_to: _cxAddDays(d, -1), note: mode === 'pauschal' ? 'Pauschal' : null });
              spanFrom = d; mode = md;
            }
          }
          out.push({ property_id: p.id, tenant_id: w.id, app: _cxApp(link), kind: 'nk_tenant', covers_year: cy, period_from: spanFrom, period_to: to, note: mode === 'pauschal' ? 'Pauschal' : null });
        }
      }
    }
  }
  return out;
}

/* Figures shown on a settlement row (computed live, never stored):
   days · NK Soll for exactly these days · NK paid (from Einnahmen, per-tenant split) ·
   Frist (end + 12 months) · for WEG rows: vacant days of the property in the period */
function ctlSettlementFigures(r) {
  const from = _cxD(r.period_from), to = _cxD(r.period_to);
  if (!from || !to) return null;
  const days = Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 864e5) + 1;
  const p = ctlProp(r.property_id);
  const frist = (() => { const e = new Date(to + 'T12:00:00'); e.setFullYear(e.getFullYear() + 1); return _cxIso(e.getFullYear(), e.getMonth() + 1, e.getDate()); })();
  const out = { days, frist, nkSoll: null, nkIst: null, vacant: null };
  if (!p) return out;
  if (r.kind === 'weg_hausgeld') {
    let vac = 0;
    for (const u of ctlUnitsFor(p.id)) {
      if (_cxIsParking(u)) continue;
      const link = ctlUnitLink(u, p); if (!link) continue;
      const all = _cxTenancies(link).filter(w => w.from);
      for (let d = from; d <= to; d = _cxAddDays(d, 1)) if (!all.some(w => w.from <= d && d <= w.to)) vac++;
    }
    out.vacant = vac;
    return out;
  }
  if (!r.tenant_id) return out;
  for (const u of ctlUnitsFor(p.id)) {
    const link = ctlUnitLink(u, p); if (!link || link.type === 'rentals_parking') continue;
    const all = _cxTenancies(link), w = all.find(x => x.id === String(r.tenant_id));
    if (!w || !w.from) continue;
    const memo = new Map();
    let soll = 0, ist = 0, istKnown = false;
    const months = new Map();                          // 'Y-M' → NK Soll of the row's days in that month
    for (let d = from; d <= to; d = _cxAddDays(d, 1)) {
      if (d < w.from || d > w.to) continue;
      const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)), N = new Date(y, m, 0).getDate();
      const nk = _cxRentDay(link, w, u, y, m, d, all, memo).nk / N;
      soll += nk; months.set(y + '-' + m, (months.get(y + '-' + m) || 0) + nk);
    }
    for (const [ym, nkPart] of months) {
      const [y, m] = ym.split('-').map(Number);
      const row = (window._src.incAll || []).find(x => u.id != null && x.unit_id === u.id && x.year === y && x.month === m);
      if (!row) continue;
      const s = ctlUnitSoll(u, p.id, y, m), part = (s.parts || []).find(x => x.tid === w.id);
      const i = ctlIstFor(row, s, w.id);
      if (i === null || !part || !part.amount) continue;
      ist += i * nkPart / part.amount; istKnown = true; // the NK share of what this tenant paid
    }
    out.nkSoll = _cxR(soll); out.nkIst = istKnown ? _cxR(ist) : null;
    return out;
  }
  return out;
}

/* Same expected settlement? (tenant rows by tenant + period, unit rows by unit name) */
function ctlSettlementSame(x, e) {
  return x.kind === e.kind && Number(x.property_id) === Number(e.property_id) &&
    String(x.tenant_id || '') === String(e.tenant_id || '') &&
    String(x.period_from || '').slice(0, 10) === String(e.period_from || '').slice(0, 10) &&
    (e.tenant_id || e.kind !== 'nk_tenant' || String(x.note || '') === String(e.note || ''));
}


/* Fix 2: an NK settlement for this tenant + year already booked in Einmalig from the
   Tenants tab (suggestion taken over)? Then the Abrechnungen list must not book it again. */
function ctlSettlementAlreadyBooked(r) {
  if (r.kind !== 'nk_tenant') return false;
  const S = window._src, yr = e => { const m = String(e.period || '').match(/20\d\d/g); return m ? Number(m[m.length - 1]) : null; };
  const refs = new Set((window._ctrl.one_time || []).map(o => o.source_ref).filter(Boolean));
  const list = r.app === 'casa' ? (S.casaNk || []).map(e => ['nk:' + e.id, e]) : (S.rntNk || []).map(e => ['rnt_nk:' + e.id, e]);
  return list.some(([ref, e]) => String(e.tenant_id) === String(r.tenant_id) && yr(e) === Number(r.covers_year) && refs.has(ref));
}
