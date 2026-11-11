/* Apartment in a picker: name + Wohnungsnummer, so two flats in one house stay apart
   ("Kaiserstr. 36 · WHG 507" / "Kaiserstr. 36 · WHG 516") */
function _cxAptLabel(a) { return [a && a.name, a && a.wohnungsnummer].filter(Boolean).join(' \u00b7 '); }
/* ─────────────────────────────────────────────────────────────
   CONTROLLING — SETUP (set up once, via the avatar menu)
   controlling-tab-setup.js

   · Verknüpfungen: property → Rentals apartment (Hausgeld, Grundsteuer)
     and Properties loan (Kreditrate); unit → Rentals apartment /
     parking or Casa Castel room (rent). Name matches are suggested;
     "Alle Vorschläge übernehmen" saves them in one go.
   · Grundsteuer months per property (default Feb · Mai · Aug · Nov).
   · Casa Castel cost types: not here any more (Build A, Oct 2026) — Providers › Utilities, Properties (Rate), Providers (Putzdienst, Winterdienst).
   · Planwerte: only for what has no link (fallback).
   ───────────────────────────────────────────────────────────── */

'use strict';

const _CX_MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];   // CP1 (#28): words, not single letters (6 × 2 on the phone)

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
      if (ul && ul.auto) out.push(['ctrl_units', u.id, { source_type: ul.type, source_ref: String(ul.type === 'casa_room' && ul.id ? ul.id : ul.ref) }]);   // Build A: rooms by ID
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
const _cxOpt = (v, label, sel) => '<option value="' + cxEsc(v) + '"' + (sel ? ' selected' : '') + '>' + cxEsc(label) + '</option>';
const _cxMoney = (table, id, field, val, label) =>
  '<div class="cx-set__row"><span class="cx-set__k">' + cxEsc(label) + '</span><label class="cx-f cx-f--s"><input type="text" inputmode="decimal" data-cx-in="' + table + '|' + id + '|' + field + '" value="' + (val === null || val === undefined || val === '' ? '' : cxE2(val)) + '" placeholder="0,00" aria-label="' + cxEsc(label) + '"><span>€</span></label></div>';

/* ── Setup (rebuilt after the Setup review) ──────────────────
   Prüfen      · links at a glance · data check · tenant history
   Objekte     · per property: Rentals-Wohnung, Darlehen, Grundsteuer, Abrechnungszeitraum,
                 living units (Zimmer / Wohnung). A missing link shows its one fallback field inline.
   Stellplätze · every parking unit of every property, linked to Rentals › Parking (rent from
                 Rentals, no NK) + Rentals spaces that are in no property yet ("hinzufügen")
   Kostenarten · Casa Castel cost types — removed in Build A (Oct 2026)
   The separate "Planwerte" card and the Strom field are gone (no Strom in the apartments).  */
const _cxSU = { edit: {}, pkPick: {} };   // C6: pkPick = the property picked for a Rentals parking space (kept across drawings)
/* #6 (Nov 2026) · the living unit "Wohnung" of a property's Rentals apartment — made when the apartment is chosen, by
   "Accept all", or with "+ Apartment" (properties made before). One per property: a second tap / change while it is
   being saved waits for the same save; a failed save makes nothing (ctlCreateUnit retries a taken id once).
   An apartment whose rent another unit already takes gets no second unit (its rent would count twice). */
const _cxSuLiving = {}, _cxSuMade = {}, _cxSuAptQ = {};   // _cxSuAptQ: pid → the last apartment change (the next one waits for it)                    // _cxSuMade: pid → the unit made here (follows a corrected choice)
function _cxSuEnsureLiving(pid) {
  if (_cxSuLiving[pid]) return _cxSuLiving[pid];
  const p = ctlProp(pid), l = p ? ctlPropLinks(p) : null;
  if (!p || p.id === CASA_PROP_ID || !l.apt || ctlUnitsOf(pid).some(u => !_cxIsParking(u)) ||
      ctlSetupLinkState().used.has('rentals_apartment|' + String(l.apt.id))) return Promise.resolve(null);
  const run = (async () => {
    try {
      const u = await ctlCreateUnit({ property_id: pid, name: 'Wohnung', unit_type: 'Wohnung', source_type: 'rentals_apartment', source_ref: String(l.apt.id) });
      if (u && u.id != null) _cxSuMade[pid] = u.id;
      ctlSollReset();
      return u;
    } finally { delete _cxSuLiving[pid]; }
  })();
  _cxSuLiving[pid] = run;
  return run;
}
const _cxUnitHasEntries = uid => (window._src.incAll || []).concat(window._ctrl.income || []).some(r => r.unit_id === uid);
function _cxSuSelect(u, opts, cur) {
  return '<label class="cx-f cx-f--l"><select data-cx-sel="ctrl_units|' + u.id + '|source" aria-label="Source ' + cxEsc(u.name) + '">' +
    '<option value=""' + (cur ? '' : ' selected') + '>— not linked —</option>' + opts + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>';
}
/* One unit line: linked → name · source + "ändern"; not linked (or editing) → the select */
function _cxSuUnit(u, p, st, kind) {
  const S = window._src, l = ctlUnitLink(u, p), cur = l ? l.type + '|' + (l.type === 'casa_room' && l.id ? l.id : l.ref) : '';
  const takenBy = k => { const list = st.used.get(k) || []; const o = list.find(x => x.u.id !== u.id); return o ? o.p.name + ' · ' + o.u.name : null; };
  const opt = (v, label) => { const tb = takenBy(v); return '<option value="' + cxEsc(v) + '"' + (cur === v ? ' selected' : '') + (tb && cur !== v ? ' disabled' : '') + '>' + cxEsc(label + (tb ? ' – already used by ' + tb : '')) + '</option>'; };
  let opts = '';
  if (kind === 'parking') opts = S.parking.map(x => opt('rentals_parking|' + x.id, x.name)).join('');
  else if (p.id === CASA_PROP_ID) opts = S.rooms.map(r => opt('casa_room|' + r.id, r.name)).join('');   // Build A: saved by the room's ID
  else opts = S.apts.map(a => opt('rentals_apartment|' + a.id, _cxAptLabel(a))).join('');
  const editing = !l || _cxSU.edit[u.id];
  let info = '';
  if (kind === 'parking' && l) {
    const i = ctlParkingInfo(l.obj);
    // x4 (Nov 2026): the tenant's rent as Income plans it today (rent history) — not the raw tenant record
    const now = i.tenant ? ctlTenantRentOn(u, p, i.tenant.id, _cxSuNow(p).later || cxToday()) : null, rent = now !== null ? now : i.rent;
    info = [i.price !== null ? cxEur(i.price) + ' / month' : 'no price in Rentals',
            i.tenantName ? 'Tenant: ' + i.tenantName + (rent !== null ? ' · ' + cxEur(rent) : '') : 'no tenant'].join(' · ');
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
const _cxSuSub = t => '<div class="cx-set__sub">' + cxEsc(t) + '</div>';
/* #15 (Nov 2026) · Setup shows the values Expenses and Book all use (read only): this month's — or, for a property bought
   later, its first month's (later = the purchase date). It showed old base values (Rentals' first Hausgeld, the newest
   loan terms even when they start later). */
function _cxSuNow(p) {
  const t = cxToday(), s = ctlPropSince(p);
  const at = s && s.slice(0, 7) > t.slice(0, 7) ? s : t;
  let y = Number(at.slice(0, 4)), m = Number(at.slice(5, 7));
  if (ctlHandoverDay(p, y, m) > 1) { m++; if (m > 12) { m = 1; y++; } }   // #30: a purchase month "From handover day" is partial → the monthly amounts of the next month
  return { y, m, later: s && s > t ? s : '' };
}
const _cxSuNb = t => String(t).replace(/ /g, '\u00a0');   // "≈ Tilgung 353,52 €" never breaks inside (390 px)
/* A new loan has no rate yet in its purchase month (Properties › First rate on: the month after, saved as rate 0 before
   it) → the month of its first rate, so Setup shows that rate "from <date>" and not 0,00 € */
function _cxSuLoanYM(L, y, m) {
  if (ctlLoanMonth(ctlLoanTerms(L, y, m), y, m).rate) return { y, m, first: false };
  const cur = _cxIso(y, m, 1).slice(0, 7);
  const ds = (window._src.loanHist || []).filter(h => String(h.property_id) === String(L.id)).map(h => _cxD(h.valid_from))
    .filter(d => d && d.slice(0, 7) > cur).sort();
  for (const d of ds) {
    const y2 = Number(d.slice(0, 4)), m2 = Number(d.slice(5, 7));
    if (ctlLoanMonth(ctlLoanTerms(L, y2, m2), y2, m2).rate) return { y: y2, m: m2, first: true };
  }
  return { y, m, first: false };
}
/* The date of an amount Setup shows: "from" a date still to come, "since" one that has come */
const _cxSuWhen = d => d ? (d > cxToday() ? ' from ' : ' since ') + _cxFmtD(d) : '';
function _cxSuLoanNow(L, y0, m0, later) {                   // the Kreditrate of month y/m (same source as ctlCostRows)
  const a = _cxSuLoanYM(L, y0, m0), y = a.y, m = a.m;
  const T = ctlLoanTerms(L, y, m), lm = ctlLoanMonth(T, y, m);
  if (!lm.rate) return 'Kreditrate —';                      // no loan entered in Properties (Expenses plans none), as "Hausgeld —"
  // a property bought later (later = its purchase date): that date, unless these terms start after it (a first rate the month after)
  const since = _cxSuWhen(later && !(T._from > later) ? later : T._from);
  return lm.debit === 'split'
    ? _cxSuNb('Zinsen ' + cxEur(lm.zinsen)) + ' + ' + _cxSuNb('Tilgung ' + cxEur(lm.tilgung)) + ' = ' + cxEur(lm.rate) + since + ' · debited separately'
    : 'Kreditrate ' + cxEur(lm.rate) + since + ' · ' + _cxSuNb('≈ Zinsen ' + cxEur(lm.zinsen)) + ' · ' + _cxSuNb('≈ Tilgung ' + cxEur(lm.tilgung));
}

/* you are filling in host: a field there has the focus (a drawing matches fields by position — a card or tenant row
   that came or went above it gave the field you are in to another property or tenant, or removed it, C5 review), a date
   is being picked (cc-cal), or a field holds something other than what was drawn (typed, picked, ticked) */
function _cxFilling(host) {
  if (!host) return false;
  const a = document.activeElement;
  if (a && host.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return true;
  if (document.getElementById('ccCal')) return true;
  for (const e of host.querySelectorAll('input, select, textarea')) {
    if (e.type === 'file' || e.type === 'button' || e.type === 'submit') continue;
    if (e.tagName === 'SELECT') { if (e.multiple) continue; const d = [...e.options].findIndex(o => o.defaultSelected); if (e.selectedIndex !== (d < 0 ? 0 : d)) return true; }
    else if (e.type === 'checkbox' || e.type === 'radio') { if (e.checked !== e.defaultChecked) return true; }
    else if (e.value !== e.defaultValue) return true;
  }
  return false;
}
/* a drawing put off while you were filling in (_cxSU.due) follows once you leave the field — after the tap that left it;
   a Setup save that tap started draws it itself when done (C6: also when 'Book all' saves on another tab meanwhile — it was
   dropped). A Setup save that ends while you are in a field draws at once: cxPaint keeps the field you are in yours (C6s-1). */
if (typeof document !== 'undefined') document.addEventListener('focusout', e => {
  const host = document.getElementById('tab-setup');
  if (!_cxSU.due || !host || !host.contains(e.target)) return;
  setTimeout(() => { if (_cxSU.due && host.style.display !== 'none' && !(window._ctlSrcBusy > 0) && !_cxFilling(host)) window.renderSetup(); }, 250);
});
window.renderSetup = function () {
  const host = document.getElementById('tab-setup');
  if (!host || cxOffScreen(host)) return;   // C6: a Setup save that ends after you left Setup draws the screen you are on
  CX.tab = 'setup';
  const np = document.getElementById('cxSuNewProp');
  if (np && _cxSU.newProp) _cxSU.newName = np.value;          // C6: the new property's name stays when Setup is drawn again
  // fixes made in Rentals / Casa Castel and the income of every year (Tenant history balances): reload when Setup or
  // Tenant history is opened (a full read at most every 20 s) — drawn again when something changed, unless you are
  // filling in a field: a drawing puts every other field back to its drawn value (a form being filled in kept nothing,
  // C5 review) — then the figures follow with the next drawing (your save) or the next return (_cxSU.due)
  _cxSU.due = false;
  if (!_cxSU.refreshing && window._src.loadedAt && Date.now() - (window._src.fullAt || 0) > 20000) {
    _cxSU.refreshing = true;
    ctlRefreshSources(false, true).then(ch => {
      _cxSU.refreshing = false;
      if (!ch || CX.tab !== 'setup') return;
      if (_cxFilling(document.getElementById('tab-setup'))) _cxSU.due = true; else window.renderSetup();
    });
  }
  if (CX.hist && typeof window.renderHistory === 'function') return window.renderHistory(host);   // Phase 3
  const S = window._src;
  const props = window._ctrl.properties.filter(p => p.active);
  const sugg = _cxSetupSuggestions();
  const st = ctlSetupLinkState();
  // × on the suggestions hides exactly this set — a new suggestion brings the card back
  const suggKey = 'sug:' + sugg.map(([t, id, f]) => t + '#' + id + '#' + JSON.stringify(f)).sort().join(';');
  ctlPruneDismissed('sug:', sugg.length ? [suggKey] : []);

  /* ── Objekte ── */
  const propCards = props.map(p => {
    const l = ctlPropLinks(p), casa = p.id === CASA_PROP_ID, k = 'set:' + p.id;
    const pIssues = st.issues.filter(i => i.pid === p.id && i.kind !== 'parking');
    let body = '<div class="cx-set">';
    const now = _cxSuNow(p);                                       // #15: today's values (a later purchase: its first month)
    if (!casa) {
      const cost = l.apt ? ctlCostRows(p, now.y, now.m) : null;
      const hg = cost && cost.rows.find(r => r.key === 'hausgeld'), gs = cost && (cost.rows.find(r => r.key === 'grundsteuer') || cost.notDue.find(r => r.label === 'Grundsteuer'));
      // a property bought later: its purchase date at the end of the line (Hausgeld and Grundsteuer), unless the Hausgeld changes after it
      const hgD = hg && hg.from && !(now.later && hg.from <= now.later) ? hg.from : '';
      body += _cxSuSub('Rentals apartment') +
        '<div class="cx-set__row"><span class="cx-set__k">Hausgeld, Grundsteuer, tenant</span>' + _cxLinkPill(l.apt, l.aptAuto) + '</div>' +
        '<label class="cx-f cx-f--l"><select data-cx-sel="ctrl_properties|' + p.id + '|rentals_apartment_ref" aria-label="Rentals apartment">' +
          _cxOpt('', '— not linked —', !l.apt) + S.apts.map(a => _cxOpt(a.id, _cxAptLabel(a), l.apt && String(l.apt.id) === String(a.id))).join('') +
        '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +
        (l.apt ? '<div class="cx-r__sub">' + cxEsc('Hausgeld ' + (hg ? cxEur(hg.soll) + _cxSuWhen(hgD) : '—') + ' · Grundsteuer ' + (gs && gs.soll ? cxEur(gs.soll) + ' / quarter' : '—') +
                   (now.later && !hgD ? ' · from ' + _cxFmtD(now.later) : '') + ' · change in Rentals') + '</div>'
               : '<div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Only while not linked: Hausgeld and Grundsteuer from these values</div>' +
                 _cxMoney('ctrl_properties', p.id, 'def_hausgeld', p.def_hausgeld, 'Hausgeld') + _cxMoney('ctrl_properties', p.id, 'def_grundsteuer', p.def_grundsteuer, 'Grundsteuer/Q')) +
        _cxSuSub('Grundsteuer due') +
        _cxMonthChips('ctrl_properties|grundsteuer_months', p.id, Array.isArray(p.grundsteuer_months) && p.grundsteuer_months.length ? p.grundsteuer_months : [2, 5, 8, 11]);
    }
    body += _cxSuSub('Loan · Properties') +
      '<div class="cx-set__row"><span class="cx-set__k">Kreditrate, Zinsen, Tilgung</span>' + _cxLinkPill(l.loan, l.loanAuto) + '</div>' +
      '<label class="cx-f cx-f--l"><select data-cx-sel="ctrl_properties|' + p.id + '|loan_ref" aria-label="Loan">' +
        _cxOpt('', '— not linked —', !l.loan) + S.loans.map(x => { const a = _cxSuLoanYM(x, now.y, now.m), r = ctlLoanMonth(ctlLoanTerms(x, a.y, a.m), a.y, a.m).rate;   // #15: the rate debited now (a new loan: its first rate)
          return _cxOpt(x.id, (x.name || 'Loan') + (r ? ' · ' + cxEur(r) : ''), l.loan && String(l.loan.id) === String(x.id)); }).join('') +
      '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +
      (l.loan ? '<div class="cx-r__sub">' + cxEsc(_cxSuLoanNow(l.loan, now.y, now.m, now.later) + ' · change in Properties') + '</div>'
        : casa ? '<div class="cx-r__sub">Kreditrate: comes from the Properties loan once it is linked here — until then the amount saved for it stays</div>'
        : '<div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Only while not linked: Kreditrate from these values</div>' +
          _cxMoney('ctrl_properties', p.id, 'def_rate', p.def_rate, 'Kreditrate') + _cxMoney('ctrl_properties', p.id, 'def_zinsen', p.def_zinsen, 'of which Zinsen'));
    // #30 (Nov 2026): purchase month — the whole month (as before) or from the handover day. Only once CONTROLLING-C3.sql
    // has added the setting, and only for a property bought after the 1st of a month (never Casa Castel)
    const since = ctlPropSince(p);
    if (!casa && 'first_month' in p && since && since.slice(8, 10) !== '01') {
      const ho = p.first_month === 'handover';
      body += _cxSuSub('First month · bought ' + _cxFmtD(since)) +
        '<div class="cx-seg" role="group" aria-label="First month"><button class="' + (ho ? '' : 'on') + '" data-cx="firstMonth" data-p="' + p.id + '" data-v="full" aria-pressed="' + !ho + '">Full month</button>' +
        '<button class="' + (ho ? 'on' : '') + '" data-cx="firstMonth" data-p="' + p.id + '" data-v="handover" aria-pressed="' + ho + '">From handover day</button></div>';
    }
    // Abrechnungszeitraum: set later in the Abrechnungen app (placeholder until then, stored value untouched)
    body += _cxSuSub('Abrechnungszeitraum · ' + (casa ? 'NK' : 'WEG + NK')) +
      '<div class="cx-r__sub">Set per property in Settlements · otherwise the calendar year.</div>';
    const living = ctlUnitsOf(p.id).filter(u => !_cxIsParking(u));
    body += _cxSuSub(casa ? 'Rooms · from Casa Castel' : (living.length > 1 ? 'Apartments' : 'Apartment')) +
      (living.length ? living.map(u => _cxSuUnit(u, p, st, 'living')).join('')
        : casa ? '<div class="cx-r__sub">All rooms are taken over from Casa Castel automatically.</div>'
        // #6 (Nov 2026): without its living unit the rent was missing everywhere and nothing could add it
        : l.apt && pIssues.some(i => i.kind === 'noUnit') ? '<div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> No living unit – the rent of ' + cxEsc(_cxAptLabel(l.apt)) + ' is missing</div>' +
                  '<button class="cx-btn cx-btn--s cx-btn--full" data-cx="aptAdd" data-p="' + p.id + '"><i class="ti ti-plus" aria-hidden="true"></i>Apartment</button>'
        : l.apt ? '<div class="cx-r__sub">' + cxEsc('The rent of ' + _cxAptLabel(l.apt) + ' counts in ' + ((st.used.get('rentals_apartment|' + String(l.apt.id)) || []).map(x => x.p.name + ' · ' + x.u.name).join(', ') || 'another property')) + '</div>'
        : '<div class="cx-r__sub">Link the Rentals apartment first – then add its unit here.</div>');
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
          props.map(p => _cxOpt(p.id, p.name, String(_cxSU.pkPick[pk.id] ?? (g && g.id)) === String(p.id))).join('') + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +   // C6: your pick, else the guess
        '<button class="cx-btn cx-btn--s" data-cx="pkAdd" data-pk="' + cxEsc(pk.id) + '">Add</button></div></div>';
    }).join('') : '') + '</div>';
  const pkCard = cxCard({ key: 'set:parking', title: 'Parking', sub: 'Rent from Rentals › Parking · no NK',
                          status: pkOpen ? ['open', pkOpen + ' to check'] : ['ok', 'linked'], body: pkBody });

  /* ── Kostenarten (Casa Castel): Build A — no longer here. Prices, dates and NK split are set in
     Providers › Utilities, the Rate comes from Properties, Putzdienst / Winterdienst from Providers. ── */

  /* ── Prüfen ── */
  // grouped: serious ones one by one, the rest as one line per kind with a pointer to the section
  const by = k => st.issues.filter(i => i.kind === k);
  const nm = list => list.map(i => i.text.split(':')[0].replace(/ is not linked$/, '')).join(', ');
  const lines = [];
  by('double').forEach(i => lines.push(i.text));
  by('mismatch').forEach(i => lines.push(i.text));
  if (by('prop').length) lines.push('Without Rentals apartment (Hausgeld, Grundsteuer missing): ' + nm(by('prop')) + ' › Properties');
  if (by('unit').length) lines.push('Not linked: ' + nm(by('unit')) + ' › Properties');
  if (by('noUnit').length) lines.push('No living unit (rent missing): ' + nm(by('noUnit')) + ' › Properties');   // #6
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

  cxPaint(host, '<div class="cx-page">' +
    '<div class="cx-title">Setup</div><div class="cx-title__s">Set up once · after that every Soll comes automatically</div>' +
    (sugg.length && !ctlIsDismissed(suggKey) ? '<div class="cx-card cx-sum"><div class="cx-row-sb"><span class="cx-lbl">Suggestions by name</span><span class="cx-row-sb" style="gap:6px">' + cxPill('beige', sugg.length + ' open') +
      '<button class="cx-x" data-cx="hintX" data-k="' + cxEsc(suggKey) + '" aria-label="Hide suggestions"><span aria-hidden="true">×</span></button></span></div>' +
      '<div class="cx-r__sub" style="margin:6px 0 10px">Already in use. Confirm once, then they are fixed.</div>' +
      '<button class="cx-btn cx-btn--p cx-btn--full" data-cx="acceptAll"><i class="ti ti-checks" aria-hidden="true"></i>Accept all suggestions</button></div>' : '') +
    '<div class="cx-head"><span class="cx-lbl">Check</span></div>' + linkCard + dataCard + statusLine +
    '<div class="cx-card cx-sum"><div class="cx-row-sb"><span class="cx-lbl">Tenant history</span></div>' +
      '<div class="cx-r__sub" style="margin:6px 0 10px">Check and correct move-in, move-out and rent of every tenant – former ones too – once.</div>' +
      '<button class="cx-btn cx-btn--s cx-btn--full" data-cx="openHist"><i class="ti ti-history" aria-hidden="true"></i>Check tenant history</button></div>' +
    '<div class="cx-head"><span class="cx-lbl">Properties</span></div>' + propCards + _cxSuNewPropHTML() +
    '<div class="cx-head"><span class="cx-lbl">Parking</span></div>' + pkCard +
    '</div>');   // B18: only what changed

  cxWire(host, {
    render: () => window.renderSetup(),
    click: async (a, b) => {
      if (a === 'openHist') { CX.hist = true; window.scrollTo(0, 0); return window.renderSetup(); }
      if (a === 'propNew') { _cxSU.newProp = !_cxSU.newProp; _cxSU.newName = ''; return window.renderSetup(); }
      if (a === 'propAdd') {
        const inp = document.getElementById('cxSuNewProp'), name = (inp?.value || '').trim();
        if (!name) { ctlToast('Please enter a name'); inp?.focus(); return; }
        if (window._ctrl.properties.some(p => String(p.name).trim().toLowerCase() === name.toLowerCase())) { ctlToast('There is already a property called ' + name); inp?.focus(); return; }
        b.disabled = true;
        try {
          const p = await ctlCreateProperty(name);
          _cxSU.newProp = false; _cxSU.newName = '';
          CX.open['set:' + p.id] = true;                                // open its card: link apartment, units and loan next
          ctlSollReset();
          ctlToast(name + ' added');
        } catch (e) { cxToastErr(e); }
        b.disabled = false;
        return window.renderSetup();
      }
      if (a === 'firstMonth') {                                      // #30: Full month · From handover day
        const id = Number(b.dataset.p), v = b.dataset.v === 'handover' ? 'handover' : 'full', p = ctlProp(id);
        if (!p || (p.first_month || 'full') === v) return;
        b.disabled = true;
        try { await ctlUpdateRow('ctrl_properties', id, { first_month: v }); } catch (e) { cxToastErr(e); }   // ctlUpdateRow resets the Soll
        b.disabled = false;
        return window.renderSetup();
      }
      if (a === 'aptAdd') {                                          // #6: the living unit of the linked Rentals apartment
        b.disabled = true;
        try { await _cxSuEnsureLiving(Number(b.dataset.p)); } catch (e) { cxToastErr(e); }   // failed → nothing made, the button stays
        b.disabled = false;
        return window.renderSetup();
      }
      if (a === 'acceptAll') {
        b.disabled = true;
        const list = _cxSetupSuggestions();
        let ok = 0, n = 0, err = null;
        for (const [t, id, f0] of list) {
          // C6: a link you changed yourself meanwhile stays — only what is still suggested is saved (a unit's source as a pair)
          const now = (_cxSetupSuggestions().find(x => x[0] === t && x[1] === id) || [])[2] || {}, f = {};
          if (t === 'ctrl_units') { if (now.source_type === f0.source_type && now.source_ref === f0.source_ref) Object.assign(f, f0); }
          else for (const k in f0) if (now[k] === f0[k]) f[k] = f0[k];
          if (!Object.keys(f).length) continue;
          n++;
          try {
            await ctlUpdateRow(t, id, f); ok++;
            if (t === 'ctrl_properties' && f.rentals_apartment_ref) await _cxSuEnsureLiving(id);   // #6: its living unit comes with it
          } catch (e) { err = e; console.error('[controlling] Vorschlag', t, id, e); }
        }
        if (typeof ctlToast === 'function') ctlToast(err ? ok + ' of ' + n + ' saved · ' + String(err.message || err).slice(0, 60) : 'Links saved');
        return window.renderSetup();
      }
      if (a === 'hintX') { ctlDismiss(b.dataset.k); return window.renderSetup(); }
      if (a === 'hintAll') { ctlUndismissAll(['lnk:', 'chk:', 'sug:']); return window.renderSetup(); }
      if (a === 'suEdit') { const id = Number(b.dataset.u); _cxSU.edit[id] = !_cxSU.edit[id]; return window.renderSetup(); }
      if (a === 'suDel') {
        const id = Number(b.dataset.u), u = ctlUnit(id);
        if (!u) return;                                               // C6: removed meanwhile (a 2nd tap on its row)
        if (_cxUnitHasEntries(id)) { if (typeof ctlToast === 'function') ctlToast('Unit has entries – it can\'t be removed'); return; }
        if (!(await ccConfirm('Remove from Controlling?', ccEscHtml(u.name), 'Remove', true))) return;
        try {
          await ctlDeleteUnit(id);
          ctlSollReset();
        } catch (e) { cxToastErr(e); }
        return window.renderSetup();
      }
      if (a === 'pkAdd') {
        const pk = (window._src.parking || []).find(x => String(x.id) === String(b.dataset.pk));
        const pid = Number(document.getElementById('cxPkProp-' + b.dataset.pk)?.value);
        const p = ctlProp(pid);
        if (!pk || !p) return;
        if (ctlSetupLinkState().used.has('rentals_parking|' + String(pk.id))) return;   // C6: added meanwhile (a 2nd tap) — the same rule that lists it as missing
        b.disabled = true;
        // short name inside the property: "Studio One TG 3" in Studio One → "TG 3"
        const short = String(pk.name).toLowerCase().startsWith(String(p.name).toLowerCase() + ' ') ? String(pk.name).slice(p.name.length + 1) : pk.name;
        const type = /garage|stellplatz|\btg\b/i.test(String(pk.parking_type || '')) ? pk.parking_type : 'Stellplatz';
        try {
          await ctlCreateUnit({ property_id: p.id, name: short, unit_type: type, source_type: 'rentals_parking', source_ref: String(pk.id) });
          delete _cxSU.pkPick[pk.id];
          ctlSollReset();
          if (typeof ctlToast === 'function') ctlToast(short + ' added to ' + p.name);
        } catch (e) { cxToastErr(e); }
        return window.renderSetup();
      }
      if (a === 'month') {
        // C6: on or off as the chip shows it, from the months in memory — they hold a tap still on its way (a 2nd chip lost the 1st)
        const [t, field] = b.dataset.t.split('|'), id = Number(b.dataset.id), mo = Number(b.dataset.m), on = !b.classList.contains('on');
        const row = (t === 'ctrl_properties' ? window._ctrl.properties : window._ctrl.categories).find(r => r.id === id);
        let cur = Array.isArray(row && row[field]) && row[field].length ? row[field].map(Number) : (field === 'grundsteuer_months' ? [2, 5, 8, 11] : []);
        cur = !on ? cur.filter(x => x !== mo) : cur.includes(mo) ? cur : cur.concat(mo).sort((x, y) => x - y);
        try { await ctlUpdateRow(t, id, { [field]: cur }); } catch (e) { cxToastErr(e); }
        return window.renderSetup();
      }
    },
    input: async (key, val) => {
      const [t, id, field] = key.split('|');
      try {
        await ctlUpdateRow(t, Number(id), { [field]: val === null ? null : cxR(val) });
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
      if (ev.target && /^cxPkProp-/.test(ev.target.id || '')) { _cxSU.pkPick[ev.target.id.slice(9)] = ev.target.value; return; }   // C6: kept for 'Add'
      if (!key) return;
      const [t, id, field] = key.split('|'), v = ev.target.value;
      let f;
      if (field === 'source') { const [st, ...ref] = v.split('|'); f = v ? { source_type: st, source_ref: ref.join('|') } : { source_type: null, source_ref: null }; }
      else f = { [field]: v || null };
      let saved = false;
      // #6: apartment changes of one property run one after the other, save AND unit step together, in tap order
      // (a slow first answer never lands after a quick re-pick)
      const aptQ = t === 'ctrl_properties' && field === 'rentals_apartment_ref', pid = Number(id);
      let done = null, mine = null;
      if (aptQ) { const prev = _cxSuAptQ[pid]; mine = _cxSuAptQ[pid] = new Promise(r => { done = r; }); if (prev) await prev; }
      try {
        await ctlUpdateRow(t, Number(id), f);
        saved = true;
        if (field === 'source') _cxSU.edit[Number(id)] = false;
        if (typeof ctlToast === 'function') ctlToast('Saved');
      } catch (e) { cxToastErr(e); }
      if (saved && aptQ) {   // #6: choosing the apartment adds its living unit, unlinking removes the one made here
        try {
          if (_cxSuLiving[pid]) await _cxSuLiving[pid].catch(() => null);   // the unit of a choice a moment ago is still being saved
          const mu = ctlUnit(_cxSuMade[pid]);                      // made here for an earlier choice, nothing booked on it → it follows
          if (mu && mu.property_id === pid && !_cxUnitHasEntries(mu.id) && String(mu.source_ref) !== String(v)) {
            if (!v || ctlSetupLinkState().used.has('rentals_apartment|' + String(v))) {   // set back to "not linked", or another unit takes this apartment's rent → no unit
              await ctlDeleteUnit(mu.id);
              delete _cxSuMade[pid];
              ctlSollReset();
            } else await ctlUpdateRow('ctrl_units', mu.id, { source_type: 'rentals_apartment', source_ref: String(v) });
          } else if (v) await _cxSuEnsureLiving(pid);
        } catch (e) { cxToastErr(e); }
      }
      if (aptQ) { done(); if (_cxSuAptQ[pid] === mine) delete _cxSuAptQ[pid]; }
      window.renderSetup();
    });
  }
};


/* ── + New property (a new purchase) ─────────────────────────────────────────────
   Name only: it goes to the end of the list (purchase order) and starts as a Rentals property.
   Rentals apartment, units and loan are linked in its card afterwards, like for every other property. */
function _cxSuNewPropHTML() {
  if (!_cxSU.newProp) return '<button class="cx-btn cx-btn--s cx-btn--full" style="margin-top:2px" data-cx="propNew">' +
    '<i class="ti ti-plus" aria-hidden="true"></i>New property</button>';
  return '<div class="cx-card" style="padding:12px 14px"><div class="cx-set">' +
    '<div class="cx-set__k">New property · e.g. after a purchase</div>' +
    '<label class="cx-f cx-f--l"><input type="text" id="cxSuNewProp" placeholder="Name · e.g. Musterstr. 5, WHG 3" aria-label="Name of the new property" autocomplete="off"' + (_cxSU.newName ? ' value="' + cxEsc(_cxSU.newName) + '"' : '') + '></label>' +
    '<div class="cx-r__sub">Added at the end of the list. Link the Rentals apartment (its unit is added with it) and the loan in its card afterwards. ' +
      'Kaufnebenkosten can be booked right away in One-off.</div>' +
    '<div class="cx-grid2" style="margin-top:8px"><button class="cx-btn cx-btn--s" data-cx="propNew">Cancel</button>' +
      '<button class="cx-btn cx-btn--p" data-cx="propAdd">Add property</button></div>' +
  '</div></div>';
}

/* C5 (#32): one drawing = one snapshot — a figure asked for again while it is drawn is worked out once (controlling-data.js ctlScope) */
window.renderSetup = ctlScope(window.renderSetup);
