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
const _CX_FREQ = ['monatlich', 'vierteljährlich', 'jährlich', 'sporadisch'];

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
  if (!obj) return cxPill('grey', 'Planwert');
  return auto ? cxPill('beige', 'vorgeschlagen') : cxPill('ok', 'verknüpft');
}
function _cxMonthChips(field, id, months) {
  const set = new Set((months || []).map(Number));
  return '<div class="cx-mchips">' + _CX_MS.map((l, i) =>
    '<button class="cx-mchip' + (set.has(i + 1) ? ' on' : '') + '" data-cx="month" data-t="' + field + '" data-id="' + id + '" data-m="' + (i + 1) + '" aria-label="' + CX_MONTHS[i] + '" aria-pressed="' + set.has(i + 1) + '">' + l + '</button>').join('') + '</div>';
}
const _cxOpt = (v, label, sel) => '<option value="' + cxEsc(v) + '"' + (sel ? ' selected' : '') + '>' + cxEsc(label) + '</option>';
const _cxMoney = (table, id, field, val, label) =>
  '<div class="cx-set__row"><span class="cx-set__k">' + cxEsc(label) + '</span><label class="cx-f cx-f--s"><input type="text" inputmode="decimal" data-cx-in="' + table + '|' + id + '|' + field + '" value="' + (val === null || val === undefined || val === '' ? '' : cxE2(val)) + '" placeholder="0,00" aria-label="' + cxEsc(label) + '"><span>€</span></label></div>';

window.renderSetup = function () {
  const host = document.getElementById('tab-setup');
  if (!host) return;
  CX.tab = 'setup';
  const S = window._src;
  const props = window._ctrl.properties.filter(p => p.active);
  const sugg = _cxSetupSuggestions();

  const linkCards = props.map(p => {
    const l = ctlPropLinks(p), casa = p.id === CASA_PROP_ID, k = 'set:' + p.id;
    let body = '<div class="cx-set">';
    if (!casa) body += '<div class="cx-set__row"><span class="cx-set__k">Rentals-Wohnung</span>' + _cxLinkPill(l.apt, l.aptAuto) + '</div>' +
      '<label class="cx-f cx-f--l"><select data-cx-sel="ctrl_properties|' + p.id + '|rentals_apartment_ref" aria-label="Rentals-Wohnung">' +
        _cxOpt('', '— Planwerte verwenden —', !l.apt) + S.apts.map(a => _cxOpt(a.id, a.name, l.apt && String(l.apt.id) === String(a.id))).join('') +
      '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>';
    body += '<div class="cx-set__row"><span class="cx-set__k">Darlehen · Properties</span>' + _cxLinkPill(l.loan, l.loanAuto) + '</div>' +
      '<label class="cx-f cx-f--l"><select data-cx-sel="ctrl_properties|' + p.id + '|loan_ref" aria-label="Darlehen">' +
        _cxOpt('', '— Planwerte verwenden —', !l.loan) + S.loans.map(x => _cxOpt(x.id, (x.name || 'Darlehen') + (x.rate ? ' · ' + cxEur(x.rate) : ''), l.loan && String(l.loan.id) === String(x.id))).join('') +
      '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>';
    if (!casa) body += '<div class="cx-set__row"><span class="cx-set__k">Grundsteuer fällig</span></div>' +
      _cxMonthChips('ctrl_properties|grundsteuer_months', p.id, Array.isArray(p.grundsteuer_months) && p.grundsteuer_months.length ? p.grundsteuer_months : [2, 5, 8, 11]);
    const units = ctlUnitsOf(p.id);
    if (units.length) body += '<div class="cx-set__sub">Einheiten</div>' + units.map(u => {
      const ul = ctlUnitLink(u, p), cur = ul ? ul.type + '|' + ul.ref : '';
      return '<div class="cx-set__row"><span class="cx-set__k">' + cxEsc(u.name) + '</span>' + _cxLinkPill(ul, ul && ul.auto) + '</div>' +
        '<label class="cx-f cx-f--l"><select data-cx-sel="ctrl_units|' + u.id + '|source" aria-label="Quelle ' + cxEsc(u.name) + '">' +
          _cxOpt('', '— Planwert verwenden —', !ul) +
          (S.apts.length ? '<optgroup label="Rentals · Wohnungen">' + S.apts.map(a => _cxOpt('rentals_apartment|' + a.id, a.name, cur === 'rentals_apartment|' + a.id)).join('') + '</optgroup>' : '') +
          (S.parking.length ? '<optgroup label="Rentals · Stellplätze">' + S.parking.map(a => _cxOpt('rentals_parking|' + a.id, a.name, cur === 'rentals_parking|' + a.id)).join('') + '</optgroup>' : '') +
          (S.rooms.length ? '<optgroup label="Casa Castel · Zimmer">' + S.rooms.map(r => _cxOpt('casa_room|' + r.name, r.name, cur === 'casa_room|' + r.name)).join('') + '</optgroup>' : '') +
        '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>';
    }).join('');
    body += '</div>';
    const linked = (casa || l.apt) && l.loan;
    const auto = l.aptAuto || l.loanAuto || units.some(u => { const ul = ctlUnitLink(u, p); return ul && ul.auto; });
    return cxCard({ key: k, title: p.name, sub: casa ? 'Zimmer aus Casa Castel' : (l.apt ? 'Rentals · ' + l.apt.name : 'ohne Rentals-Wohnung'),
                    status: !linked ? ['open', 'prüfen'] : auto ? ['beige', 'vorgeschlagen'] : ['ok', 'verknüpft'], body });
  }).join('');

  const cats = (window._ctrl.categories || []).map(c => {
    const freq = c.frequency || 'monatlich', isRate = c.code === 'RATE';
    return '<div class="cx-cat">' +
      '<div class="cx-set__row"><span class="cx-pn cx-pn--s">' + cxEsc(c.name || (isRate ? 'Kreditrate' : 'Kosten')) + '</span>' +
        (isRate ? cxPill('beige', 'aus Properties, wenn verknüpft') : cxPill(freq === 'monatlich' ? 'grey' : 'beige', freq)) + '</div>' +
      '<div class="cx-grid2">' +
        '<label class="cx-f"><input type="text" inputmode="decimal" data-cx-in="ctrl_castel_categories|' + c.id + '|default_amount" value="' + (c.default_amount === null || c.default_amount === undefined ? '' : cxE2(c.default_amount)) + '" placeholder="0,00" aria-label="Betrag"><span>€</span></label>' +
        '<label class="cx-f cx-f--l"><select data-cx-sel="ctrl_castel_categories|' + c.id + '|frequency" aria-label="Häufigkeit">' +
          _CX_FREQ.map(f => _cxOpt(f, f === 'sporadisch' ? 'bei Bedarf (Einmalig)' : f, f === freq)).join('') + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +
      '</div>' +
      (freq === 'monatlich' || _cxBedarf(freq) ? '' : '<div class="cx-set__k" style="margin-top:6px">Fällig in</div>' + _cxMonthChips('ctrl_castel_categories|due_months', c.id, c.due_months)) +
    '</div>';
  }).join('');

  // Fallback plan values — only what has no link
  const fb = [];
  for (const p of props) {
    const l = ctlPropLinks(p), rows = [];
    if (p.id !== CASA_PROP_ID) {
      if (!l.loan) rows.push(_cxMoney('ctrl_properties', p.id, 'def_rate', p.def_rate, 'Kreditrate'), _cxMoney('ctrl_properties', p.id, 'def_zinsen', p.def_zinsen, '  davon Zinsen'));
      if (!l.apt) rows.push(_cxMoney('ctrl_properties', p.id, 'def_hausgeld', p.def_hausgeld, 'Hausgeld'), _cxMoney('ctrl_properties', p.id, 'def_grundsteuer', p.def_grundsteuer, 'Grundsteuer / Quartal'));
      rows.push(_cxMoney('ctrl_properties', p.id, 'def_strom', p.def_strom, 'Strom / Monat'));
    }
    for (const u of ctlUnitsOf(p.id)) if (!ctlUnitLink(u, p))
      rows.push(_cxMoney('ctrl_units', u.id, 'def_kaltmiete', u.def_kaltmiete, u.name + ' · Kaltmiete'), _cxMoney('ctrl_units', u.id, 'def_nebenkosten', u.def_nebenkosten, u.name + ' · Nebenkosten'));
    if (rows.length) fb.push('<div class="cx-set__sub">' + cxEsc(p.name) + '</div>' + rows.join(''));
  }

  host.innerHTML = '<div class="cx-page">' +
    '<div class="cx-title">Setup</div><div class="cx-title__s">Einmal einrichten · danach kommen alle Soll-Werte automatisch</div>' +
    (sugg.length ? '<div class="cx-card cx-sum"><div class="cx-row-sb"><span class="cx-lbl">Vorschläge nach Namen</span>' + cxPill('beige', sugg.length + ' offen') + '</div>' +
      '<div class="cx-r__sub" style="margin:6px 0 10px">Werden schon verwendet. Einmal bestätigen, dann sind sie fest.</div>' +
      '<button class="cx-btn cx-btn--p cx-btn--full" data-cx="acceptAll"><i class="ti ti-checks" aria-hidden="true"></i>Alle Vorschläge übernehmen</button></div>' : '') +
    (() => {
      const chk = ctlDataChecks(window._ctrl.year, CX.month);
      return '<div class="cx-head"><span class="cx-lbl">Datenprüfung · ' + CX_MONTHS[CX.month - 1] + '</span></div>' +
        '<div class="cx-card cx-sum">' + (chk.length
          ? '<div class="cx-row-sb"><span class="cx-lbl">Bitte prüfen</span>' + cxPill('open', chk.length + (chk.length === 1 ? ' Hinweis' : ' Hinweise')) + '</div>' +
            chk.map(c => '<div class="cx-kv" style="margin-top:6px"><span><b style="font-weight:500;color:var(--cx-ink)">' + cxEsc(c.prop) + ' · ' + cxEsc(c.unit) + '</b><br>' + cxEsc(c.text) + '</span></div>').join('')
          : '<div class="cx-row-sb"><span class="cx-lbl">Mieten und Soll</span>' + cxPill('ok', 'Alles stimmig') + '</div>') +
        '</div>';
    })() +
    '<div class="cx-head"><span class="cx-lbl">Verknüpfungen</span></div>' + linkCards +
    '<div class="cx-head"><span class="cx-lbl">Casa Castel · Kostenarten</span></div><div class="cx-card">' + (cats || '<div class="cx-empty">Keine Kostenarten.</div>') + '</div>' +
    '<div class="cx-head"><span class="cx-lbl">Planwerte · nur ohne Verknüpfung</span></div>' +
    cxCard({ key: 'set:fallback', title: 'Planwerte', sub: fb.length ? 'für Einträge ohne Verknüpfung' : 'alles verknüpft', status: ['grey', fb.length ? 'Fallback' : 'nicht nötig'],
             body: '<div class="cx-set">' + (fb.join('') || '<div class="cx-r__sub">Alles ist verknüpft – keine Planwerte nötig.</div>') + '</div>' }) +
    '</div>';

  cxWire(host, {
    render: () => window.renderSetup(),
    click: async (a, b) => {
      if (a === 'acceptAll') {
        b.disabled = true;
        for (const [t, id, f] of _cxSetupSuggestions()) { try { await ctlUpdateRow(t, id, f); } catch (e) { cxToastErr(e); } }
        if (typeof ctlToast === 'function') ctlToast('Verknüpfungen gespeichert');
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
      try { await ctlUpdateRow(t, Number(id), { [field]: val === null ? null : cxR(val) }); if (typeof ctlToast === 'function') ctlToast('Gespeichert'); }
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
      try { await ctlUpdateRow(t, Number(id), f); if (typeof ctlToast === 'function') ctlToast('Gespeichert'); } catch (e) { cxToastErr(e); }
      window.renderSetup();
    });
  }
};
