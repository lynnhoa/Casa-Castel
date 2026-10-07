/* ─────────────────────────────────────────────────────────────
   CONTROLLING — SETUP (set up once, via the avatar menu)
   controlling-tab-setup.js

   · Verknüpfungen: property → Rentals apartment (Hausgeld, Grundsteuer)
     and Properties loan (Kreditrate); unit → Rentals apartment /
     parking or Casa Castel room (rent). Name matches are suggested;
     "Alle Vorschläge übernehmen" saves them in one go.
   · Grundsteuer months per property (default Feb · Mai · Aug · Nov).
   · Casa Castel cost types: amount, frequency, due months.
   · Planwerte: only for what has no link (fallback).
   ───────────────────────────────────────────────────────────── */

'use strict';

const _CX_MS = ['J','F','M','A','M','J','J','A','S','O','N','D'];
const _CX_FREQ = ['monatlich', 'vierteljährlich', 'jährlich', 'sporadisch'];   // stored values (German) · shown via _cxFreqLbl

function _cxSetupSuggestions() {
  const out = [];
  for (const p of window._ctrl.properties.filter(x => x.active)) {
    const l = ctlPropLinks(p);
    const f = {};
    if (l.aptAuto && l.apt) f.rentals_apartment_ref = String(l.apt.id);
    if (l.loanAuto && l.loan) f.loan_ref = String(l.loan.id);
    if (Object.keys(f).length) out.push(['ctrl_properties', p.id, f]);
    for (const u of ctlUnitsOf(p.id)) {
      const ul = ctlUnitLink(u, p);
      if (ul && ul.auto) out.push(['ctrl_units', u.id, { source_type: ul.type, source_ref: String(ul.ref) }]);
    }
  }
  return out;
}

function _cxLinkPill(obj, auto) {
  if (!obj) return cxPill('grey', 'plan value');
  return auto ? cxPill('beige', 'suggested') : cxPill('ok', 'linked');
}
function _cxMonthChips(field, id, months) {
  const set = new Set((months || []).map(Number));
  return '<div class="cx-mchips">' + _CX_MS.map((l, i) =>
    '<button class="cx-mchip' + (set.has(i + 1) ? ' on' : '') + '" data-cx="month" data-t="' + field + '" data-id="' + id + '" data-m="' + (i + 1) + '" aria-label="' + CX_MONTHS[i] + '" aria-pressed="' + set.has(i + 1) + '">' + l + '</button>').join('') + '</div>';
}
/* NK-Abrechnung Casa Castel: how this cost type is split among the tenants (Settlements)
   nk_key    personen = split each day among the tenants living there · flaeche = by room m² (Gas/Heizung) · none = not in the NK
   nk_spread month = counts in the month it is booked · year = spread evenly over the whole year (Grundsteuer, Versicherung …) */
function _cxNkSetupHTML(c, isRate) {
  if (isRate) return '<div class="cx-nkset"><span class="cx-nkset__k">NK-Abrechnung</span><span class="cx-nkset__v">not included · Kreditrate</span></div>';
  if (!('nk_key' in c)) return '<div class="cx-nkset"><span class="cx-nkset__k">NK-Abrechnung</span><span class="cx-nkset__v">run the SQL for the NK settings first</span></div>';
  const key = c.nk_key || 'personen', spread = c.nk_spread || 'month';
  return '<div class="cx-nkset"><span class="cx-nkset__k">NK-Abrechnung</span>' +
    '<div class="cx-grid2">' +
      '<label class="cx-f cx-f--l"><select data-cx-sel="ctrl_castel_categories|' + c.id + '|nk_key" aria-label="NK split">' +
        _cxOpt('personen', 'By person', key === 'personen') + _cxOpt('flaeche', 'By room m²', key === 'flaeche') + _cxOpt('none', 'Not in NK', key === 'none') +
      '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +
      (key === 'none' ? '<span class="cx-nkset__v" style="align-self:center">stays with you</span>' :
      '<label class="cx-f cx-f--l"><select data-cx-sel="ctrl_castel_categories|' + c.id + '|nk_spread" aria-label="NK booking">' +
        _cxOpt('month', 'In its month', spread === 'month') + _cxOpt('year', 'Over the year', spread === 'year') +
      '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>') +
    '</div></div>';
}
const _cxOpt = (v, label, sel) => '<option value="' + cxEsc(v) + '"' + (sel ? ' selected' : '') + '>' + cxEsc(label) + '</option>';
const _cxMoney = (table, id, field, val, label) =>
  '<div class="cx-set__row"><span class="cx-set__k">' + cxEsc(label) + '</span><label class="cx-f cx-f--s"><input type="text" inputmode="decimal" data-cx-in="' + table + '|' + id + '|' + field + '" value="' + (val === null || val === undefined || val === '' ? '' : cxE2(val)) + '" placeholder="0,00" aria-label="' + cxEsc(label) + '"><span>€</span></label></div>';

/* ── Setup (rebuilt after the Setup review) ──────────────────
   Prüfen      · links at a glance · data check · tenant history
   Objekte     · per property: Rentals-Wohnung, Darlehen, Grundsteuer, Abrechnungszeitraum,
                 living units (Zimmer / Wohnung). A missing link shows its one fallback field inline.
   Stellplätze · every parking unit of every property, linked to Rentals › Parking (rent from
                 Rentals, no NK) + Rentals spaces that are in no property yet ("hinzufügen")
   Kostenarten · Casa Castel cost types
   The separate "Planwerte" card and the Strom field are gone (no Strom in the apartments).  */
const _cxSU = { edit: {} };
const _cxUnitHasEntries = uid => (window._src.incAll || []).concat(window._ctrl.income || []).some(r => r.unit_id === uid);
function _cxSuSelect(u, opts, cur) {
  return '<label class="cx-f cx-f--l"><select data-cx-sel="ctrl_units|' + u.id + '|source" aria-label="Source ' + cxEsc(u.name) + '">' +
    '<option value=""' + (cur ? '' : ' selected') + '>— not linked —</option>' + opts + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>';
}
/* One unit line: linked → name · source + "ändern"; not linked (or editing) → the select */
function _cxSuUnit(u, p, st, kind) {
  const S = window._src, l = ctlUnitLink(u, p), cur = l ? l.type + '|' + l.ref : '';
  const takenBy = k => { const list = st.used.get(k) || []; const o = list.find(x => x.u.id !== u.id); return o ? o.p.name + ' · ' + o.u.name : null; };
  const opt = (v, label) => { const tb = takenBy(v); return '<option value="' + cxEsc(v) + '"' + (cur === v ? ' selected' : '') + (tb && cur !== v ? ' disabled' : '') + '>' + cxEsc(label + (tb ? ' – already used by ' + tb : '')) + '</option>'; };
  let opts = '';
  if (kind === 'parking') opts = S.parking.map(x => opt('rentals_parking|' + x.id, x.name)).join('');
  else if (p.id === CASA_PROP_ID) opts = S.rooms.map(r => opt('casa_room|' + r.name, r.name)).join('');
  else opts = S.apts.map(a => opt('rentals_apartment|' + a.id, a.name)).join('');
  const editing = !l || _cxSU.edit[u.id];
  let info = '';
  if (kind === 'parking' && l) {
    const i = ctlParkingInfo(l.obj);
    info = [i.price !== null ? cxEur(i.price) + ' / month' : 'no price in Rentals',
            i.tenantName ? 'Tenant: ' + i.tenantName + (i.rent !== null ? ' · ' + cxEur(i.rent) : '') : 'no tenant'].join(' · ');
  }
  const pill = l ? (l.auto ? cxPill('beige', 'suggested') : cxPill('ok', 'linked')) : cxPill('open', 'not linked');
  const canDel = !l && u.id != null && !_cxUnitHasEntries(u.id);
  return '<div class="cx-su-u">' +
    '<div class="cx-set__row"><span class="cx-su-n">' + cxEsc(kind === 'parking' ? p.name + ' · ' + u.name : u.name) + '</span>' + pill + '</div>' +
    (l && !editing ? '<div class="cx-r__sub">' + cxEsc((kind === 'parking' ? 'Rentals: ' : '') + (l.obj.name || l.ref)) + '</div>' : '') +
    (info ? '<div class="cx-r__sub">' + cxEsc(info) + '</div>' : '') +
    (editing ? _cxSuSelect(u, opts, cur) : '') +
    (!l ? (kind === 'parking'
            ? '<div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Without a link no Soll – choose the parking space in Rentals</div>'
            : '<div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Only while not linked: Soll from these values</div>' +
              _cxMoney('ctrl_units', u.id, 'def_kaltmiete', u.def_kaltmiete, 'Kaltmiete') + _cxMoney('ctrl_units', u.id, 'def_nebenkosten', u.def_nebenkosten, 'Nebenkosten')) : '') +
    '<div class="cx-su-a">' + (l ? '<button class="cx-link" data-cx="suEdit" data-u="' + u.id + '">' + (editing ? 'done' : 'change') + '</button>' : '') +
      (canDel ? '<button class="cx-link" data-cx="suDel" data-u="' + u.id + '">Remove unit</button>' : '') + '</div>' +
  '</div>';
}
const _cxMoneyF = (table, id, field, val, label) =>
  '<label class="cx-f"><input type="text" inputmode="decimal" data-cx-in="' + table + '|' + id + '|' + field + '" value="' + (val === null || val === undefined || val === '' ? '' : cxE2(val)) + '" placeholder="' + cxEsc(label) + '" aria-label="' + cxEsc(label) + '"><span>€</span></label>';
const _cxSuSub = t => '<div class="cx-set__sub">' + cxEsc(t) + '</div>';

window.renderSetup = function () {
  const host = document.getElementById('tab-setup');
  if (!host) return;
  CX.tab = 'setup';
  if (CX.hist && typeof window.renderHistory === 'function') return window.renderHistory(host);   // Phase 3
  const S = window._src;
  const props = window._ctrl.properties.filter(p => p.active);
  const sugg = _cxSetupSuggestions();
  const st = ctlSetupLinkState();
  // × on the suggestions hides exactly this set — a new suggestion brings the card back
  const suggKey = 'sug:' + sugg.map(([t, id, f]) => t + '#' + id + '#' + JSON.stringify(f)).sort().join(';');
  ctlPruneDismissed('sug:', sugg.length ? [suggKey] : []);
  // fixes made in Rentals / Casa Castel: reload their data when Setup is opened (at most every 20 s)
  if (!_cxSU.refreshing && window._src.loadedAt && Date.now() - window._src.loadedAt > 20000) {
    _cxSU.refreshing = true;
    ctlRefreshSources(false).then(ch => { _cxSU.refreshing = false; if (ch && CX.tab === 'setup' && !CX.hist) window.renderSetup(); });
  }

  /* ── Objekte ── */
  const propCards = props.map(p => {
    const l = ctlPropLinks(p), casa = p.id === CASA_PROP_ID, k = 'set:' + p.id;
    const pIssues = st.issues.filter(i => i.pid === p.id && i.kind !== 'parking');
    let body = '<div class="cx-set">';
    if (!casa) {
      const v = l.apt ? S.verw.find(x => String(x.apartment_id) === String(l.apt.id)) : null;
      body += _cxSuSub('Rentals apartment') +
        '<div class="cx-set__row"><span class="cx-set__k">Hausgeld, Grundsteuer, tenant</span>' + _cxLinkPill(l.apt, l.aptAuto) + '</div>' +
        '<label class="cx-f cx-f--l"><select data-cx-sel="ctrl_properties|' + p.id + '|rentals_apartment_ref" aria-label="Rentals apartment">' +
          _cxOpt('', '— not linked —', !l.apt) + S.apts.map(a => _cxOpt(a.id, a.name, l.apt && String(l.apt.id) === String(a.id))).join('') +
        '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +
        (l.apt ? '<div class="cx-r__sub">' + cxEsc('Hausgeld ' + (v && v.hausgeld_mtl != null ? cxEur(v.hausgeld_mtl) : '—') + ' · Grundsteuer ' + (v && v.grundsteuer_mtl != null ? cxEur(v.grundsteuer_mtl) + ' / quarter' : '—') + ' · from Rentals') + '</div>'
               : '<div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Only while not linked: Hausgeld and Grundsteuer from these values</div>' +
                 _cxMoney('ctrl_properties', p.id, 'def_hausgeld', p.def_hausgeld, 'Hausgeld') + _cxMoney('ctrl_properties', p.id, 'def_grundsteuer', p.def_grundsteuer, 'Grundsteuer/Q')) +
        _cxSuSub('Grundsteuer due') +
        _cxMonthChips('ctrl_properties|grundsteuer_months', p.id, Array.isArray(p.grundsteuer_months) && p.grundsteuer_months.length ? p.grundsteuer_months : [2, 5, 8, 11]);
    }
    body += _cxSuSub('Loan · Properties') +
      '<div class="cx-set__row"><span class="cx-set__k">Kreditrate, Zinsen, Tilgung</span>' + _cxLinkPill(l.loan, l.loanAuto) + '</div>' +
      '<label class="cx-f cx-f--l"><select data-cx-sel="ctrl_properties|' + p.id + '|loan_ref" aria-label="Loan">' +
        _cxOpt('', '— not linked —', !l.loan) + S.loans.map(x => _cxOpt(x.id, (x.name || 'Loan') + (x.rate ? ' · ' + cxEur(x.rate) : ''), l.loan && String(l.loan.id) === String(x.id))).join('') +
      '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +
      (l.loan ? '<div class="cx-r__sub">' + cxEsc('Rate ' + cxEur(l.loan.rate || 0) + ' · Zinsen ' + cxEur(l.loan.zinsen || 0) + ' · Tilgung ' + cxEur(l.loan.tilgung || 0)) + '</div>'
        : casa ? '<div class="cx-r__sub">Kreditrate from the cost type "Kreditrate" below</div>'
        : '<div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Only while not linked: Kreditrate from these values</div>' +
          _cxMoney('ctrl_properties', p.id, 'def_rate', p.def_rate, 'Kreditrate') + _cxMoney('ctrl_properties', p.id, 'def_zinsen', p.def_zinsen, 'of which Zinsen'));
    // Abrechnungszeitraum: set later in the Abrechnungen app (placeholder until then, stored value untouched)
    body += _cxSuSub('Abrechnungszeitraum · ' + (casa ? 'NK' : 'WEG + NK')) +
      '<div class="cx-r__sub">Set per property in Settlements · otherwise the calendar year.</div>';
    const living = ctlUnitsOf(p.id).filter(u => !_cxIsParking(u));
    body += _cxSuSub(casa ? 'Rooms · from Casa Castel' : (living.length === 1 ? 'Apartment' : 'Apartments')) +
      (living.length ? living.map(u => _cxSuUnit(u, p, st, 'living')).join('') : '<div class="cx-r__sub">' + (casa ? 'All rooms are taken over from Casa Castel automatically.' : 'No unit set up.') + '</div>');
    const nPk = ctlUnitsOf(p.id).filter(u => _cxIsParking(u)).length;
    if (nPk) body += '<div class="cx-r__sub" style="margin-top:6px">' + nPk + (nPk === 1 ? ' parking space' : ' parking spaces') + ' · see Parking below</div>';
    body += '</div>';
    const auto = l.aptAuto || l.loanAuto || ctlUnitsOf(p.id).some(u => { const ul = ctlUnitLink(u, p); return ul && ul.auto; });
    return cxCard({ key: k, title: p.name, sub: casa ? 'Rooms from Casa Castel' : (l.apt ? 'Rentals · ' + l.apt.name : 'without Rentals apartment'),
                    status: pIssues.length ? ['open', 'check'] : auto ? ['beige', 'suggested'] : ['ok', 'linked'], body });
  }).join('');

  /* ── Stellplätze ── */
  const pkUnits = st.units.filter(x => x.parking);
  const pkOpen = pkUnits.filter(x => !x.l).length + st.freeParking.length;
  const pkBody = '<div class="cx-set">' +
    (pkUnits.length ? pkUnits.map(x => _cxSuUnit(x.u, x.p, st, 'parking')).join('') : '<div class="cx-r__sub">No parking space in Controlling yet.</div>') +
    (st.freeParking.length ? _cxSuSub('In Rentals, not in any property yet') +
      (pkUnits.some(x => !x.l) ? '<div class="cx-r__sub">Link the parking spaces above first – what is left here afterwards is missing in Controlling and can be added.</div>' : '') +
      st.freeParking.map(pk => {
      const i = ctlParkingInfo(pk), g = ctlGuessParkingProp(pk);
      return '<div class="cx-su-u"><div class="cx-set__row"><span class="cx-su-n">' + cxEsc(pk.name) + '</span>' + cxPill('open', 'missing') + '</div>' +
        '<div class="cx-r__sub">' + cxEsc([i.price !== null ? cxEur(i.price) + ' / month' : 'no price in Rentals', i.tenantName ? 'Tenant: ' + i.tenantName : 'no tenant'].join(' · ')) + '</div>' +
        '<div class="cx-grid2"><label class="cx-f cx-f--l"><select id="cxPkProp-' + cxEsc(pk.id) + '" aria-label="Property">' +
          props.map(p => _cxOpt(p.id, p.name, g && g.id === p.id)).join('') + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +
        '<button class="cx-btn cx-btn--s" data-cx="pkAdd" data-pk="' + cxEsc(pk.id) + '">Add</button></div></div>';
    }).join('') : '') + '</div>';
  const pkCard = cxCard({ key: 'set:parking', title: 'Parking', sub: 'Rent from Rentals › Parking · no NK',
                          status: pkOpen ? ['open', pkOpen + ' to check'] : ['ok', 'linked'], body: pkBody });

  /* ── Kostenarten (Casa Castel) ── */
  const casaP = props.find(p => p.id === CASA_PROP_ID), casaLoan = casaP ? ctlPropLinks(casaP).loan : null;
  const cats = (window._ctrl.categories || []).map(c => {
    const freq = c.frequency || 'monatlich', isRate = c.code === 'RATE', freqL = typeof _cxFreqLbl === 'function' ? _cxFreqLbl(freq) : freq;
    const fromLoan = isRate && casaLoan;
    return '<div class="cx-cat">' +
      '<div class="cx-set__row"><span class="cx-pn cx-pn--s">' + cxEsc(c.name || (isRate ? 'Kreditrate' : 'Cost')) + '</span>' +
        (isRate ? cxPill(fromLoan ? 'ok' : 'beige', fromLoan ? 'from Properties' : 'plan value') : cxPill(freq === 'monatlich' ? 'grey' : 'beige', freqL)) + '</div>' +
      (fromLoan ? '<div class="cx-r__sub">' + cxEsc(cxEur(casaLoan.rate || 0) + ' monthly · from the linked loan') + '</div>' :
      '<div class="cx-grid2">' +
        '<label class="cx-f"><input type="text" inputmode="decimal" data-cx-in="ctrl_castel_categories|' + c.id + '|default_amount" value="' + (c.default_amount === null || c.default_amount === undefined ? '' : cxE2(c.default_amount)) + '" placeholder="0,00" aria-label="Amount"><span>€</span></label>' +
        '<label class="cx-f cx-f--l"><select data-cx-sel="ctrl_castel_categories|' + c.id + '|frequency" aria-label="Frequency">' +
          _CX_FREQ.map(f => _cxOpt(f, typeof _cxFreqLbl === 'function' ? _cxFreqLbl(f) : f, f === freq)).join('') + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +
      '</div>' + _cxPerHTML(c)) +
      (freq === 'monatlich' || fromLoan ? '' :
        '<div class="cx-set__k" style="margin-top:6px">' + (_cxBedarf(freq) ? 'Planned in (optional)' : 'Due in') + '</div>' +
        _cxMonthChips('ctrl_castel_categories|due_months', c.id, c.due_months) +
        (!_cxBedarf(freq) && !(Array.isArray(c.due_months) && c.due_months.length) && Number(c.default_amount)
          ? '<div class="cx-r__warn" style="margin-top:6px"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Due months missing – choose the months, otherwise the item is missing in the Soll</div>' : '')) +
      _cxNkSetupHTML(c, isRate) +
    '</div>';
  }).join('');

  /* ── Prüfen ── */
  // grouped: serious ones one by one, the rest as one line per kind with a pointer to the section
  const by = k => st.issues.filter(i => i.kind === k);
  const nm = list => list.map(i => i.text.split(':')[0].replace(/ is not linked$/, '')).join(', ');
  const lines = [];
  by('double').forEach(i => lines.push(i.text));
  by('mismatch').forEach(i => lines.push(i.text));
  if (by('prop').length) lines.push('Without Rentals apartment (Hausgeld, Grundsteuer missing): ' + nm(by('prop')) + ' › Properties');
  if (by('unit').length) lines.push('Not linked: ' + nm(by('unit')) + ' › Properties');
  if (by('loan').length) lines.push('Without loan: ' + nm(by('loan')) + ' › Properties');
  const nPkU = by('parking').length, nPkF = by('freePk').length;
  if (nPkU || nPkF) lines.push('Parking: ' + [nPkU ? nPkU + ' not linked' : '', nPkF ? nPkF + ' from Rentals in no property' : ''].filter(Boolean).join(', ') + ' › Parking');
  if (by('freeApt').length) lines.push('Rentals apartments in no property: ' + by('freeApt').map(i => i.text.replace(/^Rentals apartment "|" is in no property$/g, '')).join(', '));
  const hint = (key, html) => '<div class="cx-hint"><span>' + html + '</span><button class="cx-x" data-cx="hintX" data-k="' + cxEsc(key) + '" aria-label="Hide hint"><span aria-hidden="true">×</span></button></div>';
  const lnkKeys = lines.map(t => 'lnk:' + t);
  ctlPruneDismissed('lnk:', lnkKeys);                       // fixed → its × is forgotten, it can come back
  const lnkVis = lines.filter((t, i) => !ctlIsDismissed(lnkKeys[i]));
  const linkCard = !lnkVis.length ? '' : '<div class="cx-card cx-sum"><div class="cx-row-sb"><span class="cx-lbl">Links</span>' +
      cxPill('open', lnkVis.length + (lnkVis.length === 1 ? ' point' : ' points')) + '</div>' +
      lnkVis.map(t => hint('lnk:' + t, cxEsc(t))).join('') + '</div>';
  const t = cxToday(), y = window._ctrl.year;
  const upTo = y < Number(t.slice(0, 4)) ? 12 : y > Number(t.slice(0, 4)) ? 0 : Number(t.slice(5, 7));
  const chk = typeof ctlDataChecksYear === 'function' ? ctlDataChecksYear(y, upTo) : ctlDataChecks(y, CX.month);
  const ms = c => c.months && c.months.length ? ' <span style="color:var(--cx-mut)">(' + (c.months.length > 3 ? c.months.length + ' months' : c.months.map(m => CX_MONTHS[m - 1].slice(0, 3)).join(', ')) + ')</span>' : '';
  const chkKey = c => ctlCheckKey(c.prop, c.unit, c.text);
  // link problems are already listed under Verknüpfungen – shown once, not twice
  for (let i = chk.length - 1; i >= 0; i--) if (/^(Parking space not linked|Not linked –)/.test(chk[i].text)) chk.splice(i, 1);
  if (y === Number(t.slice(0, 4))) ctlPruneDismissed('chk:', chk.map(chkKey));   // only on the current year's full list
  const chkVis = chk.filter(c => !ctlIsDismissed(chkKey(c)));
  const dataCard = !chkVis.length ? '' : '<div class="cx-card cx-sum">' +
      '<div class="cx-row-sb"><span class="cx-lbl">Rents and Soll · ' + y + '</span>' + cxPill('open', chkVis.length + (chkVis.length === 1 ? ' hint' : ' hints')) + '</div>' +
      chkVis.map(c => hint(chkKey(c), '<b style="font-weight:500;color:var(--cx-ink)">' + cxEsc(c.prop) + ' · ' + cxEsc(c.unit) + '</b>' + ms(c) + '<br>' + cxEsc(c.text))).join('') + '</div>';
  const nHidden = lnkKeys.filter(k => ctlIsDismissed(k)).length + chk.filter(c => ctlIsDismissed(chkKey(c))).length;
  const allClear = !lnkVis.length && !chkVis.length;
  const statusLine = '<div class="cx-hint-foot">' + (allClear ? '<span>' + (nHidden ? 'No open hints' : 'Everything linked and consistent') + '</span>' : '<span></span>') +
      (nHidden ? '<button class="cx-link" data-cx="hintAll">' + nHidden + ' hidden · show again</button>' : '') + '</div>';

  host.innerHTML = '<div class="cx-page">' +
    '<div class="cx-title">Setup</div><div class="cx-title__s">Set up once · after that every Soll comes automatically</div>' +
    (sugg.length && !ctlIsDismissed(suggKey) ? '<div class="cx-card cx-sum"><div class="cx-row-sb"><span class="cx-lbl">Suggestions by name</span><span class="cx-row-sb" style="gap:6px">' + cxPill('beige', sugg.length + ' open') +
      '<button class="cx-x" data-cx="hintX" data-k="' + cxEsc(suggKey) + '" aria-label="Hide suggestions"><span aria-hidden="true">×</span></button></span></div>' +
      '<div class="cx-r__sub" style="margin:6px 0 10px">Already in use. Confirm once, then they are fixed.</div>' +
      '<button class="cx-btn cx-btn--p cx-btn--full" data-cx="acceptAll"><i class="ti ti-checks" aria-hidden="true"></i>Accept all suggestions</button></div>' : '') +
    '<div class="cx-head"><span class="cx-lbl">Check</span></div>' + linkCard + dataCard + statusLine +
    '<div class="cx-card cx-sum"><div class="cx-row-sb"><span class="cx-lbl">Tenant history</span></div>' +
      '<div class="cx-r__sub" style="margin:6px 0 10px">Check and correct move-in, move-out and rent of every tenant – former ones too – once.</div>' +
      '<button class="cx-btn cx-btn--s cx-btn--full" data-cx="openHist"><i class="ti ti-history" aria-hidden="true"></i>Check tenant history</button></div>' +
    '<div class="cx-head"><span class="cx-lbl">Properties</span></div>' + propCards +
    '<div class="cx-head"><span class="cx-lbl">Parking</span></div>' + pkCard +
    '<div class="cx-head"><span class="cx-lbl">Casa Castel · cost types</span></div><div class="cx-card">' + (cats || '<div class="cx-empty">No cost types.</div>') + '</div>' +
    '</div>';

  cxWire(host, {
    render: () => window.renderSetup(),
    click: async (a, b) => {
      if (a === 'openHist') { CX.hist = true; window.scrollTo(0, 0); return window.renderSetup(); }
      if (a === 'acceptAll') {
        b.disabled = true;
        const list = _cxSetupSuggestions();
        let ok = 0, err = null;
        for (const [t, id, f] of list) { try { await ctlUpdateRow(t, id, f); ok++; } catch (e) { err = e; console.error('[controlling] Vorschlag', t, id, e); } }
        if (typeof ctlToast === 'function') ctlToast(err ? ok + ' of ' + list.length + ' saved · ' + String(err.message || err).slice(0, 60) : 'Links saved');
        return window.renderSetup();
      }
      if (a === 'hintX') { ctlDismiss(b.dataset.k); return window.renderSetup(); }
      if (a === 'hintAll') { ctlUndismissAll(['lnk:', 'chk:', 'sug:']); return window.renderSetup(); }
      if (a === 'suEdit') { const id = Number(b.dataset.u); _cxSU.edit[id] = !_cxSU.edit[id]; return window.renderSetup(); }
      if (a === 'suDel') {
        const id = Number(b.dataset.u), u = ctlUnit(id);
        if (!u || _cxUnitHasEntries(id)) { if (typeof ctlToast === 'function') ctlToast('Unit has entries – it can\'t be removed'); return; }
        if (!confirm('Remove "' + u.name + '" from Controlling?')) return;
        try {
          const { error } = await _ctlSupa.from('ctrl_units').delete().eq('id', id);
          if (error) throw error;
          window._ctrl.units = window._ctrl.units.filter(x => x.id !== id);
          ctlSollReset();
        } catch (e) { cxToastErr(e); }
        return window.renderSetup();
      }
      if (a === 'pkAdd') {
        const pk = (window._src.parking || []).find(x => String(x.id) === String(b.dataset.pk));
        const pid = Number(document.getElementById('cxPkProp-' + b.dataset.pk)?.value);
        const p = ctlProp(pid);
        if (!pk || !p) return;
        b.disabled = true;
        // short name inside the property: "Studio One TG 3" in Studio One → "TG 3"
        const short = String(pk.name).toLowerCase().startsWith(String(p.name).toLowerCase() + ' ') ? String(pk.name).slice(p.name.length + 1) : pk.name;
        const type = /garage|stellplatz|\btg\b/i.test(String(pk.parking_type || '')) ? pk.parking_type : 'Stellplatz';
        try {
          await ctlCreateUnit({ property_id: p.id, name: short, unit_type: type, source_type: 'rentals_parking', source_ref: String(pk.id) });
          ctlSollReset();
          if (typeof ctlToast === 'function') ctlToast(short + ' added to ' + p.name);
        } catch (e) { cxToastErr(e); }
        return window.renderSetup();
      }
      if (a === 'perOpen') {                                // open / close one period form (or the new one)
        const cid = Number(b.dataset.c);
        _cxPer.open[cid] = b.dataset.r ? b.dataset.r : null;
        return window.renderSetup();
      }
      if (a === 'perSave' || a === 'perDel') {
        b.disabled = true;
        try {
          const ok = a === 'perSave' ? await _cxPerSave(Number(b.dataset.c), b.dataset.r) : await _cxPerDel(Number(b.dataset.c), b.dataset.r);
          if (ok) _cxPer.open[Number(b.dataset.c)] = null;
        } catch (e) { cxToastErr(e); }
        b.disabled = false;
        return window.renderSetup();
      }
      if (a === 'month') {
        const [t, field] = b.dataset.t.split('|'), id = Number(b.dataset.id), mo = Number(b.dataset.m);
        const row = (t === 'ctrl_properties' ? window._ctrl.properties : window._ctrl.categories).find(r => r.id === id);
        let cur = Array.isArray(row && row[field]) && row[field].length ? row[field].map(Number) : (field === 'grundsteuer_months' ? [2, 5, 8, 11] : []);
        cur = cur.includes(mo) ? cur.filter(x => x !== mo) : cur.concat(mo).sort((x, y) => x - y);
        try { await ctlUpdateRow(t, id, { [field]: cur }); } catch (e) { cxToastErr(e); }
        return window.renderSetup();
      }
    },
    input: async (key, val) => {
      const [t, id, field] = key.split('|');
      try {
        await ctlUpdateRow(t, Number(id), { [field]: val === null ? null : cxR(val) });
        if (t === 'ctrl_castel_categories' && field === 'default_amount' && val !== null) await _cxPerCorrectNow(Number(id), cxR(val));
        if (typeof ctlToast === 'function') ctlToast('Saved');
      }
      catch (e) { cxToastErr(e); }
      window.renderSetup();
    },
  });
  if (!host._cxSelWired) {
    host._cxSelWired = true;
    host.addEventListener('change', async ev => {
      const key = ev.target && ev.target.dataset && ev.target.dataset.cxSel;
      if (!key) return;
      const [t, id, field] = key.split('|'), v = ev.target.value;
      let f;
      if (field === 'source') { const [st, ...ref] = v.split('|'); f = v ? { source_type: st, source_ref: ref.join('|') } : { source_type: null, source_ref: null }; }
      else f = { [field]: v || null };
      try {
        await ctlUpdateRow(t, Number(id), f);
        if (field === 'source') _cxSU.edit[Number(id)] = false;
        if (typeof ctlToast === 'function') ctlToast('Saved');
      } catch (e) { cxToastErr(e); }
      window.renderSetup();
    });
  }
};


/* ── Casa Castel cost Soll by month (B22) ─────────────────────────────────────
   The amount field = the Soll that applies now: typing there CORRECTS that period.
   "+ New amount from a month" = a real change (new Abschlag): months before it stay.
   Each period can be corrected (month / amount) or deleted (the one before runs on). */
const _cxPer = { open: {} };                                // catId → period id | 'new' | null
const _CX_PER_T = 'ctrl_castel_amount_history';
const _cxPerMMYYYY = iso => { const d = _cxD(iso); return d ? d.slice(5, 7) + '.' + d.slice(0, 4) : ''; };
function _cxPerParse(v) {                                   // 07.2026 · 7.2026 · 15.07.2026 · 2026-07 → 2026-07-01
  const s = String(v || '').trim(), iso = (y, m) => (m >= 1 && m <= 12 && y > 2000 && y < 2100) ? y + '-' + String(m).padStart(2, '0') + '-01' : null;
  let x = s.match(/^(\d{1,2})[.\/-](\d{4})$/); if (x) return iso(+x[2], +x[1]);
  x = s.match(/^\d{1,2}\.(\d{1,2})\.(\d{4})$/); if (x) return iso(+x[2], +x[1]);
  x = s.match(/^(\d{4})-(\d{1,2})/); if (x) return iso(+x[1], +x[2]);
  return null;
}
const _cxPerIsStart = h => !!h && _cxD(h.valid_from) <= CX_PER_START;
function _cxPerNowOf(c) { const t = cxToday(); return ctlCastelAmountAt(c, Number(t.slice(0, 4)), Number(t.slice(5, 7))); }

function _cxPerHTML(c) {
  const list = ctlCastelPeriods(c.id), st = _cxPer.open[c.id], now = _cxPerNowOf(c).period, k = c.id;
  const lbl = h => _cxPerIsStart(h) ? 'from start' : 'from ' + ctlPerMonthLbl(h.valid_from);
  const form = h => {
    const start = _cxPerIsStart(h);
    return '<div class="cx-set" style="margin-top:8px">' +
      '<div class="cx-set__row"><span class="cx-set__k">Valid from</span>' + (start
        ? '<span class="cx-r__sub">start</span>'
        : '<label class="cx-f cx-f--l"><input type="text" inputmode="numeric" placeholder="MM.JJJJ" id="cxPerF-' + k + '" value="' + cxEsc(_cxPerMMYYYY(h ? h.valid_from : cxToday())) + '" aria-label="Valid from (month)"></label>') + '</div>' +
      '<div class="cx-set__row"><span class="cx-set__k">Amount</span><label class="cx-f cx-f--s"><input type="text" inputmode="decimal" placeholder="0,00" id="cxPerA-' + k + '" value="' + (h ? cxE2(h.amount) : '') + '" aria-label="Amount"><span>€</span></label></div>' +
      '<div style="display:flex;gap:8px;margin-top:8px">' +
        (h && !start ? '<button class="cx-btn cx-btn--del" style="flex:1" data-cx="perDel" data-c="' + k + '" data-r="' + cxEsc(h.id) + '">Delete</button>' : '') +
        '<button class="cx-btn" style="flex:1" data-cx="perOpen" data-c="' + k + '" data-r="">Cancel</button>' +
        '<button class="cx-btn cx-btn--p" style="flex:1" data-cx="perSave" data-c="' + k + '" data-r="' + (h ? cxEsc(h.id) : 'new') + '">Save</button></div></div>';
  };
  const rows = list.map(h => String(st) === String(h.id) ? form(h) :
    '<div class="cx-kv" style="margin-top:4px"><span>' + cxEsc(lbl(h)) + (now && now.id === h.id ? ' · now' : '') + '</span>' +
    '<span>' + cxEur(h.amount) + ' <button class="cx-link" style="display:inline;padding:0 0 0 8px" data-cx="perOpen" data-c="' + k + '" data-r="' + cxEsc(h.id) + '" aria-label="Correct"><i class="ti ti-pencil" aria-hidden="true"></i></button></span></div>').join('');
  const add = st === 'new' ? form(null)
    : '<button class="cx-link" data-cx="perOpen" data-c="' + k + '" data-r="new"><i class="ti ti-plus" aria-hidden="true"></i> New amount from a month</button>';
  return (list.length ? '<div class="cx-set__k" style="margin-top:8px">Soll by month</div>' + rows : '') + add;
}

async function _cxPerInsert(row) {
  const { data, error } = await _ctlSupa.from(_CX_PER_T).insert(row).select().single();
  if (error) throw error;
  (window._src.castelHist || (window._src.castelHist = [])).push(data);
  return data;
}
async function _cxPerUpdate(id, f) {
  const { data, error } = await _ctlSupa.from(_CX_PER_T).update(f).eq('id', id).select().single();
  if (error) throw error;
  const list = window._src.castelHist || [], i = list.findIndex(h => String(h.id) === String(id));
  if (i >= 0) list[i] = data;
  return data;
}
/* Setup amount = the Soll that applies this month (so everything else keeps reading the right one) */
async function _cxPerSyncDefault(catId) {
  const c = ctlCat(catId); if (!c) return;
  const a = _cxPerNowOf(c);
  if (a.period && Math.abs(_cxN0(c.default_amount) - a.amount) > 0.004) await ctlUpdateRow('ctrl_castel_categories', catId, { default_amount: cxR(a.amount) });
}
async function _cxPerSave(catId, rid) {
  const c = ctlCat(catId); if (!c) return false;
  const list = ctlCastelPeriods(catId);
  const cur = rid && rid !== 'new' ? list.find(h => String(h.id) === String(rid)) : null;
  const amt = cxParse(document.getElementById('cxPerA-' + catId)?.value);
  if (amt === null) { ctlToast('Please enter the amount'); return false; }
  const from = _cxPerIsStart(cur) ? CX_PER_START : _cxPerParse(document.getElementById('cxPerF-' + catId)?.value);
  if (!from) { ctlToast('Please enter the month as MM.JJJJ'); return false; }
  const same = list.find(h => h !== cur && _cxD(h.valid_from) === from);
  if (cur) {                                                // correction of one period
    if (same) { ctlToast('There is already an amount from ' + ctlPerMonthLbl(from)); return false; }
    await _cxPerUpdate(cur.id, { valid_from: from, amount: cxR(amt) });
    ctlLogHistory('category', catId, 'soll ' + from.slice(0, 7), cur.amount, cxR(amt));
  } else {                                                  // new amount from a month
    const before = same ? same.amount : ctlCastelAmountAt(c, Number(from.slice(0, 4)), Number(from.slice(5, 7))).amount;
    if (!list.length) await _cxPerInsert({ category_id: catId, valid_from: CX_PER_START, amount: cxR(_cxN0(c.default_amount)) });
    if (same) await _cxPerUpdate(same.id, { amount: cxR(amt) });
    else await _cxPerInsert({ category_id: catId, valid_from: from, amount: cxR(amt) });
    ctlLogHistory('category', catId, 'soll ' + from.slice(0, 7), before, cxR(amt));
  }
  await _cxPerSyncDefault(catId);
  ctlSollReset();
  ctlToast('Saved');
  return true;
}
async function _cxPerDel(catId, rid) {
  const h = ctlCastelPeriods(catId).find(x => String(x.id) === String(rid));
  if (!h || _cxPerIsStart(h)) return false;
  if (!confirm('Delete the amount from ' + ctlPerMonthLbl(h.valid_from) + '? The amount before it runs on.')) return false;
  const { error } = await _ctlSupa.from(_CX_PER_T).delete().eq('id', h.id);
  if (error) throw error;
  window._src.castelHist = (window._src.castelHist || []).filter(x => String(x.id) !== String(h.id));
  ctlLogHistory('category', catId, 'soll ' + _cxD(h.valid_from).slice(0, 7), h.amount, null);
  await _cxPerSyncDefault(catId);
  ctlSollReset();
  ctlToast('Deleted');
  return true;
}
/* Amount field typed in Setup → correct the period that applies now (no new period) */
async function _cxPerCorrectNow(catId, amt) {
  const c = ctlCat(catId); if (!c) return;
  const a = _cxPerNowOf(c);
  if (!a.period || Math.abs(_cxN0(a.period.amount) - amt) < 0.005) return;
  await _cxPerUpdate(a.period.id, { amount: amt });
  ctlLogHistory('category', catId, 'soll ' + _cxD(a.period.valid_from).slice(0, 7), a.period.amount, amt);
  ctlSollReset();
}
