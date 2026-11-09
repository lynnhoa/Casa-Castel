/* ─────────────────────────────────────────────────────────────
   KÜNDIGUNG · Casa Castel + Rentals (Nov 2026 · owner: "simple — store the tenant's Kündigung, create the
   Kündigungsbestätigung and store it, that's all")
   cc-kuendigung.js   (landlord.html after tab-tenants.js · rentals-index.html after rentals-tab-tenants.js ·
                       needs cc-contract-flow.js, nk-letter.js, pdf-open.js) · kbA() picks the app, as ccfA()

   Tenants › tenant card › More › Kündigung — one sheet, three steps:
     1 · Tenant's Kündigung   their e-mail as PDF, screenshot or photo → Documents "Kündigung (Mieter)" (Signed)
     2 · Letter               Kündigung vom · Eingang am · the end date (suggested, you can change it)
     3 · Create               the Kündigungsbestätigung (Casa Castel letter style) → Documents
                              "Kündigungsbestätigung" (Unsigned) · the tenant's Contract end = that date · the PDF
                              opens to send (Draft PDF: look only, nothing is saved)
   Letter 1 · Mietvertrag (unbefristet): 3 months to the month end — received by the 3rd working day of a month
              (Mon–Fri, not a public holiday in Hessen) → end of the month after next, else one month later.
              A Kündigungsverzicht in the contract is not known here: check the date.
   Letter 2 · Kurzzeit / Jahresvertrag (befristet): no ordinary Kündigung — you type the early end; the letter confirms it.
   Nov 2026 (owner): the letter follows the contract type (no switch) · Ort of the signature: Wiesbaden or Mainz ·
              final texts (KUENDIGUNG-TEXTE.md) · Ort, Datum above the title, only the landlord signs.
   Rentals (Nov 2026 · #26) — flats, Gewerbe, parking · texts 2 (flat), 3, 4, 5 of KUENDIGUNG-TEXTE.md · 1–3 tenants:
     Stellplatz → 5 · 3 months to the quarter end, never before its 1st year ends (Mietbeginn + 1 year − 1 day)
     Gewerbe    → 4 · 6 months to the quarter end
              (both: received by the 3rd working day of a quarter → counted from the quarter before, § 580a)
     Kurzzeit, or a Mietvertrag approved with an end (its rent entry has one) → 2 · Vorzeitiges Ende
     Mietvertrag → 3 · 3 months to the month end. Mainz flats: Rheinland-Pfalz holidays (+ 01.11.), else Hessen.
     Ort = the unit's Unterzeichnungsort / place (Casa's remembered Ort is never read or written here).
     Create: Contract end on the card (rnt_tenant_records) and, as every card save, the running contract's rent
     entry when it is fixed-term already (_rntSyncContractEnd) — an open-ended Mietvertrag entry stays empty.
   Nothing else is tracked: the dates are only printed in the letter.
   ───────────────────────────────────────────────────────────── */

'use strict';

/* ── Dates ─────────────────────────────────────────────────── */
const _kbPad = n => String(n).padStart(2, '0');
const _kbYmd = (y, m, d) => y + '-' + _kbPad(m) + '-' + _kbPad(d);          // m = 1…12
const _kbDim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const _kbIsIso = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
function _kbAddDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function _kbDe(iso) { return _kbIsIso(iso) ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : ''; }
function _kbToIso(v) {                                       // what a date field gives → ISO or '' (complete dates only)
  const s = String(v || '').trim();
  if (_kbIsIso(s)) return s;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);         // 2.11.2026 / 02.11.2026 — never a half-typed "02.11.20"
  if (!m) return '';
  const iso = m[3] + '-' + _kbPad(m[2]) + '-' + _kbPad(m[1]);
  const d = new Date(iso + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === iso ? iso : '';
}
/* Easter Sunday (Gregorian, Meeus / Jones / Butcher) */
function kbEaster(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return _kbYmd(y, Math.floor(n / 31), (n % 31) + 1);
}
/* Public holidays in Hessen (Casa Castel = Mainz-Kastel = Wiesbaden) */
const _kbHol = {};
function kbHolidaysHE(y) {
  if (_kbHol[y]) return _kbHol[y];
  const e = kbEaster(y);
  return (_kbHol[y] = new Set([_kbYmd(y, 1, 1), _kbAddDays(e, -2), _kbAddDays(e, 1), _kbYmd(y, 5, 1), _kbAddDays(e, 39),
                               _kbAddDays(e, 50), _kbAddDays(e, 60), _kbYmd(y, 10, 3), _kbYmd(y, 12, 25), _kbYmd(y, 12, 26)]));
}
/* Rheinland-Pfalz (Mainz flats, Rentals): Hessen + Allerheiligen 01.11. — cached per Land (land omitted = Hessen, Casa) */
function kbHolidays(y, land) {
  if (land !== 'RP') return kbHolidaysHE(y);
  const k = 'RP' + y; if (_kbHol[k]) return _kbHol[k];
  return (_kbHol[k] = new Set([...kbHolidaysHE(y), _kbYmd(y, 11, 1)]));
}
function kbIsWorkday(iso, land) {
  const wd = new Date(iso + 'T12:00:00Z').getUTCDay();
  return wd >= 1 && wd <= 5 && !kbHolidays(Number(iso.slice(0, 4)), land).has(iso);
}
function kbThirdWorkday(y, m, land) {
  let n = 0;
  for (let d = 1; d <= _kbDim(y, m); d++) { const iso = _kbYmd(y, m, d); if (kbIsWorkday(iso, land) && ++n === 3) return iso; }
  return null;
}
/* Gewerbe (6 months) · Parkplatz (3 months) to the quarter end: received by the 3rd working day of a quarter → counted
   from the end of the quarter before; never before minEnd (parking: 1 year) */
function kbQuarterStart(iso) { const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)); return _kbYmd(y, m - (m - 1) % 3, 1); }
function kbEndQuarter(eingang, months, minEnd, land) {
  if (!_kbIsIso(eingang)) return '';
  const qs = kbQuarterStart(eingang), q3 = kbThirdWorkday(Number(qs.slice(0, 4)), Number(qs.slice(5, 7)), land);
  const from = q3 && eingang <= q3 ? _kbAddDays(qs, -1) : eingang;
  let ty = Number(from.slice(0, 4)), tm = Number(from.slice(5, 7)) + months; while (tm > 12) { tm -= 12; ty++; }
  let e = _kbYmd(ty, tm, Math.min(Number(from.slice(8, 10)), _kbDim(ty, tm)));
  if (_kbIsIso(minEnd) && e < minEnd) e = minEnd;
  const ey = Number(e.slice(0, 4)), eq = Math.ceil(Number(e.slice(5, 7)) / 3) * 3;
  return _kbYmd(ey, eq, _kbDim(ey, eq));
}
/* start + 1 year − 1 day (01.04.2026 → 31.03.2027 · 29.02.2028 → 28.02.2029) */
function kbYearMinEnd(start) {
  if (!_kbIsIso(start)) return '';
  const y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7)), d = Number(start.slice(8, 10));
  return new Date(Date.UTC(y + 1, m - 1, d - 1, 12)).toISOString().slice(0, 10);
}
/* Mietvertrag unbefristet (§ 573c BGB): received by the 3rd working day → end of the month after next */
function kbEndUnbefristet(eingang, land) {
  if (!_kbIsIso(eingang)) return '';
  const y = Number(eingang.slice(0, 4)), m = Number(eingang.slice(5, 7));
  const third = kbThirdWorkday(y, m, land), add = third && eingang <= third ? 2 : 3;
  let ty = y, tm = m + add; while (tm > 12) { tm -= 12; ty++; }
  return _kbYmd(ty, tm, _kbDim(ty, tm));
}

/* ── The tenancy ───────────────────────────────────────────── */
const _kbRec = tid => kbA().rec(tid);
const _kbName = r => [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
const _kbEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* Letter 2 for a fixed-term contract (Kurzzeit · Jahresvertrag), letter 1 for a Mietvertrag — always by the contract type */
function kbVersionOf(rec) { return kbA().version(rec); }   // 'unbefristet' · 'befristet' · Rentals also 'gewerbe' · 'parkplatz'
function _kbVersionCasa(rec) {
  const ct = typeof tnContractType === 'function' ? tnContractType(rec) : rec && rec.contract_type;
  return ct === 'kurzzeit' || ct === 'jahres' ? 'befristet' : 'unbefristet';
}
/* the end the running (latest) contract has today — "befristet bis …" in letter 2 */
function _kbAgreedEnd(rec) { return kbA().agreedEnd(rec); }
function _kbAgreedEndCasa(rec) {
  const cs = typeof _tnContractState === 'function' ? _tnContractState(rec) : null;
  const last = cs && cs.all.length ? cs.all[cs.all.length - 1] : null;
  return (last && last.end) || (typeof _ccIso === 'function' ? _ccIso(rec.vertragsende) : '') || '';
}
const _kbDocOf = (tid, type, variant) => (typeof ccfDocOf === 'function' ? ccfDocOf(tid, type, variant) : null);

/* ── App adapter (Nov 2026 · #26): Casa Castel rooms (landlord.html) · Rentals flats, Gewerbe, parking (rentals-index.html)
   Same pattern as cc-contract-flow.js (CCF_CASA / CCF_RENTALS). Casa keeps exactly its old code paths. */
const KB_CASA = {
  app: 'casa', rememberOrt: true,
  rec: tid => (typeof _tnRecords !== 'undefined' ? _tnRecords : []).find(r => String(r.id) === String(tid)) || null,
  version: rec => _kbVersionCasa(rec),
  agreedEnd: rec => _kbAgreedEndCasa(rec),
  planned: rec => { const cs = typeof _tnContractState === 'function' ? _tnContractState(rec) : null; return cs && cs.next && cs.next.start > _kbToday() ? cs.next.start : ''; },
  kicker: rec => (rec.room || '') + ' · ' + _kbName(rec),
  ctWord: rec => { const ct = typeof tnContractType === 'function' ? tnContractType(rec) : rec.contract_type; return ct === 'kurzzeit' ? 'Kurzzeit' : ct === 'jahres' ? 'Jahresvertrag' : 'Mietvertrag'; },
  land: () => undefined,                                     // Hessen
  ort0: () => _kbOrt0Casa(),
  fileUnit: rec => rec.room,
  letterData: (rec, st) => _kbLetterDataCasa(rec, st),
  setEnd: (rec, end) => _kbSetEnd(rec, end),
  redraw: () => { if (typeof _tnRender === 'function') _tnRender(); },
  pdfOpts: undefined,
};
const KB_RENTALS = {
  app: 'rentals', rememberOrt: false,                        // the Ort follows the unit (kb_ort stays Casa's)
  rec: tid => (typeof _rntRecords !== 'undefined' ? _rntRecords : []).find(r => String(r.id) === String(tid)) || null,
  version: rec => _kbRntVersion(rec),
  agreedEnd: rec => _kbIsoOf(rec.vertragsende) || _kbIsoOf((_rntContractEntry(rec) || {}).contract_end),
  planned: rec => (typeof _rntRenewalRows === 'function' ? _rntRenewalRows(rec) : []).map(x => _kbIsoOf(x.p.valid_from)).find(d => d > _kbToday()) || '',
  kicker: rec => [_kbRntUnitLabel(rec), typeof _rntFullTenantNames === 'function' ? _rntFullTenantNames(rec) : _kbName(rec)].filter(Boolean).join(' · '),
  ctWord: rec => (rec.parking_id ? 'Stellplatz' : _kbRntVersion(rec) === 'gewerbe' ? 'Gewerbe' : typeof rntContractType === 'function' && rntContractType(rec) === 'kurzzeit' ? 'Kurzzeit' : 'Mietvertrag'),
  land: rec => _kbRntLand(rec),
  ort0: rec => _kbRntOrt(rec),
  fileUnit: rec => (_kbRntUnit(rec) || {}).name || '',
  letterData: (rec, st) => _kbLetterDataRnt(rec, st),
  setEnd: (rec, end) => _kbSetEndRnt(rec, end),
  redraw: () => { if (typeof _rntRender === 'function') _rntRender(); },
  pdfOpts: { strict: true },                                 // never a letter with text outside the page (as the Rentals contracts)
};
function kbA() { return typeof _rntRecords !== 'undefined' ? KB_RENTALS : KB_CASA; }
const _kbIsoOf = v => _kbToIso(v) || (typeof ccRpIso === 'function' ? ccRpIso(v) : '') || '';
const KB_GW_MONTHS = 6;                                      // Gewerbe Frist (the generator's default · not stored)

/* ── State of the open sheet (kept while you type; nothing of it is stored) ── */
const _kbState = {};
const KB_ORTE = ['Wiesbaden', 'Mainz'];
function _kbOrt0(rec) { return kbA().ort0(rec); }
function _kbOrt0Casa() {
  let o = ''; try { o = localStorage.getItem('kb_ort') || ''; } catch (e) {}
  if (KB_ORTE.includes(o)) return o;
  const s = (typeof appSettings !== 'undefined' && appSettings) || {};
  const set = String(s.unterschrift_ort || '').trim();
  return KB_ORTE.includes(set) ? set : 'Wiesbaden';
}
function _kbSt(rec) {
  const k = String(rec.id);
  // an earlier letter already set the Contract end to its early end → the agreed end is no longer stored: type it
  const again = !!(_kbDocOf(k, 'kuendigungsbestaetigung', 'unsigned') || _kbDocOf(k, 'kuendigungsbestaetigung', 'signed'));
  // the contract type decides the letter: after a change of the type the sheet starts fresh (its dates mean other things)
  if (_kbState[k] && _kbState[k].v !== kbVersionOf(rec)) {
    const o = _kbState[k]; delete _kbState[k];
    if (o.ortPicked) { _kbSt(rec); Object.assign(_kbState[k], { ort: o.ort, ortPicked: true }); }
  }
  const st = _kbState[k] || (_kbState[k] = { v: kbVersionOf(rec), vom: '', eingang: '', eingangAuto: true, end: '', endAuto: true, agreed: again ? '' : _kbAgreedEnd(rec), again, done: null, ort: _kbOrt0(rec), ortPicked: false });
  if (!st.ortPicked) st.ort = _kbOrt0(rec);                 // not picked for this tenant → Casa: the place remembered on this device · Rentals: the unit's place
  return st;
}

/* ── More row on the tenant card ───────────────────────────── */
function kbRowHTML(rec) {
  if (!rec || !rec.id || typeof ccRowHTML !== 'function') return '';
  const tid = String(rec.id);
  const letter = _kbDocOf(tid, 'kuendigungsbestaetigung', 'unsigned') || _kbDocOf(tid, 'kuendigungsbestaetigung', 'signed');
  const own = _kbDocOf(tid, 'kuendigung', 'signed');
  const fmt = d => (typeof ccfFmtShort === 'function' ? ccfFmtShort(d.uploaded_at) : '');
  const meta = letter ? 'letter ' + _kbEsc(fmt(letter)) : own ? 'uploaded ' + _kbEsc(fmt(own)) : '';
  return ccRowHTML({ icon: 'file-x', title: 'Kündigung', meta, onclick: `kbOpen('${_kbEsc(tid)}')` });
}

/* ── The sheet ─────────────────────────────────────────────── */
function kbOpen(tid) {
  const rec = _kbRec(tid); if (!rec || typeof ccSheetOpen !== 'function') return;
  _kbSt(rec);
  if (typeof _ccfDocEdit !== 'undefined') delete _ccfDocEdit[tid];                 // a tap on the Kündigung opens it
  // noRefresh: a card redraw never rebuilds this sheet (what you typed, "Open PDF") — kbRefresh does it when needed
  ccSheetOpen({ title: 'Kündigung', kicker: kbA().kicker(rec), build: () => kbHTML(tid), kb: String(tid), noRefresh: true });
}
/* after an upload: only the tenant's-Kündigung line is redrawn — a date you are typing right now stays as it is */
function kbRefresh(tid) {
  if (typeof _ccSheetCur === 'undefined' || !_ccSheetCur || _ccSheetCur.kb !== String(tid)) return;
  const row = document.querySelector('#ccSheetBody [data-kb-own]');
  if (row) { row.innerHTML = _kbOwnHTML(tid); return; }
  _kbRebuild(tid);
}
/* the whole sheet again (a switch of the letter) — the fields keep what you typed (_kbState) */
function _kbRebuild(tid) {
  const body = document.getElementById('ccSheetBody'); if (!body) return;
  const y = body.scrollTop; body.innerHTML = kbHTML(tid); body.scrollTop = y;
}
function _kbOwnHTML(tid) {
  const T = _kbEsc(tid), own = _kbDocOf(tid, 'kuendigung', 'signed');
  if (typeof ccfPrepareLinks === 'function' && own && own.file_url) setTimeout(() => ccfPrepareLinks([own.file_url]), 0);
  const fmt = d => (typeof ccfFmtShort === 'function' ? ccfFmtShort(d.uploaded_at) : '');
  return own
    ? `<button type="button" class="kb-doc" onclick="ccfDocTap('${T}','kuendigung','signed')"><i class="ti ti-file-text" aria-hidden="true"></i> Kündigung (Mieter) · ${_kbEsc(fmt(own))}</button>
       <button type="button" class="kb-btn kb-btn--s" onclick="ccfDocUpload('${T}','kuendigung','signed')">Replace</button>`
    : `<button type="button" class="kb-btn" onclick="ccfDocUpload('${T}','kuendigung','signed')"><i class="ti ti-upload" aria-hidden="true"></i> Upload</button>`;
}
function _kbDateField(tid, key, label, value, sub) {
  return `<label class="kb-f"><span class="kb-l">${label}</span>
    <input type="date" class="kb-in" data-kb="${key}" value="${_kbEsc(value || '')}"
      onchange="kbSet('${_kbEsc(tid)}','${key}',this.value)"/>
    ${sub ? `<span class="kb-s" data-kb-sub="${key}">${sub}</span>` : ''}</label>`;
}
function _kbEndSub(rec, st) {
  if (st.v === 'befristet') return st.end ? 'your date · the early end' : 'type the early end you agreed';
  const q = st.v === 'gewerbe' || st.v === 'parkplatz';
  if (!st.end) return 'from Eingang am: ' + (st.v === 'gewerbe' ? KB_GW_MONTHS + ' months to the quarter end' : st.v === 'parkplatz' ? '3 months to the quarter end' : '3 months to the month end');
  if (!st.endAuto) return 'your date';
  const land = kbA().land(rec);
  if (q) {
    const min = st.v === 'parkplatz' ? _kbPkMin(rec) : '';
    if (min && st.end !== kbEndQuarter(st.eingang, 3, '', land)) return 'not before the end of the 1st year (' + _kbDe(min) + ') · you can change it';
    const qs = kbQuarterStart(st.eingang), q3 = kbThirdWorkday(Number(qs.slice(0, 4)), Number(qs.slice(5, 7)), land);
    return 'received ' + (st.eingang <= q3 ? 'by' : 'after') + ' the 3rd working day of the quarter (' + _kbDe(q3) + ') · you can change it';
  }
  const y = Number(st.eingang.slice(0, 4)), m = Number(st.eingang.slice(5, 7)), third = kbThirdWorkday(y, m, land);
  return 'received ' + (st.eingang <= third ? 'by' : 'after') + ' the 3rd working day (' + _kbDe(third) + ') · you can change it';
}
/* the end you would get from Eingang am (the rule of the letter) */
function kbSuggestEnd(rec, st) {
  const land = kbA().land(rec);
  if (st.v === 'gewerbe') return kbEndQuarter(st.eingang, KB_GW_MONTHS, '', land);
  if (st.v === 'parkplatz') return kbEndQuarter(st.eingang, 3, _kbPkMin(rec), land);
  return kbEndUnbefristet(st.eingang, land);
}
function kbHTML(tid) {
  const rec = _kbRec(tid); if (!rec) return '';
  const st = _kbSt(rec), T = _kbEsc(tid), fixed = st.v === 'befristet';
  const own = _kbDocOf(tid, 'kuendigung', 'signed');
  const letter = _kbDocOf(tid, 'kuendigungsbestaetigung', 'unsigned');
  const fmt = d => (typeof ccfFmtShort === 'function' ? ccfFmtShort(d.uploaded_at) : '');
  const ctWord = kbA().ctWord(rec), q = st.v === 'gewerbe' || st.v === 'parkplatz';
  const ortSel = `<label class="kb-f"><span class="kb-l">Ort (Unterschrift)</span>
          <select class="kb-in" data-kb-ort onchange="kbSet('${T}','ort',this.value)">${KB_ORTE.map(o => `<option${st.ort === o ? ' selected' : ''}>${o}</option>`).join('')}</select></label>`;
  const moveHint = rec.rent_until === 'move' ? '<p class="kb-hint">This tenant pays rent until the Move-out (Tenant › Edit › Rent until), not until the contract end.</p>' : '';
  const planned = kbA().planned(rec);
  const nextHint = planned ? `<p class="kb-hint kb-hint--warn">A renewal from ${_kbDe(planned)} is planned. Remove it first (Documents › Edit › Remove renewal), then create the letter.</p>` : '';
  if (typeof ccfPrepareLinks === 'function' && typeof ccfDocsOf === 'function') setTimeout(() => ccfPrepareLinks(ccfDocsOf(tid).map(d => d.file_url)), 0);
  return `<div class="kb">
    <div class="kb-step"><span class="kb-n">1</span><div class="kb-b">
      <b class="kb-t">Tenant's Kündigung</b><span class="kb-s">their e-mail as PDF, screenshot or photo · saved in Documents</span>
      <div class="kb-row" data-kb-own>${_kbOwnHTML(tid)}</div>
    </div></div>
    <div class="kb-step"><span class="kb-n">2</span><div class="kb-b">
      <b class="kb-t">Letter</b><span class="kb-s" data-kb-letter>${fixed
        ? ctWord + ' (befristet) → <b>Vorzeitiges Ende des Mietvertrags</b> · the tenant asks to leave early — you agree'
        : q ? ctWord + ' → <b>Bestätigung der Kündigung</b> · ' + _kbQuarterRule(rec, st)
        : ctWord + ' (unbefristet) → <b>Bestätigung der Kündigung</b> · 3 months to the month end'}</span>
      <div class="kb-grid">
        ${fixed ? '' : _kbDateField(tid, 'vom', 'Kündigung vom', st.vom)}
        ${_kbDateField(tid, 'eingang', fixed ? 'Schreiben vom' : 'Eingang am', st.eingang)}
        ${fixed ? _kbDateField(tid, 'agreed', 'Befristet bis', st.agreed, st.again && !st.agreed ? 'type the agreed end from the contract — the earlier letter changed the Contract end' : 'the agreed end of the contract') : ''}
        ${_kbDateField(tid, 'end', fixed ? 'Vorzeitig zum' : 'Kündigung zum', st.end, _kbEndSub(rec, st))}
      </div>
      <div class="kb-grid">${ortSel}</div>
      ${_kbRuleHint(st)}
      ${moveHint}
    </div></div>
    <div class="kb-step"><span class="kb-n">3</span><div class="kb-b">
      <b class="kb-t">Create</b>
      <span class="kb-s" data-kb-sum>${_kbSum(st)}</span>
      ${nextHint}
      ${st.done ? `<p class="kb-ok"><i class="ti ti-circle-check" aria-hidden="true"></i> Saved in Documents · Contract end ${_kbDe(st.done.end)}</p>`
        : letter ? `<p class="kb-hint">A letter from ${_kbEsc(fmt(letter))} is in Documents — Create replaces it.</p>` : ''}
    </div></div>
    <div class="kb-act">
      <button type="button" class="kb-btn kb-btn--ghost" data-cc-pdf onclick="kbPdf('${T}',false,this)">Draft PDF</button>
      <button type="button" class="kb-btn kb-btn--go" data-cc-pdf onclick="kbPdf('${T}',true,this)"><i class="ti ti-check" aria-hidden="true"></i> Create</button>
    </div>
  </div>`;
}
const _kbToday = () => (typeof _ccTodayIso === 'function' ? _ccTodayIso() : new Date().toISOString().slice(0, 10));
const _kbSum = st => st.end ? 'Saves the letter in Documents and sets the Contract end to <b>' + _kbDe(st.end) + '</b>.' : 'Saves the letter in Documents and sets the Contract end.';

/* a field changed → keep it; Eingang am moves the suggested end (until you type your own) */
function kbSet(tid, key, value) {
  const rec = _kbRec(tid); if (!rec) return;
  const st = _kbSt(rec);
  if (key === 'ort') {
    if (!KB_ORTE.includes(value)) return;
    st.ort = value; st.ortPicked = true; if (kbA().rememberOrt) { try { localStorage.setItem('kb_ort', value); } catch (e) {} }
    st.done = null;                                         // a letter already created still has the old place → Create again
    const sum = document.querySelector('#ccSheetBody [data-kb-sum]'); if (sum) sum.innerHTML = _kbSum(st);
    return;
  }
  const iso = _kbToIso(value);
  if (key === 'vom') {
    st.vom = iso;
    if (iso && (st.eingangAuto || !st.eingang)) {            // Eingang am follows until you type your own
      st.eingang = iso; st.eingangAuto = true;
      const e = document.querySelector('#ccSheetBody [data-kb="eingang"]'); if (e) e.value = iso;
      key = 'eingang';
    }
  }
  else if (key === 'eingang') { if (iso !== st.eingang) { st.eingang = iso; st.eingangAuto = !iso || iso === st.vom; } }
  else if (key === 'agreed') st.agreed = iso;
  else if (key === 'end') { if (iso !== st.end) { st.end = iso; st.endAuto = !iso; } }
  if (key === 'eingang' && st.v !== 'befristet' && st.endAuto) {
    st.end = kbSuggestEnd(rec, st);
    const e = document.querySelector('#ccSheetBody [data-kb="end"]'); if (e && e !== document.activeElement) e.value = st.end;
  }
  st.done = null;
  const sub = document.querySelector('#ccSheetBody [data-kb-sub="end"]'); if (sub) sub.textContent = _kbEndSub(rec, st);
  const sum = document.querySelector('#ccSheetBody [data-kb-sum]'); if (sum) sum.innerHTML = _kbSum(st);
}
/* the fields as they are on screen right now (a date typed without leaving the field counts too) */
function _kbReadFields(tid) {
  const rec = _kbRec(tid), st = _kbSt(rec);
  document.querySelectorAll('#ccSheetBody [data-kb]').forEach(inp => {
    const iso = _kbToIso(inp.value), k = inp.dataset.kb;
    if (!iso) return;                                        // a field that reads empty right now never wipes a date you set (clearing goes through kbSet)
    if (k === 'vom') st.vom = iso; else if (k === 'eingang') { if (iso !== st.eingang) { st.eingang = iso; st.eingangAuto = false; } } else if (k === 'agreed') st.agreed = iso;
    else if (k === 'end' && iso !== st.end) { st.end = iso; st.endAuto = !iso; }
  });
  return st;
}

/* ── The letter (Casa Castel letter style: the NK letters' frame, nk-letter.js) ── */
function _kbHouse(s) {
  const a = String(s.objekt_adresse || '').trim(), plz = String(s.objekt_plz_ort || '').trim();
  const lines = a ? (plz && !a.includes(plz) ? [a, plz] : a.split(/\s*,\s*/))
    : String(typeof ADDRESS !== 'undefined' ? ADDRESS : '').split(/\s*,\s*/);
  return lines.map(x => x.trim()).filter(Boolean);
}
async function _kbLetterData(rec, st) { return kbA().letterData(rec, st); }
async function _kbLetterDataCasa(rec, st) {
  if (typeof loadSettings === 'function') { try { await loadSettings(); } catch (e) {} }
  const s = (typeof appSettings !== 'undefined' && appSettings) || {};
  const house = _kbHouse(s), fixed = st.v === 'befristet';
  const vorname = String(rec.first_name || '').trim() || _kbName(rec);
  const sender = [s.vermieter_name, ...String(s.vermieter_adresse || '').split(/\s*,\s*|\n/)].map(z => String(z || '').trim()).filter(Boolean);
  const room = String(rec.room || '').trim(), end = '<strong>' + _kbDe(st.end) + '</strong>';
  const where = `das Zimmer ${_kbEsc(room)}, ${_kbEsc(house.join(', '))},`;
  const hand = 'Für Besichtigungen mit möglichen Nachmietern und die Übergabe des Zimmers mit allen Schlüsseln melden wir uns rechtzeitig.';
  const paras = fixed ? [
    `hiermit bestätigen wir den Eingang des Schreibens vom ${_kbDe(st.eingang)}. Der Mietvertrag ist bis zum ${_kbDe(st.agreed)} befristet. Wir sind jedoch einverstanden, dass das Mietverhältnis für ${where} vorzeitig zum ${end} endet.`,
    hand,
  ] : [
    `hiermit bestätigen wir den Eingang der Kündigung vom ${_kbDe(st.vom)}. Das Mietverhältnis für ${where} endet fristgerecht zum ${end}.`,
    hand,
  ];
  return {
    brand: 'Casa Castel', unitLabel: 'Zimmer', unitName: room, footer: house.join(' · '),
    sender, names: [_kbName(rec)], addr: house,
    ort: KB_ORTE.includes(st.ort) ? st.ort : _kbOrt0(rec), date: _kbToday(),
    title: fixed ? 'Vorzeitiges Ende des Mietvertrags – Zimmer ' + room : 'Bestätigung der Kündigung – Zimmer ' + room,
    greeting: 'Hallo ' + vorname + ',', paras, vermieter: String(s.vermieter_name || '').trim(), fixed, tenant: _kbName(rec),
  };
}
const KB_LETTER_CSS = `
    .content { display:flex; flex-direction:column; }
    .kb-sp1 { flex:1 1 0; } .kb-sp2 { flex:4 1 0; }
    .kb-date { font-family:'Lato',sans-serif; font-size:11.5px; color:#4a433c; text-align:right; margin-bottom:26px; }
    .kb-p { font-family:'Lato',sans-serif; font-size:11.5px; font-weight:400; color:#4a433c; line-height:1.7; margin:0 0 12px; }
    .kb-p strong { font-weight:700; color:#2b2520; }
    .kb-hi { margin-top:52px; }
    .kb-sig { margin-top:54px; }
    .kb-sig__k { font-family:'Lato',sans-serif; font-size:11.5px; color:#4a433c; }
    .kb-sig__gap { height:74px; }
    .kb-sig__n { font-family:'Lato',sans-serif; font-size:11.5px; font-weight:700; color:#2b2520; }
  `;
function kbLetterHtml(d) {
  const esc = _kbEsc;
  const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300&display=swap');`;
  const base = typeof NK_LETTER_CSS === 'string' ? NK_LETTER_CSS : '';
  const scoped = (base + KB_LETTER_CSS).replace(/([^{}]+)\{/g, (m, sel) => sel.split(',').map(x => '.kb-letter ' + x.trim()).join(', ') + ' {');
  const hdr = `<div class="hdr"><span class="hdr__wordmark">${esc(d.brand)}</span>${d.unitName ? `<div class="hdr__room"><span class="hdr__room-label">${esc(d.unitLabel)}</span><span class="hdr__room-name">${esc(d.unitName)}</span></div>` : ''}</div>`;
  const ftr = `<div class="ftr"><hr class="ftr__rule"/><div class="ftr__row"><span>${esc(d.footer)}</span><span>Seite <span class="pgn">1</span> von <span class="pgt">1</span></span></div></div>`;
  const place = esc(d.ort + ', ' + _kbDe(d.date));
  return `<div class="kb-letter"><style>${FONTS}</style><style>${scoped}</style>
    <div class="pdf-page page">${hdr}${ftr}<div class="content">
      <div class="addr"><div class="addr__l">
        <div class="addr__ret">${esc((d.sender || []).join(' · '))}</div>
        ${(d.names || []).map(n => `<div class="addr__line">${esc(n)}</div>`).join('')}${(d.addr || []).map(n => `<div class="addr__line">${esc(n)}</div>`).join('')}
      </div></div>
      <div class="kb-sp1"></div>
      <div class="kb-mid">
        <div class="kb-date">${place}</div>
        <div class="doc-title doc-title--s">${esc(d.title)}</div>
        <p class="kb-p kb-hi">${esc(d.greeting)}</p>
        ${d.paras.map(p => `<p class="kb-p">${p}</p>`).join('')}
        <div class="kb-sig"><div class="kb-sig__k">Mit freundlichen Grüßen</div><div class="kb-sig__gap"></div><div class="kb-sig__n">${esc(d.vermieter)}</div></div>
      </div>
      <div class="kb-sp2"></div>
    </div></div></div>`;
}
/* Render → { blob, name } — the same pipeline as the NK letters (pdf-open.js) */
async function kbLetterPdf(d, fileName) {
  let box = document.getElementById('_pdfRenderContainer'); if (box) box.remove();
  box = document.createElement('div');
  box.id = '_pdfRenderContainer';
  box.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#ffffff;z-index:-1;font-size:11.33px;';
  box.innerHTML = kbLetterHtml(d);
  document.body.appendChild(box);
  try {
    try { await document.fonts.ready; } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
    try { if (typeof ccFlowPages === 'function') await ccFlowPages(box); } catch (e) {}
    const pages = box.querySelectorAll('.pdf-page');
    pages.forEach((pg, i) => { const a = pg.querySelector('.pgn'), b = pg.querySelector('.pgt'); if (a) a.textContent = String(i + 1); if (b) b.textContent = String(pages.length); });
    const pdf = await ccRenderPagesToPdf(box, kbA().pdfOpts);   // Rentals: strict, as its contracts · Casa: as before
    return { blob: pdf.output('blob'), name: ccPdfSafeName(fileName) };
  } finally { box.remove(); }
}

/* ── Draft PDF · Create ────────────────────────────────────── */
function _kbCheck(rec, st, save) {
  const fixed = st.v === 'befristet';
  if (!_kbName(rec)) return 'The tenant has no name yet.';
  if (!fixed && !st.vom) return 'Enter "Kündigung vom".';
  if (!st.eingang) return fixed ? 'Enter "Schreiben vom" (the date of the tenant\'s letter).' : 'Enter "Eingang am".';
  if (fixed && !st.agreed) return 'Enter "Befristet bis" (the agreed end).';
  if (!st.end) return fixed ? 'Enter "Vorzeitig zum".' : 'Enter "Kündigung zum".';
  if (rec.mietbeginn && typeof _ccIso === 'function' && st.end < _ccIso(rec.mietbeginn)) return 'The end is before the move-in (' + _kbDe(_ccIso(rec.mietbeginn)) + ').';
  if (fixed && st.agreed && st.end >= st.agreed) return 'The early end must be before the agreed end (' + _kbDe(st.agreed) + ').';
  if (save) {
    const planned = kbA().planned(rec);
    if (planned) return 'A renewal from ' + _kbDe(planned) + ' is planned — remove it first (Documents › Edit › Remove renewal).';
  }
  return null;
}
/* The contract end of the latest contract — the same write as Tenant › Change rent (renewal entry included) */
async function _kbSetEnd(rec, end) {
  const before = rec.vertragsende;
  const cs = typeof _tnContractState === 'function' ? _tnContractState(rec) : null;
  const last = cs && cs.all.length ? cs.all[cs.all.length - 1] : null;
  rec.vertragsende = end;
  const res = await ccQueueWrite('tn-' + rec.id, () => sbL.from('tenant_records').update({ vertragsende: end }).eq('id', rec.id));
  if (res && res.error) { rec.vertragsende = before; throw res.error; }
  // the latest contract's own entry follows (renewal or first contract) — the same helper as every Tenants save
  if (typeof _tnSyncContractEnd === 'function') await _tnSyncContractEnd(rec, end);
  else if (last && last.renewal && typeof ccRpUpdate === 'function') { try { await ccRpUpdate(sbL, last.renewal.id, { contract_end: end }); } catch (e) { console.warn('[kuendigung] renewal end', e); } }
}
const _kbBusy = {};
async function kbPdf(tid, save, btn) {
  const rec = _kbRec(tid); if (!rec) return;
  const st = _kbReadFields(tid);
  const err = _kbCheck(rec, st, save);
  if (err) { alert(err); return; }                          // alert also closes the "Creating PDF…" tab (pdf-open.js)
  if (_kbBusy[tid]) return;
  const old = save ? _kbDocOf(tid, 'kuendigungsbestaetigung', 'unsigned') : null;
  if (old && typeof ccConfirm === 'function' && !(await ccConfirm('Replace the letter?', 'The Kündigungsbestätigung from ' + (typeof ccfFmtShort === 'function' ? ccfFmtShort(old.uploaded_at) : '') + ' in Documents is replaced by this one.', 'Replace'))) {
    if (typeof _ccCloseWaitingTab === 'function') _ccCloseWaitingTab();
    return;
  }
  _kbBusy[tid] = true;
  let saved = false;
  const label = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" aria-hidden="true"></i> Creating PDF'; }
  try {
    const d = await _kbLetterData(rec, st);
    const out = await kbLetterPdf(d, ccPdfFileName('Kuendigungsbestaetigung', kbA().fileUnit(rec), _kbName(rec)));
    if (save) {
      await ccfSaveDoc({ tid: rec.id, room: typeof ccfA === 'function' ? ccfA().prefix(rec) : rec.room, type: 'kuendigungsbestaetigung', variant: 'unsigned', blob: out.blob });
      saved = true;
      await kbA().setEnd(rec, st.end);
      st.done = { end: st.end };
    }
    if (btn) { btn.disabled = false; btn.innerHTML = label; }
    await ccOpenPdf(out.blob, out.name);                    // installed app: this button becomes "Open PDF"
    if (save) {
      const ok = document.querySelector('#ccSheetBody [data-kb-sum]');
      if (ok) ok.innerHTML = '<span class="kb-ok"><i class="ti ti-circle-check" aria-hidden="true"></i> Saved in Documents · Contract end ' + _kbDe(st.end) + '</span>';
      if (typeof ccSavedToast === 'function') ccSavedToast('Saved in Documents ✓');
      setTimeout(() => kbA().redraw(), 0);                     // card: Contract end + the More row
    }
  } catch (e) {
    console.error('[kuendigung]', e);
    if (typeof ccCancelPdf === 'function') ccCancelPdf();   // the "Creating PDF…" tab closes → you see the message in the app
    if (btn) { btn.disabled = false; btn.innerHTML = label; }
    const why = (e && e.message) || 'connection problem';
    const msg = saved ? 'Letter saved in Documents, but the Contract end was not set (' + why + '). Tap Create again.'
      : save ? 'Not saved — ' + why + '. Please try again.' : 'The PDF could not be created — ' + why + '.';
    const sum = document.querySelector('#ccSheetBody [data-kb-sum]'); if (sum && save) sum.innerHTML = '<span class="kb-err">' + _kbEsc(msg) + '</span>';
    if (typeof ccToast === 'function') ccToast(msg, true);
    if (saved) setTimeout(() => kbA().redraw(), 0);
  } finally { delete _kbBusy[tid]; }
}

/* ── Rentals (Nov 2026 · #26) ──────────────────────────────── */
const _kbRntUnit = rec => (typeof CCF_RENTALS !== 'undefined' && rec ? CCF_RENTALS.unit(CCF_RENTALS.unitOf(rec)) : null);
const _kbWhg = v => { const s = String(v || '').trim(); return !s ? '' : /^\d/.test(s) ? 'Whg. ' + s : s; };   // as stWhg (settlements-ui.js)
/* the unit as the card names it: two flats can share a name (Kaiserstr. 36) — the Wohnungsnummer tells them apart */
function _kbRntUnitLabel(rec) {
  const u = _kbRntUnit(rec); if (!u) return '';
  if (rec.parking_id) return [u.name, u.parking_type].map(x => String(x || '').trim()).filter(Boolean).join(' · ');
  const w = String(u.wohnungsnummer || '').trim();
  return [String(u.name || '').trim(), /^\d/.test(w) ? 'WHG ' + w : w].filter(Boolean).join(' · ');
}
/* the letter: Parkplatz · Gewerbe · Kurzzeit or a Mietvertrag whose contract has an end (§ 575, set by Approve) → befristet · else
   unbefristet. A Contract end typed on the card (or set by an earlier letter 3) never switches it: that entry stays empty. */
function _kbRntVersion(rec) {
  if (!rec) return 'unbefristet';
  if (rec.parking_id) return 'parkplatz';
  const u = _kbRntUnit(rec);
  if (u && u.zimmer_type === 'Gewerbefläche') return 'gewerbe';
  if ((typeof rntContractType === 'function' ? rntContractType(rec) : rec.contract_type) === 'kurzzeit') return 'befristet';
  const ent = _rntContractEntry(rec);                       // the running contract's entry (rentals-tab-tenants.js, n35)
  return ent && _kbIsoOf(ent.contract_end) ? 'befristet' : 'unbefristet';
}
/* the property's place: Mainz → Rheinland-Pfalz · Wiesbaden (Kostheim, Kastel, Amöneburg too) → Hessen */
function _kbRntPlace(rec) { const u = _kbRntUnit(rec) || {}; return (typeof ccPlaceOf === 'function' ? ccPlaceOf(u.plz_ort) : '') || String(u.unterschrift_ort || '').trim(); }
function _kbRntLand(rec) { return /^mainz$/i.test(_kbRntPlace(rec)) ? 'RP' : 'HE'; }
function _kbRntOrt(rec) {
  const u = _kbRntUnit(rec) || {}, own = String(u.unterschrift_ort || '').trim();
  if (KB_ORTE.includes(own)) return own;
  const place = typeof ccPlaceOf === 'function' ? ccPlaceOf(u.plz_ort) : '';
  return KB_ORTE.includes(place) ? place : 'Wiesbaden';
}
/* parking: the contract runs at least 1 year from its Mietbeginn (the Contract start, else the Move-in) */
const _kbPkStart = rec => _kbIsoOf(rec.vertragsbeginn) || _kbIsoOf(rec.mietbeginn);
const _kbPkMin = rec => kbYearMinEnd(_kbPkStart(rec));
/* the rule in the "Letter" line: Gewerbe · Stellplatz (with the end of its 1st year while that is still ahead) */
function _kbQuarterRule(rec, st) {
  if (st.v === 'gewerbe') return KB_GW_MONTHS + ' months to the quarter end';
  const min = _kbPkMin(rec);
  if (min && min < _kbToday()) return '3 months to the quarter end';   // the 1st year is over
  return '3 months to the quarter end, not before ' + (min ? _kbDe(min) + ' (1 year from ' + _kbDe(_kbPkStart(rec)) + ')' : 'the end of the 1st year');
}
/* the quiet line under the dates: Casa's Verzicht line (Rentals contracts have none — no extra line there) */
function _kbRuleHint(st) {
  return kbA().app === 'casa' && st.v !== 'befristet' ? '<p class="kb-hint">A Kündigungsverzicht in the contract? Then check the date.</p>' : '';
}
/* letters 2 (flat) · 3 · 4 · 5 — KUENDIGUNG-TEXTE.md · 1–3 tenants */
async function _kbLetterDataRnt(rec, st) {
  if (typeof loadSettings === 'function') { try { await loadSettings(); } catch (e) {} }
  const s = (typeof appSettings !== 'undefined' && appSettings) || {}, u = _kbRntUnit(rec) || {}, E = _kbEsc;
  const pk = st.v === 'parkplatz', gw = st.v === 'gewerbe', fixed = st.v === 'befristet';
  const street = [String(u.adresse || '').trim(), pk ? '' : _kbWhg(u.wohnungsnummer)].filter(Boolean).join(', ');
  const plz = String(u.plz_ort || '').trim(), full = [street, plz].filter(Boolean).join(', ');
  const people = [[rec.first_name, rec.last_name], [rec.first_name_2, rec.last_name_2], [rec.first_name_3, rec.last_name_3]]
    .map(([f, l]) => ({ first: String(f || '').trim(), full: [f, l].map(x => String(x || '').trim()).filter(Boolean).join(' ') })).filter(p => p.full);
  const firsts = people.map(p => p.first || p.full);
  const and = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1];
  const sender = [s.vermieter_name, ...String(s.vermieter_adresse || '').split(/\s*,\s*|\n/)].map(z => String(z || '').trim()).filter(Boolean);
  const end = '<strong>' + _kbDe(st.end) + '</strong>';
  const at = full ? ', ' + E(full) + ',' : '';                // "für die Wohnung, {Adresse}, endet …" — no stray commas without an address
  const obj = pk ? `den Stellplatz ${E(u.name || '')}${at}` : (gw ? 'die Gewerbefläche' : 'die Wohnung') + at;
  const hand = pk ? 'Für die Rückgabe aller Schlüssel bzw. Sender melden wir uns rechtzeitig.'
    : gw ? 'Für die Übergabe der Fläche mit allen Schlüsseln melden wir uns rechtzeitig.'
    : 'Für Besichtigungen mit möglichen Nachmietern und die Übergabe der Wohnung mit allen Schlüsseln melden wir uns rechtzeitig.';
  const paras = fixed ? [
    `hiermit bestätigen wir den Eingang des Schreibens vom ${_kbDe(st.eingang)}. Der Mietvertrag ist bis zum ${_kbDe(st.agreed)} befristet. Wir sind jedoch einverstanden, dass das Mietverhältnis für ${obj} vorzeitig zum ${end} endet.`, hand,
  ] : [
    `hiermit bestätigen wir den Eingang der Kündigung vom ${_kbDe(st.vom)}. Das Mietverhältnis für ${obj} endet fristgerecht zum ${end}.`, hand,
  ];
  const short = pk ? 'Stellplatz ' + (u.name || '') : gw ? 'Gewerbefläche ' + (street || u.name || '') : (street || u.name || '');
  const own = String(rec.address || '').trim();
  return {
    brand: u.name || '', unitLabel: pk ? 'Stellplatz' : gw ? 'Gewerbefläche' : 'Wohnung',
    unitName: pk ? (t => t === 'Stellplatz' ? 'Außenstellplatz' : t)(String(u.parking_type || '').trim()) : String(u.wohnungsnummer || '').trim(),   // as the parking contract: no "STELLPLATZ / Stellplatz"
    footer: [u.adresse, u.plz_ort].map(x => String(x || '').trim()).filter(Boolean).join(' · '),
    sender, names: people.map(p => p.full),
    addr: pk ? own.replace(/,\s*(\d{5})/, '\n$1').split('\n').map(x => x.trim()).filter(Boolean) : [street, plz].filter(Boolean),
    ort: KB_ORTE.includes(st.ort) ? st.ort : _kbOrt0(rec), date: _kbToday(),
    title: (fixed ? 'Vorzeitiges Ende des Mietvertrags – ' : 'Bestätigung der Kündigung – ') + short,
    greeting: 'Hallo ' + and(firsts) + ',', paras, vermieter: String(s.vermieter_name || '').trim(), fixed, tenant: _kbName(rec),
  };
}
/* Contract end on the card (the same queue as Tenant › Edit) · a failed write goes back and throws, so the sheet says
   "Letter saved in Documents, but the Contract end was not set … Tap Create again". Then the running contract's rent
   entry follows, as every card save does (n35): only an entry that is fixed-term already (an end from Approve, or
   Kurzzeit) gets the date — an open-ended Mietvertrag entry stays empty, so the letter stays the same next time.
   If that entry can't be written, the card's Contract end goes back too (screen and tenant row) and the sheet says
   "… Tap Create again" — no "previous values are back" toast next to "Saved". */
async function _kbSetEndRnt(rec, end) {
  const before = rec.vertragsende;
  rec.vertragsende = end;
  const res = await ccQueueWrite('rnt-' + rec.id, () => sbL.from('rnt_tenant_records').update({ vertragsende: end }).eq('id', rec.id));
  if (res && res.error) { rec.vertragsende = before; throw res.error; }
  if (typeof _rntSyncContractEnd !== 'function') return;
  try { await _rntSyncContractEnd(rec, end, { quiet: true }); }
  catch (e) {
    rec.vertragsende = before;
    const back = await ccQueueWrite('rnt-' + rec.id, () => sbL.from('rnt_tenant_records').update({ vertragsende: before ?? null }).eq('id', rec.id));
    if (back && back.error) rec.vertragsende = end;          // the tenant row kept the new end → the card shows what is saved
    throw e;
  }
}

/* ── Look of the sheet ─────────────────────────────────────── */
(function () {
  if (typeof document === 'undefined' || document.getElementById('kb-styles')) return;
  const st = document.createElement('style'); st.id = 'kb-styles';
  st.textContent = `
.kb { display:flex; flex-direction:column; gap:4px; padding:4px 16px 18px; }
.kb-step { display:flex; gap:12px; padding:14px 0; border-bottom:var(--cc-border, .5px solid #E3DCD1); }
.kb-step:last-child { border-bottom:none; }
.kb-n { flex:0 0 24px; height:24px; border-radius:12px; background:#F2E9DA; color:#7A5A22; font-size:12px; font-weight:600; display:flex; align-items:center; justify-content:center; }
.kb-b { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:8px; }
.kb-t { font-size:15px; font-weight:600; color:var(--cc-ink, #2B2520); }
.kb-s { font-size:12.5px; color:#7A6F62; line-height:1.45; }
.kb-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.kb-doc { display:inline-flex; align-items:center; gap:6px; min-height:40px; padding:0 12px; border:.5px solid var(--cc-rule, #E3DCD1); border-radius:var(--cc-r-md, 10px); background:#fff; font:inherit; font-size:13px; color:var(--cc-ink, #2B2520); cursor:pointer; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.kb-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:40px; padding:0 14px; border:.5px solid var(--cc-charcoal, #3D3027); border-radius:var(--cc-r-md, 10px); background:#fff; font:inherit; font-size:13px; font-weight:500; color:var(--cc-ink, #2B2520); cursor:pointer; }
.kb-btn--s { min-height:36px; padding:0 12px; border-color:var(--cc-stone, #C8BFB0); font-weight:400; }
.kb-btn--ghost { border-color:var(--cc-stone, #C8BFB0); font-weight:400; }
.kb-btn--go { background:var(--cc-ink, #2B2520); color:#fff; border-color:var(--cc-ink, #2B2520); flex:1 1 auto; }
.kb-btn:disabled { opacity:.6; }
.kb-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:10px 12px; }
.kb-f { display:flex; flex-direction:column; gap:5px; min-width:0; }
.kb-l { font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--cc-charcoal, #3D3027); }
.kb-in { width:100%; box-sizing:border-box; min-height:44px; padding:0 12px; border:.5px solid var(--cc-rule, #E3DCD1); border-radius:var(--cc-r-md, 10px); background:var(--cc-bg, #FAF8F5); font:inherit; font-size:16px; color:var(--cc-ink, #2B2520); }
.kb-f .kb-s { font-size:11.5px; }
.kb-hint { margin:0; font-size:12.5px; line-height:1.5; color:#7A6F62; }
.kb-hint--warn { color:#8A4B12; background:#FBEFE2; border-radius:10px; padding:8px 10px; }
.kb-act { display:flex; gap:8px; flex-wrap:wrap; padding:2px 0 0 36px; }
.kb-act > div { flex-basis:100%; }
.kb-ok { margin:0; font-size:13px; color:#11691A; display:inline-flex; align-items:center; gap:6px; }
.kb-err { color:#A32D2D; }
@media (max-width:360px) { .kb-grid { grid-template-columns:minmax(0,1fr); } }
`;
  document.head.appendChild(st);
})();
