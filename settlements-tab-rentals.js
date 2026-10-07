/* ─────────────────────────────────────────────────────────────
   SETTLEMENTS — RENTALS TAB (NK-Abrechnung der Wohnungen)
   settlements-tab-rentals.js

   Process per Wohnung and Abrechnungszeitraum (= the property's period,
   set in Tracking / here via "Change"):
     1  Hausgeldabrechnung der HV eintragen   one record per Wohnung + Zeitraum
        (date of the HV statement, cost positions, Verteilerschlüssel,
         umlagefähig yes/no) — "Vorjahr übernehmen" copies the structure
     2  Mieter im Zeitraum                    from the same model as Tracking
        (ctlSettlementModel): Kalt + NK tenants get a calculation,
        Pauschal spans and Leerstand are listed but not billed
     3  Berechnung je Mieter                  own days / period days, or a
        direct amount per tenant (e.g. Heizkosten after a Zwischenablesung),
        minus Vorauszahlungen (paid per Controlling, else contract Soll)
     4  PDF-Brief (German, A4, same look as the Rentals contracts)
     5  "Als verschickt speichern"            → Tracking + Controlling
        (same path as Tracking: ctrl_settlements + abr_results)

   Sources of truth (read only here)
     Wohnung, Adresse, m², Wohnungsnummer, Ort   Rentals › Apartments
     Hausverwaltung, Grundsteuer (€/Quartal)     Rentals › Apartments › Verwaltung
     Mieter, Ein-/Auszug, NK-Vorauszahlung       Rentals › Tenants (via the Soll engine)
     NK gezahlt                                  Controlling › Income
     Vermieter, Bankverbindung                   Profile (settings row)
   Own data: nk_abrechnung_rentals (SQL: SETTLEMENTS-RENTALS.sql)
   ───────────────────────────────────────────────────────────── */

'use strict';

const SR = {
  year: null, filter: 'all', modal: null, costsOpen: false, dirty: false, open: {},
  briefOpen: false,     // tenant panel: letter settings unfolded
  perEdit: false,       // tenant panel: Nutzungszeitraum being changed
  expEdit: false,       // HV panel: expected month being changed
  overOpen: false,      // phone: Überblick unfolded
  kaution: {},          // tenant_id → rnt_kaution row (Einbehalt bis NK-Abrechnung)
  sel: null,            // { kind: 'hv' | 'ten' | 'pausch', ck, tid }
  edit: false, draft: null,
  rows: [], loaded: false, loading: false, missing: false,
  letters: [],          // nk_letters (archive) — History
};
const SR_TABLE = 'nk_abrechnung_rentals';
const SR_MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const SR_NEW_COLS = ['received_on', 'asked_on', 'beschluss_on', 'weg_direction', 'weg_amount', 'weg_due', 'weg_via'];

/* ── Kostenarten (§ 2 BetrKV) ─────────────────────────────── */
const SR_KINDS = [
  { k: 'grundsteuer',  l: 'Grundsteuer',                          u: true,  key: 'direkt' },
  { k: 'wasser',       l: 'Wasserversorgung',                     u: true },
  { k: 'abwasser',     l: 'Entwässerung / Abwasser',              u: true },
  { k: 'heizung',      l: 'Heizkosten',                           u: true,  key: 'verbrauch' },
  { k: 'warmwasser',   l: 'Warmwasser',                           u: true,  key: 'verbrauch' },
  { k: 'aufzug',       l: 'Aufzug',                               u: true },
  { k: 'strassen',     l: 'Straßenreinigung',                     u: true },
  { k: 'muell',        l: 'Müllbeseitigung',                      u: true },
  { k: 'reinigung',    l: 'Gebäudereinigung',                     u: true },
  { k: 'ungeziefer',   l: 'Ungezieferbekämpfung',                 u: true },
  { k: 'garten',       l: 'Gartenpflege',                         u: true },
  { k: 'winter',       l: 'Winterdienst',                         u: true },
  { k: 'strom',        l: 'Allgemeinstrom / Beleuchtung',         u: true },
  { k: 'schornstein',  l: 'Schornsteinreinigung',                 u: true },
  { k: 'versicherung', l: 'Sach- und Haftpflichtversicherung',    u: true },
  { k: 'hauswart',     l: 'Hauswart',                             u: true },
  { k: 'antenne',      l: 'Gemeinschaftsantenne',                 u: true },
  { k: 'waesche',      l: 'Wäschepflege',                         u: true },
  { k: 'wartung',      l: 'Wartung Heizung / Anlagen',            u: true },
  { k: 'rwm_wartung',  l: 'Wartung Rauchwarnmelder',              u: true },
  { k: 'co2',          l: 'CO₂-Kosten – Anteil Vermieter',        u: true,  key: 'direkt', neg: true },
  { k: 'sonst',        l: 'Sonstige Betriebskosten',              u: true },
  { k: 'kabel',        l: 'Kabel-TV (Breitbandnetz)',             u: false, why: 'seit 01.07.2024 nicht mehr umlagefähig' },
  { k: 'verwaltung',   l: 'Verwaltungskosten',                    u: false },
  { k: 'ruecklage',    l: 'Erhaltungsrücklage',                   u: false },
  { k: 'instand',      l: 'Instandhaltung / Reparaturen',         u: false },
  { k: 'rwm_miete',    l: 'Miete Rauchwarnmelder',                u: false, why: 'BGH VIII ZR 379/20' },
  { k: 'bank',         l: 'Kontoführung / Bankgebühren',          u: false },
  { k: 'nu_sonst',     l: 'Sonstige nicht umlagefähig',           u: false },
];
const _srKind = k => SR_KINDS.find(x => x.k === k) || SR_KINDS.find(x => x.k === 'sonst');
const SR_KEYS = [
  ['flaeche', 'Wohnfläche'], ['mea', 'MEA'], ['einheiten', 'Einheiten'], ['personen', 'Personen'],
  ['verbrauch', 'Verbrauch'], ['direkt', 'nur diese Wohnung'],
];
const _srShareKey = k => ['flaeche', 'mea', 'einheiten', 'personen'].includes(k);

/* ── Small helpers ────────────────────────────────────────── */
const _srD = iso => String(iso || '').slice(0, 10);
const _srDays = (a, b) => Math.round((new Date(_srD(b) + 'T12:00:00') - new Date(_srD(a) + 'T12:00:00')) / 864e5) + 1;
const _srAdd = (iso, n) => { const d = new Date(_srD(iso) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const _srNum = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
const _srFmtN = (v, dec) => (Number(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: dec ?? 0, maximumFractionDigits: dec ?? 2 });
const _srE2in = v => (v === null || v === undefined || v === '' ? '' : cxE2(v));
const _srUid = () => 'p' + Math.random().toString(36).slice(2, 9);
const _srTName = t => t ? [t.first_name, t.last_name].filter(Boolean).join(' ') : '';
const _srTNames = t => t ? [_srTName(t), [t.first_name_2, t.last_name_2].filter(Boolean).join(' '), [t.first_name_3, t.last_name_3].filter(Boolean).join(' ')].filter(Boolean) : [];
const _srJoin = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1];
const _srCk = (pid, from) => pid + '|' + from;
const _srPerText = (from, to) => stPer(from, to);                 // dd.mm.yyyy–dd.mm.yyyy
function _srPerLabel(from, to) { return stPer(from, to); }

/* ── Data: own table ──────────────────────────────────────── */
async function srLoadRows() {
  SR.loading = true;
  try {
    if (typeof loadSettings === 'function') { try { await loadSettings(); } catch (e) {} }
    const { data, error } = await _ctlSupa.from(SR_TABLE).select('*');
    if (error) throw error;
    SR.rows = data || []; SR.missing = false;
    try {                                               // letter archive (nk_letters) — for the History
      const l = await _ctlSupa.from('nk_letters').select('*').order('sent_at', { ascending: false });
      SR.letters = l.error ? [] : (l.data || []);
    } catch (e) { SR.letters = []; }
    SR.cols = !!(SR.rows[0] ? Object.prototype.hasOwnProperty.call(SR.rows[0], 'received_on') : true);
    try {                                               // Kaution-Einbehalt (Rentals › Tenants) — read only here
      const k = await _ctlSupa.from('rnt_kaution').select('*');
      SR.kaution = {}; (k.data || []).forEach(x => { if (x.tenant_id) SR.kaution[String(x.tenant_id)] = x; });
    } catch (e) { SR.kaution = {}; }
  } catch (e) {
    SR.rows = [];
    SR.missing = /does not exist|42P01|relation|schema cache/i.test(String((e && (e.message || e.code)) || e));
    console.warn('[settlements] ' + SR_TABLE + ':', e && (e.message || e));
  } finally { SR.loaded = true; SR.loading = false; }
}
async function srSaveRow(rec) {
  const row = {
    property_id: rec.property_id, apartment_id: rec.apartment_id || null,
    period_from: rec.period_from, period_to: rec.period_to,
    hv_date: rec.hv_date || null, key_mode: rec.key_mode || 'flaeche',
    keys: rec.keys || {}, positions: rec.positions || [], tenants: rec.tenants || {},
    updated_at: new Date().toISOString(),
    received_on: rec.received_on || null, asked_on: rec.asked_on || [], beschluss_on: rec.beschluss_on || null,
    weg_direction: rec.weg_direction ?? null, weg_amount: rec.weg_amount ?? null, weg_due: rec.weg_due || null, weg_via: rec.weg_via || null,
  };
  const write = r => rec.id ? _ctlSupa.from(SR_TABLE).update(r).eq('id', rec.id).select().single()
                            : _ctlSupa.from(SR_TABLE).insert(r).select().single();
  let { data, error } = await write(row);
  if (error && /received_on|asked_on|beschluss_on|weg_/i.test(error.message || '')) {     // step-1 SQL not run yet → save the rest
    SR_NEW_COLS.forEach(k => delete row[k]);
    ({ data, error } = await write(row));
    if (!error) stSay('Saved – run the latest SQL to also store the received date and the WEG result');
  }
  if (error) throw error;
  const i = SR.rows.findIndex(x => x.id === data.id);
  if (i >= 0) SR.rows[i] = data; else SR.rows.push(data);
  return data;
}
/* Record of a Wohnung + Zeitraum (exact period, else the same end year — e.g. after the period start was changed) */
function _srRec(p, per) {
  const mine = SR.rows.filter(r => Number(r.property_id) === p.id);
  return mine.find(r => _srD(r.period_from) === per.from) ||
         mine.find(r => _srD(r.period_to).slice(0, 4) === per.to.slice(0, 4)) || null;
}
function _srPrevRec(p, per) {
  return SR.rows.filter(r => Number(r.property_id) === p.id && _srD(r.period_to) < per.from)
    .sort((a, b) => _srD(b.period_to).localeCompare(_srD(a.period_to)))[0] || null;
}

/* Tracking line object for a model item (so the Tracking state / save helpers can be reused) */
function _srLine(c, it) {
  const id = it.type === 'gap' ? 'g:' + c.p.id + '|' + it.unit.name + '|' + it.from : String(it.r.id);
  const l = { id, type: it.type, p: c.p, per: c.per, it, year: c.year, frist: c.per.frist,
              from: it.type === 'gap' ? it.from : _srD(it.r.period_from), to: it.type === 'gap' ? it.to : _srD(it.r.period_to) };
  try { l.state = _stState(l); } catch (e) { l.state = { k: 'offen', pill: ['open', 'offen'], text: '' }; }
  return l;
}
const _srTenantOf = r => (window._src.rntTen || []).find(t => String(t.id) === String(r.tenant_id)) || null;
function _srAptOf(c, t) {
  if (t && t.apartment_id) { const a = (window._src.apts || []).find(x => String(x.id) === String(t.apartment_id)); if (a) return a; }
  return c.apt;
}

/* The Zeitraum of this Abrechnung: the Wohnung's standard, or the one saved with the HV record (override) */
function _srPer(c, rec) {
  if (rec && rec.period_from && rec.period_to && (_srD(rec.period_from) !== c.per.from || _srD(rec.period_to) !== c.per.to)) {
    const to = _srD(rec.period_to), next = _srAdd(to, 1);
    return { from: _srD(rec.period_from), to, frist: _srAdd((Number(next.slice(0, 4)) + 1) + next.slice(4), -1), custom: true };
  }
  return c.per;
}
const _srToday = () => cxToday();
const _srLastOfMonth = (y, m) => y + '-' + String(m).padStart(2, '0') + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0');
/* When the HV's Jahresabrechnung is expected: the month set per Wohnung, else learned from the last arrival */
function _srExpected(c) {
  let m = Number(c.p.hv_expected_month) || null, learned = false;
  if (!m) {
    const last = SR.rows.filter(r => Number(r.property_id) === c.p.id && r.received_on).sort((a, b) => String(b.received_on).localeCompare(String(a.received_on)))[0];
    if (last) { m = Number(_srD(last.received_on).slice(5, 7)); learned = true; }
  }
  if (!m) return null;
  const end = c.per.to; let y = Number(end.slice(0, 4));
  if (m <= Number(end.slice(5, 7))) y++;
  const monthEnd = _srLastOfMonth(y, m);
  return { m, y, learned, from: y + '-' + String(m).padStart(2, '0') + '-01', overdue: _srAdd(monthEnd, 15), label: SR_MON[m - 1] + ' ' + y };
}

/* ── Calculation ──────────────────────────────────────────── */
function _srKeyVals(rec, pos, apt) {
  const K = (rec && rec.keys) || {};
  const ku = _srNum(pos.ku), kt = _srNum(pos.kt);
  if (pos.key === 'flaeche')   return { u: ku ?? _srNum(apt && apt.flaeche_m2) ?? _srNum(K.flaeche_u), t: kt ?? _srNum(K.flaeche_t) };
  if (pos.key === 'mea')       return { u: ku ?? _srNum(K.mea_u), t: kt ?? _srNum(K.mea_t) };
  if (pos.key === 'einheiten') return { u: ku ?? _srNum(K.einh_u) ?? 1, t: kt ?? _srNum(K.einh_t) };
  if (pos.key === 'personen')  return { u: ku, t: kt };
  return null;
}
/* Amount of one position for the whole Wohnung (override › Gesamtkosten × Anteil) */
function _srUnitAmt(rec, pos, apt) {
  const sign = _srKind(pos.kind).neg ? -1 : 1;
  const ov = _srNum(pos.amount);
  if (ov !== null) return cxR(sign * Math.abs(ov));
  if (!_srShareKey(pos.key)) return null;
  const kv = _srKeyVals(rec, pos, apt), tot = _srNum(pos.total);
  if (tot === null || !kv || !(kv.t > 0) || kv.u === null) return null;
  return cxR(sign * Math.abs(tot) * kv.u / kv.t);
}
function _srKeyText(rec, pos, apt) {
  const kv = _srKeyVals(rec, pos, apt);
  if (pos.key === 'flaeche')   return 'Wohnfläche ' + _srFmtN(kv.u ?? 0, 2) + ' / ' + _srFmtN(kv.t ?? 0, 2) + ' m²';
  if (pos.key === 'mea')       return 'MEA ' + _srFmtN(kv.u ?? 0, 2) + ' / ' + _srFmtN(kv.t ?? 0, 2);
  if (pos.key === 'einheiten') return 'Einheiten ' + _srFmtN(kv.u ?? 0) + ' / ' + _srFmtN(kv.t ?? 0);
  if (pos.key === 'personen')  return 'Personen ' + _srFmtN(kv.u ?? 0) + ' / ' + _srFmtN(kv.t ?? 0);
  if (pos.key === 'verbrauch') return 'Verbrauch lt. Einzelabrechnung';
  return 'direkt (nur diese Wohnung)';
}
/* HV record summary (for the card line and the panel) */
/* A cost belongs to the Hausgeld-Jahresabrechnung (origin 'hv', the default) or only to the NK (origin 'nk').
   A Hausgeld cost goes into the NK when it is umlagefähig and not unticked ('nk' false). */
const _srIsNkOnly = p => p.origin === 'nk';
const _srInNk = p => _srIsNkOnly(p) || (p.u && p.nk !== false);
function _srRecSummary(rec, apt) {                     // the Hausgeld side only
  let u = 0, nu = 0, missing = 0, n = 0;
  for (const pos of (rec && rec.positions) || []) {
    if (_srIsNkOnly(pos)) continue;
    n++;
    const a = _srUnitAmt(rec, pos, apt);
    if (a === null) { if (pos.split !== 'mieter') missing++; continue; }
    if (pos.u) u += a; else nu += a;
  }
  const ok = !!rec && n > 0 && !missing && !!rec.hv_date;
  return { u: cxR(u), nu: cxR(nu), missing, n, ok };
}

/* One tenant's settlement → { lines, sum, vz, vzSoll, vzIst, saldo, tDays, perDays, from, to, partial, missing, direct } */
function _srCalc(c, it, rec) {
  const r = it.r, per = _srPer(c, rec);
  const from = _srD(r.period_from) > per.from ? _srD(r.period_from) : per.from;
  const to = _srD(r.period_to) < per.to ? _srD(r.period_to) : per.to;
  const perDays = _srDays(per.from, per.to), tDays = Math.max(0, _srDays(from, to));
  const t = _srTenantOf(r), apt = _srAptOf(c, t);
  const ts = (rec && rec.tenants && rec.tenants[String(r.tenant_id)]) || {};
  const lines = []; let sum = 0, missing = 0, direct = false;
  for (const pos of (rec && rec.positions) || []) {
    if (!_srInNk(pos)) continue;
    const unit = _srUnitAmt(rec, pos, apt);
    if (unit === null && pos.split !== 'mieter') continue;          // no amount typed yet → not part of the NK
    let amt = null;
    if (pos.split === 'mieter') {
      const d = _srNum(ts.direct && ts.direct[pos.id]);
      if (d !== null) { amt = cxR((_srKind(pos.kind).neg ? -1 : 1) * Math.abs(d)); direct = true; } else missing++;
    } else if (unit !== null) amt = cxR(unit * tDays / perDays);
    else missing++;
    if (amt !== null) sum += amt;
    lines.push({ pos, unit, amt, keyText: _srKeyText(rec, pos, apt), total: _srNum(pos.total) });
  }
  const fig = (a, b) => { try { return ctlSettlementFigures(Object.assign({}, r, { period_from: a, period_to: b })); } catch (e) { return null; } };
  const since = _srD(c.p.in_portfolio_since);
  const rf = _srD(r.period_from), rt = _srD(r.period_to);
  let vzSoll, vzIst, pre = null, vzPartialFlag = false;
  if (since && since > rf && since <= rt) {
    // year of purchase: months before it → contract Soll (the seller collected them), after it → what Controlling shows
    const fb = fig(rf, _srAdd(since, -1)), fa = fig(since, rt);
    const preSoll = fb && fb.nkSoll !== null ? fb.nkSoll : 0;
    const aIst = fa && fa.nkIst !== null && !fa.istPartial && !fa.preStart ? fa.nkIst : null;
    const aSoll = fa && fa.nkSoll !== null ? fa.nkSoll : 0;
    pre = { from: rf, to: _srAdd(since, -1), soll: cxR(preSoll) };
    vzSoll = cxR(preSoll + aSoll);
    vzIst = aIst !== null ? cxR(preSoll + aIst) : null;
  } else {
    const f = fig(rf, rt);
    vzSoll = f && f.nkSoll !== null ? f.nkSoll : null;
    vzIst = f && f.nkIst !== null && !f.istPartial && !f.preStart ? f.nkIst : null;
    vzPartialFlag = !!(f && f.istPartial);
  }
  const vzOv = _srNum(ts.vz);
  const vz = vzOv !== null ? vzOv : (vzIst !== null ? vzIst : (vzSoll || 0));
  const f = { istPartial: vzPartialFlag };
  sum = cxR(sum);
  const kau = null, einbehalt = 0;
  return { lines, sum, vz: cxR(vz), vzSoll, vzIst, vzOv, vzPartial: !!(f && f.istPartial), pre, saldo: cxR(sum - vz),
           tDays, perDays, from, to, per, partial: tDays < perDays, missing, direct, t, apt, ts, kau, einbehalt };
}
const _srMovedOut = t => !!(t && t.mietende && _cxD(t.mietende) && _cxD(t.mietende) < cxToday());
const _srSaldoText = s => !s ? 'Ausgeglichen' : (s > 0 ? 'Nachzahlung ' : 'Guthaben ') + stEur(Math.abs(s));

/* Jahresabrechnung (step ①) — where it stands
   erwartet → überfällig → erfassen (received, positions/date missing) → weg (WEG result missing) → zahlung (WEG money open) → fertig */
function _srHvState(c, rec, sum) {
  const today = _srToday(), per = _srPer(c, rec);
  const received = !!(rec && (rec.received_on || rec.hv_date));
  const exp = _srExpected(c);
  const asked = ((rec && rec.asked_on) || []).map(_srD).filter(Boolean).sort();
  const fristSoon = per.frist && per.frist <= _srAdd(today, 60);
  const wegL = c.weg ? _srLine(c, c.weg) : null;
  const wegSt = wegL ? wegL.state : null;
  if (!received) {
    const over = exp ? today > exp.overdue : false;
    const line2 = exp ? (over ? 'overdue – expected ' + exp.label : 'expected around ' + exp.label) : 'expected – month not set';
    const k = over || fristSoon ? 'ueberfaellig' : 'erwartet';
    return { k, received, exp, asked, fristSoon, per, wegL, wegSt, todo: k === 'ueberfaellig', wait: k === 'erwartet',
             pill: fristSoon ? ['diff', 'Frist soon'] : over ? ['diff', 'overdue'] : ['grey', 'expected'],
             line2: line2 + (asked.length ? ' · asked ' + stDate(asked[asked.length - 1]) : '') };
  }
  const recv = 'received ' + stDate(rec.received_on || rec.hv_date);
  if (!sum.ok) return { k: 'erfassen', received, exp, asked, fristSoon, per, wegL, wegSt, todo: true, pill: ['open', 'enter'], line2: recv + ' · not fully entered yet' };
  const wegSet = rec.weg_direction !== null && rec.weg_direction !== undefined;
  if (!wegSet && !(wegSt && wegSt.res)) return { k: 'weg', received, exp, asked, fristSoon, per, wegL, wegSt, todo: true, pill: ['open', 'WEG result'], line2: recv + ' · WEG result missing' };
  if (wegSt && wegSt.k === 'verschickt') return { k: 'zahlung', received, exp, asked, fristSoon, per, wegL, wegSt, wait: true, pill: ['beige', 'payment open'], line2: recv + (rec.weg_due ? ' · due ' + stDate(rec.weg_due) : '') };
  const paid = wegSt && wegSt.booking ? ' · ' + (wegSt.res && wegSt.res.dir > 0 ? 'received ' : 'paid ') + stDate(wegSt.booking.invoice_date) : '';
  return { k: 'fertig', received, exp, asked, fristSoon, per, wegL, wegSt, pill: ['ok', wegSt && wegSt.booking ? (wegSt.res.dir > 0 ? 'received' : 'paid') : 'entered'], line2: recv + paid };
}

function _srBlankRec(c) {
  return { property_id: c.p.id, apartment_id: c.apt ? String(c.apt.id) : null, period_from: c.per.from, period_to: c.per.to,
           hv_date: null, key_mode: 'flaeche', keys: {}, positions: [], tenants: {},
           received_on: null, asked_on: [], beschluss_on: null, weg_direction: null, weg_amount: null, weg_due: null, weg_via: null };
}
/* E-mail to the HV: the letter for this period hasn't arrived */
function _srAskMail(c, hv, to) {
  const s = (typeof appSettings !== 'undefined' && appSettings) || {};
  const apt = c.apt || {}, per = hv.per;
  const obj = [apt.adresse, apt.wohnungsnummer ? 'Whg. ' + apt.wohnungsnummer : '', apt.plz_ort].filter(Boolean).join(', ') || c.p.name;
  const subj = 'Hausgeld-Jahresabrechnung ' + _srPerLabel(per.from, per.to) + ' – ' + obj;
  const body = 'Sehr geehrte Damen und Herren,\n\nfür meine Wohnung ' + obj + ' liegt mir die Hausgeld-Jahresabrechnung für den Zeitraum ' +
    cxFmtDate(per.from) + ' bis ' + cxFmtDate(per.to) + ' noch nicht vor.\n\nDa ich die Betriebskosten gegenüber meinen Mietern bis spätestens ' + cxFmtDate(per.frist) +
    ' abrechnen muss, bitte ich um Zusendung der Abrechnung bzw. um eine kurze Nachricht, wann ich mit ihr rechnen kann.\n\nMit freundlichen Grüßen\n' + (s.vermieter_name || '');
  return 'mailto:' + encodeURIComponent(to).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
}

/* Jahresabrechnung form — only what you need: Eingang · WEG-Ergebnis · umlagefähige Kosten der Wohnung.
   Each position is the Wohnung's amount from the HV's Einzelabrechnung; the split on the tenants is by days
   (or per tenant after a meter reading when the tenant changed). Keys/MEA/Gesamtkosten are not needed. */
function _srTenantChange(c) {
  return c.items.filter(x => x.type === 'row' && x.r.tenant_id && x.r.note !== 'Pauschal').length > 1;
}
/* Copy DOM fields → draft (before any re-render and on save) */
function _srCollect() {
  const d = SR.draft, host = document.getElementById('srPanel');
  if (!d || !host) return;
  host.querySelectorAll('[data-srf]').forEach(inp => {
    const path = inp.dataset.srf.split('.');
    const raw = inp.value;
    if (['hv_date', 'received_on', 'beschluss_on', 'weg_due'].includes(path[0])) { d[path[0]] = raw ? _srD(raw) : null; return; }
    if (path[0] === 'per_from') { if (raw) d.period_from = _srD(raw); return; }
    if (path[0] === 'per_to') { if (raw) d.period_to = _srD(raw); return; }
    if (path[0] === 'weg_amount') { d.weg_amount = raw === '' ? null : Math.abs(cxParse(raw)); return; }
    const v = path[0] === 'pos' && path[2] === 'label' ? (raw.trim() || null) : (raw === '' ? null : cxParse(raw));
    if (path[0] === 'keys') { d.keys[path[1]] = v; return; }
    if (path[0] === 'pos') { const p = d.positions[Number(path[1])]; if (p) p[path[2]] = v; }
  });
}
function _srNewPos(kind, d) {
  const k = _srKind(kind);
  return { id: _srUid(), kind: k.k, label: null, u: k.u, total: null, key: 'direkt', ku: null, kt: null, amount: null, split: 'tage' };
}
function _srCopyFrom(prev, d) {
  d.keys = Object.assign({}, prev.keys || {});
  d.key_mode = prev.key_mode || d.key_mode;
  d.positions = (prev.positions || []).filter(p => p.u).map(p => Object.assign({}, p, { id: _srUid(), total: null, amount: null, key: 'direkt', ku: null, kt: null }));
}
/* The WEG result → Tracking + Controlling (same records Tracking writes) */
async function _srWriteWeg(c, rec) {
  if (!c || !c.weg || rec.weg_direction === null || rec.weg_direction === undefined) return;
  const l = _srLine(c, c.weg), st = l.state, existing = st.res || null;
  const dir = Number(rec.weg_direction), amount = dir ? cxR(_srNum(rec.weg_amount) || 0) : 0;
  const via = rec.weg_via === 'hausgeld' ? 'hausgeld' : 'zahlung';
  if (existing && existing.dir === dir && Math.abs(existing.amount - amount) < 0.005 && existing.via === via &&
      _srD(existing.db.due_date) === _srD(rec.weg_due)) return;                                      // unchanged
  if (existing && st.booking && (existing.dir !== dir || Math.abs(existing.amount - amount) >= 0.005) &&
      !(await stConfirm({ title: 'Change the WEG result?', text: 'It is already booked as paid in Controlling.', ok: 'Change it' }))) return;
  const r = c.weg.r;
  const resRow = { property_id: c.p.id, kind: 'weg_hausgeld', year: Number(r.covers_year), period_from: _srD(r.period_from) || null, period_to: _srD(r.period_to) || null,
                   app: 'rentals', tenant_id: null, unit_label: null, tenant_name: null, direction: dir, amount,
                   result_date: _srD(rec.received_on || rec.hv_date) || cxToday(), due_date: _srD(rec.weg_due) || null, settle_via: via, status: 'fertig', source: 'settlements_app' };
  try {
    const row = await _stUpsertSettlement(l, { status: 'verschickt', amount, direction: dir, settled_via: via });
    const saved = await _stWriteResult(existing ? existing.db : null, resRow);
    await _ctlSupa.from('ctrl_settlements').update({ result_id: saved.id }).eq('id', row.id);
    row.result_id = saved.id;
    ctlSettlementInvalidate();
  } catch (err) {
    const msg = String((err && (err.message || err.code)) || err);
    stSay(/abr_results_one_weg|duplicate|23505/i.test(msg) ? 'There is already a Hausgeld-Abrechnung for this year in Controlling' : 'WEG result not saved — ' + msg);
  }
}

const _srSign = x => x.missing ? 'm' : String(Math.sign(x.saldo));
/* How the result is settled: chosen in the letter, else Kaution when part of it is held back, else transfer */
const _srViaOf = x => (x.ts && x.ts.via) || 'zahlung';
function _srBig(x, date, days, via) {
  if (x.missing) return '<div class="sr-res sr-res--open"><span><b>Result</b><small>amounts per tenant missing</small></span><strong>—</strong></div>';
  const due = _srAdd(date || cxToday(), days ?? 30);
  const lab = x.saldo > 0 ? 'Nachzahlung' : x.saldo < 0 ? 'Guthaben' : 'Balanced';
  const sub = via === 'kaution' && x.einbehalt > 0 ? 'offset with the Kaution-Einbehalt' : !x.saldo ? 'no money moves' : (via === 'zahlung' || !via ? 'by ' + stDate(due) + ' · bank transfer' : _srViaText[via]);
  return '<div class="sr-res' + (x.saldo > 0 ? ' sr-res--nach' : x.saldo < 0 ? ' sr-res--gut' : '') + '"><span><b>' + lab + '</b><small>' + stEsc(sub) + '</small></span><strong>' + stEur(Math.abs(x.saldo)) + '</strong></div>';
}
/* What the letter needs — and where to fix it */
function _srChecks(c, it, rec, x) {
  const s = (typeof appSettings !== 'undefined' && appSettings) || {};
  const ts = x.ts, via = _srViaOf(x);
  const addr = ts.addr !== undefined && ts.addr !== null ? ts.addr : _srDefaultAddr(c, it, x);
  const miss = [];
  if (!String(s.vermieter_name || '').trim()) miss.push('your name → Profile');
  if (!String(s.vermieter_adresse || '').trim()) miss.push('your address → Profile');
  if (x.saldo > 0 && (via === 'zahlung' || (via === 'kaution' && x.einbehalt > 0 && x.saldo > x.einbehalt))) {
    if (!String(s.iban || '').trim()) miss.push('IBAN → Profile');
    if (!String(s.kontoinhaber || '').trim()) miss.push('Kontoinhaber → Profile');
  }
  if (!String(addr || '').trim()) miss.push('tenant’s address → Edit letter');
  if (!rec.hv_date) miss.push('statement date of the Jahresabrechnung');
  if (x.missing) miss.push('amounts per tenant → Breakdown');
  return miss;
}
function _srCheckHtml(c, it, rec, x) {
  const miss = _srChecks(c, it, rec, x);
  return miss.length
    ? '<div class="sr-check is-warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i><span>Letter still needs: ' + stEsc(miss.join(' · ')) + '</span></div>'
    : '<div class="sr-check"><i class="ti ti-check" aria-hidden="true"></i><span>Letter complete: sender and bank from Profile, address, statement date, all amounts.</span></div>';
}
/* Live update of sum, result and check while typing (no re-render → the keyboard stays) */
function _srRefreshTenant() {
  const got = _srCollectTenant(); if (!got) return null;
  const x = _srCalc(got.c, got.it, got.rec), ts = got.ts;
  const sumEl = document.querySelector('#srPanel [data-sr-sum]'); if (sumEl) sumEl.textContent = stEur(x.sum);
  const resEl = document.querySelector('#srPanel [data-sr-res]'); if (resEl) resEl.innerHTML = _srBig(x, ts.date || cxToday(), _srNum(ts.days) ?? 30, _srViaOf(x));
  const chk = document.querySelector('#srPanel [data-sr-check]'); if (chk) chk.innerHTML = _srCheckHtml(got.c, got.it, got.rec, x);
  document.querySelectorAll('#srPanel [data-sr="pdf"], #srPanel [data-sr="send"]').forEach(b => { b.disabled = !!x.missing; });
  return { got, x };
}
function _srDefaultAddr(c, it, x) {
  const t = x.t, apt = x.apt || c.apt;
  const aptLines = apt ? [[apt.adresse, apt.wohnungsnummer ? 'Whg. ' + apt.wohnungsnummer : ''].filter(Boolean).join(', '), apt.plz_ort || ''].filter(Boolean).join('\n') : '';
  if (_srMovedOut(t) && t.address && String(t.address).trim() && !(apt && apt.adresse && String(t.address).includes(apt.adresse))) return String(t.address).trim().replace(/,\s*(\d{5})/, '\n$1');
  return aptLines;
}
function _srDefaultAnlagen(rec) {
  const heat = (rec.positions || []).some(p => p.u && (p.key === 'verbrauch' || ['heizung', 'warmwasser'].includes(p.kind)));
  return 'Einzelabrechnung der Hausverwaltung' + (heat ? ', Heizkostenabrechnung' : '');
}

/* Tenant letter settings: DOM → record (saved in the background) */
let _srTsTimer = null;
function _srCollectTenant() {
  const c = _srCards[SR.sel && SR.sel.ck]; if (!c) return null;
  const it = c.items.find(x => x.type === 'row' && String(x.r.id) === String(SR.sel.tid)); if (!it) return null;
  const rec = _srRec(c.p, c.per); if (!rec) return null;
  const tid = String(it.r.tenant_id);
  rec.tenants = rec.tenants || {};
  const ts = rec.tenants[tid] = rec.tenants[tid] || {};
  document.querySelectorAll('#srPanel [data-srt]').forEach(inp => {
    const k = inp.dataset.srt, v = inp.value;
    if (k.startsWith('direct.')) { ts.direct = ts.direct || {}; ts.direct[k.slice(7)] = v === '' ? null : cxParse(v); return; }
    if (k === 'vz') {
      const n = v === '' ? null : cxParse(v);
      const def = _srCalc(c, it, Object.assign({}, rec, { tenants: Object.assign({}, rec.tenants, { [tid]: Object.assign({}, ts, { vz: null }) }) })).vz;
      ts.vz = n === null || Math.abs(n - def) < 0.005 ? null : n;              // equal to the data → keep following the data
      return;
    }
    if (k === 'new_vz') { ts.new_vz = v === '' ? null : cxParse(v); return; }
    if (k === 'days') { ts.days = v === '' ? null : Math.max(0, Math.round(Number(String(v).replace(',', '.')) || 0)); return; }
    if (k === 'date' || k === 'new_vz_from') { ts[k] = v ? _srD(v) : null; return; }
    ts[k] = v;
  });
  return { c, it, rec, ts };
}
function _srQueueTenantSave(rec) {
  clearTimeout(_srTsTimer);
  _srTsTimer = setTimeout(() => { srSaveRow(rec).catch(err => stSay('Speichern fehlgeschlagen — ' + (err.message || err))); }, 600);
}

/* 4 · PDF letter ─────────────────────────────────────────── */
async function _srPdf(btn) {
  const got = _srCollectTenant(); if (!got) return;
  const { c, it, rec, ts } = got;
  _srQueueTenantSave(rec);
  const x = _srCalc(c, it, rec);
  if (x.missing) { stSay('Please enter all amounts first'); return; }
  const reset = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '<i class="ti ti-loader" aria-hidden="true"></i> Creating PDF'; btn.disabled = true; }
  try {
    const out = await _srLetterBlob(c, it, rec, ts, x);
    if (btn) btn.innerHTML = '<i class="ti ti-loader" aria-hidden="true"></i> Opening PDF';
    await ccOpenPdf(out.blob, out.name);
  } catch (err) {
    console.error('[settlements] NK PDF', err);
    stNotice('The PDF could not be created. Please try again.');
  } finally {
    if (btn) { btn.innerHTML = reset; btn.disabled = false; }
  }
}
/* The letter as a PDF file (not opened) — for "Create PDF" and for the archive on "Mark sent" */
async function _srLetterBlob(c, it, rec, ts, x) {
  {
    if (typeof loadSettings === 'function') await loadSettings();
    const d = _srLetterData(c, it, rec, x, ts);
    let box = document.getElementById('_pdfRenderContainer'); if (box) box.remove();
    box = document.createElement('div');
    box.id = '_pdfRenderContainer';
    box.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#ffffff;z-index:-1;font-size:11.33px;';
    box.innerHTML = srLetterHtml(d);
    document.body.appendChild(box);
    try { await document.fonts.ready; } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
    try {
      // flow first (nothing cut off), then "Seite x von y" — the shared renumbering only knows bare numbers
      try { await ccFlowPages(box); } catch (e) {}
      const pages = box.querySelectorAll('.pdf-page');
      pages.forEach((pg, i) => { const a = pg.querySelector('.pgn'), b = pg.querySelector('.pgt'); if (a) a.textContent = String(i + 1); if (b) b.textContent = String(pages.length); });
      const pdf = await ccRenderPagesToPdf(box);
      const name = ccPdfSafeName(ccPdfFileName('NK-Abrechnung', d.periodLabel.replace(/\//g, '-'), d.aptName, (d.names[0] || '').split(' ').slice(-1)[0]));
      return { blob: pdf.output('blob'), name, d };
    } finally { box.remove(); }
  }
}
/* Mark sent → keep the letter exactly as sent (storage "nk-letters" + table nk_letters) */
async function _srArchive(c, it, rec, ts, x, dir, amount) {
  try {
    const out = await _srLetterBlob(c, it, rec, ts, x);
    const cy = Number(it.r.covers_year) || Number(c.per.to.slice(0, 4));
    const path = 'rentals/' + cy + '/' + Date.now() + '-' + out.name;
    const up = await _ctlSupa.storage.from('nk-letters').upload(path, out.blob, { contentType: 'application/pdf', upsert: false });
    if (up.error) throw up.error;
    const row = { app: 'rentals', property_id: c.p.id, year: cy, period_from: _srD(it.r.period_from) || null, period_to: _srD(it.r.period_to) || null,
                  tenant_id: it.r.tenant_id ? String(it.r.tenant_id) : null, tenant_name: (out.d.names || []).join(', ') || null, unit_label: c.p.name,
                  address: (out.d.addr || []).join('\n') || null, direction: dir, amount, file_path: path, file_name: out.name, source: 'app', sent_at: new Date().toISOString() };
    const ins = await _ctlSupa.from('nk_letters').insert(row).select().single();
    if (ins.error) throw ins.error;
    SR.letters = [ins.data].concat(SR.letters || []);
    if (typeof SC !== 'undefined' && SC.loaded) SC.letters.unshift(ins.data);
  } catch (e) { console.warn('[settlements] archive', e); stSay('Marked sent · the letter could not be archived (' + (e.message || e) + ')'); }
}

function _srLetterData(c, it, rec, x, ts) {
  const s = (typeof appSettings !== 'undefined' && appSettings) || {};
  const t = x.t, apt = x.apt || c.apt || {};
  const date = ts.date || cxToday();
  const addr = ts.addr !== undefined && ts.addr !== null ? ts.addr : _srDefaultAddr(c, it, x);
  const periodLabel = _srPerLabel(c.per.from, c.per.to);
  const sender = [s.vermieter_name, ...String(s.vermieter_adresse || '').split(/\s*,\s*|\n/)].map(z => String(z || '').trim()).filter(Boolean);
  return {
    aptName: apt.name || c.p.name, wohnungsnummer: apt.wohnungsnummer || '',
    objekt: [[apt.adresse, apt.wohnungsnummer ? 'Whg. ' + apt.wohnungsnummer : ''].filter(Boolean).join(', '), apt.plz_ort].filter(Boolean).join(', '),
    footer: apt.adresse ? apt.adresse + (apt.plz_ort ? ' \u00b7 ' + apt.plz_ort : '') : (apt.plz_ort || ''),
    ort: apt.unterschrift_ort || '',
    vermieter: s.vermieter_name || '', sender,
    bank: { inhaber: s.kontoinhaber || '', bank: s.bankname || '', iban: s.iban || '', bic: s.bic || '' },
    names: _srTNames(t), addr: String(addr || '').split('\n').map(z => z.trim()).filter(Boolean),
    date, due: _srAdd(date, _srNum(ts.days) ?? 30), periodLabel, perFrom: c.per.from, perTo: c.per.to, perDays: x.perDays,
    useFrom: x.from, useTo: x.to, tDays: x.tDays, partial: x.partial,
    hvName: (c.verw && c.verw.hausverwaltung) || '', hvDate: rec.hv_date,
    lines: x.lines.filter(l => l.amt !== null), direct: x.direct,
    sum: x.sum, vz: x.vz, saldo: x.saldo, via: _srViaOf(x), einbehalt: x.einbehalt,
    newVz: _srNum(ts.new_vz), newVzFrom: ts.new_vz_from || null,
    anlagen: ts.anlagen !== undefined && ts.anlagen !== null ? ts.anlagen : _srDefaultAnlagen(rec),
    hasVerbrauch: x.lines.some(l => l.pos.key === 'verbrauch' || ['heizung', 'warmwasser'].includes(l.pos.kind)), hasFlaeche: x.lines.some(l => l.pos.key === 'flaeche'), hasMea: x.lines.some(l => l.pos.key === 'mea'),
    keyMode: rec.key_mode || 'flaeche',
    tenantIban: ts.iban || '', former: _srMovedOut(t),
    verwendung: 'NK ' + periodLabel + ' ' + (apt.name || c.p.name) + (t && t.last_name ? ' ' + t.last_name : ''),
  };
}

/* The letter: same page frame, fonts and colours as the Rentals contracts. Lean: only what the Abrechnung needs. */
function srLetterHtml(d) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const eur = n => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0\u20ac';
  const dt = iso => cxFmtDate(iso);
  const nb = s => String(s).replace(/§ /g, '§\u00a0').replace(/Abs\. /g, 'Abs.\u00a0').replace(/Satz /g, 'Satz\u00a0');
  const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300&display=swap');`;
  const CSS = `
    * { margin:0; padding:0; box-sizing:border-box; }
    .page { position:relative; width:793.71px; height:1122.52px; background:#ffffff; overflow:hidden; }
    .hdr { position:absolute; top:0; left:0; right:0; height:83.15px; background:#f0e8da; display:flex; align-items:center; justify-content:space-between; padding:0 80px; }
    .hdr__wordmark { font-family:'Playfair Display',serif; font-size:26px; font-weight:400; color:#7a5c30; letter-spacing:0.05em; line-height:1; }
    .hdr__room { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
    .hdr__room-label { font-family:'Lato',sans-serif; font-size:7px; font-weight:400; letter-spacing:0.16em; text-transform:uppercase; color:#b8975a; line-height:1; }
    .hdr__room-name { font-family:'Playfair Display',serif; font-size:12px; font-weight:400; color:#7a5c30; line-height:1; }
    .ftr { position:absolute; left:80px; right:80px; bottom:32px; }
    .ftr__rule { border:none; border-top:0.5px solid #e8dbc5; margin-bottom:7px; }
    .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif; font-size:8px; font-weight:300; color:#aaa59e; line-height:1; }
    .content { position:absolute; top:122px; left:80px; right:80px; bottom:62px; overflow:hidden; }
    .doc-title { font-family:'Playfair Display',serif; font-size:21px; font-weight:400; color:#1a1a1a; line-height:1.15; margin-bottom:4px; }
    .doc-subtitle { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:300; color:#aaa59e; line-height:1.5; margin-bottom:20px; }
    .sec { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:#4a4540; margin-top:20px; padding-bottom:5px; border-bottom:0.6px solid #d8d3cc; }
    .sec--first { margin-top:0; }
    .addr { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:34px; }
    .addr__l { width:360px; }
    .addr__ret { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:400; color:#6f6a63; padding-bottom:4px; border-bottom:0.5px solid #e8dbc5; margin-bottom:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .addr__line { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:#1a1a1a; line-height:1.5; }
    .meta { text-align:right; }
    .meta__k { font-family:'Lato',sans-serif; font-size:7px; font-weight:400; letter-spacing:0.16em; text-transform:uppercase; color:#b8975a; line-height:1; }
    .meta__v { font-family:'Lato',sans-serif; font-size:11px; font-weight:400; color:#3a3530; line-height:1.3; margin-top:3px; }
    .p { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#3a3530; line-height:1.6; margin-top:10px; }
    .p strong { font-weight:700; color:#1a1a1a; }
    .sum { width:360px; margin-top:4px; }
    .sum__r { display:flex; justify-content:space-between; font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#3a3530; padding:5px 0; border-bottom:0.5px solid #f0ede8; }
    .sum__r span:last-child { font-weight:400; color:#1a1a1a; font-variant-numeric:tabular-nums; }
    .total-box { background:#f0e8d8; border-radius:3px; padding:10px 12px; display:flex; justify-content:space-between; margin-top:8px; font-family:'Lato',sans-serif; font-size:12px; font-weight:700; color:#8a6535; line-height:1; }
    .kv { display:flex; padding:3px 0; font-family:'Lato',sans-serif; font-size:12px; }
    .kv__k { font-weight:300; color:#3a3530; width:150px; flex-shrink:0; }
    .kv__v { font-weight:400; color:#1a1a1a; }
    .bank { margin-top:8px; }
    .hint { display:flex; gap:8px; font-family:'Lato',sans-serif; font-size:10px; font-weight:300; color:#3a3530; line-height:1.55; padding:2px 0; }
    .hint::before { content:'\\2013'; color:#b8975a; flex-shrink:0; }
    .greet { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#3a3530; margin-top:24px; }
    .greet__name { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:#1a1a1a; margin-top:26px; }
    .anl { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:300; color:#888780; margin-top:18px; }
    .intro2 { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#3a3530; line-height:1.55; margin:8px 0 6px; }
    .nk { width:100%; border-collapse:collapse; table-layout:fixed; margin-top:4px; }
    .nk th { font-family:'Lato',sans-serif; font-size:7px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#888780; text-align:left; padding:4px 0 6px; border-bottom:0.5px solid #d8d3cc; vertical-align:bottom; line-height:1.35; }
    .nk td { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#1a1a1a; padding:4px 0 5px; vertical-align:top; line-height:1.4; }
    .nk .r { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .nk td.k { font-size:9.5px; color:#4a4540; padding-left:16px; }
    .nk th.k { padding-left:16px; }
    .nk tr.s td { font-weight:700; border-top:0.6px solid #d8d3cc; padding-top:9px; }
    .nk tbody tr:nth-last-child(3) td { padding-bottom:9px; }
    .res2 { margin-top:8px; }
    .note2 { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:300; color:#6f6a63; line-height:1.55; margin-top:14px; }
  `;
  const hdr = `<div class="hdr"><span class="hdr__wordmark">${esc(d.aptName)}</span><div class="hdr__room"><span class="hdr__room-label">Wohnung</span><span class="hdr__room-name">${esc(d.wohnungsnummer)}</span></div></div>`;
  const ftr = () => `<div class="ftr"><hr class="ftr__rule"/><div class="ftr__row"><span>${esc(d.footer)}</span><span>Seite <span class="pgn">1</span> von <span class="pgt">2</span></span></div></div>`;
  const kv = (k, v) => `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v}</span></div>`;

  const perTxt = dt(d.perFrom) + ' bis ' + dt(d.perTo);
  const amt = Math.abs(d.saldo);
  const resLabel = d.saldo > 0 ? 'Nachzahlung' : d.saldo < 0 ? 'Guthaben' : 'Ergebnis';
  let pay;
  if (d.saldo > 0 && d.via === 'zahlung') {
    pay = `<p class="p">Bitte überweisen Sie den Betrag von <strong>${eur(amt)}</strong> bis zum <strong>${dt(d.due)}</strong> auf folgendes Konto:</p>
      <div class="bank">${kv('Kontoinhaber', esc(d.bank.inhaber))}${d.bank.bank ? kv('Bank', esc(d.bank.bank)) : ''}${kv('IBAN', esc(d.bank.iban))}${d.bank.bic ? kv('BIC', esc(d.bank.bic)) : ''}${kv('Verwendungszweck', esc(d.verwendung))}</div>`;
  } else if (d.saldo > 0 && d.via === 'kaution' && d.einbehalt > 0) {
    const rest = Math.round((d.einbehalt - amt) * 100) / 100;
    pay = rest >= 0
      ? `<p class="p">Den Betrag von <strong>${eur(amt)}</strong> verrechnen wir mit dem einbehaltenen Teil Ihrer Mietkaution (${eur(d.einbehalt)}).${rest > 0 ? ` Den verbleibenden Betrag von <strong>${eur(rest)}</strong> überweisen wir Ihnen bis zum <strong>${dt(d.due)}</strong> auf Ihr uns bekanntes Konto.` : ' Sie müssen nichts überweisen.'}</p>`
      : `<p class="p">Den Betrag von <strong>${eur(amt)}</strong> verrechnen wir mit dem einbehaltenen Teil Ihrer Mietkaution (${eur(d.einbehalt)}). Bitte überweisen Sie den verbleibenden Betrag von <strong>${eur(-rest)}</strong> bis zum <strong>${dt(d.due)}</strong> auf folgendes Konto:</p>
      <div class="bank">${kv('Kontoinhaber', esc(d.bank.inhaber))}${d.bank.bank ? kv('Bank', esc(d.bank.bank)) : ''}${kv('IBAN', esc(d.bank.iban))}${d.bank.bic ? kv('BIC', esc(d.bank.bic)) : ''}${kv('Verwendungszweck', esc(d.verwendung))}</div>`;
  } else if (d.saldo > 0 && d.via === 'kaution') {
    pay = `<p class="p">Den Betrag von <strong>${eur(amt)}</strong> verrechnen wir mit Ihrer Mietkaution. Sie müssen nichts überweisen.</p>`;
  } else if (d.saldo > 0) {
    pay = `<p class="p">Bitte zahlen Sie den Betrag von <strong>${eur(amt)}</strong> zusammen mit Ihrer nächsten Miete, spätestens bis zum <strong>${dt(d.due)}</strong> (Verwendungszweck: ${esc(d.verwendung)}).</p>`;
  } else if (d.saldo < 0 && d.via === 'zahlung' && d.tenantIban) {
    pay = `<p class="p">Das Guthaben von <strong>${eur(amt)}</strong> überweisen wir Ihnen bis zum <strong>${dt(d.due)}</strong> auf Ihr Konto ${esc(d.tenantIban)}.</p>`;
  } else if (d.saldo < 0 && d.via === 'zahlung' && d.former) {
    pay = `<p class="p">Das Guthaben von <strong>${eur(amt)}</strong> überweisen wir Ihnen gern. Bitte teilen Sie uns dafür Ihre aktuelle Bankverbindung (IBAN) mit.</p>`;
} else if (d.saldo < 0 && d.via === 'zahlung') {
    pay = `<p class="p">Das Guthaben von <strong>${eur(amt)}</strong> überweisen wir Ihnen bis zum <strong>${dt(d.due)}</strong> auf Ihr uns bekanntes Konto. Hat sich Ihre Bankverbindung geändert, teilen Sie uns die neue bitte kurz mit.</p>`;
  } else if (d.saldo < 0 && d.via === 'miete') {
    pay = `<p class="p">Das Guthaben von <strong>${eur(amt)}</strong> können Sie mit Ihrer nächsten Mietzahlung verrechnen: Überweisen Sie die nächste Miete um diesen Betrag gekürzt.</p>`;
  } else if (d.saldo < 0 && d.einbehalt > 0) {
    pay = `<p class="p">Das Guthaben von <strong>${eur(amt)}</strong> zahlen wir Ihnen zusammen mit dem einbehaltenen Teil Ihrer Mietkaution (${eur(d.einbehalt)}), insgesamt <strong>${eur(amt + d.einbehalt)}</strong>, bis zum <strong>${dt(d.due)}</strong> auf Ihr uns bekanntes Konto aus.</p>`;
  } else if (d.saldo < 0) {
    pay = `<p class="p">Das Guthaben von <strong>${eur(amt)}</strong> berücksichtigen wir bei der Abrechnung Ihrer Mietkaution.</p>`;
  } else if (d.einbehalt > 0) {
    pay = `<p class="p">Ihre Vorauszahlungen decken Ihren Kostenanteil genau. Den einbehaltenen Teil Ihrer Mietkaution von <strong>${eur(d.einbehalt)}</strong> überweisen wir Ihnen bis zum <strong>${dt(d.due)}</strong> auf Ihr uns bekanntes Konto.</p>`;
  } else {
    pay = `<p class="p">Ihre Vorauszahlungen decken Ihren Kostenanteil genau – es ergibt sich weder eine Nachzahlung noch ein Guthaben.</p>`;
  }
  const vzNew = d.newVz !== null && d.newVz !== undefined
    ? `<p class="p">Auf Grundlage dieser Abrechnung passen wir Ihre monatliche Betriebskostenvorauszahlung nach ${nb('§ 560 Abs. 4 BGB')} ${d.newVzFrom ? 'ab dem <strong>' + dt(d.newVzFrom) + '</strong> ' : ''}auf <strong>${eur(d.newVz)}</strong> an.</p>` : '';

  const page1 = `<div class="pdf-page page">${hdr}${ftr()}<div class="content">
    <div class="addr"><div class="addr__l">
      <div class="addr__ret">${esc(d.sender.join(' \u00b7 '))}</div>
      ${d.names.map(n => `<div class="addr__line">${esc(n)}</div>`).join('')}${d.addr.map(n => `<div class="addr__line">${esc(n)}</div>`).join('')}
    </div><div class="meta"><div class="meta__k">Datum</div><div class="meta__v">${esc((d.ort ? d.ort + ', ' : '') + dt(d.date))}</div></div></div>
    <div class="doc-title">Betriebskostenabrechnung ${esc(d.periodLabel)}</div>
    <div class="doc-subtitle">${d.objekt ? 'Mietobjekt ' + esc(d.objekt) + ' \u00b7 ' : ''}Abrechnungszeitraum ${perTxt}${d.hvDate ? '<br/>Grundlage: Hausgeldabrechnung ' + (d.hvName ? esc(d.hvName) + ' ' : '') + 'vom ' + dt(d.hvDate) : ''}</div>
    <p class="p" style="margin-top:0">${d.names.length ? 'Guten Tag ' + esc(_srJoin(d.names)) + ',' : 'Sehr geehrte Damen und Herren,'}</p>
    <p class="p">hiermit rechnen wir die Betriebskosten für Ihre ${d.former ? 'ehemalige ' : ''}Wohnung für den Abrechnungszeitraum vom <strong>${perTxt}</strong> ab.${d.partial ? ` Sie haben die Wohnung in diesem Zeitraum vom ${dt(d.useFrom)} bis ${dt(d.useTo)} genutzt (${d.tDays} von ${d.perDays} Tagen); die Kosten sind deshalb zeitanteilig berechnet.` : ''}</p>
    <div class="sec">Ergebnis</div>
    <div class="sum">
      <div class="sum__r"><span>Ihr Anteil an den Betriebskosten</span><span>${eur(d.sum)}</span></div>
      <div class="sum__r"><span>abzüglich Ihrer Vorauszahlungen</span><span>\u2212\u00a0${eur(d.vz)}</span></div>
      <div class="total-box"><span>${resLabel}</span><span>${d.saldo ? eur(amt) : 'ausgeglichen'}</span></div>
    </div>
    ${pay}${vzNew}
    <div class="sec">Hinweise</div>
    <div style="margin-top:6px">
      <div class="hint"><span>Die Aufstellung aller Kosten, die Verteilerschlüssel und die Berechnung Ihres Anteils finden Sie auf Seite 2.</span></div>
      <div class="hint"><span>Die Belege können Sie nach vorheriger Terminabsprache einsehen.</span></div>
      <div class="hint"><span>${esc(nb('Einwendungen gegen diese Abrechnung teilen Sie uns bitte spätestens bis zum Ablauf des zwölften Monats nach Zugang mit (§ 556 Abs. 3 Satz 5 BGB).'))}</span></div>
    </div>
    <p class="greet">Mit freundlichen Grüßen</p>
    <p class="greet__name">${esc(d.vermieter)}</p>
    ${d.anlagen ? `<p class="anl">Anlage: ${esc(d.anlagen)}</p>` : ''}
  </div></div>`;

  // page 2 — the statement
  // simple (the usual case): the Wohnung's amounts from the HV's Einzelabrechnung → your share by days;
  // the Einzelabrechnung is attached and shows the Gesamtkosten and how they were split on the Wohnung
  const simple = d.lines.every(l => !_srShareKey(l.pos.key) || _srNum(l.pos.amount) !== null);
  const five = d.partial || d.direct;
  const span = simple ? (five ? 2 : 1) : (five ? 4 : 3);
  let cols, th, rows;
  if (simple) {
    cols = five ? '<col style="width:52%"/><col style="width:24%"/><col style="width:24%"/>' : '<col style="width:72%"/><col style="width:28%"/>';
    th = `<tr><th>Kostenart</th><th class="r">Kosten der Wohnung</th>${five ? `<th class="r">Ihr Anteil${d.partial ? '<br/>' + d.tDays + '/' + d.perDays + ' Tage' : ''}</th>` : ''}</tr>`;
    rows = d.lines.map(l => `<tr><td>${esc(l.pos.label || _srKind(l.pos.kind).l)}${l.pos.split === 'mieter' ? ' <span style="color:#888780">(Zwischenablesung)</span>' : ''}</td><td class="r">${l.unit !== null ? eur(l.unit) : '\u2014'}</td>${five ? `<td class="r">${eur(l.amt)}</td>` : ''}</tr>`).join('');
  } else {
    cols = five ? '<col style="width:30%"/><col style="width:15%"/><col style="width:25%"/><col style="width:15%"/><col style="width:15%"/>'
                : '<col style="width:36%"/><col style="width:18%"/><col style="width:28%"/><col style="width:18%"/>';
    th = `<tr><th>Kostenart</th><th class="r">Gesamtkosten</th><th class="k">Verteilerschlüssel</th><th class="r">Anteil Wohnung</th>${five ? `<th class="r">Ihr Anteil${d.partial ? '<br/>' + d.tDays + '/' + d.perDays + ' Tage' : ''}</th>` : ''}</tr>`;
    rows = d.lines.map(l => {
      const neg = _srKind(l.pos.kind).neg;
      const tot = l.total !== null && l.total !== undefined ? eur(neg ? -Math.abs(l.total) : l.total) : (l.pos.key === 'verbrauch' ? 'lt. Anlage' : (l.unit !== null ? eur(l.unit) : '\u2014'));
      const key = l.pos.split === 'mieter' ? 'Zwischenablesung Nutzerwechsel' : l.keyText;
      return `<tr><td>${esc(l.pos.label || _srKind(l.pos.kind).l)}</td><td class="r">${tot}</td><td class="k">${esc(key)}</td><td class="r">${l.unit !== null ? eur(l.unit) : '\u2014'}</td>${five ? `<td class="r">${eur(l.amt)}</td>` : ''}</tr>`;
    }).join('');
  }
  const tail = `<tr class="s"><td colspan="${span}">Summe Ihr Anteil</td><td class="r">${eur(d.sum)}</td></tr>
    <tr class="v"><td colspan="${span}">abzüglich geleisteter Vorauszahlungen</td><td class="r">\u2212\u00a0${eur(d.vz)}</td></tr>`;
  const expl = [];
  if (simple) {
    if (d.partial) expl.push(`Ihr Anteil: Kosten der Wohnung × Ihre Nutzungstage (${d.tDays}) / Tage des Abrechnungszeitraums (${d.perDays}).`);
  } else {
    if (d.hasFlaeche) expl.push('Wohnfläche: Ihre Wohnfläche im Verhältnis zur Gesamtwohnfläche des Gebäudes.');
    if (d.hasMea) expl.push('MEA: Miteigentumsanteile der Wohnung laut Teilungserklärung' + (d.keyMode === 'weg' ? nb(', wie in der Abrechnung der Eigentümergemeinschaft (§ 556a Abs. 3 BGB)') : '') + '.');
  }
  if (d.hasVerbrauch) expl.push('Heizung und Warmwasser nach Verbrauch gemäß Heizkostenverordnung' + (d.direct ? ', beim Mieterwechsel laut Zwischenablesung' : '') + ' (siehe Anlage).');
  expl.push('Nicht umlagefähige Kosten wie Verwaltung und Rücklage sind nicht enthalten.');
  const basis = simple
    ? ` Grundlage ist die Einzelabrechnung der Hausverwaltung${d.hvDate ? ' vom ' + dt(d.hvDate) : ''} (Anlage); sie weist die Gesamtkosten der Eigentümergemeinschaft und ihre Verteilung auf diese Wohnung aus.`
    : '';

  const page2 = `<div class="pdf-page page">${hdr}${ftr()}<div class="content">
    <div class="sec sec--first">Aufstellung der Betriebskosten</div>
    <p class="intro2">Abrechnungszeitraum ${perTxt} (${d.perDays} Tage)${d.partial ? ` \u00b7 Ihr Nutzungszeitraum ${dt(d.useFrom)} bis ${dt(d.useTo)} (${d.tDays} Tage)` : ''}.${basis} Umgelegt werden die im Mietvertrag vereinbarten Betriebskosten ${nb('nach § 2 BetrKV')}.</p>
    <table class="nk"><colgroup>${cols}</colgroup><thead>${th}</thead><tbody>${rows}${tail}</tbody></table>
    <div class="total-box res2"><span>${resLabel}</span><span>${d.saldo ? eur(amt) : 'ausgeglichen'}</span></div>
    <p class="note2">${esc(expl.join(' '))}</p>
  </div></div>`;

  const scoped = CSS.replace(/([^{}]+)\{/g, (m, sel) => sel.split(',').map(x => '.nk-letter ' + x.trim()).join(', ') + ' {');
  return `<div class="nk-letter"><style>${FONTS}</style><style>${scoped}</style>${page1}${page2}</div>`;
}

/* 5 · Verschickt → Tracking + Controlling (same path as Tracking) */
async function _srSend(btn) {
  const got = _srCollectTenant(); if (!got) return;
  const { c, it, rec, ts } = got;
  const x = _srCalc(c, it, rec);
  if (x.missing) { stSay('Please enter all amounts first'); return; }
  const l = _srLine(c, it), r = it.r, t = x.t;
  const amount = Math.abs(x.saldo), dir = x.saldo > 0 ? 1 : x.saldo < 0 ? -1 : 0;
  let via = dir ? _srViaOf(x) : 'zahlung';
  let amountRec = amount;
  if (via === 'kaution' && x.einbehalt > 0 && x.saldo > x.einbehalt) { via = 'zahlung'; amountRec = cxR(x.saldo - x.einbehalt); }   // Einbehalt too small → tenant pays the rest
  const date = ts.date || cxToday();
  const unit = (it.e && it.e.unit_name) || (x.apt && x.apt.name) || null;
  if (btn) btn.disabled = true;
  try { clearTimeout(_srTsTimer); await srSaveRow(rec); } catch (e) {}
  const resRow = { property_id: c.p.id, kind: 'nk_tenant', year: Number(r.covers_year), period_from: _srD(r.period_from) || null, period_to: _srD(r.period_to) || null,
                   app: 'rentals', tenant_id: r.tenant_id || null, unit_label: unit, tenant_name: _srTName(t) || null,
                   direction: dir, amount: cxR(amountRec), result_date: date, due_date: dir ? _srAdd(date, _srNum(ts.days) ?? 30) : null,
                   settle_via: via, status: 'fertig', source: 'settlements_app' };
  const before = { status: r.status || 'offen', amount: r.amount ?? null, direction: r.direction ?? null, settled_via: r.settled_via ?? null, result_id: r.result_id ?? null };
  let row;
  try { row = await _stUpsertSettlement(l, { status: 'verschickt', amount: cxR(amountRec), direction: dir, settled_via: via }); }
  catch (err) { stSay(_stSqlMissing(err) ? 'Bitte zuerst das Settlements-SQL in Supabase ausführen' : 'Speichern fehlgeschlagen — ' + (err.message || err)); if (btn) btn.disabled = false; return; }
  try {
    const saved = await _stWriteResult(null, resRow);
    await _ctlSupa.from('ctrl_settlements').update({ result_id: saved.id }).eq('id', row.id);
    row.result_id = saved.id;
  } catch (err) {
    await _ctlSupa.from('ctrl_settlements').update(before).eq('id', row.id);
    Object.assign(row, before);
    stSay('Speichern fehlgeschlagen — ' + (err.message || err));
    if (btn) btn.disabled = false; ctlSettlementInvalidate(); stRenderRentals(); return;
  }
  ctlSettlementInvalidate();
  await _srArchive(c, it, rec, ts, x, dir, cxR(amountRec));
  SR.sel = { kind: 'ten', ck: c.ck, tid: String(row.id) };
  if (SR.modal && SR.modal.view === 'tenant') SR.modal.tid = String(row.id);
  SR.briefOpen = false;
  stSay('Marked sent');
  stRenderRentals();
}


const _srViaText = { zahlung: 'per bank transfer', miete: 'with the rent', kaution: 'with the Kaution' };
/* ══════════════════════════════════════════════════════════════
   UI (build 4) — Rentals tab = TRACKER · NK-Abrechnung = MODAL
   Tracker: every Rentals Wohnung for the chosen year (purchase order),
            Hausgeld line + one line per tenant · Sent tick · Settled · PDF.
   Modal:   one Wohnung — ① Jahresabrechnung (dates, cost table umlagefähig /
            nicht umlagefähig, WEG result + check) · ② NK per tenant.
            Tenant view (calculation, letter, PDF, Mark sent, Skip) and a
            Settle dialog (paid · offset · skipped — amount may differ).
   Everything stays editable; nothing is final.
   ══════════════════════════════════════════════════════════════ */

let _srCards = {};                                    // ck → card of the shown year
const _srWide = () => window.innerWidth >= 1000;

/* ── Year model: every active Rentals property, the period that ENDS in year Y (same rule as Controlling) ── */
function _srPeriodFor(p, Y) {
  const per = ctlPeriodEndingIn(p, Y);
  return { from: per.from, to: per.to, frist: per.frist, label: _srPerLabel(per.from, per.to) };
}
function _srItemsFor(p, per) {
  const stored = window._src.settle || [];
  const cy = Number(per.to.slice(0, 4)), first = per.from, last = per.to;
  const exp = [{ property_id: p.id, tenant_id: null, kind: 'weg_hausgeld', covers_year: cy, period_from: first, period_to: last, note: null, unit_name: '', unit_order: -1 }];
  ctlUnitsFor(p.id).forEach((u, ui) => {                // same rules as ctlExpectedSettlements, for any period
    if (_cxIsParking(u)) return;
    const link = ctlUnitLink(u, p);
    if (link && link.type === 'rentals_parking') return;
    const meta = { unit_name: u.name, unit_order: ui };
    if (!link) { exp.push({ property_id: p.id, tenant_id: null, kind: 'nk_tenant', covers_year: cy, period_from: first, period_to: last, note: u.name, ...meta }); return; }
    const all = _cxTenancies(link), memo = new Map();
    for (const w of all) {
      if (!w.from || w.from > last || w.to < first) continue;
      const from = w.from > first ? w.from : first, to = w.to < last ? w.to : last;
      let spanFrom = from, mode = null;
      for (let d = from; d <= to; d = _cxAddDays(d, 1)) {
        const md = _cxRentDay(link, w, u, Number(d.slice(0, 4)), Number(d.slice(5, 7)), d, all, memo).mode;
        if (mode === null) mode = md;
        if (md !== mode) {
          exp.push({ property_id: p.id, tenant_id: w.id, app: _cxApp(link), kind: 'nk_tenant', covers_year: cy, period_from: spanFrom, period_to: _cxAddDays(d, -1), note: mode === 'pauschal' ? 'Pauschal' : null, ...meta });
          spanFrom = d; mode = md;
        }
      }
      exp.push({ property_id: p.id, tenant_id: w.id, app: _cxApp(link), kind: 'nk_tenant', covers_year: cy, period_from: spanFrom, period_to: to, note: mode === 'pauschal' ? 'Pauschal' : null, ...meta });
    }
  });
  const used = new Set(), items = []; let weg = null;
  for (const e of exp) {
    const r = stored.find(x => !used.has(x.id) && !ctlSettlementIsLeer(x) && ctlSettlementSame(x, e));
    if (r) used.add(r.id);
    const it = { type: 'row', r: r || _cxSetVirtual(e), virtual: !r, e, order: e.unit_order, from: _cxD(e.period_from) };
    if (e.kind === 'weg_hausgeld') weg = it; else items.push(it);
  }
  items.sort((a, b) => (a.order - b.order) || String(a.from).localeCompare(String(b.from)));
  return { items, weg };
}
function _srYearModel(Y) {
  const props = (window._ctrl.properties || []).filter(p => p.active && p.id !== CASA_PROP_ID).sort(stPropOrder);
  return props.map(p => {
    const per = _srPeriodFor(p, Y);
    const since = _srD(p.in_portfolio_since);
    const apt = ctlPropLinks(p).apt || null;
    const verw = apt ? (window._src.verw || []).find(v => String(v.apartment_id) === String(apt.id)) || null : null;
    const c = { ck: _srCk(p.id, per.from), p, per, year: Y, apt, verw, items: [], weg: null, before: false, running: per.to >= cxToday() };
    if (since && per.to < since) { c.before = true; return c; }
    const x = _srItemsFor(p, per); c.items = x.items; c.weg = x.weg;
    return c;
  });
}
/* Hausgeld you paid in the period (Soll per Rentals, months after the purchase) — for the WEG check */
function _srHausgeldPaid(c) {
  let sum = 0;
  const since = _srD(c.p.in_portfolio_since);
  for (let d = c.per.from; d <= c.per.to; d = _srAdd(_srLastOfMonth(Number(d.slice(0, 4)), Number(d.slice(5, 7))), 1)) {
    const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7));
    if (since && _srLastOfMonth(y, m) < since) continue;
    try { const r = ctlCostRows(c.p, y, m).rows.find(x => x.key === 'hausgeld'); if (r) sum += Number(r.soll) || 0; } catch (e) {}
  }
  return cxR(sum);
}

/* ── One tenant line: what it is, what to show ── */
function _srTenInfo(c, it, rec, sumOk) {
  const r = it.r, l = _srLine(c, it), st = l.state;
  const kind = r.note === 'Pauschal' ? 'pausch' : r.tenant_id ? 'ten' : 'unlinked';
  const t = kind !== 'unlinked' ? _srTenantOf(r) : null;
  const x = kind === 'ten' && rec && sumOk ? _srCalc(c, it, rec) : null;
  const skipped = r.status === 'nicht durchgeführt';
  const ts = (rec && rec.tenants && rec.tenants[String(r.tenant_id)]) || {};
  let k;                                                              // open · sent · settled · waiting · none
  if (kind !== 'ten') k = skipped ? 'settled' : 'none';
  else if (skipped) k = 'settled';
  else if (st.res) k = st.k === 'erledigt' ? 'settled' : 'sent';
  else if (x && !x.missing) k = 'open';
  else k = 'waiting';
  return { it, r, l, st, kind, t, x, k, skipped, ts, name: kind === 'ten' ? (_srJoin(_srTNames(t)) || 'Tenant') : (_srTName(t) || r.note || 'Unit') };
}
const _srMoneyTxt = (dir, amount, weg) => !dir || !amount ? 'balanced'
  : (weg ? (dir > 0 ? 'Guthaben from WEG ' : 'Nachzahlung to WEG ') : (dir > 0 ? 'Nachzahlung ' : 'Guthaben ')) + stEur(amount);
function _srSettledTxt(ti, weg) {
  const st = ti.st;
  if (ti.skipped) return 'skipped' + (ti.ts.settle_note ? ' · ' + ti.ts.settle_note : '');
  if (!st.res) return '';
  if (st.booking) {
    const verb = weg ? (st.res.dir > 0 ? 'received ' : 'paid ') : (st.res.dir > 0 ? 'paid you ' : 'returned ');
    const diff = Math.abs(Number(st.booking.amount) - st.res.amount) >= 0.005 ? ' (instead of ' + stEur(st.res.amount) + ')' : '';
    return verb + stEur(st.booking.amount) + ' · ' + stDM(st.booking.invoice_date) + diff;
  }
  if (st.k !== 'erledigt' && st.confirm) return (st.res.via === 'miete' ? 'with the rent' : st.res.via === 'hausgeld' ? 'with the Hausgeld' : 'via Kaution') + ' · confirm';
  if (st.res.via === 'kaution') return (weg ? '' : st.res.dir > 0 ? 'paid you ' : 'returned ') + stEur(st.res.amount) + ' via Kaution';
  if (st.res.via === 'miete') return (st.res.dir > 0 ? 'paid you ' : 'returned ') + stEur(st.res.amount) + ' with the rent';
  if (st.res.via === 'hausgeld') return 'settled with the Hausgeld';
  if (!st.res.amount || !st.res.dir) return 'balanced';
  return '';
}
function _srCardInfo4(c) {
  const rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt);
  if (c.before) return { c, rec, sum, rows: [], hv: null, k: 'before' };
  const hv = _srHvState(c, rec, sum);
  const rows = c.items.map(it => _srTenInfo(c, it, rec, sum.ok));
  const hvDone = hv.k === 'fertig';
  const open = !hvDone || rows.some(r => r.k === 'open' || r.k === 'sent' || r.k === 'waiting');
  return { c, rec, sum, rows, hv, k: open ? 'open' : 'settled' };
}

/* ── Tracker ── */
function stRenderRentals() {
  const el = document.getElementById('tab-rentals'); if (!el) return;
  if (!SR.loaded) {
    el.innerHTML = '<div class="st-page"><p class="cx-empty">Loading …</p></div>';
    if (!SR.loading) srLoadRows().then(() => { if (ST.tab === 'rentals') stRenderRentals(); });
    return;
  }
  const ty = Number(cxToday().slice(0, 4));
  if (!SR.year) SR.year = ty - 1;
  let infos;
  try { infos = _srYearModel(SR.year).map(_srCardInfo4); }
  catch (e) { console.error('[settlements] rentals', e); el.innerHTML = '<div class="st-page"><p class="cx-empty">Could not calculate the settlements.</p><p class="st-muted">' + stEsc(e.message || e) + '</p></div>'; return; }
  _srCards = {}; infos.forEach(i => { _srCards[i.c.ck] = i.c; });

  // numbers for the year
  const live = infos.filter(i => i.k !== 'before');
  const hvIn = live.filter(i => i.hv && i.hv.received).length, hvOver = live.filter(i => i.hv && i.hv.k === 'ueberfaellig').length;
  const hvExp = live.filter(i => i.hv && i.hv.k === 'erwartet').length;
  let nOpen = 0, nSent = 0, nSet = 0, nWait = 0; const owe = { toWeg: 0, fromWeg: 0, toTen: 0, fromTen: 0 };
  const S = srSummary(infos);                                   // one net amount per tile (shared with the Dashboard)
  for (const i of live) {
    for (const r of i.rows) {
      if (r.kind !== 'ten') continue;
      if (r.k === 'open') nOpen++; else if (r.k === 'sent') nSent++; else if (r.k === 'settled') nSet++; else if (r.k === 'waiting') nWait++;
    }
  }
  const nO = infos.filter(i => i.k === 'open').length, nS = infos.filter(i => i.k === 'settled').length;
  const shown = SR.filter === 'open' ? infos.filter(i => i.k === 'open') : SR.filter === 'settled' ? infos.filter(i => i.k === 'settled') : infos;
  const chip = (k, label, n) => '<button class="st-chip' + (SR.filter === k ? ' is-on' : '') + '" data-sr="filter" data-k="' + k + '" aria-pressed="' + (SR.filter === k) + '">' + label + (n !== undefined ? '<span class="st-chip__n">' + n + '</span>' : '') + '</button>';
  void owe;
  const sqlNote = SR.missing ? '<div class="st-soon"><i class="ti ti-database" aria-hidden="true"></i><div><strong>Run the SQL once</strong><span>The table nk_abrechnung_rentals is missing. Run SETTLEMENTS-RENTALS.sql in Supabase, then reload.</span></div></div>' : '';

  // ── overview (phase 5 design: one card per Wohnung, plain words, next steps) ──
  const minY = _srMinYear();
  const nLive = live.length;
  const yearNav = '<div class="sc-yr">' +
    '<button class="cx-arw" data-sr="year" data-d="-1" aria-label="Previous year"' + (SR.year <= minY ? ' disabled' : '') + '><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<div class="sc-yr__t"><div class="sc-yr__m">' + SR.year + '</div><div class="sc-yr__s">' + nLive + (nLive === 1 ? ' apartment' : ' apartments') + ' · periods ending in ' + SR.year + '</div></div>' +
    '<button class="cx-arw" data-sr="year" data-d="1" aria-label="Next year"' + (SR.year >= ty ? ' disabled' : '') + '><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
  const prog = stProgress({ done: nSet, sent: nSent, total: nOpen + nSent + nSet + nWait, open: nOpen,
    first: hvIn + ' of ' + nLive + ' Jahresabrechnungen in' + (hvOver ? ' · <b class="rk-red">' + hvOver + ' overdue</b>' : '') });
  const money = '<div class="st-money">' +
    stTile('Tenants', 'users', S.ten, S.ten === null ? 'waiting for the Jahresabrechnungen' : S.nIn + (S.nIn === 1 ? ' pays you' : ' pay you') + ' · ' + S.nOut + (S.nOut === 1 ? ' gets back' : ' get back'), 'data-sr="sumTen"') +
    stTile('Hausgeld', 'receipt', S.hg, 'WEG · ' + hvIn + ' of ' + nLive + ' in', 'data-sr="sumHg"') + '</div>';
  const next = _srNextSteps(live);
  const wide = SR.modal && (SR.modal.view === 'hv' || SR.modal.view === 'nk' || !SR.modal.view);
  el.innerHTML = '<div class="st-page sc-page sr5-page">' + yearNav + sqlNote + prog + money + next +
    '<div class="st-filter" role="group" aria-label="Filter">' + chip('all', 'All') + chip('open', 'To do', nO) + chip('settled', 'Done', nS) + '</div>' +
    stSec('Apartments', nLive) +
    (shown.length ? shown.map(_srCard5).join('') : '<p class="cx-empty" style="padding:20px">Nothing in this filter.</p>') +
  '</div>' +
  (SR.modal ? '<div class="srm" id="srModal"><div class="srm__bg" data-sr="close"></div><div class="srm__win' + (wide ? ' is-wide' : '') + '" id="srPanel" role="dialog" aria-label="NK-Abrechnung">' + _srModalHtml() + '</div></div>' : '');
  document.body.classList.toggle('st-panel-open', !!SR.modal);
}

/* ── Phase 5 · overview helpers ── */
/* Purchase date of a Wohnung: "in portfolio since" (Controlling) or the purchase date in Properties */
function _srIsoAny(v) {
  const s = String(v || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[0];
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/))) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  if ((m = s.match(/^(\d{4})$/))) return m[1] + '-01-01';
  return '';
}
function _srBought(p) {
  if (p.in_portfolio_since) return _srD(p.in_portfolio_since);
  const loan = ctlPropLinks(p).loan;
  return loan ? _srIsoAny(loan.kaufdatum) : '';
}
function _srMinYear() {                                   // the year switch goes back to the first purchase (Properties)
  const ty = Number(cxToday().slice(0, 4));
  const props = (window._ctrl.properties || []).filter(p => p.active && p.id !== CASA_PROP_ID);
  const ys = props.map(p => Number(_srBought(p).slice(0, 4))).filter(Boolean);
  return ys.length ? Math.min(...ys, ty - 1) : ty - 4;
}
const _srInit = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
function _srNextSteps(live) {
  const steps = [];
  for (const i of live) {
    const hv = i.hv; if (!hv) continue;
    if (hv.k === 'ueberfaellig') {
      const mail = i.c.verw && i.c.verw.hv_email ? String(i.c.verw.hv_email).trim() : '';
      steps.push({ o: 1, ic: 'alert-circle', tone: 'red', t: 'Jahresabrechnung overdue', s: i.c.p.name + (hv.exp ? ' · expected ' + hv.exp.label : ''),
        btn: mail ? '<a class="sc-go sr5-go--warn" data-sr="ask" data-k="' + stEsc(i.c.ck) + '" href="' + stEsc(_srAskMail(i.c, hv, mail)) + '"><i class="ti ti-mail" aria-hidden="true"></i> Ask HV</a>'
                  : '<button class="sc-go" data-sr="openHv" data-k="' + stEsc(i.c.ck) + '">Open</button>' });
    } else if (hv.k === 'erfassen') steps.push({ o: 2, ic: 'pencil', t: 'Enter costs', s: i.c.p.name + (hv.received ? ' · received' : ''), btn: '<button class="sc-go" data-sr="openHv" data-k="' + stEsc(i.c.ck) + '">Open</button>' });
    else if (hv.k === 'weg') steps.push({ o: 3, ic: 'scale', t: 'Enter the WEG result', s: i.c.p.name, btn: '<button class="sc-go" data-sr="openHv" data-k="' + stEsc(i.c.ck) + '">Open</button>' });
  }
  const ready = [];
  for (const i of live) for (const r of i.rows) if (r.kind === 'ten' && r.k === 'open') ready.push({ i, r });
  if (ready.length) steps.push({ o: 4, ic: 'send', t: ready.length + (ready.length === 1 ? ' letter ready' : ' letters ready'),
    s: [...new Set(ready.map(x => x.i.c.p.name))].join(' · '),
    btn: '<button class="sc-go" data-sr="openTen" data-k="' + stEsc(ready[0].i.c.ck) + '" data-id="' + stEsc(String(ready[0].r.l.id)) + '">Start <i class="ti ti-arrow-right" aria-hidden="true"></i></button>' });
  // settled with the rent / via Kaution / with the Hausgeld: waiting for your Confirm
  for (const i of live) {
    for (const r of i.rows) if (r.kind === 'ten' && r.k === 'sent' && r.st.confirm) steps.push({ o: 5, ic: 'check', t: 'Settled ' + (r.st.res.via === 'miete' ? 'with the rent' : 'via Kaution') + '?',
      s: i.c.p.name + ' · ' + r.name + ' · ' + stEur(r.st.res.amount),
      btn: '<button class="sc-go" data-sr="settle" data-k="' + stEsc(i.c.ck) + '" data-id="' + stEsc(String(r.it.r.id)) + '">Confirm</button>' });
    const w = i.hv && i.hv.wegSt;
    if (w && w.k === 'verschickt' && w.confirm) steps.push({ o: 5, ic: 'check', t: 'Settled with the Hausgeld?', s: i.c.p.name + ' · WEG ' + stEur(w.res.amount),
      btn: '<button class="sc-go" data-sr="settle" data-k="' + stEsc(i.c.ck) + '" data-w="1">Confirm</button>' });
  }
  if (!steps.length) return '';
  steps.sort((a, b) => a.o - b.o);
  return stNeeds(steps.slice(0, 6).map(x => ({ tone: x.tone === 'red' ? 'red' : 'gold', icon: x.ic, t: x.t, s: x.s, btn: x.btn })));
}
/* One net amount per tile — shared with the Dashboard: > 0 money comes to you · < 0 you pay */
function srSummary(infos) {
  const live = infos.filter(i => i.k !== 'before');
  const S = { ten: null, nIn: 0, nOut: 0, hg: null, nHgIn: 0, tenRows: [], hgRows: [] };
  let tn = 0, any = false, hg = 0, anyHg = false;
  live.forEach(i => {
    const idx = (window._ctrl.properties || []).filter(p => p.active && p.id !== CASA_PROP_ID).sort(stPropOrder).findIndex(p => p.id === i.c.p.id);
    for (const r of i.rows) {
      if (r.kind !== 'ten' || r.skipped) continue;
      const v = r.st.res ? r.st.res.dir * r.st.res.amount : r.k === 'open' && r.x && !r.x.missing ? r.x.saldo : null;
      if (v === null) continue;
      any = true; tn += v; if (v > 0.004) S.nIn++; else if (v < -0.004) S.nOut++;
      S.tenRows.push({ i, r, v, idx });
    }
    const w = i.hv && i.hv.wegSt && i.hv.wegSt.res;
    if (w) { anyHg = true; S.nHgIn++; hg += w.dir * w.amount; }
    S.hgRows.push({ i, w: w || null, idx });
  });
  if (any) S.ten = cxR(tn);
  if (anyHg) S.hg = cxR(hg);
  return S;
}
function _srWegWords(dir, amount, done) {
  if (!dir || !amount) return 'balanced with the WEG';
  return dir > 0 ? (done ? 'the WEG paid you ' : 'the WEG pays you ') + stEur(amount) : (done ? 'you paid the WEG ' : 'you pay the WEG ') + stEur(amount);
}
function _srCard5(info) {
  const c = info.c, props = (window._ctrl.properties || []).filter(p => p.active && p.id !== CASA_PROP_ID).sort(stPropOrder);
  const idx = props.findIndex(p => p.id === c.p.id) + 1, av = stAv(idx - 1);
  const num = '<span class="sc-av sr5-pav" style="background:' + av[0] + ';color:' + av[1] + '">' + stEsc(stAbbr(c.p.name)) + '</span>';
  if (c.before) return '<div class="sc-card sr5-fold"><div class="sr5-h">' + num + '<span class="sr5-h__t"><span class="sr5-pn">' + stEsc(c.p.name) + '</span><span class="sr5-pm">bought ' + stDate(c.p.in_portfolio_since) + ' · ' + SR.year + ' settled by the seller</span></span><span class="sc-chip sc-chip--grey">not yours</span></div></div>';
  const k5 = 'c5:' + c.ck;
  if (info.k === 'settled' && !SR.open[k5]) return '<button class="sc-card sr5-fold" data-sr="fold5" data-k="' + stEsc(k5) + '"><span class="sr5-h">' + num + '<span class="sr5-h__t"><span class="sr5-pn">' + stEsc(c.p.name) + '</span></span><span class="sc-chip sc-chip--done"><i class="ti ti-check" aria-hidden="true"></i> all settled</span><i class="ti ti-chevron-down sc-chev" aria-hidden="true"></i></span></button>';
  const hg = c.verw ? _srNum(c.verw.hausgeld_mtl) : null;
  const meta = stNkLabel(c.per.from, c.per.to) + (hg ? ' · Hausgeld ' + stEur(hg) + '/mo' : '') + ' · Frist ' + stDe(c.per.frist);
  let h = '<div class="sc-card sr5-card"><div class="sr5-h">' + num + '<span class="sr5-h__t"><span class="sr5-pn">' + stEsc(c.p.name) + '</span><span class="sr5-pm">' + stEsc(meta) + '</span></span>' +
    '<button class="cx-link sr5-hist" data-sr="history" data-k="' + stEsc(c.ck) + '"><i class="ti ti-history" aria-hidden="true"></i> History</button>' +
    (info.k === 'settled' ? '<button class="cx-link" data-sr="fold5" data-k="' + stEsc(k5) + '" aria-label="Fold"><i class="ti ti-chevron-up" aria-hidden="true"></i></button>' : '') + '</div>';
  // Jahresabrechnung line
  const hv = info.hv, rec = info.rec, wegSt = hv.wegSt, wRes = wegSt && wegSt.res;
  const wegDone = !!(wRes && (wegSt.k === 'erledigt' || wegSt.booking));
  let say, tone = '';
  if (hv.k === 'fertig') { say = wRes ? _srWegWords(wRes.dir, wRes.amount, true) : 'settled'; tone = 'pos'; }
  else if (hv.k === 'zahlung') { say = wRes ? _srWegWords(wRes.dir, wRes.amount, wegDone) + ' · payment open' : 'payment open'; tone = wRes && wRes.dir > 0 ? 'pos' : 'neg'; }
  else if (hv.k === 'weg') say = 'costs entered · enter the WEG result';
  else if (hv.k === 'erfassen') { say = 'received' + (rec && (rec.received_on || rec.hv_date) ? ' ' + stDM(rec.received_on || rec.hv_date) : '') + ' · costs not entered yet'; tone = 'warn'; }
  else if (hv.k === 'ueberfaellig') { say = 'overdue' + (hv.exp ? ' · expected ' + hv.exp.label : '') + (hv.asked.length ? ' · asked ' + stDM(hv.asked[hv.asked.length - 1]) : ''); tone = 'neg'; }
  else say = c.running ? 'runs until ' + stDate(c.per.to) : (hv.exp ? 'expected ~ ' + hv.exp.label : 'expected');
  const hvChip = hv.k === 'fertig' ? ['done', 'settled'] : hv.k === 'zahlung' ? ['wait', 'payment open'] : hv.k === 'weg' ? ['send', 'WEG result'] : hv.k === 'erfassen' ? ['send', 'enter costs']
    : hv.k === 'ueberfaellig' ? ['red', 'overdue'] : ['grey', c.running ? 'running' : 'expected'];
  h += '<button class="sc-row sr5-ln" data-sr="openHv" data-k="' + stEsc(c.ck) + '"><span class="sc-av sr5-av--hv"><i class="ti ti-building" aria-hidden="true"></i></span>' +
    '<span class="sc-row__m"><span class="sc-row__n">Jahresabrechnung</span><span class="sc-row__s ' + tone + '">' + stEsc(say) + '</span></span>' +
    '<span class="sc-chip sc-chip--' + hvChip[0] + '">' + stEsc(hvChip[1]) + '</span></button>';
  // tenant lines
  for (const ti of info.rows) {
    let s2, t2 = '';
    if (ti.kind === 'pausch') s2 = 'Pauschal – no NK';
    else if (ti.kind === 'unlinked') s2 = 'no tenant linked';
    else if (ti.k === 'settled') { s2 = ti.skipped ? 'skipped' : (_srSettledTxt(ti, false) || 'settled'); const r = ti.st.res; t2 = !ti.skipped && r && r.amount ? (r.dir > 0 ? 'pos' : 'neg') : ''; }
    else if (ti.k === 'sent') { const r = ti.st.res; s2 = r.dir > 0 ? 'pays you ' + stEur(r.amount) : r.dir < 0 ? 'gets ' + stEur(r.amount) + ' back' : 'balanced'; if (ti.st.confirm) s2 += ' · ' + (r.via === 'miete' ? 'with the rent' : 'via Kaution'); t2 = r.dir > 0 ? 'pos' : r.dir < 0 ? 'neg' : ''; }
    else if (ti.k === 'open' && ti.x && !ti.x.missing) { const v = ti.x.saldo; s2 = v > 0 ? 'pays you ' + stEur(v) : v < 0 ? 'gets ' + stEur(-v) + ' back' : 'balanced'; t2 = v > 0 ? 'pos' : v < 0 ? 'neg' : ''; }
    else s2 = 'waiting for the Jahresabrechnung';
    const chip = ti.kind === 'pausch' ? ['grey', 'Pauschal'] : ti.kind === 'unlinked' ? ['grey', 'no tenant'] : ti.k === 'settled' ? ['done', ti.skipped ? 'skipped' : ti.st.res && ti.st.res.dir < 0 ? 'returned' : ti.st.booking ? 'paid' : 'settled'] :
      ti.k === 'sent' ? (ti.st.confirm ? ['send', 'confirm'] : ['wait', 'sent ' + stDM(ti.st.res.date)]) : ti.k === 'open' ? ['send', 'to send'] : ['grey', 'waiting'];
    const per = stPer(ti.l.from, ti.l.to) + (ti.t && _srMovedOut(ti.t) ? ' · moved out' : '');
    h += '<button class="sc-row sr5-ln" data-sr="openTen" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(String(ti.l.id)) + '"><span class="sc-av sr5-av">' + stEsc(_srInit(ti.name)) + '</span>' +
      '<span class="sc-row__m"><span class="sc-row__n">' + stEsc(ti.name) + '</span><span class="sc-row__s ' + t2 + '">' + stEsc(s2) + '</span><span class="sc-row__p">' + stEsc(per) + '</span></span>' +
      '<span class="sc-chip sc-chip--' + chip[0] + '">' + stEsc(chip[1]) + '</span></button>';
  }
  if (!info.rows.length) h += '<p class="sr5-empty">No tenant with Kalt + NK in this period</p>';
  return h + '</div>';
}

/* ── History of one Wohnung: every year since the purchase ── */
function _srHistoryView(c) {
  const p = c.p, ty = Number(cxToday().slice(0, 4));
  const bought = _srBought(p), since = Number(bought.slice(0, 4)) || _srMinYear();
  const years = []; for (let Y = ty; Y >= since; Y--) years.push(Y);
  const rows = years.map(Y => {
    const per = _srPeriodFor(p, Y), cy = Number(per.to.slice(0, 4));
    if (per.from > cxToday()) return '';
    const res = (window._src.abr || []).filter(a => a.status !== 'storniert' && Number(a.property_id) === p.id && Number(a.year) === cy);
    const weg = res.find(a => a.kind === 'weg_hausgeld'), tens = res.filter(a => a.kind === 'nk_tenant');
    const rec = _srRec(p, per);
    const letters = (SR.letters || []).filter(l => (l.app === 'rentals' || l.app === 'manual') && Number(l.property_id) === p.id && Number(l.year) === cy);
    if (per.to >= cxToday() && !res.length && !letters.length && !(rec && (rec.received_on || rec.hv_date))) return '';   // the running year: only once something exists
    const wegTxt = weg ? _srWegWords(Number(weg.direction), Number(weg.amount), false).replace('pays you', 'paid you').replace('you pay the', 'you paid the')
      : rec && (rec.received_on || rec.hv_date) ? 'Jahresabrechnung received ' + stDate(rec.received_on || rec.hv_date) : per.to >= cxToday() ? 'running' : 'no Jahresabrechnung entered';
    return '<div class="srm__card sr5-hy"><div class="sr5-hy__h"><span><b>NK ' + cy + '</b><small>' + stEsc(_srPerText(per.from, per.to)) + '</small></span>' +
      '<button class="cx-link" data-sr="histYear" data-y="' + Y + '">Open this year ›</button></div>' +
      '<div class="sc-li"><span>Jahresabrechnung</span><span class="sr5-hy__v">' + stEsc(wegTxt) + '</span></div>' +
      tens.map(a => '<div class="sc-li"><span>' + stEsc(a.tenant_name || 'Tenant') + '<small>' + stEsc(a.settle_via === 'kaution' ? 'with the Kaution' : a.settle_via === 'miete' ? 'with the rent' : 'by bank transfer') + '</small></span><span class="sr5-hy__v">' +
        stEsc(Number(a.direction) > 0 ? 'Nachzahlung ' + stEur(a.amount) : Number(a.direction) < 0 ? 'Guthaben ' + stEur(a.amount) : 'balanced') + '</span></div>').join('') +
      letters.map(l => '<button class="sc-row" data-sr="letterOpen" data-id="' + stEsc(l.id) + '"><span class="sc-av sc-av--doc"><i class="ti ti-file-text" aria-hidden="true"></i></span><span class="sc-row__m"><span class="sc-row__n">' +
        stEsc(l.tenant_name || '') + (l.source === 'manual' ? ' · manual' : '') + '</span><span class="sc-row__p">letter sent ' + stDate(String(l.sent_at).slice(0, 10)) + '</span></span><span class="sc-open">Open</span></button>').join('') +
      (!tens.length && !letters.length ? '<p class="sr5-empty">No tenant results saved for this year.</p>' : '') + '</div>';
  }).join('');
  return _srHead4('History · ' + p.name, 'every year since ' + (bought ? 'the purchase ' + stDate(bought) : since), '') +
    '<div class="srm__b"><div class="srm__one">' + rows + '</div></div>';
}
async function _srOpenLetter(id) {
  const L = (SR.letters || []).find(l => String(l.id) === String(id)); if (!L) return;
  try {
    const { data, error } = await _ctlSupa.storage.from('nk-letters').createSignedUrl(L.file_path, 600);
    if (error || !data) throw error || new Error('no link');
    ccOpenUrl(data.signedUrl, L.file_name || 'NK-Abrechnung.pdf');
  } catch (e) { stSay('The letter could not be opened — ' + (e.message || e)); }
}

function _srTrackerBlock(info) {
  const c = info.c, idx = (window._ctrl.properties || []).filter(p => p.active && p.id !== CASA_PROP_ID).sort(stPropOrder).findIndex(p => p.id === c.p.id) + 1;
  const hg = c.verw ? _srNum(c.verw.hausgeld_mtl) : null;
  const sub = c.before ? 'bought ' + stDate(c.p.in_portfolio_since)
    : _srPerText(c.per.from, c.per.to) + (hg ? ' · Hausgeld ' + stEur(hg) + '/mo' : '') + ' · Frist ' + stDate(c.per.frist);
  let h = '<section class="rk-block"><div class="rk-grp"><div class="rk-grp__n"><span class="rk-grp__i">' + idx + '</span><span class="rk-grp__t">' + stEsc(c.p.name) + '</span><span class="rk-grp__s">' + stEsc(sub) + '</span></div>' +
    '<button class="rk-lnk" data-sr="openNk" data-k="' + stEsc(c.ck) + '">NK-Abrechnung ›</button></div>';
  if (c.before) return h + '<div class="rk-row is-dim"><span class="rk-who">' + SR.year + ' before purchase – the seller settles it</span><span></span><span class="rk-st">' + cxPill('grey', 'not yours') + '</span><span></span><span></span><span></span><span></span></div></section>';
  // Hausgeld line
  const hv = info.hv, rec = info.rec, wegSt = hv.wegSt;
  const wRes = wegSt && wegSt.res;
  const wegMoney = wRes ? _srMoneyTxt(wRes.dir, wRes.amount, true) : (rec && rec.weg_direction !== null && rec.weg_direction !== undefined ? _srMoneyTxt(Number(rec.weg_direction), _srNum(rec.weg_amount), true) : '');
  const wegDone = wRes && wegSt.k === 'erledigt';
  const hvPill = hv.k === 'fertig' ? ['ok', 'settled'] : hv.k === 'zahlung' ? ['beige', 'payment open'] : hv.k === 'weg' ? ['open', 'enter result'] : hv.k === 'erfassen' ? ['open', 'enter costs']
    : hv.k === 'ueberfaellig' ? ['diff', 'overdue'] : ['grey', c.running ? 'running' : 'expected'];
  const hvLine2 = !hv.received ? (c.running ? 'runs until ' + stDate(c.per.to) : (hv.exp ? (hv.k === 'ueberfaellig' ? 'expected ' : 'expected ~') + hv.exp.label : 'expected – month not set'))
    + (hv.asked.length ? ' · asked ' + stDate(hv.asked[hv.asked.length - 1]) : '') : 'received ' + stDate(rec.received_on || rec.hv_date);
  const mail = c.verw && c.verw.hv_email ? String(c.verw.hv_email).trim() : '';
  h += '<div class="rk-row" data-sr="openHv" data-k="' + stEsc(c.ck) + '">' +
    '<span class="rk-who"><span class="rk-ic"><i class="ti ti-building" aria-hidden="true"></i></span><button class="rk-name" data-sr="openHv" data-k="' + stEsc(c.ck) + '">Hausgeld · Jahresabrechnung</button></span>' +
    '<span class="rk-per">' + stEsc(hvLine2) + '</span>' +
    '<span class="rk-st">' + cxPill(hvPill[0], hvPill[1]) + (hv.k === 'ueberfaellig' && mail ? ' <a class="rk-ask" data-sr="ask" data-k="' + stEsc(c.ck) + '" href="' + stEsc(_srAskMail(c, hv, mail)) + '"><i class="ti ti-mail" aria-hidden="true"></i> Ask HV</a>' : '') + '</span>' +
    '<span class="rk-res">' + stEsc(wegMoney) + '</span>' +
    '<span class="rk-sent rk-na">—</span>' +
    '<span class="rk-done">' + (wegDone || (wRes && wegSt.booking) ? '<span class="rk-ok"><i class="ti ti-check" aria-hidden="true"></i> ' + stEsc(_srSettledTxt({ st: wegSt, ts: {} }, true)) + ' <button class="rk-edit" data-sr="settle" data-k="' + stEsc(c.ck) + '" data-w="1">edit</button></span>'
       : wRes && wRes.amount ? '<button class="rk-btn" data-sr="settle" data-k="' + stEsc(c.ck) + '" data-w="1">Settle</button>' : '<span class="rk-na">—</span>') + '</span>' +
    '<span class="rk-pdf"></span></div>';
  // tenant lines
  for (const ti of info.rows) {
    const id = String(ti.l.id);
    const pill = ti.kind === 'pausch' ? (ti.skipped ? ['ok', 'no NK'] : ['grey', 'Pauschal']) : ti.kind === 'unlinked' ? ['grey', 'no tenant'] :
      ti.k === 'settled' ? ['ok', ti.skipped ? 'skipped' : 'settled'] : ti.k === 'sent' ? ['beige', 'sent'] : ti.k === 'open' ? ['open', 'open'] : ['grey', 'waiting for HV'];
    let res = '';
    if (ti.skipped) res = '';
    else if (ti.st.res) res = _srMoneyTxt(ti.st.res.dir, ti.st.res.amount, false);
    else if (ti.x && !ti.x.missing) res = _srMoneyTxt(ti.x.saldo > 0 ? 1 : ti.x.saldo < 0 ? -1 : 0, Math.abs(ti.x.saldo), false) + ' · preview';
    else if (ti.kind === 'pausch') res = 'Pauschal – no NK';
    const kau = ti.x && ti.x.einbehalt > 0 && ti.k !== 'settled' ? '<small>Kaution-Einbehalt ' + stEur(ti.x.einbehalt) + '</small>' : '';
    const canSend = ti.k === 'open';
    const sent = ti.kind !== 'ten' ? '<span class="rk-na">—</span>'
      : '<label class="rk-tick"><input type="checkbox" data-sr="tick" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(id) + '"' + (ti.st.res ? ' checked' : '') + (ti.st.res || canSend ? '' : ' disabled') + '/>' + (ti.st.res ? stDM(ti.st.res.date) : '') + '</label>';
    const done = ti.k === 'settled' && ti.kind === 'ten' ? '<span class="rk-ok"><i class="ti ti-check" aria-hidden="true"></i> ' + stEsc(_srSettledTxt(ti, false)) + ' <button class="rk-edit" data-sr="settle" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(id) + '">edit</button></span>'
      : ti.k === 'sent' ? '<button class="rk-btn" data-sr="settle" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(id) + '">Settle</button>' : '<span class="rk-na">—</span>';
    const pdf = ti.kind === 'ten' && (ti.k === 'open' || ti.k === 'sent' || (ti.k === 'settled' && !ti.skipped))
      ? '<button class="rk-pdfb" data-sr="pdfRow" data-cc-pdf="1" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(id) + '" aria-label="PDF ' + stEsc(ti.name) + '"><i class="ti ti-file-text" aria-hidden="true"></i></button>' : '';
    const per = stDM(ti.l.from) + '–' + stDate(ti.l.to) + (ti.t && _srMovedOut(ti.t) ? ' · moved out' : '');
    h += '<div class="rk-row" data-sr="openTen" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(id) + '">' +
      '<span class="rk-who"><span class="rk-ic"><i class="ti ti-user" aria-hidden="true"></i></span><button class="rk-name" data-sr="openTen" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(id) + '">' + stEsc(ti.name) + '</button></span>' +
      '<span class="rk-per">' + stEsc(per) + '</span>' +
      '<span class="rk-st">' + cxPill(pill[0], pill[1]) + '</span>' +
      '<span class="rk-res">' + stEsc(res) + kau + '</span>' +
      '<span class="rk-sent">' + sent + '</span>' +
      '<span class="rk-done">' + done + '</span>' +
      '<span class="rk-pdf">' + pdf + '</span></div>';
  }
  if (!info.rows.length) h += '<div class="rk-row is-dim"><span class="rk-who">No tenant with Kalt + NK in this period</span><span></span><span></span><span></span><span></span><span></span><span></span></div>';
  return h + '</section>';
}

/* ── Modal ── */
const _srHead4 = (t, s, back) => '<div class="srm__h"><div class="srm__ht">' + (back ? '<button class="srm__back" data-sr="' + back + '"><i class="ti ti-chevron-left" aria-hidden="true"></i> ' + stEsc(_srCards[SR.modal.ck] ? _srCards[SR.modal.ck].p.name + ' ' + _srCards[SR.modal.ck].per.label : 'Back') + '</button>' : '') +
  '<p class="srm__t">' + stEsc(t) + '</p><p class="srm__s">' + stEsc(s) + '</p></div><button class="srm__x" data-sr="close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>';
function _srModalHtml() {
  const m = SR.modal;
  if (m.view === 'sumTen' || m.view === 'sumHg') return _srSumSheet(m.view);
  const c = _srCards[m.ck];
  if (!c) return _srHead4('NK-Abrechnung', '') + '<div class="srm__b"><p class="cx-empty">This Wohnung is not in the list.</p></div>';
  SR.sel = { kind: m.view === 'tenant' ? 'ten' : 'hv', ck: m.ck, tid: m.tid };
  if (m.view === 'history') return _srHistoryView(c);
  if (m.view === 'tenant') return _srTenView(c);
  if (m.view === 'settle') return _srSettleView(c);
  if (m.view === 'hv') return _srHvView(c);
  return _srNkView(c);
}
function _srSumSheet(view) {
  const infos = _srYearModel(SR.year).map(_srCardInfo4), S = srSummary(infos);
  const close = 'data-sr="close"';
  if (view === 'sumTen') {
    const rows = S.tenRows.map(x => { const av = stAv(x.idx);
      return { av, ab: stAbbr(x.i.c.p.name), name: x.r.name, sub: x.i.c.p.name + ' · ' + stPer(x.r.l.from, x.r.l.to) + (x.r.k === 'open' ? ' · to send' : x.r.k === 'sent' ? ' · sent' : ''),
               amount: Math.abs(x.v) >= 0.005 ? Math.abs(x.v) : 0, dir: x.v > 0 ? 1 : -1, act: 'data-sr="openTen" data-k="' + stEsc(x.i.c.ck) + '" data-id="' + stEsc(String(x.r.it.r.id)) + '"' }; });
    return stSumSheet({ title: 'Tenants', sub: 'Rentals · periods ending in ' + SR.year, net: S.ten,
      sub2: S.ten === null ? 'waiting for the Jahresabrechnungen' : S.nIn + (S.nIn === 1 ? ' pays you' : ' pay you') + ' · ' + S.nOut + (S.nOut === 1 ? ' gets back' : ' get back'),
      groups: [{ title: 'Pay you', rows: rows.filter(r => r.amount && r.dir > 0) }, { title: 'Get back', rows: rows.filter(r => r.amount && r.dir < 0) },
               { title: 'Balanced', rows: rows.filter(r => !r.amount).map(r => Object.assign(r, { chip: ['grey', 'balanced'] })) }] }, close);
  }
  const rows = S.hgRows.map(x => { const av = stAv(x.idx), w = x.w, hv = x.i.hv || {};
    const act = 'data-sr="openHv" data-k="' + stEsc(x.i.c.ck) + '"';
    if (w && w.amount) return { av, ab: stAbbr(x.i.c.p.name), name: x.i.c.p.name, sub: (w.dir > 0 ? 'Guthaben · ' : 'Nachzahlung · ') + stPer(x.i.c.per.from, x.i.c.per.to), amount: w.amount, dir: w.dir, act };
    if (w) return { av, ab: stAbbr(x.i.c.p.name), name: x.i.c.p.name, sub: 'balanced · ' + stPer(x.i.c.per.from, x.i.c.per.to), chip: ['grey', 'balanced'], act };
    const over = hv.k === 'ueberfaellig';
    return { av, ab: stAbbr(x.i.c.p.name), name: x.i.c.p.name, sub: x.i.c.running ? 'runs until ' + stDe(x.i.c.per.to) : hv.exp ? 'expected ' + (over ? '' : '~ ') + hv.exp.label : 'expected', chip: over ? ['red', 'overdue'] : ['grey', x.i.c.running ? 'running' : 'expected'], act, wait: true };
  });
  return stSumSheet({ title: 'Hausgeld', sub: 'Rentals · WEG Jahresabrechnungen · periods ending in ' + SR.year, net: S.hg,
    sub2: rows.filter(r => r.amount && r.dir < 0).length + ' Nachzahlung · ' + rows.filter(r => r.amount && r.dir > 0).length + ' Guthaben · ' + rows.filter(r => r.wait).length + ' not in yet',
    groups: [{ title: 'You pay', rows: rows.filter(r => r.amount && r.dir < 0) }, { title: 'You get', rows: rows.filter(r => r.amount && r.dir > 0) },
             { title: 'Not in yet', rows: rows.filter(r => r.wait) }, { title: 'Balanced', rows: rows.filter(r => !r.amount && !r.wait) }] }, close);
}
function _srRerenderPanel() {
  const host = document.getElementById('srPanel'); if (!host || !SR.modal) return;
  const b = host.querySelector('.srm__b'), top = b ? b.scrollTop : 0;
  host.innerHTML = _srModalHtml();
  const nb = host.querySelector('.srm__b'); if (nb) nb.scrollTop = top;
}
function _srPicker(c) {
  const list = Object.values(_srCards);
  const i = list.findIndex(x => x.ck === c.ck);
  return '<div class="srm__pick"><button class="cx-arw" data-sr="pick" data-d="-1" aria-label="Previous Wohnung"' + (i <= 0 ? ' disabled' : '') + '><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<span class="cx-f cx-f--l srm__sel"><select data-srs="pick" aria-label="Wohnung">' + list.map((x, j) => '<option value="' + stEsc(x.ck) + '"' + (x.ck === c.ck ? ' selected' : '') + '>' + (j + 1) + ' · ' + stEsc(x.p.name) + '</option>').join('') + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></span>' +
    '<button class="cx-arw" data-sr="pick" data-d="1" aria-label="Next Wohnung"' + (i >= list.length - 1 ? ' disabled' : '') + '><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
}
/* Draft of the Jahresabrechnung: saved record, else last year's rows (no amounts), else the standard list */
const SR_STD_U = ['wasser', 'abwasser', 'heizung', 'warmwasser', 'muell', 'reinigung', 'strom', 'versicherung'];
const SR_STD_NU = ['verwaltung', 'ruecklage'];
function _srMakeDraft(c) {
  const rec = _srRec(c.p, c.per);
  const d = rec ? JSON.parse(JSON.stringify(rec)) : _srBlankRec(c);
  if (!d.period_from) { d.period_from = c.per.from; d.period_to = c.per.to; }
  d.keys = d.keys || {};
  if (!(d.positions || []).length) {
    const prev = _srPrevRec(c.p, c.per);
    if (prev && (prev.positions || []).length) d.positions = prev.positions.map(p => Object.assign({}, p, { id: _srUid(), total: null, amount: null, key: 'direkt', ku: null, kt: null }));
    else d.positions = SR_STD_U.concat(SR_STD_NU).map(k => _srNewPos(k, d));
  }
  return d;
}

/* Shared by both windows: the draft of this Wohnung's record */
function _srEnsureDraft(c) {
  if (!SR.draft || SR.draft._ck !== c.ck) {
    SR.draft = _srMakeDraft(c); SR.draft._ck = c.ck;
    SR.costsOpen = !(_srRecSummary(_srRec(c.p, c.per), c.apt).ok);
  }
  return SR.draft;
}
const _srDateF = (f, v, lab) => '<label class="st-f"><span class="st-f__l">' + lab + '</span><input class="st-in" type="date" data-srf="' + f + '" value="' + stEsc(_srD(v) || '') + '"/></label>';
const _srAmtOf = (d, p, apt) => { const a = _srNum(p.amount); return a !== null ? a : _srUnitAmt(d, p, apt); };
const _srSigned = (p, v) => (v || 0) * (_srKind(p.kind).neg ? -1 : 1);

/* ── Window A · Hausgeld-Jahresabrechnung (you ↔ WEG): all costs · WEG result · check ── */
function _srHvView(c) {
  const title = 'Hausgeld ' + c.per.label;
  if (c.before) return _srHead4(title, c.p.name) + '<div class="srm__pickwrap">' + _srPicker(c) + '</div><div class="srm__b"><div class="srm__card"><p class="st-note">' + stEsc(c.per.label) + ' is before your purchase (' + stDate(c.p.in_portfolio_since) + '). The seller settles this period.</p></div></div>';
  const d = _srEnsureDraft(c), rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt), hv = _srHvState(c, rec, sum);
  const mail = c.verw && c.verw.hv_email ? String(c.verw.hv_email).trim() : '';
  let status = '';
  if (!hv.received) {
    status = '<div class="srm__banner' + (hv.k === 'ueberfaellig' ? ' is-warn' : '') + '"><div><p class="srm__banner-t">' +
      (c.running ? 'Period runs until ' + stDate(c.per.to) : hv.k === 'ueberfaellig' ? 'Overdue – expected ' + (hv.exp ? hv.exp.label : '') : 'Expected ' + (hv.exp ? '~' + hv.exp.label : '– month not set')) + '</p>' +
      '<p class="srm__banner-s">' + (c.running ? 'You can prepare it already. ' : '') + 'Frist for the NK: ' + stDate(hv.per.frist) + (hv.asked.length ? ' · asked ' + hv.asked.map(stDM).join(', ') : '') + '</p></div>' +
      (mail && !c.running ? '<a class="cx-btn cx-btn--s srm__ask" data-sr="ask" data-k="' + stEsc(c.ck) + '" href="' + stEsc(_srAskMail(c, hv, mail)) + '"><i class="ti ti-mail" aria-hidden="true"></i> Ask HV</a>' : '') + '</div>';
  }
  const U = [], N = [];
  (d.positions || []).forEach((p, i) => { if (!_srIsNkOnly(p)) (p.u ? U : N).push([p, i]); });
  const tot = arr => cxR(arr.reduce((s, [p]) => s + _srSigned(p, _srAmtOf(d, p, c.apt)), 0));
  const tu = tot(U), tn = tot(N), tt = cxR(tu + tn);
  const row = ([p, i]) => {
    const k = _srKind(p.kind), custom = p.kind === 'sonst' || p.kind === 'nu_sonst' || p.label;
    const lab = custom ? '<input class="ct-name" list="srKindList" data-srf="pos.' + i + '.label" placeholder="Name" value="' + stEsc(p.label || '') + '"/>' : '<span class="ct-lab">' + stEsc(k.l) + '</span>';
    const calc = _srNum(p.amount) === null ? _srUnitAmt(d, p, c.apt) : null;
    return '<div class="ct-r"><span class="ct-l">' + lab + '</span><span class="ct-a"><input inputmode="decimal" enterkeyhint="next" autocomplete="off" data-srf="pos.' + i + '.amount" aria-label="' + stEsc(p.label || k.l) + '" placeholder="' + stEsc(calc !== null ? cxE2(Math.abs(calc)) : '') + '" value="' + stEsc(_srE2in(p.amount)) + '"/><em>€</em></span></div>';
  };
  const block = (arr, u, label, total) => '<div class="ct"><div class="ct-h"><span class="st-f__l">' + label + '</span><b data-sr-tot="' + (u ? 'u' : 'n') + '">' + stEur(total) + '</b></div>' + arr.map(row).join('') +
    '<button class="ct-add" data-sr="rowAdd" data-u="' + (u ? 1 : 0) + '"><i class="ti ti-plus" aria-hidden="true"></i> Add row</button></div>';
  const costs = SR.costsOpen
    ? '<div class="ct-top"><span class="st-f__l">Kosten · your Wohnung’s amounts from the Einzelabrechnung</span>' + (sum.ok ? '<button class="ct-hide" data-sr="costs">hide</button>' : '') + '</div>' +
      '<div class="ct-2">' + block(U, true, 'Umlagefähig', tu) + block(N, false, 'Nicht umlagefähig', tn) + '</div>' +
      '<div class="ct-tot"><span>Total costs per Jahresabrechnung</span><b data-sr-tot="t">' + stEur(tt) + '</b></div>' +
      '<datalist id="srKindList">' + SR_KINDS.map(k => '<option value="' + stEsc(k.l) + '"></option>').join('') + '</datalist>'
    : '<button class="ct-fold" data-sr="costs"><span class="ct-fold__l"><span class="ct-fold__t">Kosten · ' + (U.length + N.length) + ' items</span><span class="ct-fold__s">umlagefähig ' + stEur(tu) + ' · nicht umlagefähig ' + stEur(tn) + '</span></span><span class="ct-fold__r">' + stEur(tt) + ' <i class="ti ti-chevron-down" aria-hidden="true"></i></span></button>';
  const wDir = d.weg_direction === null || d.weg_direction === undefined ? null : Number(d.weg_direction);
  const seg = (v, on, t, s) => '<button type="button" class="st-seg__b' + (on ? ' is-on' : '') + '" data-sr="wegDir" data-v="' + v + '" aria-pressed="' + on + '">' + t + '<small>' + (s || '&nbsp;') + '</small></button>';
  const hgPaid = _srNum(d.keys.hg_paid) ?? _srHausgeldPaid(c);
  const calc = cxR(tt - hgPaid), entered = wDir === null ? null : cxR(wDir === 0 ? 0 : -wDir * (_srNum(d.weg_amount) || 0));
  const diff = entered === null ? null : cxR(calc - entered);
  const check = tt ? '<div class="srm__chk' + (diff !== null && Math.abs(diff) >= 0.01 ? ' is-warn' : '') + '">' +
      '<span>Costs</span><span>' + stEur(tt) + '</span>' +
      '<span>− Hausgeld paid <small>(per Rentals · editable)</small></span><span class="srm__hg"><input inputmode="decimal" data-srf="keys.hg_paid" aria-label="Hausgeld paid" value="' + stEsc(cxE2(hgPaid)) + '"/> €</span>' +
      '<span><b>= ' + (calc > 0 ? 'Nachzahlung' : calc < 0 ? 'Guthaben' : 'balanced') + '</b>' + (diff === null ? '' : Math.abs(diff) < 0.01 ? ' · matches the HV' : ' · HV says ' + stEur(Math.abs(entered)) + ' – difference ' + stEur(Math.abs(diff))) + '</span><span><b>' + stEur(Math.abs(calc)) + '</b></span></div>' : '';
  const weg = '<fieldset class="st-f"><legend class="st-f__l">WEG result</legend><div class="st-seg st-seg--3" role="group">' +
      seg(-1, wDir === -1, 'Nachzahlung', 'to WEG') + seg(1, wDir === 1, 'Guthaben', 'from WEG') + seg(0, wDir === 0, 'balanced', '') + '</div>' +
      (wDir ? '<div class="sr-grid2" style="margin-top:10px"><label class="st-f"><span class="st-f__l">Amount</span><span class="st-amt"><input class="st-in" inputmode="decimal" data-srf="weg_amount" value="' + stEsc(_srE2in(d.weg_amount)) + '"/><span>€</span></span></label>' +
        _srDateF('weg_due', d.weg_due, 'Due') + '</div>' : '') + '</fieldset>';
  const expTxt = Number(c.p.hv_expected_month) ? SR_MON[Number(c.p.hv_expected_month) - 1] : '—';
  const settings = '<details class="srm__set"' + (SR.expEdit || ST.perEdit === c.p.id ? ' open' : '') + '><summary>Settings · Period ' + stEsc(stDM(c.per.from) + '–' + stDM(c.per.to)) + ' · HV usually sends in ' + stEsc(expTxt) + '</summary>' +
    _stPeriodRow(c.p) +
    (SR.expEdit ? '<div class="sr-exp"><span>HV usually sends in</span><span class="cx-f cx-f--l sr-sel"><select id="srExpM" aria-label="Month"><option value="">—</option>' + SR_MON.map((mm, i) => '<option value="' + (i + 1) + '"' + (Number(c.p.hv_expected_month) === i + 1 ? ' selected' : '') + '>' + mm + '</option>').join('') + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></span><button class="cx-link" data-sr="expCancel">Cancel</button><button class="cx-link sr-acc" data-sr="expSave">Save</button></div>'
                : '<div class="sr-exp"><span>HV usually sends in</span><b>' + stEsc(expTxt) + '</b><button class="cx-link" data-sr="expEdit">Change</button></div>') +
    '<div class="sr-grid2" style="margin-top:8px">' + _srDateF('per_from', d.period_from, 'This Abrechnung from') + _srDateF('per_to', d.period_to, 'to') + '</div>' +
    '<p class="st-hint">Only change the dates if the HV settles a different period (max. 12 months).</p></details>';
  const nU = U.filter(([p]) => p.nk !== false && _srAmtOf(d, p, c.apt) !== null).length;
  const card = '<section class="srm__card"><div class="srm__ch"><p class="srm__ct">Hausgeld-Jahresabrechnung</p><span class="srm__cs">' + stEsc(_srPerText(c.per.from, c.per.to)) + ' · Frist for the NK ' + stDate(c.per.frist) + '</span></div>' +
    status + '<div class="sr-grid2">' + _srDateF('received_on', d.received_on, 'Received on') + _srDateF('hv_date', d.hv_date, 'Statement date') + '</div>' +
    costs + weg + check + settings + '</section>';
  return _srHead4(title, c.p.name + ' · you ↔ WEG') + '<div class="srm__pickwrap">' + _srPicker(c) + '</div>' +
    '<div class="srm__b"><div class="srm__one srm__wide">' + card + '</div></div>' +
    '<div class="srm__bar srm__bar--2"><button class="cx-btn cx-btn--s" data-sr="toNk"' + (nU ? '' : ' disabled') + '>Create NK · ' + nU + ' umlagefähige costs <i class="ti ti-chevron-right" aria-hidden="true"></i></button>' +
      '<button class="cx-btn cx-btn--p" data-sr="hvSave">' + (c.running && !hv.received ? 'Save draft' : 'Save') + '</button></div>';
}

/* ── Window B · NK-Abrechnung (you ↔ tenants): umlagefähige Hausgeld costs (ticked) + NK-only costs · tenants ── */
function _srNkView(c) {
  const title = 'NK-Abrechnung ' + c.per.label;
  if (c.before) return _srHead4(title, c.p.name) + '<div class="srm__pickwrap">' + _srPicker(c) + '</div><div class="srm__b"><div class="srm__card"><p class="st-note">' + stEsc(c.per.label) + ' is before your purchase (' + stDate(c.p.in_portfolio_since) + '). The seller settles this period with the tenants.</p></div></div>';
  const d = _srEnsureDraft(c), rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt);
  const change = _srTenantChange(c);
  const HV = [], X = [];
  (d.positions || []).forEach((p, i) => { if (_srIsNkOnly(p)) X.push([p, i]); else if (p.u) HV.push([p, i]); });
  const hvReady = HV.some(([p]) => _srAmtOf(d, p, c.apt) !== null);
  let costCard;
  if (!hvReady) {
    costCard = '<section class="srm__card"><div class="srm__ch"><p class="srm__ct">Costs for the NK</p></div>' +
      '<p class="st-note">The NK takes the umlagefähige costs from the Hausgeld-Jahresabrechnung. Enter those first.</p>' +
      '<div><button class="cx-btn cx-btn--p" data-sr="toHv">Open Hausgeld ' + stEsc(c.per.label) + '</button></div></section>';
  } else {
    const hvRows = HV.map(([p, i]) => {
      const k = _srKind(p.kind), a = _srAmtOf(d, p, c.apt), on = p.nk !== false && a !== null;
      const chip = change && ['heizung', 'warmwasser'].includes(p.kind) && on ? '<label class="ct-chip"><input type="checkbox" data-src="split" data-i="' + i + '"' + (p.split === 'mieter' ? ' checked' : '') + '/>per tenant</label>' : '';
      return '<div class="ct-r ct-r--nk' + (on ? '' : ' is-off') + '"><label class="ct-l"><input type="checkbox" class="ct-cb" data-src="innk" data-i="' + i + '"' + (on ? ' checked' : '') + (a === null ? ' disabled' : '') + '/><span class="ct-lab">' + stEsc(p.label || k.l) + '</span>' + chip + '</label>' +
        '<span class="ct-ro">' + (a === null ? '—' : stEur(_srSigned(p, a))) + '</span></div>';
    }).join('');
    const xRows = X.map(([p, i]) => {
      const k = _srKind(p.kind), named = p.kind !== 'grundsteuer' || p.label;
      const lab = named ? '<input class="ct-name" list="srKindList" data-srf="pos.' + i + '.label" placeholder="Name" value="' + stEsc(p.label || (p.kind === 'sonst' ? '' : k.l)) + '"/>' : '<span class="ct-lab">' + stEsc(k.l) + ' <small class="ct-src">from Rentals</small></span>';
      return '<div class="ct-r"><span class="ct-l">' + lab + '</span><span class="ct-a"><input inputmode="decimal" enterkeyhint="next" autocomplete="off" data-srf="pos.' + i + '.amount" aria-label="' + stEsc(p.label || k.l) + '" value="' + stEsc(_srE2in(p.amount)) + '"/><em>€</em></span></div>';
    }).join('');
    const tHv = cxR(HV.reduce((s, [p]) => s + (p.nk !== false ? _srSigned(p, _srAmtOf(d, p, c.apt)) : 0), 0));
    const tX = cxR(X.reduce((s, [p]) => s + _srSigned(p, _srAmtOf(d, p, c.apt)), 0));
    const hasGs = (d.positions || []).some(p => p.kind === 'grundsteuer');
    const gsQ = c.verw ? _srNum(c.verw.grundsteuer_mtl) : null;
    costCard = '<section class="srm__card"><div class="srm__ch"><p class="srm__ct">Costs for the NK</p><span class="srm__cs">split on the tenants by days</span></div>' +
      '<div class="ct"><div class="ct-h"><span class="st-f__l">From the Hausgeld · umlagefähig</span><b data-sr-tot="hvnk">' + stEur(tHv) + '</b></div>' + hvRows +
        '<button class="ct-add" data-sr="toHv"><i class="ti ti-pencil" aria-hidden="true"></i> Change amounts in Hausgeld</button></div>' +
      '<div class="ct"><div class="ct-h"><span class="st-f__l">NK only · not in the Hausgeld</span><b data-sr-tot="x">' + stEur(tX) + '</b></div>' + (xRows || '<p class="st-hint" style="margin:8px 0 0">e.g. Grundsteuer, which is billed to you directly.</p>') +
        '<div class="ct-adds">' + (!hasGs && gsQ ? '<button class="ct-add" data-sr="nkGs"><i class="ti ti-plus" aria-hidden="true"></i> Grundsteuer from Rentals</button>' : '') +
        '<button class="ct-add" data-sr="nkAdd"><i class="ti ti-plus" aria-hidden="true"></i> Add cost</button></div></div>' +
      '<div class="ct-tot"><span>Total for the NK</span><b data-sr-tot="nk">' + stEur(cxR(tHv + tX)) + '</b></div>' +
      '<datalist id="srKindList">' + SR_KINDS.filter(k => k.u).map(k => '<option value="' + stEsc(k.l) + '"></option>').join('') + '</datalist>' +
    '</section>';
  }
  const tenCard = '<section class="srm__card" id="srNkTens">' + _srNkTens(c, d, rec, hvReady) + '</section>';
  return _srHead4(title, c.p.name + ' · you ↔ tenants') + '<div class="srm__pickwrap">' + _srPicker(c) + '</div>' +
    '<div class="srm__b"><div class="srm__cols">' + costCard + tenCard + '</div></div>' +
    (hvReady ? '<div class="srm__bar"><button class="cx-btn cx-btn--p" data-sr="nkSave">Save</button></div>' : '');
}
/* The tenants of the NK window — previews follow the draft, so a change shows at once */
function _srNkTens(c, d, rec, hvReady) {
  const calcRec = hvReady ? d : rec, sumOk = hvReady;
  const tens = c.items.map(it => {
    const ti = _srTenInfo(c, it, calcRec, sumOk), id = String(ti.l.id);
    const res = ti.skipped ? '' : ti.st.res ? _srMoneyTxt(ti.st.res.dir, ti.st.res.amount, false) : ti.x && !ti.x.missing ? _srMoneyTxt(Math.sign(ti.x.saldo), Math.abs(ti.x.saldo), false) : '';
    const sub = stDM(ti.l.from) + '–' + stDate(ti.l.to) + (ti.st.res ? ' · sent ' + stDate(ti.st.res.date) : '');
    let acts = '';
    if (ti.kind === 'pausch') acts = ti.skipped ? '<span class="rk-ok"><i class="ti ti-check" aria-hidden="true"></i> no NK</span>' : '<button class="cx-btn cx-btn--s" data-sr="nd" data-id="' + stEsc(id) + '">Mark as no NK</button>';
    else if (ti.kind === 'unlinked') acts = '<span class="st-hint">No tenant linked – add the tenant in Rentals › Tenants.</span>';
    else if (!ti.x) acts = '<span class="st-hint">Waiting for the Hausgeld costs.</span>';
    else {
      acts = '<button class="cx-btn cx-btn--s" data-sr="pdfRow" data-cc-pdf="1" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(id) + '"><i class="ti ti-file-text" aria-hidden="true"></i> PDF</button>' +
        '<button class="cx-btn ' + (ti.k === 'open' ? 'cx-btn--p' : 'cx-btn--s') + '" data-sr="openTen" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(id) + '">' + (ti.k === 'open' ? 'Create NK' : 'Open') + '</button>' +
        (ti.k === 'sent' ? '<button class="cx-btn cx-btn--p" data-sr="settle" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(id) + '">Settle</button>' : '') +
        (ti.k === 'settled' ? '<span class="rk-ok"><i class="ti ti-check" aria-hidden="true"></i> ' + stEsc(_srSettledTxt(ti, false)) + '</span>' : '');
    }
    const g = /Guthaben/.test(res);
    return '<div class="srm__ten"><div class="srm__ten-h"><div><p class="srm__ten-n">' + stEsc(ti.name) + (ti.kind === 'pausch' ? ' <span class="st-tag">Pauschal</span>' : '') + '</p><p class="srm__ten-s">' + stEsc(sub) + '</p></div>' +
      (res ? '<p class="srm__ten-r' + (g ? ' is-g' : '') + '">' + stEsc(res.replace(/^(Nachzahlung|Guthaben) /, '')) + '<small>' + (g ? 'Guthaben' : /Nachzahlung/.test(res) ? 'Nachzahlung' : '') + (ti.st.res ? '' : ' · preview') + '</small></p>' : '') + '</div>' +
      '<div class="srm__acts">' + acts + '</div></div>';
  }).join('') || '<p class="st-hint">No tenant with Kalt + NK in this period.</p>';
  return '<div class="srm__ch"><p class="srm__ct">Tenants</p><span class="srm__cs">' + (SR.dirty ? 'preview · save to keep the changes' : 'saved to the tracker') + '</span></div>' + tens;
}
function _srRefreshNkTens() {
  const host = document.getElementById('srNkTens'), c = _srCards[SR.modal && SR.modal.ck];
  if (!host || !c || !SR.draft) return;
  _srCollect();
  host.innerHTML = _srNkTens(c, SR.draft, _srRec(c.p, c.per), true);
}

function _srRefreshTotals() {
  const c = _srCards[SR.modal && SR.modal.ck]; if (!c || !SR.draft) return;
  _srCollect();
  const d = SR.draft, t = { u: 0, n: 0, hvnk: 0, x: 0 };
  (d.positions || []).forEach(p => {
    const v = _srSigned(p, _srAmtOf(d, p, c.apt));
    if (_srIsNkOnly(p)) t.x += v; else { if (p.u) t.u += v; else t.n += v; if (p.u && p.nk !== false) t.hvnk += v; }
  });
  const set = (k, v) => { const el = document.querySelector('#srPanel [data-sr-tot="' + k + '"]'); if (el) el.textContent = stEur(cxR(v)); };
  set('u', t.u); set('n', t.n); set('t', t.u + t.n); set('hvnk', t.hvnk); set('x', t.x); set('nk', t.hvnk + t.x);
}

/* View 2 · one tenant */
function _srTenView(c) {
  const rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt);
  const it = c.items.find(x => String(x.r.id) === String(SR.modal.tid));
  if (!it) return _srHead4('Tenant', '', 'back') + '<div class="srm__b"><p class="cx-empty">Not found.</p></div>';
  const ti = _srTenInfo(c, it, rec, sum.ok), x = ti.x;
  const head = _srHead4(ti.name, 'NK ' + c.per.label + ' · ' + c.p.name, 'back');
  if (!x) return head + '<div class="srm__b"><div class="srm__card"><p class="st-note">Enter the costs of the Jahresabrechnung first – then the NK for ' + stEsc(ti.name) + ' is calculated here.</p></div></div>';
  const ts = x.ts, sent = !!ti.st.res, date = ts.date || cxToday(), days = _srNum(ts.days) ?? 30, via = _srViaOf(x);
  SR.sign = _srSign(x);
  const perC = _srPer(c, rec);
  const since = _srD(c.p.in_portfolio_since);
  // result
  const status = sent ? '<div class="srm__state' + (ti.k === 'settled' ? ' is-ok' : '') + '"><span>' + (ti.k === 'settled' ? '<i class="ti ti-check" aria-hidden="true"></i> Settled · ' + stEsc(_srSettledTxt(ti, false)) : 'Sent ' + stDate(ti.st.res.date) + ' · waiting to be settled') + '</span>' +
    '<span class="srm__state-a">' + (ti.k === 'settled' ? '<button class="cx-link" data-sr="settle" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(String(ti.l.id)) + '">edit</button>' : '<button class="cx-btn cx-btn--p" data-sr="settle" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(String(ti.l.id)) + '">Settle</button>') +
    '<button class="cx-link" data-sr="reopen">Back to open</button></span></div>' : '';
  const perRow = SR.perEdit && !sent
    ? '<div class="sr-peredit"><div class="sr-grid2"><label class="st-f"><span class="st-f__l">From</span><input class="st-in" type="date" id="srTpF" value="' + stEsc(_srD(it.r.period_from)) + '"/></label>' +
      '<label class="st-f"><span class="st-f__l">To</span><input class="st-in" type="date" id="srTpT" value="' + stEsc(_srD(it.r.period_to)) + '"/></label></div>' +
      '<div class="sr-peredit__b"><button class="cx-link" data-sr="tenPerCancel">Cancel</button><button class="cx-link sr-acc" data-sr="tenPerSave">Save</button></div></div>'
    : '<div class="cx-kv"><span>Period<small class="srm__sm">from Rentals · a change applies to this NK only</small></span><span>' + stEsc(stDM(x.from) + '–' + stDate(x.to)) + ' · ' + x.tDays + ' days' + (sent ? '' : ' <button class="cx-link sr-inl" data-sr="tenPerEdit">edit</button>') + '</span></div>';
  const vzSrc = x.vzOv !== null ? (x.vzSoll !== null && Math.abs(x.vzOv - x.vzSoll) < 0.005 ? 'per contract' : 'by hand') : x.vzIst !== null ? 'paid per Controlling' : 'per contract';
  const vzAlt = [];
  if (!sent && x.vzIst !== null && (x.vzOv !== null || Math.abs(x.vz - x.vzIst) >= 0.01)) vzAlt.push(['ist', 'Controlling ' + stEur(x.vzIst)]);
  if (!sent && x.vzSoll !== null && Math.abs(x.vz - x.vzSoll) >= 0.01) vzAlt.push(['soll', 'Contract ' + stEur(x.vzSoll)]);
  const figs = '<div class="st-block">' + perRow +
    (since && perC.from < since && x.from >= since && !sent ? '<p class="sr-hint2">Bought on ' + stDate(since) + ': if ' + stEsc(ti.name) + ' already lived there before, extend the period to ' + stDM(perC.from) + ' – the NK covers the whole year.</p>' : '') +
    '<div class="cx-kv"><span>Tenant share (' + x.lines.length + ' items)</span><span class="sr-strong" data-sr-sum>' + stEur(x.sum) + '</span></div>' +
    '<div class="cx-kv sr-kv-in"><span>Vorauszahlungen<small>' + stEsc(vzSrc) + ' · editable</small></span>' +
      (sent ? '<span>− ' + stEur(x.vz) + '</span>' : '<label class="cx-f sr-in-s"><span>−</span><input type="text" inputmode="decimal" data-srt="vz" value="' + stEsc(cxE2(x.vz)) + '" aria-label="Vorauszahlungen"><span>€</span></label>') + '</div>' +
    (vzAlt.length ? '<div class="sr-vzalt"><span>use instead:</span>' + vzAlt.map(([k, t]) => '<button class="sr-vzalt__b" data-sr="vzUse" data-v="' + k + '">' + stEsc(t) + '</button>').join('') + '</div>' : '') +
    (x.pre ? '<p class="sr-hint2">Before the purchase (' + stDM(x.pre.from) + '–' + stDate(x.pre.to) + '): ' + stEur(x.pre.soll) + ' per contract – check with the seller.</p>' : '') +
  '</div>';
  let calc = '';
  for (const ln of x.lines) {
    const label = ln.pos.label || _srKind(ln.pos.kind).l, direct = ln.pos.split === 'mieter';
    const small = direct ? 'per tenant · Zwischenablesung' : x.partial ? stEur(ln.unit ?? 0) + ' × ' + x.tDays + '/' + x.perDays + ' days' : 'Kosten der Wohnung';
    calc += '<div class="sr-cl"><span class="sr-cl__t">' + stEsc(label) + '<small>' + stEsc(small) + '</small></span>' +
      (direct && !sent ? '<label class="cx-f sr-in-s"><input type="text" inputmode="decimal" data-srt="direct.' + stEsc(ln.pos.id) + '" value="' + stEsc(_srE2in(ts.direct && ts.direct[ln.pos.id])) + '" aria-label="' + stEsc(label) + ' for this tenant"><span>€</span></label>'
                       : '<span class="sr-cl__v">' + (ln.amt === null ? '<em class="sr-miss">missing</em>' : stEur(ln.amt)) + '</span>') + '</div>';
  }
  const calcBlock = '<details class="sr-more"' + (x.missing ? ' open' : '') + '><summary>Breakdown per item</summary><div class="sr-calc">' + calc + '</div></details>';
  const kau = x.einbehalt > 0 ? '<div class="st-block sr-kau"><p class="st-f__l">Kaution-Einbehalt</p>' +
    '<div class="cx-kv"><span>Held back until the NK</span><span>' + stEur(x.einbehalt) + '</span></div>' +
    '<div class="cx-kv"><span><b>' + (cxR(x.einbehalt - x.saldo) >= 0 ? 'Pay back to the tenant' : 'Tenant still pays') + '</b></span><span><b>' + stEur(Math.abs(cxR(x.einbehalt - x.saldo))) + '</b></span></div></div>' : '';
  // letter
  const addr = ts.addr !== undefined && ts.addr !== null ? ts.addr : _srDefaultAddr(c, it, x);
  const isNach = x.saldo > 0, moved = _srMovedOut(ti.t);
  let letter = '';
  if (!sent) {
    if (!SR.briefOpen) {
      letter = '<div><p class="st-f__l">Letter</p><div class="cx-kv"><span>To</span><span>' + stEsc(addr.split('\n').filter(Boolean).join(', ') || '— missing —') + '</span></div>' +
        '<div class="cx-kv"><span>Date · payment term</span><span>' + stDate(date) + ' · ' + days + ' days</span></div>' +
        '<div class="cx-kv"><span>Settled by</span><span>' + ({ zahlung: 'bank transfer', miete: 'with the rent', kaution: 'with the Kaution' }[via]) + '</span></div>' +
        '<button class="cx-link sr-acc" data-sr="brief">Edit letter</button></div>';
    } else {
      const vias = [['zahlung', 'Transfer'], ['miete', 'With rent'], ['kaution', 'Kaution']];
      letter = '<div class="st-form"><p class="st-f__l">Letter</p>' +
        '<label class="st-f"><span class="st-f__l">Address' + (moved ? ' (new address after moving out)' : '') + '</span><textarea class="st-in sr-ta" rows="3" data-srt="addr">' + stEsc(addr) + '</textarea></label>' +
        (!isNach && x.saldo ? '<label class="st-f"><span class="st-f__l">Tenant IBAN · for the Guthaben (optional)</span><input class="st-in" data-srt="iban" value="' + stEsc(ts.iban || '') + '" placeholder="DE…"/></label>' : '') +
        '<div class="sr-grid2"><label class="st-f"><span class="st-f__l">Date</span><input class="st-in" type="date" data-srt="date" value="' + stEsc(date) + '"/></label>' +
          '<label class="st-f"><span class="st-f__l">Payment term (days)</span><input class="st-in" inputmode="numeric" data-srt="days" value="' + days + '"/></label></div>' +
        (x.saldo ? '<fieldset class="st-f"><legend class="st-f__l">' + (isNach ? 'Nachzahlung' : 'Guthaben') + ' settled by</legend><div class="st-seg st-seg--3" role="group">' +
          vias.map(([v, tx]) => '<button type="button" class="st-seg__b' + (via === v ? ' is-on' : '') + '" data-sr="via" data-v="' + v + '" aria-pressed="' + (via === v) + '">' + tx + '</button>').join('') + '</div></fieldset>' : '') +
        (!moved ? '<div class="sr-grid2"><label class="st-f"><span class="st-f__l">New NK / month (optional)</span><span class="st-amt"><input class="st-in" inputmode="decimal" data-srt="new_vz" value="' + stEsc(_srE2in(ts.new_vz)) + '"/><span>€</span></span></label>' +
          '<label class="st-f"><span class="st-f__l">from</span><input class="st-in" type="date" data-srt="new_vz_from" value="' + stEsc(ts.new_vz_from || '') + '"/></label></div>' : '') +
        '<label class="st-f"><span class="st-f__l">Anlage</span><input class="st-in" data-srt="anlagen" value="' + stEsc(ts.anlagen !== undefined && ts.anlagen !== null ? ts.anlagen : _srDefaultAnlagen(rec)) + '"/></label>' +
        '<button class="cx-link sr-acc" data-sr="brief">Done</button></div>';
    }
  }
  const late = !sent && perC.frist && date > perC.frist && x.saldo > 0;
  return head + '<div class="srm__b"><div class="srm__one">' +
    '<div data-sr-res>' + _srBig(x, date, days, via) + '</div>' + status + figs + calcBlock + kau + letter +
    (sent ? '' : '<div data-sr-check>' + _srCheckHtml(c, it, rec, x) + '</div>') +
    (late ? '<div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> The Frist (' + stDate(perC.frist) + ') has passed: a Nachzahlung can no longer be claimed; a Guthaben must still be paid.</div>' : '') +
    (sent ? '' : '<button class="cx-link sr-skip" data-sr="settle" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(String(ti.l.id)) + '" data-skip="1">Skip this NK</button>') +
  '</div></div>' +
  '<div class="srm__bar srm__bar--2"><button type="button" class="cx-btn cx-btn--s" data-sr="pdf" data-cc-pdf="1"' + (x.missing ? ' disabled' : '') + '><i class="ti ti-file-text" aria-hidden="true"></i> Create PDF</button>' +
    (sent ? '<button type="button" class="cx-btn cx-btn--p" data-sr="settle" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(String(ti.l.id)) + '">' + (ti.k === 'settled' ? 'Edit settlement' : 'Settle') + '</button>'
          : '<button type="button" class="cx-btn cx-btn--p" data-sr="send"' + (x.missing ? ' disabled' : '') + '><i class="ti ti-send" aria-hidden="true"></i> Mark sent</button>') + '</div>';
}

/* View 3 · settle (tenant NK or WEG result) — paid · offset · skipped; amount may differ */
function _srSettleView(c) {
  const m = SR.modal, weg = !!m.weg;
  const rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt);
  let st, name, res, einbehalt = 0, saldo = 0, ti = null;
  if (weg) { const l = _srLine(c, c.weg); st = l.state; res = st.res; name = 'Hausgeld · WEG'; }
  else {
    const it = c.items.find(x => String(x.r.id) === String(m.tid)); if (!it) return _srHead4('Settle', '', 'back') + '<div class="srm__b"><p class="cx-empty">Not found.</p></div>';
    ti = _srTenInfo(c, it, rec, sum.ok); st = ti.st; res = st.res; name = ti.name;
    if (ti.x) { einbehalt = ti.x.einbehalt; saldo = ti.x.saldo; }
  }
  const cur = m.choice || (ti && ti.skipped ? 'skip' : st.booking ? 'paid' : res && res.via && res.via !== 'zahlung' ? 'offset' : m.skip ? 'skip' : res ? 'paid' : 'skip');
  const kauCase = false;                                     // Kaution + Einbehalt: Rentals › Tenants, by hand
  const defAmt = st.booking ? Number(st.booking.amount) : res ? res.amount : 0;
  const defDate = st.booking ? _srD(st.booking.invoice_date) : cxToday();
  const paidLabel = weg ? (res && res.dir > 0 ? 'Received from the WEG' : 'Paid to the WEG') : kauCase ? 'Paid back (Guthaben + Kaution-Einbehalt)' : res && res.dir > 0 ? 'Paid by the tenant' : 'Paid back to the tenant';
  const opt = (v, t, s, extra) => '<div class="srm__opt' + (cur === v ? ' is-on' : '') + '" data-sr="choice" data-v="' + v + '"><input type="radio" name="srSettle" id="srOpt_' + v + '" value="' + v + '"' + (cur === v ? ' checked' : '') + '/>' +
    '<div class="srm__opt-b"><label class="srm__opt-t" for="srOpt_' + v + '">' + t + '</label><span class="srm__opt-s">' + s + '</span>' + (cur === v && extra ? extra : '') + '</div></div>';
  const paidExtra = '<div class="sr-grid2 srm__opt-f"><div class="st-f"><label class="st-f__l" for="srSetAmt">Amount</label><span class="st-amt"><input class="st-in" inputmode="decimal" id="srSetAmt" value="' + stEsc(cxE2(defAmt)) + '"/><span>€</span></span></div>' +
    '<div class="st-f"><label class="st-f__l" for="srSetDate">Date</label><input class="st-in" type="date" id="srSetDate" value="' + stEsc(defDate) + '"/></div></div>';
  const offVia = weg ? '' : '<div class="st-seg st-seg--2 srm__opt-f" role="group">' + ['kaution', 'miete'].map(v => '<button type="button" class="st-seg__b' + ((m.offVia || (res && res.via !== 'zahlung' ? res.via : 'kaution')) === v ? ' is-on' : '') + '" data-sr="offVia" data-v="' + v + '">' + (v === 'kaution' ? 'Kaution' : 'Rent') + '</button>').join('') + '</div>';
  const note = (weg ? (rec && rec.keys && rec.keys.weg_note) : ti && ti.ts.settle_note) || '';
  let opts = '';
  if (res && res.amount) opts += opt('paid', paidLabel, 'the amount may differ from the result' + (res ? ' (' + stEur(res.amount) + ')' : ''), paidExtra);
  if (res && res.amount) opts += opt('offset', weg ? 'Settled with the Hausgeld' : 'Settled via Kaution or with the rent', weg ? 'no extra transfer' : 'you keep track of the Einbehalt in Rentals › Tenants', offVia);
  if (!weg) opts += opt('skip', 'Skipped', 'not paid or not claimed – counts as settled', '');
  const settledNow = weg ? (st.booking || (res && res.via !== 'zahlung')) : ti && (ti.k === 'settled');
  return _srHead4('Settle – ' + name, (weg ? 'Hausgeld ' : 'NK ') + c.per.label + ' · ' + c.p.name + (res ? ' · result ' + _srMoneyTxt(res.dir, res.amount, weg) : ''), 'back') +
    '<div class="srm__b"><div class="srm__one srm__narrow">' + opts +
      '<label class="st-f"><span class="st-f__l">Note (optional)</span><input class="st-in" id="srSetNote" value="' + stEsc(note) + '"/></label>' +
      '<p class="st-hint">You can change this any time: tap the line in the tracker.</p>' +
      (settledNow ? '<button class="cx-link sr-skip" data-sr="unsettle">Undo – back to ' + (ti && ti.skipped ? 'open' : 'sent') + '</button>' : '') +
    '</div></div>' +
    '<div class="srm__bar srm__bar--2"><button class="cx-btn cx-btn--s" data-sr="back">Cancel</button><button class="cx-btn cx-btn--p" data-sr="settleSave">Save</button></div>';
}

/* Apply the settle choice */
async function _srSettleSave(btn) {
  const m = SR.modal, c = _srCards[m.ck], weg = !!m.weg; if (!c) return;
  const rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt);
  const choice = m.choice || (document.querySelector('#srPanel input[name="srSettle"]:checked') || {}).value;
  const note = (document.getElementById('srSetNote') || {}).value || '';
  let it = null, l, st, ti = null;
  if (weg) { it = c.weg; l = _srLine(c, it); st = l.state; }
  else { it = c.items.find(x => String(x.r.id) === String(m.tid)); if (!it) return; ti = _srTenInfo(c, it, rec, sum.ok); l = ti.l; st = ti.st; }
  const res = st.res, b = st.booking;
  if (btn) btn.disabled = true;
  try {
    const setVia = async via => {
      await _ctlSupa.from('abr_results').update({ settle_via: via }).eq('id', res.id);
      res.db.settle_via = via;
      await _stUpsertSettlement(l, { settled_via: via });
    };
    const dropBooking = async () => { if (b) { await ctlDeleteOneTime(b.id); window._src.abrPay = (window._src.abrPay || []).filter(o => o.id !== b.id); } };
    if (choice === 'paid') {
      const amt = cxR(Math.abs(cxParse((document.getElementById('srSetAmt') || {}).value || '0')));
      const date = _srD((document.getElementById('srSetDate') || {}).value) || cxToday();
      if (!(amt > 0)) { stSay('Please enter the amount'); if (btn) btn.disabled = false; return; }
      {
        if (res.via !== 'zahlung') await setVia('zahlung');
        if (b) {
          const d = await ctlUpdateOneTime(b.id, { amount: amt, invoice_date: date });
          const i = window._src.abrPay.findIndex(o => o.id === b.id); if (i >= 0) window._src.abrPay[i] = d;
        } else {
          const label = weg ? 'Hausgeld ' + c.per.label + ' · ' + (res.dir > 0 ? 'Guthaben from WEG' : 'Nachzahlung to WEG') : 'NK ' + c.per.label + ' · ' + (ti ? _srTName(ti.t) : '') + ' · ' + (res.dir > 0 ? 'Nachzahlung' : 'Guthaben');
          const d = await ctlAddOneTime({ property_id: c.p.id, invoice_date: date, item: label, amount: amt,
            kind: weg ? 'Hausgeldabrechnung' : 'NK-Abrechnung', direction: res.dir, source_ref: 'abr:' + res.id });
          window._src.abrPay = (window._src.abrPay || []).concat([d]);
        }
      }
      await _stConfirmSettled(l, 'zahlung', date);
    } else if (choice === 'offset') {
      await dropBooking();
      const via = weg ? 'hausgeld' : (m.offVia || (res.via !== 'zahlung' ? res.via : 'kaution'));
      await setVia(via);
      await _stConfirmSettled(l, via, cxToday());
      if (weg && rec) { rec.weg_via = 'hausgeld'; }
    } else if (choice === 'skip') {
      await dropBooking();
      if (res) { await _ctlSupa.from('abr_results').update({ status: 'storniert' }).eq('id', res.id); res.db.status = 'storniert'; }
      await _stUpsertSettlement(l, { status: 'nicht durchgeführt', amount: null, direction: null, settled_via: null, result_id: null });
    }
    // the note lives with the Jahresabrechnung record
    if (rec) {
      if (weg) { rec.keys = rec.keys || {}; rec.keys.weg_note = note || null; }
      else { rec.tenants = rec.tenants || {}; const ts = rec.tenants[String(it.r.tenant_id)] = rec.tenants[String(it.r.tenant_id)] || {}; ts.settle_note = note || null; }
      try { await srSaveRow(rec); } catch (e) {}
    }
    ctlSettlementInvalidate();
    stSay('Saved');
    SR.modal = m.from === 'tracker' ? null : Object.assign({}, m, { view: m.back || 'nk', choice: null, offVia: null, skip: null });
    if (SR.modal && SR.modal.view === 'tenant' && m.tid) {                     // the line id may have changed (virtual → stored)
      const again = _srYearModel(SR.year).find(x => x.ck === m.ck);
      const nit = again && again.items.find(x => x.r.tenant_id && it.r.tenant_id && String(x.r.tenant_id) === String(it.r.tenant_id) && _srD(x.r.period_from) === _srD(it.r.period_from));
      if (nit) SR.modal.tid = String(nit.r.id);
    }
  } catch (err) { stSay('Could not save — ' + (err.message || err)); if (btn) btn.disabled = false; return; }
  stRenderRentals();
}
async function _srUnsettle() {
  const m = SR.modal, c = _srCards[m.ck], weg = !!m.weg; if (!c) return;
  const rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt);
  let l, st, ti = null;
  if (weg) { l = _srLine(c, c.weg); st = l.state; }
  else { const it = c.items.find(x => String(x.r.id) === String(m.tid)); if (!it) return; ti = _srTenInfo(c, it, rec, sum.ok); l = ti.l; st = ti.st; }
  try {
    if (ti && ti.skipped) { await _stUpsertSettlement(l, { status: 'offen' }); }
    else {
      if (st.booking) { await ctlDeleteOneTime(st.booking.id); window._src.abrPay = (window._src.abrPay || []).filter(o => o.id !== st.booking.id); }
      if (st.res && st.res.via !== 'zahlung') { await _ctlSupa.from('abr_results').update({ settle_via: 'zahlung' }).eq('id', st.res.id); st.res.db.settle_via = 'zahlung'; await _stUpsertSettlement(l, { settled_via: 'zahlung' }); }
      await _stUpsertSettlement(l, { status: 'verschickt' });                 // back to sent: waiting again
    }
  } catch (err) { stSay('Could not undo — ' + (err.message || err)); return; }
  ctlSettlementInvalidate(); stSay('Undone');
  SR.modal = Object.assign({}, m, { choice: null }); stRenderRentals();
}

/* Save ① Jahresabrechnung */
async function _srHvSave4(btn, thenView) {
  _srCollect();
  const d = SR.draft, c = _srCards[SR.modal.ck]; if (!d || !c) return;
  // custom rows: match a catalogue name, else keep as "Sonstige"
  d.positions = (d.positions || []).filter(p => p.kind && (_srNum(p.amount) !== null || _srUnitAmt(d, Object.assign({}, p, { amount: null }), c.apt) !== null))
    .map(p => {
      if (p.label) { const k = SR_KINDS.find(x => x.l.toLowerCase() === String(p.label).toLowerCase()); if (k) { p.kind = k.k; p.u = k.u; p.label = null; } }
      return p;
    });
  if (!d.period_from || !d.period_to || d.period_to < d.period_from) { stSay('Period: “to” is before “from”'); return; }
  if (_srDays(d.period_from, d.period_to) > 366) { stSay('More than 12 months: enter one Abrechnung per year'); return; }
  if (d.weg_direction && !(_srNum(d.weg_amount) > 0)) { stSay('Please enter the amount of the WEG result'); return; }
  if (!d.weg_direction) { d.weg_amount = null; d.weg_due = null; }
  if (d.weg_direction && !d.weg_via) d.weg_via = 'zahlung';
  const hgDef = _srHausgeldPaid(c);
  if (_srNum(d.keys.hg_paid) !== null && Math.abs(_srNum(d.keys.hg_paid) - hgDef) < 0.005) d.keys.hg_paid = null;   // equal to Rentals → keep following Rentals
  if (btn) btn.disabled = true;
  try {
    const clean = Object.assign({}, d); delete clean._ck;
    const saved = await srSaveRow(clean);
    await _srWriteWeg(c, saved);
    SR.draft = null; SR.costsOpen = false;
    if (thenView && SR.modal) SR.modal.view = thenView;
    stSay('Saved');
  } catch (err) {
    const msg = String((err && (err.message || err.code)) || err);
    stSay(/does not exist|42P01|relation|schema cache/i.test(msg) ? 'Please run the SQL (nk_abrechnung_rentals) first' : 'Could not save — ' + msg);
    if (btn) btn.disabled = false; return;
  }
  ctlSettlementInvalidate();
  stRenderRentals();
}

/* ── Events ── */
function _srOpen(modal) {
  const keepDraft = SR.modal && SR.draft && SR.draft._ck === modal.ck;
  SR.modal = Object.assign({ view: 'nk' }, modal);
  SR.briefOpen = false; SR.perEdit = false; SR.expEdit = false;
  if (!keepDraft && (SR.modal.view === 'nk' || SR.modal.view === 'hv')) SR.draft = null;
  stRenderRentals();
}
async function _srCloseModal() {
  if (SR.dirty && !(await stConfirm({ title: 'Discard your changes?', ok: 'Discard', danger: true }))) return false;
  SR.modal = null; SR.draft = null; SR.dirty = false; SR.sel = null;
  stRenderRentals(); return true;
}
function srOpenFromTracking(l) { return false; }             // the Tracking tab is gone; kept for older callers
function srIsRentalsLine() { return false; }
(function () {
  const host = document.getElementById('tab-rentals'); if (!host) return;
  host.addEventListener('click', async e => {
    if (e.target.matches('input:not([type="radio"]):not([type="checkbox"]), textarea, select')) return;
    const b = e.target.closest('[data-sr], [data-st]'); if (!b || b.disabled) return;
    if (b.matches('input[type="checkbox"]') && b.dataset.sr !== 'tick') return;
    if (b.dataset.st) {                                               // Abrechnungszeitraum row (shared helper)
      const a = b.dataset.st;
      if (a === 'perEdit') { ST.perEdit = Number(b.dataset.k); _srRerenderPanel(); }
      if (a === 'perCancel') { ST.perEdit = null; _srRerenderPanel(); }
      if (a === 'perSave') { await _stPeriodSave(Number(b.dataset.k)); }
      return;
    }
    const a = b.dataset.sr;
    // unsaved costs in a window: save them before moving on to a tenant, a PDF or Settle
    if (SR.modal && SR.dirty && ['openTen', 'pdfRow', 'settle'].includes(a) && ['nk', 'hv'].includes(SR.modal.view)) {
      const view = SR.modal.view; await _srHvSave4(null, view); SR.dirty = false;
    }
    // tracker
    if (a === 'year') { SR.year += Number(b.dataset.d); SR.modal = null; SR.draft = null; stRenderRentals(); return; }
    if (a === 'filter') { SR.filter = b.dataset.k; stRenderRentals(); return; }
    if (a === 'sumTen' || a === 'sumHg') { SR.modal = { view: a, from: 'tracker' }; stRenderRentals(); return; }
    if (a === 'nk') {                                                 // next Wohnung that needs work, else the first
      const list = Object.values(_srCards).map(c => _srCardInfo4(c));
      const next = list.find(i => i.k === 'open' && !i.c.running) || list.find(i => i.k === 'open') || list[0];
      if (next) _srOpen({ ck: next.c.ck, from: 'tracker' }); return;
    }
    if (a === 'open' || a === 'openNk') { e.stopPropagation(); _srOpen({ ck: b.dataset.k, view: 'nk', from: 'tracker' }); return; }
    if (a === 'openHv') { e.stopPropagation(); _srOpen({ ck: b.dataset.k, view: 'hv', from: 'tracker' }); return; }
    if (a === 'openTen') {
      e.stopPropagation();
      const c = _srCards[b.dataset.k]; if (!c) return;
      const rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt);
      const it = c.items.find(x => String(x.r.id) === String(b.dataset.id));
      const ti = it ? _srTenInfo(c, it, rec, sum.ok) : null;
      if (ti && ti.kind === 'ten' && ti.x) _srOpen({ ck: b.dataset.k, view: 'tenant', tid: b.dataset.id, from: SR.modal ? 'nk' : 'tracker' });
      else _srOpen({ ck: b.dataset.k, from: 'tracker' });
      return;
    }
    if (a === 'settle') {
      e.stopPropagation();
      const from = SR.modal ? SR.modal.view : 'tracker';
      SR.modal = { ck: b.dataset.k, view: 'settle', tid: b.dataset.id || null, weg: b.dataset.w === '1', from: from === 'tracker' ? 'tracker' : from, back: from === 'tracker' ? null : from, skip: b.dataset.skip === '1' };
      if (SR.modal.skip) SR.modal.choice = 'skip';
      stRenderRentals(); return;
    }
    if (a === 'tick') {
      e.preventDefault(); e.stopPropagation();
      const c = _srCards[b.dataset.k]; if (!c) return;
      const it = c.items.find(x => String(x.r.id) === String(b.dataset.id)); if (!it) return;
      const l = _srLine(c, it);
      if (l.state.res) { await _stReopen(l); ctlSettlementInvalidate(); stRenderRentals(); return; }   // untick = back to open (asks first)
      SR.sel = { kind: 'ten', ck: c.ck, tid: String(it.r.id) }; SR.modal = null;
      await _srSend(null); return;
    }
    if (a === 'pdfRow') {
      e.stopPropagation();
      SR.sel = { kind: 'ten', ck: b.dataset.k, tid: b.dataset.id };
      await _srPdf(b); return;
    }
    if (a === 'ask') {                                                // mailto opens the mail app; we log the date
      e.stopPropagation();
      if (SR.missing) return;
      const c = _srCards[b.dataset.k]; if (!c) return;
      const rec = _srRec(c.p, c.per) || _srBlankRec(c);
      const t = cxToday(), list = (rec.asked_on || []).map(_srD);
      if (!list.includes(t)) rec.asked_on = list.concat([t]);
      setTimeout(async () => { try { await srSaveRow(rec); stRenderRentals(); } catch (err) { stSay('Not saved — ' + (err.message || err)); } }, 400);
      return;
    }
    if (a === 'history') { e.stopPropagation(); _srOpen({ ck: b.dataset.k, view: 'history', from: 'tracker' }); return; }
    if (a === 'histYear') { SR.year = Number(b.dataset.y); SR.modal = null; SR.draft = null; stRenderRentals(); window.scrollTo(0, 0); return; }
    if (a === 'letterOpen') { e.stopPropagation(); await _srOpenLetter(b.dataset.id); return; }
    if (a === 'fold5') { SR.open[b.dataset.k] = !SR.open[b.dataset.k]; stRenderRentals(); return; }
    // modal
    if (!SR.modal) return;
    const c = _srCards[SR.modal.ck];
    if (a === 'close') { _srCloseModal(); return; }
    if (a === 'back') {
      const m = SR.modal;
      if (m.view === 'settle' && m.from === 'tracker') { SR.modal = null; stRenderRentals(); return; }
      SR.modal = Object.assign({}, m, { view: m.view === 'settle' ? (m.back || 'nk') : 'nk', choice: null, weg: false });
      SR.briefOpen = false; SR.perEdit = false; stRenderRentals(); return;
    }
    if (a === 'pick') {
      const list = Object.values(_srCards), i = list.findIndex(x => x.ck === SR.modal.ck) + Number(b.dataset.d);
      if (list[i]) { if (SR.dirty && !(await stConfirm({ title: 'Discard your changes?', ok: 'Discard', danger: true }))) return; SR.dirty = false; _srOpen({ ck: list[i].ck, view: SR.modal.view === 'hv' ? 'hv' : 'nk', from: SR.modal.from }); }
      return;
    }
    if (!c) return;
    if (a === 'costs') { _srCollect(); SR.costsOpen = !SR.costsOpen; _srRerenderPanel(); return; }
    if (a === 'rowAdd') {
      _srCollect();
      const u = b.dataset.u === '1', p = _srNewPos(u ? 'sonst' : 'nu_sonst', SR.draft); p.label = '';
      SR.draft.positions.push(p); SR.dirty = true; _srRerenderPanel();
      const ins = document.querySelectorAll('#srPanel .ct-name'); if (ins.length) ins[ins.length - 1].focus();
      return;
    }
    if (a === 'wegDir') { _srCollect(); SR.draft.weg_direction = Number(b.dataset.v); SR.dirty = true; _srRerenderPanel(); return; }
    if (a === 'hvSave' || a === 'nkSave') { await _srHvSave4(b); SR.dirty = false; return; }
    if (a === 'toNk') { if (SR.dirty) { await _srHvSave4(b, 'nk'); SR.dirty = false; } else { SR.modal.view = 'nk'; _srRerenderPanel(); } return; }
    if (a === 'toHv') { _srCollect(); SR.modal.view = 'hv'; SR.costsOpen = true; _srRerenderPanel(); return; }
    if (a === 'nkAdd' || a === 'nkGs') {
      _srCollect();
      const gs = a === 'nkGs', p = _srNewPos(gs ? 'grundsteuer' : 'sonst', SR.draft);
      p.origin = 'nk'; p.u = true;
      if (gs) { const q = _srNum(c.verw && c.verw.grundsteuer_mtl); p.amount = q ? cxR(q * 4) : null; } else p.label = '';
      SR.draft.positions.push(p); SR.dirty = true; _srRerenderPanel();
      if (!gs) { const ins = document.querySelectorAll('#srPanel .ct-name'); if (ins.length) ins[ins.length - 1].focus(); }
      return;
    }
    if (a === 'expEdit') { _srCollect(); SR.expEdit = true; _srRerenderPanel(); return; }
    if (a === 'expCancel') { SR.expEdit = false; _srRerenderPanel(); return; }
    if (a === 'expSave') {
      const v = document.getElementById('srExpM')?.value || '';
      const { error } = await _ctlSupa.from('ctrl_properties').update({ hv_expected_month: v ? Number(v) : null }).eq('id', c.p.id);
      if (error) { stSay(/hv_expected_month/.test(error.message || '') ? 'Please run the SQL first' : 'Failed — ' + error.message); return; }
      c.p.hv_expected_month = v ? Number(v) : null; SR.expEdit = false; stSay('Saved'); stRenderRentals(); return;
    }
    if (a === 'nd') {
      const it = c.items.find(x => String(x.r.id) === String(b.dataset.id)); if (!it) return;
      await _stNotDone(_srLine(c, it)); ctlSettlementInvalidate(); stRenderRentals(); return;
    }
    // tenant view
    if (a === 'tenPerEdit') { SR.perEdit = true; _srRerenderPanel(); return; }
    if (a === 'tenPerCancel') { SR.perEdit = false; _srRerenderPanel(); return; }
    if (a === 'tenPerSave') {
      const it = c.items.find(x => String(x.r.id) === String(SR.modal.tid)); if (!it) return;
      const pf = _srD(document.getElementById('srTpF')?.value), pt = _srD(document.getElementById('srTpT')?.value);
      if (!pf || !pt || pt < pf) { stSay('Period: “to” is before “from”'); return; }
      let row;
      try { row = await _stUpsertSettlement(_srLine(c, it), { period_from: pf, period_to: pt, period_custom: true }); }
      catch (err) {
        if (/period_custom/.test(err.message || '')) { try { row = await _stUpsertSettlement(_srLine(c, it), { period_from: pf, period_to: pt }); } catch (e2) { stSay('Failed — ' + (e2.message || e2)); return; } }
        else { stSay('Failed — ' + (err.message || err)); return; }
      }
      ctlSettlementInvalidate(); SR.perEdit = false; SR.modal.tid = String(row.id); stSay('Period saved'); stRenderRentals(); return;
    }
    if (a === 'vzUse') {
      const got = _srCollectTenant(); if (!got) return;
      if (b.dataset.v === 'soll') { const x = _srCalc(got.c, got.it, Object.assign({}, got.rec, { tenants: Object.assign({}, got.rec.tenants, { [String(got.it.r.tenant_id)]: Object.assign({}, got.ts, { vz: null }) }) })); got.ts.vz = x.vzSoll; }
      else got.ts.vz = null;
      _srQueueTenantSave(got.rec); _srRerenderPanel(); return;
    }
    if (a === 'brief') { const got = _srCollectTenant(); if (got) _srQueueTenantSave(got.rec); SR.briefOpen = !SR.briefOpen; _srRerenderPanel(); return; }
    if (a === 'via') { const got = _srCollectTenant(); if (!got) return; got.ts.via = b.dataset.v; _srQueueTenantSave(got.rec); _srRerenderPanel(); return; }
    if (a === 'pdf') { await _srPdf(b); return; }
    if (a === 'send') { await _srSend(b); return; }
    if (a === 'reopen') {
      const it = c.items.find(x => String(x.r.id) === String(SR.modal.tid)); if (!it) return;
      await _stReopen(_srLine(c, it)); ctlSettlementInvalidate(); stRenderRentals(); return;
    }
    // settle view
    if (a === 'choice') { const v = b.dataset.v || b.value; if (SR.modal.choice !== v) { SR.modal.choice = v; _srRerenderPanel(); } return; }
    if (a === 'offVia') { SR.modal.offVia = b.dataset.v; _srRerenderPanel(); return; }
    if (a === 'settleSave') { await _srSettleSave(b); return; }
    if (a === 'unsettle') { await _srUnsettle(); return; }
  });
  // row click anywhere (not on a control) opens the modal
  host.addEventListener('click', e => {
    if (e.defaultPrevented) return;
    const row = e.target.closest('.rk-row[data-sr]');
    if (!row || e.target.closest('button, a, input, label, select')) return;
    const k = row.dataset.k, id = row.dataset.id;
    if (row.dataset.sr === 'openTen') {
      const btn = row.querySelector('.rk-name'); if (btn) btn.click();
    } else if (row.dataset.sr === 'openHv') _srOpen({ ck: k, view: 'hv', from: 'tracker' });
  });
  host.addEventListener('change', async e => {
    const s = e.target.closest('[data-srs="pick"]');
    if (s) { if (SR.dirty && !(await stConfirm({ title: 'Discard your changes?', ok: 'Discard', danger: true }))) { s.value = SR.modal.ck; return; } SR.dirty = false; _srOpen({ ck: s.value, view: SR.modal && SR.modal.view === 'hv' ? 'hv' : 'nk', from: SR.modal ? SR.modal.from : 'tracker' }); return; }
    const nkcb = e.target.closest('[data-src="innk"]');
    if (nkcb && SR.draft) { _srCollect(); const p = SR.draft.positions[Number(nkcb.dataset.i)]; if (p) p.nk = nkcb.checked ? true : false; SR.dirty = true; _srRerenderPanel(); return; }
    const cb = e.target.closest('[data-src="split"]');
    if (cb && SR.draft) { _srCollect(); const p = SR.draft.positions[Number(cb.dataset.i)]; if (p) p.split = cb.checked ? 'mieter' : 'tage'; SR.dirty = true; _srRerenderPanel(); return; }
    if (e.target.closest('[data-srf]')) {
      SR.dirty = true; _srCollect();
      if (e.target.dataset.srf === 'keys.hg_paid' || e.target.dataset.srf === 'weg_amount') _srRerenderPanel();
      else if (SR.modal && SR.modal.view === 'nk') _srRefreshNkTens();          // tenants only – the field you type in keeps its focus
      return;
    }
    const t = e.target.closest('[data-srt]');
    if (t) {
      const res = _srRefreshTenant(); if (!res) return;
      _srQueueTenantSave(res.got.rec);
      if (_srSign(res.x) !== SR.sign || t.dataset.srt === 'date' || t.dataset.srt === 'vz') _srRerenderPanel();
    }
  });
  host.addEventListener('input', e => {
    if (e.target.closest('[data-srf]')) { SR.dirty = true; _srRefreshTotals(); }
    const t = e.target.closest('[data-srt]');
    if (t && (t.dataset.srt === 'vz' || t.dataset.srt.startsWith('direct.'))) _srRefreshTenant();
  });
  // phone keyboard "Next": jump to the next amount
  host.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const inp = e.target.closest('.ct-a input, .ct-name'); if (!inp) return;
    e.preventDefault();
    const all = [...document.querySelectorAll('#srPanel .ct-name, #srPanel .ct-a input')];
    const i = all.indexOf(inp); if (all[i + 1]) all[i + 1].focus(); else inp.blur();
  });
})();
