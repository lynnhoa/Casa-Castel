/* ─────────────────────────────────────────────────────────────
   SETTLEMENTS — TRACKING TAB
   settlements-tab-tracking.js

   Every NK- and Hausgeld-Abrechnung of a year, per property:
     Offen      → the period has ended, the Abrechnung is due (Frist shown)
     Verschickt → Ergebnis entered (Nachzahlung / Guthaben / ausgeglichen)
                  → published to Controlling (abr_results)
     Erledigt   → by itself: paid (confirmed in Controlling) or settled
                  via Kaution / Miete / Hausgeld, or ausgeglichen
   Plus: Leerstand lines ("war leer"), Pauschal lines ("nicht durchgeführt")
   and a folded Datenprüfung.

   Data: ctrl_settlements (tracking) · abr_results (results, read by
   Controlling) · ctrl_expense_one_time (payments, written by Controlling).
   The expected lines come from ctlSettlementModel() — the same rules as
   Controlling.
   ───────────────────────────────────────────────────────────── */

'use strict';

let _stLines = {};                 // id → line (rebuilt on every render)

/* ── Helpers ──────────────────────────────────────────────── */
const _stD = iso => String(iso || '').slice(0, 10);
function _stAddDays(iso, n) { const d = new Date(_stD(iso) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function _stDays(a, b) { return Math.round((new Date(_stD(b) + 'T12:00:00') - new Date(_stD(a) + 'T12:00:00')) / 864e5) + 1; }
function _stFristOf(p, from) { const pp = ctlPeriodOf(p, _stD(from)); if (!pp) return null; const d = new Date(pp.to + 'T12:00:00'); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); }
const _stTName = t => t ? ([t.first_name, t.last_name].filter(Boolean).join(' ') || t.name || '') : '';
function _stTenant(app, id) {
  if (!id) return null;
  const list = app === 'casa' ? (window._src.casaTen || []) : (window._src.rntTen || []);
  return list.find(t => String(t.id) === String(id)) || null;
}
const _stViaText = { zahlung: 'per Zahlung', kaution: 'mit Kaution verrechnet', miete: 'mit Miete verrechnet', hausgeld: 'mit Hausgeld verrechnet' };

/* Result (abr_results) of a tracking line — by link, else by matching (e.g. entered in Controlling before) */
function _stResultOf(p, r) {
  const list = (window._src.abr || []).filter(x => x.status !== 'storniert');
  let x = r.result_id ? list.find(a => String(a.id) === String(r.result_id)) : null;
  if (!x) x = list.find(a => Number(a.property_id) === p.id && a.kind === r.kind && Number(a.year) === Number(r.covers_year) &&
    String(a.tenant_id || '') === String(r.tenant_id || '') && (!a.period_from || _stD(a.period_from) === _stD(r.period_from)));
  if (!x) return null;
  return { db: x, id: x.id, amount: cxR(x.amount), dir: Number(x.direction) || 0, via: x.settle_via || 'zahlung', date: _stD(x.result_date),
           refs: ['abr:' + x.id].concat(x.source_ref ? [x.source_ref] : []) };
}

/* Who / what a line is about */
function _stWho(line) {
  if (line.type === 'gap') return { a: line.it.unit.name, b: 'Leerstand', tag: '' };
  const r = line.it.r, e = line.it.e || {};
  if (r.kind === 'weg_hausgeld') return { a: 'Hausgeld', b: 'WEG-Abrechnung', tag: '' };
  const app = r.app || e.app || (line.p.id === CASA_PROP_ID ? 'casa' : 'rentals');
  const t = _stTenant(app, r.tenant_id);
  const unit = e.unit_name || (t && t.room) || (!r.tenant_id && r.note && r.note !== 'Pauschal' ? r.note : '');
  return { a: unit || _stTName(t) || 'Einheit', b: unit ? (_stTName(t) || (r.tenant_id ? 'Mieter' : 'kein Mieter verknüpft')) : '', tag: r.note === 'Pauschal' ? 'Pauschal' : '' };
}

/* Status of a line */
function _stState(line) {
  const soon = f => f && f <= _stAddDays(cxToday(), 60);
  if (line.type === 'gap') {
    return line.it.confirmed ? { k: 'erledigt', pill: ['grey', 'leer'], text: 'Leerstand bestätigt' }
                             : { k: 'offen', pill: soon(line.frist) ? ['diff', 'Frist bald'] : ['open', 'prüfen'], text: 'Leerstand prüfen' };
  }
  const r = line.it.r, weg = r.kind === 'weg_hausgeld';
  if (r.status === 'nicht durchgeführt') return { k: 'erledigt', pill: ['grey', 'nicht durchgeführt'], text: '' };
  const res = _stResultOf(line.p, r);
  if (res) {
    const txt = _stResultText(res, weg);
    if (!res.amount || !res.dir || res.via !== 'zahlung') return { k: 'erledigt', pill: ['ok', 'erledigt'], res, text: txt };
    const b = ctlAbrBooking(res);
    if (b) return { k: 'erledigt', pill: ['ok', 'bezahlt'], res, booking: b, text: txt };
    return { k: 'verschickt', pill: ['beige', weg ? 'erhalten' : 'verschickt'], res, text: txt };
  }
  if (r.status === 'bezahlt') return { k: 'erledigt', pill: ['ok', 'erledigt'], text: '' };   // older tracking
  return { k: 'offen', pill: soon(line.frist) ? ['diff', 'Frist bald'] : ['open', 'offen'], text: '' };
}
function _stResultText(res, weg) {
  if (!res.dir || !res.amount) return 'Ausgeglichen';
  const nach = weg ? res.dir < 0 : res.dir > 0;
  return (nach ? 'Nachzahlung ' : 'Guthaben ') + stEur(res.amount);
}

/* ── Model: every line with its year ──────────────────────── */
function _stModel() {
  const lines = [], checks = [];
  for (const g of ctlSettlementModel()) {
    const p = g.p;
    for (const per of g.periods) {
      const year = Number(per.to.slice(0, 4));
      for (const it of per.items) {
        if (it.type === 'row' && it.stale) { checks.push({ kind: 'stale', p, year, it }); continue; }
        if (it.type === 'extra') { checks.push({ kind: 'extra', p, year, it }); continue; }
        const id = it.type === 'gap' ? 'g:' + p.id + '|' + it.unit.name + '|' + it.from : String(it.r.id);
        lines.push({ id, type: it.type, p, per, it, year, frist: per.frist, from: it.type === 'gap' ? it.from : _stD(it.r.period_from), to: it.type === 'gap' ? it.to : _stD(it.r.period_to) });
      }
    }
    for (const it of g.other) {
      if (ctlSettlementIsLeer(it.r)) continue;
      lines.push({ id: String(it.r.id), type: 'row', p, per: null, it, year: Number(it.r.covers_year), frist: _stFristOf(p, it.r.period_to || it.r.period_from),
                   from: _stD(it.r.period_from), to: _stD(it.r.period_to) });
    }
  }
  lines.forEach(l => { l.state = _stState(l); l.who = _stWho(l); });
  return { lines, checks };
}

/* ── Render ───────────────────────────────────────────────── */
function stRenderTracking() {
  const el = document.getElementById('tab-tracking'); if (!el) return;
  let model;
  try { model = _stModel(); }
  catch (e) { console.error('[settlements] model', e); el.innerHTML = '<div class="st-page"><p class="cx-empty">Die Abrechnungen konnten nicht berechnet werden.</p><p class="st-muted">' + stEsc(e.message || e) + '</p></div>'; return; }
  _stLines = {}; model.lines.forEach(l => { _stLines[l.id] = l; });

  // years (newest first); default: newest year that still needs you
  const years = [...new Set(model.lines.map(l => l.year))].filter(Boolean).sort((a, b) => b - a);
  if (!years.length) years.push(new Date().getFullYear() - 1);
  if (!ST.year || !years.includes(ST.year)) {
    const need = years.find(y => model.lines.some(l => l.year === y && l.state.k !== 'erledigt'));
    ST.year = need || years[0];
  }
  const yi = years.indexOf(ST.year);
  const inYear = model.lines.filter(l => l.year === ST.year);
  const n = { offen: 0, verschickt: 0, erledigt: 0, soon: 0 };
  inYear.forEach(l => { n[l.state.k]++; if (l.state.pill[1] === 'Frist bald') n.soon++; });
  const filt = ST.filter.size ? ST.filter : new Set(['offen', 'verschickt', 'erledigt']);
  const allOn = ['offen', 'verschickt', 'erledigt'].every(k => filt.has(k));
  const shown = inYear.filter(l => filt.has(l.state.k));

  // year bar + summary + filter
  const yearBar = '<div class="cx-month st-year">' +
    '<button class="cx-arw" data-st="year" data-d="1" aria-label="Früheres Jahr"' + (yi >= years.length - 1 ? ' disabled' : '') + '><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<div class="cx-month__t"><div class="cx-month__m">' + ST.year + '</div><div class="cx-month__s">Abrechnungsjahr</div></div>' +
    '<button class="cx-arw" data-st="year" data-d="-1" aria-label="Späteres Jahr"' + (yi <= 0 ? ' disabled' : '') + '><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
  const chip = (k, label, count) => '<button class="st-chip' + (!allOn && filt.has(k) ? ' is-on' : '') + '" data-st="filter" data-k="' + k + '" aria-pressed="' + (!allOn && filt.has(k)) + '">' +
    label + '<span class="st-chip__n">' + count + '</span></button>';
  const summary = '<div class="st-filter" role="group" aria-label="Filter">' +
    chip('offen', 'Offen', n.offen) + chip('verschickt', 'Verschickt', n.verschickt) + chip('erledigt', 'Erledigt', n.erledigt) +
    '<button class="st-chip' + (allOn ? ' is-on' : '') + '" data-st="filter" data-k="alle" aria-pressed="' + allOn + '">Alle</button></div>' +
    (n.soon ? '<p class="st-alert"><i class="ti ti-alarm" aria-hidden="true"></i>' + n.soon + (n.soon === 1 ? ' Abrechnung' : ' Abrechnungen') + ' mit Frist in den nächsten 2 Monaten</p>' : '');

  // one card per property
  const byProp = new Map();
  shown.forEach(l => { if (!byProp.has(l.p.id)) byProp.set(l.p.id, []); byProp.get(l.p.id).push(l); });
  const props = (window._ctrl.properties || []).filter(p => byProp.has(p.id));
  props.sort((a, b) => (a.id === CASA_PROP_ID ? -1 : b.id === CASA_PROP_ID ? 1 : String(a.name).localeCompare(String(b.name), 'de')));
  const cards = props.map(p => _stCard(p, byProp.get(p.id), inYear.filter(l => l.p.id === p.id))).join('');
  const hiddenDone = !filt.has('erledigt') && n.erledigt
    ? '<button class="st-more" data-st="showDone">' + n.erledigt + ' erledigt anzeigen</button>' : '';
  const empty = !inYear.length ? '<p class="cx-empty">Für ' + ST.year + ' gibt es keine Abrechnungen.</p>'
              : !shown.length ? '<p class="cx-empty">Für ' + ST.year + ' ist alles erledigt.</p>' : '';

  // Datenprüfung
  const checks = model.checks.filter(c => c.year === ST.year);
  const checkHtml = checks.length ? '<div class="cx-card st-check">' +
    '<button class="st-check__h" data-st="checks" aria-expanded="' + ST.checkOpen + '"><span class="cx-lbl">Datenprüfung</span>' +
    '<span class="st-check__r">' + cxPill('open', checks.length + ' prüfen') + '<i class="ti ti-chevron-' + (ST.checkOpen ? 'up' : 'down') + ' cx-chev" aria-hidden="true"></i></span></button>' +
    (ST.checkOpen ? checks.map(_stCheckRow).join('') : '') + '</div>' : '';

  el.innerHTML = '<div class="st-page">' +
    '<div class="st-split' + (ST.sel ? ' has-panel' : '') + '">' +
      '<div class="st-list">' +
        '<div class="st-head"><h1 class="cx-title">Tracking</h1><p class="cx-title__s">NK- und Hausgeldabrechnungen</p></div>' +
        yearBar + summary + cards + empty + hiddenDone + checkHtml +
      '</div>' +
      '<aside class="st-panel" id="stPanel" aria-label="Abrechnung"' + (ST.sel ? '' : ' hidden') + '>' + (ST.sel ? _stPanelHtml() : '') + '</aside>' +
    '</div></div>';

  document.getElementById('stScrim').hidden = !ST.sel || stIsWide();
  document.body.classList.toggle('st-panel-open', !!ST.sel);
  if (ST.sel && !_stLines[ST.sel]) stClosePanel();
}

function _stCard(p, lines, all) {
  const key = String(p.id);
  const open = all.filter(l => l.state.k === 'offen').length;
  const wait = all.filter(l => l.state.k === 'verschickt').length;
  const isOpen = ST.open[key] !== undefined ? ST.open[key] : true;
  const pill = open ? cxPill('open', open + ' offen') : wait ? cxPill('beige', wait + ' warten') : cxPill('ok', 'erledigt');
  const per = lines.find(l => l.per) || lines[0];
  const perText = per ? ((per.per ? 'Zeitraum ' + per.per.label : 'Abrechnungsjahr ' + per.year) + (per.frist ? ' · Frist ' + stDate(per.frist) : '')) : '';
  return '<div class="cx-card st-card">' +
    '<button class="st-card__h st-card__h--btn" data-st="fold" data-k="' + key + '" aria-expanded="' + isOpen + '">' +
      '<span class="st-card__t"><span class="cx-pn">' + stEsc(p.name) + '</span><span class="cx-src">' + stEsc(perText) + '</span></span>' +
      '<span class="st-card__r">' + pill + '<i class="ti ti-chevron-' + (isOpen ? 'up' : 'down') + ' cx-chev" aria-hidden="true"></i></span></button>' +
    (isOpen ? '<div class="st-colhead"><span>Einheit · Mieter</span><span>Zeitraum</span><span>Ergebnis</span><span>Status</span></div>' +
      lines.map(_stLineHtml).join('') : '') +
  '</div>';
}

function _stLineHtml(l) {
  const s = l.state, w = l.who;
  const per = l.from && l.to ? stDM(l.from) + '–' + stDate(l.to) + (l.type === 'gap' ? ' · ' + _stDays(l.from, l.to) + ' Tage' : '') : '';
  const res = s.text || '';
  return '<button class="st-line' + (ST.sel === l.id ? ' is-sel' : '') + (s.k === 'erledigt' ? ' is-done' : '') + (l.type === 'gap' ? ' is-gap' : '') + '" data-st="sel" data-id="' + stEsc(l.id) + '">' +
    '<span class="st-c st-c--who"><span class="st-who">' + stEsc(w.a) + (w.b ? '<span class="st-who__b"> · ' + stEsc(w.b) + '</span>' : '') + '</span>' +
      (w.tag ? '<span class="st-tag">' + stEsc(w.tag) + '</span>' : '') + '</span>' +
    '<span class="st-c st-c--per">' + stEsc(per) + '</span>' +
    '<span class="st-c st-c--res">' + stEsc(res) + '</span>' +
    '<span class="st-c st-c--st">' + cxPill(s.pill[0], s.pill[1]) + '</span>' +
  '</button>';
}

function _stCheckRow(c) {
  if (c.kind === 'extra') {
    return '<div class="st-crow"><div><p class="st-crow__t">' + stEsc(c.it.unit.name) + ' · ' + stEsc(c.it.name) + '</p>' +
      '<p class="st-crow__s">Mieter ohne Einzugsdatum — bitte in ' + (c.it.app === 'casa' ? 'Casa Castel' : 'Rentals') + ' ergänzen.</p></div></div>';
  }
  const r = c.it.r;
  const t = _stTenant(r.app, r.tenant_id);
  const canDel = !_stResultOf(c.p, r) && (r.status === 'offen' || r.status === 'erstellt');
  return '<div class="st-crow"><div><p class="st-crow__t">' + stEsc(c.p.name) + ' · ' + stEsc(_stTName(t) || r.note || (r.kind === 'weg_hausgeld' ? 'Hausgeld' : 'Zeile')) + '</p>' +
    '<p class="st-crow__s">' + stDM(r.period_from) + '–' + stDate(r.period_to) + ' · passt nicht mehr zu den Mieterdaten (veraltet)</p></div>' +
    (canDel ? '<button class="cx-link st-crow__a" data-st="dropStale" data-id="' + stEsc(r.id) + '">Entfernen</button>' : '') + '</div>';
}

/* ── Panel ────────────────────────────────────────────────── */
function _stPanelHtml() {
  const l = _stLines[ST.sel]; if (!l) return '';
  const s = l.state, w = l.who;
  const weg = l.type === 'row' && l.it.r.kind === 'weg_hausgeld';
  const title = w.a + (w.b ? ' · ' + w.b : '');
  const kindText = l.type === 'gap' ? 'Leerstand' : weg ? 'Hausgeldabrechnung (WEG)' : 'NK-Abrechnung';
  let kv = '';
  const row = (a, b) => { kv += '<div class="cx-kv"><span>' + a + '</span><span>' + b + '</span></div>'; };
  if (l.from && l.to) row('Zeitraum', stDate(l.from) + ' – ' + stDate(l.to) + ' · ' + _stDays(l.from, l.to) + ' Tage');
  if (l.frist) row('Frist', stDate(l.frist));
  if (l.type === 'row') {
    let f = null; try { f = ctlSettlementFigures(l.it.r); } catch (e) {}
    if (f && !weg && f.nkSoll !== null) row('NK-Vorauszahlungen (Soll)', stEur(f.nkSoll));
    if (f && !weg && f.nkIst !== null) row('davon gezahlt', stEur(f.nkIst) + (f.istPartial ? ' (teilweise erfasst)' : ''));
    if (f && weg && f.vacant !== null) row('Leerstand im Zeitraum', f.vacant + ' Tage');
  }
  let body = '';
  if (l.type === 'gap') {
    body = l.it.confirmed
      ? '<p class="st-note">Als Leerstand bestätigt — für diese Tage gibt es keine NK-Abrechnung.</p><button class="cx-btn cx-btn--s cx-btn--full" data-st="gapUndo">Zurück auf Offen</button>'
      : '<p class="st-note">In diesen Tagen ist kein Mieter eingetragen. Hat hier jemand gewohnt, trag ihn als ehemaligen Mieter nach — die Daten sind schon ausgefüllt. War die Einheit leer, bestätige es.</p>' +
        (_stGapTarget(l)
          ? '<button class="cx-btn cx-btn--p cx-btn--full" data-st="gapAdd"><i class="ti ti-user-plus" aria-hidden="true"></i> Mieter nachtragen</button>' +
            '<p class="st-hint st-center">Öffnet ' + (_stGapTarget(l).app === 'casa' ? 'Casa Castel' : 'Rentals') + ' → Tenants · nach dem Speichern geht es hierher zurück.</p>'
          : '<p class="st-hint">Diese Einheit ist nicht verknüpft — Mieter bitte direkt in Casa Castel oder Rentals nachtragen.</p>') +
        '<button class="cx-btn cx-btn--s cx-btn--full" data-st="gapOk">War leer</button>';
  } else if (s.k === 'offen' || ST.edit) {
    body = _stFormHtml(l, weg, ST.edit ? s.res : null);
  } else if (s.res) {
    const r = s.res;
    const who = weg ? (r.dir < 0 ? 'an die WEG' : 'von der WEG') : (r.dir > 0 ? 'vom Mieter' : 'an den Mieter');
    let res = '';
    res += '<div class="cx-kv"><span>Ergebnis</span><span>' + stEsc(s.text) + (r.dir && r.amount ? ' ' + who : '') + '</span></div>';
    res += '<div class="cx-kv"><span>' + (weg ? 'Abrechnung vom' : 'Verschickt am') + '</span><span>' + stDate(r.date) + '</span></div>';
    if (r.dir && r.amount) res += '<div class="cx-kv"><span>Verrechnung</span><span>' + stEsc(_stViaText[r.via] || r.via) + '</span></div>';
    const status = s.booking ? 'Bezahlt am ' + stDate(s.booking.invoice_date) + ' — in Controlling bestätigt.'
      : s.k === 'erledigt' ? (r.dir && r.amount ? 'Erledigt — ' + (_stViaText[r.via] || '') + ', keine Zahlung.' : 'Erledigt — kein Geld fließt.')
      : 'Wartet auf die Zahlung. In Controlling (' + (r.dir > 0 ? 'Income' : 'Expenses') + ', ' + stEsc(l.p.name) + ') bestätigen, sobald das Geld geflossen ist.';
    body = '<div class="st-block">' + res + '</div><p class="st-status st-status--' + s.k + '">' + stEsc(status) + '</p>' +
      '<div class="st-actions">' + (s.booking ? '' : '<button class="cx-btn cx-btn--s" data-st="edit">Bearbeiten</button>') +
      '<button class="cx-btn cx-btn--s" data-st="reopen">Zurück auf Offen</button></div>';
  } else {
    body = '<p class="st-status st-status--erledigt">' + (l.it.r.status === 'nicht durchgeführt' ? 'Als „nicht durchgeführt“ markiert.' : 'Erledigt.') + '</p>' +
      '<button class="cx-btn cx-btn--s cx-btn--full" data-st="reopen">Zurück auf Offen</button>';
  }
  return '<div class="st-panel__h"><div class="st-panel__ht"><p class="st-panel__t">' + stEsc(title) + '</p>' +
      '<p class="st-panel__s">' + stEsc(kindText + ' · ' + l.p.name) + '</p></div>' +
      '<button class="st-panel__x" data-st="close" aria-label="Schließen"><i class="ti ti-x" aria-hidden="true"></i></button></div>' +
    '<div class="st-panel__b">' + (kv ? '<div class="st-block">' + kv + '</div>' : '') + body + '</div>';
}

function _stFormHtml(l, weg, res) {
  const r = l.it.r;
  const cur = res ? (!res.dir || !res.amount ? 'null' : ((weg ? res.dir < 0 : res.dir > 0) ? 'nach' : 'gut')) : 'nach';
  const opt = (v, t, sub) => '<button type="button" class="st-seg__b' + (cur === v ? ' is-on' : '') + '" data-st="res" data-v="' + v + '" aria-pressed="' + (cur === v) + '">' + t + '<small>' + sub + '</small></button>';
  const vias = weg ? [['zahlung', 'Zahlung'], ['hausgeld', 'Hausgeld']] : [['zahlung', 'Zahlung'], ['kaution', 'Kaution'], ['miete', 'Miete']];
  const curVia = res && res.via ? res.via : 'zahlung';
  const hide = cur === 'null' ? ' hidden' : '';
  return '<form class="st-form" onsubmit="return false">' +
    '<fieldset class="st-f"><legend class="st-f__l">Ergebnis</legend><div class="st-seg st-seg--3" role="group">' +
      opt('nach', 'Nachzahlung', weg ? 'du zahlst an WEG' : 'Mieter zahlt nach') +
      opt('gut', 'Guthaben', weg ? 'WEG zahlt dir' : 'du zahlst zurück') +
      opt('null', 'Ausgeglichen', 'kein Geld fließt') + '</div></fieldset>' +
    '<label class="st-f st-f--amt"' + hide + '><span class="st-f__l">Betrag</span><span class="st-amt">' +
      '<input id="stAmt" class="st-in" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + (res && res.amount ? stEsc(cxE2(res.amount)) : '') + '"/><span>€</span></span></label>' +
    '<label class="st-f"><span class="st-f__l">' + (weg ? 'Abrechnung vom' : 'Verschickt am') + '</span>' +
      '<input id="stDate" class="st-in" type="date" value="' + stEsc(res && res.date ? res.date : cxToday()) + '"/></label>' +
    '<fieldset class="st-f st-f--via"' + hide + '><legend class="st-f__l">Verrechnung</legend><div class="st-seg st-seg--' + vias.length + '" role="group">' +
      vias.map(([v, t]) => '<button type="button" class="st-seg__b' + (curVia === v ? ' is-on' : '') + '" data-st="via" data-v="' + v + '" aria-pressed="' + (curVia === v) + '">' + t + '</button>').join('') +
    '</div></fieldset>' +
    '<p class="st-hint" id="stHint">' + _stHint(cur, weg, curVia) + '</p>' +
    '<button type="button" class="cx-btn cx-btn--p cx-btn--full" data-st="save">' + (res ? 'Änderung speichern' : weg ? 'Ergebnis speichern' : 'Als verschickt speichern') + '</button>' +
    (res ? '<button type="button" class="cx-link st-center" data-st="cancelEdit">Abbrechen</button>' : '') +
    (!res && r.note === 'Pauschal' ? '<button type="button" class="cx-btn cx-btn--s cx-btn--full" data-st="nd">Nicht durchgeführt (Pauschalmiete)</button>' : '') +
  '</form>';
}
function _stHint(res, weg, via) {
  if (res === 'null') return 'Kein Geld fließt. Die Abrechnung ist damit erledigt.';
  const inc = weg ? res === 'gut' : res === 'nach';
  if (via && via !== 'zahlung') return 'Wird ' + (_stViaText[via] || '') + ' — keine Zahlung, danach erledigt.';
  return 'Erscheint in Controlling unter ' + (inc ? 'Income' : 'Expenses') + '. Dort bestätigst du, wann das Geld geflossen ist.';
}

/* Where a Leerstand line's tenant would be added (Casa room or Rentals apartment) */
function _stGapTarget(l) {
  let link = null;
  try { link = ctlUnitLink(l.it.unit, l.p); } catch (e) {}
  if (!link) return null;
  if (link.type === 'casa_room') return { app: 'casa', room: link.ref };
  if (link.type === 'rentals_apartment') return { app: 'rentals', aptId: link.ref };
  return null;
}
function _stGapAdd(l) {
  const t = _stGapTarget(l); if (!t) return;
  const h = { ...t, from: l.from, to: l.to, back: 'settlements.html', t: Date.now() };
  try {
    sessionStorage.setItem('cc_prefill_former', JSON.stringify(h));
    if (t.app === 'casa') sessionStorage.setItem('cc_open_tab', 'tenants');
    else localStorage.setItem('rentals_last_tab', 'tenants');
  } catch (e) {}
  location.href = t.app === 'casa' ? 'landlord.html' : 'rentals-index.html';
}

/* ── Saving ───────────────────────────────────────────────── */
const _stSqlMissing = err => /check constraint|violates check|result_id|column .* does not exist|42703|23514/i.test(String((err && (err.message || err.code)) || err));

async function _stUpsertSettlement(l, fields) {
  const r = l.it.r;
  if (r._virtual || String(r.id).startsWith('v:')) {
    const row = { property_id: l.p.id, tenant_id: r.tenant_id || null, app: r.app || (l.p.id === CASA_PROP_ID ? 'casa' : 'rentals'), kind: r.kind,
                  covers_year: Number(r.covers_year), period_from: _stD(r.period_from) || null, period_to: _stD(r.period_to) || null, note: r.note || null, ...fields };
    const { data, error } = await _ctlSupa.from('ctrl_settlements').insert(row).select().single();
    if (error) throw error;
    window._src.settle = (window._src.settle || []).concat([data]);
    return data;
  }
  const { data, error } = await _ctlSupa.from('ctrl_settlements').update(fields).eq('id', r.id).select().single();
  if (error) throw error;
  const i = (window._src.settle || []).findIndex(x => x.id === r.id);
  if (i >= 0) window._src.settle[i] = data;
  return data;
}

async function _stWriteResult(existing, row) {
  const tryWrite = async payload => existing
    ? _ctlSupa.from('abr_results').update(payload).eq('id', existing.id).select().single()
    : _ctlSupa.from('abr_results').insert(payload).select().single();
  let res = await tryWrite(row);
  if (res.error && /source/i.test(res.error.message || '')) res = await tryWrite({ ...row, source: 'manual' });
  if (res.error && /period_(from|to)/i.test(res.error.message || '')) { const x = { ...row }; delete x.period_from; delete x.period_to; res = await tryWrite(x); }
  if (res.error) throw res.error;
  const list = window._src.abr || (window._src.abr = []);
  const i = list.findIndex(x => x.id === res.data.id);
  if (i >= 0) list[i] = res.data; else list.push(res.data);
  return res.data;
}

async function _stSave(l, btn) {
  const weg = l.it.r.kind === 'weg_hausgeld';
  const res = document.querySelector('#stPanel .st-seg__b[data-st="res"].is-on')?.dataset.v || 'nach';
  const via = document.querySelector('#stPanel .st-seg__b[data-st="via"].is-on')?.dataset.v || 'zahlung';
  const date = document.getElementById('stDate')?.value || cxToday();
  let amount = 0, dir = 0;
  if (res !== 'null') {
    amount = cxParse(document.getElementById('stAmt')?.value);
    if (!(amount > 0)) { stSay('Bitte den Betrag eingeben'); document.getElementById('stAmt')?.focus(); return; }
    dir = (res === 'nach') === !weg ? 1 : -1;       // NK Nachzahlung / WEG Guthaben → money comes to you
  }
  const r = l.it.r, e = l.it.e || {};
  const app = r.app || e.app || (l.p.id === CASA_PROP_ID ? 'casa' : 'rentals');
  const t = _stTenant(app, r.tenant_id);
  const existing = ST.edit ? l.state.res : null;
  const resRow = { property_id: l.p.id, kind: r.kind, year: Number(r.covers_year), period_from: _stD(r.period_from) || null, period_to: _stD(r.period_to) || null,
                   app, tenant_id: r.tenant_id || null, unit_label: weg ? null : (e.unit_name || (t && t.room) || null), tenant_name: _stTName(t) || null,
                   direction: dir, amount: cxR(amount), result_date: date, due_date: null, settle_via: res === 'null' ? 'zahlung' : via, status: 'fertig', source: 'settlements_app' };
  if (btn) btn.disabled = true;
  const before = { status: r.status || 'offen', amount: r.amount ?? null, direction: r.direction ?? null, settled_via: r.settled_via ?? null, result_id: r.result_id ?? null };
  let row = null;
  try {
    row = await _stUpsertSettlement(l, { status: 'verschickt', amount: cxR(amount), direction: dir, settled_via: resRow.settle_via });
  } catch (err) {
    stSay(_stSqlMissing(err) ? 'Bitte zuerst das Settlements-SQL in Supabase ausführen' : 'Speichern fehlgeschlagen — ' + (err.message || err));
    if (btn) btn.disabled = false; return;
  }
  try {
    const saved = await _stWriteResult(existing ? existing.db : null, resRow);
    await _ctlSupa.from('ctrl_settlements').update({ result_id: saved.id }).eq('id', row.id);
    row.result_id = saved.id;
  } catch (err) {
    await _ctlSupa.from('ctrl_settlements').update(before).eq('id', row.id);            // undo the status change
    Object.assign(row, before);
    const msg = String((err && (err.message || err.code)) || err);
    stSay(/abr_results_one_weg|duplicate|23505/i.test(msg) ? 'Für dieses Jahr gibt es schon eine Hausgeldabrechnung' : 'Speichern fehlgeschlagen — ' + msg);
    if (btn) btn.disabled = false; ctlSettlementInvalidate(); stRenderTracking(); return;
  }
  ctlSettlementInvalidate();
  ST.edit = false;
  ST.sel = String(row.id);
  stSay(existing ? 'Änderung gespeichert' : weg ? 'Ergebnis gespeichert' : 'Als verschickt gespeichert');
  stRenderTracking();
}

async function _stReopen(l) {
  const s = l.state, r = l.it.r;
  if (s.res) {
    const b = ctlAbrBooking(s.res);
    if (!confirm('Abrechnung zurück auf Offen setzen?' + (b ? '\n\nDie Zahlung vom ' + stDate(b.invoice_date) + ' (' + stEur(b.amount) + ') in Controlling wird ebenfalls gelöscht.' : '\n\nDas Ergebnis verschwindet aus Controlling.'))) return;
    try {
      if (b) { await ctlDeleteOneTime(b.id); window._src.abrPay = (window._src.abrPay || []).filter(o => o.id !== b.id); }
      const { error } = await _ctlSupa.from('abr_results').update({ status: 'storniert' }).eq('id', s.res.id);
      if (error) throw error;
      s.res.db.status = 'storniert';
    } catch (err) { stSay('Fehlgeschlagen — ' + (err.message || err)); return; }
  }
  if (!(r._virtual || String(r.id).startsWith('v:'))) {
    try { await _stUpsertSettlement(l, { status: 'offen', amount: null, direction: null, settled_via: null, result_id: null }); }
    catch (err) {
      try { await _stUpsertSettlement(l, { status: 'offen', amount: null, direction: null, settled_via: null }); }
      catch (err2) { stSay('Fehlgeschlagen — ' + (err2.message || err2)); return; }
    }
  }
  ctlSettlementInvalidate(); ST.edit = false;
  stSay('Zurück auf Offen');
  stRenderTracking();
}

async function _stNotDone(l) {
  try { const row = await _stUpsertSettlement(l, { status: 'nicht durchgeführt' }); ST.sel = String(row.id); }
  catch (err) { stSay('Fehlgeschlagen — ' + (err.message || err)); return; }
  ctlSettlementInvalidate(); stRenderTracking();
}

async function _stGap(l, ok) {
  const it = l.it;
  try {
    if (ok) {
      const row = { property_id: l.p.id, tenant_id: null, app: it.app || (l.p.id === CASA_PROP_ID ? 'casa' : 'rentals'), kind: 'nk_tenant',
                    covers_year: it.covers_year || l.year, period_from: it.from, period_to: it.to, note: 'leer:' + it.unit.name, status: 'nicht durchgeführt' };
      const { data, error } = await _ctlSupa.from('ctrl_settlements').insert(row).select().single();
      if (error) throw error;
      window._src.settle = (window._src.settle || []).concat([data]);
    } else if (it.confirmed) {
      const { error } = await _ctlSupa.from('ctrl_settlements').delete().eq('id', it.confirmed.id);
      if (error) throw error;
      window._src.settle = (window._src.settle || []).filter(x => x.id !== it.confirmed.id);
    }
  } catch (err) { stSay('Fehlgeschlagen — ' + (err.message || err)); return; }
  ctlSettlementInvalidate(); stRenderTracking();
}

/* ── Events ───────────────────────────────────────────────── */
document.getElementById('tab-tracking')?.addEventListener('click', async e => {
  const b = e.target.closest('[data-st]'); if (!b) return;
  const a = b.dataset.st;
  if (a === 'year') { const ys = [...new Set(Object.values(_stLines).map(l => l.year))].sort((x, y) => y - x); const i = ys.indexOf(ST.year) + Number(b.dataset.d); if (ys[i]) { ST.year = ys[i]; ST.sel = null; } stRenderTracking(); return; }
  if (a === 'filter') {
    const k = b.dataset.k;
    if (k === 'alle') ST.filter = new Set(['offen', 'verschickt', 'erledigt']);
    else {
      const allOn = ['offen', 'verschickt', 'erledigt'].every(x => ST.filter.has(x));
      if (allOn) ST.filter = new Set([k]);
      else if (ST.filter.has(k)) { ST.filter.delete(k); if (!ST.filter.size) ST.filter = new Set(['offen', 'verschickt', 'erledigt']); }
      else ST.filter.add(k);
    }
    stRenderTracking(); return;
  }
  if (a === 'showDone') { ST.filter.add('erledigt'); stRenderTracking(); return; }
  if (a === 'fold') { const k = b.dataset.k; ST.open[k] = !(ST.open[k] !== undefined ? ST.open[k] : true); stRenderTracking(); return; }
  if (a === 'checks') { ST.checkOpen = !ST.checkOpen; stRenderTracking(); return; }
  if (a === 'sel') { ST.sel = b.dataset.id; ST.edit = false; stRenderTracking(); if (!stIsWide()) document.querySelector('#stPanel .st-panel__b')?.scrollTo(0, 0); return; }
  if (a === 'close') { stClosePanel(); return; }
  if (a === 'dropStale') {
    if (!confirm('Diese veraltete Zeile entfernen?')) return;
    const { error } = await _ctlSupa.from('ctrl_settlements').delete().eq('id', b.dataset.id);
    if (error) { stSay('Fehlgeschlagen — ' + error.message); return; }
    window._src.settle = (window._src.settle || []).filter(x => String(x.id) !== String(b.dataset.id));
    ctlSettlementInvalidate(); stRenderTracking(); return;
  }
  const l = _stLines[ST.sel];
  if (a === 'res' || a === 'via') {
    b.parentElement.querySelectorAll('.st-seg__b').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', x === b); });
    const res = document.querySelector('#stPanel .st-seg__b[data-st="res"].is-on')?.dataset.v || 'nach';
    const via = document.querySelector('#stPanel .st-seg__b[data-st="via"].is-on')?.dataset.v || 'zahlung';
    document.querySelectorAll('#stPanel .st-f--amt, #stPanel .st-f--via').forEach(x => { x.hidden = res === 'null'; });
    const weg = l && l.it.r && l.it.r.kind === 'weg_hausgeld';
    const h = document.getElementById('stHint'); if (h) h.textContent = _stHint(res, weg, via);
    if (a === 'res' && res !== 'null') document.getElementById('stAmt')?.focus();
    return;
  }
  if (!l) return;
  if (a === 'save') { await _stSave(l, b); return; }
  if (a === 'edit') { ST.edit = true; stRenderTracking(); return; }
  if (a === 'cancelEdit') { ST.edit = false; stRenderTracking(); return; }
  if (a === 'reopen') { await _stReopen(l); return; }
  if (a === 'nd') { await _stNotDone(l); return; }
  if (a === 'gapOk') { await _stGap(l, true); return; }
  if (a === 'gapAdd') { _stGapAdd(l); return; }
  if (a === 'gapUndo') { await _stGap(l, false); return; }
});
/* Laptop: Enter in the amount field saves */
document.getElementById('tab-tracking')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target && e.target.id === 'stAmt') { e.preventDefault(); document.querySelector('#stPanel [data-st="save"]')?.click(); }
});
