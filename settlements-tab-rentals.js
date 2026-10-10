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
  year: null, filter: 'all', modal: null, costsOpen: false, dirty: false, open: {}, setEdit: null,
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
    try {                                               // #11: Hausgeld Ist per month (Controlling) — read only, for the hint
      const h = await _ctlSupa.from('ctrl_expense_apartments').select('property_id,year,month,hausgeld');
      SR.hgIst = h.error ? [] : (h.data || []);
    } catch (e) { SR.hgIst = []; }
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
  const since = _srBought(c.p);
  const rf = _srD(r.period_from), rt = _srD(r.period_to);
  let vzSoll, vzIst, pre = null, vzPartialFlag = false, mlist = [];
  if (since && since > rf && since <= rt) {
    // year of purchase: months before it → contract Soll (the seller collected them), after it → what Controlling shows
    const fb = fig(rf, _srAdd(since, -1)), fa = fig(since, rt);
    mlist = ((fb && fb.months) || []).map(mo => Object.assign({}, mo, { ist: null, pre: true })).concat((fa && fa.months) || []);
    const preSoll = fb && fb.nkSoll !== null ? fb.nkSoll : 0;
    const aIst = fa && fa.nkIst !== null && !fa.istPartial && !fa.preStart ? fa.nkIst : null;
    const aSoll = fa && fa.nkSoll !== null ? fa.nkSoll : 0;
    pre = { from: rf, to: _srAdd(since, -1), soll: cxR(preSoll) };
    vzSoll = cxR(preSoll + aSoll);
    vzIst = aIst !== null ? cxR(preSoll + aIst) : null;
  } else {
    const f = fig(rf, rt);
    mlist = (f && f.months) || [];
    vzSoll = f && f.nkSoll !== null ? f.nkSoll : null;
    vzIst = f && f.nkIst !== null && !f.istPartial && !f.preStart ? f.nkIst : null;
    vzPartialFlag = !!(f && f.istPartial);
  }
  const vzOv = _srNum(ts.vz);
  const vz = vzOv !== null ? vzOv : (vzIst !== null ? vzIst : (vzSoll || 0));
  const f = { istPartial: vzPartialFlag };
  sum = cxR(sum);
  const kau = null, einbehalt = 0;
  const vzMonths = _srVzMonths(mlist, vzIst !== null && (vzOv === null || Math.abs(vzOv - vzIst) < 0.005) ? 'ist' : 'soll', cxR(vz));
  return { lines, sum, vz: cxR(vz), vzSoll, vzIst, vzOv, vzMonths, vzPartial: !!(f && f.istPartial), pre, saldo: cxR(sum - vz),
           tDays, perDays, from, to, per, partial: tDays < perDays, missing, direct, t, apt, ts, kau, einbehalt };
}
/* Geleistete Vorauszahlungen per month (for the letter): paid per Controlling, else per contract.
   The list always adds up to the Vorauszahlungen of the Abrechnung — cent rounding goes into the last month,
   an amount typed by hand shows as one "Korrektur" line.                                                 */
function _srVzMonths(mlist, mode, vz) {
  const rows = (mlist || []).filter(mo => mo.days > 0).map(mo => ({
    label: SR_MON[mo.m - 1] + ' ' + mo.y, part: mo.days < mo.N ? mo.days + '/' + mo.N + ' Tage' : '',
    amt: cxR(mode === 'ist' && !mo.pre ? (mo.ist ?? 0) : mo.soll),          // paid per Controlling: a month without payment is 0 €
  }));
  if (!rows.length) return [];
  const tot = cxR(rows.reduce((a, r) => a + r.amt, 0)), diff = cxR(vz - tot);
  if (Math.abs(diff) >= 0.005 && Math.abs(diff) < 0.05) rows[rows.length - 1].amt = cxR(rows[rows.length - 1].amt + diff);
  else if (Math.abs(diff) >= 0.05) rows.push({ label: 'Korrektur', part: '', amt: diff, corr: true });
  return rows;
}
const _srMovedOut = t => !!(t && t.mietende && _cxD(t.mietende) && _cxD(t.mietende) < cxToday());
const _srSaldoText = s => !s ? 'Ausgeglichen' : (s > 0 ? 'Nachzahlung ' : 'Guthaben ') + stEur(Math.abs(s));

/* Jahresabrechnung (step ①) — where it stands
   erwartet → überfällig → erfassen (received, positions/date missing) → weg (WEG result missing) → zahlung (WEG money open) → fertig */
/* Jahresabrechnung complete = you tapped "Mark complete" (keys.ja_done). Records from before the new flow
   (no keys.ja_v) count as complete once the costs and the WEG result are in. */
function _srJaDone(rec, sum) {
  if (!rec) return false;
  const k = rec.keys || {};
  if (k.ja_v) return !!k.ja_done;
  return !!(sum && sum.ok && rec.weg_direction !== null && rec.weg_direction !== undefined);
}
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
  if (!sum.ok || !_srJaDone(rec, sum)) return { k: 'erfassen', received, exp, asked, fristSoon, per, wegL, wegSt, todo: true, pill: ['open', 'to enter'], line2: recv + ' · not complete yet' };
  const wegSet = rec.weg_direction !== null && rec.weg_direction !== undefined;
  if (!wegSet && !(wegSt && wegSt.res)) return { k: 'weg', received, exp, asked, fristSoon, per, wegL, wegSt, todo: true, pill: ['open', 'WEG result'], line2: recv + ' · WEG result missing' };
  if (wegSt && wegSt.k === 'verschickt') return { k: 'zahlung', received, exp, asked, fristSoon, per, wegL, wegSt, wait: true, pill: ['diff', 'open'], line2: recv + (rec.weg_due ? ' · due ' + stDate(rec.weg_due) : '') };
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
  const obj = [apt.adresse, stWhg(apt.wohnungsnummer), apt.plz_ort].filter(Boolean).join(', ') || c.p.name;
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
  const aptLines = apt ? [[apt.adresse, stWhg(apt.wohnungsnummer)].filter(Boolean).join(', '), apt.plz_ort || ''].filter(Boolean).join('\n') : '';
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
    objekt: [[apt.adresse, stWhg(apt.wohnungsnummer)].filter(Boolean).join(', '), apt.plz_ort].filter(Boolean).join(', '),
    footer: apt.adresse ? apt.adresse + (apt.plz_ort ? ' \u00b7 ' + apt.plz_ort : '') : (apt.plz_ort || ''),
    ort: apt.unterschrift_ort || '',
    vermieter: s.vermieter_name || '', sender,
    bank: { inhaber: s.kontoinhaber || '', bank: s.bankname || '', iban: s.iban || '', bic: s.bic || '' },
    names: _srTNames(t), addr: String(addr || '').split('\n').map(z => z.trim()).filter(Boolean),
    date, due: _srAdd(date, _srNum(ts.days) ?? 30), periodLabel, perFrom: c.per.from, perTo: c.per.to, perDays: x.perDays,
    useFrom: x.from, useTo: x.to, tDays: x.tDays, partial: x.partial,
    hvName: (c.verw && c.verw.hausverwaltung) || '', hvDate: rec.hv_date,
    lines: x.lines.filter(l => l.amt !== null), direct: x.direct,
    sum: x.sum, vz: x.vz, vzMonths: x.vzMonths || [], saldo: x.saldo, via: _srViaOf(x), einbehalt: x.einbehalt,
    newVz: _srNum(ts.new_vz), newVzFrom: ts.new_vz_from || null,
    anlagen: ts.anlagen !== undefined && ts.anlagen !== null ? ts.anlagen : _srDefaultAnlagen(rec),
    hasVerbrauch: x.lines.some(l => l.pos.key === 'verbrauch' || ['heizung', 'warmwasser'].includes(l.pos.kind)), hasFlaeche: x.lines.some(l => l.pos.key === 'flaeche'), hasMea: x.lines.some(l => l.pos.key === 'mea'),
    keyMode: rec.key_mode || 'flaeche',
    tenantIban: ts.iban || '', former: _srMovedOut(t),
    verwendung: 'NK ' + periodLabel + ' ' + (apt.name || c.p.name) + (t && t.last_name ? ' ' + t.last_name : ''),
  };
}

/* The letter (Oct 2026 redesign): one page in the shared NK design (nk-letter.js) — header: apartment name left,
   Wohnung + number right (nothing right without a number) · Betreff = period the tenant lived there · costs left, monthly NK-Vorauszahlungen right · one result box */
function srLetterHtml(d) {
  const dt = iso => cxFmtDate(iso);
  const eur = n => { const v = Number(n) || 0; return (v < -0.004 ? '\u2212\u00a0' : '') + Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0\u20ac'; };
  const parts = String(d.objekt || '').split(/\s*,\s*/).filter(Boolean);
  const plz = parts.length > 1 && /^\d{5}\b/.test(parts[parts.length - 1]) ? parts.pop() : '';
  const year = String(d.perTo || '').slice(0, 4);
  const vzNew = d.newVz !== null && d.newVz !== undefined
    ? `<p class="p">Auf Grundlage dieser Abrechnung wird die monatliche Betriebskostenvorauszahlung nach §\u00a0560 Abs.\u00a04 BGB ${d.newVzFrom ? 'ab dem <strong>' + dt(d.newVzFrom) + '</strong> ' : ''}auf <strong>${eur(d.newVz)}</strong> angepasst.</p>` : '';
  return nkLetterHtml({
    brand: d.aptName, unitLabel: 'Wohnung', unitName: d.wohnungsnummer || '',   // name left · Wohnung + number right
    footer: d.footer, sender: d.sender, vermieter: d.vermieter, ort: d.ort, date: d.date, names: d.names, addr: d.addr,
    title: 'Betriebskostenabrechnung ' + dt(d.useFrom) + ' \u2013 ' + dt(d.useTo),
    facts1: [['Wohnung', parts.join(', ') || d.aptName, plz],
             ['Zeitraum', dt(d.useFrom) + ' \u2013 ' + dt(d.useTo), d.partial ? d.tDays + ' von ' + d.perDays + ' Tagen \u00b7 Abrechnungsjahr ' + year : d.perDays + ' Tage'],
             ['Grundlage', 'Hausgeldabrechnung', [d.hvName, d.hvDate ? 'vom ' + dt(d.hvDate) : ''].filter(Boolean).join(' ')]],
    greeting: d.names.length ? 'Guten Tag ' + _srJoin(d.names) + ',' : 'Sehr geehrte Damen und Herren,',
    introHtml: 'anbei die Betriebskostenabrechnung für den genannten Zeitraum.' + (d.partial ? ' Die Kosten sind nach Tagen anteilig berechnet.' : ''),
    costs: { cols: [{ label: 'Kostenart', w: '70%' }, { label: d.partial ? 'Anteil ' + d.tDays + '/' + d.perDays + ' Tage' : 'Betrag', w: '30%', cls: 'r' }],
             rows: d.lines.map(l => [(l.pos.label || _srKind(l.pos.kind).l) + (l.pos.split === 'mieter' ? ' (Zwischenablesung)' : ''), eur(l.amt)]) },
    sum: d.sum, vz: d.vz, vzMonths: d.vzMonths || [], saldo: d.saldo, via: d.via, einbehalt: d.einbehalt, due: d.due,
    bank: d.bank, verwendung: d.verwendung, tenantIban: d.tenantIban, former: d.former, du: false,
    extraHtml: vzNew,
    hints: [(d.hasVerbrauch ? 'Heizung und Warmwasser nach Verbrauch gemäß Heizkostenverordnung (siehe Anlage). ' : '') + 'Nicht umlagefähige Kosten wie Verwaltung und Rücklage sind nicht enthalten.',
            'Die Belege können nach Terminabsprache eingesehen werden. Einwendungen sind bis zum Ablauf des zwölften Monats nach Zugang mitzuteilen (§ 556 Abs. 3 Satz 5 BGB).'],
    closing: 'Mit freundlichen Grüßen', anlagen: d.anlagen, extra: null,
  });
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
            Settle line (Soll once · what really moved · Settled; 0 € = kept, still done).
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
    const since = _srBought(p);
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
  const since = _srBought(c.p);
  for (let d = c.per.from; d <= c.per.to; d = _srAdd(_srLastOfMonth(Number(d.slice(0, 4)), Number(d.slice(5, 7))), 1)) {
    const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7));
    if (since && _srLastOfMonth(y, m) < since) continue;
    try { const r = ctlCostRows(c.p, y, m).rows.find(x => x.key === 'hausgeld'); if (r) sum += Number(r.soll) || 0; } catch (e) {}
  }
  return cxR(sum);
}
/* #11: Hausgeld actually paid (Ist) in Controlling for the same months as the Soll — shown as a hint only */
function _srHausgeldIst(c) {
  let sum = 0, need = 0, got = 0;
  const since = _srBought(c.p), rows = (SR.hgIst || []).filter(x => String(x.property_id) === String(c.p.id));
  for (let d = c.per.from; d <= c.per.to; d = _srAdd(_srLastOfMonth(Number(d.slice(0, 4)), Number(d.slice(5, 7))), 1)) {
    const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7));
    if (since && _srLastOfMonth(y, m) < since) continue;
    need++;
    const hit = rows.filter(x => Number(x.year) === y && Number(x.month) === m && x.hausgeld !== null && x.hausgeld !== undefined && x.hausgeld !== '');
    if (hit.length) { got++; hit.forEach(x => { sum += Number(x.hausgeld) || 0; }); }
  }
  return { sum: cxR(sum), need, got };
}
function _srIstHint(c, soll) {
  const I = _srHausgeldIst(c);
  if (!I.got) return '';                                              // nothing entered in Controlling for these months
  const line = t => '<p class="mx-ok is-info"><i class="ti ti-info-circle" aria-hidden="true"></i> Controlling (Ist): ' + stEur(I.sum) + ' paid · ' + t + '</p>';
  if (I.got < I.need) return line(I.got + ' of ' + I.need + ' months entered');
  const diff = cxR(I.sum - (Number(soll) || 0));
  return Math.abs(diff) < 0.01 ? '' : line(stEur(Math.abs(diff)) + (diff < 0 ? ' less' : ' more') + ' than Soll');
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
  if (st.booking && Number(st.booking.amount) < 0.005) return (weg ? 'nothing moved' : st.res.dir > 0 ? 'let go ' + stEur(st.res.amount) : 'kept ' + stEur(st.res.amount)) + ' · ' + stDM(st.booking.invoice_date);
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
  const rows = c.items.map(it => _srTenInfo(c, it, rec, sum.ok && _srJaDone(rec, sum)));
  const hvDone = hv.k === 'fertig';
  const open = !hvDone || rows.some(r => r.k === 'open' || r.k === 'sent' || r.k === 'waiting');
  return { c, rec, sum, rows, hv, k: open ? 'open' : 'settled' };
}

/* WEG result of a complete Jahresabrechnung → tracker (no "edit → Done" after an import);
   money already booked in Controlling with the same amount → linked instead of booked twice */
function _srWegSync(infos) {
  SR._wegSync = SR._wegSync || {};
  const jobs = [];
  for (const i of infos) {
    const c = i.c, rec = i.rec, ck = c.ck, mark = SR._wegSync[ck];
    if (mark === 'ok' || c.before || !c.weg || !rec || !_srJaDone(rec, i.sum)) continue;
    if (rec.weg_direction === null || rec.weg_direction === undefined) continue;
    const st = i.hv && i.hv.wegSt;
    if (!st || !st.res) { if (mark !== 'w') { SR._wegSync[ck] = 'w'; jobs.push(() => _srWriteWeg(c, rec)); } continue; }
    SR._wegSync[ck] = 'ok';
    if (st.booking || st.k === 'erledigt' || !st.res.amount || !st.res.dir) continue;
    const b = _srFindBooking(c, st.res, rec);
    if (b) jobs.push(() => _srLinkBooking(b, st.res));
  }
  if (!jobs.length) return;
  (async () => {
    for (const j of jobs) { try { await j(); } catch (e) { console.warn('[settlements] WEG sync', e); } }
    ctlSettlementInvalidate(); stRenderRentals();
  })();
}
function _srFindBooking(c, res, rec) {
  const from = _srD(rec.hv_date) || c.per.to;
  const all = (window._ctrl.one_time || []).concat(window._src.abrPay || []);
  return all.find(o => Number(o.property_id) === Number(c.p.id) && Math.abs(Math.abs(Number(o.amount)) - res.amount) < 0.005 &&
    _srD(o.invoice_date) >= from && !/^abr:/.test(String(o.source_ref || '')) &&
    (o.direction === undefined || o.direction === null || Number(o.direction) === res.dir)) || null;
}
async function _srLinkBooking(b, res) {
  const f = { source_ref: 'abr:' + res.id, kind: 'Hausgeldabrechnung', before_link: _stBeforeLink(b) };   // #12: remember your type
  const d = await _stUpdOT(b.id, f);
  const row = d || Object.assign({}, b, f);
  window._src.abrPay = (window._src.abrPay || []).filter(o => o.id !== b.id).concat([row]);
  const k = (window._ctrl.one_time || []).findIndex(o => o.id === b.id); if (k >= 0) window._ctrl.one_time[k] = row;
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
  try { infos = _srYearModel(SR.year).filter(c => !c.before).map(_srCardInfo4); }   // a Wohnung appears from its purchase date (Properties) on
  catch (e) { console.error('[settlements] rentals', e); el.innerHTML = '<div class="st-page"><p class="cx-empty">Could not calculate the settlements.</p><p class="st-muted">' + stEsc(e.message || e) + '</p></div>'; return; }
  _srCards = {}; infos.forEach(i => { _srCards[i.c.ck] = i.c; });
  _srWegSync(infos);

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
/* Purchase date of a Wohnung: Properties › Purchase date (the only source) */
function _srIsoAny(v) {
  const s = String(v || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[0];
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/))) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  if ((m = s.match(/^(\d{4})$/))) return m[1] + '-01-01';
  return '';
}
function _srBought(p) {
  const loan = p ? ctlPropLinks(p).loan : null;
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
    } else if (hv.k === 'zahlung' && hv.wegSt && hv.wegSt.res) {
      const r = hv.wegSt.res;
      steps.push({ o: 0, ic: 'coin-euro', tone: 'red', t: r.dir > 0 ? 'Guthaben from the WEG not received' : 'Nachzahlung to the WEG not paid',
        s: i.c.p.name + ' · ' + stEur(r.amount) + (i.rec && i.rec.hv_date ? ' · statement ' + stDate(i.rec.hv_date) : ''),
        btn: '<button class="sc-go" data-sr="openHv" data-k="' + stEsc(i.c.ck) + '">Open</button>' });
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
  if (c.before) return '<div class="sc-card sr5-fold"><div class="sr5-h">' + num + '<span class="sr5-h__t"><span class="sr5-pn">' + stEsc(c.p.name) + '</span><span class="sr5-pm">bought ' + stDate(_srBought(c.p)) + ' · ' + SR.year + ' settled by the seller</span></span><span class="sc-chip sc-chip--grey">not yours</span></div></div>';
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
  else if (hv.k === 'zahlung') { say = wRes ? (wRes.dir > 0 ? 'Guthaben ' + stEur(wRes.amount) + ' · not received yet' : 'Nachzahlung ' + stEur(wRes.amount) + ' · not paid yet') : 'not settled yet'; tone = 'neg'; }
  else if (hv.k === 'weg') say = 'costs entered · enter the WEG result';
  else if (hv.k === 'erfassen') { say = 'received' + (rec && (rec.received_on || rec.hv_date) ? ' ' + stDM(rec.received_on || rec.hv_date) : '') + ' · not complete yet'; tone = 'warn'; }
  else if (hv.k === 'ueberfaellig') { say = 'overdue' + (hv.exp ? ' · expected ' + hv.exp.label : '') + (hv.asked.length ? ' · asked ' + stDM(hv.asked[hv.asked.length - 1]) : ''); tone = 'neg'; }
  else say = c.running ? 'runs until ' + stDate(c.per.to) : (hv.exp ? 'expected ~ ' + hv.exp.label : 'expected');
  const hvChip = hv.k === 'fertig' ? ['done', 'settled'] : hv.k === 'zahlung' ? ['red', 'open'] : hv.k === 'weg' ? ['send', 'to enter'] : hv.k === 'erfassen' ? ['send', 'to enter']
    : hv.k === 'ueberfaellig' ? ['red', 'ask HV'] : ['grey', c.running ? 'running' : 'expected'];
  h += '<button class="sc-row sr5-ln" data-sr="openHv" data-k="' + stEsc(c.ck) + '"><span class="sc-av sr5-av--hv"><i class="ti ti-building" aria-hidden="true"></i></span>' +
    '<span class="sc-row__m"><span class="sc-row__n">Hausgeld-Jahresabrechnung</span><span class="sc-row__s ' + tone + '">' + stEsc(say) + '</span></span>' +
    '<span class="sc-chip sc-chip--' + hvChip[0] + '">' + stEsc(hvChip[1]) + '</span></button>';
  // NK line: one line for all tenants of this period
  const nk = _srNkSummary(info);
  h += '<button class="sc-row sr5-ln" data-sr="openNk" data-k="' + stEsc(c.ck) + '"><span class="sc-av sr5-av--hv"><i class="ti ti-mail" aria-hidden="true"></i></span>' +
    '<span class="sc-row__m"><span class="sc-row__n">NK-Abrechnung</span><span class="sc-row__s ' + nk.tone + '">' + stEsc(nk.say) + '</span></span>' +
    '<span class="sc-chip sc-chip--' + nk.chip[0] + '">' + stEsc(nk.chip[1]) + '</span></button>';
  return h + '</div>';
}
/* The NK line of a card: one summary for all tenants of the period */
function _srNkSummary(info) {
  const T = info.rows.filter(r => r.kind === 'ten'), jaDone = _srJaDone(info.rec, info.sum);
  if (!T.length) return { say: info.rows.length ? 'Pauschal / no tenant – no NK' : 'no tenant with Kalt + NK', chip: ['grey', 'no NK'], tone: '' };
  if (!jaDone) return { say: (T.length === 1 ? T[0].name : T.length + ' tenants') + ' · waiting for the Jahresabrechnung', chip: ['grey', 'waiting'], tone: '' };
  const n = k => T.filter(r => r.k === k).length, open = n('open'), sent = n('sent'), done = n('settled');
  const money = r => { const res = r.st.res, v = res ? res.dir * res.amount : r.x && !r.x.missing ? r.x.saldo : null;
    return v === null ? '' : v > 0 ? 'Nachzahlung ' + stEur(v) : v < 0 ? 'Guthaben ' + stEur(-v) : 'balanced'; };
  const say = T.length === 1 ? [T[0].name, money(T[0])].filter(Boolean).join(' · ')
    : T.length + ' tenants · ' + [open ? open + ' to send' : '', sent ? sent + ' sent' : '', done ? done + ' settled' : ''].filter(Boolean).join(' · ');
  const chip = open ? ['send', T.length === 1 ? 'letter ready' : 'to send'] : sent ? ['wait', 'sent'] : ['done', 'settled'];
  return { say, chip, tone: '' };
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
        stEsc(l.tenant_name || '') + (l.source === 'manual' ? ' · manual' : '') + '</span><span class="sc-row__p">letter sent ' + stDate(typeof ccDayOf === 'function' ? ccDayOf(l.sent_at) : String(l.sent_at).slice(0, 10)) + '</span></span><span class="sc-open">Open</span></button>').join('') +
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
  const sub = c.before ? 'bought ' + stDate(_srBought(c.p))
    : _srPerText(c.per.from, c.per.to) + (hg ? ' · Hausgeld ' + stEur(hg) + '/mo' : '') + ' · Frist ' + stDate(c.per.frist);
  let h = '<section class="rk-block"><div class="rk-grp"><div class="rk-grp__n"><span class="rk-grp__i">' + idx + '</span><span class="rk-grp__t">' + stEsc(c.p.name) + '</span><span class="rk-grp__s">' + stEsc(sub) + '</span></div>' +
    '<button class="rk-lnk" data-sr="openNk" data-k="' + stEsc(c.ck) + '">NK-Abrechnung ›</button></div>';
  if (c.before) return h + '<div class="rk-row is-dim"><span class="rk-who">' + SR.year + ' before purchase – the seller settles it</span><span></span><span class="rk-st">' + cxPill('grey', 'not yours') + '</span><span></span><span></span><span></span><span></span></div></section>';
  // Hausgeld line
  const hv = info.hv, rec = info.rec, wegSt = hv.wegSt;
  const wRes = wegSt && wegSt.res;
  const wegMoney = wRes ? _srMoneyTxt(wRes.dir, wRes.amount, true) : (rec && rec.weg_direction !== null && rec.weg_direction !== undefined ? _srMoneyTxt(Number(rec.weg_direction), _srNum(rec.weg_amount), true) : '');
  const wegDone = wRes && wegSt.k === 'erledigt';
  const hvPill = hv.k === 'fertig' ? ['ok', 'settled'] : hv.k === 'zahlung' ? ['diff', 'open'] : hv.k === 'weg' || hv.k === 'erfassen' ? ['open', 'to enter']
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
const _srSetCount = rows => { const all = rows.filter(r => r.set && r.set.state !== 'locked'); return all.length ? ' · ' + all.filter(r => r.set.state === 'settled').length + ' of ' + all.length + ' settled' : ''; };
function _srSumSheet(view) {
  const infos = _srYearModel(SR.year).map(_srCardInfo4), S = srSummary(infos);
  const close = 'data-sr="close"';
  if (view === 'sumTen') {
    const rows = S.tenRows.map(x => { const av = stAv(x.idx);
      return { av, ab: stAbbr(x.i.c.p.name), name: x.r.name, sub: x.i.c.p.name + ' · ' + stPer(x.r.l.from, x.r.l.to) + (x.r.k === 'open' ? ' · to send' : x.r.k === 'sent' ? ' · sent' : ''),
               amount: Math.abs(x.v) >= 0.005 ? Math.abs(x.v) : 0, dir: x.v > 0 ? 1 : -1, act: 'data-sr="openTen" data-k="' + stEsc(x.i.c.ck) + '" data-id="' + stEsc(String(x.r.it.r.id)) + '"',
               set: Math.abs(x.v) >= 0.005 ? _srSetObj(x.i.c, x.r.st, x.r, false, x.idx) : null }; });
    return stSumSheet({ title: 'Tenants', sub: 'Rentals · periods ending in ' + SR.year, net: S.ten,
      sub2: S.ten === null ? 'waiting for the Jahresabrechnungen' : S.nIn + (S.nIn === 1 ? ' pays you' : ' pay you') + ' · ' + S.nOut + (S.nOut === 1 ? ' gets back' : ' get back') + _srSetCount(rows),
      groups: [{ title: 'Pay you', rows: rows.filter(r => r.amount && r.dir > 0) }, { title: 'Get back', rows: rows.filter(r => r.amount && r.dir < 0) },
               { title: 'Balanced', rows: rows.filter(r => !r.amount).map(r => Object.assign(r, { chip: ['grey', 'balanced'] })) }] }, close);
  }
  const rows = S.hgRows.map(x => { const av = stAv(x.idx), w = x.w, hv = x.i.hv || {};
    const act = 'data-sr="openHv" data-k="' + stEsc(x.i.c.ck) + '"';
    if (w && w.amount) return { av, ab: stAbbr(x.i.c.p.name), name: x.i.c.p.name, sub: (w.dir > 0 ? 'Guthaben · ' : 'Nachzahlung · ') + stPer(x.i.c.per.from, x.i.c.per.to), amount: w.amount, dir: w.dir, act,
                                set: _srSetObj(x.i.c, x.i.hv.wegSt, null, true, x.idx) };
    if (w) return { av, ab: stAbbr(x.i.c.p.name), name: x.i.c.p.name, sub: 'balanced · ' + stPer(x.i.c.per.from, x.i.c.per.to), chip: ['grey', 'balanced'], act };
    const over = hv.k === 'ueberfaellig';
    return { av, ab: stAbbr(x.i.c.p.name), name: x.i.c.p.name, sub: x.i.c.running ? 'runs until ' + stDe(x.i.c.per.to) : hv.exp ? 'expected ' + (over ? '' : '~ ') + hv.exp.label : 'expected', chip: over ? ['red', 'overdue'] : ['grey', x.i.c.running ? 'running' : 'expected'], act, wait: true };
  });
  return stSumSheet({ title: 'Hausgeld', sub: 'Rentals · WEG Jahresabrechnungen · periods ending in ' + SR.year, net: S.hg,
    sub2: rows.filter(r => r.amount && r.dir < 0).length + ' Nachzahlung · ' + rows.filter(r => r.amount && r.dir > 0).length + ' Guthaben · ' + rows.filter(r => r.wait).length + ' not in yet' + _srSetCount(rows),
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
  // Oct 2026 · one level: the result on top, two switch rows, the costs below — no steps, no edit mode
  const hvName = c.verw && c.verw.hv_name ? c.verw.hv_name : '';
  const head = stMHead('Jahresabrechnung ' + c.per.label, c.p.name + (hvName ? ' · ' + hvName : ''), 'bld', 'data-sr="close"') + '<div class="srm__pickwrap">' + _srPicker(c) + '</div>';
  if (c.before) return head + '<div class="srm__b mx-b"><div class="mx-det"><p class="st-note">' + stEsc(c.per.label) + ' is before your purchase (' + stDate(_srBought(c.p)) + '). The seller settles this period.</p></div></div>';
  const d = _srEnsureDraft(c), rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt), hv = _srHvState(c, rec, sum);
  const mail = c.verw && c.verw.hv_email ? String(c.verw.hv_email).trim() : '';
  const U = [], N = [];
  (d.positions || []).forEach((p, i) => { if (!_srIsNkOnly(p)) (p.u ? U : N).push([p, i]); });
  const tot = arr => cxR(arr.reduce((t, [p]) => t + _srSigned(p, _srAmtOf(d, p, c.apt)), 0));
  const tu = tot(U), tn = tot(N), tt = cxR(tu + tn);
  const wDir = d.weg_direction === null || d.weg_direction === undefined ? null : Number(d.weg_direction);
  const wAmt = _srNum(d.weg_amount);
  const jaDone = _srJaDone(rec, sum), settled = hv.k === 'fertig';
  // ── the result (on top)
  const seg = '<div class="mx-seg" role="group" aria-label="Result with the WEG">' + [[-1, 'Nachzahlung', 'p'], [1, 'Guthaben', 'g'], [0, 'balanced', 'z']].map(([v, t, k]) =>
    '<button type="button" class="' + (wDir === v ? 'is-on is-' + k : '') + '" data-sr="wegDir" data-v="' + v + '" aria-pressed="' + (wDir === v) + '">' + t + '</button>').join('') + '</div>';
  const amtF = wDir ? '<div class="mx-hf"><label class="mx-f"><span>Amount per HV</span><span class="mx-amt"><input inputmode="decimal" data-srf="weg_amount" value="' + stEsc(_srE2in(d.weg_amount)) + '" placeholder="0,00"/><em>€</em></span></label>' +
    '<label class="mx-f"><span>Due</span><input type="date" data-srf="weg_due" value="' + stEsc(_srD(d.weg_due) || '') + '"/></label></div>' : '';
  const hero = stMHero({ tone: wDir === 1 ? 'get' : wDir === -1 ? 'pay' : wDir === 0 ? 'zero' : 'none',
    label: wDir === 1 ? (settled ? 'The WEG paid you' : 'The WEG pays you') : wDir === -1 ? (settled ? 'You paid the WEG' : 'You pay the WEG') : wDir === 0 ? 'Balanced with the WEG' : 'Result of the Jahresabrechnung',
    amount: wDir === null ? null : wDir === 0 ? 0 : wAmt,
    sub: wDir === null ? 'choose what the HV says' : wDir && d.weg_due ? 'due ' + stDate(d.weg_due) : '',
    extra: seg + amtF, settled });
  // ── switch rows
  const recvSub = hv.received ? (d.hv_date ? 'statement ' + stDate(d.hv_date) : 'add the statement date below') :
    (c.running ? 'period runs until ' + stDate(c.per.to) : (hv.k === 'ueberfaellig' ? '<b class="neg">overdue</b> · ' : '') + 'expected ' + (hv.exp ? '~' + stEsc(hv.exp.label) : '–') + (hv.asked.length ? ' · asked ' + hv.asked.map(stDM).join(', ') : ''));
  const ask = !hv.received && mail && !c.running ? '<a class="mx-pill" data-sr="ask" data-k="' + stEsc(c.ck) + '" href="' + stEsc(_srAskMail(c, hv, mail)) + '"><i class="ti ti-mail" aria-hidden="true"></i>Ask HV</a>' : '';
  const rowRecv = stMRow({ icon: 'inbox', title: 'Jahresabrechnung received', sub: recvSub, on: !!hv.received,
    right: ask + '<input class="mx-date" type="date" data-srf="received_on" aria-label="Received on" value="' + stEsc(_srD(d.received_on) || '') + '"/>',
    below: '<div class="mx-sub2"><label class="mx-f mx-f--row"><span>Statement date</span><input type="date" data-srf="hv_date" value="' + stEsc(_srD(d.hv_date) || '') + '"/></label></div>' });
  let rowMoney = '';
  if (wDir !== 0) {
    const x = _srSetCtx(c.ck, null, true), res = x && x.st && x.st.res, b = x && x.st && x.st.booking;
    const missing = [!(d.received_on || d.hv_date) ? 'received date' : '', !d.hv_date ? 'statement date' : '', !sum.n || sum.missing ? 'costs' : '', wDir === null ? 'result' : wDir && !(wAmt > 0) ? 'amount' : ''].filter(Boolean);
    const can = jaDone && !!res;
    const sub = settled ? (b ? (wDir > 0 ? 'received ' : 'paid ') + stDate(b.invoice_date) + ' · ' + stEur(cxR(b.amount)) : 'settled')
      : !can ? 'first add: ' + (missing.join(' · ') || 'the result') : 'flip it when it’s ' + (wDir > 0 ? 'on your account' : 'paid');
    const payBox = (can || settled) ? _srPayFields('w', c.ck, null, b ? _srD(b.invoice_date) : cxToday(), b ? cxR(b.amount) : (res ? res.amount : wAmt), true) : '';
    rowMoney = stMRow({ icon: 'coins', title: wDir < 0 ? 'Money paid' : 'Money received', sub: stEsc(sub), on: settled, disabled: !can && !settled,
      switchAttrs: settled ? 'data-sr="setUndo" data-k="' + stEsc(c.ck) + '" data-w="1"' : 'data-sr="payOnW" data-k="' + stEsc(c.ck) + '"', below: payBox });
  }
  // ── costs (summary; all rows editable behind "Show all costs")
  const hgPaid = _srNum(d.keys.hg_paid) ?? _srHausgeldPaid(c);
  const calc = cxR(tt - hgPaid), entered = wDir === null ? null : cxR(wDir === 0 ? 0 : -wDir * (wAmt || 0)), diff = entered === null ? null : cxR(calc - entered);
  const mx = Math.max(Math.abs(tu) + Math.abs(tn), 1);
  let costs = '<div class="mx-mini"><i style="flex:' + Math.max(1, Math.abs(tu) / mx * 100) + ';background:#9DBF7A"></i><i style="flex:' + Math.max(1, Math.abs(tn) / mx * 100) + ';background:#E8C98F"></i></div>' +
    '<div class="mx-dr"><span class="mx-d" style="background:#9DBF7A"></span><span>Umlagefähig<small>goes into the tenants’ NK</small></span><span class="mx-a" data-sr-tot="u">' + stEur(tu) + '</span></div>' +
    '<div class="mx-dr"><span class="mx-d" style="background:#E8C98F"></span><span>Nicht umlagefähig<small>Verwaltung, Rücklage …</small></span><span class="mx-a" data-sr-tot="n">' + stEur(tn) + '</span></div>' +
    '<div class="mx-dr is-b"><span class="mx-d"></span><span>Total</span><span class="mx-a" data-sr-tot="t">' + stEur(tt) + '</span></div>';
  if (SR.costsOpen) {
    const row = ([p, i]) => {
      const k = _srKind(p.kind), custom = p.kind === 'sonst' || p.kind === 'nu_sonst';
      const calcA = _srNum(p.amount) === null ? _srUnitAmt(d, p, c.apt) : null;
      const name = custom ? '<input class="mx-name" list="srKindList" data-srf="pos.' + i + '.label" placeholder="Name" value="' + stEsc(p.label || '') + '"/>' : '<span>' + stEsc(p.label || k.l) + '</span>';
      return '<div class="mx-er">' + name + '<span class="mx-amt"><input inputmode="decimal" enterkeyhint="next" autocomplete="off" data-srf="pos.' + i + '.amount" aria-label="' + stEsc(p.label || k.l) + '" placeholder="' + stEsc(calcA !== null ? cxE2(Math.abs(calcA)) : '') + '" value="' + stEsc(_srE2in(p.amount)) + '"/><em>€</em></span></div>';
    };
    const grp = (arr, u, label) => '<p class="mx-grp">' + label + '</p>' + (arr.map(row).join('') || '<p class="st-hint">No rows yet.</p>') +
      '<button class="mx-add" data-sr="rowAdd" data-u="' + (u ? 1 : 0) + '"><i class="ti ti-plus" aria-hidden="true"></i> Add a cost</button>';
    costs += '<div class="mx-edit">' + grp(U, true, 'Umlagefähig') + grp(N, false, 'Nicht umlagefähig') +
      '<datalist id="srKindList">' + SR_KINDS.map(k => '<option value="' + stEsc(k.l) + '"></option>').join('') + '</datalist>' +
      '<div class="mx-er"><span>− Hausgeld Soll <small>per Rentals</small></span><span class="mx-amt"><input inputmode="decimal" data-srf="keys.hg_paid" aria-label="Hausgeld Soll" value="' + stEsc(cxE2(hgPaid)) + '"/><em>€</em></span></div>' +
      '<div class="mx-er is-b"><span>= calculated <span data-sr-tot="cl">' + (calc > 0 ? 'Nachzahlung' : calc < 0 ? 'Guthaben' : 'balanced') + '</span></span><span data-sr-tot="c">' + stEur(Math.abs(calc)) + '</span></div>' +
      (diff === null ? '' : Math.abs(diff) < 0.01 ? '<p class="mx-ok"><i class="ti ti-check" aria-hidden="true"></i> matches the HV result</p>' : '<p class="mx-ok is-warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> HV says ' + stEur(Math.abs(entered)) + ' – difference ' + stEur(Math.abs(diff)) + '</p>') +
      _srIstHint(c, hgPaid) + '</div>';
  }
  costs += '<button class="mx-lnk" data-sr="costs">' + (SR.costsOpen ? 'Hide the costs' : 'Show all ' + (U.length + N.length) + ' costs · edit') + '</button>';
  // ── settings (period · expected month) — folded at the end
  const expTxt = Number(c.p.hv_expected_month) ? SR_MON[Number(c.p.hv_expected_month) - 1] : '—';
  const settings = '<details class="mx-set"' + (SR.expEdit || ST.perEdit === c.p.id ? ' open' : '') + '><summary>Settings · period ' + stEsc(stDM(c.per.from) + '–' + stDM(c.per.to)) + ' · HV usually sends in ' + stEsc(expTxt) + '</summary>' +
    _stPeriodRow(c.p) +
    (SR.expEdit ? '<div class="sr-exp"><span>HV usually sends in</span><span class="cx-f cx-f--l sr-sel"><select id="srExpM" aria-label="Month"><option value="">—</option>' + SR_MON.map((mm, i) => '<option value="' + (i + 1) + '"' + (Number(c.p.hv_expected_month) === i + 1 ? ' selected' : '') + '>' + mm + '</option>').join('') + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></span><button class="cx-link" data-sr="expCancel">Cancel</button><button class="cx-link sr-acc" data-sr="expSave">Save</button></div>'
                : '<div class="sr-exp"><span>HV usually sends in</span><b>' + stEsc(expTxt) + '</b><button class="cx-link" data-sr="expEdit">Change</button></div>') +
    '<div class="sr-grid2" style="margin-top:8px">' + _srDateF('per_from', d.period_from, 'This Abrechnung from') + _srDateF('per_to', d.period_to, 'to') + '</div>' +
    '<p class="st-hint">Only change the dates if the HV settles a different period (max. 12 months).</p></details>';
  return head + '<div class="srm__b mx-b">' + hero + '<div class="mx-rows">' + rowRecv + rowMoney + '</div>' +
    stMCard('Costs in the Jahresabrechnung', 'receipt', costs) + settings +
    '<p class="mx-saved" id="srSaved">' + (SR.dirty ? '' : (rec ? '✓ saved automatically' : '')) + '</p></div>';
}
function _srSteps(names, cur) {
  return '<div class="sr-steps">' + names.map((n, i) => '<span class="sr-step' + (i < cur ? ' is-done' : i === cur ? ' is-cur' : '') + '"><i></i>' + stEsc(n) + '</span>').join('') + '</div>';
}
/* E-mail to the HV: the Guthaben of the Jahresabrechnung has not arrived */
function _srRemindMail(c, rec, to) {
  const s = (typeof appSettings !== 'undefined' && appSettings) || {};
  const apt = c.apt || {};
  const obj = [apt.adresse, stWhg(apt.wohnungsnummer), apt.plz_ort].filter(Boolean).join(', ') || c.p.name;
  const subj = 'Guthaben aus der Hausgeld-Jahresabrechnung ' + _srPerLabel(c.per.from, c.per.to) + ' – ' + obj;
  const body = 'Sehr geehrte Damen und Herren,\n\nlaut Hausgeld-Jahresabrechnung ' + _srPerLabel(c.per.from, c.per.to) + (rec.hv_date ? ' vom ' + cxFmtDate(rec.hv_date) : '') +
    ' ergibt sich für meine Wohnung ' + obj + ' ein Guthaben von ' + stEur(_srNum(rec.weg_amount) || 0) + (rec.weg_due ? ', fällig zum ' + cxFmtDate(rec.weg_due) : '') +
    '.\n\nBei mir ist der Betrag bisher nicht eingegangen. Ich bitte um Überweisung bzw. um eine kurze Nachricht, wann ich damit rechnen kann.\n\nMit freundlichen Grüßen\n' + (s.vermieter_name || '');
  return 'mailto:' + encodeURIComponent(to).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
}

/* Saves by itself: the draft of this Wohnung (Jahresabrechnung and NK costs) a moment after the last change */
let _srAutoT = null;
function _srSavedTxt(t) { const el = document.getElementById('srSaved'); if (el) el.textContent = t; }
function _srAutoQueue() {
  if (!SR.modal || !SR.draft || !['hv', 'nk'].includes(SR.modal.view)) return;
  SR.dirty = true; _srSavedTxt('saving …');
  clearTimeout(_srAutoT); _srAutoT = setTimeout(_srAutoSave, 900);
}
async function _srAutoFlush() { if (_srAutoT) { clearTimeout(_srAutoT); await _srAutoSave(); } }
function _srCleanRec(d, c) {
  const clean = JSON.parse(JSON.stringify(d)); delete clean._ck;
  clean.positions = (clean.positions || []).filter(p => p.kind && (_srNum(p.amount) !== null || _srUnitAmt(clean, Object.assign({}, p, { amount: null }), c.apt) !== null))
    .map(p => { if (p.label) { const k = SR_KINDS.find(x => x.l.toLowerCase() === String(p.label).toLowerCase()); if (k) { p.kind = k.k; p.u = k.u; p.label = null; } } return p; });
  if (!clean.weg_direction) { clean.weg_amount = null; clean.weg_due = null; }
  if (clean.weg_direction && !clean.weg_via) clean.weg_via = 'zahlung';
  clean.keys = Object.assign({}, clean.keys || {}, { ja_v: 2 });
  const hgDef = _srHausgeldPaid(c);
  if (_srNum(clean.keys.hg_paid) !== null && Math.abs(_srNum(clean.keys.hg_paid) - hgDef) < 0.005) clean.keys.hg_paid = null;
  return clean;
}
async function _srAutoSave() {
  _srAutoT = null;
  const d = SR.draft, c = SR.modal && _srCards[SR.modal.ck]; if (!d || !c) return;
  _srCollect();
  if (!d.period_from || !d.period_to || d.period_to < d.period_from || _srDays(d.period_from, d.period_to) > 366) { _srSavedTxt('check the period'); return; }
  const wasDone = _srJaDone(_srRec(c.p, c.per), _srRecSummary(_srRec(c.p, c.per), c.apt));
  try {
    const clean = _srCleanRec(d, c);
    if (!(d.keys || {}).ja_v && !wasDone) clean.keys.ja_done = null;
    {                                                               // Oct 2026: complete by itself once dates, costs and the WEG result are in
      const sm = _srRecSummary(clean, c.apt), wd = clean.weg_direction;
      const ready = !!(clean.received_on || clean.hv_date) && !!clean.hv_date && sm.n && !sm.missing && wd !== null && wd !== undefined && (Number(wd) === 0 || _srNum(clean.weg_amount) > 0);
      if (ready && !wasDone && !clean.keys.ja_done) { clean.keys.ja_v = 2; clean.keys.ja_done = cxToday(); }
    }
    if (wasDone && !clean.keys.ja_done) clean.keys.ja_done = (d.keys || {}).ja_done || cxToday();   // an older complete record stays complete
    const saved = await srSaveRow(clean);
    d.id = saved.id; d.keys = Object.assign({}, d.keys, { ja_v: 2, ja_done: saved.keys && saved.keys.ja_done || null });
    if (_srJaDone(saved, _srRecSummary(saved, c.apt))) await _srWriteWeg(c, saved);    // after "complete": the WEG result follows your edits
    SR.dirty = false; _srSavedTxt('✓ saved');
    ctlSettlementInvalidate();
  } catch (err) { _srSavedTxt('not saved'); stSay('Could not save — ' + (err.message || err)); }
}
/* Mark complete: every entry is in → the WEG result goes to the tracker, the NK can start */
async function _srJaComplete(btn) {
  _srCollect();
  const d = SR.draft, c = _srCards[SR.modal.ck]; if (!d || !c) return;
  const clean = _srCleanRec(d, c), sm = _srRecSummary(clean, c.apt);
  if (!clean.received_on && !clean.hv_date) { stSay('Enter the date you received the Jahresabrechnung'); return; }
  if (!clean.hv_date) { stSay('Enter the statement date'); return; }
  if (!sm.n || sm.missing) { stSay('Enter the amounts of the Kosten first'); return; }
  if (clean.weg_direction === null || clean.weg_direction === undefined) { stSay('Choose the WEG result: Nachzahlung, Guthaben or balanced'); return; }
  if (clean.weg_direction && !(_srNum(clean.weg_amount) > 0)) { stSay('Enter the amount of the WEG result'); return; }
  clearTimeout(_srAutoT); _srAutoT = null;
  d.keys = Object.assign({}, d.keys || {}, { ja_v: 2, ja_done: (d.keys || {}).ja_done || cxToday() });
  SR.jaEdit = false;
  await _srHvSave4(btn);
  SR.dirty = false;
}

/* ── Window B · NK-Abrechnung (you ↔ tenants): umlagefähige Hausgeld costs (ticked) + NK-only costs · tenants ── */
function _srNkView(c) {
  const title = 'NK-Abrechnung ' + c.per.label;
  if (c.before) return _srHead4(title, c.p.name) + '<div class="srm__pickwrap">' + _srPicker(c) + '</div><div class="srm__b"><div class="srm__card"><p class="st-note">' + stEsc(c.per.label) + ' is before your purchase (' + stDate(_srBought(c.p)) + '). The seller settles this period with the tenants.</p></div></div>';
  const d = _srEnsureDraft(c), rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt);
  const change = _srTenantChange(c);
  const HV = [], X = [];
  (d.positions || []).forEach((p, i) => { if (_srIsNkOnly(p)) X.push([p, i]); else if (p.u) HV.push([p, i]); });
  const hvReady = _srJaDone(rec, sum) && HV.some(([p]) => _srAmtOf(d, p, c.apt) !== null);
  let costCard;
  if (!hvReady) {
    costCard = '<section class="srm__card"><div class="srm__ch"><p class="srm__ct">Costs</p></div>' +
      '<p class="st-note">The NK starts once the Hausgeld-Jahresabrechnung ' + stEsc(c.per.label) + ' is complete – its umlagefähige costs come over by themselves.</p>' +
      '<div><button class="cx-btn cx-btn--s" data-sr="toHv">Open the Jahresabrechnung</button></div></section>';
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
        '<button class="ct-add" data-sr="toHv"><i class="ti ti-pencil" aria-hidden="true"></i> Amounts are in the Jahresabrechnung</button></div>' +
      '<div class="ct"><div class="ct-h"><span class="st-f__l">NK only · not in the Hausgeld</span><b data-sr-tot="x">' + stEur(tX) + '</b></div>' + (xRows || '<p class="st-hint" style="margin:8px 0 0">e.g. Grundsteuer, which is billed to you directly.</p>') +
        '<div class="ct-adds">' + (!hasGs && gsQ ? '<button class="ct-add" data-sr="nkGs"><i class="ti ti-plus" aria-hidden="true"></i> Grundsteuer from Rentals</button>' : '') +
        '<button class="ct-add" data-sr="nkAdd"><i class="ti ti-plus" aria-hidden="true"></i> Add cost</button></div></div>' +
      '<div class="ct-tot"><span>Total for the NK</span><b data-sr-tot="nk">' + stEur(cxR(tHv + tX)) + '</b></div>' +
      '<datalist id="srKindList">' + SR_KINDS.filter(k => k.u).map(k => '<option value="' + stEsc(k.l) + '"></option>').join('') + '</datalist>' +
    '</section>';
  }
  const tenCard = '<section class="srm__card" id="srNkTens">' + _srNkTens(c, d, rec, hvReady) + '</section>';
  return stMHead(title, c.p.name + ' · you ↔ tenants', 'receipt', 'data-sr="close"') + '<div class="srm__pickwrap">' + _srPicker(c) + '</div>' +
    '<div class="srm__b"><div class="srm__cols">' + costCard + tenCard + '</div>' +
    (hvReady ? '<p class="sr-saved sr-saved--b" id="srSaved">' + (SR.dirty ? '' : '✓ saved') + '</p>' : '') + '</div>';
}
/* The tenants of the NK window — previews follow the draft, so a change shows at once */
function _srNkTens(c, d, rec, hvReady) {
  const calcRec = hvReady ? d : rec, sumOk = hvReady;
  const tens = c.items.map(it => {
    const ti = _srTenInfo(c, it, calcRec, sumOk), id = String(ti.l.id);
    const v = ti.skipped ? null : ti.st.res ? ti.st.res.dir * ti.st.res.amount : ti.x && !ti.x.missing ? ti.x.saldo : null;
    const res = v === null ? '' : '<b class="' + (v < 0 ? 'is-g' : '') + '">' + stEur(Math.abs(v)) + '</b><small>' + (v > 0 ? 'Nachzahlung' : v < 0 ? 'Guthaben' : 'balanced') + '</small>';
    const pill = ti.kind === 'pausch' ? (ti.skipped ? ['ok', 'no NK'] : ['grey', 'Pauschal']) : ti.kind === 'unlinked' ? ['grey', 'no tenant'] :
      ti.skipped ? ['grey', 'skipped'] : ti.k === 'settled' ? ['ok', 'settled'] : ti.k === 'sent' ? ['beige', 'sent ' + stDM(ti.st.res.date)] : ti.k === 'open' ? ['beige', 'letter ready'] : ['grey', 'waiting'];
    const sub = stDM(ti.l.from) + '–' + stDate(ti.l.to) + ' · ' + _srDays(ti.l.from, ti.l.to) + ' days' + (ti.skipped ? ' · tap to undo' : '');
    const act = ti.kind === 'pausch' && !ti.skipped ? 'data-sr="nd" data-id="' + stEsc(id) + '"' : ti.kind === 'ten' ? 'data-sr="openTen" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(id) + '"' : '';
    return '<button class="sr-tenrow" ' + act + (act ? '' : ' disabled') + '><span class="sr-tenrow__m"><span class="sr-tenrow__n">' + stEsc(ti.name) + '</span><span class="sr-tenrow__s">' + stEsc(ti.kind === 'pausch' && !ti.skipped ? 'Pauschal · tap to mark as no NK' : sub) + '</span></span>' +
      '<span class="sr-tenrow__r">' + res + cxPill(pill[0], pill[1]) + '</span></button>';
  }).join('') || '<p class="st-hint">No tenant with Kalt + NK in this period.</p>';
  return '<div class="srm__ch"><p class="srm__ct">Tenants</p><span class="srm__cs">tap to open</span></div>' + tens;
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
  const hgEl = document.querySelector('#srPanel [data-srf="keys.hg_paid"]');
  if (hgEl) {
    const cl = cxR(t.u + t.n - (cxParse(hgEl.value) || 0));
    set('c', Math.abs(cl));
    const w = document.querySelector('#srPanel [data-sr-tot="cl"]'); if (w) w.textContent = cl > 0 ? 'Nachzahlung' : cl < 0 ? 'Guthaben' : 'balanced';
  }
}

/* View 2 · one tenant */
/* Money switch fields (Oct 2026): the day the money moved + the amount — used when switching on, editable afterwards.
   kind 'w' = WEG · 't' = tenant · amount only for a bank transfer (rent / Kaution: the date only) */
function _srPayFields(kind, ck, tid, date, amount, withAmt) {
  const at = 'data-k="' + stEsc(ck) + '"' + (tid ? ' data-id="' + stEsc(tid) + '"' : '') + (kind === 'w' ? ' data-w="1"' : '');
  return '<div class="mx-pay">' +
    '<label class="mx-f"><span>On</span><input type="date" data-srpay="date" ' + at + ' value="' + stEsc(date || '') + '"/></label>' +
    (withAmt ? '<label class="mx-f"><span>Amount</span><span class="mx-amt"><input inputmode="decimal" autocomplete="off" data-srpay="amt" ' + at + ' value="' + stEsc(cxE2(amount || 0)) + '"/><em>€</em></span></label>' : '') + '</div>';
}
const _srPayVal = f => { const el = document.querySelector('#srPanel [data-srpay="' + f + '"]'); return el ? el.value : null; };
/* A change in the fields after the switch is on: the same booking moves / changes (never a second one) */
async function _srPayEdit(el) {
  const weg = el.dataset.w === '1', x = _srSetCtx(el.dataset.k, weg ? null : el.dataset.id, weg);
  if (!x || !x.st || !x.st.res || x.st.k !== 'erledigt') return;                 // not settled yet: used when you flip the switch
  const date = _srD(_srPayVal('date')) || cxToday(), res = x.st.res;
  if (!weg && res.via && res.via !== 'zahlung') {
    try { await _stConfirmSettled(x.l, res.via, date); } catch (err) { stSay('Could not save — ' + (err.message || err)); return; }
    ctlSettlementInvalidate(); stSay('Date saved'); _srAfterSettle(x); return;
  }
  await _srSetAmount(el.dataset.k, weg ? null : el.dataset.id, weg, _srPayVal('amt') ?? cxE2(res.amount), null, date);
}

function _srTenView(c) {
  // Oct 2026 · one level: amount on top · "Letter sent" and "Paid back / Received" as switches · details below
  const rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt);
  const it = c.items.find(x => String(x.r.id) === String(SR.modal.tid));
  if (!it) return stMHead('Tenant', '', 'calc', 'data-sr="close"') + '<div class="srm__b mx-b"><p class="cx-empty">Not found.</p></div>';
  const ti = _srTenInfo(c, it, rec, sum.ok && (_srJaDone(rec, sum) || !!_srLine(c, it).state.res)), x = ti.x;
  const ini = String(ti.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const first = String(ti.name || '').split(/\s+/)[0] || ti.name;
  const head = stMHead(ti.name, c.p.name + ' · NK ' + c.per.label, { ini, bg: '#F6E3E3', fg: '#8A4040' }, 'data-sr="close"');
  if (!x) return head + '<div class="srm__b mx-b">' + stMHero({ tone: 'none', label: 'NK-Abrechnung ' + c.per.label, amount: null, sub: 'calculated once the Hausgeld-Jahresabrechnung is complete' }) + '</div>';
  const idAttr = 'data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(String(ti.l.id)) + '"';
  if (ti.skipped) {
    return head + '<div class="srm__b mx-b">' + stMHero({ tone: 'zero', label: 'This NK is skipped', amount: null, sub: 'no letter and no result – it counts as done' + (ti.ts.settle_note ? ' · ' + ti.ts.settle_note : '') }) +
      '<div class="mx-rows">' + stMRow({ icon: 'doc', title: 'Skipped', sub: 'bring it back to calculate it again', on: true, switchAttrs: 'data-sr="setUndo" ' + idAttr }) + '</div></div>';
  }
  const ts = x.ts, sent = !!ti.st.res, settledT = ti.k === 'settled', date = ts.date || cxToday(), days = _srNum(ts.days) ?? 30, via = _srViaOf(x);
  SR.sign = _srSign(x);
  const perC = _srPer(c, rec);
  const v = sent ? ti.st.res.dir * ti.st.res.amount : x.saldo;           // > 0 the tenant pays you
  const hero = stMHero({ tone: v > 0.004 ? 'get' : v < -0.004 ? 'pay' : 'zero',
    label: v > 0.004 ? first + (settledT ? ' paid you' : ' pays you') : v < -0.004 ? first + (settledT ? ' got back' : ' gets back') : 'All even',
    amount: Math.abs(v) < 0.005 ? 0 : v, sub: x.missing ? 'some costs are still missing' : '', settled: settledT });
  // ── switches
  const rowLetter = stMRow({ icon: 'mail', title: 'Letter sent', on: sent, disabled: !!x.missing && !sent,
    sub: sent ? 'sent ' + stDate(ti.st.res.date) : 'Frist ' + stDate(perC.frist),
    right: '<button type="button" class="mx-pill" data-sr="pdf" data-cc-pdf="1"' + (x.missing ? ' disabled' : '') + '>' + stIc('doc', 15) + 'PDF</button>',
    switchAttrs: sent ? 'data-sr="reopen"' : 'data-sr="send"' });
  let rowMoney = '';
  if (Math.abs(v) >= 0.005) {
    const how = { zahlung: 'bank transfer', miete: 'with the rent', kaution: 'via Kaution' };
    const resVia = sent ? (ti.st.res.via || 'zahlung') : via;
    const b = ti.st.booking;
    const sub = settledT ? stEsc(_srSettledTxt(ti, false) || 'settled') : !sent ? 'after the letter · ' + how[resVia] : 'open · ' + how[resVia];
    const ways = !sent ? '<div class="mx-ways">' + [['zahlung', 'bank', 'bank transfer'], ['miete', 'house', 'with the rent'], ['kaution', 'safe', 'via Kaution']].map(([k, ic, l]) =>
      '<button type="button" class="' + (via === k ? 'is-on' : '') + '" data-sr="via" data-v="' + k + '" aria-pressed="' + (via === k) + '">' + stIc(ic, 18) + l + '</button>').join('') + '</div>' : '';
    const payBox = sent ? _srPayFields('t', c.ck, String(ti.l.id), b ? _srD(b.invoice_date) : (_srD(it.r.paid_date) || cxToday()), b ? cxR(b.amount) : ti.st.res.amount, resVia === 'zahlung') : '';
    rowMoney = stMRow({ icon: 'coins', title: v > 0 ? 'Received' : 'Paid back', sub, on: settledT, disabled: !sent,
      switchAttrs: settledT ? 'data-sr="setUndo" ' + idAttr : 'data-sr="payOn" ' + idAttr, below: ways + payBox });
  }
  const late = !sent && perC.frist && date > perC.frist && x.saldo > 0;
  // ── calculation (period · share · Vorauszahlungen · per item)
  const since = _srBought(c.p);
  const perRow = SR.perEdit && !sent
    ? '<div class="sr-peredit"><div class="sr-grid2"><label class="st-f"><span class="st-f__l">From</span><input class="st-in" type="date" id="srTpF" value="' + stEsc(_srD(it.r.period_from)) + '"/></label>' +
      '<label class="st-f"><span class="st-f__l">To</span><input class="st-in" type="date" id="srTpT" value="' + stEsc(_srD(it.r.period_to)) + '"/></label></div>' +
      '<div class="sr-peredit__b"><button class="cx-link" data-sr="tenPerCancel">Cancel</button><button class="cx-link sr-acc" data-sr="tenPerSave">Save</button></div></div>'
    : '<div class="mx-dr"><span class="mx-d" style="background:#D7CCEA"></span><span>Period<small>' + x.tDays + ' days · a change applies to this NK only</small></span><span class="mx-a">' + stEsc(stDM(x.from) + '–' + stDate(x.to)) + (sent ? '' : ' <button class="cx-link sr-inl" data-sr="tenPerEdit">edit</button>') + '</span></div>';
  const vzSrc = x.vzOv !== null ? (x.vzSoll !== null && Math.abs(x.vzOv - x.vzSoll) < 0.005 ? 'per contract' : 'by hand') : x.vzIst !== null ? 'paid per Controlling' : 'per contract';
  const vzAlt = [];
  if (!sent && x.vzIst !== null && (x.vzOv !== null || Math.abs(x.vz - x.vzIst) >= 0.01)) vzAlt.push(['ist', 'Controlling ' + stEur(x.vzIst)]);
  if (!sent && x.vzSoll !== null && Math.abs(x.vz - x.vzSoll) >= 0.01) vzAlt.push(['soll', 'Contract ' + stEur(x.vzSoll)]);
  let lines = '';
  for (const ln of x.lines) {
    const label = ln.pos.label || _srKind(ln.pos.kind).l, direct = ln.pos.split === 'mieter';
    const small = direct ? 'per tenant · Zwischenablesung' : x.partial ? stEur(ln.unit ?? 0) + ' × ' + x.tDays + '/' + x.perDays + ' days' : 'Kosten der Wohnung';
    lines += '<div class="sr-cl"><span class="sr-cl__t">' + stEsc(label) + '<small>' + stEsc(small) + '</small></span>' +
      (direct && !sent ? '<label class="cx-f sr-in-s"><input type="text" inputmode="decimal" data-srt="direct.' + stEsc(ln.pos.id) + '" value="' + stEsc(_srE2in(ts.direct && ts.direct[ln.pos.id])) + '" aria-label="' + stEsc(label) + ' for this tenant"><span>€</span></label>'
                       : '<span class="sr-cl__v">' + (ln.amt === null ? '<em class="sr-miss">missing</em>' : stEur(ln.amt)) + '</span>') + '</div>';
  }
  const calc = perRow +
    (since && perC.from < since && x.from >= since && !sent ? '<p class="sr-hint2">Bought on ' + stDate(since) + ': if ' + stEsc(ti.name) + ' already lived there before, extend the period to ' + stDM(perC.from) + ' – the NK covers the whole year.</p>' : '') +
    '<div class="mx-dr"><span class="mx-d" style="background:#E8C98F"></span><span>Costs<small>' + stEsc(first) + '’s share · ' + x.lines.length + ' items</small></span><span class="mx-a" data-sr-sum>' + stEur(x.sum) + '</span></div>' +
    '<div class="mx-dr"><span class="mx-d" style="background:#A9BFD3"></span><span>− Vorauszahlungen<small>' + stEsc(vzSrc) + (sent ? '' : ' · editable') + '</small></span>' +
      (sent ? '<span class="mx-a">' + stEur(x.vz) + '</span>' : '<label class="cx-f sr-in-s"><input type="text" inputmode="decimal" data-srt="vz" value="' + stEsc(cxE2(x.vz)) + '" aria-label="Vorauszahlungen"><span>€</span></label>') + '</div>' +
    (vzAlt.length ? '<div class="sr-vzalt"><span>use instead:</span>' + vzAlt.map(([k, t]) => '<button class="sr-vzalt__b" data-sr="vzUse" data-v="' + k + '">' + stEsc(t) + '</button>').join('') + '</div>' : '') +
    (x.pre ? '<p class="sr-hint2">Before the purchase (' + stDM(x.pre.from) + '–' + stDate(x.pre.to) + '): ' + stEur(x.pre.soll) + ' per contract – check with the seller.</p>' : '') +
    '<div class="mx-dr is-b"><span class="mx-d" style="background:' + (x.saldo < 0 ? '#D9785E' : '#9DBF7A') + '"></span><span>= ' + (x.saldo > 0 ? first + ' pays you' : x.saldo < 0 ? first + ' gets back' : 'all even') + '</span><span class="mx-a" data-sr-res>' + stEur(Math.abs(x.saldo)) + '</span></div>' +
    '<details class="mx-more"' + (x.missing ? ' open' : '') + '><summary>Breakdown per item</summary><div class="sr-calc">' + lines + '</div></details>' +
    (x.einbehalt > 0 ? '<div class="mx-dr"><span class="mx-d" style="background:#D7CCEA"></span><span>Kaution held back<small>' + (cxR(x.einbehalt - x.saldo) >= 0 ? 'pay back to the tenant ' : 'tenant still pays ') + stEur(Math.abs(cxR(x.einbehalt - x.saldo))) + '</small></span><span class="mx-a">' + stEur(x.einbehalt) + '</span></div>' : '') +
    (sent ? '' : '<div data-sr-check>' + _srCheckHtml(c, it, rec, x) + '</div>');
  // ── letter details (fields always here, folded) · payment details once sent
  let letter = '';
  if (!sent) {
    const addr = ts.addr !== undefined && ts.addr !== null ? ts.addr : _srDefaultAddr(c, it, x);
    const isNach = x.saldo > 0, moved = _srMovedOut(ti.t);
    letter = '<details class="mx-more"' + (SR.briefOpen ? ' open' : '') + '><summary>Letter details · ' + stEsc(addr.split('\n').filter(Boolean).slice(0, 2).join(', ') || 'address missing') + ' · ' + stDate(date) + '</summary><div class="st-form">' +
      '<label class="st-f"><span class="st-f__l">Address' + (moved ? ' (new address after moving out)' : '') + '</span><textarea class="st-in sr-ta" rows="3" data-srt="addr">' + stEsc(addr) + '</textarea></label>' +
      (!isNach && x.saldo ? '<label class="st-f"><span class="st-f__l">Tenant IBAN · for the Guthaben (optional)</span><input class="st-in" data-srt="iban" value="' + stEsc(ts.iban || '') + '" placeholder="DE…"/></label>' : '') +
      '<div class="sr-grid2"><label class="st-f"><span class="st-f__l">Date</span><input class="st-in" type="date" data-srt="date" value="' + stEsc(date) + '"/></label>' +
        '<label class="st-f"><span class="st-f__l">Payment term (days)</span><input class="st-in" inputmode="numeric" data-srt="days" value="' + days + '"/></label></div>' +
      (!moved ? '<div class="sr-grid2"><label class="st-f"><span class="st-f__l">New NK / month (optional)</span><span class="st-amt"><input class="st-in" inputmode="decimal" data-srt="new_vz" value="' + stEsc(_srE2in(ts.new_vz)) + '"/><span>€</span></span></label>' +
        '<label class="st-f"><span class="st-f__l">from</span><input class="st-in" type="date" data-srt="new_vz_from" value="' + stEsc(ts.new_vz_from || '') + '"/></label></div>' : '') +
      '<label class="st-f"><span class="st-f__l">Anlage</span><input class="st-in" data-srt="anlagen" value="' + stEsc(ts.anlagen !== undefined && ts.anlagen !== null ? ts.anlagen : _srDefaultAnlagen(rec)) + '"/></label></div></details>';
  }                                                                 // payment date + amount sit right under the money switch (Oct 2026)
  return head + '<div class="srm__b mx-b">' + hero + '<div class="mx-rows">' + rowLetter + rowMoney + '</div>' +
    (late ? '<div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> The Frist (' + stDate(perC.frist) + ') has passed: a Nachzahlung can no longer be claimed; a Guthaben must still be paid.</div>' : '') +
    stMCard('Calculation', 'calc', calc + letter) +
    (sent ? '' : '<button class="mx-skip" data-sr="settle" ' + idAttr + ' data-skip="1">Skip this NK-Abrechnung</button>') + '</div>';
}

/* View 3 · settle one line (tenant NK or WEG result) — the same settle line as in the Tenants / Hausgeld sheets */
function _srSettleView(c) {
  const m = SR.modal, weg = !!m.weg, x = _srSetCtx(c.ck, m.tid, weg);
  if (!x) return _srHead4('Settle', '', 'back') + '<div class="srm__b"><p class="cx-empty">Not found.</p></div>';
  const title = 'Settle – ' + (weg ? 'Hausgeld · WEG' : x.ti.name), sub = (weg ? 'Hausgeld ' : 'NK ') + c.per.label + ' · ' + c.p.name;
  let body;
  if (x.ti && x.ti.skipped) {
    body = '<div class="srm__state is-ok"><span><i class="ti ti-check" aria-hidden="true"></i> Skipped · counts as done</span><span class="srm__state-a">' +
      '<button class="cx-link" data-sr="setUndo" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(String(m.tid)) + '">undo</button></span></div>';
  } else {
    const o = _srSetObj(c, x.st, x.ti, weg);
    body = o ? '<div class="srm__card st-sg">' + stSetRow(o) + '</div>' : '<p class="cx-empty">Nothing to settle – the result is balanced.</p>';
  }
  return _srHead4(title, sub, 'back') + '<div class="srm__b"><div class="srm__one srm__narrow">' + body +
    '<p class="st-hint">What you type goes to Controlling on the day you tap Settled. 0 € counts as done.</p></div></div>';
}

/* The line behind a settle button: card, line, state, tenant info */
function _srSetCtx(ck, tid, weg) {
  const c = _srCards[ck]; if (!c) return null;
  const rec = _srRec(c.p, c.per), sum = _srRecSummary(rec, c.apt);
  if (weg) { if (!c.weg) return null; const l = _srLine(c, c.weg); return { c, it: c.weg, l, st: l.state, ti: null, rec }; }
  const it = c.items.find(x => String(x.r.id) === String(tid)); if (!it) return null;
  const ti = _srTenInfo(c, it, rec, sum.ok);
  return { c, it, l: ti.l, st: ti.st, ti, rec };
}
/* One settle line for stSetRow — null when there is nothing to settle (balanced, no result yet for a WEG line) */
function _srSetObj(c, st, ti, weg, idx) {
  const res = st && st.res;
  if (idx === undefined || idx === null) idx = (window._ctrl.properties || []).filter(p => p.active && p.id !== CASA_PROP_ID).sort(stPropOrder).findIndex(p => p.id === c.p.id);
  const tid = ti ? String(ti.it.r.id) : '';
  const key = weg ? 'w:' + c.ck : 't:' + c.ck + ':' + tid;
  const base = { key, ns: 'sr', attrs: 'data-k="' + stEsc(c.ck) + '"' + (weg ? ' data-w="1"' : ' data-id="' + stEsc(tid) + '"'),
    av: stAv(idx), ab: stAbbr(c.p.name), name: weg ? c.p.name : ti.name, party: weg ? 'WEG' : 'tenant',
    sub: weg ? 'WEG · ' + stPer(c.per.from, c.per.to) : c.p.name + ' · ' + stPer(ti.l.from, ti.l.to),
    openAttr: weg ? 'data-sr="openHv" data-k="' + stEsc(c.ck) + '"' : 'data-sr="openTen" data-k="' + stEsc(c.ck) + '" data-id="' + stEsc(tid) + '"' };
  if (!res) {
    if (weg || !ti.x || ti.x.missing || Math.abs(ti.x.saldo || 0) < 0.005) return null;
    return Object.assign(base, { state: 'locked', dir: ti.x.saldo > 0 ? 1 : -1, soll: Math.abs(ti.x.saldo), lockText: 'Send the NK letter first' });
  }
  if (!res.amount || !res.dir) return null;
  const b = st.booking, done = st.k === 'erledigt';
  return Object.assign(base, { state: SR.setEdit === key ? 'edit' : done ? 'settled' : 'open', dir: res.dir, soll: res.amount,
    ist: b ? cxR(b.amount) : done ? res.amount : null, date: b ? _srD(b.invoice_date) : null,
    note: done && !b && SR.setEdit !== key ? ({ kaution: 'Settled via Kaution', miete: 'Settled with the rent', hausgeld: 'Settled with the Hausgeld' }[res.via] || null) : null });
}
/* Settled: the typed amount (0 is fine) → booking in Controlling today → the line is done */
async function _srSetAmount(ck, tid, weg, raw, btn, when) {
  const x = _srSetCtx(ck, tid, weg); if (!x) return;
  const res = x.st.res; if (!res || !res.amount) { stSay('Nothing to settle'); return; }
  const s = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!s) { stSay('Type the amount – 0 is fine'); return; }
  const parsed = cxParse(s);
  if (parsed === null || isNaN(parsed)) { stSay('That amount is not a number'); return; }
  const amt = cxR(Math.abs(parsed)), b = x.st.booking;
  let date = _srD(when) || cxToday(), linkedManual = null;
  if (btn) btn.disabled = true;
  try {
    if (res.via !== 'zahlung') {
      await _ctlSupa.from('abr_results').update({ settle_via: 'zahlung' }).eq('id', res.id); res.db.settle_via = 'zahlung';
      await _stUpsertSettlement(x.l, { settled_via: 'zahlung' });
    }
    if (b) {
      const d = await ctlUpdateOneTime(b.id, { amount: amt, invoice_date: date });
      const i = (window._src.abrPay || []).findIndex(o => o.id === b.id); if (i >= 0) window._src.abrPay[i] = d;
    } else if (!weg && amt && (linkedManual = _stFindManualNk(x.c.p.id, res, amt))) {   // #6: already typed in Controlling → link it, no 2nd booking
      await _stLinkManualNk(linkedManual, res); date = String(linkedManual.invoice_date || date).slice(0, 10);
    } else {
      const label = weg ? 'Hausgeld ' + x.c.per.label + ' · ' + (res.dir > 0 ? 'Guthaben from WEG' : 'Nachzahlung to WEG')
                        : 'NK ' + x.c.per.label + ' · ' + (x.ti ? _srTName(x.ti.t) : '') + ' · ' + (res.dir > 0 ? 'Nachzahlung' : 'Guthaben');
      const d = await ctlAddOneTime({ property_id: x.c.p.id, invoice_date: date, item: label, amount: amt,
        kind: weg ? 'Hausgeldabrechnung' : 'NK-Abrechnung', direction: res.dir, source_ref: 'abr:' + res.id });
      window._src.abrPay = (window._src.abrPay || []).concat([d]);
    }
    await _stConfirmSettled(x.l, 'zahlung', date);
  } catch (err) { stSay('Could not save — ' + (err.message || err)); if (btn) btn.disabled = false; return; }
  SR.setEdit = null; ctlSettlementInvalidate(); stSay(linkedManual ? 'Settled · linked to your entry in Controlling from ' + stDate(date) : 'Settled');
  _srAfterSettle(x);
}
/* Back to open: the booking in Controlling goes too (a skipped NK comes back as open) */
async function _srSetUndo(ck, tid, weg) {
  const x = _srSetCtx(ck, tid, weg); if (!x) return;
  const b = x.st.booking, skipped = !!(x.ti && x.ti.skipped);
  if (!(await stConfirm({ title: 'Back to open?', ok: 'Back to open',
    text: _stUndoText(b, stDe, v => stEur(cxR(v))) }))) return;
  try {
    if (skipped) await _stUpsertSettlement(x.l, { status: 'offen' });
    else {
      if (b) await _stUndoBooking(b);                                // own booking removed · your own entry only unlinked
      if (x.st.res && x.st.res.via !== 'zahlung') {
        await _ctlSupa.from('abr_results').update({ settle_via: 'zahlung' }).eq('id', x.st.res.id); x.st.res.db.settle_via = 'zahlung';
        await _stUpsertSettlement(x.l, { settled_via: 'zahlung' });
      }
      await _stUpsertSettlement(x.l, { status: 'verschickt' });                 // back to sent: waiting again
    }
  } catch (err) { stSay('Could not undo — ' + (err.message || err)); return; }
  SR.setEdit = null; ctlSettlementInvalidate(); stSay('Back to open');
  if (SR.modal && SR.modal.view === 'tenant' && x.it && x.it.r) {
    const again = _srYearModel(SR.year).find(y => y.ck === ck);
    const nit = again && again.items.find(y => y.r.tenant_id && x.it.r.tenant_id && String(y.r.tenant_id) === String(x.it.r.tenant_id) && _srD(y.r.period_from) === _srD(x.it.r.period_from));
    if (nit) SR.modal.tid = String(nit.r.id);
  }
  stRenderRentals();
}
/* Skip this NK (no letter, no result) — counts as done, undo brings it back */
async function _srSkipNk(ck, tid) {
  const x = _srSetCtx(ck, tid, false); if (!x) return;
  if (!(await stConfirm({ title: 'Skip this NK?', ok: 'Skip', text: 'No letter and no result – it counts as done. You can undo it later.' }))) return;
  try {
    const res = x.st.res, b = x.st.booking;
    if (b) await _stUndoBooking(b);                             // own booking removed · your own entry only unlinked
    if (res) { await _ctlSupa.from('abr_results').update({ status: 'storniert' }).eq('id', res.id); res.db.status = 'storniert'; }
    await _stUpsertSettlement(x.l, { status: 'nicht durchgeführt', amount: null, direction: null, settled_via: null, result_id: null });
  } catch (err) { stSay('Could not save — ' + (err.message || err)); return; }
  ctlSettlementInvalidate(); stSay('Skipped');
  stRenderRentals();
}
/* After Settled: a settle window goes back to where it came from; a sheet stays open */
function _srAfterSettle(x) {
  const m = SR.modal;
  if (m && m.view === 'settle') {
    SR.modal = m.from === 'tracker' ? null : Object.assign({}, m, { view: m.back || 'nk' });
    if (SR.modal && SR.modal.view === 'tenant' && x.it && x.it.r) {           // the line id may have changed (virtual → stored)
      const again = _srYearModel(SR.year).find(y => y.ck === m.ck);
      const nit = again && again.items.find(y => y.r.tenant_id && x.it.r.tenant_id && String(y.r.tenant_id) === String(x.it.r.tenant_id) && _srD(y.r.period_from) === _srD(x.it.r.period_from));
      if (nit) SR.modal.tid = String(nit.r.id);
    }
  }
  stRenderRentals();
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
    clean.keys = Object.assign({}, clean.keys || {}, { ja_v: 2 });
    const saved = await srSaveRow(clean);
    if (_srJaDone(saved, _srRecSummary(saved, c.apt))) await _srWriteWeg(c, saved);
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
  SR.briefOpen = false; SR.perEdit = false; SR.expEdit = false; SR.jaEdit = false;
  if (!keepDraft && (SR.modal.view === 'nk' || SR.modal.view === 'hv')) SR.draft = null;
  stRenderRentals();
}
async function _srCloseModal() {
  await _srAutoFlush();
  SR.modal = null; SR.draft = null; SR.dirty = false; SR.sel = null; SR.setEdit = null; SR.jaEdit = false;
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
      const ti = it ? _srTenInfo(c, it, rec, sum.ok && (_srJaDone(rec, sum) || !!_srLine(c, it).state.res)) : null;
      await _srAutoFlush();
      if (ti && ti.kind === 'ten' && ti.x) _srOpen({ ck: b.dataset.k, view: 'tenant', tid: b.dataset.id, from: SR.modal ? 'nk' : 'tracker' });
      else _srOpen({ ck: b.dataset.k, from: 'tracker' });
      return;
    }
    if (a === 'settle' && b.dataset.skip === '1') { e.stopPropagation(); await _srSkipNk(b.dataset.k, b.dataset.id); return; }
    if (a === 'setOk') { e.stopPropagation(); await _srSetAmount(b.dataset.k, b.dataset.id, b.dataset.w === '1', stSetVal(b), b); return; }
    if (a === 'setEdit') { e.stopPropagation(); SR.setEdit = b.dataset.w === '1' ? 'w:' + b.dataset.k : 't:' + b.dataset.k + ':' + b.dataset.id; _srRerenderPanel();
      const inp = document.querySelector('#srPanel input[data-stset="' + SR.setEdit + '"]'); if (inp) { inp.focus(); inp.select(); } return; }
    if (a === 'setCancel') { e.stopPropagation(); SR.setEdit = null; _srRerenderPanel(); return; }
    if (a === 'setUndo') { e.stopPropagation(); await _srSetUndo(b.dataset.k, b.dataset.id, b.dataset.w === '1'); return; }
    if (a === 'settle') {                                           // Oct 2026: no separate settle level — the item's own modal opens
      e.stopPropagation();
      SR.modal = b.dataset.w === '1' ? { ck: b.dataset.k, view: 'hv', from: 'tracker' } : { ck: b.dataset.k, view: 'tenant', tid: b.dataset.id || null, from: 'tracker' };
      SR.setEdit = null; SR.draft = null; stRenderRentals(); return;
    }
    if (a === 'payOn' || a === 'payOnW') {                          // the money switch: full amount, today (change it under "Payment details")
      e.stopPropagation();
      const weg = a === 'payOnW', x = _srSetCtx(b.dataset.k, weg ? null : b.dataset.id, weg);
      if (!x || !x.st || !x.st.res) { stSay(weg ? 'Add the result of the Jahresabrechnung first' : 'Send the letter first'); return; }
      const res = x.st.res, date = _srD(_srPayVal('date')) || cxToday();   // the day the money moved (default today)
      if (!weg && res.via && res.via !== 'zahlung') {               // settled with the rent / via Kaution: confirm, no booking
        b.disabled = true;
        try { await _stConfirmSettled(x.l, res.via, date); } catch (err) { stSay('Could not save — ' + (err.message || err)); b.disabled = false; return; }
        ctlSettlementInvalidate(); stSay('Settled'); _srAfterSettle(x); return;
      }
      await _srSetAmount(b.dataset.k, weg ? null : b.dataset.id, weg, _srPayVal('amt') ?? cxE2(res.amount), b, date); return;
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
      if (m.view === 'settle' && m.from === 'tracker') { SR.modal = null; SR.setEdit = null; stRenderRentals(); return; }
      SR.setEdit = null;
      SR.modal = Object.assign({}, m, { view: m.view === 'settle' ? (m.back || 'nk') : 'nk', weg: false });
      SR.briefOpen = false; SR.perEdit = false; stRenderRentals(); return;
    }
    if (a === 'pick') {
      const list = Object.values(_srCards), i = list.findIndex(x => x.ck === SR.modal.ck) + Number(b.dataset.d);
      if (list[i]) { await _srAutoFlush(); SR.dirty = false; SR.jaEdit = false; _srOpen({ ck: list[i].ck, view: SR.modal.view === 'hv' ? 'hv' : 'nk', from: SR.modal.from }); }
      return;
    }
    if (!c) return;
    if (a === 'costs') { _srCollect(); SR.costsOpen = !SR.costsOpen; _srRerenderPanel(); return; }
    if (a === 'rowAdd') {
      _srCollect();
      const u = b.dataset.u === '1', p = _srNewPos(u ? 'sonst' : 'nu_sonst', SR.draft); p.label = '';
      SR.draft.positions.push(p); _srRerenderPanel(); _srAutoQueue();
      const ins = document.querySelectorAll('#srPanel .ct-name'); if (ins.length) ins[ins.length - 1].focus();
      return;
    }
    if (a === 'wegDir') { _srCollect(); SR.draft.weg_direction = Number(b.dataset.v); _srRerenderPanel(); _srAutoQueue(); return; }
    if (a === 'jaDone') { await _srJaComplete(b); return; }
    if (a === 'wegRecv') {
      const dt = (document.getElementById('srWegDate') || {}).value || cxToday(), am = (document.getElementById('srWegAmt') || {}).value;
      await _srSetAmount(b.dataset.k, null, true, am, b, dt); return;
    }
    if (a === 'jaTab') { _srCollect(); SR.jaTab = b.dataset.g; _srRerenderPanel(); return; }
    if (a === 'jaFold') { SR.jaOpen = Object.assign({}, SR.jaOpen, { [b.dataset.g]: !(SR.jaOpen && SR.jaOpen[b.dataset.g]) }); _srRerenderPanel(); return; }
    if (a === 'jaEdit') { SR.jaEdit = true; SR.draft = null; SR.costsOpen = false; _srRerenderPanel(); return; }
    if (a === 'hvSave' || a === 'nkSave') { await _srHvSave4(b); SR.dirty = false; return; }
    if (a === 'toNk') { if (SR.dirty) { await _srHvSave4(b, 'nk'); SR.dirty = false; } else { SR.modal.view = 'nk'; _srRerenderPanel(); } return; }
    if (a === 'toHv') { _srCollect(); await _srAutoFlush(); SR.modal.view = 'hv'; SR.jaEdit = _srJaDone(_srRec(c.p, c.per), _srRecSummary(_srRec(c.p, c.per), c.apt)); SR.costsOpen = true; _srRerenderPanel(); return; }
    if (a === 'nkAdd' || a === 'nkGs') {
      _srCollect();
      const gs = a === 'nkGs', p = _srNewPos(gs ? 'grundsteuer' : 'sonst', SR.draft);
      p.origin = 'nk'; p.u = true;
      if (gs) { const q = _srNum(c.verw && c.verw.grundsteuer_mtl); p.amount = q ? cxR(q * 4) : null; } else p.label = '';
      SR.draft.positions.push(p); _srRerenderPanel(); _srAutoQueue();
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
    const pay = e.target.closest('[data-srpay]');
    if (pay) { await _srPayEdit(pay); return; }
    const s = e.target.closest('[data-srs="pick"]');
    if (s) { await _srAutoFlush(); SR.dirty = false; SR.jaEdit = false; _srOpen({ ck: s.value, view: SR.modal && SR.modal.view === 'hv' ? 'hv' : 'nk', from: SR.modal ? SR.modal.from : 'tracker' }); return; }
    const nkcb = e.target.closest('[data-src="innk"]');
    if (nkcb && SR.draft) { _srCollect(); const p = SR.draft.positions[Number(nkcb.dataset.i)]; if (p) p.nk = nkcb.checked ? true : false; _srRerenderPanel(); _srAutoQueue(); return; }
    const cb = e.target.closest('[data-src="split"]');
    if (cb && SR.draft) { _srCollect(); const p = SR.draft.positions[Number(cb.dataset.i)]; if (p) p.split = cb.checked ? 'mieter' : 'tage'; _srRerenderPanel(); _srAutoQueue(); return; }
    if (e.target.closest('[data-srf]')) {
      _srCollect(); _srAutoQueue();
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
    if (e.target.closest('[data-srf]')) { _srRefreshTotals(); _srAutoQueue(); }
    const t = e.target.closest('[data-srt]');
    if (t && (t.dataset.srt === 'vz' || t.dataset.srt.startsWith('direct.'))) _srRefreshTenant();
  });
  // phone keyboard "Next": jump to the next amount
  host.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const inp = e.target.closest('.ct-a input, .ct-name, .sr-amt input, .sr-er__n input'); if (!inp) return;
    e.preventDefault();
    const all = [...document.querySelectorAll('#srPanel .ct-name, #srPanel .ct-a input, #srPanel .sr-er__n input, #srPanel .sr-erlist .sr-amt input')];
    const i = all.indexOf(inp); if (all[i + 1]) all[i + 1].focus(); else inp.blur();
  });
})();
