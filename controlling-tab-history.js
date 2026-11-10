/* ─────────────────────────────────────────────────────────────
   CONTROLLING — MIETERHISTORIE PRÜFEN (Phase 3 · 5.9)
   controlling-tab-history.js   (opened from Setup)

   One screen to correct the past once. Per unit, every tenancy:
     · Einzug / Auszug (editable — written to the Tenants tab data)
     · rent history (rent_periods): add, delete, confirm the rent stored
       on the tenant as "Miete ab Einzug"
     · Staffel / NK steps that belong to this tenant
     · balance over every month with an entered payment
     · what doesn't add up (no Einzug, no Auszug, no rent, orphan steps)
   Nothing here guesses a number: every amount is typed or confirmed.
   ───────────────────────────────────────────────────────────── */

'use strict';

const _cxH = { open: {}, add: {} };

function _cxHTable(app) { return app === 'casa' ? 'tenant_records' : 'rnt_tenant_records'; }
function _cxHTenant(app, id) {
  const S = window._src;
  return (app === 'casa' ? S.casaTen : S.rntTen).find(t => String(t.id) === String(id)) || null;
}
function _cxHSync() {                                   // shared rent store → Controlling sources
  if (typeof CC_RP !== 'undefined') window._src.rentP = CC_RP.rows;
  if (typeof ctlSollReset === 'function') ctlSollReset();
}
const _cxHKind = k => ({ contract: 'contract', renewal: 'renewal', manual: 'manual', migrated: 'taken from the tenant',
                         staffel: 'Staffel', nk_change: 'NK change' }[k] || k || '');
function _cxHAmt(p) {
  const a = typeof ccRpAmount === 'function' ? ccRpAmount(p) : null;
  if (!a) return '—';
  const nkIn = a.mode === 'pauschal' ? Number(p.nebenkosten) || 0 : 0;   // the NK part inside the Pauschale
  return a.mode === 'pauschal' ? cxEur(a.total) + ' Pauschal' + (nkIn > 0 ? ' · davon NK ' + cxEur(nkIn) : '') : cxEur(a.kalt) + ' Kalt + ' + cxEur(a.nk) + ' NK';
}
/* Nov 2026 fix: the NK part inside a Pauschale saved with the tenant (kaltmiete + nebenkosten, the room's
   Pauschal baseline) — what Controlling counts as NK until the rent is confirmed. "Confirm" and
   "Add rent from a date" used to drop it: the Soll turned all Kalt and Settlements counted that NK as your cost. */
function _cxHLegacyNkIncl(t) {
  const n = Number(t.nebenkosten) || 0;
  return n > 0 ? n : null;
}
/* The rent saved with the tenant → their first rent entry (from the move-in), as Controlling shows it */
function _cxHConfirmLegacy(db, app, t) {
  const pa = _cxHModeOf(app, t) === 'pauschal';
  return ccRpSetRent(db, { app, rec: { ...t, kaltmiete: null, nebenkosten: null }, validFrom: t.mietbeginn, mode: pa ? 'pauschal' : 'kalt_nk',
    kalt: pa ? (Number(t.kaltmiete) || 0) + (Number(t.nebenkosten) || 0) : t.kaltmiete,
    nk: pa ? null : t.nebenkosten, nkIncl: pa ? _cxHLegacyNkIncl(t) : undefined,
    kind: 'migrated', source: 'migration', note: 'confirmed in tenant history' });
}

/* Problems of one tenancy (shown on the unit card and in the summary) */
function _cxHIssues(w) {
  const out = [];
  if (w.noStart) out.push('move-in missing');
  if (w.noEnd) out.push('move-out missing');
  const legacy = w.t.kaltmiete != null || w.t.nebenkosten != null;
  if (!w.periods.length && !legacy) out.push('no rent saved');
  else if (!w.periods.length) out.push(w.app === 'casa' ? 'rent unconfirmed (Pauschal / Kalt + NK from today\'s room setting)' : 'rent unconfirmed');   // fix 6
  const per = w.periods.length ? w.periods[w.periods.length - 1] : null;                     // fix 4
  // Nov 2026: the Contract end the tenant card shows first (same as the Soll tab), else the last entry's own end
  const ceCard = typeof _cxContractEnd === 'function' ? _cxContractEnd({ type: w.app === 'casa' ? 'casa_room' : 'rentals' }, w.t) : '';
  const ce = ceCard || (per && per.contract_end ? ccRpIso(per.contract_end) : '');
  if (ce && ce < cxToday() && !w.t.mietende && w.t.status === 'active') out.push('contract ended on ' + cxFmtDate(ce) + ' – move-out or renewal missing');
  if (w.balance && w.balance.missing) out.push(w.balance.missing + (w.balance.missing === 1 ? ' month' : ' months') + ' without a payment entry (' + cxEur(w.balance.missingSum) + ')');   // fix 5
  return out;
}

function _cxHTenancyHTML(u, pid, w) {
  const key = w.app + ':' + w.id;
  const iss = _cxHIssues(w);
  const status = w.t.status === 'active' ? cxPill('ok', 'active') : cxPill('grey', 'former');
  const bal = w.balance || { saldo: 0, months: 0 };
  // CP1 (#28): "balanced for the 1 month entered · 9 months not entered (5.400,00 €)" — the part not entered in amber
  // (#9E5A17 = 5.2:1 on the card; the lighter #B0661E was 4.3:1)
  const nMo = n => n + (n === 1 ? ' month' : ' months');
  const balTxt = cxEsc(!bal.months ? 'no payments entered yet'
    : (bal.saldo > 0.005 ? 'in arrears ' + cxEur(bal.saldo) : bal.saldo < -0.005 ? 'overpaid ' + cxEur(-bal.saldo) : 'balanced') + ' for the ' + nMo(bal.months) + ' entered') +
    (bal.missing ? ' · <span class="cx-h-miss" style="display:inline-block;color:#9E5A17;font-weight:500">' + cxEsc(nMo(bal.missing) + ' not entered (' + cxEur(bal.missingSum) + ')') + '</span>' : '');
  const dateIn = (field, val) => '<label class="cx-f cx-f--l"><input type="text" placeholder="TT.MM.JJJJ" data-h-date="' + cxEsc(key + '|' + field) + '" value="' + cxEsc(val ? cxFmtDate(val) : '') + '" aria-label="' + (field === 'mietbeginn' ? 'Move-in' : 'Move-out') + '"></label>';

  const periods = w.periods.map(p =>
    '<div class="cx-kv" style="margin-top:4px"><span>from ' + cxFmtDate(ccRpIso(p.valid_from)) + ' · ' + cxEsc(_cxHKind(p.kind)) +
      (p.first_month === 'voll' ? ' · first month in full' : '') + (p.last_month === 'voll' ? ' · last month in full' : '') + '</span>' +
    '<span>' + _cxHAmt(p) + ' <button class="cx-link" style="display:inline;padding:0 0 0 8px" data-h="delP" data-id="' + cxEsc(p.id) + '" aria-label="Delete"><i class="ti ti-x" aria-hidden="true"></i></button></span></div>').join('');

  const legacy = !w.periods.length && (w.t.kaltmiete != null || w.t.nebenkosten != null)
    ? '<div class="cx-kv" style="margin-top:4px"><span>saved with the tenant · ' + (w.legacyMode === 'pauschal' ? 'Pauschal' : 'Kalt + NK') + '</span><span>' +
        (w.legacyMode === 'pauschal' ? cxEur((Number(w.t.kaltmiete) || 0) + (Number(w.t.nebenkosten) || 0)) + ' Pauschal' +
                                         (_cxHLegacyNkIncl(w.t) ? ' · davon NK ' + cxEur(_cxHLegacyNkIncl(w.t)) : '')
                                      : cxEur(w.t.kaltmiete || 0) + ' Kalt + ' + cxEur(w.t.nebenkosten || 0) + ' NK') + '</span></div>' +
      (w.from ? '<button class="cx-btn cx-btn--full" style="margin-top:6px" data-h="confirm" data-k="' + cxEsc(key) + '"><i class="ti ti-check" aria-hidden="true"></i>Confirm as rent from move-in</button>' : '')
    : '';

  // Casa Castel has no Staffel — its steps are Mieterhöhungen (Pauschal or Kalt, by the rent valid on that day)
  const _stLine = h => {
    if (w.app !== 'casa') return _cxMhLabel(h) + ' from ' + cxFmtDate(ccRpIso(h.effective_date)) + ' · ' + cxEur(h.amount) + (((u && ctlUnitLink(u, ctlProp(pid))) || {}).type === 'rentals_parking' ? '' : ' Kalt');   // n44: the type picked; parking (also linked by name) has no Kalt
    const d = ccRpIso(h.effective_date);
    const at = w.periods.filter(p => ccRpIso(p.valid_from) && ccRpIso(p.valid_from) <= d).pop();
    const pau = (at ? at.mode : w.legacyMode) === 'pauschal';
    return 'Mieterhöhung from ' + cxFmtDate(d) + ' · ' + cxEur(h.amount) + (pau ? ' Pauschal' : ' Kalt');
  };
  const steps = w.staffel.map(_stLine)
    .concat(w.nkSteps.map(h => 'NK from ' + cxFmtDate(ccRpIso(h.effective_date)) + ' · ' + cxEur(h.amount)));

  const addOpen = !!_cxH.add[key];
  const add = addOpen
    ? '<div class="cx-set" style="margin-top:8px">' +
        '<div class="cx-set__row"><span class="cx-set__k">Valid from</span><label class="cx-f cx-f--l"><input type="text" placeholder="TT.MM.JJJJ" id="h-from-' + cxEsc(key) + '"></label></div>' +
        '<div class="cx-set__row"><span class="cx-set__k">Type</span><label class="cx-f cx-f--l"><select id="h-mode-' + cxEsc(key) + '">' +
          '<option value="kalt_nk"' + (w.legacyMode !== 'pauschal' ? ' selected' : '') + '>Kalt + NK</option>' +
          '<option value="pauschal"' + (w.legacyMode === 'pauschal' ? ' selected' : '') + '>Pauschal</option></select><i class="ti ti-chevron-down" aria-hidden="true"></i></label></div>' +
        '<div class="cx-set__row"><span class="cx-set__k">Kaltmiete / Pauschale</span><label class="cx-f cx-f--s"><input type="text" inputmode="decimal" placeholder="0,00" id="h-k-' + cxEsc(key) + '"><span>€</span></label></div>' +
        '<div class="cx-set__row"><span class="cx-set__k">Nebenkosten / davon NK</span><label class="cx-f cx-f--s"><input type="text" inputmode="decimal" placeholder="0,00" id="h-nk-' + cxEsc(key) + '"><span>€</span></label></div>' +
        '<div class="cx-set__row"><span class="cx-set__k">First month</span><label class="cx-f cx-f--l"><select id="h-fm-' + cxEsc(key) + '"><option value="anteilig">partial</option><option value="voll">in full</option></select><i class="ti ti-chevron-down" aria-hidden="true"></i></label></div>' +
        '<div class="cx-set__row"><span class="cx-set__k">Last month</span><label class="cx-f cx-f--l"><select id="h-lm-' + cxEsc(key) + '"><option value="anteilig">partial</option><option value="voll">in full</option></select><i class="ti ti-chevron-down" aria-hidden="true"></i></label></div>' +
        '<div style="display:flex;gap:8px;margin-top:8px"><button class="cx-btn" style="flex:1" data-h="addToggle" data-k="' + cxEsc(key) + '">Cancel</button>' +
        '<button class="cx-btn cx-btn--p" style="flex:1" data-h="addSave" data-k="' + cxEsc(key) + '">Save</button></div></div>'
    : '<button class="cx-link" data-h="addToggle" data-k="' + cxEsc(key) + '"><i class="ti ti-plus" aria-hidden="true"></i> Add rent from a date</button>';

  return '<div style="padding:12px 0;border-top:.5px solid var(--cc-rule)">' +
    '<div class="cx-row-sb"><span class="cx-pn cx-pn--s">' + cxEsc(w.name) + '</span><span>' + status + (iss.length ? ' ' + cxPill('open', 'check') : '') + '</span></div>' +
    (iss.length ? '<div class="cx-r__warn" style="margin-top:4px"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ' + cxEsc(iss.join(' · ')) + '</div>' : '') +
    '<div class="cx-set__row" style="margin-top:6px"><span class="cx-set__k" style="white-space:nowrap">Move-in</span>' + dateIn('mietbeginn', w.t.mietbeginn ? ccRpIso(w.t.mietbeginn) : '') + '</div>' +
    (_cxHCs(w.t) ? '<div class="cx-kv" style="border-top:none;padding:2px 0"><span>Contract start</span><span>' + cxFmtDate(_cxHCs(w.t)) +
      (w.t.rent_from === 'move' ? ' · rent from the move-in' : '') + '</span></div>' : '') +   // #10: the date the rent follows (changed in Tenants)
    '<div class="cx-set__row"><span class="cx-set__k" style="white-space:nowrap">Move-out</span>' + dateIn('mietende', w.t.mietende ? ccRpIso(w.t.mietende) : '') + '</div>' +
    '<div class="cx-set__sub" style="margin-top:8px">Rent</div>' + (periods || legacy || '<div class="cx-r__sub">no rent saved</div>') + add +
    (steps.length ? '<div class="cx-set__sub" style="margin-top:8px">Staffel / NK of this tenant</div>' + steps.map(t => '<div class="cx-r__sub">' + cxEsc(t) + '</div>').join('') : '') +
    '<div class="cx-kv" style="margin-top:8px"><span>Balance</span><span style="text-align:right">' + balTxt + '</span></div>' +
  '</div>';
}

window.renderHistory = function (host) {
  host = host || document.getElementById('tab-setup');
  if (!host) return;
  const props = window._ctrl.properties.filter(p => p.active);
  let nIssues = 0, nOrph = 0;
  const cards = props.map(p => ctlUnitsFor(p.id).map(u => {
    const h = ctlUnitHistory(u, p.id);
    if (!h.link) return '';
    const iss = h.tenancies.reduce((a, w) => a + _cxHIssues(w).length, 0) + (h.istNoTenant && h.istNoTenant.length ? 1 : 0);
    nIssues += iss; nOrph += h.orphans.length;
    const k = 'hist:' + p.id + ':' + (u.id ?? u.name), isOpen = _cxH.open[k] !== undefined ? _cxH.open[k] : iss + h.orphans.length > 0;
    const body = !isOpen ? '' : '<div style="padding:0 16px 8px">' +
      (h.tenancies.length ? h.tenancies.map(w => _cxHTenancyHTML(u, p.id, w)).join('') : '<div class="cx-r__sub" style="padding:10px 0">No tenants entered.</div>') +
      (h.istNoTenant && h.istNoTenant.length ? '<div class="cx-r__warn" style="margin-top:6px"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Payments entered, but per the data nobody lived here: ' +
        cxEsc(h.istNoTenant.length > 6 ? h.istNoTenant.slice(0, 6).join(', ') + ' …' : h.istNoTenant.join(', ')) +
        ' – check the move-in (maybe overwritten by a renewal)</div>' : '') +
      h.orphans.map(o => '<div class="cx-r__warn" style="margin-top:6px"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ' +
        (o.kind === 'staffel' ? (h.link.type === 'casa_room' ? 'Mieterhöhung' : _cxMhLabel(o.h)) : 'NK change') + ' from ' + cxFmtDate(ccRpIso(o.h.effective_date)) + ' (' + cxEur(o.h.amount) + ') belongs to no tenant – not used</div>').join('') +
      '</div>';
    return '<div class="cx-card"><button class="cx-ph" data-h="fold" data-k="' + cxEsc(k) + '" aria-expanded="' + isOpen + '">' +
      '<span class="cx-ph__l"><span class="cx-pn">' + cxEsc(u.name) + '</span><span class="cx-src">' + cxEsc(p.name) + ' · ' + h.tenancies.length + (h.tenancies.length === 1 ? ' tenant' : ' tenants') + '</span></span>' +
      '<span class="cx-ph__r">' + (iss + h.orphans.length ? cxPill('open', (iss + h.orphans.length) + ' to check') : cxPill('ok', 'consistent')) +
      '<i class="ti ti-chevron-' + (isOpen ? 'up' : 'down') + ' cx-chev" aria-hidden="true"></i></span></button>' + body + '</div>';
  }).join('')).join('');

  const missing = typeof CC_RP !== 'undefined' && CC_RP.missing;
  cxPaint(host, '<div class="cx-page" id="cxHist">' +
    '<button class="cx-link" data-h="back"><i class="ti ti-chevron-left" aria-hidden="true"></i> Setup</button>' +
    '<div class="cx-title">Tenant history</div><div class="cx-title__s">Move-in, move-out and rent per tenant · check once, then the Soll is right for every month</div>' +
    (missing ? '<div class="cx-card cx-sum"><div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> The table rent_periods is missing – please run the SQL update first.</div></div>' : '') +
    '<div class="cx-card cx-sum"><div class="cx-row-sb"><span class="cx-lbl">To check</span>' +
      (nIssues + nOrph ? cxPill('open', (nIssues + nOrph) + (nIssues + nOrph === 1 ? ' point' : ' points')) : cxPill('ok', 'All consistent')) + '</div>' +
      '<div class="cx-r__sub" style="margin-top:6px">"Rent unconfirmed" = the rent is only saved with the tenant. Confirm it once or enter the real rent from move-in.</div></div>' +
    cards + '</div>');   // B18: only what changed

  const root = document.getElementById('cxHist');
  if (root && !root._cxHWired) {                       // B18: the page is kept between redraws → wire it once
    root._cxHWired = true;
    root.addEventListener('click', ev => _cxHClick(ev, host));
    root.addEventListener('change', ev => _cxHChange(ev, host));
  }
};

async function _cxHClick(ev, host) {
  const b = ev.target.closest('[data-h]');
  if (!b || b.disabled) return;
  ev.stopPropagation();
  const a = b.dataset.h, key = b.dataset.k || '';
  const db = typeof _ctlSupa !== 'undefined' ? _ctlSupa : null;
  const rerender = () => window.renderHistory(host);
  if (a === 'back') { CX.hist = false; return window.renderSetup(); }
  if (a === 'fold') { _cxH.open[key] = b.getAttribute('aria-expanded') !== 'true'; return rerender(); }
  if (a === 'addToggle') { _cxH.add[key] = !_cxH.add[key]; return rerender(); }
  const [app, tid] = key.split(':');
  try {
    if (a === 'delP') {
      if (!(await ccConfirm('Delete this rent entry?', '', 'Delete', true))) return;
      await ccRpDelete(db, b.dataset.id);
    }
    if (a === 'confirm') {
      const t = _cxHTenant(app, tid); if (!t) return;
      await _cxHConfirmLegacy(db, app, t);                    // Pauschal keeps its NK part (Nov 2026 fix)
    }
    if (a === 'addSave') {
      const t = _cxHTenant(app, tid); if (!t) return;
      const v = id => document.getElementById(id + key);
      const from = ccRpIso(v('h-from-').value);
      if (!from) { ctlToast('Please enter "Valid from"'); return; }
      const mode = v('h-mode-').value === 'pauschal' ? 'pauschal' : 'kalt_nk';
      const k = typeof ccParseEUR === 'function' ? ccParseEUR(v('h-k-').value) : cxParse(v('h-k-').value);
      const nk = typeof ccParseEUR === 'function' ? ccParseEUR(v('h-nk-').value) : cxParse(v('h-nk-').value);
      if (k === null || k === undefined || isNaN(k)) { ctlToast('Please enter an amount'); return; }
      const nkIn = mode === 'pauschal' && nk !== null && nk !== undefined && !isNaN(nk) && nk > 0 ? nk : null;   // Pauschal: the NK part inside it
      if (nkIn !== null && nkIn > k) { ctlToast('The NK part can’t be more than the Pauschale'); return; }
      // the rent saved with the tenant becomes their first entry first — with its NK part (the engine's own
      // carry-over would drop it for a Pauschale); then the new rent from its date
      const ein = ccRpIso(t.mietbeginn);
      if ((t.kaltmiete != null || t.nebenkosten != null) && ein && from > ein && !ccRpFor(app, t.id).length) await _cxHConfirmLegacy(db, app, t);
      await ccRpSetRent(db, { app, rec: t, validFrom: from, mode, kalt: k, nk: mode === 'pauschal' ? null : nk, pauschale: k, nkIncl: nkIn ?? undefined,
        kind: ccRpIso(t.mietbeginn) && from > ccRpIso(t.mietbeginn) ? 'manual' : 'contract', source: 'history_screen',
        legacyMode: _cxHModeOf(app, t), first_month: v('h-fm-').value, last_month: v('h-lm-').value });
      _cxH.add[key] = false;
    }
    _cxHSync();
    ctlToast('Saved');
  } catch (e) {
    if (typeof ccRpIsMissing === 'function' && ccRpIsMissing(e)) ctlToast('Please run the SQL update first');
    else cxToastErr(e);
  }
  if (typeof ctlDataChanged === 'function') ctlDataChanged();   // C5: saved or not — the balances are worked out again
  rerender();
}

/* #10: the tenant's Contract start, read the same way as the Soll (controlling-soll.js _cxContractStart) */
function _cxHCs(t) {
  return typeof _cxContractStart === 'function' ? _cxContractStart(t) : (ccRpIso(t.vertragsbeginn) || '');
}

function _cxHModeOf(app, t) {
  if (app !== 'casa') return 'kalt_nk';
  const room = (window._src.rooms || []).find(r => String(r.name).toLowerCase() === String(t.room || '').toLowerCase());
  return typeof _cxLegacyMode === 'function' && room ? _cxLegacyMode({ type: 'casa_room', obj: room }, t) : 'kalt_nk';
}

/* Einzug / Auszug edits → the tenant record (same data as the Tenants tabs) */
async function _cxHChange(ev, host) {
  const el = ev.target;
  if (!el || !el.dataset || !el.dataset.hDate) return;
  ev.stopPropagation();
  const [key, field] = el.dataset.hDate.split('|');
  const [app, tid] = key.split(':');
  const t = _cxHTenant(app, tid); if (!t) return;
  const iso = ccRpIso(el.value) || null;
  if (field === 'mietbeginn' && !iso) { ctlToast('Move-in can\'t be empty'); return window.renderHistory(host); }
  // #10: say what really happens — the rent follows the Contract start (default) or, with "Rent from: Move-in"
  // or no Contract start, the move-in. The rent entries keep their dates either way.
  if (field === 'mietbeginn' && t.mietbeginn) {
    const cs = t.rent_from === 'move' ? '' : _cxHCs(t);
    const what = cs ? 'The rent follows the contract start (' + cxFmtDate(cs) + ') – change it in Tenants.'
                    : 'The rent then starts on the new move-in, ' + cxFmtDate(iso) + '.';
    if (!(await ccConfirm('Change the move-in?', what, 'Change'))) return window.renderHistory(host);
  }
  const before = t[field];
  t[field] = iso;
  try {
    const { error } = await ctlWriting(() => _ctlSupa.from(_cxHTable(app)).update({ [field]: iso }).eq('id', t.id))();
    if (error) throw error;
    ctlSollReset();
    ctlToast('Saved');
  } catch (e) { t[field] = before; if (typeof ctlDataChanged === 'function') ctlDataChanged(); cxToastErr(e); }   // C5: back to the date before
  window.renderHistory(host);
}

/* C5 (#32): one drawing = one snapshot — a figure asked for again while it is drawn is worked out once (controlling-data.js ctlScope) */
window.renderHistory = ctlScope(window.renderHistory);
/* C5: a rent entry saved or deleted here counts as a save — a read running meanwhile is read again after it (ctlSollLoad) */
if (typeof ccRpInsert === 'function') { ccRpInsert = ctlWriting(ccRpInsert); ccRpUpdate = ctlWriting(ccRpUpdate); ccRpDelete = ctlWriting(ccRpDelete); }
