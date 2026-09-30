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
  filter: 'alle', archiv: false, open: {},
  briefOpen: false,     // tenant panel: letter settings unfolded
  perEdit: false,       // tenant panel: Nutzungszeitraum being changed
  expEdit: false,       // HV panel: expected month being changed
  overOpen: false,      // phone: Überblick unfolded
  kaution: {},          // tenant_id → rnt_kaution row (Einbehalt bis NK-Abrechnung)
  sel: null,            // { kind: 'hv' | 'ten' | 'pausch', ck, tid }
  edit: false, draft: null,
  rows: [], loaded: false, loading: false, missing: false,
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
const _srPerText = (from, to) => cxFmtDate(from) + ' – ' + cxFmtDate(to);
function _srPerLabel(from, to) {
  if (from.slice(5) === '01-01' && to.slice(5) === '12-31' && from.slice(0, 4) === to.slice(0, 4)) return from.slice(0, 4);
  return from.slice(5, 7) + '/' + from.slice(0, 4) + '–' + to.slice(5, 7) + '/' + to.slice(0, 4);
}

/* ── Data: own table ──────────────────────────────────────── */
async function srLoadRows() {
  SR.loading = true;
  try {
    if (typeof loadSettings === 'function') { try { await loadSettings(); } catch (e) {} }
    const { data, error } = await _ctlSupa.from(SR_TABLE).select('*');
    if (error) throw error;
    SR.rows = data || []; SR.missing = false;
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
    if (!error) stSay('Gespeichert – für Eingang und WEG-Ergebnis bitte das neue SQL ausführen');
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

/* ── Model: Rentals properties × open periods ─────────────── */
function _srModel() {
  const out = [];
  for (const g of ctlSettlementModel()) {
    const p = g.p;
    if (p.id === CASA_PROP_ID) continue;
    for (const per of g.periods) {
      const items = per.items.filter(it => it.type === 'gap' || (it.type === 'row' && !it.stale && it.r.kind === 'nk_tenant'));
      const weg = per.items.find(it => it.type === 'row' && !it.stale && it.r.kind === 'weg_hausgeld') || null;
      const apt = ctlPropLinks(p).apt || null;
      const verw = apt ? (window._src.verw || []).find(v => String(v.apartment_id) === String(apt.id)) || null : null;
      out.push({ ck: _srCk(p.id, per.from), p, per, year: Number(per.to.slice(0, 4)), items, weg, apt, verw });
    }
  }
  return out;
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
function _srRecSummary(rec, apt) {
  let u = 0, nu = 0, missing = 0, n = 0;
  for (const pos of (rec && rec.positions) || []) {
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
    if (!pos.u) continue;
    const unit = _srUnitAmt(rec, pos, apt);
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
  const kau = SR.kaution[String(r.tenant_id)] || null;
  const einbehalt = kau && _srNum(kau.nk_einbehalt) > 0 ? cxR(_srNum(kau.nk_einbehalt)) : 0;
  return { lines, sum, vz: cxR(vz), vzSoll, vzIst, vzOv, vzPartial: !!(f && f.istPartial), pre, saldo: cxR(sum - vz),
           tDays, perDays, from, to, per, partial: tDays < perDays, missing, direct, t, apt, ts, kau, einbehalt };
}
const _srMovedOut = t => !!(t && t.mietende && _cxD(t.mietende) && _cxD(t.mietende) < cxToday());
const _srSaldoText = s => !s ? 'Ausgeglichen' : (s > 0 ? 'Nachzahlung ' : 'Guthaben ') + stEur(Math.abs(s));

/* ── Render ───────────────────────────────────────────────── */
let _srCards = {};          // ck → card (rebuilt on every render)
const _srWide = () => window.innerWidth >= 1000;

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
    const line2 = exp ? (over ? 'überfällig – erwartet ' + exp.label : 'erwartet ca. ' + exp.label) : 'erwartet – Monat nicht hinterlegt';
    const k = over || fristSoon ? 'ueberfaellig' : 'erwartet';
    return { k, received, exp, asked, fristSoon, per, wegL, wegSt, todo: k === 'ueberfaellig', wait: k === 'erwartet',
             pill: fristSoon ? ['diff', 'Frist bald'] : over ? ['diff', 'überfällig'] : ['grey', 'erwartet'],
             line2: line2 + (asked.length ? ' · nachgefragt ' + stDate(asked[asked.length - 1]) : '') };
  }
  const recv = 'erhalten ' + stDate(rec.received_on || rec.hv_date);
  if (!sum.ok) return { k: 'erfassen', received, exp, asked, fristSoon, per, wegL, wegSt, todo: true, pill: ['open', 'erfassen'], line2: recv + ' · noch nicht vollständig erfasst' };
  const wegSet = rec.weg_direction !== null && rec.weg_direction !== undefined;
  if (!wegSet && !(wegSt && wegSt.res)) return { k: 'weg', received, exp, asked, fristSoon, per, wegL, wegSt, todo: true, pill: ['open', 'WEG-Ergebnis'], line2: recv + ' · WEG-Ergebnis fehlt' };
  if (wegSt && wegSt.k === 'verschickt') return { k: 'zahlung', received, exp, asked, fristSoon, per, wegL, wegSt, wait: true, pill: ['beige', 'Zahlung offen'], line2: recv + (rec.weg_due ? ' · fällig ' + stDate(rec.weg_due) : '') };
  const paid = wegSt && wegSt.booking ? ' · ' + (wegSt.res && wegSt.res.dir > 0 ? 'erhalten ' : 'bezahlt ') + stDate(wegSt.booking.invoice_date) : '';
  return { k: 'fertig', received, exp, asked, fristSoon, per, wegL, wegSt, pill: ['ok', wegSt && wegSt.booking ? (wegSt.res.dir > 0 ? 'erhalten' : 'bezahlt') : 'erfasst'], line2: recv + paid };
}

/* One card = one Wohnung × one Abrechnungszeitraum, with its state and rows */
function _srCardInfo(c) {
  const rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt);
  const hv = _srHvState(c, rec, sum);
  const rows = [], gaps = [];
  for (const it of c.items) {
    if (it.type === 'gap') { gaps.push(it); continue; }
    const l = _srLine(c, it), r = it.r;
    const kind = r.note === 'Pauschal' ? 'pausch' : r.tenant_id ? 'ten' : 'unlinked';
    const x = kind === 'ten' && rec && sum.ok ? _srCalc(c, it, rec) : null;
    rows.push({ it, l, kind, x });
  }
  rows.sort((a, b) => String(a.l.from).localeCompare(String(b.l.from)));
  const ten = rows.filter(r => r.kind === 'ten');
  const open = ten.filter(r => r.l.state.k === 'offen').length, sent = ten.filter(r => r.l.state.k === 'verschickt').length;
  // Zu tun · Warten · Erledigt — the card takes its most urgent row
  const todo = hv.todo || (sum.ok && open > 0) || rows.some(r => r.kind === 'unlinked' && r.l.state.k === 'offen');
  const wait = !todo && (hv.wait || hv.k === 'zahlung' || sent > 0 || (!sum.ok && open > 0));
  const k = todo ? 'zutun' : wait ? 'warten' : 'erledigt';
  let pill;
  if (hv.k === 'ueberfaellig' || hv.k === 'erfassen' || hv.k === 'weg') pill = hv.k === 'ueberfaellig' ? hv.pill : ['open', hv.k === 'erfassen' ? 'HV erfassen' : 'WEG-Ergebnis fehlt'];
  else if (todo) pill = ['open', open + ' offen'];
  else if (hv.k === 'erwartet') pill = ['grey', hv.exp ? 'erwartet ' + SR_MON[hv.exp.m - 1].slice(0, 3) + '.' : 'erwartet'];
  else if (wait) pill = ['beige', 'Zahlung offen'];
  else pill = ['ok', 'erledigt'];
  return { c, rec, sum, hv, rows, gaps, k, pill, open, sent, per: hv.per };
}

function stRenderRentals() {
  const el = document.getElementById('tab-rentals'); if (!el) return;
  if (!SR.loaded) {
    el.innerHTML = '<div class="st-page"><p class="cx-empty">Lade Abrechnungen …</p></div>';
    if (!SR.loading) srLoadRows().then(() => { if (ST.tab === 'rentals') stRenderRentals(); });
    return;
  }
  let infos;
  try { infos = _srModel().map(_srCardInfo); }
  catch (e) { console.error('[settlements] rentals model', e); el.innerHTML = '<div class="st-page"><p class="cx-empty">Die Abrechnungen konnten nicht berechnet werden.</p><p class="st-muted">' + stEsc(e.message || e) + '</p></div>'; return; }
  _srCards = {}; infos.forEach(i => { _srCards[i.c.ck] = i.c; });
  const arch = _srArchive(infos);
  arch.forEach(c => { _srCards[c.ck] = c; });

  // always the same order: your purchase order (ctrl_properties.sort_order), then the period
  infos.sort((a, b) => stPropOrder(a.c.p, b.c.p) || String(a.per.from).localeCompare(String(b.per.from)));
  const n = { zutun: 0, warten: 0, erledigt: 0 };
  infos.forEach(i => { n[i.k]++; });
  const shown = SR.filter === 'alle' ? infos : infos.filter(i => i.k === SR.filter);

  const chip = (k, label, count) => '<button class="st-chip' + (SR.filter === k ? ' is-on' : '') + '" data-sr="filter" data-k="' + k + '" aria-pressed="' + (SR.filter === k) + '">' +
    label + (count !== undefined ? '<span class="st-chip__n">' + count + '</span>' : '') + '</button>';
  const sqlNote = SR.missing ? '<div class="st-soon"><i class="ti ti-database" aria-hidden="true"></i><div><strong>Einmal SQL ausführen</strong>' +
    '<span>Für die HV-Abrechnungen fehlt die Tabelle nk_abrechnung_rentals. Bitte das SQL in Supabase ausführen, dann die App neu laden.</span></div></div>' : '';
  const over = _srOverviewHtml(infos);
  let list;
  if (SR.archiv) {
    list = '<div class="sr-arch-h"><button class="cx-link sr-back" data-sr="archiv"><i class="ti ti-chevron-left" aria-hidden="true"></i> Fällige Abrechnungen</button></div>' +
      (arch.length ? arch.map(_srArchCardHtml).join('') : '<p class="cx-empty">Noch keine älteren Hausgeldabrechnungen gespeichert.</p>') +
      '<p class="st-hint sr-center">Ergebnisse älterer Jahre stehen in Tracking.</p>';
  } else {
    list = '<details class="sr-overm"' + (SR.overOpen ? ' open' : '') + '><summary data-sr="overToggle"><span class="sr-overm__t">Überblick</span><span class="sr-overm__s">' + stEsc(over.summary) + '</span><i class="ti ti-chevron-down" aria-hidden="true"></i></summary>' + over.body + '</details>' +
      '<div class="st-filter" role="group" aria-label="Filter">' + chip('alle', 'Alle') + chip('zutun', 'Zu tun', n.zutun) + chip('warten', 'Warten', n.warten) + chip('erledigt', 'Erledigt', n.erledigt) + '</div>' +
      sqlNote +
      (shown.length ? shown.map(_srCardHtml).join('') : '<p class="cx-empty">' + (infos.length ? 'Nichts in diesem Filter.' : 'Gerade ist kein Abrechnungszeitraum fällig.') + '</p>') +
      '<button class="cx-link sr-archlink" data-sr="archiv"><i class="ti ti-archive" aria-hidden="true"></i> Archiv · ältere Jahre</button>';
  }

  const right = SR.sel ? '<aside class="st-panel sr-panel" id="srPanel" aria-label="Abrechnung">' + _srPanelHtml() + '</aside>'
    : '<aside class="sr-over" aria-label="Überblick"><div class="sr-over__h"><p class="st-panel__t">Überblick</p><p class="st-panel__s">' + stEsc(over.summary) + '</p></div>' + over.body + '</aside>';
  el.innerHTML = '<div class="st-page sr-page">' +
    '<div class="sr-split' + (SR.sel ? ' has-sel' : '') + '">' +
      '<div class="sr-list">' +
        '<div class="sr-head"><div><h1 class="cx-title">Rentals</h1><p class="cx-title__s">NK-Abrechnung der Wohnungen</p></div></div>' +
        list +
      '</div>' + right +
    '</div></div>';
  document.getElementById('stScrim').hidden = !SR.sel || _srWide();
  document.body.classList.toggle('st-panel-open', !!SR.sel);
  if (SR.sel && !_srCards[SR.sel.ck]) { SR.sel = null; stRenderRentals(); }
}

/* ── Card ── */
function _srRowHtml(o) {
  return '<button class="sr-row' + (o.sel ? ' is-sel' : '') + (o.done ? ' is-done' : '') + '" data-sr="' + o.act + '" data-k="' + stEsc(o.ck) + '"' + (o.id ? ' data-id="' + stEsc(o.id) + '"' : '') + '>' +
    '<span class="sr-row__who"><span class="sr-num' + (o.numCls ? ' ' + o.numCls : '') + '" aria-hidden="true">' + (o.num || '') + '</span>' +
      '<span class="sr-row__n">' + stEsc(o.who) + '</span>' + (o.tag ? '<span class="st-tag">' + stEsc(o.tag) + '</span>' : '') + '</span>' +
    '<span class="sr-row__res' + (o.resCls ? ' ' + o.resCls : '') + '">' + (o.resLabel ? '<small>' + stEsc(o.resLabel) + '</small>' : '') + stEsc(o.res || '') + '</span>' +
    '<span class="sr-row__per">' + stEsc(o.per || '') + '</span>' +
    '<span class="sr-row__st">' + (o.pill ? cxPill(o.pill[0], o.pill[1]) : '') + '</span>' +
  '</button>';
}
const _srCheck = '<i class="ti ti-check" aria-hidden="true"></i>';
const _srSigned = v => (v > 0 ? '+ ' : v < 0 ? '− ' : '') + stEur(Math.abs(v));
/* A tenant row's money from your side: + comes to you, − goes to the tenant (null = not known yet) */
function _srTenMoney(r) {
  const st = r.l.state;
  if (r.kind !== 'ten' || r.it.r.status === 'nicht durchgeführt') return null;
  if (st.res) return st.res.dir * st.res.amount;
  if (r.x && !r.x.missing) return r.x.saldo;
  return null;
}
/* WEG money from your side: + Guthaben von WEG, − Nachzahlung an WEG */
function _srWegMoney(info) {
  const res = info.hv.wegSt && info.hv.wegSt.res;
  if (res) return res.dir * res.amount;
  const rec = info.rec;
  if (rec && rec.weg_direction !== null && rec.weg_direction !== undefined) return Number(rec.weg_direction) * (_srNum(rec.weg_amount) || 0);
  return null;
}
function _srCardHtml(info) {
  const c = info.c, rec = info.rec, sum = info.sum, hv = info.hv, per = info.per;
  const isOpen = SR.open[c.ck] !== undefined ? SR.open[c.ck] : info.k !== 'erledigt';
  const ten = info.rows.filter(r => r.kind === 'ten');
  const weg = _srWegMoney(info);
  const folded = info.k === 'erledigt' ? [ten.length ? ten.length + ' Mieter' : '', 'alles erledigt'].filter(Boolean).join(' · ') : '';
  let h = '<section class="sr-card" aria-label="' + stEsc(c.p.name) + '">' +
    '<button class="sr-card__h" data-sr="fold" data-k="' + stEsc(c.ck) + '" aria-expanded="' + isOpen + '">' +
      '<span class="sr-card__t"><span class="sr-card__n">' + stEsc(c.p.name) + '</span>' +
        '<span class="sr-card__s">' + stEsc(_srPerText(per.from, per.to)) + (per.custom ? ' <span>· eigener Zeitraum</span>' : '') + '<br><span>' + stEsc(!isOpen && folded ? folded : (per.frist ? 'Frist ' + stDate(per.frist) : '')) + '</span></span></span>' +
      '<span class="sr-card__r">' + cxPill(info.pill[0], info.pill[1]) + '<i class="ti ti-chevron-' + (isOpen ? 'up' : 'down') + ' cx-chev" aria-hidden="true"></i></span></button>';
  if (!isOpen) return h + '</section>';

  // ① Jahresabrechnung
  const hvSel = SR.sel && SR.sel.kind === 'hv' && SR.sel.ck === c.ck;
  let hvRes = '', hvLab = '', hvCls = '';
  if (weg !== null && hv.received && sum.ok) { hvLab = weg > 0 ? 'Guthaben von WEG' : weg < 0 ? 'Nachzahlung an WEG' : 'WEG'; hvRes = weg ? stEur(Math.abs(weg)) : 'ausgeglichen'; hvCls = weg > 0 ? 'is-minus' : weg < 0 ? 'is-plus' : ''; }
  else if (rec && sum.n) { hvLab = 'umlagefähig'; hvRes = stEur(sum.u); }
  h += _srRowHtml({ act: 'hv', ck: c.ck, sel: hvSel, num: hv.k === 'fertig' ? _srCheck : '1', numCls: hv.k === 'fertig' ? 'is-ok' : '', who: 'Jahresabrechnung',
    resLabel: hvLab, res: hvRes, resCls: hvCls, per: hv.line2, pill: hv.pill });

  // ② tenants (Pauschal and unlinked units as quiet rows)
  for (const r of info.rows) {
    const t = r.kind !== 'unlinked' ? _srTenantOf(r.it.r) : null;
    const sel = SR.sel && SR.sel.ck === c.ck && String(SR.sel.tid) === String(r.l.id);
    const days = _srDays(r.l.from, r.l.to);
    const st = r.l.state;
    let perTxt = stDM(r.l.from) + '–' + stDate(r.l.to) + ' · ' + days + ' Tage' + (t && _srMovedOut(t) ? ' · ausgezogen' : '');
    if (st.booking) perTxt += ' · bezahlt ' + stDate(st.booking.invoice_date);
    let res = '', resLabel = '', resCls = '', pill = st.pill;
    if (r.kind === 'pausch') { res = 'keine Abrechnung'; resCls = 'is-mut'; }
    else if (r.kind === 'unlinked') { res = 'kein Mieter verknüpft'; resCls = 'is-mut'; }
    else if (r.it.r.status === 'nicht durchgeführt') { res = 'nicht abgerechnet'; resCls = 'is-mut'; }
    else if (st.res) { const d = st.res.dir, a = st.res.amount; if (!d || !a) res = 'ausgeglichen'; else { resLabel = d > 0 ? 'Nachzahlung' : 'Guthaben'; res = stEur(a); resCls = d > 0 ? 'is-plus' : 'is-minus'; } }
    else if (r.x) { if (r.x.missing) { res = 'Beträge fehlen'; resCls = 'is-mut'; } else if (!r.x.saldo) res = 'ausgeglichen'; else { resLabel = r.x.saldo > 0 ? 'Nachzahlung' : 'Guthaben'; res = stEur(Math.abs(r.x.saldo)); resCls = r.x.saldo > 0 ? 'is-plus' : 'is-minus'; } }
    else { res = 'wartet auf HV'; resCls = 'is-mut'; pill = ['grey', 'wartet']; }
    h += _srRowHtml({ act: r.kind, ck: c.ck, id: r.l.id, sel, done: st.k === 'erledigt', num: r.kind === 'ten' ? '2' : '', numCls: r.kind === 'ten' ? '' : 'is-hollow',
      who: r.kind === 'ten' && _srTName(t) ? _srJoin(_srTNames(t)) : (_srTName(t) || r.it.r.note || 'Einheit'), tag: r.kind === 'pausch' ? 'Pauschal' : '',
      res, resLabel, resCls, per: perTxt, pill });
  }
  if (!info.rows.length) h += '<p class="sr-empty">Keine Mieter mit Kalt + NK in diesem Zeitraum.</p>';

  // footer: Leerstand / vor Kauf · money · what stays with you
  const foot = [];
  const since = _srD(c.p.in_portfolio_since);
  info.gaps.forEach(g => {
    if (since && g.from < since) {
      const preTo = g.to < since ? g.to : _srAdd(since, -1);
      foot.push({ t: 'Vor Kauf ' + stDM(g.from) + '–' + stDate(preTo) + ' · kein Mieter erfasst' });
      if (g.to >= since) foot.push({ t: 'Leerstand ' + stDM(since) + '–' + stDate(g.to) + ' · ' + _srDays(since, g.to) + ' Tage' });
    } else foot.push({ t: 'Leerstand ' + stDM(g.from) + '–' + stDate(g.to) + ' · ' + _srDays(g.from, g.to) + ' Tage' });
  });
  const tenMoney = ten.map(_srTenMoney).filter(v => v !== null);
  if (weg !== null || tenMoney.length) {
    const tsum = cxR(tenMoney.reduce((a, b) => a + b, 0));
    const bits = [];
    if (weg !== null) bits.push('WEG <b>' + stEsc(_srSigned(weg)) + '</b>');
    if (tenMoney.length) bits.push('Mieter <b>' + stEsc(_srSigned(tsum)) + '</b>');
    if (weg !== null && tenMoney.length) bits.push('Netto <b>' + stEsc(_srSigned(cxR(weg + tsum))) + '</b>');
    foot.push({ h: bits.join(' · ') });
  }
  if (rec && sum.ok) {
    let billed = 0;
    ten.forEach(r => { if (r.x && r.it.r.status !== 'nicht durchgeführt') billed += r.x.sum; });
    const rest = cxR(sum.u - billed), bits = [];
    if (Math.abs(rest) >= 0.01) bits.push('<b>' + stEsc(stEur(rest)) + '</b> nicht umgelegt');
    if (sum.nu) bits.push('<b>' + stEsc(stEur(sum.nu)) + '</b> nicht umlagefähig');
    if (bits.length) foot.push({ h: 'Bleibt bei dir: ' + bits.join(' · ') });
  }
  if (foot.length) h += '<div class="sr-foot">' + foot.map(f => '<span>' + (f.h || stEsc(f.t)) + '</span>').join('') + '</div>';
  return h + '</section>';
}

/* ── Archiv: saved HV records of periods that are no longer due ── */
function _srArchive(infos) {
  const live = new Set(infos.map(i => i.rec && i.rec.id).filter(Boolean));
  const out = [];
  for (const rec of SR.rows) {
    if (live.has(rec.id)) continue;
    const p = (window._ctrl.properties || []).find(x => x.id === Number(rec.property_id)); if (!p) continue;
    const per = { from: _srD(rec.period_from), to: _srD(rec.period_to), frist: null };
    if (infos.some(i => i.c.p.id === p.id && i.c.per.from === per.from)) continue;
    const apt = ctlPropLinks(p).apt || null;
    const verw = apt ? (window._src.verw || []).find(v => String(v.apartment_id) === String(apt.id)) || null : null;
    out.push({ ck: 'a:' + rec.id, p, per, year: Number(per.to.slice(0, 4)), items: [], weg: null, apt, verw, archive: true });
  }
  return out.sort((a, b) => b.per.to.localeCompare(a.per.to));
}
function _srArchCardHtml(c) {
  const rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt);
  const sel = SR.sel && SR.sel.kind === 'hv' && SR.sel.ck === c.ck;
  return '<section class="sr-card"><div class="sr-card__h sr-card__h--static"><span class="sr-card__t"><span class="sr-card__n">' + stEsc(c.p.name) + '</span>' +
    '<span class="sr-card__s">' + stEsc(_srPerText(c.per.from, c.per.to)) + '</span></span><span class="sr-card__r">' + cxPill('grey', 'Archiv') + '</span></div>' +
    _srRowHtml({ act: 'hv', ck: c.ck, sel, num: sum.ok ? _srCheck : '1', numCls: sum.ok ? 'is-ok' : '', who: 'Jahresabrechnung',
      resLabel: sum.n ? 'umlagefähig' : '', res: sum.n ? stEur(sum.u) : '', per: rec && (rec.received_on || rec.hv_date) ? 'erhalten ' + stDate(rec.received_on || rec.hv_date) : '', pill: null }) +
  '</section>';
}

/* ── Überblick (desktop right column · phone/iPad foldable card) ── */
function _srMissingMaster() {
  const out = [];
  const props = (window._ctrl.properties || []).filter(p => p.active && p.id !== CASA_PROP_ID).sort(stPropOrder);
  for (const p of props) {
    const apt = ctlPropLinks(p).apt || null;
    const verw = apt ? (window._src.verw || []).find(v => String(v.apartment_id) === String(apt.id)) || null : null;
    const miss = [];
    if (!/^\d{2}-\d{2}$/.test(String(p.nk_period_start || ''))) miss.push('Zeitraum');
    if (!Number(p.hv_expected_month) && !SR.rows.some(r => Number(r.property_id) === p.id && r.received_on)) miss.push('Monat der HV-Abrechnung');
    if (!apt) miss.push('Wohnung in Rentals verknüpfen');
    else {
      if (!_srNum(apt.flaeche_m2)) miss.push('m²');
      if (!verw || !verw.hv_email) miss.push('E-Mail der HV');
      if (!verw || !_srNum(verw.grundsteuer_mtl)) miss.push('Grundsteuer');
    }
    if (miss.length) out.push({ p, miss });
  }
  return out;
}
function _srOverviewHtml(infos) {
  const next = [], soon = [];
  const money = { anWeg: [0, 0], vonWeg: [0, 0], vonMieter: [0, 0], anMieter: [0, 0] };   // [offen, bezahlt]
  const today = _srToday(), in45 = _srAdd(today, 45);
  for (const i of infos) {
    const c = i.c, hv = i.hv;
    if (hv.k === 'ueberfaellig') next.push({ act: 'hv', ck: c.ck, t: c.p.name, s: 'Jahresabrechnung überfällig – bei der HV nachfragen', f: i.per.frist, warn: true });
    else if (hv.k === 'erfassen') next.push({ act: 'hv', ck: c.ck, t: c.p.name, s: 'Jahresabrechnung vollständig erfassen', f: i.per.frist, warn: true });
    else if (hv.k === 'weg') next.push({ act: 'hv', ck: c.ck, t: c.p.name, s: 'WEG-Ergebnis eintragen', f: i.per.frist, warn: true });
    else if (hv.k === 'erwartet' && hv.exp && hv.exp.from <= in45) soon.push({ act: 'hv', ck: c.ck, t: c.p.name, s: 'erwartet ca. ' + hv.exp.label });
    for (const r of i.rows) {
      if (r.kind !== 'ten') continue;
      const st = r.l.state;
      if (st.k === 'offen' && r.x && !r.x.missing && r.it.r.status !== 'nicht durchgeführt') {
        next.push({ act: 'ten', ck: c.ck, id: r.l.id, t: c.p.name + ' · ' + _srTName(_srTenantOf(r.it.r)), s: 'Brief erstellen und verschicken', f: i.per.frist });
        if (r.x.saldo > 0) money.vonMieter[0] += r.x.saldo; else money.anMieter[0] += -r.x.saldo;
      }
      if (st.res && st.res.via === 'zahlung' && st.res.amount) {
        const box = st.res.dir > 0 ? money.vonMieter : money.anMieter;
        box[st.booking ? 1 : 0] += st.res.amount;
      }
    }
    const wr = hv.wegSt && hv.wegSt.res;
    if (wr && wr.via === 'zahlung' && wr.amount) { const box = wr.dir > 0 ? money.vonWeg : money.anWeg; box[hv.wegSt.booking ? 1 : 0] += wr.amount; }
  }
  next.sort((a, b) => String(a.f || '').localeCompare(String(b.f || '')));
  const btn = x => '<button class="sr-next' + (x.warn ? ' is-warn' : '') + '" data-sr="' + x.act + '" data-k="' + stEsc(x.ck) + '"' + (x.id ? ' data-id="' + stEsc(x.id) + '"' : '') + '>' +
    '<span class="sr-next__t"><span>' + stEsc(x.t) + '</span><small>' + stEsc(x.s) + '</small></span>' + (x.f ? '<span class="sr-next__f">Frist ' + stDate(x.f) + '</span>' : '') + '</button>';
  const mrow = (label, v) => '<div class="sr-mrow"><span>' + label + '</span><span>' + (v[0] ? stEur(cxR(v[0])) : '—') + '</span><span>' + (v[1] ? stEur(cxR(v[1])) : '—') + '</span></div>';
  const master = _srMissingMaster();
  const overdue = next.filter(x => /überfällig/.test(x.s)).length;
  const summary = (next.length ? next.length + ' zu tun' : 'nichts zu tun') + (overdue ? ' · ' + overdue + ' überfällig' : '');
  const body = '<div class="sr-over__b">' +
    '<div><p class="st-f__l">Als Nächstes</p>' + (next.length ? next.slice(0, 6).map(btn).join('') : '<p class="sr-note">Nichts offen.</p>') +
      (next.length > 6 ? '<p class="sr-note">+ ' + (next.length - 6) + ' weitere in der Liste</p>' : '') + '</div>' +
    (soon.length ? '<div><p class="st-f__l">Demnächst erwartet</p>' + soon.map(btn).join('') + '</div>' : '') +
    '<div><p class="st-f__l">Geld aus den Abrechnungen</p><div class="sr-mrow sr-mrow--h"><span></span><span>offen</span><span>bezahlt</span></div>' +
      mrow('von Mietern', money.vonMieter) + mrow('an Mieter', money.anMieter) + mrow('an die WEG', money.anWeg) + mrow('von der WEG', money.vonWeg) + '</div>' +
    (master.length ? '<div><p class="st-f__l">Stammdaten fehlen</p>' + master.map(m => '<p class="sr-miss-row"><b>' + stEsc(m.p.name) + '</b> · ' + stEsc(m.miss.join(', ')) + '</p>').join('') +
      '<p class="sr-note">m², HV-E-Mail und Grundsteuer in Rentals › Apartments; Zeitraum und Monat hier in der Jahresabrechnung.</p></div>' : '') +
  '</div>';
  return { body, summary };
}

/* ── Panel ────────────────────────────────────────────────── */
function _srPanelHtml() {
  const c = _srCards[SR.sel.ck]; if (!c) return '';
  if (SR.sel.kind === 'hv') return _srHvPanel(c);
  const it = c.items.find(x => x.type === 'row' && String(x.r.id) === String(SR.sel.tid));
  if (!it) return '';
  if (SR.sel.kind === 'pausch') return _srPauschPanel(c, it);
  if (SR.sel.kind === 'unlinked') return _srHead('Einheit ohne Mieter', c.p.name) +
    '<div class="st-panel__b"><p class="st-note">Für diese Einheit ist in Rentals kein Mieter verknüpft. Bitte den Mieter in Rentals › Tenants eintragen oder die Einheit in Controlling › Setup verknüpfen.</p></div>';
  return _srTenPanel(c, it);
}
const _srHead = (t, s) => '<div class="sr-grab" aria-hidden="true"></div><div class="st-panel__h"><div class="st-panel__ht"><p class="st-panel__t">' + stEsc(t) + '</p><p class="st-panel__s">' + stEsc(s) + '</p></div>' +
  '<button class="st-panel__x" data-sr="close" aria-label="Schließen"><i class="ti ti-x" aria-hidden="true"></i></button></div>';

/* 1 · HV panel (read ↔ edit) */
function _srBlankRec(c) {
  return { property_id: c.p.id, apartment_id: c.apt ? String(c.apt.id) : null, period_from: c.per.from, period_to: c.per.to,
           hv_date: null, key_mode: 'flaeche', keys: {}, positions: [], tenants: {},
           received_on: null, asked_on: [], beschluss_on: null, weg_direction: null, weg_amount: null, weg_due: null, weg_via: null };
}
function _srHvPanel(c) {
  const rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt);
  const hv = c.archive ? { k: 'fertig', received: true, per: c.per, asked: [], exp: null } : _srHvState(c, rec, sum);
  const per = hv.per;
  const sub = c.p.name + ' · ' + _srPerText(per.from, per.to);
  if (SR.edit) return _srHead('Jahresabrechnung', sub) + '<div class="st-panel__b">' + _srHvForm(c) + '</div>';
  const kvRow = (a, b) => '<div class="cx-kv"><span>' + a + '</span><span>' + b + '</span></div>';
  const hvMail = c.verw && c.verw.hv_email ? String(c.verw.hv_email).trim() : '';

  // Eingang: status box (not received) or the dates (received)
  let eingang = '';
  if (!hv.received) {
    const cls = hv.k === 'ueberfaellig' ? ' is-warn' : '';
    eingang = '<div class="sr-inbox' + cls + '">' +
      '<p class="sr-inbox__t">' + (hv.exp ? (hv.k === 'ueberfaellig' ? 'Überfällig – erwartet ' + stEsc(hv.exp.label) : 'Erwartet ca. ' + stEsc(hv.exp.label)) : 'Erwartet – Monat nicht hinterlegt') + '</p>' +
      '<p class="sr-inbox__s">' + (per.frist ? 'Frist für die NK-Abrechnung: ' + stDate(per.frist) + (hv.fristSoon ? ' – bald!' : '') : '') + '</p>' +
      (hv.asked.length ? '<p class="sr-inbox__s">Bei der HV nachgefragt: ' + hv.asked.map(stDate).join(', ') + '</p>' : '') +
      '<div class="sr-inbox__b">' +
        (hvMail ? '<a class="cx-btn cx-btn--s" data-sr="ask" data-k="' + stEsc(c.ck) + '" href="' + stEsc(_srAskMail(c, hv, hvMail)) + '"><i class="ti ti-mail" aria-hidden="true"></i> Nachfragen</a>'
                : '<span class="sr-note">Keine E-Mail der HV hinterlegt (Rentals › Apartments).</span>') +
        '<button class="cx-btn cx-btn--p" data-sr="hvRecv"' + (SR.missing ? ' disabled' : '') + '>Erhalten</button>' +
      '</div></div>';
  } else if (rec) {
    eingang = '<div class="st-block">' +
      (c.verw && c.verw.hausverwaltung ? kvRow('Hausverwaltung', stEsc(c.verw.hausverwaltung)) : '') +
      kvRow('Erhalten am', rec.received_on ? stDate(rec.received_on) : '<em class="sr-miss">fehlt</em>') +
      kvRow('Abrechnung vom', rec.hv_date ? stDate(rec.hv_date) : '<em class="sr-miss">fehlt</em>') +
      (rec.beschluss_on ? kvRow('Beschluss am', stDate(rec.beschluss_on)) : '') +
      (per.custom ? kvRow('Zeitraum dieser Abrechnung', stEsc(_srPerText(per.from, per.to))) : '') +
      (hv.asked.length ? kvRow('Nachgefragt', hv.asked.map(stDate).join(', ')) : '') +
    '</div>';
  }

  // Wohnung: standard Zeitraum (+ In portfolio since) and expected month
  let wohnung = '';
  if (!c.archive) {
    const expTxt = Number(c.p.hv_expected_month) ? SR_MON[Number(c.p.hv_expected_month) - 1] : (hv.exp && hv.exp.learned ? SR_MON[hv.exp.m - 1] + ' (aus dem letzten Eingang)' : '— nicht hinterlegt');
    wohnung = '<div><p class="st-f__l">Wohnung</p>' + _stPeriodRow(c.p) +
      (SR.expEdit
        ? '<div class="sr-exp"><span>HV schickt meist im</span><span class="cx-f cx-f--l sr-sel"><select id="srExpM" aria-label="Monat">' +
            '<option value="">— nicht hinterlegt</option>' + SR_MON.map((m, i) => '<option value="' + (i + 1) + '"' + (Number(c.p.hv_expected_month) === i + 1 ? ' selected' : '') + '>' + m + '</option>').join('') +
          '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></span><button class="cx-link" data-sr="expCancel">Abbrechen</button><button class="cx-link sr-acc" data-sr="expSave">Speichern</button></div>'
        : '<div class="sr-exp"><span>HV schickt meist im</span><b>' + stEsc(expTxt) + '</b><button class="cx-link" data-sr="expEdit">Change</button></div>') +
    '</div>';
  }

  if (!rec || !hv.received) {
    const prev = _srPrevRec(c.p, c.per);
    return _srHead('Jahresabrechnung', sub) + '<div class="st-panel__b">' + eingang + wohnung +
      (SR.missing ? '<p class="st-status st-status--verschickt">Zuerst das SQL (nk_abrechnung_rentals) in Supabase ausführen.</p>' : '') +
      (prev ? '<p class="sr-note">Beim Eintragen kannst du die Positionen aus ' + stEsc(_srPerLabel(_srD(prev.period_from), _srD(prev.period_to))) + ' übernehmen.</p>' : '') +
    '</div>';
  }

  // WEG result
  const wr = hv.wegSt && hv.wegSt.res;
  const dirW = rec.weg_direction !== null && rec.weg_direction !== undefined ? Number(rec.weg_direction) : (wr ? wr.dir : null);
  const amtW = _srNum(rec.weg_amount) ?? (wr ? wr.amount : null);
  const viaW = rec.weg_via || (wr ? wr.via : null);
  let weg = '';
  if (dirW === null) weg = '<div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> WEG-Ergebnis fehlt – unter „Bearbeiten“ eintragen (Nachzahlung an die WEG oder Guthaben von der WEG).</div>';
  else {
    const res = !dirW || !amtW ? 'ausgeglichen' : (dirW < 0 ? 'Nachzahlung an WEG ' : 'Guthaben von WEG ') + stEur(amtW);
    const viaTxt = { zahlung: 'Überweisung', lastschrift: 'Lastschrift', hausgeld: 'mit Hausgeld verrechnet' }[viaW] || 'Überweisung';
    const stTxt = hv.wegSt && hv.wegSt.booking ? (dirW > 0 ? 'erhalten ' : 'bezahlt ') + stDate(hv.wegSt.booking.invoice_date)
      : hv.wegSt && hv.wegSt.k === 'erledigt' ? 'erledigt' : dirW && amtW ? 'offen – in Controlling bestätigen' : '—';
    weg = '<div class="st-block"><p class="st-f__l">WEG-Ergebnis</p>' + kvRow('Ergebnis', '<b>' + stEsc(res) + '</b>') +
      (dirW && amtW ? kvRow('Zahlung', stEsc(viaTxt) + (rec.weg_due ? ' · fällig ' + stDate(rec.weg_due) : '')) + kvRow('Status', stEsc(stTxt)) : '') + '</div>';
  }

  // positions (keys only shown for older entries that still use Gesamtkosten × Schlüssel)
  const apt = c.apt, K = rec.keys || {};
  const usesKeys = (rec.positions || []).some(p => _srShareKey(p.key) && _srNum(p.amount) === null);
  let keys = usesKeys ? kvRow('Umlageschlüssel', rec.key_mode === 'weg' ? 'wie WEG (§ 556a Abs. 3 BGB)' : 'Wohnfläche (Mietvertrag)') : '';
  const aptM2 = _srNum(apt && apt.flaeche_m2) ?? _srNum(K.flaeche_u);
  if (usesKeys && _srNum(K.flaeche_t)) keys += kvRow('Wohnfläche', _srFmtN(aptM2 ?? 0, 2) + ' / ' + _srFmtN(K.flaeche_t, 2) + ' m²');
  if (usesKeys && _srNum(K.mea_t)) keys += kvRow('MEA', _srFmtN(K.mea_u ?? 0, 2) + ' / ' + _srFmtN(K.mea_t, 2));
  if (usesKeys && _srNum(K.einh_t)) keys += kvRow('Einheiten', _srFmtN(K.einh_u ?? 1) + ' / ' + _srFmtN(K.einh_t));
  const pos = (rec.positions || []).map(p => {
    const a = _srUnitAmt(rec, p, apt), k = _srKind(p.kind);
    const keyName = _srShareKey(p.key) && _srNum(p.amount) === null ? (SR_KEYS.find(x => x[0] === p.key) || [0, ''])[1] : '';
    const subBits = [keyName && _srNum(p.total) !== null ? 'Gesamt ' + stEur(p.total) : '', keyName, p.u && p.split === 'mieter' ? 'je Mieter (Zwischenablesung)' : ''].filter(Boolean);
    return '<div class="sr-prow' + (p.u ? '' : ' is-nu') + '"><div class="sr-prow__l"><span class="sr-prow__t">' + stEsc(p.label || k.l) + (p.u ? '' : ' <span class="st-tag">nicht umlagefähig</span>') + '</span>' +
      '<span class="sr-prow__s">' + stEsc(subBits.join(' · ')) + '</span></div>' +
      '<span class="sr-prow__v">' + (a === null ? (p.split === 'mieter' ? '<em>je Mieter</em>' : '<em class="sr-miss">fehlt</em>') : stEur(a)) + '</span></div>';
  }).join('');
  const warn = [];
  if (!rec.hv_date) warn.push('Datum der HV-Abrechnung fehlt.');
  if (sum.missing) warn.push(sum.missing + (sum.missing === 1 ? ' Position ohne Betrag.' : ' Positionen ohne Betrag.'));
  if ((rec.positions || []).some(p => p.kind === 'kabel' && p.u)) warn.push('Kabel-TV ist seit 01.07.2024 nicht mehr umlagefähig.');
  return _srHead('Jahresabrechnung', sub) + '<div class="st-panel__b">' + eingang + weg +
    (keys ? '<div class="st-block">' + keys + '</div>' : '') +
    '<div><p class="st-f__l">Umlagefähige Kosten der Wohnung</p>' + (pos || '<p class="sr-note">Noch keine Positionen.</p>') + '</div>' +
    '<div class="sr-total"><span>Umlagefähig</span><strong>' + stEur(sum.u) + '</strong>' + (sum.nu ? '<span class="sr-total__nu">nicht umlagefähig ' + stEur(sum.nu) + '</span>' : '') + '</div>' +
    (warn.length ? '<div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ' + stEsc(warn.join(' ')) + '</div>' : '') +
    wohnung +
  '</div><div class="sr-bar sr-bar--one"><button class="cx-btn cx-btn--s" data-sr="hvEdit">Bearbeiten</button></div>';
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
function _srHvForm(c) {
  const d = SR.draft;
  const change = _srTenantChange(c);
  const kindOpts = sel => SR_KINDS.filter(k => k.u || k.k === sel).map(k => '<option value="' + k.k + '"' + (k.k === sel ? ' selected' : '') + '>' + stEsc(k.l) + '</option>').join('');
  const dateF = (f, v, lab) => '<label class="st-f"><span class="st-f__l">' + lab + '</span><input class="st-in" type="date" data-srf="' + f + '" value="' + stEsc(_srD(v) || '') + '"/></label>';
  const wDir = d.weg_direction === null || d.weg_direction === undefined ? null : Number(d.weg_direction);
  const seg = (act, v, on, label) => '<button type="button" class="st-seg__b' + (on ? ' is-on' : '') + '" data-sr="' + act + '" data-v="' + v + '" aria-pressed="' + on + '">' + label + '</button>';
  const perCustom = d.period_from && d.period_to && (_srD(d.period_from) !== c.per.from || _srD(d.period_to) !== c.per.to);

  const pos = (d.positions || []).map((p, i) => {
    const k = _srKind(p.kind);
    const named = p.kind === 'sonst' || p.kind === 'nu_sonst' || !!p.label;
    const calc = _srNum(p.amount) === null ? _srUnitAmt(d, p, c.apt) : null;          // older entries with Gesamtkosten × Schlüssel
    return '<div class="sr-pos2' + (p.u ? '' : ' is-nu') + '">' +
      '<span class="cx-f cx-f--l sr-sel sr-pos2__k"><select data-srs="kind" data-i="' + i + '" aria-label="Kostenart">' + kindOpts(p.kind) + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></span>' +
      '<span class="st-amt sr-pos2__a"><input class="st-in" inputmode="decimal" autocomplete="off" data-srf="pos.' + i + '.amount" aria-label="Betrag ' + stEsc(p.label || k.l) + '" placeholder="' + (calc !== null ? stEsc(cxE2(Math.abs(calc))) : '0,00') + '" value="' + stEsc(_srE2in(p.amount)) + '"/><span>€</span></span>' +
      '<button type="button" class="sr-x" data-sr="posDel" data-i="' + i + '" aria-label="Position entfernen"><i class="ti ti-trash" aria-hidden="true"></i></button>' +
      (named ? '<input class="st-in sr-pos2__n" data-srf="pos.' + i + '.label" placeholder="Bezeichnung (z. B. Wartung Enthärtungsanlage)" value="' + stEsc(p.label || '') + '"/>' : '') +
      (k.neg ? '<p class="sr-pos2__h">wird vom Anteil der Mieter abgezogen</p>' : '') +
      (!p.u ? '<p class="sr-pos2__h">nicht umlagefähig – wird nicht umgelegt</p>' : '') +
      (change && p.u ? '<label class="sr-pos2__s"><input type="checkbox" data-src="split" data-i="' + i + '"' + (p.split === 'mieter' ? ' checked' : '') + '/> je Mieter eintragen <small>(z. B. Heizkosten laut Zwischenablesung)</small></label>' : '') +
    '</div>';
  }).join('');

  const hasGs = (d.positions || []).some(p => p.kind === 'grundsteuer');
  const gsQ = c.verw ? _srNum(c.verw.grundsteuer_mtl) : null;
  const prev = _srPrevRec(c.p, c.per);
  return '<form class="st-form sr-form" onsubmit="return false">' +
    '<div class="sr-grid2">' + dateF('received_on', d.received_on, 'Erhalten am') + dateF('hv_date', d.hv_date, 'Abrechnung vom') + '</div>' +
    '<details class="sr-more sr-perbox"' + (perCustom ? ' open' : '') + '><summary>Zeitraum ' + stEsc(_srPerText(_srD(d.period_from) || c.per.from, _srD(d.period_to) || c.per.to)) + ' · ändern</summary>' +
      '<div class="sr-grid2">' + dateF('per_from', d.period_from, 'von') + dateF('per_to', d.period_to, 'bis') + '</div>' +
      '<small class="st-per-hint">Nur ändern, wenn die HV einen anderen Zeitraum abrechnet – höchstens 12 Monate.</small></details>' +
    '<fieldset class="st-f"><legend class="st-f__l">WEG-Ergebnis</legend><div class="st-seg st-seg--3" role="group">' +
      seg('wegDir', '-1', wDir === -1, 'Nachzahlung<small>an die WEG</small>') + seg('wegDir', '1', wDir === 1, 'Guthaben<small>von der WEG</small>') + seg('wegDir', '0', wDir === 0, 'ausgeglichen<small>&nbsp;</small>') + '</div>' +
      (wDir ? '<div class="sr-grid2" style="margin-top:8px"><label class="st-f"><span class="st-f__l">Betrag</span><span class="st-amt"><input class="st-in" inputmode="decimal" data-srf="weg_amount" value="' + stEsc(_srE2in(d.weg_amount)) + '" placeholder="0,00"/><span>€</span></span></label>' +
        dateF('weg_due', d.weg_due, 'fällig am') + '</div>' +
        '<div class="st-seg st-seg--3" role="group" style="margin-top:8px">' +
          seg('wegVia', 'zahlung', (d.weg_via || 'zahlung') === 'zahlung', 'Überweisung') + seg('wegVia', 'lastschrift', d.weg_via === 'lastschrift', 'Lastschrift') + seg('wegVia', 'hausgeld', d.weg_via === 'hausgeld', 'mit Hausgeld') + '</div>' : '') +
    '</fieldset>' +
    '<div class="st-f"><span class="st-f__l">Umlagefähige Kosten der Wohnung</span>' +
      '<small class="st-per-hint" style="margin:0 0 4px">Je Position den Betrag der Wohnung aus der Einzelabrechnung der HV.</small>' +
      (pos || '<p class="st-hint">Noch keine Position.</p>') + '</div>' +
    '<div class="sr-addrow"><button type="button" class="cx-btn cx-btn--s" data-sr="posAdd"><i class="ti ti-plus" aria-hidden="true"></i> Position</button>' +
      (prev && !(d.positions || []).length ? '<button type="button" class="cx-btn cx-btn--s" data-sr="hvCopy">Wie Vorjahr</button>' : '') +
      (!hasGs && gsQ ? '<button type="button" class="cx-btn cx-btn--s" data-sr="posGs">Grundsteuer aus Rentals</button>' : '') + '</div>' +
  '</form>' +
  '<div class="sr-bar sr-bar--form"><div class="sr-total sr-total--bar" data-sr-total>' + _srDraftTotal(d, c.apt) + '</div>' +
    '<div class="sr-bar__btns"><button type="button" class="cx-btn cx-btn--s" data-sr="hvCancel">Abbrechen</button><button type="button" class="cx-btn cx-btn--p" data-sr="hvSave">Speichern</button></div></div>';
}
function _srPosCalcText(d, p, apt) {
  const a = _srUnitAmt(d, p, apt);
  if (p.split === 'mieter' && p.u) return 'Betrag je Mieter' + (a !== null ? ' · Wohnung gesamt ' + stEur(a) : '');
  if (a === null) return _srShareKey(p.key) ? 'Gesamtkosten eintragen' : 'Betrag der Wohnung eintragen';
  return 'Anteil Wohnung ' + stEur(a);
}
function _srDraftTotal(d, apt) {
  const s = _srRecSummary(d, apt);
  return '<span>Umlagefähig</span><strong>' + stEur(s.u) + '</strong>' + (s.nu ? '<span class="sr-total__nu">nicht umlagefähig ' + stEur(s.nu) + '</span>' : '');
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
function _srRefreshCalc() {
  const c = _srCards[SR.sel && SR.sel.ck]; if (!c || !SR.draft) return;
  _srCollect();
  document.querySelectorAll('#srPanel [data-sr-calc]').forEach(el => {
    const p = SR.draft.positions[Number(el.dataset.srCalc)];
    if (p) el.textContent = _srPosCalcText(SR.draft, p, c.apt);
  });
  const tot = document.querySelector('#srPanel [data-sr-total]');
  if (tot) tot.innerHTML = _srDraftTotal(SR.draft, c.apt);
}
function _srRerenderPanel() {
  const host = document.getElementById('srPanel'); if (!host) return;
  const top = host.scrollTop;
  host.innerHTML = _srPanelHtml();
  host.scrollTop = top;
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
async function _srHvSave(btn) {
  _srCollect();
  const d = SR.draft, c = _srCards[SR.sel.ck];
  d.positions = (d.positions || []).filter(p => p.kind);
  if (!d.period_from || !d.period_to || d.period_to < d.period_from) { stSay('Zeitraum: „bis“ liegt vor „von“'); return; }
  if (_srDays(d.period_from, d.period_to) > 366) { stSay('Mehr als 12 Monate: bitte je Jahr eine eigene Abrechnung eintragen'); return; }
  if (d.weg_direction && !(_srNum(d.weg_amount) > 0)) { stSay('Bitte den Betrag des WEG-Ergebnisses eintragen'); return; }
  if (!d.weg_direction) { d.weg_amount = null; d.weg_due = null; d.weg_via = d.weg_direction === 0 ? null : d.weg_via; }
  if (btn) btn.disabled = true;
  try {
    const saved = await srSaveRow(d);
    await _srWriteWeg(c, saved);
    SR.edit = false; SR.draft = null;
    stSay('Hausgeldabrechnung gespeichert');
    if (c) SR.sel = { kind: 'hv', ck: c.ck };
  } catch (err) {
    const msg = String((err && (err.message || err.code)) || err);
    stSay(/does not exist|42P01|relation|schema cache/i.test(msg) ? 'Bitte zuerst das SQL (nk_abrechnung_rentals) ausführen' : 'Speichern fehlgeschlagen — ' + msg);
    if (btn) btn.disabled = false;
    return;
  }
  stRenderRentals();
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
      !confirm('Das WEG-Ergebnis ist in Controlling schon als bezahlt gebucht. Trotzdem ändern?')) return;
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
    stSay(/abr_results_one_weg|duplicate|23505/i.test(msg) ? 'Für dieses Jahr gibt es schon eine Hausgeldabrechnung in Controlling' : 'WEG-Ergebnis nicht gespeichert — ' + msg);
  }
}

/* 2 · Pauschal panel */
function _srPauschPanel(c, it) {
  const l = _srLine(c, it), t = _srTenantOf(it.r);
  const done = it.r.status === 'nicht durchgeführt';
  return _srHead(_srTName(t) || 'Mieter', 'Pauschalmiete · ' + c.p.name) + '<div class="st-panel__b">' +
    '<div class="st-block"><div class="cx-kv"><span>Zeitraum</span><span>' + stEsc(_srPerText(l.from, l.to)) + ' · ' + _srDays(l.from, l.to) + ' Tage</span></div></div>' +
    '<p class="st-note">In diesem Zeitraum galt eine Pauschalmiete – die Nebenkosten sind darin enthalten, es gibt keine NK-Abrechnung. Die anteiligen Kosten bleiben bei dir.</p>' +
    (done ? '<p class="st-status st-status--erledigt">Als „nicht durchgeführt“ markiert.</p>'
          : '<button class="cx-btn cx-btn--p cx-btn--full" data-sr="nd">Als „nicht durchgeführt“ markieren</button>') +
  '</div>';
}

/* 3 · Tenant panel: result first → figures → calculation (folded) → letter → check → actions */
const _srViaText = { zahlung: 'per Überweisung', miete: 'mit der Miete', kaution: 'mit der Kaution' };
function _srTenPanel(c, it) {
  const rec = _srRec(c.p, c.per), l = _srLine(c, it), t = _srTenantOf(it.r);
  const title = _srJoin(_srTNames(t)) || 'Mieter';
  const perC = _srPer(c, rec);
  const head = _srHead(title, 'NK-Abrechnung ' + _srPerLabel(perC.from, perC.to) + ' · ' + c.p.name);
  const sum = _srRecSummary(rec, c.apt);
  if (!rec || !sum.ok) {
    const received = !!(rec && (rec.received_on || rec.hv_date));
    return head + '<div class="st-panel__b"><p class="st-note">' + (received
        ? 'Die Jahresabrechnung ist da, aber noch nicht vollständig erfasst (Datum und Beträge aller Positionen). Danach steht hier die Abrechnung für ' + stEsc(title) + '.'
        : 'Wartet auf die Jahresabrechnung der HV. Sobald du sie als erhalten einträgst, steht hier die Abrechnung für ' + stEsc(title) + '.') + '</p>' +
      '<button class="cx-btn cx-btn--p cx-btn--full" data-sr="hv" data-k="' + stEsc(c.ck) + '">Zur Jahresabrechnung</button></div>';
  }
  const x = _srCalc(c, it, rec), ts = x.ts;
  const sent = l.state.k !== 'offen';
  SR.sign = _srSign(x);

  // figures
  const vzSrc = x.vzOv !== null ? (x.vzSoll !== null && Math.abs(x.vzOv - x.vzSoll) < 0.005 ? 'lt. Vertrag' : 'von Hand') : x.vzIst !== null ? 'gezahlt lt. Controlling' : (x.vzPartial ? 'Controlling nur teilweise erfasst – Vertrag' : 'lt. Vertrag');
  const vzHint = vzSrc;
  const vzAlt = [];                                  // one tap back to the other source
  if (!sent && x.vzIst !== null && (x.vzOv !== null || Math.abs(x.vz - x.vzIst) >= 0.01)) vzAlt.push(['ist', 'Controlling ' + stEur(x.vzIst)]);
  if (!sent && x.vzSoll !== null && Math.abs(x.vz - x.vzSoll) >= 0.01) vzAlt.push(['soll', 'Vertrag ' + stEur(x.vzSoll)]);
  const since = _srD(c.p.in_portfolio_since);
  const perRow = SR.perEdit && !sent
    ? '<div class="sr-peredit"><div class="sr-grid2"><label class="st-f"><span class="st-f__l">Nutzung von</span><input class="st-in" type="date" id="srTpF" value="' + stEsc(_srD(it.r.period_from)) + '"/></label>' +
        '<label class="st-f"><span class="st-f__l">bis</span><input class="st-in" type="date" id="srTpT" value="' + stEsc(_srD(it.r.period_to)) + '"/></label></div>' +
        '<div class="sr-peredit__b"><button class="cx-link" data-sr="tenPerCancel">Abbrechen</button><button class="cx-link sr-acc" data-sr="tenPerSave">Speichern</button></div></div>'
    : '<div class="cx-kv"><span>Nutzungszeitraum</span><span>' + stEsc(stDM(x.from) + '–' + stDate(x.to)) + (sent ? '' : ' <button class="cx-link sr-inl" data-sr="tenPerEdit">ändern</button>') + '</span></div>';
  const buyHint = since && perC.from < since && x.from >= since && !sent
    ? '<p class="sr-hint2">Kauf am ' + stDate(since) + ': War ' + stEsc(_srTName(t) || 'der Mieter') + ' schon vorher Mieter? Dann den Nutzungszeitraum ab ' + stDM(perC.from) + ' erweitern – die Abrechnung umfasst das ganze Jahr.</p>' : '';
  const preHint = x.pre ? '<p class="sr-hint2">Davon vor dem Kauf (' + stDM(x.pre.from) + '–' + stDate(x.pre.to) + '): ' + stEur(x.pre.soll) + ' lt. Vertrag – mit dem Verkäufer / Kaufvertrag prüfen.</p>' : '';
  // Kaution-Einbehalt (read from Rentals › Tenants)
  let kauBlock = '';
  if (x.einbehalt > 0) {
    const rest = cxR(x.einbehalt - x.saldo);
    kauBlock = '<div class="st-block sr-kau"><p class="st-f__l">Kaution-Einbehalt</p>' +
      '<div class="cx-kv"><span>Einbehalten bis zur NK-Abrechnung</span><span>' + stEur(x.einbehalt) + '</span></div>' +
      '<div class="cx-kv"><span>' + (x.saldo > 0 ? 'abzüglich Nachzahlung' : x.saldo < 0 ? 'zuzüglich Guthaben' : 'Ergebnis') + '</span><span>' + (x.saldo ? (x.saldo > 0 ? '− ' : '+ ') + stEur(Math.abs(x.saldo)) : '0,00 €') + '</span></div>' +
      '<div class="cx-kv"><span><b>' + (rest >= 0 ? 'zurück an den Mieter' : 'Mieter zahlt noch') + '</b></span><span><b>' + stEur(Math.abs(rest)) + '</b></span></div>' +
      '<p class="sr-note">Aus Rentals › Tenants › Kaution. Die Auszahlung schließt du hier ab, sobald die Abrechnung verschickt ist.</p></div>';
  }
  const figs = '<div class="st-block">' + perRow + buyHint +
    '<div class="cx-kv"><span>Tage</span><span>' + x.tDays + ' von ' + x.perDays + '</span></div>' +
    '<div class="cx-kv"><span>Ihr Anteil (' + x.lines.length + ' Positionen)</span><span class="sr-strong" data-sr-sum>' + stEur(x.sum) + '</span></div>' +
    '<div class="cx-kv sr-kv-in"><span>Vorauszahlungen<small>' + stEsc(vzHint) + '</small></span>' +
      (sent ? '<span>− ' + stEur(x.vz) + '</span>'
            : '<label class="cx-f sr-in-s"><span>−</span><input type="text" inputmode="decimal" data-srt="vz" value="' + stEsc(cxE2(x.vz)) + '" aria-label="Vorauszahlungen"><span>€</span></label>') + '</div>' +
    (vzAlt.length ? '<div class="sr-vzalt"><span>stattdessen:</span>' + vzAlt.map(([k, t]) => '<button class="sr-vzalt__b" data-sr="vzUse" data-v="' + k + '">' + stEsc(t) + '</button>').join('') + '</div>' : '') +
    preHint +
  '</div>' + kauBlock;

  // calculation per position (folded unless a per-tenant amount is still missing)
  let calc = '';
  for (const ln of x.lines) {
    const label = ln.pos.label || _srKind(ln.pos.kind).l, direct = ln.pos.split === 'mieter';
    const small = direct ? 'je Mieter · Zwischenablesung' : ln.pos.key === 'direkt' || ln.pos.key === 'verbrauch'
      ? (x.partial ? stEur(ln.unit ?? 0) + ' × ' + x.tDays + '/' + x.perDays + ' Tage' : 'Kosten der Wohnung') : ln.keyText;
    calc += '<div class="sr-cl"><span class="sr-cl__t">' + stEsc(label) + '<small>' + stEsc(small) + '</small></span>' +
      (direct && !sent ? '<label class="cx-f sr-in-s"><input type="text" inputmode="decimal" data-srt="direct.' + stEsc(ln.pos.id) + '" value="' + stEsc(_srE2in(ts.direct && ts.direct[ln.pos.id])) + '" placeholder="Betrag" aria-label="' + stEsc(label) + ' für diesen Mieter"><span>€</span></label>'
                       : '<span class="sr-cl__v">' + (ln.amt === null ? '<em class="sr-miss">fehlt</em>' : stEur(ln.amt)) + '</span>') + '</div>';
  }
  const calcBlock = '<details class="sr-more"' + (x.missing ? ' open' : '') + '><summary>Berechnung je Position</summary><div class="sr-calc">' + calc + '</div></details>';

  // letter
  const addr = ts.addr !== undefined && ts.addr !== null ? ts.addr : _srDefaultAddr(c, it, x);
  const date = ts.date || cxToday();
  const days = _srNum(ts.days) ?? 30;
  const via = _srViaOf(x);
  const isNach = x.saldo > 0, moved = _srMovedOut(t);
  const s = (typeof appSettings !== 'undefined' && appSettings) || {};
  const ibanShort = s.iban ? String(s.iban).replace(/\s+/g, '').replace(/^(.{4}).*(.{2})$/, '$1 … $2') : '';
  const payTxt = !x.saldo ? 'kein Geld fließt'
    : isNach && via === 'zahlung' ? 'Überweisung auf ' + [s.kontoinhaber, ibanShort].filter(Boolean).join(' · ')
    : !isNach && via === 'zahlung' ? 'Guthaben per Überweisung an Mieter'
    : via === 'kaution' && x.einbehalt > 0 ? 'mit dem Kaution-Einbehalt verrechnet'
    : (isNach ? 'Nachzahlung ' : 'Guthaben ') + _srViaText[via];
  let letter = '';
  if (!sent) {
    letter = '<div><p class="st-f__l">Brief</p>';
    if (!SR.briefOpen) {
      letter += '<div class="cx-kv"><span>An</span><span>' + stEsc(addr.split('\n').filter(Boolean).join(', ') || '— fehlt —') + '</span></div>' +
        '<div class="cx-kv"><span>Datum · Zahlungsziel</span><span>' + stDate(date) + ' · ' + days + ' Tage</span></div>' +
        '<div class="cx-kv"><span>Zahlung</span><span>' + stEsc(payTxt) + '</span></div>' +
        (_srNum(ts.new_vz) !== null ? '<div class="cx-kv"><span>Neue Vorauszahlung</span><span>' + stEur(ts.new_vz) + (ts.new_vz_from ? ' ab ' + stDate(ts.new_vz_from) : '') + '</span></div>' : '') +
        '<button class="cx-link sr-acc" data-sr="brief">Brief anpassen</button>';
    } else {
      const vias = [['zahlung', 'Überweisung'], ['miete', 'mit Miete'], ['kaution', 'Kaution']];
      letter += '<div class="st-form">' +
        '<label class="st-f"><span class="st-f__l">Anschrift' + (moved ? ' (neue Anschrift nach Auszug)' : '') + '</span><textarea class="st-in sr-ta" rows="3" data-srt="addr" placeholder="Straße Nr.&#10;PLZ Ort">' + stEsc(addr) + '</textarea></label>' +
        '<div class="sr-grid2"><label class="st-f"><span class="st-f__l">Datum</span><input class="st-in" type="date" data-srt="date" value="' + stEsc(date) + '"/></label>' +
          '<label class="st-f"><span class="st-f__l">Zahlungsziel (Tage)</span><input class="st-in" inputmode="numeric" data-srt="days" value="' + days + '"/></label></div>' +
        (x.saldo ? '<fieldset class="st-f"><legend class="st-f__l">' + (isNach ? 'Nachzahlung' : 'Guthaben') + '</legend><div class="st-seg st-seg--3" role="group">' +
          vias.map(([v, tx]) => '<button type="button" class="st-seg__b' + (via === v ? ' is-on' : '') + '" data-sr="via" data-v="' + v + '" aria-pressed="' + (via === v) + '">' + tx + '</button>').join('') + '</div></fieldset>' : '') +
        (!moved ? '<div class="sr-grid2"><label class="st-f"><span class="st-f__l">Neue NK / Monat (optional)</span><span class="st-amt"><input class="st-in" inputmode="decimal" data-srt="new_vz" placeholder="—" value="' + stEsc(_srE2in(ts.new_vz)) + '"/><span>€</span></span></label>' +
          '<label class="st-f"><span class="st-f__l">ab</span><input class="st-in" type="date" data-srt="new_vz_from" value="' + stEsc(ts.new_vz_from || '') + '"/></label></div>' +
          '<p class="st-hint">Neue Vorauszahlung (§ 560 Abs. 4 BGB) steht nur im Brief – danach in Rentals › Tenants als NK-Änderung eintragen.</p>' : '') +
        '<label class="st-f"><span class="st-f__l">Anlage</span><input class="st-in" data-srt="anlagen" placeholder="z. B. Heizkostenabrechnung" value="' + stEsc(ts.anlagen !== undefined && ts.anlagen !== null ? ts.anlagen : _srDefaultAnlagen(rec)) + '"/></label>' +
        '<button class="cx-link sr-acc" data-sr="brief">Fertig</button></div>';
    }
    letter += '</div>';
  }
  const late = !sent && perC.frist && date > perC.frist && x.saldo > 0;
  const check = sent ? '' : '<div data-sr-check>' + _srCheckHtml(c, it, rec, x) + '</div>';
  const skipped = it.r.status === 'nicht durchgeführt';
  const status = sent ? '<p class="st-status st-status--' + l.state.k + '">' + (skipped ? 'Nicht abgerechnet – diese NK-Abrechnung wird bewusst nicht gemacht. Die Kosten bleiben bei dir.'
    : l.state.k === 'erledigt' ? 'Erledigt' : 'Verschickt – wartet auf die Zahlung. Bestätigt wird in Controlling (' + (l.state.res && l.state.res.dir > 0 ? 'Income' : 'Expenses') + ').') + '</p>' : '';
  const skip = sent ? '' : '<button class="cx-link sr-skip" data-sr="skip">Nicht abrechnen</button>';
  // after sending: close the Kaution-Einbehalt (the rest goes back to the tenant)
  const kauDone = sent && !skipped && x.einbehalt > 0
    ? '<div class="sr-kaudone"><p class="sr-note">' + (cxR(x.einbehalt - x.saldo) > 0 ? 'Rest aus dem Einbehalt an den Mieter: <b>' + stEsc(stEur(cxR(x.einbehalt - x.saldo))) + '</b>' : 'Der Einbehalt ist mit der Nachzahlung verrechnet.') + '</p>' +
      '<button class="cx-btn cx-btn--s cx-btn--full" data-sr="kauRest">' + (cxR(x.einbehalt - x.saldo) > 0 ? 'Rest ausgezahlt – Kaution abschließen' : 'Einbehalt verrechnet – Kaution abschließen') + '</button></div>' : '';

  return head + '<div class="st-panel__b">' +
    (skipped ? '' : '<div data-sr-res>' + _srBig(x, date, days, via) + '</div>') + status + kauDone + figs + calcBlock + letter + check +
    (late ? '<div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Die Frist (' + stDate(perC.frist) + ') ist vorbei: eine Nachzahlung kann nicht mehr verlangt werden (§ 556 Abs. 3 Satz 3 BGB), ein Guthaben musst du trotzdem auszahlen.</div>' : '') +
    skip +
  '</div>' +
  '<div class="sr-bar' + (skipped ? ' sr-bar--one' : '') + '">' +
    (skipped ? '' : '<button type="button" class="cx-btn cx-btn--p" data-sr="pdf" data-cc-pdf="1"' + (x.missing ? ' disabled' : '') + '><i class="ti ti-file-text" aria-hidden="true"></i> PDF erstellen</button>') +
    (sent ? '<button type="button" class="cx-btn cx-btn--s" data-sr="reopen">Zurück auf Offen</button>'
          : '<button type="button" class="cx-btn cx-btn--s" data-sr="send"' + (x.missing ? ' disabled' : '') + '><i class="ti ti-send" aria-hidden="true"></i> Verschickt</button>') +
  '</div>';
}
const _srSign = x => x.missing ? 'm' : String(Math.sign(x.saldo));
/* How the result is settled: chosen in the letter, else Kaution when part of it is held back, else transfer */
const _srViaOf = x => (x.ts && x.ts.via) || (x.einbehalt > 0 ? 'kaution' : 'zahlung');
function _srBig(x, date, days, via) {
  if (x.missing) return '<div class="sr-res sr-res--open"><span><b>Ergebnis</b><small>Beträge je Mieter fehlen</small></span><strong>—</strong></div>';
  const due = _srAdd(date || cxToday(), days ?? 30);
  const lab = x.saldo > 0 ? 'Nachzahlung' : x.saldo < 0 ? 'Guthaben' : 'Ausgeglichen';
  const sub = via === 'kaution' && x.einbehalt > 0 ? 'mit Kaution-Einbehalt verrechnet' : !x.saldo ? 'kein Geld fließt' : (via === 'zahlung' || !via ? 'bis ' + stDate(due) + ' · Überweisung' : _srViaText[via]);
  return '<div class="sr-res' + (x.saldo > 0 ? ' sr-res--nach' : x.saldo < 0 ? ' sr-res--gut' : '') + '"><span><b>' + lab + '</b><small>' + stEsc(sub) + '</small></span><strong>' + stEur(Math.abs(x.saldo)) + '</strong></div>';
}
/* What the letter needs — and where to fix it */
function _srChecks(c, it, rec, x) {
  const s = (typeof appSettings !== 'undefined' && appSettings) || {};
  const ts = x.ts, via = _srViaOf(x);
  const addr = ts.addr !== undefined && ts.addr !== null ? ts.addr : _srDefaultAddr(c, it, x);
  const miss = [];
  if (!String(s.vermieter_name || '').trim()) miss.push('Dein Name → Profil');
  if (!String(s.vermieter_adresse || '').trim()) miss.push('Deine Adresse → Profil');
  if (x.saldo > 0 && (via === 'zahlung' || (via === 'kaution' && x.einbehalt > 0 && x.saldo > x.einbehalt))) {
    if (!String(s.iban || '').trim()) miss.push('IBAN → Profil');
    if (!String(s.kontoinhaber || '').trim()) miss.push('Kontoinhaber → Profil');
  }
  if (!String(addr || '').trim()) miss.push('Anschrift des Mieters → Brief anpassen');
  if (!rec.hv_date) miss.push('Datum der HV-Abrechnung');
  if (x.missing) miss.push('Beträge je Mieter → Berechnung');
  return miss;
}
function _srCheckHtml(c, it, rec, x) {
  const miss = _srChecks(c, it, rec, x);
  return miss.length
    ? '<div class="sr-check is-warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i><span>Im Brief fehlt noch: ' + stEsc(miss.join(' · ')) + '</span></div>'
    : '<div class="sr-check"><i class="ti ti-check" aria-hidden="true"></i><span>Brief vollständig: Absender und Bank aus Profil, Anschrift, HV-Datum, alle Beträge.</span></div>';
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
  if (x.missing) { stSay('Bitte zuerst alle Beträge eintragen'); return; }
  const reset = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '<i class="ti ti-loader" aria-hidden="true"></i> Erstelle PDF …'; btn.disabled = true; }
  try {
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
      if (btn) btn.innerHTML = '<i class="ti ti-loader" aria-hidden="true"></i> Öffne PDF …';
      await ccOpenPdf(pdf, ccPdfFileName('NK-Abrechnung', d.periodLabel.replace(/\//g, '-'), d.aptName, (d.names[0] || '').split(' ').slice(-1)[0]));
    } finally { box.remove(); }
  } catch (err) {
    console.error('[settlements] NK PDF', err);
    alert('PDF konnte nicht erstellt werden. Bitte erneut versuchen.');
  } finally {
    if (btn) { btn.innerHTML = reset; btn.disabled = false; }
  }
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
    <p class="p">hiermit rechnen wir die Betriebskosten für Ihre Wohnung für den Abrechnungszeitraum vom <strong>${perTxt}</strong> ab.${d.partial ? ` Sie haben die Wohnung in diesem Zeitraum vom ${dt(d.useFrom)} bis ${dt(d.useTo)} genutzt (${d.tDays} von ${d.perDays} Tagen); die Kosten sind deshalb zeitanteilig berechnet.` : ''}</p>
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
  if (x.missing) { stSay('Bitte zuerst alle Beträge eintragen'); return; }
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
  SR.sel = { kind: 'ten', ck: c.ck, tid: String(row.id) };
  SR.briefOpen = false;
  stSay('Als verschickt gespeichert');
  stRenderRentals();
}

/* ── From Tracking: Rentals lines of a due period are worked on here ── */
function srIsRentalsLine(l) {
  return !!(l && l.type === 'row' && l.per && l.p && l.p.id !== CASA_PROP_ID && ['nk_tenant', 'weg_hausgeld'].includes(l.it.r.kind));
}
function srOpenFromTracking(l) {
  if (!srIsRentalsLine(l)) return false;
  const r = l.it.r, ck = _srCk(l.p.id, l.per.from);
  const kind = r.kind === 'weg_hausgeld' ? 'hv' : r.note === 'Pauschal' ? 'pausch' : r.tenant_id ? 'ten' : 'unlinked';
  stSwitchTab('rentals');
  SR.filter = 'alle'; SR.archiv = false; SR.open[ck] = true; SR.edit = false; SR.draft = null;
  SR.sel = kind === 'hv' ? { kind, ck } : { kind, ck, tid: String(r.id) };
  stRenderRentals();
  const row = document.querySelector('#tab-rentals .sr-row.is-sel'); if (row && _srWide()) row.scrollIntoView({ block: 'center' });
  return true;
}

/* ── Events ───────────────────────────────────────────────── */
function _srSelect(sel) {
  if (SR.edit && !confirm('Änderungen an der Hausgeldabrechnung verwerfen?')) return;
  SR.sel = sel; SR.edit = false; SR.draft = null; SR.briefOpen = false; SR.perEdit = false; SR.expEdit = false;
  stRenderRentals();
  const p = document.getElementById('srPanel'); if (p) p.scrollTop = 0;
}
(function () {
  const host = document.getElementById('tab-rentals'); if (!host) return;
  host.addEventListener('click', async e => {
    const b = e.target.closest('[data-sr], [data-st]'); if (!b || b.disabled) return;
    if (b.dataset.st) {                                     // Abrechnungszeitraum row (shared with Tracking)
      const a = b.dataset.st;
      if (a === 'perEdit') { ST.perEdit = Number(b.dataset.k); _srRerenderPanel(); }
      if (a === 'perCancel') { ST.perEdit = null; _srRerenderPanel(); }
      if (a === 'perSave') await _stPeriodSave(Number(b.dataset.k));
      return;
    }
    const a = b.dataset.sr;
    if (a === 'overToggle') { SR.overOpen = !(b.parentElement && b.parentElement.open); return; }     // <details> opens itself
    if (a === 'filter') { SR.filter = b.dataset.k; stRenderRentals(); return; }
    if (a === 'archiv') { if (SR.edit && !confirm('Änderungen verwerfen?')) return; SR.archiv = !SR.archiv; SR.sel = null; SR.edit = false; SR.draft = null; stRenderRentals(); window.scrollTo(0, 0); return; }
    if (a === 'fold') { const k = b.dataset.k; SR.open[k] = b.getAttribute('aria-expanded') !== 'true'; stRenderRentals(); return; }
    if (a === 'close') { stClosePanel(); return; }
    if (a === 'hv') { _srSelect({ kind: 'hv', ck: b.dataset.k }); return; }
    if (a === 'ten' || a === 'pausch' || a === 'unlinked') { _srSelect({ kind: a, ck: b.dataset.k, tid: b.dataset.id }); return; }
    const c = SR.sel ? _srCards[SR.sel.ck] : null;
    if (!c) return;
    // Jahresabrechnung · Eingang
    if (a === 'ask') {                                        // the mailto link opens the mail app; we log the date
      if (SR.missing) return;
      const rec = _srRec(c.p, c.per) || _srBlankRec(c);
      const t = _srToday(), list = (rec.asked_on || []).map(_srD);
      if (!list.includes(t)) rec.asked_on = list.concat([t]);
      setTimeout(async () => { try { await srSaveRow(rec); stRenderRentals(); } catch (err) { stSay('Nachfrage nicht gespeichert — ' + (err.message || err)); } }, 400);
      return;
    }
    if (a === 'hvRecv') {
      const rec = _srRec(c.p, c.per);
      SR.draft = rec ? JSON.parse(JSON.stringify(rec)) : _srBlankRec(c);
      if (!SR.draft.period_from) { SR.draft.period_from = c.per.from; SR.draft.period_to = c.per.to; }
      if (!SR.draft.received_on) SR.draft.received_on = _srToday();
      SR.edit = true; stRenderRentals(); return;
    }
    if (a === 'expEdit') { SR.expEdit = true; _srRerenderPanel(); return; }
    if (a === 'expCancel') { SR.expEdit = false; _srRerenderPanel(); return; }
    if (a === 'expSave') {
      const v = document.getElementById('srExpM')?.value || '';
      const m = v ? Number(v) : null;
      const { error } = await _ctlSupa.from('ctrl_properties').update({ hv_expected_month: m }).eq('id', c.p.id);
      if (error) { stSay(/hv_expected_month/.test(error.message || '') ? 'Bitte zuerst das neue SQL ausführen' : 'Fehlgeschlagen — ' + error.message); return; }
      c.p.hv_expected_month = m; SR.expEdit = false; stSay('Gespeichert'); stRenderRentals(); return;
    }
    if (a === 'wegDir') { _srCollect(); SR.draft.weg_direction = Number(b.dataset.v); if (SR.draft.weg_direction && !SR.draft.weg_via) SR.draft.weg_via = 'zahlung'; _srRerenderPanel(); return; }
    if (a === 'wegVia') { _srCollect(); SR.draft.weg_via = b.dataset.v; _srRerenderPanel(); return; }
    // Hausgeldabrechnung
    if (a === 'hvEdit') { const rec = _srRec(c.p, c.per); SR.draft = rec ? JSON.parse(JSON.stringify(rec)) : _srBlankRec(c); if (!SR.draft.period_from) { SR.draft.period_from = c.per.from; SR.draft.period_to = c.per.to; } SR.edit = true; stRenderRentals(); return; }
    if (a === 'hvCopy') {
      const prev = _srPrevRec(c.p, c.per); if (!prev) return;
      if (!SR.edit) { const rec = _srRec(c.p, c.per); SR.draft = rec ? JSON.parse(JSON.stringify(rec)) : _srBlankRec(c); if (!SR.draft.period_from) { SR.draft.period_from = c.per.from; SR.draft.period_to = c.per.to; } SR.edit = true; }
      else _srCollect();
      _srCopyFrom(prev, SR.draft); stRenderRentals(); stSay('Positionen übernommen – bitte die neuen Beträge eintragen'); return;
    }
    if (a === 'hvCancel') { SR.edit = false; SR.draft = null; stRenderRentals(); return; }
    if (a === 'hvSave') { await _srHvSave(b); return; }
    if (a === 'keyMode') { _srCollect(); SR.draft.key_mode = b.dataset.v; _srRerenderPanel(); return; }
    if (a === 'posAdd') {
      _srCollect(); SR.draft.positions.push(_srNewPos('wasser', SR.draft)); _srRerenderPanel();
      const last = document.querySelector('#srPanel .sr-pos:last-of-type'); if (last) last.scrollIntoView({ block: 'center' });
      return;
    }
    if (a === 'posDel') { _srCollect(); SR.draft.positions.splice(Number(b.dataset.i), 1); _srRerenderPanel(); return; }
    if (a === 'posGs') {
      _srCollect();
      const q = _srNum(c.verw && c.verw.grundsteuer_mtl) || 0, dd = _srDays(c.per.from, c.per.to);
      const p = _srNewPos('grundsteuer', SR.draft);
      p.amount = cxR(dd >= 365 ? q * 4 : q * 4 * dd / 365);                  // €/Quartal × 4 (shorter period: by days)
      SR.draft.positions.unshift(p); _srRerenderPanel(); return;
    }
    // Tenant · Nutzungszeitraum (own period for this tenant's line — same field Tracking uses)
    if (a === 'tenPerEdit') { SR.perEdit = true; _srRerenderPanel(); return; }
    if (a === 'tenPerCancel') { SR.perEdit = false; _srRerenderPanel(); return; }
    if (a === 'tenPerSave') {
      const it = c.items.find(x => x.type === 'row' && String(x.r.id) === String(SR.sel.tid)); if (!it) return;
      const pf = _srD(document.getElementById('srTpF')?.value), pt = _srD(document.getElementById('srTpT')?.value);
      if (!pf || !pt || pt < pf) { stSay('Zeitraum: „bis“ liegt vor „von“'); return; }
      const l = _srLine(c, it);
      let row;
      try { row = await _stUpsertSettlement(l, { period_from: pf, period_to: pt, period_custom: true }); }
      catch (err) {
        if (/period_custom/.test(err.message || '')) { try { row = await _stUpsertSettlement(l, { period_from: pf, period_to: pt }); } catch (e2) { stSay('Fehlgeschlagen — ' + (e2.message || e2)); return; } }
        else { stSay('Fehlgeschlagen — ' + (err.message || err)); return; }
      }
      ctlSettlementInvalidate(); SR.perEdit = false; SR.sel = { kind: 'ten', ck: c.ck, tid: String(row.id) };
      stSay('Nutzungszeitraum gespeichert'); stRenderRentals(); return;
    }
    // Tenant · Kaution-Einbehalt abschließen (writes the Kaution in Rentals › Tenants)
    if (a === 'kauRest') {
      const it = c.items.find(x => x.type === 'row' && String(x.r.id) === String(SR.sel.tid)); if (!it) return;
      const rec = _srRec(c.p, c.per), x = _srCalc(c, it, rec), k = x.kau; if (!k || !k.id) return;
      if (!k.settled) { stSay('Erst in Rentals › Tenants die Kaution abrechnen, dann hier abschließen'); return; }
      const rest = cxR(x.einbehalt - x.saldo);
      const note = 'NK ' + _srPerLabel(x.per.from, x.per.to) + ': ' + (x.saldo > 0 ? 'Nachzahlung ' : x.saldo < 0 ? 'Guthaben ' : 'ausgeglichen ') + (x.saldo ? stEur(Math.abs(x.saldo)) : '');
      if (!confirm((rest > 0 ? 'Rest von ' + stEur(rest) + ' an den Mieter ausgezahlt?' : 'Einbehalt mit der Nachzahlung verrechnet?') + '\n\nDie Kaution in Rentals › Tenants wird damit abgeschlossen.')) return;
      const upd = { nk_einbehalt: 0, returned: cxR((Number(k.returned) || 0) + Math.max(rest, 0)) };
      if (Object.prototype.hasOwnProperty.call(k, 'deduction_reason')) upd.deduction_reason = [k.deduction_reason, note].filter(Boolean).join(' · ');
      const { error } = await _ctlSupa.from('rnt_kaution').update(upd).eq('id', k.id);
      if (error) { stSay('Fehlgeschlagen — ' + error.message); return; }
      Object.assign(k, upd); stSay('Kaution abgeschlossen'); stRenderRentals(); return;
    }
    // Tenant
    if (a === 'brief') { const got = _srCollectTenant(); if (got) _srQueueTenantSave(got.rec); SR.briefOpen = !SR.briefOpen; _srRerenderPanel(); return; }
    if (a === 'via') { const got = _srCollectTenant(); if (!got) return; got.ts.via = b.dataset.v; _srQueueTenantSave(got.rec); _srRerenderPanel(); return; }
    if (a === 'pdf') { await _srPdf(b); return; }
    if (a === 'send') { await _srSend(b); return; }
    if (a === 'reopen') {
      const it = c.items.find(x => x.type === 'row' && String(x.r.id) === String(SR.sel.tid)); if (!it) return;
      await _stReopen(_srLine(c, it)); stRenderRentals(); return;
    }
    if (a === 'vzUse') {
      const got = _srCollectTenant(); if (!got) return;
      const x = _srCalc(got.c, got.it, Object.assign({}, got.rec, { tenants: Object.assign({}, got.rec.tenants, { [String(got.it.r.tenant_id)]: Object.assign({}, got.ts, { vz: null }) }) }));
      got.ts.vz = b.dataset.v === 'soll' ? x.vzSoll : (x.vzIst !== null && Math.abs(x.vz - x.vzIst) < 0.005 ? null : x.vzIst);
      if (b.dataset.v === 'ist') got.ts.vz = null;
      _srQueueTenantSave(got.rec); _srRerenderPanel(); return;
    }
    if (a === 'skip') {
      const it = c.items.find(x => x.type === 'row' && String(x.r.id) === String(SR.sel.tid)); if (!it) return;
      if (!confirm('Diese NK-Abrechnung nicht machen?\n\nSie verschwindet aus „offen“; die Kosten bleiben bei dir. Mit „Zurück auf Offen“ holst du sie wieder zurück.')) return;
      try { const row = await _stUpsertSettlement(_srLine(c, it), { status: 'nicht durchgeführt' }); SR.sel = { kind: 'ten', ck: c.ck, tid: String(row.id) }; }
      catch (err) { stSay('Fehlgeschlagen — ' + (err.message || err)); return; }
      ctlSettlementInvalidate(); stSay('Nicht abgerechnet'); stRenderRentals(); return;
    }
    if (a === 'nd') {
      const it = c.items.find(x => x.type === 'row' && String(x.r.id) === String(SR.sel.tid)); if (!it) return;
      await _stNotDone(_srLine(c, it)); SR.sel = null; stRenderRentals(); return;
    }
  });
  host.addEventListener('change', e => {
    const s = e.target.closest('[data-srs]');
    if (s && SR.draft) {                                     // selects in the HV form change the structure → re-render
      _srCollect();
      const p = SR.draft.positions[Number(s.dataset.i)]; if (!p) return;
      if (s.dataset.srs === 'kind') { const k = _srKind(s.value); p.kind = k.k; p.u = k.u; if (_srNum(p.amount) !== null || !p.total) p.key = 'direkt'; if (!['sonst', 'nu_sonst'].includes(k.k)) p.label = null; }
      if (s.dataset.srs === 'key') p.key = s.value;
      if (s.dataset.srs === 'split') p.split = s.value;
      _srRerenderPanel(); return;
    }
    const cb = e.target.closest('[data-src="split"]');
    if (cb && SR.draft) { _srCollect(); const p = SR.draft.positions[Number(cb.dataset.i)]; if (p) p.split = cb.checked ? 'mieter' : 'tage'; _srRerenderPanel(); return; }
    const t = e.target.closest('[data-srt]');
    if (t) {
      const res = _srRefreshTenant(); if (!res) return;
      _srQueueTenantSave(res.got.rec);
      if (_srSign(res.x) !== SR.sign || t.dataset.srt === 'date' || t.dataset.srt === 'vz') _srRerenderPanel();   // Nachzahlung ↔ Guthaben, Frist, Vorauszahlung source
    }
  });
  host.addEventListener('input', e => {
    if (e.target.closest('[data-srf]')) _srRefreshCalc();
    const t = e.target.closest('[data-srt]');
    if (t && (t.dataset.srt === 'vz' || t.dataset.srt.startsWith('direct.'))) _srRefreshTenant();
  });
})();
