/* ─────────────────────────────────────────────────────────────
   REAL ESTATE MANAGEMENT — CONTRACT FLOW
   cc-contract-flow.js   (landlord.html; Rentals joins in step 2)

   Generator (Rooms) → Draft PDF as often as you like, nothing saved.
   Approve → a summary of what goes where → on confirm:
     · the tenancy chosen in "For" is created or updated
       (name match on that room picks it automatically, former tenants included)
     · Move-in, Contract end, contract type, rent history, Kaution Soll, contact data
     · Übergabe: Zählerstände with Zählernummer, Move-out proposal, new address
     · the PDF → Documents › Unsigned
   Every save step can be repeated: "Approve again" after an error finishes
   without creating anything twice.

   Tenants tab: Documents (Unsigned | Signed, tap opens the iPhone viewer,
   Upload = photo library / camera / file, photos become one PDF, replace and
   delete only in Edit) and Zählerstände (Einzug | Auszug, editable).

   Both apps: Casa Castel (rooms, landlord.html) and Rentals (apartments +
   parking, rentals-index.html). What differs lives in one adapter per app
   (CCF_CASA / CCF_RENTALS) — tables, units, co-tenants, renew, doc names.

   Depends on: supabase-client.js (sbL), cc-german-format.js, cc-rent-engine.js,
   pdf-open.js, jsPDF; at call time the app's Tenants tab and generators.
   ───────────────────────────────────────────────────────────── */

const CCF_LINK_SECS = 3600;                 // prepared document links work for 1 hour


/* ── APP ADAPTERS ──────────────────────────────────────────── */
/* A "unit" is what a tenancy belongs to: Casa = the room name, Rentals = 'apt:<id>' / 'pk:<id>' */
const CCF_CASA = {
  app: 'casa', recTable: 'tenant_records', docTable: 'tenant_documents', bucket: 'tenant-documents',
  coTenants: false, password: true, renewDeleteFn: '_tnRenewDelete',
  recs: () => (typeof _tnRecords !== 'undefined' ? _tnRecords : []),
  docs: () => (typeof _tnDocs !== 'undefined' ? _tnDocs : {}),
  unitOf: r => r.room,
  unitRow: u => ({ room: u }),
  unitLabel: u => u,
  prefix: r => r.room || 'unknown',
  renewalRows: r => (typeof _tnRenewalRows === 'function' ? _tnRenewalRows(r) : []),
  currentRent: r => (typeof _tnCurrentRent === 'function' ? _tnCurrentRent(r, r.room) : null),
  redraw: () => { if (typeof _tnRender === 'function') _tnRender(); },
  // A (non-renewal) contract for an existing tenant replaces their first contract → fill the form from it
  contractPrefill(r) {
    const c = typeof _tnContracts === 'function' ? _tnContracts(r)[0] : null;
    if (!c) return null;
    return { mode: c.amt ? c.amt.mode : null, kalt: c.amt ? c.amt.kalt : null, nk: c.amt ? c.amt.nk : null,
             total: c.amt ? c.amt.total : null, start: c.start || null, end: c.end || null, name: c.name };
  },
  ensureKaution: id => (typeof _tnEnsureKaution === 'function' ? _tnEnsureKaution(id) : null),
  reload: async () => {
    if (typeof _tnLoad === 'function') await _tnLoad();
    const b = window._ccfBackTo; window._ccfBackTo = null;
    if (b && typeof _rcOpenTenant === 'function') _rcOpenTenant(b.room, '.tn-cstrip');   // the new Verlängerung line in view
  },
  viewDoc: (doc, label, rec) => { if (typeof _tnViewDoc === 'function') _tnViewDoc(doc.file_url, label, rec ? rec.room : ''); },
  contractDocType: (p, rec) => (p.ctype === 'kurzzeit' ? 'kurzzeitmietvertrag' : 'mietvertrag'),
  firstContract(rec, docs) {
    const base = (typeof _tnBaseContractType === 'function' && _tnBaseContractType(rec))
      || (typeof _tnRoomContractType === 'function' && _tnRoomContractType(rec.room)) || rec.contract_type;
    const out = [base === 'kurzzeit' || (base === 'jahres' && docs.some(d => d.type === 'kurzzeitmietvertrag')) ? 'kurzzeitmietvertrag' : 'mietvertrag'];
    ['mietvertrag', 'kurzzeitmietvertrag'].forEach(t => { if (!out.includes(t) && docs.some(d => d.type === t)) out.push(t); });
    // Once renewed, the first contract is called "Erstvertrag" (same name as in the rent bar)
    const renewed = typeof _tnContracts === 'function' && _tnContracts(rec).length > 1;
    return out.map((t, i) => ({ type: t, label: renewed && i === 0 ? 'Erstvertrag' : ccfDocLabel(t, rec) }));
  },
  meters: () => ccfMetersFromSettings(),
  openRenew(rec, renew) {
    const room = typeof appRooms !== 'undefined' ? appRooms.find(r => r.name === rec.room) : null;
    if (!room || typeof _openContract !== 'function') return;
    if (typeof switchTab === 'function') switchTab('rooms');
    _openContract(renew.ct, room.id, { ...renew, roomId: room.id, back: 'tenants' });   // Approve returns to this tenant
  },
  renewSwitch(type) {
    if (typeof _contractRenew === 'undefined' || !_contractRenew || typeof _openContract !== 'function') return;
    _openContract(type, _contractRenew.roomId, { ..._contractRenew });
  },
  afterApprove() {
    { const rn = typeof _contractRenew !== 'undefined' ? _contractRenew : null;   // Renew was started in Tenants → go back there
      const rec = rn && rn.back === 'tenants' && rn.tid ? ccfRec(rn.tid) : null;
      window._ccfBackTo = rec ? { room: rec.room } : null; }
    if (typeof ccDraftClear === 'function' && typeof _ROOM_DRAFT_KEY !== 'undefined') ccDraftClear(_ROOM_DRAFT_KEY);
    document.getElementById('contractOverlay')?.classList.remove('open');
    try { if (typeof _renderRoomsList === 'function' && document.getElementById('roomsList')) _renderRoomsList(); } catch (e) {}
  },
};
const CCF_RENTALS = {
  app: 'rentals', recTable: 'rnt_tenant_records', docTable: 'rnt_tenant_documents', bucket: 'rnt-tenant-documents',
  coTenants: true, password: false, renewDeleteFn: '_rntRenewDelete',
  recs: () => (typeof _rntRecords !== 'undefined' ? _rntRecords : []),
  docs: () => (typeof _rntDocs !== 'undefined' ? _rntDocs : {}),
  unitOf: r => (r.apartment_id ? 'apt:' + r.apartment_id : r.parking_id ? 'pk:' + r.parking_id : ''),
  unitRow: u => (String(u).startsWith('pk:') ? { apartment_id: null, parking_id: u.slice(3) } : { apartment_id: String(u).slice(4), parking_id: null }),
  unit(u) {
    const id = String(u).slice(String(u).indexOf(':') + 1);
    return String(u).startsWith('pk:')
      ? (typeof appParking !== 'undefined' ? appParking.find(x => String(x.id) === id) : null)
      : (typeof appApartments !== 'undefined' ? appApartments.find(x => String(x.id) === id) : null);
  },
  unitLabel(u) { const x = this.unit(u); return x ? x.name + (String(u).startsWith('pk:') && x.parking_type ? ' ' + x.parking_type : '') : ''; },
  prefix: r => r.apartment_id || r.parking_id || 'unknown',
  renewalRows: r => (typeof _rntRenewalRows === 'function' ? _rntRenewalRows(r) : []),
  currentRent: r => (typeof _rntCurrentRent === 'function' ? _rntCurrentRent(r) : null),
  redraw: () => { if (typeof _rntRender === 'function') _rntRender(); },
  ensureKaution: id => (typeof _rntEnsureKaution === 'function' ? _rntEnsureKaution(id) : null),
  reload: () => (typeof _rntLoad === 'function' ? _rntLoad() : null),
  viewDoc: (doc, label, rec) => { if (typeof _rntViewDoc === 'function') _rntViewDoc(doc.file_url, label, rec ? CCF_RENTALS.unitLabel(CCF_RENTALS.unitOf(rec)) : ''); },
  contractDocType: (p, rec) => (String(p.room).startsWith('pk:') ? 'parkplatz_mietvertrag' : 'mietvertrag'),
  firstContract(rec, docs) {
    if (rec.parking_id) return [{ type: 'parkplatz_mietvertrag', label: 'Parkplatz-Mietvertrag' }];
    const apt = this.unit('apt:' + rec.apartment_id);
    const gw = apt && apt.zimmer_type === 'Gewerbefläche';
    const ct = typeof _rntTypedPeriods === 'function' && _rntTypedPeriods(rec).length
      ? (_rntTypedPeriods(rec)[0].contract_type || rec.contract_type) : rec.contract_type;
    const out = [{ type: 'mietvertrag', label: gw ? 'Gewerbemietvertrag' : ct === 'kurzzeit' ? 'Mietvertrag befristet' : 'Mietvertrag' }];
    if (docs.some(d => d.type === 'uebergabeprotokoll')) out.push({ type: 'uebergabeprotokoll', label: 'Übergabeprotokoll' });
    return out;
  },
  meters(rec) {
    const apt = rec && rec.apartment_id ? this.unit('apt:' + rec.apartment_id) : null;
    return ccfMetersFromZaehler(apt ? apt.zaehler : []);
  },
  openRenew(rec, renew) {
    if (!rec.apartment_id || typeof _aptOpenContract !== 'function') return;
    if (typeof switchTab === 'function') switchTab('apartments');
    setTimeout(() => _aptOpenContract(renew.ct, rec.apartment_id, { ...renew, aptId: rec.apartment_id, mode: 'kalt_nk' }), 80);
  },
  renewSwitch(type) {
    if (typeof _aptContractRenew === 'undefined' || !_aptContractRenew || typeof _aptOpenContract !== 'function') return;
    _aptOpenContract(type, _aptContractRenew.aptId, { ..._aptContractRenew });
  },
  afterApprove() {
    ['_APT_DRAFT_KEY', '_PK_DRAFT_KEY'].forEach(k => { try { const key = eval(k); if (typeof ccDraftClear === 'function') ccDraftClear(key); } catch (e) {} });
    if (typeof _aptClearContractDraft === 'function') _aptClearContractDraft();
    document.getElementById('aptContractOverlay')?.classList.remove('open');
    document.getElementById('pkContractOverlay')?.classList.remove('open');
  },
};
function ccfA() { return typeof _rntRecords !== 'undefined' ? CCF_RENTALS : CCF_CASA; }
/* Meter lists: Casa = Settings › Zähler · Rentals = the apartment's own Zähler */
function ccfMetersFromSettings() {
  const s = typeof appSettings !== 'undefined' ? appSettings : {};
  let z = s.zaehler;
  if (typeof z === 'string') { try { z = JSON.parse(z); } catch (e) { z = []; } }
  return (Array.isArray(z) ? z : []).filter(x => x && x.type).map(x => ({ meter: x.type, no: x.nummer || '', unit: ccfMeterUnit(x.type) }));
}
function ccfMetersFromZaehler(list) {
  const seen = {};
  return (list || []).filter(z => z && (z.typ || z.type)).map(z => {
    const typ = z.typ || z.type, no = z.zaehler_nr || z.nummer || '';
    seen[typ] = (seen[typ] || 0) + 1;
    return { meter: seen[typ] > 1 ? typ + ' ' + seen[typ] : typ, no, unit: ccfMeterUnit(typ), id: z.id };
  });
}

/* ── SMALL HELPERS ─────────────────────────────────────────── */
function ccfIso(v) {
  if (!v) return null;
  if (typeof ccParseDate === 'function') return ccParseDate(v);
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : null;
}
function ccfFmt(v) { const i = ccfIso(v); return i ? i.slice(8, 10) + '.' + i.slice(5, 7) + '.' + i.slice(0, 4) : ''; }
function ccfFmtShort(v) {   // "29.09." this year · "29.09.2025" otherwise (the year only where it isn't clear)
  const i = ccfIso(v); if (!i) return '';
  return i.slice(8, 10) + '.' + i.slice(5, 7) + '.' + (i.slice(0, 4) !== ccfToday().slice(0, 4) ? i.slice(0, 4) : '');
}
function ccfToday() { return typeof ccTodayISO === 'function' ? ccTodayISO() : new Date().toISOString().slice(0, 10); }
function ccfAddDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function ccfAddYears(iso, n) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10);
}
function ccfNum(v) {
  if (v === '' || v == null) return null;
  if (typeof ccParseEUR === 'function') return ccParseEUR(v);
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : null;
}
function ccfEur(n) { return typeof ccFmtEUR === 'function' ? ccFmtEUR(Number(n) || 0) : (Number(n) || 0).toFixed(2) + ' €'; }
function ccfNumFmt(n, dec) {
  if (n == null || n === '') return '';
  return typeof ccFmtNum === 'function' ? ccFmtNum(Number(n), dec == null ? 2 : dec) : String(n);
}
function ccfEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function ccfNorm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function ccfName(r) { return r ? [r.first_name, r.last_name].filter(Boolean).join(' ') : ''; }
function ccfSplitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return { first_name: parts.slice(0, -1).join(' ') || parts[0] || '', last_name: parts.length > 1 ? parts[parts.length - 1] : '' };
}
function ccfRecs() { return ccfA().recs(); }
function ccfDocsOf(tid) { return ccfA().docs()[tid] || []; }
function ccfRec(id) { return ccfRecs().find(r => String(r.id) === String(id)) || null; }
function ccfCtLabel(ct) { return ct === 'kurzzeit' ? 'Kurzzeit' : ct === 'jahres' ? 'Jahresvertrag' : ct === 'mietvertrag' ? 'Mietvertrag' : ''; }
function ccfToast(msg, isError) {
  if (typeof ccToast === 'function') return ccToast(msg, isError);
  if (isError) alert(msg);
}
function ccfBirthdayText(v) {           // stored birthdays may be ISO or typed text
  if (!v) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? ccfFmt(v) : String(v);
}

/* ── TENANCIES OF A ROOM ───────────────────────────────────── */
function ccfRoomTenancies(room) {
  const today = ccfToday();
  const list = ccfRecs().filter(r => ccfA().unitOf(r) === room).map(rec => {
    const inAt = ccfIso(rec.mietbeginn);
    const role = rec.status === 'active' ? (inAt && inAt > today ? 'next' : 'current') : 'former';
    return { rec, role };
  });
  const ord = { current: 0, next: 1, former: 2 };
  const key = t => ccfIso(t.rec.mietende) || ccfIso(t.rec.mietbeginn) || '';
  return list.sort((a, b) => ord[a.role] - ord[b.role] || key(b).localeCompare(key(a)));
}
function ccfRoleText(t) {
  if (!t) return '';
  if (t.role === 'current') return 'current tenant';
  if (t.role === 'next') return 'next tenant' + (t.rec.mietbeginn ? ' · moves in ' + ccfFmt(t.rec.mietbeginn) : '');
  return 'former tenant' + (t.rec.mietende ? ' · moved out ' + ccfFmt(t.rec.mietende) : '');
}
function ccfTenancy(room, id) { return ccfRoomTenancies(room).find(t => String(t.rec.id) === String(id)) || null; }
/* Who can be picked in "For": current + next tenant. Former tenants are done —
   only Übergabe Auszug also offers the one who moved out last (it is often
   written on or after the last day, when the tenancy already shows as former). */
function ccfChoices(room, mode, occasion) {
  const ts = ccfRoomTenancies(room);
  const live = ts.filter(t => t.role !== 'former');
  if (mode === 'ueberg' && occasion === 'auszug') {
    const last = ts.find(t => t.role === 'former');
    if (last) live.push(last);
  }
  return live;
}
function ccfMatchName(room, name, mode, occasion) {
  const want = ccfNorm(name); if (!want) return null;
  const hit = ccfChoices(room, mode, occasion).find(t => ccfNorm(ccfName(t.rec)) === want);
  return hit ? hit.rec : null;
}
function ccfForOptions(room, mode, selected, occasion) {
  const ts = ccfChoices(room, mode, occasion);
  let html = mode === 'contract' ? `<option value="new"${selected === 'new' ? ' selected' : ''}>New tenancy</option>` : '';
  if (mode === 'ueberg' && !ts.length) html += '<option value="">No tenant on this room yet</option>';
  html += ts.map(t => {
    const v = String(t.rec.id);
    const role = t.role === 'current' ? 'current' : t.role === 'next' ? 'next' : 'former';
    return `<option value="${ccfEsc(v)}"${String(selected) === v ? ' selected' : ''}>${ccfEsc(ccfName(t.rec) || '—')} · ${role}</option>`;
  }).join('');
  return html;
}

/* ── GENERATOR: "FOR" LINE ─────────────────────────────────── */
/* o = { mode:'contract'|'ueberg', room, renew, occasion, fields:{name,adr,dob,email,tel,kaution}, switchTo } */
let _ccfFor = null;
function ccfForDefault(o) {
  if (o.renew && o.renew.tid) return String(o.renew.tid);
  const ts = ccfChoices(o.room, o.mode, o.occasion);
  if (o.mode === 'contract') { const nx = ts.find(t => t.role === 'next'); return nx ? String(nx.rec.id) : 'new'; }
  const pick = o.occasion === 'einzug'
    ? (ts.find(t => t.role === 'next') || ts.find(t => t.role === 'current'))
    : (ts.find(t => t.role === 'current') || ts.find(t => t.role === 'former'));
  return pick ? String(pick.rec.id) : (ts[0] ? String(ts[0].rec.id) : '');
}
function ccfForHTML(o) {
  const sel = ccfForDefault(o);
  if (o.renew && o.renew.tid) {
    const rec = ccfRec(o.renew.tid);
    return `<div class="ccf-for" id="ccf-for-box">
      <div class="ccf-for-row"><label class="ccf-for-lbl" for="rc-for">For</label>
        <select id="rc-for" class="ccf-for-sel" disabled><option value="${ccfEsc(sel)}" selected>${ccfEsc(ccfName(rec))}</option></select></div>
      <div class="ccf-for-hint">Renewal of this tenancy — same tenant, the first Kaution stays.${o.switchTo
        ? ` <button type="button" class="ccf-link" onclick="ccfRenewSwitch('${o.switchTo}')">Switch to ${o.switchTo === 'mietvertrag' ? 'Mietvertrag' : 'Kurzzeit'}</button>` : ''}</div>
    </div>`;
  }
  return `<div class="ccf-for" id="ccf-for-box">
    <div class="ccf-for-row"><label class="ccf-for-lbl" for="rc-for">For</label>
      <select id="rc-for" class="ccf-for-sel">${ccfForOptions(o.room, o.mode, sel, o.occasion)}</select></div>
    <div class="ccf-for-hint" id="ccf-for-hint"></div>
  </div>`;
}
function ccfForValue() { return document.getElementById('rc-for')?.value || ''; }
function ccfForInit(o, prefill) {
  _ccfFor = { ...o, auto: false };
  const sel = document.getElementById('rc-for');
  if (!sel) return;
  sel.addEventListener('change', () => { _ccfFor.auto = false; ccfForApply(sel.value, true); });
  const nameEl = o.fields && document.getElementById(o.fields.name);
  if (nameEl && !(o.renew && o.renew.tid)) {
    let t = null;
    nameEl.addEventListener('input', () => { clearTimeout(t); t = setTimeout(ccfForAutoMatch, 250); });
  }
  ccfForApply(sel.value, prefill !== false);
}
/* Typing a name that exists on this room picks that tenancy (your rule: exact name match) */
function ccfForAutoMatch() {
  const o = _ccfFor, sel = document.getElementById('rc-for');
  if (!o || !sel || sel.disabled) return;
  const name = document.getElementById(o.fields.name)?.value || '';
  const rec = ccfMatchName(o.room, name, o.mode, o.occasion);
  if (rec && sel.value !== String(rec.id)) { sel.value = String(rec.id); o.auto = true; ccfForApply(sel.value, false); }
  else if (!rec && o.auto && o.mode === 'contract') { sel.value = 'new'; o.auto = false; ccfForApply('new', false); }
}
function ccfForApply(val, fill) {
  const o = _ccfFor; if (!o) return;
  const hint = document.getElementById('ccf-for-hint');
  const t = val && val !== 'new' ? ccfTenancy(o.room, val) : null;
  if (hint) {
    hint.textContent = t ? ccfRoleText(t) + (o.auto ? ' · picked by name' : '')
      : o.mode === 'contract' ? 'New tenancy — typing a name that exists on this room picks that tenant.'
      : 'No tenant on this room yet — approve the contract first.';
  }
  if (!fill || !o.fields) return;
  const set = (key, v) => { const el = o.fields[key] && document.getElementById(o.fields[key]); if (el) el.value = v || ''; };
  if (t) {
    set('name', ccfName(t.rec)); set('adr', t.rec.address); set('dob', ccfBirthdayText(t.rec.birthday));
    set('email', t.rec.email); set('tel', t.rec.phone);
    ccfFillCoTenants(o.fields, t.rec);
    if (o.mode === 'contract' && o.fields.kaution && Number(t.rec.kaution_soll) > 0) ccfSetKaution(o.fields.kaution, Number(t.rec.kaution_soll), 'Kaution Soll of ' + ccfName(t.rec));
    if (o.mode === 'contract' && !(o.renew && o.renew.tid)) ccfPrefillFromTenancy(o, t.rec);
  } else if (o.mode === 'contract') {
    ['name', 'adr', 'dob', 'email', 'tel'].forEach(k => set(k, ''));
    ccfFillCoTenants(o.fields, null);
    ccfPrefillFromTenancy(o, null);
  }
}
/* Miete block + dates of an existing tenancy (Casa). null = back to what the form had (the room's asking rent). */
function ccfPrefillFromTenancy(o, rec) {
  const fx = ccfA().contractPrefill; if (typeof fx !== 'function') return;
  const box = document.getElementById('ccf-miete');
  const seg = document.getElementById('rc-mode'), kIn = document.getElementById('rc-kalt'), nIn = document.getElementById('rc-nk');
  const hint = box && box.querySelector('.ccf-hint');
  const sEl = o.fields && o.fields.start ? document.getElementById(o.fields.start) : null;
  const eEl = o.fields && o.fields.end ? document.getElementById(o.fields.end) : null;
  if (box && !box.dataset.orig) box.dataset.orig = JSON.stringify({ mode: seg ? seg.dataset.mode : null, kalt: kIn ? kIn.value : '', nk: nIn ? nIn.value : '', hint: hint ? hint.textContent : '' });
  const changed = () => { ccfMieteRefresh(); if (typeof _ccfMieteOnChange === 'function') _ccfMieteOnChange(); };
  if (!rec) {   // New tenancy: the room's asking rent again, dates empty (only what this function had filled)
    if (box && box.dataset.filled) {
      const o0 = JSON.parse(box.dataset.orig || '{}');
      if (seg && o0.mode) seg.dataset.mode = o0.mode;
      if (kIn) kIn.value = o0.kalt || ''; if (nIn) nIn.value = o0.nk || ''; if (hint && o0.hint) hint.textContent = o0.hint;
      delete box.dataset.filled; changed();
    }
    if (sEl && sEl.dataset.ccfFilled) { sEl.value = ''; delete sEl.dataset.ccfFilled; }
    if (eEl && eEl.dataset.ccfFilled) { eEl.value = ''; delete eEl.dataset.ccfFilled; }
    return;
  }
  const c = fx(rec); if (!c) return;
  if (box && c.mode && c.total != null) {
    const pa = c.mode === 'pauschal';
    if (seg) seg.dataset.mode = pa ? 'pauschal' : 'kalt_nk';
    if (kIn) kIn.value = ccfNumFmt(pa ? c.total - (Number(c.nkIncl) || 0) : c.kalt);
    if (nIn) nIn.value = ccfNumFmt(pa ? (Number(c.nkIncl) || 0) : c.nk);
    if (hint) hint.textContent = 'Prefilled from ' + ccfName(rec) + '’s ' + (c.name || 'contract') + ' — change it only if this contract differs.';
    box.dataset.filled = '1'; changed();
  }
  if (sEl && c.start) { sEl.value = c.start; sEl.dataset.ccfFilled = '1'; sEl.dispatchEvent(new Event('input', { bubbles: true })); }
  if (eEl && c.end)   { eEl.value = c.end;   eEl.dataset.ccfFilled = '1'; eEl.dispatchEvent(new Event('input', { bubbles: true })); }
}

/* Rentals: Mieter 2 / 3 of the tenancy fill (and show) the generator's extra blocks */
function ccfFillCoTenants(f, rec) {
  [2, 3].forEach(n => {
    const b = f && f['t' + n]; if (!b) return;
    const nm = rec ? [rec['first_name_' + n], rec['last_name_' + n]].filter(Boolean).join(' ') : '';
    const val = { name: nm, adr: rec && rec['address_' + n], dob: rec && ccfBirthdayText(rec['birthday_' + n]),
                  email: rec && rec['email_' + n], tel: rec && rec['phone_' + n] };
    Object.keys(val).forEach(k => { const el = b[k] && document.getElementById(b[k]); if (el) el.value = val[k] || ''; });
    const w = b.wrap && document.getElementById(b.wrap);
    if (w) w.style.display = nm ? '' : 'none';
  });
  if (f && f.addBtn) { const ab = document.getElementById(f.addBtn); const w3 = f.t3 && document.getElementById(f.t3.wrap);
    if (ab) ab.style.display = w3 && w3.style.display !== 'none' ? 'none' : ''; }
}
function ccfSetKaution(id, amount, hintText) {
  const el = document.getElementById(id); if (!el) return;
  el.removeAttribute('data-auto');
  el.value = String(amount);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.removeAttribute('data-auto');
  const box = el.closest('.rm-kaution-row') || el.parentElement;
  let h = box && box.parentElement && box.parentElement.querySelector('.ccf-kaution-hint');
  if (!h && box) { h = document.createElement('div'); h.className = 'ccf-kaution-hint'; box.insertAdjacentElement('afterend', h); }
  if (h) h.textContent = hintText || '';
}

/* ── GENERATOR: MIETE BLOCK ────────────────────────────────── */
function ccfMieteHTML(o) {
  const mode = o.mode === 'kalt_nk' ? 'kalt_nk' : 'pauschal';
  return `<div class="ccf-miete" id="ccf-miete">
    <div class="rm-fields-title">Miete</div>
    <div class="ccf-seg" id="rc-mode" data-mode="${mode}" role="group" aria-label="Nebenkosten">
      <button type="button" data-v="pauschal">Pauschal</button><button type="button" data-v="kalt_nk">Kalt + NK</button>
    </div>
    <div class="rm-field-row">
      <div class="rm-field"><label for="rc-kalt">Kaltmiete €</label>
        <input class="rm-input" id="rc-kalt" type="text" inputmode="decimal" autocomplete="off" value="${ccfNumFmt(o.kalt)}"/></div>
      <div class="rm-field"><label for="rc-nk">Nebenkosten €</label>
        <input class="rm-input" id="rc-nk" type="text" inputmode="decimal" autocomplete="off" value="${ccfNumFmt(o.nk)}"/></div>
    </div>
    <div class="ccf-warm"><span id="rc-warm-lbl">Warmmiete</span><span id="rc-warm"></span></div>
    <p class="ccf-hint">${ccfEsc(o.note || 'Prefilled from the room’s asking rent — change it for this contract.')}</p>
  </div>`;
}
function ccfMieteGet() {
  const box = document.getElementById('ccf-miete'); if (!box) return null;
  const mode = document.getElementById('rc-mode')?.dataset.mode === 'kalt_nk' ? 'kalt_nk' : 'pauschal';
  const kalt = ccfNum(document.getElementById('rc-kalt')?.value) || 0;
  const nk   = ccfNum(document.getElementById('rc-nk')?.value) || 0;
  return { mode, kalt, nk, total: Math.round((kalt + nk) * 100) / 100 };
}
function ccfMieteRefresh() {
  const m = ccfMieteGet(); if (!m) return;
  const w = document.getElementById('rc-warm'), l = document.getElementById('rc-warm-lbl');
  if (l) l.textContent = m.mode === 'pauschal' ? 'Pauschalmiete' : 'Warmmiete';
  // Pauschal: the second field is the NK part inside the Pauschale (0 = no NK) – used by the NK-Abrechnung
  const lk = document.querySelector('label[for="rc-kalt"]'), ln = document.querySelector('label[for="rc-nk"]');
  if (lk) lk.textContent = m.mode === 'pauschal' ? 'Miete ohne NK €' : 'Kaltmiete €';
  if (ln) ln.textContent = m.mode === 'pauschal' ? 'davon NK €' : 'Nebenkosten €';
  if (w) w.textContent = ccfEur(m.total);
}
let _ccfMieteOnChange = null;
function ccfMieteInit(onChange) {
  _ccfMieteOnChange = onChange || null;
  const seg = document.getElementById('rc-mode');
  seg?.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    seg.dataset.mode = b.dataset.v; ccfMieteRefresh(); if (onChange) onChange();
  }));
  // A click on the switch itself (the 2-hour draft restores modes this way) toggles it
  seg?.addEventListener('click', e => {
    if (e.target !== seg) return;
    seg.dataset.mode = seg.dataset.mode === 'kalt_nk' ? 'pauschal' : 'kalt_nk'; ccfMieteRefresh(); if (onChange) onChange();
  });
  ['rc-kalt', 'rc-nk'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('input', () => { ccfMieteRefresh(); if (onChange) onChange(); });
    el.addEventListener('blur', () => { const n = ccfNum(el.value); if (n != null) el.value = ccfNumFmt(n); ccfMieteRefresh(); });
  });
  ccfMieteRefresh();
}

/* ── GENERATOR FOOTER ──────────────────────────────────────── */
function ccfFooterHTML(canApprove) {
  return `<button class="rm-btn rm-btn--cancel" id="contractCancelBtn">Cancel</button>
    <button class="rm-btn ccf-btn-draft" id="contractPdfBtn"><i class="ti ti-file-text"></i> Draft PDF</button>
    <button class="rm-btn rm-btn--pdf" id="contractApproveBtn"${canApprove === false ? ' disabled' : ''}><i class="ti ti-check"></i> Approve</button>`;
}


/* ── GENERATORS THAT KEEP THEIR OWN PDF CODE (Rentals) ─────────
   The generator's "Generate PDF" button becomes Draft PDF (unchanged code,
   opens the PDF). Approve runs that same code, takes the finished PDF back
   (ccCapturePdf, pdf-open.js) and goes to the summary.
   cfg = { body, footer, draftId, mode:'contract'|'ueberg', unit, renew, occasion,
           fields, switchTo, miete:{ anchor, mode, kalt, nk, fixedMode, note, onChange } | null,
           read: () => payload }                                                     */
let _ccfLastData = null;
/* Called by each contract builder right after its data object exists */
function ccfContractData(data, manualKaution) {
  _ccfLastData = data;
  const rn = typeof _aptContractRenew !== 'undefined' ? _aptContractRenew : null;
  if (rn && rn.tid && data && typeof ccKautionManual === 'function') {
    const m = ccKautionManual(manualKaution);
    if (!(m > 0)) { data.kautionBestehend = true; data.kaution = Number(rn.kautionSoll) || 0; }
  }
  return data;
}
function ccfSetupGenerator(cfg) {
  const body = document.getElementById(cfg.body);
  if (!body) return;
  body.querySelectorAll('.ub-mieter-pill').forEach(p => { if (p.parentElement) p.parentElement.style.display = 'none'; });
  const o = { mode: cfg.mode, room: cfg.unit, renew: cfg.renew, occasion: cfg.occasion, fields: cfg.fields, switchTo: cfg.switchTo };
  // Apartments and Parking share one page: only the open generator may carry the For / Miete ids
  document.querySelectorAll('#ccf-for-box, #ccf-miete, #ccfApproveBtn').forEach(el => el.remove());
  body.insertAdjacentHTML('afterbegin', ccfForHTML(o));
  // the unit card's rent lives in the Miete block — hide a stale copy in the pre-filled box
  body.querySelectorAll('.rm-prefilled .rm-pre-row').forEach(row => {
    const k = (row.firstElementChild?.textContent || '').trim();
    if (cfg.miete && /^(Rent|Miete|Kaltmiete|Nebenkosten|NK|Gesamtmiete|Warmmiete)$/i.test(k)) row.style.display = 'none';
  });
  if (cfg.miete) {
    const html = ccfMieteHTML({ mode: cfg.miete.mode || 'kalt_nk', kalt: cfg.miete.kalt, nk: cfg.miete.nk, note: cfg.miete.note });
    const anchor = cfg.miete.anchor && body.querySelector(cfg.miete.anchor);
    if (anchor) anchor.insertAdjacentHTML('beforebegin', html); else body.insertAdjacentHTML('beforeend', html);
    if (cfg.miete.fixedMode) { const sg = document.getElementById('rc-mode'); if (sg) sg.style.display = 'none'; }
    ccfMieteInit(cfg.miete.onChange);
  }
  ccfForInit(o, true);
  if (cfg.renew && cfg.renew.tid && cfg.fields && cfg.fields.kaution) {
    const soll = cfg.renew.kautionSoll;
    ccfSetKaution(cfg.fields.kaution, 0, 'Renewal — no new Kaution. The PDF keeps the first Kaution'
      + (soll ? ' (' + ccfEur(soll) + ')' : '') + '. Type an amount only for a new Kaution.');
  }
  const draft = document.getElementById(cfg.draftId);
  if (!draft) return;
  draft.classList.add('ccf-btn-draft');
  draft.innerHTML = '<i class="ti ti-file-text"></i> Draft PDF';
  document.getElementById('ccfApproveBtn')?.remove();
  draft.insertAdjacentHTML('afterend', `<button class="rm-btn--pdf ccf-approve" id="ccfApproveBtn"><i class="ti ti-check"></i> Approve</button>`);
  // Draft PDF tapped: this version (form + finished PDF) becomes the one Approve saves
  draft.addEventListener('click', () => {
    if (draft.disabled) return;
    _ccfLastData = null;
    ccfDraftBegin(cfg.body, () => {
      const p = cfg.read();
      if (_ccfLastData && p.kind === 'contract') p.kaution = _ccfLastData.kautionBestehend ? null : (Number(_ccfLastData.kaution) || 0);
      return p;
    });
  }, true);
  document.getElementById('ccfApproveBtn').addEventListener('click', ccfApproveDraft);
  ccfFlowWatch(cfg.body, cfg.footer);
  ccfFormAttach(cfg.body, ccfFormKey(cfg.unit, cfg.draftId + (cfg.occasion ? ':' + cfg.occasion : '') + (cfg.renew && cfg.renew.tid ? ':renew' + cfg.renew.tid : '')));
}
function ccfApproveCheck(p) {
  if (p.kind === 'contract' && !ccfIso(p.start)) { alert('Approve needs a Mietbeginn — it becomes the Move-in.'); return false; }
  if (p.kind === 'contract' && !String(p.tenant?.name || '').trim()) { alert('Approve needs the Mieter name.'); return false; }
  if (p.kind === 'ueberg' && !p.forId) { alert('There is no tenant here yet — approve the contract first.'); return false; }
  if (p.kind === 'ueberg' && !ccfIso(p.date)) { alert('Approve needs the Übergabedatum.'); return false; }
  return true;
}
/* Reads a tenant block: ids = { name, adr, dob, email, tel } */
function ccfReadTenant(ids) {
  const v = id => (id && document.getElementById(id)?.value || '').trim();
  return { name: v(ids.name), address: v(ids.adr), birthday: v(ids.dob), email: v(ids.email), phone: v(ids.tel) };
}
function ccfReadCoTenants(f) {
  return [2, 3].map(n => {
    const b = f['t' + n]; if (!b) return null;
    const w = b.wrap && document.getElementById(b.wrap);
    if (w && w.style.display === 'none') return null;
    const t = ccfReadTenant(b); return t.name ? t : null;
  });
}


/* ── DRAFT → APPROVE (one version) ─────────────────────────────
   Editing:  Cancel · Draft PDF            (Draft PDF is the main button)
   Ready:    Cancel · Open PDF             (installed iPhone app: one tap)
   Seen:     Cancel · Draft PDF · Approve  (Approve saves exactly this PDF)
   Any change in the form → back to Editing until the next Draft PDF.        */
let _ccfPend = null;      // { body, read } — Draft PDF tapped, PDF not finished yet
let _ccfDraft = null;     // { body, sig, blob, payload, seen }
function ccfSig(bodyId) {
  const b = document.getElementById(bodyId);
  if (!b || typeof ccDraftSnapshot !== 'function') return '';
  try { return JSON.stringify(ccDraftSnapshot(b)); } catch (e) { return ''; }
}
function ccfDraftBegin(bodyId, read) { _ccfPend = { body: bodyId, read }; ccfFormFlush(); }
if (typeof window !== 'undefined') {
  window.ccOnPdfReady = blob => {
    const pe = _ccfPend; _ccfPend = null;
    if (!pe) return;
    let payload = null;
    try { payload = pe.read(); } catch (e) { console.warn('[draft] read', e); }
    _ccfDraft = { body: pe.body, sig: ccfSig(pe.body), blob, payload, seen: false };
    ccfFooterState();
  };
  window.addEventListener('cc-pdf-opened', () => { if (_ccfDraft) { _ccfDraft.seen = true; ccfFooterState(); } });
  window.addEventListener('cc-pdf-outdated', () => ccfFooterState());
}
/* Which generator is open right now: its body, footer and Approve button */
function _ccfOpenGen() {
  const ids = [['contractBody', 'contractFooter', 'contractApproveBtn', 'contractPdfBtn'],
               ['aptContractBody', 'aptContractFooter', 'ccfApproveBtn', null],
               ['pkContractBody', 'pkContractFooter', 'ccfApproveBtn', null]];
  for (const [b, f, a, d] of ids) {
    const foot = document.getElementById(f), appr = foot && foot.querySelector('#' + a);
    if (appr) return { body: b, foot, appr, draft: d ? document.getElementById(d) : appr.previousElementSibling };
  }
  return null;
}
function ccfFooterState() {
  const g = _ccfOpenGen(); if (!g) return;
  const ready = !!g.foot.querySelector('.cc-pdf-ready');
  const same = !!(_ccfDraft && _ccfDraft.body === g.body && _ccfDraft.sig === ccfSig(g.body));
  const show = same && _ccfDraft.seen && !ready;
  g.appr.style.display = show ? '' : 'none';
  if (g.draft) g.draft.classList.toggle('ccf-draft-primary', !show);
  // one quiet line above the buttons explains where Approve is
  let note = document.getElementById('ccf-foot-note');
  const text = ready ? '' : show ? '' : (_ccfDraft && _ccfDraft.body === g.body)
    ? (same ? 'Open the PDF — then Approve appears.' : 'Changed — make a new Draft PDF to approve.')
    : 'Approve appears after your first Draft PDF.';
  if (!text) { note?.remove(); return; }
  if (!note || note.parentElement !== g.foot) {
    note?.remove();
    note = document.createElement('div'); note.id = 'ccf-foot-note'; note.className = 'ccf-foot-note';
    g.foot.insertAdjacentElement('afterbegin', note);      // first row of the footer: never covers the form
  }
  note.textContent = text;
}
function ccfFlowWatch(bodyId, footId) {
  const b = document.getElementById(bodyId); if (!b) return;
  if (_ccfDraft && _ccfDraft.body === bodyId && _ccfDraft.openedFor !== b) _ccfDraft = null;   // a new generator opening
  if (!b._ccfWatch) {
    b._ccfWatch = true;
    let t = null;
    const upd = () => { clearTimeout(t); t = setTimeout(ccfFooterState, 150); };
    ['input', 'change', 'click'].forEach(ev => b.addEventListener(ev, upd, true));
  }
  setTimeout(ccfFooterState, 0);
}
function ccfApproveDraft() {
  const d = _ccfDraft, g = _ccfOpenGen();
  if (!d || !g || d.body !== g.body || d.sig !== ccfSig(g.body) || !d.payload) { ccfFooterState(); return; }
  if (!ccfApproveCheck(d.payload)) return;
  ccfApprove({ ...d.payload, blob: d.blob, container: null, photos: null });
}

/* ── FORM MEMORY per unit (B4) ─────────────────────────────────
   What you type stays with that room / apartment / parking spot and
   generator until you Approve or Cancel — for 2 hours. X or tapping
   outside only closes. Nothing is saved to Tenants by this.               */
const CCF_FORM_MS = 2 * 3600000;   // 2 hours (was 30 days)
function ccfFormKey(unit, gen) { return 'cc_draft_form_' + ccfA().app + '_' + String(unit).replace(/\s+/g, '_') + '_' + gen; }
function ccfFormGet(key) {
  try {
    const d = JSON.parse(localStorage.getItem(key) || 'null');
    if (!d) return null;
    if (Date.now() - (d.ts || 0) > CCF_FORM_MS) { localStorage.removeItem(key); return null; }
    return d;
  } catch (e) { return null; }
}
function _ccfLocalPut(key, d) { try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) {} }

/* Online copy (table contract_drafts) — the same form on iPhone, iPad and laptop.
   Never blocks: without the table or offline, the phone's copy simply keeps working. */
let _ccfSrvOff = false;
function _ccfSrvOk() { return !_ccfSrvOff && typeof sbL !== 'undefined' && !!sbL; }
function _ccfSrvFail(e) {
  const m = String(e && e.message || e || '');
  if (/contract_drafts|relation|schema cache|does not exist/i.test(m)) _ccfSrvOff = true;   // SQL not run yet
  console.warn('[form] online copy:', m);
}
async function _ccfSrvGet(key) {
  if (!_ccfSrvOk()) return null;
  try {
    const { data, error } = await sbL.from('contract_drafts').select('data, updated_at').eq('app', ccfA().app).eq('form_key', key).maybeSingle();
    if (error) { _ccfSrvFail(error); return null; }
    if (!data || !data.data) return null;
    const ts = Date.parse(data.updated_at) || data.data.ts || 0;
    if (Date.now() - ts > CCF_FORM_MS) { _ccfSrvDel(key); return null; }
    return { ...data.data, ts };
  } catch (e) { _ccfSrvFail(e); return null; }
}
function _ccfSrvPut(key, d) {
  if (!_ccfSrvOk() || !key || !d) return;
  sbL.from('contract_drafts').upsert({ app: ccfA().app, form_key: key, data: d, updated_at: new Date(d.ts || Date.now()).toISOString() },
    { onConflict: 'app,form_key' }).then(r => { if (r && r.error) _ccfSrvFail(r.error); }, _ccfSrvFail);
}
function _ccfSrvDel(key) {
  if (!_ccfSrvOk() || !key) return;
  sbL.from('contract_drafts').delete().eq('app', ccfA().app).eq('form_key', key).then(r => { if (r && r.error) _ccfSrvFail(r.error); }, _ccfSrvFail);
}
function ccfFormClear(key) { if (!key) return; try { localStorage.removeItem(key); } catch (e) {} _ccfSrvDel(key); }

/* A saved form never breaks the generator: a tenancy that no longer exists and an
   empty rent are left out (the current values stay); derived switches are not replayed */
function _ccfFormClean(d) {
  if (!d) return null;
  d = JSON.parse(JSON.stringify(d));
  const f = d.fields || {}, m = d.modes || {};
  const sel = document.getElementById('rc-for');
  if ('rc-for' in f && sel && ![...sel.options].some(o => o.value === f['rc-for'])) delete f['rc-for'];
  if ('rc-kalt' in f || 'rc-nk' in f) {
    if ((ccfNum(f['rc-kalt']) || 0) + (ccfNum(f['rc-nk']) || 0) === 0) { delete f['rc-kalt']; delete f['rc-nk']; delete m['rc-mode']; }
  }
  delete m['cm-nk-btn'];                                  // follows the Miete switch by itself
  return d;
}
function _ccfRevealCoTenants() {
  const f = _ccfFor && _ccfFor.fields; if (!f) return;
  [2, 3].forEach(n => {
    const b = f['t' + n]; if (!b || !b.wrap) return;
    const w = document.getElementById(b.wrap), nm = document.getElementById(b.name);
    if (w && nm && nm.value.trim()) w.style.display = '';
  });
}
/* Fill the open generator from a saved form — hidden while it runs, so it appears once */
async function _ccfFormApply(b, key, d, note) {
  b.style.visibility = 'hidden';
  b._ccfFormRestoring = true;
  await new Promise(r => setTimeout(r, 40));              // the generator's own wiring first (dates, renewal)
  if (b._ccfFormKey !== key) { b.style.visibility = ''; return false; }   // another generator was opened meanwhile
  try { await ccDraftApply(b, d); } catch (e) { console.warn('[form] restore', e); }
  ccfMieteRefresh();
  _ccfRevealCoTenants();
  if (document.getElementById('rc-mode') && _ccfMieteOnChange) _ccfMieteOnChange();
  b.style.visibility = '';
  b._ccfFormRestoring = false;
  b._ccfQuietUntil = Date.now() + 300;
  const w = document.getElementById('ccf-for-hint');
  if (w) w.textContent = w.textContent.replace(/ · (continued from|updated from your other device).*$/, '') + ' · ' + note;
  return true;
}
function _ccfFormSnap(b) {
  if (typeof ccDraftSnapshot !== 'function') return null;
  try { return { ts: Date.now(), ...ccDraftSnapshot(b) }; } catch (e) { return null; }
}
/* Save now (Draft PDF, X): phone + online */
function ccfFormFlush() {
  const g = _ccfOpenGen(); const b = g && document.getElementById(g.body);
  if (!b || !b._ccfFormKey || b._ccfFormRestoring || !b._ccfTyped) return;
  const d = _ccfFormSnap(b); if (!d) return;
  _ccfLocalPut(b._ccfFormKey, d);
  clearTimeout(b._ccfSrvTimer); _ccfSrvPut(b._ccfFormKey, d);
}
async function ccfFormAttach(bodyId, key, legacyKey) {
  const b = document.getElementById(bodyId); if (!b) return;
  b._ccfFormKey = key;
  b._ccfTyped = false;
  b._ccfQuietUntil = Date.now() + 300;
  // Reopened by "Continue" / after the PDF viewer: that path refills the form itself — one source only
  const skip = !!window._ccfSkipFormRestoreOnce; window._ccfSkipFormRestoreOnce = false;
  let local = skip ? null : ccfFormGet(key);
  if (!skip && !local && legacyKey && legacyKey !== key) {           // older copy saved under the room name
    local = ccfFormGet(legacyKey);
    if (local) { _ccfLocalPut(key, local); try { localStorage.removeItem(legacyKey); } catch (e) {} }
  }
  const srvP = skip ? Promise.resolve(null) : _ccfSrvGet(key);        // online copy loads meanwhile
  if (local && typeof ccDraftApply === 'function') {
    await _ccfFormApply(b, key, _ccfFormClean(local), 'continued from ' + ccfFmt(new Date(local.ts).toISOString().slice(0, 10)));
  }
  b._ccfFormRestoring = false;
  if (!b._ccfFormWired) {
    b._ccfFormWired = true;
    let t = null;
    const save = ev => {
      if (b._ccfFormRestoring || !b._ccfFormKey) return;
      if (Date.now() > (b._ccfQuietUntil || 0)) b._ccfTyped = true;   // ignore the generator's own setup events
      clearTimeout(t);
      t = setTimeout(() => {
        if (b._ccfFormRestoring || !b._ccfFormKey || !b._ccfTyped) return;
        const ov = b.closest('[id$="ContractOverlay"], #contractOverlay');
        if (ov && !ov.classList.contains('open')) return;
        const d = _ccfFormSnap(b); if (!d) return;
        _ccfLocalPut(b._ccfFormKey, d);
        clearTimeout(b._ccfSrvTimer);
        const k = b._ccfFormKey;
        b._ccfSrvTimer = setTimeout(() => _ccfSrvPut(k, d), 2000);   // online after 2 s without typing
      }, 400);
    };
    ['input', 'change', 'click'].forEach(ev => b.addEventListener(ev, save, true));
  }
  setTimeout(ccfFooterState, 0);
  // A newer copy from another device replaces the form once — unless you already typed here
  const srv = await srvP;
  if (srv && b._ccfFormKey === key && !b._ccfTyped && srv.ts > ((local && local.ts) || 0) + 1000 && typeof ccDraftApply === 'function') {
    _ccfLocalPut(key, srv);
    await _ccfFormApply(b, key, _ccfFormClean(srv), 'updated from your other device');
    setTimeout(ccfFooterState, 0);
  } else if (!srv && local && b._ccfFormKey === key) {
    _ccfSrvPut(key, local);                                            // first time online: upload the phone's copy
  }
}
/* Cancel = throw this form away (all three generators) · X = keep it (saved now) */
if (typeof document !== 'undefined') {
  document.addEventListener('click', e => {
    const t = e.target && e.target.closest ? e.target : null; if (!t) return;
    if (t.closest('#contractCancelBtn, #aptContractCancelBtn, #pkContractCancelBtn')) {
      const g = _ccfOpenGen(); const b = g && document.getElementById(g.body);
      if (b) { clearTimeout(b._ccfSrvTimer); ccfFormClear(b._ccfFormKey); b._ccfTyped = false; }
      _ccfDraft = null;
    } else if (t.closest('#contractClose, #aptContractClose, #pkContractClose')) {
      ccfFormFlush();
    }
  }, true);
}

/* ── APPROVE: PLAN ─────────────────────────────────────────── */
let _ccfA = null;   // { p, plan, done:{}, blob }

function ccfPlan(p) {
  const rec = p.forId && p.forId !== 'new' ? ccfRec(p.forId) : null;
  const t   = rec ? ccfTenancy(p.room, rec.id) : null;
  if (p.kind === 'ueberg') {
    const date = ccfIso(p.date);
    return {
      kind: 'ueberg', rec, t, occasion: p.occasion, date,
      setMoveOut: p.occasion === 'auszug' && rec && !rec.mietende && !!date,
      newAddress: (p.newAddress || '').trim(),
      readings: (p.readings || []).filter(r => r.value != null),
      docType: p.occasion, docLabel: p.occasion === 'einzug' ? 'Übergabe Einzug' : 'Übergabe Auszug',
    };
  }
  const start = ccfIso(p.start), end = ccfIso(p.end);
  const recEnd = rec ? ccfIso(rec.vertragsende) : null;
  const renewal = !!(rec && (p.renew || (recEnd && start && start > recEnd)));
  const rows = rec ? ccfA().renewalRows(rec) : [];
  const same = renewal ? rows.find(x => ccfIso(x.p.valid_from) === start) : null;
  const renewPid = renewal ? ((p.renew && p.renew.pid) || (same && same.p.id) || null) : null;
  const renewN = renewal ? (same ? same.n : rows.length + 1) : 0;
  // Kaution Soll: new tenancy → this contract; same tenancy → only when it differs; renewal → only a new amount > 0
  const soll = rec ? (Number(rec.kaution_soll) || null) : null;
  let kautionNew = null;
  if (!rec) kautionNew = p.kaution;
  else if (renewal) kautionNew = p.kaution > 0 && p.kaution !== soll ? p.kaution : null;
  else kautionNew = p.kaution != null && p.kaution !== soll ? p.kaution : null;
  // A new tenancy that overlaps the current / next tenant (no move-out before its start)
  const overlapAll = !rec && start ? ccfRoomTenancies(p.room).filter(x => x.role !== 'former'
    && (!ccfIso(x.rec.mietende) || ccfIso(x.rec.mietende) >= start)).map(x => x.rec) : [];
  // B1: whoever moved in before this new tenancy ends the day before (otherwise two rents run in Controlling)
  const endPrev = overlapAll.filter(r => ccfIso(r.mietbeginn) && ccfIso(r.mietbeginn) < start)
    .map(r => ({ rec: r, was: ccfIso(r.mietende), to: ccfAddDays(start, -1) }));
  const overlaps = overlapAll.filter(r => !endPrev.some(x => x.rec === r));
  // B3: this tenancy's own Staffel steps that the new contract replaces (Rentals)
  const staffelOld = rec && !renewal && p.staffelTable && typeof _rntStaffel !== 'undefined'
    ? (_rntStaffel[String(p.room).slice(String(p.room).indexOf(':') + 1)] || []).filter(h => String(h.tenant_id || '') === String(rec.id)
        && !h.tenant_adjusted && !h.ignored && ccfIso(h.effective_date) >= start
        && !(p.staffel || []).some(x => ccfIso(x.datum || x.date) === ccfIso(h.effective_date))) : [];
  return {
    kind: 'contract', rec, t, renewal, renewPid, renewN, start, end, soll, kautionNew, overlaps, endPrev, endPrevOn: true, staffelOld,
    moveInChange: rec && !renewal && start && ccfIso(rec.mietbeginn) && ccfIso(rec.mietbeginn) !== start ? ccfIso(rec.mietbeginn) : null,
    endBefore: rec ? recEnd : null,
    moveOutRemoved: renewal && rec.mietende ? ccfIso(rec.mietende) : null,
    docType: renewal ? 'verlaengerung_' + start : ccfA().contractDocType(p, rec),
    docLabel: renewal ? renewN + '. Verlängerung' : (p.docLabel || (p.ctype === 'kurzzeit' ? 'Mietvertrag befristet' : 'Mietvertrag')),
  };
}
function ccfDocOf(tid, type, variant) {
  const docs = ccfDocsOf(tid);
  return docs.find(d => d.type === type && (d.variant || 'signed') === variant) || null;
}

/* ── APPROVE: SUMMARY SHEET ────────────────────────────────── */
function ccfApprove(p) {
  // Checks before the summary: what the tenant needs
  if (p.kind === 'contract' && !ccfIso(p.start)) { alert('Approve needs a Mietbeginn — it becomes the Move-in.'); p.container?.remove(); return; }
  if (p.kind === 'contract' && !String(p.tenant?.name || '').trim()) { alert('Approve needs the Mieter name.'); p.container?.remove(); return; }
  if (p.kind === 'ueberg' && !p.forId) { alert('There is no tenant on this room yet — approve the contract first.'); p.container?.remove(); return; }
  if (p.kind === 'ueberg' && !ccfIso(p.date)) { alert('Approve needs the Übergabedatum.'); p.container?.remove(); return; }
  _ccfA = { p, plan: ccfPlan(p), done: {}, blob: null };
  _ccfSummaryRender();
}
function _ccfRow(label, value, sub, cls) {
  return `<div class="ccf-srow${cls ? ' ' + cls : ''}"><span class="ccf-sl">${label}</span>
    <div class="ccf-sv"><div>${value}</div>${sub ? `<div class="ccf-ss">${sub}</div>` : ''}</div></div>`;
}
function _ccfSummaryRender() {
  const A = _ccfA; if (!A) return;
  const p = A.p, pl = A.plan, rec = pl.rec;
  const e = ccfEsc;
  const locked = !!Object.keys(A.done).length || !!A.blob || !!(p.renew && p.renew.tid);
  const forSel = locked ? '' : `<label class="ccf-change"><span>Change</span>
      <select id="ccf-sum-for" aria-label="Tenancy">${ccfForOptions(p.room, p.kind === 'ueberg' ? 'ueberg' : 'contract', p.forId || 'new', p.occasion)}</select></label>`;
  let body = '';
  if (pl.kind === 'contract') {
    const t = p.tenant || {};
    const was = (k, v) => rec && rec[k] && String(v || '').trim() && String(rec[k]).trim() !== String(v).trim() ? 'was ' + e(k === 'birthday' ? ccfBirthdayText(rec[k]) : rec[k]) : '';
    const whoSub = !rec ? `New tenancy · no one with this name on ${e(ccfA().unitLabel(p.room))}`
      : pl.renewal ? `${pl.renewN}. Verlängerung · ${e(ccfRoleText(pl.t))}` : `updates the ${e(ccfRoleText(pl.t))}`;
    body += `<div class="ccf-sec"><div class="ccf-sh"><span>Tenants → Tenant</span>${forSel}</div>
      ${_ccfRow('Name', e(t.name), whoSub)}
      ${t.birthday ? _ccfRow('Birthday', e(t.birthday), was('birthday', t.birthday)) : ''}
      ${t.email ? _ccfRow('Email', e(t.email), was('email', t.email)) : ''}
      ${t.phone ? _ccfRow('Phone', e(t.phone), was('phone', t.phone)) : ''}
      ${t.address ? _ccfRow('Address', e(t.address), was('address', t.address)) : ''}
      ${(p.coTenants || []).map((c, i) => c && c.name ? _ccfRow('Mieter ' + (i + 2), e(c.name), [c.email, c.phone].filter(Boolean).map(e).join(' · ')) : '').join('')}
      ${pl.endPrev.map(x => `<label class="ccf-srow ccf-check"><input type="checkbox" class="ccf-endprev"${pl.endPrevOn ? ' checked' : ''}/>
        <span class="ccf-sl">Move-out of ${e(ccfName(x.rec))}</span>
        <span class="ccf-sv"><span>${ccfFmt(x.to)}</span><span class="ccf-ss">day before · ${x.was ? 'was ' + ccfFmt(x.was) : 'was empty'}</span></span></label>`).join('')}
      ${pl.overlaps.length ? `<p class="ccf-warn">${pl.overlaps.map(r => e(ccfName(r)) + ' moves in ' + ccfFmt(r.mietbeginn)).join(' · ')} — the same time as this tenancy. Check the dates in Tenants.</p>` : ''}
    </div>`;
    const ctRow = pl.renewal
      ? _ccfRow('Type', e(ccfCtLabel(p.ctype)), `${pl.renewN}. Verlängerung ab ${ccfFmt(pl.start)}`)
      : _ccfRow('Type', e(ccfCtLabel(p.ctype)), rec && rec.contract_type && rec.contract_type !== p.ctype ? 'was ' + e(ccfCtLabel(rec.contract_type)) : '');
    body += `<div class="ccf-sec"><div class="ccf-sh"><span>Contract</span></div>${ctRow}
      ${!pl.renewal ? _ccfRow('Move-in', ccfFmt(pl.start), pl.moveInChange ? 'was ' + ccfFmt(pl.moveInChange) + ' · the rent history moves with it' : '') : ''}
      ${pl.end || pl.endBefore ? _ccfRow('Contract end', pl.end ? ccfFmt(pl.end) : 'none (unbefristet)', pl.endBefore && pl.endBefore !== pl.end ? 'was ' + ccfFmt(pl.endBefore) : '') : ''}
      ${pl.moveOutRemoved ? _ccfRow('Move-out', 'removed', ccfFmt(pl.moveOutRemoved) + ' · the tenant stays') : (!rec ? _ccfRow('Move-out', 'not set', 'set it when you know it') : '')}
    </div>`;
    const r = p.rent || {};
    const rentTxt = r.mode === 'pauschal' ? ccfEur(r.total) + ' pauschal' : r.nk ? ccfEur(r.kalt) + ' + ' + ccfEur(r.nk) + ' NK' : ccfEur(r.kalt);
    const months = [p.first_month === 'voll' ? 'first month voll' : 'first month anteilig', p.last_month ? (p.last_month === 'voll' ? 'last month voll' : 'last month anteilig') : ''].filter(Boolean).join(' · ');
    const kTxt = pl.kautionNew != null
      ? _ccfRow('Kaution Soll', ccfEur(pl.kautionNew), pl.soll != null ? 'was ' + ccfEur(pl.soll) : '')
      : _ccfRow('Kaution Soll', pl.soll != null ? ccfEur(pl.soll) : '—', pl.renewal ? 'stays · no new Kaution' : 'unchanged');
    body += `<div class="ccf-sec"><div class="ccf-sh"><span>Miete</span></div>
      ${_ccfRow('From ' + ccfFmt(pl.start), rentTxt, months)}
      ${(p.staffel || []).length || (pl.staffelOld || []).length ? _ccfRow('Staffel', (p.staffel || []).length + ((p.staffel || []).length === 1 ? ' step' : ' steps')
        + (pl.staffelOld.length ? ' · replaces ' + pl.staffelOld.length : ''), (p.staffel || []).map(x => ccfFmt(x.datum || x.date) + ' ' + ccfEur(x.betrag ?? x.amount)).join(' · ')) : ''}
      ${kTxt}</div>`;
  } else {
    const t = pl.t;
    body += `<div class="ccf-sec"><div class="ccf-sh"><span>Tenants → Tenant</span>${forSel}</div>
      ${_ccfRow('Name', rec ? e(ccfName(rec)) : '—', t ? e(ccfRoleText(t)) : 'no tenant')}
      ${pl.setMoveOut ? _ccfRow('Move-out', ccfFmt(pl.date), 'proposed from the Übergabe date · was empty') : ''}
      ${pl.newAddress ? _ccfRow('Address', e(pl.newAddress), 'new address · for NK-Abrechnung and Kaution') : ''}
    </div>`;
    body += `<div class="ccf-sec"><div class="ccf-sh"><span>Zählerstände → ${pl.occasion === 'einzug' ? 'Einzug' : 'Auszug'} ${ccfFmt(pl.date)}</span></div>
      ${pl.readings.length ? pl.readings.map(x => _ccfRow(e(x.meter) + (x.meter_no ? `<br><span class="ccf-ss">Nr. ${e(x.meter_no)}</span>` : ''),
        ccfNumFmt(x.value, 'auto') + (x.unit ? ' ' + e(x.unit) : ''))).join('') : '<p class="ccf-ss" style="margin:6px 0 0">No Zählerstände typed.</p>'}
    </div>`;
  }
  const oldU = rec ? ccfDocOf(rec.id, pl.docType, 'unsigned') : null;
  const oldS = rec ? ccfDocOf(rec.id, pl.docType, 'signed') : null;
  body += `<div class="ccf-sec"><div class="ccf-sh"><span>Documents</span></div>
    ${_ccfRow(e(pl.docLabel), '<i class="ti ti-file"></i> Unsigned', oldU ? 'this PDF · replaces the unsigned from ' + ccfFmtShort(oldU.uploaded_at) : 'this PDF')}
    ${oldS ? `<p class="ccf-warn">A signed version from ${ccfFmtShort(oldS.uploaded_at)} stays — check that it matches this version.</p>` : ''}
  </div>`;

  let ov = document.getElementById('ccfApproveOv');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'ccfApproveOv'; ov.className = 'ccf-ov';
    document.body.appendChild(ov);
  }
  const head = p.kind === 'ueberg' ? 'Übergabe ' + (pl.occasion === 'einzug' ? 'Einzug' : 'Auszug') : (p.renew ? 'Renewal' : ccfCtLabel(p.ctype) === 'Kurzzeit' ? 'Mietvertrag befristet' : 'Mietvertrag');
  const again = !!Object.keys(A.done).length || !!A.blob;
  ov.innerHTML = `<div class="ccf-sheet" role="dialog" aria-modal="true" aria-labelledby="ccf-sum-title">
    <div class="ccf-shd"><div style="min-width:0">
      <div class="ccf-eyebrow">Approve · ${e(head)}</div>
      <div class="ccf-title" id="ccf-sum-title">What gets saved</div>
      <div class="ccf-sub">${e(ccfA().unitLabel(p.room))} · ${pl.kind === 'ueberg' ? 'Übergabe ' + ccfFmt(pl.date) : !rec ? 'new tenancy' : pl.renewal ? 'renewal' : 'update'}</div>
    </div><button type="button" class="ccf-x" aria-label="Close" onclick="ccfSummaryClose()"><i class="ti ti-x"></i></button></div>
    <div class="ccf-sbody">
      <p class="ccf-note">${p.kind === 'ueberg' ? 'An Übergabe never creates a tenant — it goes to the tenancy shown here.' : 'Approve takes this version for the tenant.'} Everything stays editable in Tenants.</p>
      ${body}
    </div>
    <div class="ccf-sft"><button type="button" class="rm-btn rm-btn--cancel" onclick="ccfSummaryClose()">Back</button>
      <button type="button" class="ccf-go" id="ccfGo" onclick="ccfApproveRun()"><i class="ti ti-check"></i> ${again ? 'Approve again' : 'Approve &amp; save'}</button></div>
  </div>`;
  ov.classList.add('open');
  ov.querySelectorAll('.ccf-endprev').forEach(cb => cb.addEventListener('change', () => { A.plan.endPrevOn = cb.checked; }));
  document.getElementById('ccf-sum-for')?.addEventListener('change', ev => {
    A.p.forId = ev.target.value;
    const g = document.getElementById('rc-for'); if (g) g.value = ev.target.value;
    A.plan = ccfPlan(A.p); _ccfSummaryRender();
  });
}
function ccfSummaryClose() {
  document.getElementById('ccfApproveOv')?.classList.remove('open');
  if (_ccfA && _ccfA.p.container) _ccfA.p.container.remove();
  _ccfA = null;
}

/* ── APPROVE: SAVE STEPS (each one safe to repeat) ─────────── */
async function ccfApproveRun() {
  const A = _ccfA; if (!A || A.busy) return;
  const btn = document.getElementById('ccfGo');
  A.busy = true;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Saving…'; }
  let step = 'PDF';
  try {
    const p = A.p, pl = A.plan;
    if (!A.blob && p.blob) A.blob = p.blob;
    if (!A.blob) {
      if (p.photos && typeof ccUbAddPhotoPages === 'function') await ccUbAddPhotoPages(p.photos.key, p.container, p.photos.meta || {});
      const pdf = await ccRenderPagesToPdf(p.container);
      A.blob = pdf.output('blob');
    }
    step = 'previous tenant';
    if (!A.done.prev && pl.kind === 'contract' && pl.endPrevOn && (pl.endPrev || []).length) { await _ccfStepEndPrev(A); A.done.prev = true; }
    step = 'tenant';     if (!A.done.tenant)   { await _ccfStepTenant(A);   A.done.tenant = true; }
    if (pl.kind === 'contract') {
      step = 'rent history'; if (!A.done.rent) { await _ccfStepRent(A);     A.done.rent = true; }
    } else {
      step = 'Zählerstände'; if (!A.done.meters) { await ccfSaveReadings(pl.rec.id, pl.occasion, pl.date, pl.readings); A.done.meters = true; }
    }
    step = 'document';   if (!A.done.doc)      {
      await ccfSaveDoc({ tid: pl.rec.id, room: ccfA().prefix(pl.rec), type: pl.docType, variant: 'unsigned', blob: A.blob });
      A.done.doc = true;
    }
    const who = ccfName(pl.rec);
    ccfSummaryClose();
    { const g = _ccfOpenGen(); const b = g && document.getElementById(g.body); if (b) { clearTimeout(b._ccfSrvTimer); ccfFormClear(b._ccfFormKey); b._ccfTyped = false; } }
    _ccfDraft = null;
    ccfA().afterApprove();
    await ccfA().reload();
    ccfToast('Approved — saved to ' + who + ' · Documents › Unsigned');
  } catch (err) {
    console.error('[approve] ' + step, err);
    ccfToast('Not saved: ' + step + ' — ' + (err && err.message ? err.message : 'connection problem') + '. Tap Approve again — nothing is saved twice.', true);
    A.busy = false;
    _ccfSummaryRender();
    return;
  }
}

/* B1: the tenant before ends the day before the new move-in (status follows the date by itself) */
async function _ccfStepEndPrev(A) {
  for (const x of A.plan.endPrev) {
    if (ccfIso(x.rec.mietende) === x.to) continue;
    const upd = { mietende: x.to };
    if (x.to < ccfToday()) upd.status = 'former';
    const { error } = await sbL.from(ccfA().recTable).update(upd).eq('id', x.rec.id);
    if (error) throw error;
    Object.assign(x.rec, upd);
  }
}
async function _ccfStepTenant(A) {
  const p = A.p, pl = A.plan;
  if (pl.kind === 'ueberg') {
    const rec = pl.rec, upd = {};
    if (pl.setMoveOut) { upd.mietende = pl.date; if (pl.date <= ccfToday()) upd.status = 'former'; }
    if (pl.newAddress && pl.newAddress !== (rec.address || '')) upd.address = pl.newAddress;
    if (!Object.keys(upd).length) return;
    const { error } = await sbL.from(ccfA().recTable).update(upd).eq('id', rec.id);
    if (error) throw error;
    Object.assign(rec, upd);
    return;
  }
  const t = p.tenant || {}, nm = ccfSplitName(t.name);
  if (!pl.rec) {
    const r = p.rent || {};
    const row = {
      ...ccfA().unitRow(p.room), status: 'active', contract_type: p.ctype,
      first_name: nm.first_name, last_name: nm.last_name,
      email: t.email || null, phone: t.phone || null, birthday: t.birthday || null, address: t.address || null,
      mietbeginn: pl.start, mietende: null, vertragsende: pl.end || null,
      kaltmiete: r.mode === 'pauschal' ? r.total : r.kalt, nebenkosten: r.mode === 'pauschal' ? 0 : r.nk,
      kaution_soll: pl.kautionNew ?? null,
    };
    if (ccfA().coTenants) {
      Object.assign(row, ccfCoTenantFields(p.coTenants, true));
      if (String(p.room).startsWith('pk:')) row.nebenkosten = null;
    }
    const { data, error } = await sbL.from(ccfA().recTable).insert(row).select().single();
    if (error) throw error;
    ccfRecs().push(data);
    pl.rec = data; p.forId = String(data.id); pl.created = true;
    try { await ccfA().ensureKaution(data.id); } catch (e) { console.warn('[approve] kaution row', e); }
    // Tenant-app password only when the tenant already lives there (a next tenant would lock out the current one)
    if (ccfA().password && pl.start <= ccfToday() && typeof ccSetNewRoomPassword === 'function') {
      const cur = ccfRoomTenancies(p.room).find(x => x.role === 'current' && String(x.rec.id) !== String(data.id));
      if (!cur) await ccSetNewRoomPassword(p.room, 'Login password');
    }
    return;
  }
  const rec = pl.rec, upd = {};
  const put = (k, v) => { if (v != null && String(v).trim() !== '' && String(rec[k] ?? '').trim() !== String(v).trim()) upd[k] = String(v).trim(); };
  put('first_name', nm.first_name); put('last_name', nm.last_name);
  put('email', t.email); put('phone', t.phone); put('birthday', t.birthday); put('address', t.address);
  if (ccfA().coTenants) Object.entries(ccfCoTenantFields(p.coTenants, false)).forEach(([k, v]) => put(k, v));
  if (!pl.renewal) {
    if (rec.contract_type !== p.ctype) upd.contract_type = p.ctype;
    if (pl.start && ccfIso(rec.mietbeginn) !== pl.start) upd.mietbeginn = pl.start;
    if ((ccfIso(rec.vertragsende) || null) !== (pl.end || null)) upd.vertragsende = pl.end || null;
  } else {
    if ((ccfIso(rec.vertragsende) || null) !== (pl.end || null)) upd.vertragsende = pl.end || null;
    if (rec.mietende) upd.mietende = null;                 // renewed → not moving out
  }
  if (pl.kautionNew != null) upd.kaution_soll = pl.kautionNew;
  if (!Object.keys(upd).length) return;
  const { error } = await sbL.from(ccfA().recTable).update(upd).eq('id', rec.id);
  if (error) throw error;
  Object.assign(rec, upd);
}

function ccfCoTenantFields(list, all) {
  const out = {};
  [2, 3].forEach(n => {
    const c = (list || [])[n - 2] || {};
    const nm = ccfSplitName(c.name);
    const f = { ['first_name_' + n]: nm.first_name, ['last_name_' + n]: nm.last_name, ['email_' + n]: c.email,
                ['phone_' + n]: c.phone, ['birthday_' + n]: c.birthday, ['address_' + n]: c.address };
    Object.entries(f).forEach(([k, v]) => { if (all) out[k] = v || null; else if (v) out[k] = v; });
  });
  return out;
}
function _ccfRpFields(r, extra) {
  const pa = r.mode === 'pauschal';
  return { mode: pa ? 'pauschal' : 'kalt_nk', pauschale: pa ? r.total : null,
           kaltmiete: pa ? null : r.kalt, nebenkosten: pa ? (r.nk || null) : r.nk, ...extra };   // Pauschal: "davon NK"
}
async function _ccfStepRent(A) {
  const p = A.p, pl = A.plan, rec = pl.rec, r = p.rent || {};
  if (typeof ccRpSetRent !== 'function' || !pl.start) return;
  if (typeof CC_RP !== 'undefined' && !CC_RP.loaded[ccfA().app] && !CC_RP.loaded['*'] && typeof ccRpLoad === 'function') await ccRpLoad(sbL, ccfA().app);
  const months = { first_month: p.first_month || 'anteilig', last_month: p.last_month || 'anteilig' };
  const common = { mode: r.mode, kalt: r.mode === 'pauschal' ? r.total : r.kalt, nk: r.mode === 'pauschal' ? 0 : r.nk,
    pauschale: r.mode === 'pauschal' ? r.total : null, nkIncl: r.mode === 'pauschal' ? (r.nk || null) : null, ...months, contract_type: p.ctype, contract_end: pl.end || null,
    legacyMode: r.mode };
  if (pl.renewal) {
    if (pl.renewPid) {
      await ccRpUpdate(sbL, pl.renewPid, _ccfRpFields(r, { valid_from: pl.start, kind: 'renewal', ...months,
        contract_type: p.ctype, contract_end: pl.end || null }));
    } else {
      const saved = await ccRpSetRent(sbL, { app: ccfA().app, rec, validFrom: pl.start, kind: 'renewal', source: 'renew', ...common });
      if (saved && saved.id) pl.renewPid = saved.id;
    }
    return;
  }
  await _ccfStepStaffel(A);
  // First contract: move the tenancy's first rent entry with the Move-in instead of adding a second one
  const periods = ccRpFor(ccfA().app, rec.id).slice().sort((a, b) => String(ccfIso(a.valid_from)).localeCompare(String(ccfIso(b.valid_from))));
  const first = periods[0], second = periods[1];
  if (first && ccfIso(first.valid_from) !== pl.start && (!second || pl.start < ccfIso(second.valid_from))) {
    await ccRpUpdate(sbL, first.id, _ccfRpFields(r, { valid_from: pl.start, source: 'generator', ...months,
      contract_type: p.ctype, contract_end: pl.end || null }));
  } else {
    await ccRpSetRent(sbL, { app: ccfA().app, rec, validFrom: pl.start, kind: 'contract', source: 'generator', ...common });
  }
}
/* Rentals: the contract's Staffel steps → this tenancy's Staffel history (same date = updated) */
async function _ccfStepStaffel(A) {
  const p = A.p, rec = A.plan.rec;
  const steps = (p.staffel || []).map(x => ({ date: ccfIso(x.datum || x.date), amount: ccfNum(x.betrag ?? x.amount) })).filter(x => x.date && x.amount);
  if (!p.staffelTable) return;
  const col = String(p.room).startsWith('pk:') ? 'parking_id' : 'apartment_id';
  const unitId = String(p.room).slice(String(p.room).indexOf(':') + 1);
  // B3: this tenancy's own steps from the contract start that the new contract no longer has
  //     (Adjusted / Ignored steps and old steps without a tenant link are never touched)
  if (A.plan.start) {
    const { data: own, error: e0 } = await sbL.from(p.staffelTable).select('*').eq(col, unitId).eq('tenant_id', String(rec.id));
    if (e0) throw e0;
    for (const h of own || []) {
      const d = ccfIso(h.effective_date);
      if (!d || d < A.plan.start || h.tenant_adjusted || h.ignored || steps.some(s2 => s2.date === d)) continue;
      const { error } = await sbL.from(p.staffelTable).delete().eq('id', h.id);
      if (error) throw error;
    }
  }
  if (!steps.length) return;
  for (const st of steps) {
    const { data: ex0, error: e1 } = await sbL.from(p.staffelTable).select('*').eq(col, unitId).eq('effective_date', st.date);
    if (e1) throw e1;
    // only this tenancy's own step (or an unlinked one) is updated — a former tenant's step stays theirs
    const ex = (ex0 || []).filter(h => !h.tenant_id || String(h.tenant_id) === String(rec.id));
    if (ex.length) {
      const { error } = await sbL.from(p.staffelTable).update({ amount: st.amount, tenant_id: String(rec.id) }).eq('id', ex[0].id);
      if (error) throw error;
    } else {
      const res = typeof ccRpInsertWithTenant === 'function'
        ? await ccRpInsertWithTenant(sbL, p.staffelTable, { [col]: unitId, effective_date: st.date, amount: st.amount, tenant_adjusted: false, kind: 'staffel' }, rec.id)
        : await sbL.from(p.staffelTable).insert({ [col]: unitId, effective_date: st.date, amount: st.amount, tenant_adjusted: false, tenant_id: String(rec.id) });
      if (res && res.error) throw res.error;
    }
  }
}

/* ── DOCUMENTS: STORAGE ────────────────────────────────────── */
function ccfDocPath(room, tid, type, variant) { return `${room}/${tid}/${type}.${variant}.pdf`; }
async function ccfSaveDoc({ tid, room, type, variant, blob }) {
  const path = ccfDocPath(room || 'unknown', tid, type, variant);
  const prev = ccfDocOf(tid, type, variant);
  const { error: upErr } = await sbL.storage.from(ccfA().bucket).upload(path, blob, { upsert: true, contentType: 'application/pdf' });
  if (upErr) throw upErr;
  const { data, error } = await sbL.from(ccfA().docTable)
    .upsert({ tenant_id: tid, type, variant, file_url: path, uploaded_at: new Date().toISOString() },
            { onConflict: 'tenant_id,type,variant' }).select().single();
  if (error) throw error;
  { const all = ccfA().docs(); if (!all[tid]) all[tid] = [];
    const i = all[tid].findIndex(d => d.type === type && (d.variant || 'signed') === variant);
    if (i >= 0) all[tid][i] = data; else all[tid].push(data); }
  delete _ccfLinks[path];
  if (prev && prev.file_url && prev.file_url !== path) {   // old file under another name (e.g. a photo) → tidy up
    sbL.storage.from(ccfA().bucket).remove([prev.file_url]).catch(() => {});
    delete _ccfLinks[prev.file_url];
  }
  return data;
}
async function ccfDeleteDoc(tid, type, variant) {
  const doc = ccfDocOf(tid, type, variant); if (!doc) return;
  if (!confirm('Delete this document? This cannot be undone.')) return;
  const { error } = await sbL.from(ccfA().docTable).delete().eq('id', doc.id);
  if (error) { ccfToast('Not deleted — ' + error.message, true); return; }
  if (doc.file_url) sbL.storage.from(ccfA().bucket).remove([doc.file_url]).catch(() => {});
  { const all = ccfA().docs(); if (all[tid]) all[tid] = all[tid].filter(d => d.id !== doc.id); }
  ccfRefreshTenant(tid);
}

/* Prepared links: a tap opens the iPhone viewer straight away (a link created
   after the tap would be blocked and fall back to a "PDF ready" step). */
const _ccfLinks = {};
function _ccfLinkNow(path) {
  const l = _ccfLinks[path];
  return l && l.exp - Date.now() > 5 * 60 * 1000 ? l.url : null;
}
async function ccfPrepareLinks(paths) {
  const need = [...new Set(paths.filter(p => p && !_ccfLinkNow(p)))];
  if (!need.length || typeof sbL === 'undefined' || !sbL) return;
  try {
    const { data } = await sbL.storage.from(ccfA().bucket).createSignedUrls(need, CCF_LINK_SECS);
    (data || []).forEach(d => { if (d && d.signedUrl && d.path) _ccfLinks[d.path] = { url: d.signedUrl, exp: Date.now() + CCF_LINK_SECS * 1000 }; });
  } catch (e) { console.warn('[docs] links', e); }
}
function ccfDocTap(tid, type, variant) {
  const doc = ccfDocOf(tid, type, variant); if (!doc || !doc.file_url) return;
  if (_ccfDocEdit[tid]) { ccfDocUpload(tid, type, variant); return; }   // Edit: tap = replace
  const rec = ccfRec(tid);
  const label = ccfDocLabel(type, rec) + (rec ? ' – ' + ccfA().unitLabel(ccfA().unitOf(rec)) : '');
  const url = _ccfLinkNow(doc.file_url);
  if (url && typeof ccOpenUrl === 'function') { ccOpenUrl(url, label); return; }
  ccfA().viewDoc(doc, ccfDocLabel(type, rec), rec);
}

/* ── DOCUMENTS: UPLOAD (photo library · take photo · file) ─── */
let _ccfUp = null;   // { tid, type, variant, pages: [File] }
function ccfDocUpload(tid, type, variant) {
  _ccfUp = { tid, type, variant, pages: [] };
  _ccfPick();
}
function _ccfPick() {
  let inp = document.getElementById('ccfFileInput');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file'; inp.id = 'ccfFileInput'; inp.accept = 'application/pdf,image/*'; inp.multiple = true;
    inp.style.display = 'none'; inp.setAttribute('aria-hidden', 'true');
    inp.addEventListener('change', () => { const f = [...(inp.files || [])]; inp.value = ''; _ccfPicked(f); });
    document.body.appendChild(inp);
  }
  inp.value = ''; inp.click();
}
async function _ccfPicked(files) {
  const up = _ccfUp; if (!up || !files.length) return;
  const pdf = files.find(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
  const imgs = files.filter(f => /^image\//.test(f.type || '') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name || ''));
  if (pdf && !up.pages.length) { await _ccfUploadBlob(pdf); return; }
  up.pages.push(...imgs);
  _ccfPagesSheet();
}
function _ccfPagesSheet() {
  const up = _ccfUp; if (!up) return;
  let ov = document.getElementById('ccfPagesOv');
  if (!ov) { ov = document.createElement('div'); ov.id = 'ccfPagesOv'; ov.className = 'ccf-ov'; document.body.appendChild(ov); }
  const n = up.pages.length;
  ov.innerHTML = `<div class="ccf-sheet ccf-sheet--small" role="dialog" aria-modal="true">
    <div class="ccf-shd"><div><div class="ccf-eyebrow">${ccfEsc(ccfDocLabel(up.type, ccfRec(up.tid)))} · ${up.variant === 'signed' ? 'Signed' : 'Unsigned'}</div>
      <div class="ccf-title">${n} ${n === 1 ? 'page' : 'pages'} ready</div>
      <div class="ccf-sub">The photos become one PDF, one page each.</div></div></div>
    <div class="ccf-sft">
      <button type="button" class="rm-btn rm-btn--cancel" onclick="_ccfPagesClose()">Cancel</button>
      <button type="button" class="ccf-btn-draft ccf-btn-mid" onclick="_ccfPick()"><i class="ti ti-plus"></i> Add page</button>
      <button type="button" class="ccf-go" id="ccfPagesGo" onclick="_ccfPagesSave()"><i class="ti ti-check"></i> Save as PDF</button>
    </div></div>`;
  ov.classList.add('open');
}
function _ccfPagesClose() { document.getElementById('ccfPagesOv')?.classList.remove('open'); _ccfUp = null; }
async function _ccfPagesSave() {
  const up = _ccfUp; if (!up || !up.pages.length) return;
  const btn = document.getElementById('ccfPagesGo');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Saving…'; }
  try {
    const blob = await ccfImagesToPdf(up.pages);
    await _ccfUploadBlob(blob);
    _ccfPagesClose();
  } catch (e) {
    console.error('[docs] photos → PDF', e);
    ccfToast('Not saved — ' + (e && e.message ? e.message : 'the photos could not be read') + '.', true);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> Save as PDF'; }
  }
}
async function _ccfUploadBlob(blob) {
  const up = _ccfUp; if (!up) return;
  const rec = ccfRec(up.tid);
  try {
    await ccfSaveDoc({ tid: up.tid, room: rec ? ccfA().prefix(rec) : 'unknown', type: up.type, variant: up.variant, blob });
    ccfToast('Document saved ✓');
    ccfRefreshTenant(up.tid);
  } catch (e) {
    console.error('[docs] upload', e);
    ccfToast('Upload failed — ' + (e && e.message ? e.message : 'connection problem') + '. Please try again.', true);
    throw e;
  }
}
/* Photos → one A4 PDF. Large iPhone photos are scaled down first (memory). */
async function ccfImagesToPdf(files) {
  const { jsPDF } = window.jspdf;
  let pdf = null;
  for (const f of files) {
    const img = await _ccfLoadImage(f);
    const max = 2200, sc = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    const data = c.toDataURL('image/jpeg', 0.85);
    const land = w > h, pw = land ? 297 : 210, ph = land ? 210 : 297;
    if (!pdf) pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: land ? 'landscape' : 'portrait' });
    else pdf.addPage('a4', land ? 'landscape' : 'portrait');
    const k = Math.min(pw / w, ph / h), iw = w * k, ih = h * k;
    pdf.addImage(data, 'JPEG', (pw - iw) / 2, (ph - ih) / 2, iw, ih);
    if (img.close) img.close();
  }
  if (!pdf) throw new Error('no photos');
  return pdf.output('blob');
}
function _ccfLoadImage(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => _ccfLoadImageEl(file));
  }
  return _ccfLoadImageEl(file);
}
function _ccfLoadImageEl(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('this photo format cannot be read — use JPEG or a PDF')); };
    im.src = url;
  });
}

/* ── TENANTS TAB: DOCUMENTS SECTION ────────────────────────── */
const _ccfDocEdit = {};
function ccfDocLabel(type, rec) {
  if (type === 'kurzzeitmietvertrag') return 'Mietvertrag befristet';
  if (type === 'mietvertrag' && rec && ccfA().app === 'rentals') { const f = ccfA().firstContract(rec, []); return f[0] ? f[0].label : 'Mietvertrag'; }
  if (type === 'mietvertrag') return 'Mietvertrag';
  if (type === 'parkplatz_mietvertrag') return 'Parkplatz-Mietvertrag';
  if (type === 'uebergabeprotokoll') return 'Übergabeprotokoll';
  if (type === 'einzug') return 'Übergabe Einzug';
  if (type === 'auszug') return 'Übergabe Auszug';
  const m = /^verlaengerung_(\d{4}-\d{2}-\d{2})$/.exec(type || '');
  if (m) {
    const row = rec ? ccfA().renewalRows(rec).find(x => x.key === type) : null;
    return row ? row.n + '. Verlängerung' : 'Verlängerung ab ' + ccfFmt(m[1]);
  }
  return String(type || 'Dokument');
}
function _ccfDocRows(rec) {
  const docs = ccfDocsOf(rec.id);
  const rows = [];
  const seen = new Set();
  const add = (type, label, sub, extra) => { if (seen.has(type)) return; seen.add(type); rows.push({ type, label, sub, ...(extra || {}) }); };
  // First contract (a type switch never hides a contract: any other stored one is listed too)
  ccfA().firstContract(rec, docs).forEach(x => add(x.type, x.label));
  const ren = ccfA().renewalRows(rec);
  ren.forEach(x => add(x.key, x.n + '. Verlängerung', 'ab ' + ccfFmt(x.p.valid_from), { renewal: x }));
  add('einzug', 'Übergabe Einzug');
  add('auszug', 'Übergabe Auszug', '', { notYet: !rec.mietende });
  docs.forEach(d => add(d.type, ccfDocLabel(d.type, rec)));   // anything else that exists stays visible
  return rows;
}
function _ccfCell(rec, row, variant, edit) {
  const tid = rec.id, doc = ccfDocOf(tid, row.type, variant);
  const a = `'${ccfEsc(String(tid))}','${ccfEsc(row.type)}','${variant}'`;
  if (doc) {
    const x = edit ? `<span class="ccf-cell-x" role="button" tabindex="0" aria-label="Delete"
        onclick="event.stopPropagation();ccfDeleteDoc(${a})"><i class="ti ti-x"></i></span>` : '';
    return `<button type="button" class="ccf-cell ccf-cell--${variant === 'signed' ? 's' : 'u'}" onclick="ccfDocTap(${a})"
      aria-label="${variant === 'signed' ? 'Signed' : 'Unsigned'} ${ccfEsc(row.label)}${edit ? ' — replace' : ''}"><i class="ti ti-file-text"></i> ${ccfFmtShort(doc.uploaded_at) || 'PDF'}${x}</button>`;
  }
  const quiet = !edit && (variant === 'unsigned' || row.notYet);
  if (quiet) return `<span class="ccf-cell ccf-cell--none" aria-label="none">—</span>`;
  return `<button type="button" class="ccf-cell ccf-cell--empty" onclick="ccfDocUpload(${a})"><i class="ti ti-upload"></i> Upload</button>`;
}
function ccfDocsSectionHTML(rec, ctx) {
  if (!rec || !rec.id) return '';
  const tid = rec.id, edit = !!_ccfDocEdit[tid];
  const rows = _ccfDocRows(rec);
  const signedTypes = new Set(ccfDocsOf(tid).filter(d => (d.variant || 'signed') === 'signed').map(d => d.type));
  const body = rows.map(r => {
    const rm = edit && r.renewal && r.renewal.last && !signedTypes.has(r.type)
      ? `<button type="button" class="ccf-link ccf-link--red" onclick="${ccfA().renewDeleteFn}('${ccfEsc(String(tid))}','${ccfEsc(String(r.renewal.p.id))}')">Remove renewal</button>` : '';
    return `<div class="ccf-drow"><div class="ccf-dname"><div>${ccfEsc(r.label)}</div>${r.sub ? `<div class="ccf-dsub">${ccfEsc(r.sub)}</div>` : ''}${rm}</div>
      ${_ccfCell(rec, r, 'unsigned', edit)}${_ccfCell(rec, r, 'signed', edit)}</div>`;
  }).join('');
  setTimeout(() => ccfPrepareLinks(ccfDocsOf(tid).map(d => d.file_url)), 0);
  const Sec = ctx === 'modal' ? 'tn-msec' : 'tn-sec', Body = ctx === 'modal' ? 'tn-msec-body' : 'tn-sec-body', Lbl = ctx === 'modal' ? 'tn-msec-lbl' : 'tn-sec-lbl';
  return `<div class="${Sec} ccf-docs" data-ccf-docs="${ccfEsc(String(tid))}" data-ctx="${ctx}">
    <div class="${Body}" style="padding-top:14px">
      <div style="margin-bottom:10px"><span class="${Lbl}">Documents</span></div>
      <div class="ccf-dhead"><span>Document</span><span>Unsigned</span><span>Signed</span></div>
      ${body}
      <p class="ccf-hint" style="margin-top:8px">${edit ? 'Edit: tap a document to replace it, the × deletes it.' : 'Tap a PDF to open it. Unsigned arrives by itself when you approve in the generator.'}</p>
    </div>
    <div class="tn-sec-footer ccf-foot">
      ${edit ? `<button class="tn-btn tn-btn-primary" onclick="ccfDocEditToggle('${ccfEsc(String(tid))}')">Done</button>`
             : `<button class="tn-btn tn-btn-sm" onclick="ccfDocEditToggle('${ccfEsc(String(tid))}')"><i class="ti ti-pencil"></i> Edit</button>`}
    </div>
  </div>`;
}
function ccfDocEditToggle(tid) { _ccfDocEdit[tid] = !_ccfDocEdit[tid]; ccfRefreshTenant(tid); }
/* Details row: "3 · 1 signed" */
function ccfDocsSummary(rec) {
  if (!rec || !rec.id) return '';
  const rows = _ccfDocRows(rec);
  const docs = ccfDocsOf(rec.id);
  const signed = rows.filter(r => docs.some(d => d.type === r.type && (d.variant || 'signed') === 'signed')).length;
  return rows.length + ' \u00b7 ' + (signed ? signed + ' signed' : 'none signed');
}

/* ── TENANTS TAB: ZÄHLERSTÄNDE SECTION ─────────────────────── */
let _ccfReadings = {};       // tenant_id → rows of meter_readings
const _ccfMeterEdit = {};
function ccfReadingsSet(rows) {
  _ccfReadings = {};
  (rows || []).forEach(r => { (_ccfReadings[r.tenant_id] = _ccfReadings[r.tenant_id] || []).push(r); });
}
function ccfLoadReadings(tids) {
  if (!tids.length || typeof sbL === 'undefined' || !sbL) return Promise.resolve({ data: [] });
  return sbL.from('meter_readings').select('*').eq('app', ccfA().app).in('tenant_id', tids.map(String))
    .then(res => { if (res.error) console.warn('[meters] load:', res.error.message); ccfReadingsSet(res.data || []); return res; });
}
function ccfMeterUnit(meter) { return /strom/i.test(meter) ? 'kWh' : /gas|wasser/i.test(meter) ? 'm³' : ''; }
function _ccfMeterRows(tid) {
  const rs = _ccfReadings[String(tid)] || [];
  const cfg = ccfA().meters(ccfRec(tid));
  const names = cfg.map(c => c.meter);
  rs.forEach(r => { if (!names.includes(r.meter)) names.push(r.meter); });
  return names.map(m => {
    const c = cfg.find(x => x.meter === m) || {};
    const ein = rs.find(r => r.meter === m && r.occasion === 'einzug') || null;
    const aus = rs.find(r => r.meter === m && r.occasion === 'auszug') || null;
    return { meter: m, unit: (ein && ein.unit) || (aus && aus.unit) || c.unit || ccfMeterUnit(m), ein, aus,
      noEin: (ein && ein.meter_no) || '', noAus: (aus && aus.meter_no) || '', noCfg: c.no || '' };
  });
}
function ccfMetersSectionHTML(rec, ctx) {
  if (!rec || !rec.id) return '';
  const tid = String(rec.id), edit = !!_ccfMeterEdit[tid];
  const rows = _ccfMeterRows(tid);
  const rs = _ccfReadings[tid] || [];
  const dEin = (rs.find(r => r.occasion === 'einzug' && r.reading_date) || {}).reading_date;
  const dAus = (rs.find(r => r.occasion === 'auszug' && r.reading_date) || {}).reading_date;
  const val = r => r ? ccfNumFmt(r.value, 'auto') + (r.unit ? ' ' + ccfEsc(r.unit) : '') : '—';
  const nrTxt = r => {
    const a = r.noEin, b = r.noAus;
    if (a && b && a !== b) return 'Nr. ' + ccfEsc(a) + ' → ' + ccfEsc(b) + ' (exchanged)';
    return (a || b || r.noCfg) ? 'Nr. ' + ccfEsc(a || b || r.noCfg) : '';
  };
  let grid;
  if (!edit) {
    grid = `<div class="ccf-mhead"><span>Zähler</span><span>Einzug ${dEin ? ccfFmtShort(dEin) : ''}</span><span>Auszug ${dAus ? ccfFmtShort(dAus) : ''}</span></div>` +
      (rows.length ? rows.map(r => `<div class="ccf-mrow"><div><div>${ccfEsc(r.meter)}</div><div class="ccf-dsub">${nrTxt(r)}</div></div>
        <span>${val(r.ein)}</span><span>${val(r.aus)}</span></div>`).join('')
        : '<p class="ccf-hint">No Zähler in Settings yet.</p>');
  } else {
    const k = s => ccfEsc(s).replace(/[^a-z0-9]/gi, '_');
    grid = `<div class="ccf-mdates">
        <label class="rm-field"><span class="ccf-mlbl">Einzug date</span><input class="rm-input" data-cm="date-einzug" type="text" inputmode="numeric" placeholder="TT.MM.JJJJ" value="${ccfFmt(dEin)}"/></label>
        <label class="rm-field"><span class="ccf-mlbl">Auszug date</span><input class="rm-input" data-cm="date-auszug" type="text" inputmode="numeric" placeholder="TT.MM.JJJJ" value="${ccfFmt(dAus)}"/></label>
      </div>` + rows.map(r => `<div class="ccf-medit" data-meter="${ccfEsc(r.meter)}" data-unit="${ccfEsc(r.unit)}">
        <div class="ccf-mname">${ccfEsc(r.meter)}${r.unit ? ` <span class="ccf-dsub">${ccfEsc(r.unit)}</span>` : ''}</div>
        <div class="ccf-mgrid">
          <label class="rm-field"><span class="ccf-mlbl">Nr. Einzug</span><input class="rm-input" data-cm="no-einzug" id="ccfm-ne-${k(r.meter)}" type="text" value="${ccfEsc(r.noEin || r.noCfg)}"/></label>
          <label class="rm-field"><span class="ccf-mlbl">Einzug</span><input class="rm-input" data-cm="v-einzug" type="text" inputmode="decimal" value="${r.ein ? ccfNumFmt(r.ein.value, 'auto') : ''}"/></label>
          <label class="rm-field"><span class="ccf-mlbl">Nr. Auszug</span><input class="rm-input" data-cm="no-auszug" type="text" value="${ccfEsc(r.noAus || r.noEin || r.noCfg)}"/></label>
          <label class="rm-field"><span class="ccf-mlbl">Auszug</span><input class="rm-input" data-cm="v-auszug" type="text" inputmode="decimal" value="${r.aus ? ccfNumFmt(r.aus.value, 'auto') : ''}"/></label>
        </div></div>`).join('');
  }
  const Sec = ctx === 'modal' ? 'tn-msec' : 'tn-sec', Body = ctx === 'modal' ? 'tn-msec-body' : 'tn-sec-body', Lbl = ctx === 'modal' ? 'tn-msec-lbl' : 'tn-sec-lbl';
  const idA = ccfEsc(tid);
  return `<div class="${Sec} ccf-meters" data-ccf-meters="${idA}" data-ctx="${ctx}">
    <div class="${Body}" style="padding-top:14px">
      <div style="margin-bottom:10px"><span class="${Lbl}">Zählerstände</span></div>
      ${grid}
      ${edit ? '' : '<p class="ccf-hint" style="margin-top:8px">From Übergabe Einzug / Auszug, with the Zählernummer — for the NK-Abrechnung (Settlements will use them later).</p>'}
    </div>
    <div class="tn-sec-footer ccf-foot">
      ${edit ? `<button class="tn-btn tn-btn-sm" onclick="ccfMeterEditToggle('${idA}')">Cancel</button>
        <button class="tn-btn tn-btn-primary" id="ccfMeterSave-${ctx}-${idA}" onclick="ccfMeterSave('${idA}','${ctx}')">Save</button>`
        : `<button class="tn-btn tn-btn-sm" onclick="ccfMeterEditToggle('${idA}')"><i class="ti ti-pencil"></i> Edit</button>`}
    </div>
  </div>`;
}
function ccfMeterEditToggle(tid) { _ccfMeterEdit[tid] = !_ccfMeterEdit[tid]; ccfRefreshTenant(tid); }
/* Details row: "Einzug ✓ · Auszug —" */
function ccfMetersSummary(rec) {
  if (!rec || !rec.id) return '';
  const rows = _ccfMeterRows(String(rec.id));
  if (!rows.length) return 'none set up';
  const has = occ => rows.some(r => occ === 'einzug' ? r.ein : r.aus);
  return 'Einzug ' + (has('einzug') ? '\u2713' : '\u2014') + ' \u00b7 Auszug ' + (has('auszug') ? '\u2713' : '\u2014');
}
async function ccfMeterSave(tid, ctx) {
  const box = document.querySelector(`[data-ccf-meters="${CSS.escape(String(tid))}"][data-ctx="${ctx}"]`);
  if (!box) return;
  const btn = document.getElementById(`ccfMeterSave-${ctx}-${tid}`);
  const dateOf = occ => ccfIso(box.querySelector(`[data-cm="date-${occ}"]`)?.value);
  const rows = [];
  let bad = null;
  box.querySelectorAll('.ccf-medit').forEach(m => {
    ['einzug', 'auszug'].forEach(occ => {
      const inp = m.querySelector(`[data-cm="v-${occ}"]`);
      const raw = (inp?.value || '').trim();
      const v = raw === '' ? null : ccfNum(raw);
      if (raw !== '' && v == null) bad = inp;
      rows.push({ meter: m.dataset.meter, unit: m.dataset.unit || null, occasion: occ, value: v,
        meter_no: (m.querySelector(`[data-cm="no-${occ}"]`)?.value || '').trim() || null, reading_date: dateOf(occ) });
    });
  });
  if (bad) { bad.style.borderColor = '#C4705A'; bad.focus(); return; }
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const keep = rows.filter(r => r.value != null), drop = rows.filter(r => r.value == null);
    if (keep.length) {
      const { error } = await sbL.from('meter_readings').upsert(keep.map(r => ({ app: ccfA().app, tenant_id: String(tid), ...r })),
        { onConflict: 'app,tenant_id,occasion,meter' });
      if (error) throw error;
    }
    for (const r of drop) {
      const ex = (_ccfReadings[String(tid)] || []).find(x => x.meter === r.meter && x.occasion === r.occasion);
      if (ex) { const { error } = await sbL.from('meter_readings').delete().eq('id', ex.id); if (error) throw error; }
    }
    await ccfLoadReadings(ccfRecs().map(r => r.id));
    _ccfMeterEdit[tid] = false;
    ccfRefreshTenant(tid);
  } catch (e) {
    console.error('[meters] save', e);
    ccfToast('Zählerstände not saved — ' + (e && e.message ? e.message : 'connection problem') + '. Please try again.', true);
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  }
}
/* Übergabe → readings of one occasion (empty values are left out) */
async function ccfSaveReadings(tid, occasion, date, readings) {
  const rows = (readings || []).filter(r => r.value != null).map(r => ({
    app: ccfA().app, tenant_id: String(tid), occasion, reading_date: date || null,
    meter: r.meter, meter_no: r.meter_no || null, value: r.value, unit: r.unit || null }));
  if (!rows.length) return;
  const { error } = await sbL.from('meter_readings').upsert(rows, { onConflict: 'app,tenant_id,occasion,meter' });
  if (error) throw error;
  const list = _ccfReadings[String(tid)] = (_ccfReadings[String(tid)] || []).filter(x => !(x.occasion === occasion && rows.some(r => r.meter === x.meter)));
  list.push(...rows);
}

/* Re-draw one tenant's Documents + Zählerstände wherever they are shown (card and pop-up) */
function ccfRefreshTenant(tid) {
  const rec = ccfRec(tid); if (!rec) return;
  const sel = v => CSS.escape(String(v));
  document.querySelectorAll(`[data-ccf-docs="${sel(tid)}"]`).forEach(el => {
    const t = document.createElement('div'); t.innerHTML = ccfDocsSectionHTML(rec, el.dataset.ctx);
    if (t.firstElementChild) el.replaceWith(t.firstElementChild);
  });
  document.querySelectorAll(`[data-ccf-meters="${sel(tid)}"]`).forEach(el => {
    const t = document.createElement('div'); t.innerHTML = ccfMetersSectionHTML(rec, el.dataset.ctx);
    if (t.firstElementChild) el.replaceWith(t.firstElementChild);
  });
  // the card's "Details" row shows a summary of both → redraw the card too
  if (typeof ccfA().redraw === 'function') { try { ccfA().redraw(); } catch (e) {} }
}

/* ── RENEW: opens the generator, prefilled ─────────────────── */
function ccfRenewOpen(tid) {
  const rec = ccfRec(tid); if (!rec) return;
  const endNow = ccfIso(rec.vertragsende) || ccfIso(rec.mietende);
  const start = endNow ? ccfAddDays(endNow, 1) : '';
  const end = start ? ccfAddDays(ccfAddYears(start, 1), -1) : '';
  const cur = ccfA().currentRent(rec) || {};
  const n = ccfA().renewalRows(rec).length + 1;
  const ct = (ccfA().app === 'casa' ? (typeof tnContractType === 'function' ? tnContractType(rec) : rec.contract_type)
                                    : (typeof rntContractType === 'function' ? rntContractType(rec) : rec.contract_type)) || 'kurzzeit';
  // A Jahresvertrag is renewed with the befristet generator and saved as Jahresvertrag again
  const saveAs = ct === 'jahres' ? 'jahres' : null;
  ccfA().openRenew(rec, {
    ct: saveAs ? 'kurzzeit' : ct, saveAs, tid: rec.id, label: n + '. Verlängerung', start, end,
    mode: cur.mode, kalt: cur.kalt, nk: cur.nk, total: cur.total,
    kautionSoll: Number(rec.kaution_soll) > 0 ? Number(rec.kaution_soll) : null,
  });
}
function ccfRenewSwitch(type) { ccfA().renewSwitch(type); }

/* ── STYLES ────────────────────────────────────────────────── */
(function () {
  if (typeof document === 'undefined' || document.getElementById('ccf-style')) return;
  const st = document.createElement('style'); st.id = 'ccf-style';
  st.textContent = `
html #contractBody .cc-seg--mieter{display:none !important}
.ccf-for{background:var(--cc-bg);border:var(--cc-border);border-radius:var(--cc-r-sm);padding:10px 12px;margin-bottom:14px}
.ccf-for-row{display:flex;align-items:center;gap:10px}
.ccf-for-lbl{font-size:10px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:var(--cc-taupe);min-width:32px}
.ccf-for-sel{flex:1;min-width:0;min-height:40px;padding:8px 10px;background:var(--cc-white);border:var(--cc-border);border-radius:var(--cc-r-sm);font-family:inherit;font-size:14px;color:var(--cc-charcoal);-webkit-appearance:none;appearance:none}
.ccf-for-sel:disabled{opacity:1;color:var(--cc-charcoal)}
.ccf-for-hint{font-size:11.5px;line-height:1.45;color:var(--cc-taupe);margin-top:6px}
.ccf-link{padding:0;background:none;border:none;font-family:inherit;font-size:12px;font-weight:500;color:#9A7A4E;cursor:pointer}
.ccf-link--red{color:#A32D2D;font-size:11px;margin-top:4px}
.ccf-miete{margin-bottom:14px}
.ccf-seg{display:flex;border:var(--cc-border);border-radius:var(--cc-r-sm);overflow:hidden;margin-bottom:10px}
.ccf-seg button{flex:1;min-height:38px;border:none;background:transparent;font-family:inherit;font-size:13px;color:var(--cc-taupe);cursor:pointer}
.ccf-seg button+button{border-left:var(--cc-border)}
.ccf-seg[data-mode="pauschal"] button[data-v="pauschal"],.ccf-seg[data-mode="kalt_nk"] button[data-v="kalt_nk"]{background:var(--cc-ink);color:var(--cc-white);font-weight:500}
.ccf-warm{display:flex;justify-content:space-between;align-items:baseline;padding:8px 0 4px;border-top:var(--cc-border);font-size:12px;color:var(--cc-taupe)}
.ccf-warm #rc-warm{font-size:14px;font-weight:500;color:var(--cc-charcoal)}
.ccf-hint{margin:4px 0 0;font-size:11.5px;line-height:1.45;color:var(--cc-taupe)}
.ccf-kaution-hint{font-size:11.5px;line-height:1.45;color:#7A5A2A;margin:-8px 0 14px}
#contractFooter .ccf-btn-draft,.ccf-btn-draft{flex:1;height:48px;border-radius:var(--cc-r-md);background:var(--cc-white);color:var(--cc-ink);border:.5px solid var(--cc-charcoal);font-family:inherit;font-size:13px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}
#contractFooter .rm-btn--pdf:disabled{opacity:.45;cursor:not-allowed}
#contractFooter .ccf-draft-primary,#aptContractFooter .ccf-draft-primary,#pkContractFooter .ccf-draft-primary{background:var(--cc-ink);color:var(--cc-white);border-color:var(--cc-ink)}
#contractFooter,#aptContractFooter,#pkContractFooter{flex-wrap:wrap}
.ccf-foot-note{flex:0 0 100%;order:-1;margin:-2px 0 2px;font-size:11.5px;line-height:1.4;color:var(--cc-taupe)}
#aptContractFooter,#pkContractFooter{display:flex;align-items:center;gap:8px}
#aptContractFooter .ccf-btn-draft,#pkContractFooter .ccf-btn-draft{flex:1;background:var(--cc-white);color:var(--cc-ink);border:.5px solid var(--cc-charcoal)}
#aptContractFooter .ccf-approve,#pkContractFooter .ccf-approve{flex:1}
#aptContractFooter .ccf-approve:disabled,#pkContractFooter .ccf-approve:disabled{opacity:.45;cursor:not-allowed}
html #aptContractBody .cc-seg--mieter,html #pkContractBody .cc-seg--mieter{display:none !important}
.ccf-ov{position:fixed;inset:0;z-index:900;background:rgba(30,27,24,.35);display:none;align-items:flex-end;justify-content:center}
.ccf-ov.open{display:flex}
.ccf-sheet{width:100%;max-width:560px;max-height:calc(100% - max(40px,env(safe-area-inset-top,0px) + 20px));background:var(--cc-white);border-radius:20px 20px 0 0;display:flex;flex-direction:column;font-family:inherit;color:var(--cc-charcoal)}
.ccf-sheet--small{max-height:none}
.ccf-shd{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:20px 20px 14px;border-bottom:var(--cc-border)}
.ccf-eyebrow{font-size:9px;font-weight:500;letter-spacing:.11em;text-transform:uppercase;color:#9A7A4E;margin-bottom:3px}
.ccf-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:300;color:var(--cc-ink)}
.ccf-sub{font-size:12px;color:var(--cc-taupe);margin-top:2px}
.ccf-x{width:30px;height:30px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--cc-surface);border:var(--cc-border);border-radius:50%;color:var(--cc-taupe);cursor:pointer}
.ccf-sbody{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 20px;display:flex;flex-direction:column;gap:16px}
.ccf-note{margin:0;padding:9px 11px;background:#F3EADC;border:.5px solid #D4B896;border-radius:10px;font-size:12px;line-height:1.45;color:#6E5230}
.ccf-warn{margin:6px 0 0;padding:8px 10px;background:#FAEEDA;border:.5px solid #EF9F27;border-radius:8px;font-size:12px;line-height:1.45;color:#633806}
.ccf-sh{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:4px;font-size:9px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--cc-taupe)}
.ccf-change{position:relative;font-size:12px;font-weight:500;letter-spacing:0;text-transform:none;color:#9A7A4E}
.ccf-change select{position:absolute;inset:0;opacity:0;width:100%;font-size:16px}
.ccf-srow{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-top:var(--cc-border)}
.ccf-sl{font-size:12px;color:var(--cc-taupe);flex-shrink:0}
.ccf-check{align-items:flex-start;cursor:pointer}
.ccf-check input{width:20px;height:20px;margin:0 2px 0 0;flex-shrink:0;accent-color:var(--cc-ink)}
.ccf-check .ccf-sl{flex:1}
.ccf-check .ccf-sv{display:flex;flex-direction:column}
.ccf-sv{text-align:right;min-width:0;font-size:13px;color:var(--cc-charcoal);overflow-wrap:anywhere}
.ccf-ss{font-size:11px;color:var(--cc-taupe);margin-top:1px}
.ccf-sft{display:flex;align-items:center;gap:10px;padding:12px 16px;padding-bottom:max(16px,env(safe-area-inset-bottom,16px));border-top:var(--cc-border)}
.ccf-go{flex:1;height:48px;border-radius:var(--cc-r-md);background:var(--cc-ink);color:var(--cc-white);border:none;font-family:inherit;font-size:13px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}
.ccf-go:disabled{opacity:.6}
.ccf-btn-mid{flex:1}
.ccf-dhead,.ccf-drow,.ccf-mhead,.ccf-mrow{display:grid;grid-template-columns:minmax(0,1fr) 92px 92px;gap:8px;align-items:center}
.ccf-dhead,.ccf-mhead{font-size:11px;color:var(--cc-taupe);padding-bottom:6px}
.ccf-dhead span+span,.ccf-mhead span+span{text-align:center}
.ccf-drow,.ccf-mrow{padding:9px 0;border-top:var(--cc-border);font-size:13px;color:var(--cc-charcoal)}
.ccf-mrow span{text-align:center;font-size:12.5px;font-variant-numeric:tabular-nums}
.ccf-dname{min-width:0}
.ccf-dsub{font-size:11px;color:var(--cc-taupe);margin-top:2px}
.ccf-cell{box-sizing:border-box;position:relative;width:92px;height:40px;border-radius:8px;font-family:inherit;font-size:11px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:5px;padding:0 6px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ccf-cell--u{background:var(--cc-white);border:.5px solid #B8AE9F;color:var(--cc-charcoal)}
.ccf-cell--s{background:#EAF3DE;border:.5px solid #97C459;color:#27500A}
.ccf-cell--empty{background:transparent;border:.5px dashed #B8AE9F;color:var(--cc-taupe);font-weight:400}
.ccf-cell--none{border:none;color:var(--cc-stone);cursor:default}
.ccf-cell-x{position:absolute;top:-7px;right:-7px;width:20px;height:20px;border-radius:50%;background:#A32D2D;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px}
.ccf-foot{padding:8px 14px;gap:6px}
.ccf-mdates{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px}
.ccf-medit{padding:10px 0;border-top:var(--cc-border)}
.ccf-mname{font-size:13px;color:var(--cc-charcoal);margin-bottom:6px}
.ccf-mgrid{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}
.ccf-mgrid .rm-field,.ccf-mdates .rm-field{margin-bottom:6px}
.ccf-mlbl{font-size:10px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:var(--cc-taupe)}
@media (min-width:701px){.ccf-ov{align-items:center}.ccf-sheet{border-radius:20px;max-height:86vh}}
`;
  document.head.appendChild(st);
})();
