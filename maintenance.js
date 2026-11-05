/* ─────────────────────────────────────────────────────────────
   MAINTENANCE — APP
   maintenance.js

   Seventh management app (login tile + profile menus of all apps).
   Tabs: Renovierungen · Schäden. Each tab lists its cases grouped
   by property (Controlling's order) and inside by year of the start
   date, newest first; a property without cases is not shown. A year
   is open when it is this year or still has a case that is not done.
   Each case: Start + optional End (D2).

   D4 · An entry opens IN PLACE inside its property card (like the Tenants
   cards) — no pop-up. One entry open at a time; a tap on its title closes it.
   Open entry = title · one summary line (area · start – end · status) with a
   small "Edit" → the details form in that spot; then receipts first (Kosten,
   "+ Add receipt", the table newest first), documents last. "+ New" opens an
   empty entry on top of the list. After Save it stays open (read view).

   Data:       maint_cases · maint_docs · bucket maintenance-docs
               (MAINTENANCE.sql)
   Properties: read only, from Controlling's list (`ctrl_properties`) — the same
               ids as Controlling, so costs land on exactly that property there
   Rules:      Kosten = the Costs table (receipts − returns; year by each line's date)
               · one status field: open / in_progress / done
                 ("Planned" in Renovierungen, "Open" in Schäden)
               · the property name is saved with the case, so the case
                 keeps it if the property is removed later
               · Save shows at once and retries once by itself; a toast
                 only when it really failed (the form comes back)

   Costs (per case, in the panel, D1): one row = one receipt / invoice
               No. · Description · Brand / Provider · Amount · Date · Photos
               (D28: the receipt / order no. only inside the receipt, not in the row)
               grouped Self-bought / Provider · tap a row = edit it in place
               · D2: a return is its own row (return_of = its receipt), shown
                 under the receipt, own slip no. / date / photo; Net per receipt
               · D2: receipt / slip no. already used elsewhere → asks first
               · D3: every receipt / return is booked in Controlling One-off by a
                 database rule (MAINTENANCE-D3.sql) — switch off per entry or per
                 receipt ("Controlling: Not booked"); returns follow their receipt.
                 Controlling opens an entry here with maintenance.html#cost=<id>
               · D5: Schadensbericht (Schäden) — report fields in Details,
                 Documents › "Schadensbericht" → short form (Zimmer, Mieter,
                 Versicherung per property, photos in / out + Beschreibung) →
                 PDF in the app's document style (maint-schaden-pdf.js, pdf-open.js,
                 cc-ueberg-photos.js) → saved in Documents, opened in the viewer
               · D6: slim, descriptive report for the Hausverwaltung (MAINTENANCE-D6.sql):
                 Details = Schadensart · Festgestellt am · Besichtigung · Ursache ·
                 Sofortmaßnahmen · Bitte an die HV · (Polizei-Az) · Description =
                 Schadensbild; form = Zimmer · Mieter · Ort · Dringend · Fotos
               · D7: Anlagen fill themselves — photos + everything in Documents; "Document"
                 also takes videos (≤ 50 MB, with their length) and e-mails (PDF / screenshot)
               · the row's photos / PDFs are documents linked to the row (cost_id)
               · D8: before a receipt / return is booked, Controlling is checked for a line
                 you typed by hand (same property + amount, ±7 days) → "Link to it" (that
                 line becomes the receipt's line: no double cost; it comes back as you typed
                 it when the receipt is deleted or not booked) · "Book separately" (asked once)
                 · "Don't book". Self-bought "Shop" = the Geschäft in Controlling.
               · D26: "Copy prompt" next to "+ Add receipt" copies the receipt → SQL prompt
                 for Claude with this case's id in it (same checks as Save; no pop-up)
               · D27: “No.” = your own number per receipt / return (own_no, warns when used
                 twice); “Receipt no.” → “Receipt / order no.”. Every PDF of the receipt
                 shows “Nr. <No.>” in bold on top of page 1 (page shrinks a little, same size,
                 A4 stays A4); the untouched original stays in storage (maint_docs.orig_path,
                 stamp_no = the No. on the copy) — MAINTENANCE-D27.sql
               · D29: the No. is automatic (no typing, no duplicates) — see mtNumbers():
                 R/S + running no. per property and start year, receipts .1 .2 … by date,
                 returns .1 under their receipt. Label on PDFs "R1.2 · 2026 · <Objekt>"; the
                 number on a receipt PDF is written again when it moved (on open / save).
                 "Invoices" (case + strip): only the invoice files, in the list's order.
               · D32: a receipt's PDF (and every page of "Invoices") is one A4 invoice page:
                 the beige band (Objekt · NR. · BELEG-/BESTELL-NR. · DATUM), the invoice
                 trimmed and fitted into one box, footer address · page x / y — same for an
                 uploaded PDF, a photo, a scan or a locked PDF (maint-cost-pdf.js). Receipt
                 photos are kept as they are (the original); stamp_no = what the band says
                 ("A4 …"), so every older copy is made again from its original when opened.
   Documents (per case, in the panel):
               Photos  = camera or library, several at once, saved as photos
                         (shrunk to 2000 px + a small preview in /thumbs/)
               Upload  = one file + its Type (Angebot, Schadenbericht, Photo, Other;
                         invoices / receipts belong in Costs)
               Edit    = × deletes a file, tapping a file fixes Type / Betrag / date
               Files are private (bucket maintenance-docs, one folder per case);
               a tap opens them with a short-lived link.
   Look (L1):  property cards with a 1px edge + soft shadow, 20px apart · year bar light
               beige · every entry (also when open) has a thin status line on the left in
               its pill's colour: yellow open / planned · orange in progress · green done
   ───────────────────────────────────────────────────────────── */

'use strict';

const MT = {
  tab: (() => {
    try { const t = localStorage.getItem('mt_last_tab'); return ['renovierung', 'schaden', 'sonstiges'].includes(t) ? t : 'renovierung'; }
    catch (e) { return 'renovierung'; }
  })(),
  props: [],        // properties: id, name, sort_order
  cases: [],        // maint_cases rows
  docs:  [],        // maint_docs rows (no file contents) · cost_id = file of a cost row
  costs: [],        // maint_costs rows: one per receipt / invoice
  loaded: false,
  loadError: null,
  open: {},         // unfolded "Done" groups: { 'schaden|p:4': true }
  sel: null,        // panel: { id, isNew, edit, draft, snap, docEdit, add, fix, cost }
  busy: false,      // a save / delete is running
  up: null,         // upload running: { caseId, total, done, where: 'docs' | 'costs' }
  links: {},        // file path → { url, exp } (short-lived private links)
  d5: false,        // MAINTENANCE-D5.sql has been run (Schadensbericht fields)
  d6: false,        // MAINTENANCE-D6.sql has been run (slim report: Besichtigung, Bitte an HV, Ort …)
  d7: false,        // MAINTENANCE-D7.sql has been run (Video + E-Mail documents)
  sbData: null,     // Schadensbericht: rooms, tenants, apartments, Hausverwaltung (loaded when needed)
  rooms: [],        // D9: Casa Castel room names (Details › Zimmer)
  sumYear: {},      // D12: year chosen in the summary per tab (default: this year)
  pdfBusy: false,   // D12: an overview PDF is being made
  sb: null,         // D16/D17: the Bericht pop-up { caseId, view: 'form' | 'ready', room, mieter, signDate, … }
  d17: false,       // MAINTENANCE-D17.sql has been run (Renovierungsbericht, Besichtigung date/time, points/text)
  d16: false,       // MAINTENANCE-D16.sql has been run (own Schadensbild field)
  d30: false,       // MAINTENANCE-D30.sql has been run (Sonstiges: Art · Ort · Uhrzeit · Teilnehmer)
  costHold: null,   // D39: the receipt form that "Save + next" is storing (its pop-up waits, "Saving …")
  lost: {},         // D39: receipt id → photos / PDFs whose upload failed (they come back when the receipt opens)
  bg: 0,            // D39: > 0 while a save / upload redraws in the background (an open pop-up keeps its form)
  d39: false,       // D39: MAINTENANCE-D39.sql has been run ("Who pays?" per receipt: pay_type …)
  who: null,        // D39: the open "Who pays?" sheet (mtWhoOpen / mtWhoNest)
  whoCats: null,    // D39: Casa cost types (ctrl_castel_categories) · null = could not be loaded
  whoTen: null,     // D39: tenant_records (room, status, mietbeginn, mietende) · null = could not be loaded
  whoLock: null,    // D39: locked Settlements years [{ year, from, to, ids }] · null = could not be loaded
};
/* D12 · the year of the summary (and of its PDF): your choice, else this year */
function mtSumYear() {                                     // D22: one year for both tabs · D37: also the list
  const v = MT.sumYear.all;
  return v && mtListYears().includes(v) ? v : mtYear();
}
/* D37 · the years you can go to: years with receipts or entries, and this year */
function mtListYears() {
  const ys = mtCostYears().concat(MT.cases.map(c => mtCaseYear(c)).filter(y => /^\d{4}$/.test(y)));
  return [...new Set(ys)].sort().reverse();
}
/* D37 · is an entry shown in year Y? its own year · still open from an earlier year (in this year) · the open entry
   D39 · also when it has receipts dated in Y — the same rule as the bar and the year PDF, so bar = Σ cards = Σ rows */
function mtInYear(c, Y) {
  const cy = mtCaseYear(c);
  if (cy === Y) return true;
  if (mtHasCosts([String(c.id)], Y)) return true;
  if (Y === mtYear() && c.status !== 'done' && cy < Y) return true;
  return !!(MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(c.id));
}
/* D37 · ‹ › and swipe: older / newer year (an open entry closes first — asks if something is not saved) */
async function mtYearGo(v) {
  const ys = mtListYears(), cur = mtSumYear();
  const to = v === 'prev' ? ys[ys.indexOf(cur) + 1] : v === 'next' ? ys[ys.indexOf(cur) - 1] : v;
  if (!to || to === cur || !ys.includes(to)) return;
  if (MT.sel && !(await mtClose())) { mtRender(); return; }
  MT.sumYear.all = to;
  mtRender();
  mtPageTo(0);
}
function mtCostYears() {
  const ys = MT.costs.map(r => String(r.cost_date || '').slice(0, 4)).filter(y => /^\d{4}$/.test(y));
  return [...new Set(ys.concat([mtYear()]))].sort().reverse();
}
const mtHasCosts = (ids, year) => MT.costs.some(r => ids.includes(String(r.case_id)) && (!year || String(r.cost_date || '').slice(0, 4) === String(year)));
/* D29 · any invoice file among these cases' receipts (of that year) → the Invoices button is on */
const mtHasInvoiceFiles = (ids, year) => MT.costs.some(r => ids.includes(String(r.case_id)) && (!year || String(r.cost_date || '').slice(0, 4) === String(year))
  && MT.docs.some(d => String(d.cost_id) === String(r.id)));
const mtInvChip = on => `<span class="mt-pdfw"><button type="button" class="mt-pdf${on ? '' : ' off'}" data-mt="invYear" data-cc-pdf="1" data-label="INVOICES" aria-label="Invoices PDF"${on ? '' : ' aria-disabled="true"'}><i class="ti ti-files" aria-hidden="true"></i>INVOICES</button></span>`;
const mtPdfChip = (a, id, on) => `<span class="mt-pdfw"><button type="button" class="mt-pdf${on ? '' : ' off'}" data-mt="${a}"${id ? ` data-id="${mtEsc(id)}"` : ''} data-cc-pdf="1" aria-label="PDF overview"${on ? '' : ' aria-disabled="true"'}><i class="ti ti-file-text" aria-hidden="true"></i>PDF</button></span>`;

const MT_KIND = {
  renovierung: { title: 'Renovierungen', one: 'Renovierung', empty: 'No Renovierungen yet.', open: 'Planned', openCount: 'planned' },
  schaden:     { title: 'Schäden',       one: 'Schaden',     empty: 'No Schäden yet.',       open: 'Open',    openCount: 'open' },
  sonstiges:   { title: 'Sonstiges',     one: 'Sonstiges',   empty: 'No entries yet.',       open: 'Planned', openCount: 'planned', add: 'entry' },   // D30: Hausversammlung, Mieterfest …
};
const MT_NO_LETTER = { renovierung: 'R', schaden: 'S', sonstiges: 'A' };   // D30: the case number's letter (A = Allgemein)
const MT_DOC = {
  rechnung:       { label: 'Rechnung',       icon: 'ti-file-invoice' },
  angebot:        { label: 'Angebot',        icon: 'ti-file-text' },
  schadenbericht: { label: 'Schadensbericht', icon: 'ti-file-description' },
  renovierungsbericht: { label: 'Renovierungsbericht', icon: 'ti-file-description' },
  bericht:        { label: 'Bericht',        icon: 'ti-file-description' },   // D30: Sonstiges (Protokoll / Bericht)
  photo:          { label: 'Photo',          icon: 'ti-photo' },
  email:          { label: 'E-Mail',         icon: 'ti-mail' },
  video:          { label: 'Video',          icon: 'ti-movie' },
  other:          { label: 'Other',          icon: 'ti-file' },
  receipt:        { label: 'Receipt',        icon: 'ti-receipt' },      // file of a cost row
};
const MT_COST = {
  self:     { label: 'Self-bought', who: 'Shop' },
  provider: { label: 'Provider',    who: 'Provider' },
};
const MT_DOC_ORDER = ['schadenbericht', 'angebot', 'rechnung', 'email', 'other', 'video', 'photo'];
const MT_MAX_VIDEO_MB = 50;                    // a phone video of ~30 s
/* Schadensbericht (D5) — MT_SB_ARTEN comes from maint-schaden-pdf.js */
const MT_DOC_DE  = { rechnung: 'Rechnung', angebot: 'Angebot', schadenbericht: 'Schadensbericht / Gutachten', email: 'E-Mail', video: 'Video', other: 'Dokument', bericht: 'Bericht / Protokoll' };
const MT_CASA_ID = 7;                          // Casa Castel in Controlling (CASA_PROP_ID)
const MT_SB_ALL  = '__gemeinschaft__';         // Casa Castel: Gemeinschaftsfläche instead of a Zimmer
const MT_BUCKET = 'maintenance-docs';
const MT_MAX_MB = 30;

/* ── Small helpers ────────────────────────────────────────── */
const mtEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mtEur = n => ccFmtEUR(Math.round((Number(n) || 0) * 100) / 100);
const mtDate = iso => (iso ? ccFmtDate(iso) : '');
const mtYear = () => ccTodayISO().slice(0, 4);
const mtStatusLabel = (kind, s) => (s === 'done' ? 'Done' : s === 'in_progress' ? 'In progress' : (MT_KIND[kind] || MT_KIND.schaden).open);
const mtPillCls = s => (s === 'done' ? 'mt-pill--done' : s === 'in_progress' ? 'mt-pill--prog' : 'mt-pill--open');
const mtPill = (kind, s) => `<span class="mt-pill ${mtPillCls(s)}">${mtStatusLabel(kind, s)}</span>`;
/* L1 · the thin status line on the left of an entry — the pill's colour (yellow / orange / green) */
const mtStCls = s => (s === 'done' ? 'mt-st--done' : s === 'in_progress' ? 'mt-st--prog' : 'mt-st--open');
const mtCase = id => MT.cases.find(c => String(c.id) === String(id)) || null;
const mtProp = id => (id === null || id === undefined || id === '' ? null : MT.props.find(p => String(p.id) === String(id)) || null);
const mtPropName = c => { const p = mtProp(c.property_id); return p ? p.name : (c.property_name || 'Unknown property'); };
function mtSay(msg) { if (typeof ctlToast === 'function') ctlToast(msg); }
function mtUuid() {
  if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const mtNativeVal = el => (el ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get.call(el) : '');
const mtFine = () => window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* Kosten: the Costs table of these cases — receipts minus returns, optionally one year
   (each line counts in the year of its own date, the same as in Controlling) */
const mtSign = r => (r.return_of ? -1 : 1);
function mtCost(caseIds, year, kind) {
  const ids = new Set(caseIds.map(String));
  const sum = MT.costs.reduce((a, r) => {
    if (!ids.has(String(r.case_id)) || (kind && r.kind !== kind)) return a;
    if (year && String(r.cost_date || '').slice(0, 4) !== year) return a;
    return a + mtSign(r) * (Number(r.amount) || 0);
  }, 0);
  return Math.round(sum * 100) / 100;
}
const mtAmt = n => (n ? mtEur(n) : '—');

/* A save/delete: one automatic retry (a connection hiccup is not an error) */
async function mtTry(fn) {
  const run = async () => { try { return (await fn()) || {}; } catch (e) { return { error: e }; } };
  let r = await run();
  if (r.error) { await new Promise(res => setTimeout(res, 400)); r = await run(); }
  return r;
}

/* ── Data ─────────────────────────────────────────────────── */
async function mtLoad() {
  const sb = _ctlSupa;
  const once = () => Promise.all([
    sb.from('ctrl_properties').select('*'),
    sb.from('maint_cases').select('*'),
    sb.from('maint_docs').select('*'),
    sb.from('maint_costs').select('*'),
  ]);
  let res = await once();
  if (res.some(r => r.error)) {
    await new Promise(r => setTimeout(r, 400));
    res = await once();
  }
  const bad = res.find(r => r.error);
  if (bad) throw bad.error;
  [MT.props, MT.cases, MT.docs, MT.costs] = res.map(r => r.data || []);
  MT.props.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || (Number(a.id) || 0) - (Number(b.id) || 0));
  MT.loaded = true;
  // D5: Schadensbericht fields there? (MAINTENANCE-D5.sql) → Versicherung per property
  try { MT.d5 = !(await sb.from('maint_cases').select('schadensart').limit(1)).error; }
  catch (e) { MT.d5 = false; }
  try { MT.d6 = MT.d5 && !(await sb.from('maint_cases').select('besichtigung').limit(1)).error; }
  catch (e) { MT.d6 = false; }
  try { MT.d7 = !(await sb.from('maint_docs').select('media_seconds').limit(1)).error; }
  catch (e) { MT.d7 = false; }
  try { MT.d16 = !(await sb.from('maint_cases').select('schadensbild').limit(1)).error; }
  catch (e) { MT.d16 = false; }
  try { MT.d17 = !(await sb.from('maint_cases').select('rb_anlass').limit(1)).error; }
  catch (e) { MT.d17 = false; }
  try { MT.d30 = !(await sb.from('maint_cases').select('so_art').limit(1)).error; }      // D30: Sonstiges › Bericht
  catch (e) { MT.d30 = false; }
  try { MT.d39 = !(await sb.from('maint_costs').select('pay_type').limit(1)).error; }    // D39: Who pays? (MAINTENANCE-D39.sql)
  catch (e) { MT.d39 = false; }
  if (MT.d39) await mtWhoLoad();                             // cost types, tenants, locked years — each may fail (then less is shown)
  try {                                                   // D9: Casa Castel rooms for Details › Zimmer
    const rr = await sb.from('rooms').select('*');
    MT.rooms = rr.error ? [] : (rr.data || []).filter(r => r.active !== false)
      .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)).map(r => r.name).filter(Boolean);
  } catch (e) { MT.rooms = []; }
}

/* D9 · Casa Castel: the Zimmer is set once in the details (report_room) — the report and the
   Mieter auto-fill read it. "Zimmer Oslo" in an old Area → Oslo is suggested. */
const mtRoomGuess = area => MT.rooms.find(r => mtNorm(area).includes(mtNorm(r))) || '';
const mtRoomLabel = v => (!v ? '' : v === MT_SB_ALL ? 'Gemeinschaftsfläche' : v);
function mtWhere(c) {
  const room = mtIsCasa(c.property_id) ? mtRoomLabel(c.report_room) : '';
  const area = c.area || '';
  if (room && area && mtNorm(area).includes(mtNorm(room))) return area;      // "Zimmer Oslo" says it already
  return [room, area].filter(Boolean).join(' · ');
}

/* ── Tabs ─────────────────────────────────────────────────── */
function mtSwitchTab(kind) {
  if (!MT_KIND[kind]) kind = 'renovierung';
  MT.tab = kind;
  try { localStorage.setItem('mt_last_tab', kind); } catch (e) {}
  document.querySelectorAll('#appTabs .cc-tab').forEach(b => {
    const on = b.dataset.tab === kind;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  Object.keys(MT_KIND).forEach(k => {
    const el = document.getElementById('tab-' + k);
    if (el) el.style.display = k === kind ? '' : 'none';
  });
  mtRender();
}
/* Tapping a tab: an open panel closes (asks first if there are unsaved changes) */
async function mtTabClick(kind) {
  if (kind === MT.tab) return;
  if (MT.sel && !(await mtClose())) return;
  mtSwitchTab(kind);
  mtPageTo(0);
}

/* ── List ─────────────────────────────────────────────────── */
/* Cases of one tab, grouped by property (Properties order; removed properties last) */
function mtGroups(kind) {
  const list = MT.cases.filter(c => c.kind === kind);
  const groups = new Map();
  list.forEach(c => {
    const p = mtProp(c.property_id);
    const key = p ? 'p:' + p.id : 'n:' + (c.property_name || '');
    const so = p && p.sort_order !== null && p.sort_order !== undefined && p.sort_order !== '' ? Number(p.sort_order) : 999;
    if (!groups.has(key)) groups.set(key, { key, name: mtPropName(c), order: p ? so : 1e9, pid: p ? Number(p.id) || 0 : 0, cases: [] });
    groups.get(key).cases.push(c);
  });
  const byDate = (a, b) => String(b.case_date || '').localeCompare(String(a.case_date || '')) ||
                           String(b.created_at || '').localeCompare(String(a.created_at || ''));
  return [...groups.values()]
    .sort((a, b) => a.order - b.order || a.pid - b.pid || a.name.localeCompare(b.name, 'de'))
    .map(g => {
      const years = new Map();
      g.cases.forEach(c => {
        const y = mtCaseYear(c);
        if (!years.has(y)) years.set(y, []);
        years.get(y).push(c);
      });
      return { ...g, years: [...years.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([y, cs]) => ({ y, cases: cs.sort(byDate) })) };
    });
}
/* The year an entry belongs to: its start date (else when it was created) */
const mtCaseYear = c => String(c.case_date || ccDayOf(c.created_at) || '').slice(0, 4) || '—';
/* Start – End as text: "16.01.2026 – 20.03.2026" · "from 16.01.2026" · "" */
function mtSpan(c) {
  const a = mtDate(c.case_date), b = mtDate(c.end_date);
  if (a && b) return a === b ? a : a + ' – ' + b;
  if (a) return 'from ' + a;
  return b ? 'until ' + b : '';
}

function mtRowHTML(c, since) {
  const sub = [mtWhere(c), mtSpan(c), since ? 'since ' + since : ''].filter(Boolean).map(mtEsc).join(' · ');
  const cost = mtCost([c.id], mtSumYear());                 // D39: the year on top, like the card sum and the bar
  const sel = MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(c.id) ? ' is-sel' : '';
  return `<div class="mt-ent ${mtStCls(c.status)}">
      <div class="mt-row${sel}">
        <button type="button" class="mt-row__hit" data-mt="open" data-id="${mtEsc(c.id)}" aria-label="Open ${mtEsc(c.title)}"></button>
        <span class="mt-row__l"><span class="mt-row__t">${mtEsc(c.title)}</span>${sub ? `<span class="mt-row__s">${sub}</span>` : ''}</span>
        <span class="mt-row__r"><span class="mt-row__a${cost ? '' : ' mt-mu'}">${mtAmt(cost)}</span>${mtPill(c.kind, c.status)}</span>
      </div>
    </div>`;
}

function mtRender() {
  const a = mtAnchor();                                      // D36: the list redraw keeps your place
  mtRenderList();
  mtRestore(a);
  mtLockStick();                                             // D39: a new year bar behind a pop-up keeps its place too
}
function mtRenderList() {
  const kind = MT.tab;
  const el = document.getElementById('tab-' + kind);
  if (!el) return;
  mtCostModalSync();
  mtParkPanel();                                             // keep the open entry safe while the list is redrawn
  if (MT.loadError) { el.innerHTML = mtErrorHTML(MT.loadError); return; }
  const list = MT.cases.filter(c => c.kind === kind);
  const newTop = MT.sel && MT.sel.isNew && MT.sel.draft && MT.sel.draft.kind === kind
    ? '<section class="mt-card mt-card--new" aria-label="New entry"><div class="mt-slot"></div></section>' : '';
  const head = `
    <div class="mt-hdr">
      <h1 class="cc-h1">${MT_KIND[kind].title}</h1>
      <button type="button" class="mt-add" data-mt="new"><i class="ti ti-plus" aria-hidden="true"></i><span>Add</span></button>
    </div>`;
  if (!list.length) {
    el.innerHTML = mtBarHTML(0, '') + head + mtMetaHTML(0, 0) + (newTop ? `<div class="mt-list">${newTop}</div>` : `<p class="mt-empty">${MT_KIND[kind].empty}</p>`);
    mtPlacePanel(el);
    return;
  }

  const ids = list.map(c => c.id), yy = mtSumYear();
  const shown = list.filter(c => mtInYear(c, yy));                   // D37: the year on top decides the list
  const nOpen = shown.filter(c => c.status === 'open').length, nProg = shown.filter(c => c.status === 'in_progress').length;
  const counts = [nOpen ? `${nOpen} ${MT_KIND[kind].openCount}` : '', nProg ? `${nProg} in progress` : ''].filter(Boolean).join(' · ') || 'all done';
  const sum = mtMetaHTML(mtCost(ids, yy), mtCost(ids));          // D38: one quiet line (the year's sum is in the bar)

  const cards = mtGroups(kind).map(g => {
    const cs = g.cases.filter(c => mtInYear(c, yy)).sort((a, b) =>
      String(b.case_date || '').localeCompare(String(a.case_date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    if (!cs.length) return '';                                        // D37: nothing in this year → the property is not shown
    const total = mtCost(cs.map(c => c.id), yy);
    const rows = cs.map(c => (MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(c.id)) ? '<div class="mt-slot"></div>'
      : mtRowHTML(c, mtCaseYear(c) < yy && /^\d{4}$/.test(mtCaseYear(c)) ? mtCaseYear(c) : '')).join('');
    return `
      <section class="mt-card" aria-label="${mtEsc(g.name)}">
        <div class="mt-card__hd"><h2 class="mt-card__name">${mtEsc(g.name)}</h2><span class="mt-card__sum${total ? '' : ' mt-mu'}">${mtAmt(total)}</span></div>
        <div class="mt-card__rows">${rows}</div>
      </section>`;
  }).join('');
  const older = mtListYears().filter(v => v < yy && list.some(c => mtCaseYear(c) === v))[0];
  const empty = cards ? '' : `<div class="mt-yempty"><p class="mt-empty">No ${MT_KIND[kind].title} in ${mtEsc(yy)}.</p>
      ${older ? `<button type="button" class="mt-link" data-mt="yrGo" data-v="${older}"><i class="ti ti-chevron-left" aria-hidden="true"></i> ${older}</button>` : ''}</div>`;

  el.innerHTML = mtBarHTML(mtCost(ids, yy), counts) + head + sum + `<div class="mt-list">${newTop}${cards}</div>` + empty;
  mtPlacePanel(el);
}

function mtErrorHTML(e) {
  const msg = String((e && (e.message || e.code)) || e || '');
  const d1 = /maint_costs|cost_id/i.test(msg);
  const missing = d1 || /maint_(cases|docs)/i.test(msg);
  const again = t => `<a href="#" onclick="location.reload();return false;">${t}</a>`;
  return `
    <div class="mt-hdr"><h1 class="cc-h1">${MT_KIND[MT.tab].title}</h1></div>
    <p class="mt-note">${missing
      ? `The Maintenance tables are missing. Run ${d1 ? 'MAINTENANCE-D1.sql' : 'MAINTENANCE.sql'} in Supabase, then ${again('try again')}.`
      : `The data could not be loaded. ${again('Try again')}`}</p>
    <p class="mt-muted">${mtEsc(msg)}</p>`;
}

/* ── Panel ────────────────────────────────────────────────── */
function mtPanelHTML() {
  const s = MT.sel;
  if (!s) return '';
  const c = s.isNew ? null : mtCase(s.id);
  if (!s.isNew && !c) return '';
  const kind = s.isNew ? s.draft.kind : c.kind;
  const title = s.isNew ? 'New ' + (MT_KIND[kind].add || MT_KIND[kind].one) : c.title;
  const head = `
    <div class="mt-oh__h">
      <button type="button" class="mt-oh__t" data-mt="close" aria-label="Close ${mtEsc(title)}" aria-expanded="true"><span id="mtPanelTitle">${mtEsc(title)}</span></button>
      ${!s.isNew && c && !mtBusyIn(c) ? `<button type="button" class="mt-oh__e" data-mt="edit" aria-label="Edit ${mtEsc(title)}"><i class="ti ti-pencil" aria-hidden="true"></i></button>` : ''}
      <button type="button" class="mt-oh__x" data-mt="close" aria-label="Close ${mtEsc(title)}" tabindex="-1"><i class="ti ti-chevron-up" aria-hidden="true"></i></button>
    </div>`;
  if (s.isNew) {
    return head + mtEditHTML(c, s) +
      '<p class="mt-docs-empty mt-after">Receipts, photos and documents can be added after Save.</p>';
  }
  return head + mtSummaryHTML(c) + mtActsHTML(c, true) + mtCostsHTML(c) + mtDocsHTML(c);   // D38: Edit = a pop-up (mtEditModalSync)
}

/* The details at a glance: Schadensart · Zimmer · Area · dates · status (· not in Controlling).
   D9: the description shows 2 lines; "More" opens the full text and every filled Schaden field. */
function mtSummaryHTML(c) {
  const bits = [mtWhere(c), mtSpan(c)].filter(Boolean).map(mtEsc);
  bits.push(mtPill(c.kind, c.status).replace('class="mt-pill ', 'class="mt-pill mt-pill--sm '));
  const desc = c.description || '', more = !!(MT.sel && MT.sel.more);
  return `
    <div class="mt-oh__s">
      <span class="mt-oh__l">${bits.join(' · ')}</span>
    </div>
    ${desc ? `<p class="mt-oh__d${more ? ' is-full' : ''}">${mtEsc(desc)}</p>
      <button type="button" class="mt-link mt-more" data-mt="more" aria-expanded="${more}"${more ? '' : ' data-auto="1" hidden'}>${more ? 'Less' : 'More'}</button>` : ''}`;
}

const MT_DATE_LBL = { renovierung: ['Start', 'End'], schaden: ['Schadenstag', 'Behoben am'], sonstiges: ['Date', 'End'] };
function mtEditHTML(c, s) {
  const d = s.draft || {
    kind: c.kind, title: c.title, property_id: c.property_id, property_name: c.property_name, area: c.area,
    case_date: c.case_date, end_date: c.end_date, status: c.status, description: c.description,
    book_ctrl: c.book_ctrl !== false, report_room: c.report_room,
    schadensart: c.schadensart, festgestellt_am: c.festgestellt_am, ursache: c.ursache,
    massnahmen: c.massnahmen, polizei_az: c.polizei_az, besichtigung: c.besichtigung, bitte_hv: c.bitte_hv,
  };
  const sch = d.kind === 'schaden';
  const pid = d.property_id === null || d.property_id === undefined ? '' : String(d.property_id);
  let props = `<option value=""${pid ? '' : ' selected'}>Choose</option>` +
    MT.props.filter(p => p.active !== false || String(p.id) === pid)
      .map(p => `<option value="${mtEsc(p.id)}"${String(p.id) === pid ? ' selected' : ''}>${mtEsc(p.name)}</option>`).join('');
  if (pid && !mtProp(pid)) props += `<option value="${mtEsc(pid)}" selected>${mtEsc(d.property_name || 'Property')} (removed)</option>`;
  const casa = !!pid && mtIsCasa(pid);
  const room = d.report_room || (casa ? mtRoomGuess(d.area) : '');
  const rooms = MT.rooms.slice(); if (room && room !== MT_SB_ALL && !rooms.includes(room)) rooms.push(room);
  const roomOpts = `<option value=""${room ? '' : ' selected'}>—</option>` +
    rooms.map(r => `<option value="${mtEsc(r)}"${room === r ? ' selected' : ''}>${mtEsc(r)}</option>`).join('') +
    `<option value="${MT_SB_ALL}"${room === MT_SB_ALL ? ' selected' : ''}>Gemeinschaftsfläche</option>`;
  const stats = ['open', 'in_progress', 'done'].map(st => `<option value="${st}"${(d.status || 'open') === st ? ' selected' : ''}>${mtStatusLabel(d.kind, st)}</option>`).join('');
  const [l1, l2] = MT_DATE_LBL[d.kind] || MT_DATE_LBL.renovierung;
  return `
    <section class="mt-sec mt-sec--edit">
      <div class="mt-grid">
        <input type="hidden" id="mtF-kind" value="${mtEsc(d.kind)}"/>
        <div class="mt-f mt-f--full"><label class="mt-k" for="mtF-title">Title</label>
          <input class="mt-in" id="mtF-title" type="text" maxlength="120" autocomplete="off" value="${mtEsc(d.title || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtF-prop">Property</label><select class="mt-in" id="mtF-prop">${props}</select></div>
        <div class="mt-f" id="mtF-roomBox"${casa ? '' : ' hidden'}><label class="mt-k" for="mtF-room">Zimmer</label><select class="mt-in" id="mtF-room">${roomOpts}</select></div>
        <div class="mt-f${casa ? ' mt-f--full' : ''}" id="mtF-areaBox"><label class="mt-k" for="mtF-area">Area</label>
          <input class="mt-in" id="mtF-area" type="text" maxlength="80" autocomplete="off" placeholder="e.g. Bad 1. OG" value="${mtEsc(d.area || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtF-date" id="mtF-dateL">${l1}</label><input class="mt-in" id="mtF-date" type="date" value="${mtEsc(d.case_date || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtF-end" id="mtF-endL">${l2}</label><input class="mt-in" id="mtF-end" type="date" value="${mtEsc(d.end_date || '')}"/></div>
        <div class="mt-f mt-f--full"><span class="mt-k" id="mtF-statusL">Status</span><select class="mt-in" id="mtF-status" hidden>${stats}</select>
          <div class="mt-stseg" role="group" aria-labelledby="mtF-statusL">${['open', 'in_progress', 'done'].map(st => `<button type="button" class="mt-stseg__b mt-stseg__b--${st}${(d.status || 'open') === st ? ' is-on' : ''}" data-mt="stSet" data-v="${st}" aria-pressed="${(d.status || 'open') === st}">${mtStatusLabel(d.kind, st)}</button>`).join('')}</div></div>
        <div class="mt-f mt-f--full"><label class="mt-k" for="mtF-desc" id="mtF-descL">Description</label>
          <textarea class="mt-in mt-ta" id="mtF-desc" rows="3" maxlength="2000">${mtEsc(d.description || '')}</textarea></div>
      </div>
      <div class="cc-sec-foot">
        ${s.isNew ? '' : `<span class="is-left mt-foot-l"><button type="button" class="cc-foot-btn mt-del" data-mt="del"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button>
          ${Object.keys(MT_KIND).filter(k => k !== c.kind).map(k => `<button type="button" class="mt-link mt-move" data-mt="moveKind" data-v="${k}"><i class="ti ti-arrows-exchange" aria-hidden="true"></i>${d.kind === k ? 'Moves to ' + MT_KIND[k].title + ' on Save · undo' : 'Move to ' + MT_KIND[k].title}</button>`).join('')}</span>`}
        <span class="cc-foot-right">
          <button type="button" class="cc-foot-btn" data-mt="cancel">Cancel</button>
          <button type="button" class="cc-foot-btn mt-save" data-mt="save">Save</button>
        </span>
      </div>
    </section>`;
}

function mtRenderPanel() {
  const p = document.getElementById('mtPanel');
  if (!p) return;
  const html = mtPanelHTML();
  if (!html) {
    MT.sel = null;
    p.innerHTML = '';
    mtPanelStatus(p);
    mtParkPanel();
    mtEditModalSync();
    mtCostModalSync();
    return;
  }
  mtCostCapture();                                           // an open cost form keeps what is typed
  if (mtPop(MT.sel)) mtLockSync(true);                       // D39 (bug 0): the page is held before the entry behind is drawn again
  p.innerHTML = html;
  mtPanelStatus(p);
  // the date field becomes a German field right after it is drawn → note the form after that.
  // D39 (bug 16): only once per form (each Edit / new entry is a new MT.sel) — a redraw must not take what you typed as "saved"
  if (MT.sel.edit && MT.sel.snap === undefined) { const sel = MT.sel; setTimeout(() => { if (MT.sel === sel && sel.edit && sel.snap === undefined) sel.snap = mtFormSnap(); }, 0); }
  mtAfterPanel();
}
/* D39 · a pop-up form is open (a receipt, or Edit of a saved entry). Behind it the entry is drawn as it is
   (nothing hides, so nothing behind the pop-up moves); the page behind is locked and inert (mtLockSync). */
const mtPop = s => !!(s && (s.cost || (s.edit && !s.isNew)));
/* The open entry is one element that moves into its place in the list (so a redraw of
   the list never loses what is typed) and back to its hidden home when nothing is open */
function mtParkPanel() {
  const p = document.getElementById('mtPanel'), home = document.getElementById('mtPanelHome');
  if (p && home && p.parentNode !== home) home.appendChild(p);
}
function mtPlacePanel(root) {
  const p = document.getElementById('mtPanel'), slot = root && root.querySelector('.mt-slot');
  if (!p) return;
  mtPanelStatus(p);
  if (slot && MT.sel) { slot.replaceWith(p); mtMoreCheck(); }   // D39: "More" is measured where the entry really is (not in its hidden home)
  else mtParkPanel();
}
/* L1 · the open entry keeps its status line (a new entry has none yet) */
function mtPanelStatus(p) {
  const c = MT.sel && !MT.sel.isNew ? mtCase(MT.sel.id) : null;
  p.classList.remove('mt-st--open', 'mt-st--prog', 'mt-st--done');
  if (c) p.classList.add(mtStCls(c.status));
}
function mtScrollToOpen() {
  const p = document.getElementById('mtPanel');
  if (p && p.parentNode && p.parentNode.id !== 'mtPanelHome') p.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/* What the form says right now (to notice unsaved changes) */
function mtFormSnap() {
  return ['mtF-title', 'mtF-prop', 'mtF-room', 'mtF-area', 'mtF-kind', 'mtF-date', 'mtF-end', 'mtF-status', 'mtF-desc',
    'mtF-art', 'mtF-found', 'mtF-visit', 'mtF-cause', 'mtF-measures', 'mtF-ask', 'mtF-police']
    .map(id => { const el = document.getElementById(id); return el ? el.value : ''; })
    .join('\u0001');
}
const mtDirty = () => !!(MT.sel && (
  (MT.sel.edit && MT.sel.snap !== undefined && mtFormSnap() !== MT.sel.snap) ||
  MT.sel.add || (MT.sel.fix && mtFixChanged()) || (MT.sel.cost && mtCostChanged())));

/* Type changed in the form: switch, date labels, status words, Schaden fields and the new-entry title follow */
function mtKindChanged() {
  const kind = document.getElementById('mtF-kind')?.value;
  if (!MT_KIND[kind]) return;
  const sch = kind === 'schaden', g = id => document.getElementById(id);
  const st = g('mtF-status');
  if (st) [...st.options].forEach(o => { o.textContent = mtStatusLabel(kind, o.value); });
  document.querySelectorAll('.mt-stseg__b').forEach(b => { b.textContent = mtStatusLabel(kind, b.dataset.v); });
  const [l1, l2] = MT_DATE_LBL[kind] || MT_DATE_LBL.renovierung;
  if (g('mtF-dateL')) g('mtF-dateL').textContent = l1;
  if (g('mtF-endL')) g('mtF-endL').textContent = l2;
  mtSbVis();
  if (MT.sel && MT.sel.isNew) {
    MT.sel.draft.kind = kind;
    const t = g('mtPanelTitle');
    if (t) t.textContent = 'New ' + (MT_KIND[kind].add || MT_KIND[kind].one);
  }
}
/* D9 · Status and date stay in line (both visible before Save, you can change them back) */
function mtEndChanged() {
  const g = id => document.getElementById(id), end = g('mtF-end')?.value, st = g('mtF-status');
  if (st && end && end <= ccTodayISO() && st.value !== 'done') { st.value = 'done'; mtStSegSync(); mtSay('Status set to Done'); }
}
function mtStatusChanged() {
  const g = id => document.getElementById(id), st = g('mtF-status'), end = g('mtF-end');
  if (!st || !end || st.value !== 'done' || end.value || mtNativeVal(end).trim()) return;
  const start = g('mtF-date')?.value || '', today = ccTodayISO();
  end.value = start > today ? start : today;
  end.dispatchEvent(new Event('input', { bubbles: true }));
  const sch = g('mtF-kind')?.value === 'schaden';
  mtSay((sch ? 'Behoben am' : 'End') + ' set to ' + mtDate(end.value));
}

/* Read + check the form. Returns the fields, or null (and says what is missing). */
function mtReadForm() {
  const g = id => document.getElementById(id);
  const bad = (id, msg) => {
    const el = g(id);
    if (el) {
      el.setAttribute('aria-invalid', 'true');
      el.addEventListener('input', () => el.removeAttribute('aria-invalid'), { once: true });
      if (!el.classList.contains('cc-cal')) el.focus();       // a date field would open the calendar on focus
    }
    mtSay(msg);
    return null;
  };
  const title = g('mtF-title').value.trim();
  const pid = g('mtF-prop').value;
  const kind = g('mtF-kind').value;
  const dateEl = g('mtF-date'), endEl = g('mtF-end');
  const date = dateEl.value || '';                         // ISO, or '' when empty / not a date
  const end = endEl ? endEl.value || '' : '';
  if (!title) return bad('mtF-title', 'Add a title.');
  if (!pid) return bad('mtF-prop', MT.props.length ? 'Choose the property.' : 'No properties yet. Add them in the Properties app first.');
  const [l1, l2] = MT_DATE_LBL[kind] || MT_DATE_LBL.renovierung;
  if (!date && mtNativeVal(dateEl).trim()) return bad('mtF-date', `Check "${l1}" (TT.MM.JJJJ).`);
  if (endEl && !end && mtNativeVal(endEl).trim()) return bad('mtF-end', `Check "${l2}" (TT.MM.JJJJ).`);
  if (date && end && end < date) return bad('mtF-end', `"${l2}" can't be before "${l1}".`);
  const p = mtProp(pid);
  const old = MT.sel && !MT.sel.isNew ? mtCase(MT.sel.id) : null;
  let sbf = null;                                          // D5/D6: report fields of a Schaden
  if (MT.d5 && kind === 'schaden' && g('mtF-art')) {
    const found = g('mtF-found').value || '';
    if (!found && mtNativeVal(g('mtF-found')).trim()) return bad('mtF-found', 'Check "Festgestellt am" (TT.MM.JJJJ).');
    if (date && found && found < date) return bad('mtF-found', '"Festgestellt am" can\'t be before the Schadenstag.');
    const art = g('mtF-art').value || null;
    sbf = {
      schadensart: art, festgestellt_am: found || null,
      ursache: g('mtF-cause').value.trim() || null,
      massnahmen: g('mtF-measures').value.trim() || null,
      polizei_az: /Einbruch/.test(art || '') ? (g('mtF-police').value.trim() || null) : null,
    };
    if (MT.d6 && g('mtF-visit')) {
      sbf.besichtigung = g('mtF-visit').value.trim() || null;
      sbf.bitte_hv = mtIsCasa(pid) ? null : (g('mtF-ask').value.trim() || null);
    }
  }
  return {
    sbf,
    kind: MT_KIND[kind] ? kind : MT.tab,
    title,
    property_id: Number(pid),
    property_name: p ? p.name : ((MT.sel.draft && MT.sel.draft.property_name) || (old && old.property_name) || ''),
    area: g('mtF-area').value.trim() || null,
    case_date: date || null,
    end_date: end || null,
    status: g('mtF-status').value || 'open',
    description: g('mtF-desc').value.trim() || null,
    room: MT.d5 ? (mtIsCasa(pid) && g('mtF-room') ? g('mtF-room').value || null : null) : undefined,
  };
}

/* ── Panel actions ────────────────────────────────────────── */
async function mtOpen(id) {
  if (MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(id) && !MT.sel.edit) return;
  if (MT.sel && !(await mtClose())) return;
  { const c0 = mtCase(id), cy = c0 && mtCaseYear(c0);                 // D37: an entry of another year → go to its year
    if (c0 && /^\d{4}$/.test(cy) && !mtInYear(c0, mtSumYear())) MT.sumYear.all = cy; }
  MT.sel = { id, isNew: false, edit: false };
  mtRenderPanel();
  mtRender();
  mtScrollToOpen();
}

async function mtNew() {
  if (MT.sel && !(await mtClose())) return;
  MT.sel = {
    id: null, isNew: true, edit: true,
    draft: { kind: MT.tab, title: '', property_id: '', area: '', case_date: ccTodayISO(), end_date: '', status: 'open', description: '', book_ctrl: true, report_room: '' },
  };
  mtRenderPanel();
  mtRender();
  mtScrollToOpen();
  if (mtFine()) document.getElementById('mtF-title')?.focus();
}

function mtEdit() {
  if (!MT.sel || MT.sel.isNew) return;
  if (MT.busy) { mtBusySay(); return; }                      // D39 (bugs 15/19): a save is running → wait (and say so)
  if (mtActive(mtCase(MT.sel.id))) return;
  MT.sel = { id: MT.sel.id, isNew: false, edit: true };
  mtRenderPanel();
}

async function mtCancel() {
  if (!MT.sel) return;
  if (MT.sel.isNew) { mtClose(true); return; }
  // D38: Edit is a pop-up now (a tap beside it closes it) → typed changes ask first
  const sel = MT.sel;
  if (sel.edit && sel.snap !== undefined && mtFormSnap() !== sel.snap) {
    const ok = await mtConfirm({ title: 'Discard your changes?', text: 'What you typed in this entry is not saved.', ok: 'Discard', cancel: 'Keep editing', danger: true });
    if (!ok || MT.sel !== sel) return;
  }
  MT.sel = { id: MT.sel.id, isNew: false, edit: false };
  mtRenderPanel();
}

/* Close the panel. Unsaved changes → ask first. Returns true when it closed. */
async function mtClose(force) {
  if (!MT.sel) return true;
  if (!force && mtDirty()) {
    const ok = await mtConfirm({ title: 'Discard your changes?', text: 'What you typed in this entry is not saved.', ok: 'Discard', cancel: 'Keep editing', danger: true });
    if (!ok) return false;
  }
  MT.sel = null;
  mtRenderPanel();
  mtRender();
  return true;
}

async function mtSave() {
  const s = MT.sel;
  if (!s || !s.edit) return;
  if (MT.busy) { mtBusySay(); return; }                      // D39 (bug 19): never a silent "nothing happens"
  const f = mtReadForm();
  if (!f) return;
  MT.busy = true;
  const snap0 = s.snap;                                      // D39 (bug 16): the form as it was opened — a failed save still counts as changed
  const isNew = !!s.isNew, id = isNew ? mtUuid() : s.id;
  const oldRow = isNew ? null : { ...mtCase(id) };
  const now = new Date().toISOString();
  const { sbf, room, ...fv } = f;
  const flat = { ...fv, ...(sbf || {}), ...(room !== undefined ? { report_room: room } : {}) };   // report fields + Zimmer (D5/D9)
  const row = { ...(oldRow || {}), ...flat, id, updated_at: now, created_at: oldRow ? oldRow.created_at : now };

  // 1 · show it at once: list + panel back in the read view
  if (isNew) MT.cases.push(row); else Object.assign(mtCase(id), row);
  MT.sel = { id, isNew: false, edit: false };
  if (row.kind !== MT.tab) mtSwitchTab(row.kind); else mtRender();       // type changed → the list follows
  mtRenderPanel();

  // 2 · store it (one retry)
  const sb = _ctlSupa;
  const payload = {
    kind: f.kind, title: f.title, property_id: f.property_id, property_name: f.property_name, area: f.area,
    case_date: f.case_date, end_date: f.end_date, status: f.status, description: f.description,
    ...(f.sbf || {}),
    ...(f.room !== undefined ? { report_room: f.room } : {}),
  };
  const r = await mtTry(() => (isNew ? sb.from('maint_cases').insert({ id, ...payload }) : sb.from('maint_cases').update(payload).eq('id', id)));
  MT.busy = false;
  if (!r.error) return;

  // 3 · not stored: everything back as it was, the form comes back with what you typed
  console.error('[maintenance] save failed:', r.error);
  const sqlMissing = /book_ctrl|maint_cost_id|schadensart|festgestellt|report_no|report_room|in_report|taken_at|caption|besichtigung|bitte_hv|report_ort|report_dringend/i.test(String((r.error && (r.error.message || r.error.details)) || ''));
  if (isNew) MT.cases = MT.cases.filter(c => c.id !== id);
  else Object.assign(mtCase(id), oldRow);
  // D39 (bug 15): the form comes back only where nothing else was opened meanwhile (never on top of another form)
  const p = MT.sel, free = !p || (!p.edit && !p.cost && !p.add && !p.fix && !p.docEdit);
  if (!free || MT.sb) {
    mtRender();
    mtSay(`Not saved: “${f.title}”. Check the connection and change it again.`);
    return;
  }
  MT.sel = { id: isNew ? null : id, isNew, edit: true, draft: { ...flat }, snap: snap0 };
  const backTo = isNew ? MT.tab : oldRow.kind;
  if (backTo !== MT.tab) mtSwitchTab(backTo); else mtRender();
  mtRenderPanel();
  mtSay(sqlMissing ? 'Not saved: run the newest MAINTENANCE SQL in Supabase first.' : 'Not saved. Check the connection and save again.');
}

async function mtDelete() {
  const c = MT.sel && !MT.sel.isNew ? mtCase(MT.sel.id) : null;
  if (!c) return;
  if (MT.busy || (MT.up && String(MT.up.caseId) === String(c.id))) { mtBusySay(); return; }   // D39 (bug 19)
  const n = MT.docs.filter(d => String(d.case_id) === String(c.id)).length;
  const k = MT.costs.filter(r => String(r.case_id) === String(c.id) && !r.return_of).length;
  const parts = [k ? `${k} receipt${k === 1 ? '' : 's'}` : '', n ? `${n} file${n === 1 ? '' : 's'}` : ''].filter(Boolean);
  const ok = await mtConfirm({
    title: 'Delete this entry?',
    text: `"${c.title}"${parts.length ? ' and its ' + parts.join(' and ') : ''} will be deleted for good.` +
      mtCtrlNote(MT.costs.filter(r => String(r.case_id) === String(c.id))),
    ok: 'Delete', danger: true,
  });
  if (!ok) return;
  MT.busy = true;
  const idx = MT.cases.indexOf(c);
  const docs = MT.docs.filter(d => String(d.case_id) === String(c.id));
  const costs = MT.costs.filter(r => String(r.case_id) === String(c.id));
  MT.cases.splice(idx, 1);
  MT.docs = MT.docs.filter(d => String(d.case_id) !== String(c.id));
  MT.costs = MT.costs.filter(r => String(r.case_id) !== String(c.id));
  MT.sel = null;
  mtRenderPanel();
  mtRender();

  const sb = _ctlSupa;
  const r = await mtTry(() => sb.from('maint_cases').delete().eq('id', c.id));      // its cost + document rows go with it
  MT.busy = false;
  if (r.error) {
    console.error('[maintenance] delete failed:', r.error);
    MT.cases.splice(idx, 0, c);
    MT.docs.push(...docs);
    MT.costs.push(...costs);
    mtRender();
    mtSay('Not deleted. Check the connection and try again.');
    return;
  }
  const paths = docs.flatMap(mtFilesOf);
  if (paths.length) {
    try { await sb.storage.from(MT_BUCKET).remove(paths); }
    catch (e) { console.warn('[maintenance] files not removed:', e); }
  }
  mtSay('Deleted');
}

/* ── Documents ────────────────────────────────────────────── */
const mtThumbPath = p => String(p || '').replace(/^([^/]+)\//, '$1/thumbs/');            // <case>/thumbs/<id>.jpg
const mtFilesOf = d => (d.doc_type === 'photo' ? [d.file_path, mtThumbPath(d.file_path)] : [d.file_path, d.orig_path]).filter(Boolean);   // D27: + the untouched original
const mtDocsOf = caseId => MT.docs.filter(d => String(d.case_id) === String(caseId));
const mtIsImage = f => /^image\//.test(f.type || '') || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(f.name || '');
const mtIsPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
const mtIsVideo = f => /^video\//.test(f.type || '') || /\.(mov|mp4|m4v|3gp|webm)$/i.test(f.name || '');
/* 20 → "20 Sek." · 95 → "1:35 Min." */
const mtDur = s => (!s ? '' : s < 60 ? s + ' Sek.' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' Min.');
const mtLinkNow = p => { const l = MT.links[p]; return l && l.exp > Date.now() + 5000 ? l.url : null; };
/* Something in the panel is open or running (an edit, a form, an upload) → the other buttons wait */
const mtUpFor = c => (c && MT.up && String(MT.up.caseId) === String(c.id) ? MT.up : null);
const mtActive = c => !!(MT.sel && (MT.sel.edit || MT.sel.docEdit || MT.sel.add || MT.sel.fix || MT.sel.cost || mtUpFor(c)));
/* D39 · what changes the entry itself: a form inside it or an upload. A pop-up form (a receipt, Edit) does not —
   behind it the entry keeps every button (it is inert while the pop-up is open), so the page behind never moves. */
const mtBusyIn = c => !!(MT.sel && ((MT.sel.edit && MT.sel.isNew) || MT.sel.docEdit || MT.sel.add || MT.sel.fix || mtUpFor(c)));
/* D39 (bug 19) · a save / upload is running → say so (it used to do nothing at all) */
function mtBusySay() { mtSay(MT.up ? 'Wait until the upload is finished.' : 'Wait a moment – the last change is being saved.'); }
/* Documents of the Documents section (files of cost rows live in Costs) */
const mtCaseDocs = caseId => MT.docs.filter(d => String(d.case_id) === String(caseId) && !d.cost_id);

/* Angebot, Schadenbericht … from the file name (you can change it); invoices belong in Costs */
function mtGuessType(name, isImg) {
  const n = String(name || '').toLowerCase();
  if (/angebot|kostenvoranschlag|\bkva?\b|offer|quote/.test(n)) return 'angebot';
  if (/schaden|bericht|gutachten|report/.test(n)) return 'schadenbericht';
  if (/e-?mail|\bmail\b|nachricht/.test(n)) return 'email';
  return isImg ? 'photo' : 'other';
}
/* The day a photo was taken (file date), else today */
function mtFileDay(f) {
  const t = Number(f && f.lastModified);
  const day = t ? ccDayOf(new Date(t)) : '';
  return day && day <= ccTodayISO() && day >= '2000-01-01' ? day : ccTodayISO();
}
/* Photo → JPEG, longest side max px (null if the browser cannot read it) */
function mtShrink(file, max, quality) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      cv.toBlob(b => resolve(b || null), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/* Short-lived private links (1 hour) for the files of the open entry */
async function mtPrepareLinks(paths) {
  const need = [...new Set(paths.filter(p => p && !mtLinkNow(p)))];
  if (!need.length) return;
  try {
    const { data, error } = await _ctlSupa.storage.from(MT_BUCKET).createSignedUrls(need, 3600);
    if (error) throw error;
    (data || []).forEach(x => { if (x && x.signedUrl && x.path) MT.links[x.path] = { url: x.signedUrl, exp: Date.now() + 3500 * 1000 }; });
  } catch (e) { console.warn('[maintenance] links:', e); }
}
function mtFillThumbs() {
  document.querySelectorAll('#mtPanel img[data-path]').forEach(img => {
    if (img.getAttribute('src')) return;
    const thumb = mtLinkNow(img.dataset.thumb), full = mtLinkNow(img.dataset.path);
    if (thumb) {
      img.onerror = () => { const f = mtLinkNow(img.dataset.path); img.onerror = null; if (f) img.src = f; };   // no preview → the photo itself
      img.src = thumb;
    } else if (full) img.src = full;
  });
}
/* A long text field grows with its text (nothing hidden, no scrolling inside the field) */
function mtGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight + 2, 44) + 'px';
}
function mtMoreCheck() {
  const d = document.querySelector('#mtPanel .mt-oh__d'), b = document.querySelector('#mtPanel .mt-more[data-auto]');
  if (d && b) b.hidden = d.scrollHeight <= d.clientHeight + 1;
}
function mtAfterPanel() {
  mtEditModalSync();                                         // D38: Edit as a pop-up
  mtCostModalRender();
  mtLockSync();                                              // D39 (bug 0): the pop-ups (and the page lock) first …
  mtMoreCheck();                                             // … then anything that reads the layout
  document.querySelectorAll('#mtPanel textarea.mt-ta').forEach(mtGrow);
  const c = MT.sel && !MT.sel.isNew ? mtCase(MT.sel.id) : null;
  if (!c) return;
  const paths = mtDocsOf(c.id).flatMap(mtFilesOf);
  mtFillThumbs();
  if (paths.length) mtPrepareLinks(paths).then(mtFillThumbs);
}

/* Tap on a file → opens on top of the app (iPhone viewer / new tab) */
function mtOpenUrl(url) {
  if (typeof ccOpenUrl === 'function') { ccOpenUrl(url, 'Open'); return; }   // shared: a blocked pop-up shows a sheet
  let w = null;
  try { w = window.open(url, '_blank'); } catch (e) { w = null; }
  if (w) { try { w.opener = null; } catch (e) {} return; }
  mtSay('Allow pop-ups to open the file.');               // never replace the app page (that restarted the app)
}
function mtOpenDoc(id) {
  const d = MT.docs.find(x => String(x.id) === String(id));
  if (!d) return;
  // D29/D32: a receipt file opens as its A4 page — made again from the original when the band would say something else
  const lbl = d.cost_id ? mtFrameKey(d.cost_id) : '';
  const stale = !!lbl && mtFrFrameable(d.orig_path || d.file_path) && (d.stamp_no || null) !== lbl && d.stamp_no !== '!' + lbl;
  const ready = !stale && mtLinkNow(d.file_path);
  if (ready) { mtOpenUrl(ready); return; }
  let w = null;                                           // open the tab inside the tap, fill it when the link is there
  if (!(typeof CC_STANDALONE !== 'undefined' && CC_STANDALONE)) { try { w = window.open('', '_blank'); } catch (e) { w = null; } }
  const c0 = mtCase(d.case_id) || { id: d.case_id };
  (stale ? mtStampSync(c0, [d], lbl).catch(e => console.warn('[maintenance] A4 page not made:', e)) : Promise.resolve())
    .then(() => mtPrepareLinks([d.file_path])).then(() => {
    const url = mtLinkNow(d.file_path);
    if (!url) { try { if (w) w.close(); } catch (e) {} mtSay('The file could not be opened. Try again.'); return; }
    if (w) { try { w.location.replace(url); return; } catch (e) {} }
    mtOpenUrl(url);
  });
}

/* ── Documents: drawing ── */
function mtDocsHTML(c) {
  const s = MT.sel, docs = mtCaseDocs(c.id);
  const byDate = (a, b) => String(a.doc_date || '').localeCompare(String(b.doc_date || '')) || String(a.created_at || '').localeCompare(String(b.created_at || ''));
  const photos = docs.filter(d => d.doc_type === 'photo').sort(byDate);
  const files = docs.filter(d => d.doc_type !== 'photo')
    .sort((a, b) => MT_DOC_ORDER.indexOf(a.doc_type) - MT_DOC_ORDER.indexOf(b.doc_type) || byDate(a, b));
  const locked = false;                                    // D39: Edit and receipts are pop-ups — the documents behind stay as they are
  const ed = !!s.docEdit && !locked;
  const upAny = mtUpFor(c), up = upAny && upAny.where === 'docs' ? upAny : null;

  let h = '<section class="mt-docs" id="mtDocs"><p class="mt-sec__t">Documents</p>';
  if (s.add && !locked) h += mtDocFormHTML('mtA', s.add, s.add.name, s.add.isImg, 'add');
  if (up) h += `<p class="mt-up" role="status"><span class="mt-spin" aria-hidden="true"></span>${up.what ? mtEsc(up.what) + ' · ' : 'Uploading '}${Math.min(up.done + 1, up.total)} of ${up.total}</p>`;
  if (!files.length && !s.add && !up) h += '<p class="mt-docs-empty">No documents yet.</p>';
  if (photos.length && !ed && !locked) h += `<button type="button" class="mt-link mt-photolink" data-mt="sbOpen" data-id="${mtEsc(c.id)}"><i class="ti ti-photo" aria-hidden="true"></i>${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} · in the ${mtBerichtLbl(c)}</button>`;
  if (files.length) {
    h += '<div class="mt-dl">' + files.map(d => (s.fix === String(d.id) && !locked)
      ? mtDocFormHTML('mtX', { type: d.doc_type, amount: d.amount, date: d.doc_date }, d.file_name || MT_DOC[d.doc_type].label, false, 'fix')
      : mtDocRowHTML(d, ed)).join('') + '</div>';
  }
  if (ed && !s.fix) h += '<p class="mt-hint">Tap a document to change its type, Betrag or date. The × deletes it.</p>';
  if (!locked && !s.add && !s.fix && !upAny) {
    h += ed
      ? '<div class="cc-sec-foot"><button type="button" class="cc-foot-btn mt-save" data-mt="docsDone">Done</button></div>'
      : `<div class="cc-sec-foot">
          <span class="is-left mt-foot-l">
            <button type="button" class="cc-foot-btn" data-mt="upload"><i class="ti ti-file-plus" aria-hidden="true"></i> Document</button>
          </span>
          ${files.length ? '<button type="button" class="cc-foot-btn" data-mt="docsEdit"><i class="ti ti-pencil" aria-hidden="true"></i> Edit</button>' : '<span aria-hidden="true"></span>'}
        </div>`;
  }
  return h + '</section>';
}

function mtDocRowHTML(d, ed) {
  const t = MT_DOC[d.doc_type] || MT_DOC.other;
  const sub = (d.generated ? [mtDate(d.doc_date)] : [d.file_name, d.doc_type === 'video' ? mtDur(d.media_seconds) : '', mtDate(d.doc_date)])
    .filter(Boolean).map(mtEsc).join(' · ');   // a made report: just its date
  return `<div class="mt-dr">
      <button type="button" class="mt-dr__main" data-mt="${ed ? 'fixDoc' : 'openDoc'}" data-id="${mtEsc(d.id)}">
        <span class="mt-di"><i class="ti ${t.icon}" aria-hidden="true"></i></span>
        <span class="mt-dn"><span class="mt-dt">${t.label}</span>${sub ? `<span class="mt-ds">${sub}</span>` : ''}</span>
        ${d.doc_type === 'rechnung' ? `<span class="mt-da">${mtEur(d.amount)}</span>` : ''}
      </button>
      ${ed ? `<button type="button" class="mt-x" data-mt="delDoc" data-id="${mtEsc(d.id)}" aria-label="Delete ${t.label}"><i class="ti ti-x" aria-hidden="true"></i></button>`
        : (d.doc_type === 'rechnung' && !d.cost_id && !mtBusyIn(mtCase(d.case_id)) ? `<button type="button" class="mt-link mt-tocost" data-mt="docToCost" data-id="${mtEsc(d.id)}">Move to Kosten</button>` : '')}
    </div>`;
}
/* D11 · An invoice saved as a document (first version) → a receipt row in Kosten: the form opens
   filled in (amount, date, file); Save books it (with the Controlling check) and the file moves along */
function mtDocToCost(id) {
  const c = mtOpenCase(), d = MT.docs.find(x => String(x.id) === String(id));
  if (!c || !d) return;
  if (MT.busy) { mtBusySay(); return; }
  if (mtActive(c)) return;
  mtCostNew('provider');
  const f = MT.sel && MT.sel.cost; if (!f) return;
  Object.assign(f, {
    amount: d.amount ?? '', cost_date: d.doc_date || ccTodayISO(),
    description: String(d.file_name || '').replace(/\.[a-z0-9]{2,4}$/i, ''),
    files: [{ id: d.id, adopt: true, name: d.file_name || 'Rechnung', img: /\.(jpe?g|png|webp|heic|gif)$/i.test(String(d.file_path || '')) }],
  });
  f.snap = '';                                                 // filled in → counts as typed
  mtCostModalRender();                                         // D22: show the filled-in form (no re-read of the empty one)
}

/* One form for a new file (pre = mtA) and for fixing one (pre = mtX) */
function mtDocFormHTML(pre, v, name, isImg, mode) {
  const types = v.type === 'video' ? ['video']
    : [...(v.type === 'rechnung' ? ['rechnung'] : []), 'angebot', 'schadenbericht', 'email', ...(isImg || v.type === 'photo' ? ['photo'] : []), 'other'];
  const isRe = v.type === 'rechnung';
  const amt = v.amount === null || v.amount === undefined || v.amount === '' ? '' : String(v.amount);
  return `<div class="mt-ab" id="${pre}-form">
      <div class="mt-fc"><i class="ti ${v.type === 'video' ? 'ti-movie' : isImg ? 'ti-photo' : 'ti-file-text'}" aria-hidden="true"></i><span>${mtEsc(name)}</span></div>
      <div class="mt-grid">
        <div class="mt-f"><label class="mt-k" for="${pre}-type">Type</label>
          <select class="mt-in" id="${pre}-type" data-doc-type="${pre}">${types.map(t => `<option value="${t}"${v.type === t ? ' selected' : ''}>${MT_DOC[t].label}</option>`).join('')}</select></div>
        <div class="mt-f" data-only-re="${pre}"${isRe ? '' : ' hidden'}><label class="mt-k" for="${pre}-amount">Betrag (€)</label>
          <input class="mt-in" id="${pre}-amount" data-cc-num="2" inputmode="decimal" autocomplete="off" value="${mtEsc(amt)}"/></div>
        <div class="mt-f"><label class="mt-k" for="${pre}-date" id="${pre}-dateLbl">${isRe ? 'Rechnungsdatum' : 'Date'}</label>
          <input class="mt-in" id="${pre}-date" type="date" value="${mtEsc(v.date || '')}"/></div>
      </div>
      <div class="cc-sec-foot"><span class="cc-foot-right">
        <button type="button" class="cc-foot-btn" data-mt="${mode}Cancel">Cancel</button>
        <button type="button" class="cc-foot-btn mt-save" data-mt="${mode}Save">Save</button>
      </span></div>
    </div>`;
}
/* Type changed in a document form: Betrag only for a Rechnung */
function mtDocTypeChanged(pre) {
  const t = document.getElementById(pre + '-type')?.value;
  const box = document.querySelector(`#mtPanel [data-only-re="${pre}"]`);
  if (box) box.hidden = t !== 'rechnung';
  const lbl = document.getElementById(pre + '-dateLbl');
  if (lbl) lbl.textContent = t === 'rechnung' ? 'Rechnungsdatum' : 'Date';
}
/* Read + check a document form → { type, amount, date } or null */
function mtReadDocForm(pre) {
  const g = id => document.getElementById(pre + '-' + id);
  const type = g('type').value;
  const amtEl = g('amount'), dateEl = g('date');
  const date = dateEl.value || '';
  const fail = (el, msg) => { if (el) { el.setAttribute('aria-invalid', 'true'); if (!el.classList.contains('cc-cal')) el.focus(); } mtSay(msg); return null; };
  let amount = null;
  if (type === 'rechnung') {
    const raw = amtEl.value;                               // "1250.5" (German field) or ''
    if (raw === '' || !isFinite(Number(raw))) return fail(amtEl, 'Enter the Betrag of the Rechnung.');
    amount = Math.round(Number(raw) * 100) / 100;
  }
  if (!date && mtNativeVal(dateEl).trim()) return fail(dateEl, 'Check the date (TT.MM.JJJJ).');
  if (type === 'rechnung' && !date) return fail(dateEl, 'Enter the Rechnungsdatum.');
  return { type, amount, date: date || null };
}
function mtFixChanged() {
  const d = MT.docs.find(x => String(x.id) === String(MT.sel && MT.sel.fix));
  const t = document.getElementById('mtX-type');
  if (!d || !t) return false;
  const a = document.getElementById('mtX-amount'), dt = document.getElementById('mtX-date');
  const amt = t.value === 'rechnung' ? (a && a.value !== '' ? Math.round(Number(a.value) * 100) / 100 : null) : null;
  const was = d.doc_type === 'rechnung' && d.amount !== null && d.amount !== undefined ? Math.round(Number(d.amount) * 100) / 100 : null;
  return t.value !== d.doc_type || amt !== was || (dt ? dt.value || null : null) !== (d.doc_date || null);
}

/* ── Documents: actions ── */
function mtFileInput(id, accept, multiple, onPick) {
  let inp = document.getElementById(id);
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file'; inp.id = id; inp.accept = accept; inp.multiple = multiple;
    inp.style.display = 'none'; inp.setAttribute('aria-hidden', 'true');
    inp.addEventListener('change', () => { const files = [...(inp.files || [])]; inp.value = ''; if (files.length) onPick(files); });
    document.body.appendChild(inp);
  }
  inp.value = '';
  inp.click();
}
const mtOpenCase = () => (MT.sel && !MT.sel.isNew && !MT.sel.edit ? mtCase(MT.sel.id) : null);
function mtRefresh(caseId) {
  const a = mtAnchor();                                      // D36: the screen stays where it is
  if (MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(caseId)) mtRenderPanel();
  mtRender();
  mtRestore(a);
}
/* D36 (Nov 2026) · Keep your place: a redraw takes the open entry out of the list for a moment (shorter page →
   the iPhone moves the scroll position and Safari doesn't move it back). Before a redraw note where the thing you
   look at sits on the screen (a receipt row, else the open entry, else a property card) — afterwards put it back. */
function mtAnchor() {
  const vh = window.innerHeight || 800;
  const vis = el => { const r = el.getBoundingClientRect(); return r.height > 0 && r.bottom > 70 && r.top < vh; };
  // D38: receipts are newest first (6, then "Show all") → hold the Kosten section, not one row
  let el = [...document.querySelectorAll('#mtPanel .mt-cr[data-id]')].find(vis) ? document.getElementById('mtCosts') : null, key = null;
  if (el) key = { k: 'costs' };
  else {
    const p = document.getElementById('mtPanel');
    if (p && p.parentNode && p.parentNode.id !== 'mtPanelHome' && vis(p)) { el = p; key = { k: 'panel' }; }
    else {
      el = [...document.querySelectorAll('#tab-' + MT.tab + ' .mt-card')].find(vis);
      if (el) key = { k: 'card', name: el.getAttribute('aria-label') };
    }
  }
  return el ? { key, tab: MT.tab, top: el.getBoundingClientRect().top } : null;
}
function mtAnchorEl(key) {
  if (key.k === 'costs') return document.querySelector('#mtPanel #mtCosts');
  if (key.k === 'row') {
    const id = window.CSS && CSS.escape ? CSS.escape(String(key.id)) : String(key.id);
    return document.querySelector(`#mtPanel .mt-cr[data-id="${id}"]`);
  }
  if (key.k === 'panel') { const p = document.getElementById('mtPanel'); return p && p.parentNode && p.parentNode.id !== 'mtPanelHome' ? p : null; }
  return [...document.querySelectorAll('#tab-' + MT.tab + ' .mt-card')].find(c => c.getAttribute('aria-label') === key.name) || null;
}
function mtRestore(a) {
  if (!a || a.tab !== MT.tab) return;
  const el = mtAnchorEl(a.key);
  if (!el || !el.getClientRects().length) return;
  const d = el.getBoundingClientRect().top - a.top;
  if (Math.abs(d) > 1) mtPageTo(mtPageY() + d);              // D39: also while a pop-up holds the page
}
/* D39 · a redraw during a save / upload (in the background): an open pop-up keeps its form as it is */
function mtRefreshBg(caseId) { MT.bg++; try { mtRefresh(caseId); } finally { MT.bg--; } }
/* D36 · the receipt you just saved lights up where it is (no scrolling) */
function mtFlashRow(id) {
  setTimeout(() => {
    const sel = window.CSS && CSS.escape ? CSS.escape(String(id)) : String(id);
    let row = document.querySelector(`#mtPanel .mt-cr[data-id="${sel}"]`);
    const cs = !row && MT.sel && !MT.sel.isNew ? mtCostById(id) : null;   // D38: saved into the hidden part → "Show all"
    if (cs && String(cs.case_id) === String(MT.sel.id)) {
      MT.cAll = MT.cAll || {}; MT.cAll[MT.sel.id] = true; MT.cgrp = 'all';
      mtRefreshBg(MT.sel.id);
      row = document.querySelector(`#mtPanel .mt-cr[data-id="${sel}"]`);
    }
    if (!row) return;
    mtFlashOn(row);
  }, 60);
}
/* D39 (bug 10) · one-shot highlight (CSS mtFlash: on at once, fades out) — the class goes when it has run */
function mtFlashOn(row) {
  row.classList.remove('is-flash'); void row.offsetWidth;    // the same row again → it lights up again
  row.classList.add('is-flash'); clearTimeout(row._fl); row._fl = setTimeout(() => row.classList.remove('is-flash'), 1800);
}

/* Photos: camera or library, several at once → saved as photos right away */

/* Document: a PDF from Files is kept as it is · photos (camera or library) become ONE PDF,
   a page per photo (e.g. a 3-page Angebot) → its Type → Save. Documents never land in the photo grid;
   documentation photos go through "Photos". */
function mtPickFile() {
  if (!mtOpenCase()) return;
  if (MT.up || MT.busy) { mtBusySay(); return; }
  mtFileInput('mtDocInput', 'application/pdf,image/*,video/*', true, async files => {
    const c = mtOpenCase();
    if (!c) return;
    const vids = files.filter(mtIsVideo);
    if (vids.length) {
      if (vids.length < files.length) mtSay('Videos are saved first – add photos or PDFs separately.');
      return mtAddVideos(c, vids);
    }
    const pdfs = files.filter(mtIsPdf), imgs = files.filter(f => !mtIsPdf(f) && mtIsImage(f));
    let file = null, pages = 0;
    if (pdfs.length) {
      if (files.length > 1) mtSay('One PDF at a time – the first one is used.');
      file = pdfs[0];
    } else if (imgs.length) {
      if (imgs.some(f => f.size > MT_MAX_MB * 1024 * 1024)) { mtSay(`A photo is too big (max ${MT_MAX_MB} MB).`); return; }
      mtSay(imgs.length === 1 ? 'Making a PDF…' : `Making a PDF with ${imgs.length} pages…`);
      file = await mtPhotosToPdf(imgs);
      if (!file) { mtSay('The PDF could not be made. Try again.'); return; }
      pages = imgs.length;
    } else { mtSay('Choose a PDF or a photo.'); return; }
    if (file.size > MT_MAX_MB * 1024 * 1024) { mtSay(`This file is too big (max ${MT_MAX_MB} MB).`); return; }
    const now = mtOpenCase();
    if (!now || String(now.id) !== String(c.id)) return;            // another entry was opened meanwhile
    MT.sel.docEdit = false; MT.sel.fix = null;
    MT.sel.add = { file, name: (file.name || 'Document.pdf') + (pages > 1 ? ` · ${pages} pages` : ''), isImg: false,
      type: mtGuessType(file.name, false), amount: '', date: ccTodayISO() };
    mtRenderPanel();
    document.getElementById('mtDocs')?.scrollIntoView({ block: 'nearest' });
  });
}
/* Videos → saved in Documents right away (type Video, with their length); listed in the Schadensbericht's Anlagen */
async function mtAddVideos(c, vids) {
  if (!MT.d7) { mtSay('Run MAINTENANCE-D7.sql in Supabase first.'); return; }
  const max = MT_MAX_VIDEO_MB * 1024 * 1024, ok = vids.filter(f => f.size <= max);
  if (ok.length < vids.length) mtSay(`A video is too big (max ${MT_MAX_VIDEO_MB} MB · film in 1080p).`);
  if (!ok.length || MT.up) return;
  MT.up = { caseId: c.id, total: ok.length, done: 0, where: 'docs' };
  mtRefresh(c.id);
  let n = 0;
  for (const f of ok) {
    const secs = await mtVideoSeconds(f), t = Number(f.lastModified);
    const extra = { media_seconds: secs, ...(t ? { taken_at: new Date(t).toISOString() } : {}) };
    if (await mtUploadOne(c, f, { type: 'video', amount: null, date: mtFileDay(f) }, extra)) n++;
    MT.up.done++;
    mtRefresh(c.id);
  }
  MT.up = null;
  mtRefresh(c.id);
  mtSay(n === ok.length ? (n === 1 ? 'Video saved' : n + ' videos saved') : `${n} of ${ok.length} videos saved. Add the others again.`);
}
/* The length of a video in seconds (null if the phone cannot tell) */
function mtVideoSeconds(file) {
  return new Promise(resolve => {
    let done = false;
    const url = URL.createObjectURL(file), v = document.createElement('video');
    const end = s => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(s); };
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => end(isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration) : null);
    v.onerror = () => end(null);
    setTimeout(() => end(null), 8000);
    v.src = url;
  });
}
/* Photos → one A4 PDF (portrait or landscape per photo, the whole photo, nothing cut off) */
async function mtPhotosToPdf(imgs) {
  try {
    if (!window.jspdf) await mtLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf;
    let pdf = null;
    for (const f of imgs) {
      const p = await mtImageData(f, 2000, 0.85);
      if (!p) return null;
      const land = p.w > p.h, W = land ? 297 : 210, H = land ? 210 : 297, M = 8;
      if (!pdf) pdf = new jsPDF({ orientation: land ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
      else pdf.addPage('a4', land ? 'landscape' : 'portrait');
      const k = Math.min((W - 2 * M) / p.w, (H - 2 * M) / p.h), w = p.w * k, h = p.h * k;
      pdf.addImage(p.url, 'JPEG', (W - w) / 2, (H - h) / 2, w, h);
    }
    const base = imgs.length === 1 ? String(imgs[0].name || 'Scan').replace(/\.[a-z0-9]+$/i, '') : 'Scan ' + mtDate(ccTodayISO());
    return new File([pdf.output('blob')], base + '.pdf', { type: 'application/pdf' });
  } catch (e) {
    console.error('[maintenance] photo → PDF:', e);
    return null;
  }
}
/* A photo → JPEG data, longest side max px (upright, as the phone shows it) */
function mtImageData(file, max, quality) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      resolve({ url: cv.toDataURL('image/jpeg', quality), w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
async function mtAddSave() {
  const s = MT.sel, c = mtOpenCase();
  if (!s || !s.add || !c || MT.up) return;
  const v = mtReadDocForm('mtA');
  if (!v) return;
  const add = s.add;
  s.add = null;
  MT.up = { caseId: c.id, total: 1, done: 0, where: 'docs' };
  mtRefresh(c.id);
  const ok = await mtUploadOne(c, add.file, v);
  MT.up = null;
  if (!ok && MT.sel && String(MT.sel.id) === String(c.id)) MT.sel.add = { ...add, type: v.type, amount: v.amount ?? '', date: v.date };   // the form comes back
  mtRefresh(c.id);
  mtSay(ok ? MT_DOC[v.type].label + ' saved' : 'Not uploaded. Check the connection and try again.');
}

/* Store one file: shrink a photo → upload (one retry) → its row; nothing is left half-saved */
async function mtUploadOne(c, file, v, extra) {
  const sb = _ctlSupa, store = sb.storage.from(MT_BUCKET);
  const id = mtUuid(), img = mtIsImage(file);
  let blob = file, ext = (String(file.name || '').match(/\.([a-z0-9]{1,5})$/i) || [, img ? 'jpg' : 'pdf'])[1].toLowerCase();
  let type = file.type || (mtIsPdf(file) ? 'application/pdf' : 'application/octet-stream');
  if (img) {
    const small = await mtShrink(file, 2000, 0.85);
    if (small) { blob = small; ext = 'jpg'; type = 'image/jpeg'; }
  }
  const path = `${c.id}/${id}.${ext}`;
  const put = (p, b, t) => mtTry(async () => {
    const r = await store.upload(p, b, { contentType: t, upsert: false, cacheControl: '3600' });
    if (r && r.error && /exist|duplicate|409/i.test(String(r.error.message || r.error.statusCode || ''))) return {};   // first try did arrive
    return r;
  });
  const up = await put(path, blob, type);
  if (up.error) { console.error('[maintenance] upload failed:', up.error); return false; }
  if (v.type === 'photo' && img) {                         // small preview for the photo grid (best effort)
    const thumb = await mtShrink(file, 360, 0.7);
    if (thumb) await put(mtThumbPath(path), thumb, 'image/jpeg');
  }
  const row = {
    id, case_id: c.id, doc_type: v.type, file_path: path,
    file_name: String(file.name || (img ? 'Photo.jpg' : 'Document')).slice(0, 180),
    amount: v.type === 'rechnung' ? v.amount : null, doc_date: v.date || null,
    ...(extra || {}),
  };
  const ins = await mtTry(() => sb.from('maint_docs').insert(row));
  if (ins.error) {
    console.error('[maintenance] document row failed:', ins.error);
    try { await store.remove([path, mtThumbPath(path)]); } catch (e) {}
    return false;
  }
  MT.docs.push({ ...row, created_at: new Date().toISOString() });
  return true;
}

/* Fix a file: Type / Betrag / date */
async function mtFixSave() {
  const s = MT.sel, d = s && MT.docs.find(x => String(x.id) === String(s.fix));
  if (!d) return;
  const v = mtReadDocForm('mtX');
  if (!v) return;
  const before = { doc_type: d.doc_type, amount: d.amount, doc_date: d.doc_date };
  const patch = { doc_type: v.type, amount: v.type === 'rechnung' ? v.amount : null, doc_date: v.date };
  Object.assign(d, patch);
  s.fix = null;
  mtRefresh(d.case_id);
  const r = await mtTry(() => _ctlSupa.from('maint_docs').update(patch).eq('id', d.id));
  if (!r.error) return;
  console.error('[maintenance] document change failed:', r.error);
  Object.assign(d, before);
  if (MT.sel && String(MT.sel.id) === String(d.case_id)) { MT.sel.docEdit = true; MT.sel.fix = String(d.id); }
  mtRefresh(d.case_id);
  mtSay('Not saved. Check the connection and save again.');
}

async function mtDelDoc(id) {
  const d = MT.docs.find(x => String(x.id) === String(id));
  if (!d) return;
  const label = d.doc_type === 'photo' ? 'photo' : MT_DOC[d.doc_type].label;
  const ok = await mtConfirm({ title: `Delete this ${label}?`, text: `${d.file_name || label} will be deleted for good.`, ok: 'Delete', danger: true });
  if (!ok) return;
  const idx = MT.docs.indexOf(d);
  MT.docs.splice(idx, 1);
  // nothing left to edit (D39, bug 23: the same list edit mode shows — receipt files and photos don't count)
  if (MT.sel && String(MT.sel.id) === String(d.case_id) && !mtCaseDocs(d.case_id).some(x => x.doc_type !== 'photo')) { MT.sel.docEdit = false; MT.sel.fix = null; }
  mtRefresh(d.case_id);
  const sb = _ctlSupa;
  const r = await mtTry(() => sb.from('maint_docs').delete().eq('id', d.id));
  if (r.error) {
    console.error('[maintenance] document delete failed:', r.error);
    MT.docs.splice(idx, 0, d);
    mtRefresh(d.case_id);
    mtSay('Not deleted. Check the connection and try again.');
    return;
  }
  try { await sb.storage.from(MT_BUCKET).remove(mtFilesOf(d)); } catch (e) { console.warn('[maintenance] file not removed:', e); }
}

/* ── Costs (D1 + D2) ──────────────────────────────────────────
   One row = one receipt / invoice: Receipt no. · Description · Brand / Provider ·
   Amount · Date · Photos. Grouped Self-bought / Provider. A tap on a row opens it
   in place (one form at a time); its photos / PDFs are added in the form and
   stored on Save.
   D2 · A return is its own row (return_of = its receipt): own slip no., date,
   amount and photo, shown under its receipt, then the receipt's Net. It can't be
   more than what is left of the receipt, nor before the receipt's date.
   D2 · A receipt / slip no. that is already used anywhere → asks before saving. */
const mtCostsOf = caseId => MT.costs.filter(r => String(r.case_id) === String(caseId));
const mtCostFiles = costId => MT.docs.filter(d => String(d.cost_id) === String(costId));
const mtCostById = id => MT.costs.find(x => String(x.id) === String(id)) || null;
const mtReturnsOf = id => MT.costs.filter(x => String(x.return_of) === String(id)).sort(mtCostByDate);
const mtCostByDate = (a, b) => String(a.cost_date || '').localeCompare(String(b.cost_date || '')) ||
                               String(a.created_at || '').localeCompare(String(b.created_at || ''));

/* ── D29 · Automatic numbers (replace the typed "No.") ──────────────────────
   Case     R (Renovierung) / S (Schaden) + running number per property and start year,
            by start date, then the order entered                      → R1, R2 … · S1, S2 …
   Receipt  the case's number + .n by receipt date, then order entered  → R1.1, R1.2 …
   Return   its receipt's number + .n                                   → R1.2.1
   Nothing is typed or stored: the numbers follow the dates, so a forgotten older receipt
   moves the later ones. Sort key = [start year, case, receipt, return].              */
const mtEnteredKey = x => String(x.created_at || '9999') + '|' + String(x.id);          // new rows (no created_at yet) last
const mtByDateThen = f => (a, b) => String(f(a) || '').localeCompare(String(f(b) || '')) || mtEnteredKey(a).localeCompare(mtEnteredKey(b));
let _mtNoSig = '', _mtNo = null;
function mtNumbers() {
  const sig = MT.cases.map(c => [c.id, c.case_date, c.property_id, c.kind].join('~')).join('|') + '#' +
              MT.costs.map(r => [r.id, r.case_id, r.return_of || '', r.cost_date].join('~')).join('|');
  if (_mtNo && sig === _mtNoSig) return _mtNo;
  const cases = new Map(), costs = new Map(), groups = new Map();
  for (const c of MT.cases) {
    const k = [c.property_id || c.property_name || '', String(c.case_date || '').slice(0, 4), c.kind].join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  for (const list of groups.values()) {
    list.sort(mtByDateThen(c => c.case_date));
    list.forEach((c, i) => {
      const year = String(c.case_date || '').slice(0, 4);
      cases.set(String(c.id), { no: (MT_NO_LETTER[c.kind] || 'R') + (i + 1), year, key: [Number(year) || 0, i + 1] });
    });
  }
  for (const c of MT.cases) {
    const cn = cases.get(String(c.id));
    const rows = MT.costs.filter(r => String(r.case_id) === String(c.id));
    rows.filter(r => !r.return_of).sort(mtByDateThen(r => r.cost_date)).forEach((r, i) => {
      const no = cn.no + '.' + (i + 1);
      costs.set(String(r.id), { no, key: cn.key.concat([i + 1, 0]) });
      rows.filter(x => String(x.return_of) === String(r.id)).sort(mtByDateThen(x => x.cost_date)).forEach((x, j) =>
        costs.set(String(x.id), { no: no + '.' + (j + 1), key: cn.key.concat([i + 1, j + 1]) }));
    });
  }
  _mtNoSig = sig; _mtNo = { cases, costs };
  return _mtNo;
}
const mtCaseNo = c => { const n = c && mtNumbers().cases.get(String(c.id)); return n ? n.no : ''; };
const mtCaseLabel = c => { const n = c && mtNumbers().cases.get(String(c.id)); return n ? n.no + (n.year ? ' · ' + n.year : '') : ''; };   // S2 · 2026
const mtCostNo = id => { const n = mtNumbers().costs.get(String(id)); return n ? n.no : ''; };
const mtNoCmp = (a, b) => {                                   // number order (= date order inside a case)
  const x = (mtNumbers().costs.get(String(a.id)) || { key: [] }).key, y = (mtNumbers().costs.get(String(b.id)) || { key: [] }).key;
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
};
const mtCaseCmp = (a, b) => {
  const x = (mtNumbers().cases.get(String(a.id)) || { key: [] }).key, y = (mtNumbers().cases.get(String(b.id)) || { key: [] }).key;
  return (x[0] || 0) - (y[0] || 0) || (x[1] || 0) - (y[1] || 0);
};
/* what the receipt PDF shows on top: "Nr. R1.2 · 2026 · Kaiserstr. WHG 507" */
function mtNoLabel(costId) {
  const r = mtCostById(costId), c = r ? mtCase(r.case_id) : null, n = c && mtNumbers().cases.get(String(c.id));
  const no = mtCostNo(costId);
  return no ? [no, n && n.year, c && (mtIsCasa(c.property_id) ? 'Casa Castel' : mtPropName(c))].filter(Boolean).join(' \u00b7 ') : '';
}
const mtNum = n => Math.round((Number(n) || 0) * 100) / 100;
const mtNeg = n => '\u2212' + mtEur(n);                      // −30,00 €

function mtCostsHTML(c) {
  const s = MT.sel;
  const rows = mtCostsOf(c.id);
  const busy = !!(s.docEdit || s.add || s.fix);            // another part of the panel is being changed
  const upAny = mtUpFor(c), up = upAny && upAny.where === 'costs' ? upAny : null;
  const tap = !busy && !upAny;                             // D39: a receipt / Edit pop-up leaves the list as it is (behind it, inert)
  // D38 · Kosten + its sum · "+ Receipt" · a switch All / Self-bought / Provider · 6 lines, then "Show all"
  let h = `<section class="mt-costs" id="mtCosts">
    <div class="mt-ks"><span class="mt-ks__l"><b>Kosten</b><em>${mtEur(mtCost([c.id]))}</em></span>
      ${tap ? '<button type="button" class="mt-ks__new" data-mt="costNew" data-k="self"><i class="ti ti-plus" aria-hidden="true"></i>Receipt</button>' : ''}</div>`;
  if (up) h += `<p class="mt-up" role="status"><span class="mt-spin" aria-hidden="true"></span>${up.what ? mtEsc(up.what) + ' · ' : 'Uploading '}${Math.min(up.done + 1, up.total)} of ${up.total}</p>`;
  if (!rows.length) return h + '<p class="mt-docs-empty">No receipts yet.</p></section>';
  const main = rows.filter(r => !r.return_of);
  const kinds = Object.keys(MT_COST).filter(k => main.some(r => r.kind === k));
  const g = kinds.length > 1 && MT_COST[MT.cgrp] && kinds.includes(MT.cgrp) ? MT.cgrp : 'all';
  if (kinds.length > 1) h += `<div class="mt-cgs" role="group" aria-label="Show">
      <button type="button" class="mt-cgs__b${g === 'all' ? ' is-on' : ''}" data-mt="cgrp" data-v="all" aria-pressed="${g === 'all'}">All ${main.length}</button>
      ${kinds.map(k => `<button type="button" class="mt-cgs__b${g === k ? ' is-on' : ''}" data-mt="cgrp" data-v="${k}" aria-pressed="${g === k}">${MT_COST[k].label} ${main.filter(r => r.kind === k).length}</button>`).join('')}
    </div>`;
  const list = main.filter(r => g === 'all' || r.kind === g).sort((a, b) => mtCostByDate(b, a));   // newest first
  const all = !!(MT.cAll && MT.cAll[c.id]), LIM = 6, shown = all ? list : list.slice(0, LIM);
  h += '<div class="mt-cl">' + shown.map(r => {
    const rets = mtReturnsOf(r.id);
    let x = mtCostRowHTML(r, tap);
    rets.forEach(t => { x += mtCostRowHTML(t, tap); });
    if (rets.length) x += `<div class="mt-net"><span>Net</span><b>${mtEur(mtNum(r.amount) - rets.reduce((a, t) => a + mtNum(t.amount), 0))}</b></div>`;
    return x;
  }).join('') + '</div>';
  if (list.length > LIM) h += `<button type="button" class="mt-link mt-cl__all" data-mt="cAll" data-id="${mtEsc(c.id)}">${all ? 'Show less' : 'Show all ' + list.length}</button>`;
  return h + '</section>';
}


function mtCostRowHTML(r, tap) {
  const n = mtCostFiles(r.id).length, ret = !!r.return_of;
  const parent = ret ? mtCostById(r.return_of) : null;
  const off = ret ? !!parent && parent.book_ctrl === false : r.book_ctrl === false;
  // D28: the row shows only the No. (bold) + the description — the receipt / order no. only inside the receipt
  const own = mtCostNo(r.id);                                 // D29: automatic
  const no = (ret ? '<i class="ti ti-corner-down-right" aria-hidden="true"></i>' : '') + (own ? `<b>${mtEsc(own)}</b>` : '');
  const desc = ret ? (r.description ? 'Return · ' + r.description : 'Return')
                   : (r.description || r.receipt_no || '—');      // no description → its receipt / order no., never an empty row
  // D39 · two taps per receipt: the row (an invisible button over it, like the list rows) = edit the receipt · the
  // "Who pays" tag under the amount (Casa Castel receipts) = its own button. The tag sits beside the row button, not in it.
  const who = !ret && mtWhoOn(mtCase(r.case_id));
  const amt = ret ? mtNeg(r.amount) : mtEur(r.amount);
  const name = [ret ? 'Return' : 'Receipt', own, desc, amt, ret ? '' : r.brand, mtDate(r.cost_date)].filter(Boolean).join(' · ');
  const files = `<span class="mt-cr__f">${n ? `<i class="ti ti-paperclip" aria-hidden="true"></i>${n}` : ret ? '' : '<span class="mt-nofile">no file</span>'}</span>`;
  return `<div class="mt-cr${ret ? ' mt-cr--ret' : ''}${who ? ' has-who' : ''}" data-mt="${tap ? 'costEdit' : 'none'}" data-id="${mtEsc(r.id)}">
      <button type="button" class="mt-cr__hit" aria-label="${mtEsc(name)}"${tap ? '' : ' tabindex="-1" aria-disabled="true"'}></button>
      <span class="mt-cr__a"><span class="mt-cr__no"${no ? '' : ' style="margin-right:-6px"'}>${no}</span><span class="mt-cr__desc">${mtEsc(desc)}${off ? '<span class="mt-off">not in Controlling</span>' : ''}</span></span>
      <span class="mt-cr__amt">${amt}</span>
      <span class="mt-cr__b"><span class="mt-cr__who">${ret ? '' : mtEsc(r.brand || '')}</span><span class="mt-cr__date">${mtEsc(mtDate(r.cost_date))}</span>${who ? files : ''}</span>
      ${who ? mtWhoTagHTML(r, tap) : files}
    </div>`;
}

function mtCostFormHTML(f) {
  const ret = !!f.return_of, parent = ret ? mtCostById(f.return_of) : null;
  const cs = MT.sel ? mtCase(MT.sel.id) : null, caseOff = !!cs && cs.book_ctrl === false;
  const amt = f.amount === null || f.amount === undefined || f.amount === '' ? '' : String(f.amount);
  const chips = f.files.map((x, i) => `
      <span class="mt-chip${x.file ? ' is-new' : ''}">
        ${x.id ? `<button type="button" class="mt-chip__n" data-mt="openDoc" data-id="${mtEsc(x.id)}">` : '<span class="mt-chip__n">'}<i class="ti ${x.img ? 'ti-photo' : 'ti-file-text'}" aria-hidden="true"></i>${mtEsc(x.name)}${x.id ? '</button>' : '</span>'}
        <button type="button" class="mt-chip__x" data-mt="costFileDel" data-i="${i}" aria-label="Remove ${mtEsc(x.name)}"><i class="ti ti-x" aria-hidden="true"></i></button>
      </span>`).join('');
  const top = ret
    ? `<p class="mt-ret-t"><i class="ti ti-corner-down-right" aria-hidden="true"></i>Return for ${parent && parent.receipt_no ? 'Receipt ' + mtEsc(parent.receipt_no) : 'this receipt'}${parent && parent.brand ? ' · ' + mtEsc(parent.brand) : ''}</p>`
    : `<div class="mt-seg" role="group" aria-label="Type">
        ${Object.keys(MT_COST).map(k => `<button type="button" class="mt-seg__b${f.kind === k ? ' is-on' : ''}" data-mt="costKind" data-k="${k}" aria-pressed="${f.kind === k}">${MT_COST[k].label}</button>`).join('')}
      </div>`;
  const left = [
    f.isNew ? '' : `<button type="button" class="cc-foot-btn mt-del" data-mt="costDel"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button>`,
    !ret && !f.isNew ? '<button type="button" class="cc-foot-btn" data-mt="costReturn"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> Return</button>' : '',
  ].join('');
  return `<div class="mt-ab mt-cf-form${ret ? ' is-ret' : ''}" id="mtC-form" data-fid="${mtEsc(f.id)}">
      ${top}
      <div class="mt-grid">
        <div class="mt-f"><label class="mt-k" for="mtC-amount">Amount (€)</label>
          <input class="mt-in mt-in--amt" id="mtC-amount" data-cc-num="2" inputmode="decimal" autocomplete="off" value="${mtEsc(amt)}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtC-date">Date</label>
          <input class="mt-in" id="mtC-date" type="date" value="${mtEsc(f.cost_date || '')}"/></div>
        ${ret ? '' : `<div class="mt-f"><label class="mt-k" for="mtC-who" id="mtC-whoLbl">${MT_COST[f.kind].who}</label>
          <input class="mt-in" id="mtC-who" type="text" maxlength="80" autocomplete="off" value="${mtEsc(f.brand || '')}"/></div>`}
        <div class="mt-f${ret ? ' mt-f--full' : ''}"><label class="mt-k" for="mtC-desc">What</label>
          <input class="mt-in" id="mtC-desc" type="text" maxlength="160" autocomplete="off" value="${mtEsc(f.description || '')}"${ret ? ' placeholder="optional"' : ''}/></div>
        <div class="mt-f mt-f--full"><label class="mt-k" for="mtC-no">${ret ? 'Slip no.' : 'Receipt / order no.'} <span class="mt-opt">optional</span></label>
          <input class="mt-in" id="mtC-no" type="text" maxlength="60" autocomplete="off" value="${mtEsc(f.receipt_no || '')}"/></div>
        <div class="mt-f mt-f--full"><span class="mt-k">Receipt</span>
          <div class="mt-chips">${chips}
            <button type="button" class="mt-chip mt-chip--add" data-mt="costFile"><i class="ti ti-upload" aria-hidden="true"></i> Photo / PDF</button>
            ${f.files.some(x => x.file && x.img) ? `<button type="button" class="mt-chip mt-chip--add mt-chip--next" data-mt="costCam"><i class="ti ti-plus" aria-hidden="true"></i> Next part</button>` : ''}
          </div>${f.files.filter(x => x.file && x.img).length > 1 ? '<p class="mt-hint">The photos go onto one page, top to bottom, when you save.</p>'
            : f.files.some(x => x.file && x.img) ? '<p class="mt-hint">Long receipt? “Next part” adds the next photo — all parts go onto one page.</p>' : ''}</div>
        ${ret ? '' : `<div class="mt-f mt-f--full">${caseOff
          ? '<p class="mt-hint">Run MAINTENANCE-D14.sql once, then each receipt has its own switch.</p>'
          : `<label class="mt-chk mt-sw"><span>Book in Controlling</span><input type="checkbox" role="switch" id="mtC-book"${f.book_ctrl === false ? '' : ' checked'}/></label>`}</div>`}
        ${!ret && mtWhoOn(cs) ? `<div class="mt-f mt-f--full" id="mtC-whobox">${mtCostWhoRowHTML(f)}</div>` : ''}
        ${!f.isNew && mtCostById(f.id) && mtCostById(f.id).link_ot && !caseOff ? '<p class="mt-hint mt-f--full">Linked to the line you typed in Controlling — it counts once.</p>' : ''}
      </div>
      <div class="cc-sec-foot">
        ${left ? `<span class="is-left mt-foot-l">${left}</span>` : ''}
        <span class="cc-foot-right">
          <button type="button" class="cc-foot-btn" data-mt="costCancel">Cancel</button>
          ${f.isNew && !ret ? '<button type="button" class="cc-foot-btn mt-save-next" data-mt="costSaveNext">Save + next</button>' : ''}
          <button type="button" class="cc-foot-btn mt-save" data-mt="costSave">Save</button>
        </span>
      </div>
    </div>`;
}

/* What is typed in the open cost form → its state (so a redraw keeps it) */
function mtCostCapture() {
  const f = MT.sel && MT.sel.cost, el = document.getElementById('mtC-form');
  if (!f || !el || el.dataset.fid !== String(f.id)) return;   // only the form that is showing (not a new return's)
  const g = id => document.getElementById(id);
  f.receipt_no = g('mtC-no').value;
  f.description = g('mtC-desc').value;
  if (g('mtC-who')) f.brand = g('mtC-who').value;
  f.amount = g('mtC-amount').value;                         // "1250.5" (German field) or ''
  f.cost_date = g('mtC-date').value || '';
  if (g('mtC-book')) f.book_ctrl = g('mtC-book').checked;
}
const mtCostSnapOf = f => JSON.stringify([f.kind, f.own_no || '', f.receipt_no || '', f.description || '', f.brand || '', mtAmtKey(f.amount), f.cost_date || '',
  f.book_ctrl !== false, f.files.map(x => x.id || x.name).join('|'), mtWhoKey(f)]);   // D39: + Who pays (set in its sheet, stored with Save)
/* D39 · 12.50 (stored) = "12.5" (the field) — Cancel now asks when something changed, so an untouched receipt must count as unchanged */
const mtAmtKey = v => (v === null || v === undefined || v === '' ? '' : isFinite(Number(v)) ? String(Math.round(Number(v) * 100) / 100) : String(v));
function mtCostChanged() {
  const f = MT.sel && MT.sel.cost;
  if (!f) return false;
  mtCostCapture();
  return mtCostSnapOf(f) !== f.snap;
}
const mtCostFilesOf = id => mtCostFiles(id).map(d => ({ id: d.id, name: d.file_name || 'File', img: !!d.file_path && /\.(jpe?g|png|webp|heic|gif)$/i.test(d.file_path) }));

/* D14 · Controlling is switched per receipt; a new receipt starts like the last one you saved in this entry */
function mtLastBook(c) {
  const last = MT.costs.filter(r => String(r.case_id) === String(c.id) && !r.return_of)
    .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))[0];
  return last ? last.book_ctrl !== false : true;
}
/* An empty new receipt of this entry (its snapshot = "nothing typed yet") */
function mtCostBlank(c, kind) {
  const f = { isNew: true, id: mtUuid(), kind: MT_COST[kind] ? kind : 'self', return_of: null, own_no: '', receipt_no: '', description: '', brand: '',
    amount: '', cost_date: ccTodayISO(), book_ctrl: mtLastBook(c), files: [], delIds: [], ...mtWhoPick({}) };   // D39: Who pays empty (= you pay; Save + next never carries it)
  f.snap = mtCostSnapOf(f);
  return f;
}
/* D39 (bug 11) · on a laptop the first field of the form gets the cursor (the old own-No. field is gone since D29) */
const mtCostFocus = () => { if (mtFine()) document.getElementById('mtC-amount')?.focus({ preventScroll: true }); };
function mtCostNew(kind) {
  const c = mtOpenCase();
  if (!c) return;
  if (MT.busy) { mtBusySay(); return; }                      // D39 (bugs 15/19)
  if (mtActive(c)) return;
  MT.sel.cost = mtCostBlank(c, kind);
  mtRenderPanel();
  mtCostFocus();
}
function mtCostEdit(id) {
  const c = mtOpenCase(), r = mtCostById(id);
  if (!c || !r) return;
  if (MT.busy) { mtBusySay(); return; }                      // D39 (bugs 15/19)
  if (mtActive(c)) return;
  MT.sel.cost = { isNew: false, id: r.id, kind: r.kind, return_of: r.return_of || null, own_no: r.own_no || '', receipt_no: r.receipt_no || '', description: r.description || '',
    brand: r.brand || '', amount: r.amount ?? '', cost_date: r.cost_date || '', book_ctrl: r.book_ctrl !== false, delIds: [], files: mtCostFilesOf(r.id),
    ...(r.return_of ? {} : mtWhoPick(r)) };                  // D39: Who pays (a return has none — it follows its receipt)
  MT.sel.cost.snap = mtCostSnapOf(MT.sel.cost);
  const lost = MT.lost[r.id];                                // D39 (bug 14): photos whose upload failed come back here
  if (lost && lost.length) { MT.sel.cost.files.push(...lost); delete MT.lost[r.id]; }   // after the snapshot → Save stores them, Cancel asks
  mtRenderPanel();
}
/* "+ Return" in a receipt's form → a new return under that receipt */
async function mtCostNewReturn() {
  const f = MT.sel && MT.sel.cost;
  if (!f || f.isNew || f.return_of) return;
  if (mtCostChanged()) {
    const ok = await mtConfirm({ title: 'Discard your changes?', text: 'What you changed in this receipt is not saved.', ok: 'Discard', cancel: 'Keep editing', danger: true });
    if (!ok) return;
  }
  const r = mtCostById(f.id);
  if (!r || !MT.sel) return;
  MT.sel.cost = { isNew: true, id: mtUuid(), kind: r.kind, return_of: r.id, own_no: '', receipt_no: '', description: '', brand: '',
    amount: '', cost_date: ccTodayISO() < String(r.cost_date || '') ? r.cost_date : ccTodayISO(), files: [], delIds: [] };
  MT.sel.cost.snap = mtCostSnapOf(MT.sel.cost);
  mtRenderPanel();                                            // the same pop-up shows the return (D39: no new slide-in)
  mtCostFocus();
}
function mtCostKind(kind) {
  const f = MT.sel && MT.sel.cost;
  if (!f || f.return_of || !MT_COST[kind]) return;
  f.kind = kind;
  document.querySelectorAll('#mtC-form .mt-seg__b').forEach(b => { const on = b.dataset.k === kind; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
  const l = document.getElementById('mtC-whoLbl');
  if (l) l.textContent = MT_COST[kind].who;
}
function mtCostPickFiles() {
  const f = MT.sel && MT.sel.cost;
  if (!f) return;
  mtFileInput('mtCostInput', 'image/*,application/pdf', true, files => {
    const g = MT.sel && MT.sel.cost;
    if (!g) return;
    const ok = files.filter(x => (mtIsImage(x) || mtIsPdf(x)) && x.size <= MT_MAX_MB * 1024 * 1024);
    if (ok.length < files.length) mtSay(`Only photos and PDFs up to ${MT_MAX_MB} MB.`);
    mtCostCapture();
    ok.forEach(x => g.files.push({ id: null, file: x, name: x.name || (mtIsImage(x) ? 'Photo.jpg' : 'Document.pdf'), img: mtIsImage(x) }));
    mtRenderPanel();
  });
}
/* ── D33 (Nov 2026) · Camera for receipts: several photos in a row, the camera stays open ──
   A long receipt in 2–3 parts: snap, snap, snap → Done. The parts are added to the receipt in the
   order taken (× on a thumbnail takes one off). When the live camera isn't possible (no permission,
   older phone) the same screen uses the phone's own camera, one photo per tap, and stays open. */
const MT_CAM = { open: false, stream: null, shots: [], base: 0 };   // base = photos already in the receipt (part numbers go on)
function mtCamCss() {
  if (document.getElementById('mt-cam-css')) return;
  const st = document.createElement('style'); st.id = 'mt-cam-css';
  st.textContent = `
.mt-cam { position:fixed; inset:0; z-index:900; display:flex; flex-direction:column; background:#14110F; color:#fff; }
.mt-cam__top { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:calc(10px + env(safe-area-inset-top, 0px)) 16px 10px; }
.mt-cam__ttl { font-size:13px; font-weight:500; letter-spacing:.02em; }
.mt-cam__x { width:40px; height:40px; border-radius:50%; border:none; background:rgba(255,255,255,.14); color:#fff; font-size:16px; display:flex; align-items:center; justify-content:center; }
.mt-cam__view { flex:1; min-height:0; position:relative; display:flex; align-items:center; justify-content:center; }
.mt-cam__view video { width:100%; height:100%; object-fit:contain; display:block; }
.mt-cam__alt { padding:24px; text-align:center; font-size:14px; line-height:1.5; color:rgba(255,255,255,.8); }
.mt-cam__flash { position:absolute; inset:0; background:#fff; opacity:0; pointer-events:none; transition:opacity .25s; }
.mt-cam__flash.on { opacity:.7; transition:none; }
.mt-cam__strip { display:flex; gap:8px; overflow-x:auto; padding:10px 16px 0; min-height:84px; -webkit-overflow-scrolling:touch; }
.mt-cam__th { position:relative; flex:0 0 auto; width:58px; height:74px; border-radius:6px; overflow:hidden; background:#2A2521; }
.mt-cam__th img { width:100%; height:100%; object-fit:cover; display:block; }
.mt-cam__th b { position:absolute; left:4px; bottom:3px; font-size:10px; font-weight:600; text-shadow:0 1px 2px #000; }
.mt-cam__th button { position:absolute; top:2px; right:2px; width:24px; height:24px; border-radius:50%; border:none; background:rgba(0,0,0,.6); color:#fff; font-size:12px; display:flex; align-items:center; justify-content:center; }
.mt-cam__hint { margin:0; padding:6px 16px 0; font-size:11.5px; color:rgba(255,255,255,.6); min-height:16px; }
.mt-cam__bar { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:12px; padding:12px 20px calc(16px + env(safe-area-inset-bottom, 0px)); }
.mt-cam__shut { width:74px; height:74px; border-radius:50%; border:4px solid #fff; background:none; padding:5px; -webkit-tap-highlight-color:transparent; }
.mt-cam__shut span { display:block; width:100%; height:100%; border-radius:50%; background:#fff; }
.mt-cam__shut:active span { transform:scale(.9); }
.mt-cam__done { justify-self:end; height:48px; min-width:110px; padding:0 18px; border-radius:24px; border:none; background:#fff; color:#14110F; font:inherit; font-size:15px; font-weight:600; }
.mt-cam__done:disabled { opacity:.35; }
.mt-cam__cancel { justify-self:start; height:44px; padding:0 14px; border-radius:22px; border:.5px solid rgba(255,255,255,.35); background:none; color:#fff; font:inherit; font-size:14px; }`;
  document.head.appendChild(st);
}
async function mtCamOpen() {
  const f = MT.sel && MT.sel.cost;
  if (!f || MT_CAM.open) return;
  mtCostCapture();
  mtCamCss();
  MT_CAM.open = true; MT_CAM.shots = []; MT_CAM.base = f.files.filter(x => x.file && x.img).length;
  const el = document.createElement('div');
  el.className = 'mt-cam'; el.id = 'mtCam'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Receipt camera');
  el.innerHTML = `<div class="mt-cam__top"><span class="mt-cam__ttl">Receipt · next parts</span>
      <button type="button" class="mt-cam__x" data-cam="cancel" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>
    <div class="mt-cam__view"><video playsinline webkit-playsinline muted autoplay></video><div class="mt-cam__flash"></div></div>
    <div class="mt-cam__strip" aria-label="Photos taken"></div>
    <p class="mt-cam__hint">A long receipt: photograph it in parts, top to bottom.</p>
    <div class="mt-cam__bar">
      <button type="button" class="mt-cam__cancel" data-cam="cancel">Cancel</button>
      <button type="button" class="mt-cam__shut" data-cam="snap" aria-label="Take photo"><span></span></button>
      <button type="button" class="mt-cam__done" data-cam="done" disabled>Done</button>
    </div>`;
  document.body.appendChild(el);
  mtLockSync();                                           // D39: the page behind stays where it is
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-cam]'); if (!b) return;
    const a = b.dataset.cam;
    if (a === 'snap') mtCamSnap();
    else if (a === 'done') mtCamClose(true);
    else if (a === 'cancel') mtCamClose(false);
    else if (a === 'del') { MT_CAM.shots.splice(Number(b.dataset.i), 1); mtCamDraw(); }
  });
  const v = el.querySelector('video');
  try {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) throw new Error('no camera api');
    MT_CAM.stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } } });
    if (!MT_CAM.open) { mtCamStop(); return; }
    v.srcObject = MT_CAM.stream;
    const pl = v.play(); if (pl && pl.catch) pl.catch(() => {});
  } catch (e) {
    MT_CAM.stream = null;                                 // the phone's own camera, one photo per tap — this screen stays open
    el.querySelector('.mt-cam__view').innerHTML = '<p class="mt-cam__alt">Tap the white button for each part of the receipt.<br>Your phone\'s camera opens for one photo and comes back here.</p>';
  }
  mtCamDraw();
}
function mtCamStop() { try { if (MT_CAM.stream) MT_CAM.stream.getTracks().forEach(t => t.stop()); } catch (e) {} MT_CAM.stream = null; }
async function mtCamSnap() {
  const el = document.getElementById('mtCam'); if (!el) return;
  const v = el.querySelector('video');
  if (!MT_CAM.stream || !v || !v.videoWidth) {          // fallback: the phone's own camera
    let inp = document.getElementById('mtCamInput');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'file'; inp.id = 'mtCamInput'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment');
      inp.style.display = 'none'; inp.setAttribute('aria-hidden', 'true');
      inp.addEventListener('change', () => { const x = inp.files && inp.files[0]; inp.value = ''; if (x && MT_CAM.open) { MT_CAM.shots.push(x); mtCamDraw(); } });
      document.body.appendChild(inp);
    }
    inp.value = ''; inp.click();
    return;
  }
  const max = 2000, k = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
  const cv = document.createElement('canvas'); cv.width = Math.round(v.videoWidth * k); cv.height = Math.round(v.videoHeight * k);
  cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
  const fl = el.querySelector('.mt-cam__flash'); if (fl) { fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 60); }
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.88));
  if (!blob || !MT_CAM.open) return;
  MT_CAM.shots.push(new File([blob], 'Teil ' + (MT_CAM.base + MT_CAM.shots.length + 1) + '.jpg', { type: 'image/jpeg' }));
  mtCamDraw();
}
function mtCamDraw() {
  const el = document.getElementById('mtCam'); if (!el) return;
  const strip = el.querySelector('.mt-cam__strip');
  (strip._urls || []).forEach(u => URL.revokeObjectURL(u));
  strip._urls = MT_CAM.shots.map(x => URL.createObjectURL(x));
  const b0 = MT_CAM.base;
  strip.innerHTML = MT_CAM.shots.map((x, i) => `<div class="mt-cam__th"><img src="${strip._urls[i]}" alt="Part ${b0 + i + 1}"/><b>${b0 + i + 1}</b>
      <button type="button" data-cam="del" data-i="${i}" aria-label="Remove part ${b0 + i + 1}"><i class="ti ti-x" aria-hidden="true"></i></button></div>`).join('');
  strip.scrollLeft = strip.scrollWidth;
  const n = MT_CAM.shots.length, done = el.querySelector('[data-cam="done"]');
  done.disabled = !n; done.textContent = n ? 'Done · ' + n : 'Done';
  const tot = b0 + n;
  el.querySelector('.mt-cam__hint').textContent = n ? 'Part ' + tot + ' taken — the next part, or Done. All parts go onto one page, top to bottom.'
    : 'Photograph part ' + (b0 + 1) + ' — the camera stays open for more.';
}
function mtCamClose(keep) {
  const el = document.getElementById('mtCam');
  const shots = MT_CAM.shots.slice();
  MT_CAM.open = false; MT_CAM.shots = [];
  mtCamStop();
  if (el) { (el.querySelector('.mt-cam__strip')._urls || []).forEach(u => URL.revokeObjectURL(u)); el.remove(); }
  mtLockSync();                                           // D39: the receipt pop-up below still holds the page
  const g = MT.sel && MT.sel.cost;
  if (!keep || !g || !shots.length) return;
  shots.forEach(x => g.files.push({ id: null, file: x, name: x.name, img: true }));
  mtRenderPanel();
}

function mtCostFileDel(i) {
  const f = MT.sel && MT.sel.cost;
  if (!f || !f.files[i]) return;
  mtCostCapture();
  const [x] = f.files.splice(i, 1);
  if (x.id && !x.adopt) f.delIds.push(x.id);                 // a moved document stays a document when taken off
  mtRenderPanel();
}
/* D39 (bugs 6/18) · ×, a tap beside the pop-up, Escape and Cancel ask before typed data (and photos) go — like Edit.
   "Keep editing" leaves the form and its device draft alone. */
async function mtCostCancel() {
  const f = MT.sel && MT.sel.cost;
  if (!f || MT.costHold === f || MT.who) return;             // being saved ("Save + next") · D39: Who pays is open on top
  if (document.querySelector('#mtCostModal .mt-askv')) return;   // it is asking already (a second tap beside it)
  if (mtCostChanged()) {
    const ok = await mtConfirm({
      title: f.isNew ? (f.return_of ? 'Discard this return?' : 'Discard this receipt?') : 'Discard your changes?',
      text: f.isNew ? (f.files.length ? 'What you typed and the photos are not saved.' : 'What you typed is not saved.') : 'What you changed in this receipt is not saved.',
      ok: 'Discard', cancel: 'Keep editing', danger: true });
    if (!ok || !MT.sel || MT.sel.cost !== f) return;
  }
  MT.sel.cost = null;
  mtRefresh(MT.sel.id);                                      // the entry where it was (place kept)
}

/* D8 · Controlling lines you typed by hand that may be this receipt / return:
   same property, same amount to the cent, ±7 days, not from Maintenance or Settlements */
const MT_CTRL_SKIP = ['Versorger', 'Kaufnebenkosten', 'Hausgeldabrechnung', 'NK-Abrechnung'];
const mtAddDays = (iso, n) => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
async function mtCtrlMatches(pid, amount, day, isRet) {
  try {
    const r = await _ctlSupa.from('ctrl_expense_one_time')
      .select('id,item,company,amount,invoice_date,direction,kind,source_ref,maint_cost_id')
      .eq('property_id', pid).is('maint_cost_id', null)
      .gte('invoice_date', mtAddDays(day, -7)).lte('invoice_date', mtAddDays(day, 7));
    if (r.error) return [];
    const far = o => Math.abs(Date.parse(String(o.invoice_date).slice(0, 10)) - Date.parse(day));
    return (r.data || []).filter(o => Math.abs((Number(o.amount) || 0) - amount) < 0.005
        && !/^(maint|abr):/.test(String(o.source_ref || '')) && !MT_CTRL_SKIP.includes(o.kind)
        && (isRet ? Number(o.direction) === 1 : Number(o.direction) !== 1))
      .sort((a, b) => far(a) - far(b)).slice(0, 2);
  } catch (e) { return []; }
}
/* Is this cost row booked in Controlling? (entry switch · its own / its receipt's switch · amount · property) */
function mtBooked(r) {
  const c = mtCase(r.case_id);
  if (!c || c.book_ctrl === false || !(Number(r.amount) > 0) || !mtProp(c.property_id)) return false;
  if (!r.return_of) return r.book_ctrl !== false;
  const p = mtCostById(r.return_of);
  return !!p && p.book_ctrl !== false;
}
/* "… Its 2 lines in Controlling go too — a line you linked comes back as you typed it." */
function mtCtrlNote(rows) {
  const b = rows.filter(mtBooked), n = b.length;
  if (!n) return '';
  const linked = b.some(r => r.link_ot);
  return ` ${n === 1 ? 'Its line' : 'Its ' + n + ' lines'} in Controlling ${n === 1 ? 'goes' : 'go'} too${linked ? ' — a line you linked comes back as you typed it' : ''}.`;
}

/* D27 · your No. already used (anywhere) → where */
function mtOwnDupOf(no, selfId) {
  const k = String(no || '').trim().toLowerCase();
  if (!k) return null;
  const d = MT.costs.find(r => String(r.id) !== String(selfId) && String(r.own_no || '').trim().toLowerCase() === k);
  if (!d) return null;
  const c = mtCase(d.case_id);
  return { row: d, where: c ? `“${c.title}” (${mtPropName(c)})` : 'another entry', same: MT.sel && String(d.case_id) === String(MT.sel.id) };
}
/* Receipt / slip no. already used (anywhere) → where */
function mtDupOf(no, selfId) {
  const k = String(no || '').trim().toLowerCase();
  if (!k) return null;
  const d = MT.costs.find(r => String(r.id) !== String(selfId) && String(r.receipt_no || '').trim().toLowerCase() === k);
  if (!d) return null;
  const c = mtCase(d.case_id);
  return { row: d, where: c ? `“${c.title}” (${mtPropName(c)})` : 'another entry', same: MT.sel && String(d.case_id) === String(MT.sel.id) };
}

/* D36 · "Save + next": saves this receipt, then the next empty one opens for the same entry —
   Shop, Date, Self-bought / Provider and "Book in Controlling" carried over (often the same for a batch)
   D39 (bugs 2/13) · the pop-up stays: "Saving …" while the row is stored, then the next form appears in the same
   sheet (no close, no new slide-in, full height kept); its photos upload in the background. */
async function mtCostSaveNext() {
  const f = MT.sel && MT.sel.cost, c = MT.sel && !MT.sel.isNew ? mtCase(MT.sel.id) : null;
  if (!f || !c || !f.isNew || f.return_of || MT.costHold || MT.who) return;   // D39: not while Who pays is open on top
  mtCostCapture();
  const keep = { kind: f.kind, brand: f.brand || '', cost_date: f.cost_date || '', book_ctrl: f.book_ctrl };
  await mtCostSave({ next: () => {
    const g = mtCostBlank(c, keep.kind);
    g.brand = keep.brand;
    if (keep.cost_date) g.cost_date = keep.cost_date;
    if (keep.book_ctrl !== undefined) g.book_ctrl = keep.book_ctrl;
    g.snap = mtCostSnapOf(g);                                 // carried-over values don't count as a change (Cancel asks nothing)
    return g;
  } });
}
/* D39 · "Save + next" holds its form while the row is stored: the form can't be changed, the buttons wait */
function mtCostHold(f) { MT.costHold = f || null; mtCostHoldShow(); }
function mtCostHoldShow() {
  const m = document.getElementById('mtCostModal');
  if (!m) return;
  const on = !!(MT.costHold && MT.sel && MT.sel.cost === MT.costHold);
  m.classList.toggle('is-saving', on);
  m.querySelectorAll('.mt-modal__f .cc-foot-btn, .mt-modal__x').forEach(x => { x.disabled = on; });
  const n = m.querySelector('[data-mt="costSaveNext"]');
  if (n) n.innerHTML = on ? '<span class="mt-spin" aria-hidden="true"></span>Saving …' : 'Save + next';
}
let mtChkFor = null;                                          // D39 (bug 12): the receipt whose Controlling check runs — not on the form, so a draft never keeps it
/* Save the open receipt / return. opts.next (Save + next): a function that gives the next form → it opens in the same
   pop-up once the row is stored. Returns true when the row is stored. */
async function mtCostSave(opts) {
  const s = MT.sel, f = s && s.cost, c = s && !s.isNew ? mtCase(s.id) : null;
  if (!f || !c || MT.costHold || MT.who) return false;       // D39: not while Who pays is open on top (its choice would be lost)
  if (MT.busy) { mtBusySay(); return false; }                // D39 (bug 19): say why nothing happens
  mtCostCapture();
  const g = id => document.getElementById(id);
  const fail = (id, msg) => { const el = g(id); if (el) { el.setAttribute('aria-invalid', 'true'); if (!el.classList.contains('cc-cal')) el.focus(); } mtSay(msg); return false; };
  const ret = !!f.return_of, parent = ret ? mtCostById(f.return_of) : null;
  if (ret && !parent) { mtSay('The receipt of this return was deleted.'); f.return_of = null; return false; }
  const amount = f.amount === '' || !isFinite(Number(f.amount)) ? null : mtNum(f.amount);
  if (!ret && !String(f.receipt_no).trim() && !String(f.description).trim()) return fail('mtC-no', 'Enter the receipt no. or a description.');
  if (amount === null || amount < 0 || (ret && amount <= 0)) return fail('mtC-amount', 'Enter the amount.');
  if (!f.cost_date) return fail('mtC-date', mtNativeVal(g('mtC-date')).trim() ? 'Check the date (TT.MM.JJJJ).' : 'Enter the date.');
  if (ret) {
    const others = mtReturnsOf(parent.id).filter(t => String(t.id) !== String(f.id)).reduce((a, t) => a + mtNum(t.amount), 0);
    const left = mtNum(mtNum(parent.amount) - others);
    if (amount > left) return fail('mtC-amount', `The return can't be more than what is left of the receipt (${mtEur(left)}).`);
    if (parent.cost_date && f.cost_date < parent.cost_date) return fail('mtC-date', `The return can't be before the receipt (${mtDate(parent.cost_date)}).`);
  } else if (!f.isNew) {
    const back = mtReturnsOf(f.id).reduce((a, t) => a + mtNum(t.amount), 0);
    if (amount < back) return fail('mtC-amount', `The receipt can't be less than its returns (${mtEur(back)}).`);
    const first = mtReturnsOf(f.id)[0];
    if (first && first.cost_date < f.cost_date) return fail('mtC-date', `The receipt can't be after its return (${mtDate(first.cost_date)}).`);
  }
  if (MT.d39 && !ret && mtIsCasa(c.property_id)) {            // D39 fix: Who pays can't move into a locked NK year (as its sheet)
    const was = f.isNew ? null : mtCostById(f.id), L = mtWhoYrBar(mtWhoNorm(mtWhoFrom(f), null, true), f.id, f.cost_date);
    if (L && !(was && mtWhoYrBar(was, was.id, was.cost_date) === L)) return fail('mtC-date', `NK ${L.year} is locked in Settlements – change Who pays or the date.`);
  }
  const hold = !!(opts && opts.next);                          // Save + next: this pop-up waits ("Saving …") until the row is stored
  if (hold) mtCostHold(f);
  const stop = () => { if (hold && MT.costHold === f) mtCostHold(null); return false; };
  const dup = mtDupOf(f.receipt_no, f.id);
  if (dup) {
    const what = (ret ? 'Slip ' : 'Receipt ') + String(f.receipt_no).trim();
    const ok = await mtConfirm({ title: `${what} already exists`, text: dup.same ? 'It is already in this entry. Save it anyway?' : `It is already in ${dup.where}. Save it anyway?`, ok: 'Save anyway' });
    if (!ok) return stop();
    if (!MT.sel || MT.sel.cost !== f) return stop();          // the panel changed meanwhile
  }


  // D8 · typed by hand in Controlling already? → link it (one line), book separately, or don't book
  let pick = null;
  const prev = f.isNew ? null : mtCostById(f.id);
  const willBook = c.book_ctrl !== false && (ret ? parent.book_ctrl !== false : f.book_ctrl !== false) && amount > 0 && !!mtProp(c.property_id);
  if (willBook && !(prev && (prev.link_ot || prev.ctrl_dup_ok))) {
    if (mtChkFor === f) return stop();
    mtChkFor = f;
    let v;
    try {
      const cands = await mtCtrlMatches(c.property_id, amount, f.cost_date, ret);
      if (!MT.sel || MT.sel.cost !== f) return stop();
      if (!cands.length) v = 'none';
      else {
        const line = o => [o.item, o.company, (Number(o.direction) === 1 ? '+' : '−') + mtEur(o.amount), mtDate(String(o.invoice_date).slice(0, 10))].filter(Boolean).join(' · ');
        v = await mtAsk({
          title: 'Already in Controlling?',
          text: `You may have typed this ${ret ? 'return' : 'receipt'} in Controlling already. Link it, so it counts once.`,
          html: `<ul class="mt-cf__l">${cands.map(o => `<li>${mtEsc(line(o))}</li>`).join('')}</ul>`,
          buttons: [
            ...cands.map((o, i) => ({ v: 'L' + o.id, label: cands.length > 1 ? 'Link to the one from ' + mtDate(String(o.invoice_date).slice(0, 10)) : 'Link to it', kind: i ? 's' : 'p' })),
            { v: 'sep', label: 'Book separately', kind: 's' },
            ...(ret ? [] : [{ v: 'off', label: "Don't book in Controlling", kind: 's' }]),
            { v: 'cancel', label: 'Cancel', kind: 's' },
          ],
        });
      }
    } finally { if (mtChkFor === f) mtChkFor = null; }
    if (!v || v === 'cancel') return stop();
    if (!MT.sel || MT.sel.cost !== f) return stop();
    if (v === 'sep') pick = { ctrl_dup_ok: true };
    else if (v === 'off') pick = { book_ctrl: false };
    else if (v !== 'none') pick = { link_ot: v.slice(1) };
  }
  if (MT.busy) { stop(); mtBusySay(); return false; }         // something else began saving while it asked

  MT.busy = true;
  const isNew = f.isNew, id = f.id;
  const now = new Date().toISOString();
  const old = isNew ? null : { ...mtCostById(id) };
  const row = {
    id, case_id: c.id, kind: ret ? parent.kind : f.kind, receipt_no: String(f.receipt_no).trim() || null, description: String(f.description).trim() || null,
    brand: ret ? null : String(f.brand).trim() || null, amount, cost_date: f.cost_date, return_of: ret ? parent.id : null,
    book_ctrl: ret ? true : f.book_ctrl !== false,                 // a return follows its receipt
    ...(pick || {}),
    // D39 · Who pays (Casa Castel receipts only, only once MAINTENANCE-D39.sql has run): the normal form — and a
    // Kleinreparatur on the Gemeinschaftsfläche is shared by the Zimmer rented on the (maybe new) receipt date
    // D39 fix: a receipt already billed in a locked Settlements year keeps its stored choice (its Zimmer as billed)
    ...(MT.d39 && !ret && mtIsCasa(c.property_id) ? (prev && mtWhoLockOf(prev) ? mtWhoPick(prev) : mtWhoNorm(mtWhoFrom(f), f.cost_date)) : {}),
  };
  const kindChanged = !ret && old && old.kind !== row.kind;
  const rets = kindChanged ? mtReturnsOf(id) : [];
  const pending = f.files.filter(x => x.file), dels = f.delIds.slice(), adopt = f.files.filter(x => x.adopt).map(x => x.id);

  // 1 · show it at once (a receipt's returns follow its type). D39: the device draft stays until the row is stored (bug 14/15)
  if (isNew) MT.costs.push({ ...row, created_at: now, updated_at: now });
  else Object.assign(mtCostById(id), row, { updated_at: now });
  rets.forEach(t => { t.kind = row.kind; });
  if (!hold) { mtDraftNow(); MT_ED.hold = true; s.cost = null; }   // Save: the pop-up closes · Save + next: it stays on this form
  if (pending.length) MT.up = { caseId: c.id, total: 1, done: 0, where: 'costs', costId: id };
  if (hold) mtRefreshBg(c.id); else mtRefresh(c.id);
  if (!hold) mtFlashRow(id);

  // 2 · store the row (one retry)
  const sb = _ctlSupa;
  const { id: _id, ...fields } = row;
  let r = await mtTry(() => (isNew ? sb.from('maint_costs').insert(row) : sb.from('maint_costs').update(fields).eq('id', id)));
  if (!r.error && rets.length) r = await mtTry(() => sb.from('maint_costs').update({ kind: row.kind }).eq('return_of', id));
  MT_ED.hold = false;
  if (r.error) {
    console.error('[maintenance] cost save failed:', r.error);
    const emsg = String((r.error && (r.error.message || r.error.details)) || '');
    const d27Missing = /own_no/i.test(emsg);
    const d8Missing = /link_ot|ctrl_dup_ok|maint_before|maint_unbook/i.test(emsg);
    const d39Missing = MT_WHO_SQL.test(emsg);                   // D39: Who pays (or its booking) not in the database yet
    const sqlMissing = d27Missing || d8Missing || d39Missing || /book_ctrl|maint_cost_id/i.test(emsg);
    if (isNew) MT.costs = MT.costs.filter(x => String(x.id) !== String(id));
    else Object.assign(mtCostById(id), old);
    rets.forEach(t => { t.kind = old.kind; });
    MT.up = null;
    MT.busy = false;
    const msg = sqlMissing ? `Not saved: run ${d39Missing ? 'MAINTENANCE-D39.sql' : d27Missing ? 'MAINTENANCE-D27.sql' : d8Missing ? 'MAINTENANCE-D8.sql' : 'MAINTENANCE-D3.sql'} in Supabase first.` : 'Not saved. Check the connection and save again.';
    // D39 (bug 15): the form comes back only into the same state — Save + next never left it; after Save only when
    // nothing else was opened meanwhile. Otherwise the receipt waits in the device draft ("Unsaved receipt").
    const p = MT.sel;
    if (hold) mtCostHold(null);
    else if (p && !p.isNew && String(p.id) === String(c.id) && !p.edit && !p.cost && !p.add && !p.fix && !p.docEdit && !MT.sb) p.cost = f;   // the form comes back with what you typed
    else { mtRender(); mtSay(msg + ' The receipt is kept on this device.'); setTimeout(mtDraftOffer, 1200); return false; }
    mtRefresh(c.id);
    mtSay(msg);
    return false;
  }
  // stored → the draft goes (Save + next: the next form is the draft from now on)
  if (hold) {
    const next = opts.next();
    if (MT.sel === s && s.cost === f) s.cost = next;
    mtCostHold(null);
    mtRefresh(c.id);                                            // the next form, in the same pop-up (D39)
    mtFlashRow(id);
    mtCostFocus();
    mtSay('Saved · next receipt');
  } else if (!MT_ED.active) mtDraftIO('del');

  // 3 · files: removed ones go, new ones are stored with the row (in the background — D39: a form open now stays as it is)
  for (const docId of dels) {
    const d = MT.docs.find(x => String(x.id) === String(docId));
    if (!d) continue;
    MT.docs = MT.docs.filter(x => x !== d);
    const del = await mtTry(() => sb.from('maint_docs').delete().eq('id', d.id));
    if (del.error) { MT.docs.push(d); continue; }
    try { await sb.storage.from(MT_BUCKET).remove(mtFilesOf(d)); } catch (e) { console.warn('[maintenance] file not removed:', e); }
  }
  for (const docId of adopt) {                                // D11: the old Rechnung document becomes this receipt's file
    const d = MT.docs.find(x => String(x.id) === String(docId));
    if (!d) continue;
    const mv = await mtTry(() => sb.from('maint_docs').update({ cost_id: id, doc_type: 'receipt' }).eq('id', d.id));
    if (!mv.error) Object.assign(d, { cost_id: id, doc_type: 'receipt' });
  }
  // D15 · photos → one PDF (one page each, like "Document"); a PDF stays as it is
  // D32: the photos as they are, each a page of its own size (the original) — the A4 page with the band is the copy below
  // D39 (bug 14): src = which of your photos / PDFs each upload carries (a failed one comes back to the receipt)
  const pImgs = pending.filter(x => mtIsImage(x.file)), src = new Map();
  let uploads = pending.filter(x => !mtIsImage(x.file)).map(x => { src.set(x.file, [x]); return x.file; });
  if (pImgs.length) {
    const imgs = pImgs.map(x => x.file);
    let pdf = null;
    try { pdf = imgs.length > 1 ? await mtPhotoStackPdf(imgs) : await mtPhotoOrigPdf(imgs); }   // D33: parts of one receipt = one page
    catch (e) { console.warn('[maintenance] photo PDF not possible, A4 one instead:', e); }
    if (!pdf) pdf = await mtPhotosToPdf(imgs);
    const nm = ('Beleg ' + (String(row.receipt_no || '').trim() || mtDate(row.cost_date) || mtDate(ccTodayISO())) + '.pdf').replace(/[\\/:*?"<>|]/g, '-');
    if (pdf) { const pf = new File([pdf], nm, { type: 'application/pdf' }); src.set(pf, pImgs); uploads = [pf].concat(uploads); }
    else { pImgs.forEach(x => src.set(x.file, [x])); uploads = imgs.concat(uploads); }   // PDF not possible → the photos as before
  }
  if (MT.up) MT.up.total = uploads.length;
  let failed = 0;
  const lost = [];
  const fresh = new Map();                                    // D27: just uploaded → no download for the No.
  for (const file of uploads) {
    const n0 = MT.docs.length;
    const ok = await mtUploadOne(c, file, { type: 'receipt', amount: null, date: row.cost_date }, { cost_id: id });
    if (!ok) { failed++; lost.push(...(src.get(file) || [])); }
    else if (mtIsPdf(file) && MT.docs.length > n0) { try { fresh.set(MT.docs[MT.docs.length - 1].file_path, await file.arrayBuffer()); } catch (e) {} }
    if (MT.up) MT.up.done++;
    mtRefreshBg(c.id);
  }
  MT.up = null;
  // D27/D29/D32 · the receipt's files as A4 pages with the band (new, moved-in and earlier ones)
  let st = null;
  const own = mtFrameKey(id);
  const todo = mtStampTodo(id, own);
  if (todo.length) {
    MT.up = { caseId: c.id, total: todo.length, done: 0, where: 'costs', what: 'Adding your No.', costId: id };
    mtRefreshBg(c.id);
    try { st = await mtStampSync(c, todo, own, fresh); }
    catch (e) { console.warn('[maintenance] No. not written:', e); st = { failed: 1, locked: 0 }; }
    MT.up = null;
  }
  MT.busy = false;
  mtRefreshBg(c.id);
  if (lost.length) { mtCostLost(c, id, lost); return true; }   // D39 (bug 14): the photos are not thrown away
  if (pending.length || todo.length) mtFlashRow(id);
  if (failed) mtSay(`${uploads.length - failed} of ${uploads.length} files saved. Add the others again.`);
  else if (st && st.failed) mtSay('The No. could not be written on the PDF. Check the connection and save the receipt again.');
  else if (st && st.locked) mtSay(st.locked === 1 ? 'The No. can\'t be written on this PDF (it is locked) — it stays unchanged.'
                                                   : `The No. can't be written on ${st.locked} PDFs (they are locked) — they stay unchanged.`);
  return true;
}
/* D39 (bug 14) · photos / PDFs whose upload failed stay with the receipt: it opens again with them when nothing else is
   open (Save = try again), else they wait until you open that receipt */
function mtCostLost(c, id, lost) {
  MT.lost[id] = (MT.lost[id] || []).concat(lost.map(x => ({ id: null, file: x.file, name: x.name, img: !!x.img })));
  const p = MT.sel;
  if (p && !p.isNew && String(p.id) === String(c.id) && !mtActive(c) && !MT.sb && mtCostById(id)) {
    mtCostEdit(id);
    mtSay('Photos not uploaded. Check the connection and tap Save again.');
  } else mtSay('Photos of a receipt were not uploaded. Open that receipt and tap Save again.');
}

/* ─────────────────────────────────────────────────────────────
   D27 · YOUR NO. ON THE RECEIPT PDF — D32: the copy is the A4 invoice page
   Every file of a receipt (PDF or photo) has a copy you open (file_path): its A4
   page with the beige band — Objekt · NR. · BELEG-/BESTELL-NR. · DATUM (made in
   maint-cost-pdf.js, mtFrameFile). The untouched original stays in storage
   (orig_path); stamp_no = what the band says ("A4 …"). When that changes (the No.
   moved, a new date / receipt no.) the copy is made again from the original.
   Each copy gets a new file name (never an old cached copy). A PDF that can't be
   opened at all (password) stays as it is (stamp_no '!…' = tried, not possible).
   ───────────────────────────────────────────────────────────── */
const mtIsPdfPath = p => /\.pdf$/i.test(String(p || ''));
async function mtPdfLib() {
  if (!window.PDFLib) await mtLoadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js');
  if (!window.PDFLib) throw new Error('pdf-lib not loaded');
  return window.PDFLib;
}

/* The files of one receipt whose A4 copy does not say what the band should say now */
function mtStampTodo(costId, own) {
  const want = String(own || '').trim() || null;
  return mtCostFiles(costId).filter(d => mtFrFrameable(d.orig_path || d.file_path)
    && (d.stamp_no || null) !== want && !(want && d.stamp_no === '!' + want));
}

/* Bring those files in line (after Save / when opened) → { failed, locked } */
async function mtStampSync(c, docs, own, fresh) {
  const want = String(own || '').trim() || null;
  const sb = _ctlSupa, store = sb.storage.from(MT_BUCKET);
  const res = { failed: 0, locked: 0 };
  for (const d of docs) {
    const orig = d.orig_path || d.file_path;                  // the untouched original
    const oldCopy = d.orig_path && d.file_path !== d.orig_path ? d.file_path : null;   // the copy with the previous No.
    let patch, newPath = null;
    if (!want) patch = { file_path: orig, orig_path: null, stamp_no: null };             // No. cleared → the original again
    else {
      let bytes = fresh && fresh.get(orig);
      if (!bytes) {
        const r = await mtTry(() => store.download(orig));
        if (r.error || !r.data) { console.warn('[maintenance] original not loaded:', r.error); res.failed++; mtStampStep(c); continue; }
        bytes = await r.data.arrayBuffer();
      }
      let out;
      try { out = await mtFrameFile(bytes, d); }
      catch (e) { console.warn('[maintenance] A4 page not made:', e); res.failed++; mtStampStep(c); continue; }   // e.g. offline → the next Save / open tries again
      if (!out) { res.locked++; patch = { file_path: orig, orig_path: null, stamp_no: '!' + want }; }    // stays as it is, never an old No.
      else {
        newPath = `${c.id}/${mtUuid()}.pdf`;
        const blob = new Blob([out], { type: 'application/pdf' });
        const up = await mtTry(async () => {
          const r = await store.upload(newPath, blob, { contentType: 'application/pdf', upsert: false, cacheControl: '3600' });
          if (r && r.error && /exist|duplicate|409/i.test(String(r.error.message || r.error.statusCode || ''))) return {};   // the first try did arrive
          return r;
        });
        if (up.error) { console.warn('[maintenance] A4 copy not uploaded:', up.error); res.failed++; mtStampStep(c); continue; }
        patch = { file_path: newPath, orig_path: orig, stamp_no: want };
      }
    }
    const u = await mtTry(() => sb.from('maint_docs').update(patch).eq('id', d.id));
    if (u.error) {
      console.warn('[maintenance] file row not updated:', u.error);
      res.failed++;
      if (newPath) { try { await store.remove([newPath]); } catch (e) {} }
      mtStampStep(c);
      continue;
    }
    Object.assign(d, patch);
    if (oldCopy) { try { await store.remove([oldCopy]); } catch (e) {} }                 // the copy with the previous No.
    mtStampStep(c);
  }
  return res;
}
function mtStampStep(c) { if (MT.up) { MT.up.done++; mtRefreshBg(c.id); } }

async function mtCostDelete() {
  const s = MT.sel, f = s && s.cost, c = s && !s.isNew ? mtCase(s.id) : null;
  const r0 = f && !f.isNew ? mtCostById(f.id) : null;
  if (!r0 || !c) return;
  if (MT.busy) { mtBusySay(); return; }                      // D39 (bug 19)
  const ret = !!r0.return_of;
  const rows = MT.costs.filter(x => String(x.id) === String(r0.id) || String(x.return_of) === String(r0.id));   // with its returns
  const docs = MT.docs.filter(d => rows.some(x => String(x.id) === String(d.cost_id)));
  const nRet = rows.length - 1;
  const name = ret ? (r0.receipt_no ? 'Slip ' + r0.receipt_no : 'This return') + ' (' + mtNeg(r0.amount) + ')'
                   : (r0.receipt_no ? 'Receipt ' + r0.receipt_no : (r0.description || 'This receipt'));
  const extra = [nRet ? `its ${nRet} return${nRet === 1 ? '' : 's'}` : '', docs.length ? `${docs.length} file${docs.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
  const ok = await mtConfirm({ title: ret ? 'Delete this return?' : 'Delete this receipt?', text: `${name}${extra ? ' and ' + extra : ''} will be deleted for good.` + mtCtrlNote(rows), ok: 'Delete', danger: true });
  if (!ok) return;
  MT.busy = true;
  MT.costs = MT.costs.filter(x => !rows.includes(x));
  MT.docs = MT.docs.filter(d => !docs.includes(d));
  s.cost = null;
  mtRefresh(c.id);
  const sb = _ctlSupa;
  const r = await mtTry(() => sb.from('maint_costs').delete().eq('id', r0.id));          // its returns + file rows go with it
  MT.busy = false;
  if (r.error) {
    console.error('[maintenance] cost delete failed:', r.error);
    MT.costs.push(...rows);
    MT.docs.push(...docs);
    mtRefresh(c.id);
    mtSay('Not deleted. Check the connection and try again.');
    return;
  }
  const paths = docs.flatMap(mtFilesOf);
  if (paths.length) { try { await sb.storage.from(MT_BUCKET).remove(paths); } catch (e) { console.warn('[maintenance] files not removed:', e); } }
}

/* ── In-app sheets (instead of confirm()) ───────────────────
   mtConfirm({ title, text, ok, cancel, danger }) → Promise<boolean>
   mtAsk({ title, text, buttons: [{ v, label, kind: 'p' | 's' | 'd' }] }) → Promise<v | null> (null = closed) */
const mtSelOf = el => { try { return el && typeof el.selectionStart === 'number' ? [el.selectionStart, el.selectionEnd, el.selectionDirection || 'none'] : null; } catch (_) { return null; } };
/* D39 fix · where the focus goes back when a question is answered "stay" (Keep editing · Cancel · Escape): the field
   you are in, or the one you just left for the tap that asked (× · a tap beside it · Cancel) — with its cursor */
function mtAskBack() {
  const a = document.activeElement, open = [...document.querySelectorAll('.mt-modal')].filter(x => !x.inert);
  const m = (a && a.closest && a.closest('.mt-modal')) || open[open.length - 1];
  if (!m) return null;
  if (a && m.contains(a) && a.matches(MT_ED_FIELD)) return { el: a, sel: mtSelOf(a) };
  const f = m._fld, el = f && (f.el.isConnected ? f.el : f.id ? document.getElementById(f.id) : null);
  if (el && m.contains(el) && f.out && Date.now() - f.out < 2000) return { el, sel: f.sel };
  return a && a !== document.body && m.contains(a) ? { el: a, sel: null } : null;
}
function mtAskReturn(back, val) {                            // only for "stay" — Discard / OK never bring the keyboard up
  if (!back || !(val === null || val === false || val === 'cancel')) return;
  const el = back.el;
  if (!el.isConnected || !el.closest('.mt-modal') || el.closest('[inert]')) return;
  try { el.focus({ preventScroll: true }); if (back.sel) el.setSelectionRange(back.sel[0], back.sel[1], back.sel[2]); } catch (_) {}
}
function mtAsk(o) {
  const host = document.querySelector('#mtCostModal .mt-modal__s'), back = mtAskBack();
  if (host) return new Promise(resolve => {                  // D22: inside the receipt pop-up
    host.querySelector('.mt-askv')?.remove();
    const v = document.createElement('div');
    v.className = 'mt-askv';
    v.setAttribute('role', 'alertdialog');
    v.innerHTML = `<p class="mt-cf__t">${mtEsc(o.title || 'Are you sure?')}</p>${o.text ? `<p class="mt-cf__x">${mtEsc(o.text)}</p>` : ''}${o.html || ''}
      <div class="mt-cf__b">${(o.buttons || []).map((b, i) => `<button type="button" class="mt-btn mt-btn--${b.kind || 's'}" data-i="${i}">${mtEsc(b.label)}</button>`).join('')}</div>`;
    host.appendChild(v);
    const done = val => { document.removeEventListener('keydown', key, true); v.remove(); mtAskReturn(back, val); resolve(val); };
    const key = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); done(null); } };
    document.addEventListener('keydown', key, true);
    v.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; e.stopPropagation(); done(o.buttons[Number(b.dataset.i)].v); });
    setTimeout(() => v.querySelector('.mt-btn--p, .mt-btn--d, .mt-btn')?.focus(), 0);
  });
  return new Promise(resolve => {
    document.getElementById('mtConfirm')?.remove();
    const h = document.createElement('div');
    h.id = 'mtConfirm';
    h.className = 'mt-cf';
    const btns = (o.buttons || []).map((b, i) =>
      `<button type="button" class="mt-btn mt-btn--${b.kind || 's'}" data-i="${i}">${mtEsc(b.label)}</button>`).join('');
    h.innerHTML = `<div class="mt-cf__bg" data-x="1"></div>
      <div class="mt-cf__s" role="alertdialog" aria-modal="true" aria-labelledby="mtCfT">
        <p class="mt-cf__t" id="mtCfT">${mtEsc(o.title || 'Are you sure?')}</p>
        ${o.text ? `<p class="mt-cf__x">${mtEsc(o.text)}</p>` : ''}
        ${o.html || ''}
        <div class="mt-cf__b">${btns}</div>
      </div>`;
    document.body.appendChild(h);
    const done = v => { document.removeEventListener('keydown', key, true); h.remove(); mtAskReturn(back, v); resolve(v); };
    const key = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); done(null); } };
    document.addEventListener('keydown', key, true);
    h.addEventListener('click', e => {
      const b = e.target.closest('[data-i], [data-x]');
      if (!b) return;
      e.stopPropagation();
      done(b.dataset.x ? null : o.buttons[Number(b.dataset.i)].v);
    });
    setTimeout(() => h.querySelector('.mt-btn--p, .mt-btn--d, .mt-btn')?.focus(), 0);
  });
}
async function mtConfirm(o) {
  const v = await mtAsk({ title: o.title, text: o.text, buttons: [
    { v: true, label: o.ok || 'OK', kind: o.danger ? 'd' : 'p' },
    { v: false, label: o.cancel || 'Cancel', kind: 's' },
  ] });
  return v === true;
}

/* ── Schadensbericht (D5) ─────────────────────────────────────
   Details of a Schaden hold the report fields; Documents › "Schadensbericht"
   opens a short form in place (only the report choices): Zimmer (Casa
   Castel) · Mieter · Mieter unterschreibt mit · Versicherung (saved once per
   property) · photos in / out + Beschreibung. "PDF erstellen" builds the PDF
   with the app's document code (maint-schaden-pdf.js · cc-ueberg-photos.js ·
   pdf-open.js), saves it in Documents (a new version each time, the report
   number stays) and opens it in the viewer.                              */
const mtNorm = v => String(v || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
function mtIsCasa(pid) {
  const p = mtProp(pid);
  return Number(pid) === MT_CASA_ID || (!!p && mtNorm(p.name) === 'casacastel');
}
const mtLabelOf = (list, v) => (list.find(x => x[0] === v) || [, ''])[1];

/* Details › the Schaden-only report fields, in the report's order — D9: 'before' the Schadensbild
   (Schadensart · Festgestellt am · Besichtigung) and 'after' it (Ursache · Sofortmaßnahmen · Bitte an die HV · Polizei) */
/* Which Schaden fields show: type Schaden · Betroffen only for apartments · Polizei only for Einbruch / Vandalismus */
function mtSbVis() {
  const kind = document.getElementById('mtF-kind')?.value;
  const sch = kind === 'schaden';
  const casa = mtIsCasa(document.getElementById('mtF-prop')?.value);
  const police = /Einbruch/.test(document.getElementById('mtF-art')?.value || '');
  document.querySelectorAll('#mtPanel [data-only="schaden"], #mtEditModal [data-only="schaden"]').forEach(el => {
    const sb = el.dataset.sb;
    el.hidden = !sch || (sb === 'ask' && casa) || (sb === 'police' && !police);
  });
  const rb = document.getElementById('mtF-roomBox'), ab = document.getElementById('mtF-areaBox'), rs = document.getElementById('mtF-room');
  if (rb) rb.hidden = !casa;
  if (ab) ab.classList.toggle('mt-f--full', casa);
  if (casa && rs && !rs.value) { const gs = mtRoomGuess(document.getElementById('mtF-area')?.value); if (gs) rs.value = gs; }
}

/* Everything the report needs from the other apps (fresh each time the form opens) */
async function mtSbLoad() {
  const sb = _ctlSupa;
  const all = t => sb.from(t).select('*').then(r => (r.error ? [] : r.data || []), () => []);
  const [rooms, ten, apts, verw, rten] = await Promise.all([
    all('rooms'), all('tenant_records'), all('rentals_apartments'), all('rentals_verwaltung'), all('rnt_tenant_records'),
  ]);
  try { if (typeof loadSettings === 'function') await loadSettings(); } catch (e) {}
  MT.sbData = {
    rooms: rooms.filter(r => r.active !== false).sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)).map(r => r.name).filter(Boolean),
    ten, apts, verw, rten,
  };
}
/* Street + PLZ/Ort for a PDF — the PLZ/Ort only once, also when the street line already has it */
function mtAddr(a, p) {
  a = String(a || '').trim(); p = String(p || '').trim();
  const k = x => x.toLowerCase().replace(/[\s,]+/g, '');
  return a && p && k(a).includes(k(p)) ? a : [a, p].filter(Boolean).join(', ');
}
/* The Rentals apartment of a property (link in Controlling, else the same name) */
function mtSbApt(c) {
  const p = mtProp(c.property_id), apts = (MT.sbData && MT.sbData.apts) || [];
  if (!p) return null;
  if (p.rentals_apartment_ref) return apts.find(a => String(a.id) === String(p.rentals_apartment_ref)) || null;
  return apts.find(a => mtNorm(a.name) === mtNorm(p.name)) || null;
}
/* Any stored date → YYYY-MM-DD */
function mtIso(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
const mtSbNames = r => [[r.first_name, r.last_name], [r.first_name_2, r.last_name_2], [r.first_name_3, r.last_name_3]]
  .map(x => x.filter(Boolean).join(' ')).filter(Boolean).join(', ') || r.name || '';
/* Who lived there on the Schadenstag (else today) */
function mtSbTenant(c, room) {
  const D = MT.sbData; if (!D) return '';
  const day = c.case_date || ccTodayISO();
  let list;
  if (mtIsCasa(c.property_id)) {
    if (!room || room === MT_SB_ALL) return '';
    list = D.ten.filter(r => String(r.room || '') === room);
  } else {
    const apt = mtSbApt(c); if (!apt) return '';
    list = D.rten.filter(r => String(r.apartment_id) === String(apt.id));
  }
  const inside = r => { const a = mtIso(r.mietbeginn), b = mtIso(r.mietende); return (!a || a <= day) && (!b || b >= day); };
  let hits = list.filter(inside);
  if (!hits.length && day >= ccTodayISO()) hits = list.filter(r => r.status === 'active');
  hits.sort((a, b) => mtIso(b.mietbeginn).localeCompare(mtIso(a.mietbeginn)));
  return hits.length ? mtSbNames(hits[0]) : '';
}
/* The photos of the entry, in the order they were taken */
function mtSbPhotos(c) {
  const t = p => String(p.taken_at || p.doc_date || p.created_at || '');
  return mtCaseDocs(c.id).filter(d => d.doc_type === 'photo').sort((a, b) => t(a).localeCompare(t(b)) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
}
function mtSbWhen(p) {
  if (p.taken_at) {
    const d = new Date(p.taken_at);
    if (!isNaN(d)) { const two = n => String(n).padStart(2, '0'); return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} · ${two(d.getHours())}:${two(d.getMinutes())}`; }
  }
  return mtDate(p.doc_date || ccDayOf(p.created_at)) || '';
}

/* ── the form ── */
/* Documents that can go into the report: everything except photos, receipts and the reports themselves */
function mtSbAttachDocs(c) {
  return mtCaseDocs(c.id).filter(d => d.doc_type !== 'photo' && d.doc_type !== 'receipt' && !d.generated)
    .sort((a, b) => String(a.doc_date || '').localeCompare(String(b.doc_date || '')));
}
/* Anlage on / off → saved on the document at once */
async function mtSbAttToggle(id, on) {
  const d = MT.docs.find(x => String(x.id) === String(id)); if (!d) return;
  const was = d.in_report;
  d.in_report = on;
  const box = document.querySelector(`[data-sb-att="${CSS.escape(String(id))}"]`)?.closest('.mt-sba');
  if (box) box.classList.toggle('is-off', !on);
  const r = await mtTry(() => _ctlSupa.from('maint_docs').update({ in_report: on }).eq('id', d.id));
  if (r.error) {
    d.in_report = was;
    if (box) { box.classList.toggle('is-off', was === false); const cb = box.querySelector('input'); if (cb) cb.checked = was !== false; }
    mtSay('Not saved. Check the connection.');
  }
}
/* Gemeldet von · Unterzeichnungsort · Dringend: saved as you type (nothing lost on close or restart).
   Gemeldet von stays automatic (the Mieter) until you change it; emptied by you = stays empty. */

/* D10 · Schäden: the report comes first — its bar (or the open form) right under the summary */

/* Photo sheet: bigger photo · in the report yes / no · Beschreibung (saved to the photo) */

/* "Foto" in the form: camera or library → saved to the entry (with the time it was taken), in the report */
/* When a photo was taken (from the photo itself) → saved with it (D5) */
async function mtPhotoExtra(file) {
  if (!MT.d5 || typeof _ccUbExifTime !== 'function') return {};
  try { const t = await _ccUbExifTime(file); return t ? { taken_at: new Date(t.ts).toISOString() } : {}; }
  catch (e) { return {}; }
}

/* ── the PDF ── */
function mtLoadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}
async function mtSbAttachData(c) {
  const list = mtSbAttachDocs(c).filter(d => d.in_report !== false);
  const out = [];
  const pdfs = list.filter(d => d.doc_type !== 'video' && /\.pdf$/i.test(String(d.file_path || '')));
  if (pdfs.length && !window.PDFLib) { try { await mtLoadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'); } catch (e) {} }
  for (const d of list) {
    let pdf = null;
    if (pdfs.includes(d) && window.PDFLib) {
      try {
        const r = await _ctlSupa.storage.from(MT_BUCKET).download(d.file_path);
        if (!r.error && r.data) {
          const doc = await PDFLib.PDFDocument.load(await r.data.arrayBuffer(), { ignoreEncryption: true });
          if (!doc.isEncrypted && doc.getPageCount()) pdf = doc;
        }
      } catch (e) { console.warn('[maintenance] Anlage not added:', d.file_name, e); }
    }
    out.push({ doc: d, pdf });
  }
  return out;
}
async function mtSbMerge(blob, att) {
  const add = (att || []).filter(a => a.pdf);
  if (!add.length || !window.PDFLib) return blob;
  const out = await PDFLib.PDFDocument.load(await blob.arrayBuffer());
  for (const a of add) (await out.copyPages(a.pdf, a.pdf.getPageIndices())).forEach(pg => out.addPage(pg));
  return new Blob([await out.save()], { type: 'application/pdf' });
}
async function mtSbLibs() {
  if (typeof html2canvas === 'undefined') await mtLoadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  if (!window.jspdf) await mtLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  await mtPdfFonts();
}
/* The PDF fonts (Playfair Display · Lato): the stylesheet first, then the faces themselves */
async function mtPdfFonts() {
  let l = document.getElementById('mtPdfFonts');
  if (!l) {
    l = document.createElement('link');
    l.id = 'mtPdfFonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300;1,400&display=swap';
    await new Promise(res => { l.onload = res; l.onerror = res; setTimeout(res, 6000); document.head.appendChild(l); });
  }
  const faces = ['400 26px "Playfair Display"', '400 12px "Lato"', '700 12px "Lato"', 'italic 400 10px "Lato"'];
  for (let i = 0; i < 4; i++) {                              // the stylesheet may still be on its way: try again a little later
    let got = [];
    try { got = await Promise.all(faces.map(x => document.fonts.load(x))); } catch (e) { return; }
    if (got.every(x => x && x.length)) return;
    await new Promise(r => setTimeout(r, 400));
  }
}
/* The data for the template (maint-schaden-pdf.js) — only what the Hausverwaltung needs */
function mtSbData(c, f, photoCount) {
  const S = (typeof appSettings !== 'undefined' && appSettings) || {};
  const casa = mtIsCasa(c.property_id), apt = casa ? null : mtSbApt(c);
  const adresse = casa ? mtAddr(S.objekt_adresse, S.objekt_plz_ort)
                       : (apt ? mtAddr(apt.adresse, apt.plz_ort) : '');
  const room = casa && f.room && f.room !== MT_SB_ALL ? f.room : '';
  const unit = casa ? (room ? ['Zimmer', room] : ['Bereich', c.area || 'Gemeinschaftsfläche'])
                    : (apt && apt.wohnungsnummer ? ['Wohnung', String(apt.wohnungsnummer)] : ['', '']);
  // "WHG 10" stays as it is; only a bare number gets "Wohnung" ("Wohnung 3")
  const nr = apt && apt.wohnungsnummer ? String(apt.wohnungsnummer).trim() : '';
  const einheit = casa ? (room ? 'Zimmer ' + room : 'Gemeinschaftsfläche')
                       : (nr ? (/^(whg|wohnung|app\.?|apartment|we)(\s|\d|$)/i.test(nr) ? nr : 'Wohnung ' + nr) : '');
  // the Zimmer is already named → the Area only when it adds something ("Zimmer Oslo" → nothing)
  const raum = casa && room && new RegExp('(^|[^a-zäöüß0-9])' + room.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-zäöüß0-9])', 'i').test(c.area || '') ? '' : (c.area || '');
  const found = c.festgestellt_am || c.case_date;
  const mieter = String(f.mieter || '').trim();
  const art = c.schadensart || '';
  const wort = (typeof MT_SB_TITEL !== 'undefined' && art in MT_SB_TITEL) ? MT_SB_TITEL[art] : art;
  const anlagen = [];
  if (photoCount) anlagen.push('Fotodokumentation (' + (photoCount === 1 ? '1 Foto' : photoCount + ' Fotos') + ', am Ende des Berichts)');
  (f.att || []).forEach(a => {
    const d = a.doc;
    const what = d.doc_type === 'video' ? `Video ${d.file_name || ''}${d.media_seconds ? ' (' + mtDur(d.media_seconds) + ')' : ''}`
      : d.doc_type === 'email' ? 'E-Mail' + (d.doc_date ? ' vom ' + mtDate(d.doc_date) : '')
      : [MT_DOC_DE[d.doc_type] || 'Dokument', d.file_name, mtDate(d.doc_date)].filter(Boolean).join(' · ');
    anlagen.push(what + (a.pdf ? ' – angehängt' : ' – separat beigefügt'));
  });
  const stand = mtDate(ccTodayISO());
  return {
    family: casa ? 'casa' : 'rentals',
    objektName: casa ? 'Casa Castel' : ((apt && apt.name) || mtPropName(c)),
    einheitLabel: unit[0], einheitWert: unit[1], einheitKurz: casa ? '' : String((apt && apt.wohnungsnummer) || ''),
    titel: 'Schadensbericht' + (wort ? ' – ' + wort : ''),
    subtitle: [mtCaseLabel(c)].concat(casa ? ['Stand ' + stand] : ['an die Hausverwaltung', 'Stand ' + stand]).filter(Boolean).join(' · '),
    stand,
    datum: f.signDate ? mtDate(f.signDate) : '',
    styles: { schadensbild: mtSty(c, 'schadensbild'), ursache: mtSty(c, 'ursache'), massnahmen: mtSty(c, 'massnahmen'), bitte_hv: mtSty(c, 'bitte_hv'), dringend: mtSty(c, 'report_dringend') },
    dringend: String(f.dringend || '').trim(),
    adresse, einheit, raum,
    schadenstag: c.case_date && found && c.case_date !== found ? mtDate(c.case_date) : '',
    feststellung: [mtDate(found), mieter ? 'gemeldet von ' + mieter : ''].filter(Boolean).join(' · '),
    besichtigung: mtSbVisit(c),
    behoben: c.status === 'done' ? mtDate(c.end_date) : '',
    polizei: /Einbruch/.test(art) ? (c.polizei_az || '') : '',
    schadensbild: c.schadensbild || c.description || '',
    ursache: c.ursache || '',
    massnahmen: c.massnahmen || '',
    bitteHv: casa ? '' : (c.bitte_hv || ''),
    anlagen,
    ort: String(f.ort || '').trim(),
    vermieter: S.vermieter_name || '', kontakt: S.vermieter_email || '',
    footerAdresse: adresse,
  };
}
/* The photos in the report → as the Übergabe photo pages expect them */
/* Keep the PDF in Documents (a new version each time) */
/* Remember the report no. and the choices of the form for next time */
async function mtSbRemember(c, f) {
  const patch = { report_no: f.reportNo, report_room: f.room || null, report_mieter: f.mieterAuto ? null : String(f.mieter || '').trim() };
  if (MT.d6) Object.assign(patch, {
    report_ort: String(f.ort || '').trim() || null,
    report_dringend: String(f.dringend || '').trim() || null,
  });
  const r = await mtTry(() => _ctlSupa.from('maint_cases').update(patch).eq('id', c.id));
  if (!r.error) Object.assign(c, patch); else console.warn('[maintenance] report choices not saved:', r.error);
}

/* ── Wiring ───────────────────────────────────────────────── */
function mtWire() {
  document.querySelectorAll('#appTabs .cc-tab').forEach(b => {
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => mtTabClick(b.dataset.tab));
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-mt]');
    if (!b || MT.loadError) return;
    const a = b.dataset.mt;
    if (a === 'new') mtNew();
    else if (a === 'open') mtOpen(b.dataset.id);
    else if (a === 'fold') {
      const k = b.dataset.key, cur = MT.open[k] === undefined ? b.dataset.auto === '1' : !!MT.open[k];
      MT.open[k] = !cur;
      mtRender();
    }
    else if (a === 'close') mtClose();
    else if (a === 'edit') mtEdit();
    else if (a === 'cancel') mtCancel();
    else if (a === 'save') mtSave();
    else if (a === 'del') mtDelete();
    else if (a === 'upload') mtPickFile();
    else if (a === 'openDoc') mtOpenDoc(b.dataset.id);
    else if (a === 'docToCost') mtDocToCost(b.dataset.id);
    else if (a === 'pdfYear') mtPdfYear(b);
    else if (a === 'yrGo') mtYearGo(b.dataset.v);
    else if (a === 'cgrp') { MT.cgrp = b.dataset.v; mtRefresh(MT.sel && MT.sel.id); }
    else if (a === 'cAll') { MT.cAll = MT.cAll || {}; MT.cAll[b.dataset.id] = !MT.cAll[b.dataset.id]; mtRefresh(b.dataset.id); }
    else if (a === 'stSet') mtStatusSet(b.dataset.v);
    else if (a === 'pdfEntry') mtPdfEntry(b.dataset.id, b);
    else if (a === 'invYear') mtPdfInvYear(b);                // D29
    else if (a === 'invEntry') mtPdfInvEntry(b.dataset.id, b);
    else if (a === 'docsEdit') { if (MT.sel) { if (MT.busy) mtBusySay(); else { MT.sel.docEdit = true; MT.sel.fix = null; mtRenderPanel(); } } }
    else if (a === 'docsDone') { if (MT.sel) { MT.sel.docEdit = false; MT.sel.fix = null; mtRenderPanel(); } }
    else if (a === 'fixDoc') { if (MT.sel) { MT.sel.fix = String(b.dataset.id); mtRenderPanel(); } }
    else if (a === 'fixCancel') { if (MT.sel) { MT.sel.fix = null; mtRenderPanel(); } }
    else if (a === 'fixSave') mtFixSave();
    else if (a === 'delDoc') mtDelDoc(b.dataset.id);
    else if (a === 'addCancel') { if (MT.sel) { MT.sel.add = null; mtRenderPanel(); } }
    else if (a === 'addSave') mtAddSave();
    else if (a === 'costNew') mtCostNew(b.dataset.k);
    else if (a === 'costEdit') mtCostEdit(b.dataset.id);
    else if (a === 'costKind') mtCostKind(b.dataset.k);
    else if (a === 'costFile') mtCostPickFiles();
    else if (a === 'costCam') mtCamOpen();
    else if (a === 'costFileDel') mtCostFileDel(Number(b.dataset.i));
    else if (a === 'costCancel') mtCostCancel();
    else if (a === 'costSave') mtCostSave();
    else if (a === 'costSaveNext') mtCostSaveNext();
    else if (a === 'costDel') mtCostDelete();
    else if (a === 'costReturn') mtCostNewReturn();
    else if (a === 'whoPays') mtWhoOpen(b.dataset.id);        // D39 · Who pays? — the tag of a receipt row
    else if (a === 'whoNest') mtWhoNest();                    //       … or its row inside the receipt pop-up
    else if (a === 'whoType') mtWhoSet('type', b.dataset.v);
    else if (a === 'whoWhere') mtWhoSet('where', b.dataset.v);
    else if (a === 'whoRoom') mtWhoSet('room', b.dataset.v);
    else if (a === 'whoCat') mtWhoSet('cat', b.dataset.v);
    else if (a === 'whoMore') mtWhoSet('more');
    else if (a === 'whoVia') mtWhoSet('via', b.dataset.v);
    else if (a === 'whoPaid') mtWhoPaidOpen();
    else if (a === 'whoReset') mtWhoSet('reset');
    else if (a === 'whoCancel') mtWhoClose();
    else if (a === 'whoSave') mtWhoSave();
    else if (a === 'sbOpen') mtSbOpen(b.dataset.id || (MT.sel && MT.sel.id));
    else if (a === 'sbClose') mtSbClose();
    else if (a === 'sty') mtSbStyle(b.dataset.col, b.dataset.v);
    else if (a === 'phase') mtSbPhase(b.dataset.id, b.dataset.v);
    else if (a === 'sbDelPhoto') { if (MT.sb && !MT.sb.busy) { mtSbCapsFlush(); MT.sb.askDel = String(b.dataset.id); mtSbPhotosRender(); } }
    else if (a === 'sbDelNo') { if (MT.sb) { MT.sb.askDel = null; mtSbPhotosRender(); } }
    else if (a === 'sbDelYes') mtSbDelPhoto(b.dataset.id);
    else if (a === 'sbBack') { if (MT.sb && !MT.sb.busy) { MT.sb.view = 'form'; mtSbRender(); } }
    else if (a === 'sbOpenPdf') mtSbOpenPdf();
    else if (a === 'moveKind') mtMoveKind(b.dataset.v);
    else if (a === 'soTeil') mtSoTeil(b);
    else if (a === 'more') { if (MT.sel) { MT.sel.more = !MT.sel.more; mtRenderPanel(); } }

    else if (a === 'sbFotos') { const f = MT.sb; if (f && !f.busy) { mtSbCapsFlush(); f.photosOn = b.dataset.v === '1'; mtSbPhotosRender(); } }
    else if (a === 'sbAddPhoto') mtSbAddPhoto();
    else if (a === 'sbMake') mtSbMake();
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (!t) return;
    if (t.closest && t.closest('#mtSbModal')) { mtSbChange(t); return; }
    if (t.id === 'mtW-paid') { mtWhoSet('paid', t.value); return; }   // D39: the calendar wrote "Paid on"
    if (t.id === 'mtC-book' && document.getElementById('mtC-whobox')) mtCostWhoSync();   // D39 fix: Who pays follows "Book in Controlling"
    if (t.id === 'mtF-kind') mtKindChanged();
    else if (t.id === 'mtF-prop' || t.id === 'mtF-art') mtSbVis();
    else if (t.id === 'mtF-end') mtEndChanged();
    else if (t.dataset && t.dataset.mtYear !== undefined) mtYearGo(t.value);
    else if (t.id === 'mtF-status') mtStatusChanged();
    else if (t.dataset && t.dataset.docType) mtDocTypeChanged(t.dataset.docType);
  });
  document.addEventListener('keydown', mtBulletKey, true);
  document.addEventListener('focusin', e => { const t = e.target; if (mtIsBulletTa(t) && !t.value) mtTaSet(t, MT_BUL, MT_BUL.length); });
  document.addEventListener('focusout', e => { const t = e.target; if (mtIsBulletTa(t) && /^\s*•?\s*$/.test(t.value)) t.value = ''; });
  document.addEventListener('input', e => {
    if (mtIsBulletTa(e.target)) mtBulletFix(e.target);             // the Mieter typed by hand is kept when the Zimmer changes
    if (e.target && e.target.id === 'mtS-mieter' && MT.sb) MT.sb.mieterAuto = false;
    if (e.target && e.target.matches && e.target.matches('#mtPanel textarea.mt-ta, #mtSbModal textarea.mt-ta, #mtEditModal textarea.mt-ta')) mtGrow(e.target);
    if (e.target && e.target.id === 'mtC-amount' && document.getElementById('mtC-whobox')) mtCostWhoSync();   // D39: "Kleinrep. >150 €" follows the amount
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const cal = document.getElementById('ccCal'), cf = document.getElementById('mtConfirm'), pdf = document.getElementById('ccPdfSheet');
    if (document.getElementById('mtCam')) { if (!cal) mtCamClose(false); return; }           // D39: the camera on top closes first
    if (document.getElementById('mtWhoModal')) { if (!cal && !cf) mtWhoClose(); return; }     // D39: Who pays? on top — only that sheet
    if (MT.sel && MT.sel.cost && document.getElementById('mtCostModal') && !document.querySelector('.mt-askv') && !cal) { mtCostCancel(); return; }
    if (MT.sb && !cf && !cal && !pdf) { mtSbClose(); return; }
    if (MT.sel && !cf && !cal && !document.getElementById('mtSbSheet') && !pdf) {
      // D39 (bug 8): in the Edit pop-up Escape = × / Cancel (back to the entry, asks if changed) — not "close the entry"
      if (MT.sel.edit && !MT.sel.isNew && document.getElementById('mtEditModal')) mtCancel(); else mtClose();
    }
  });
}

/* ── D16 · Schadensbericht pop-up (one level) ─────────────────────────────
   Opened from "Schadensbericht" below the divider (closed or open card). It holds
   everything only the report needs — the entry's Edit keeps the basic info.
   Fields save when you leave them; Create PDF keeps the pop-up open. */
const mtSbCase = () => (MT.sb ? mtCase(MT.sb.caseId) : null);
/* ── D17 · Berichte: one pop-up for the Schadensbericht and the Renovierungsbericht ──────────
   · every text box: "Points | Text" (saved per box in report_style) → bullets or a paragraph in the PDF
   · Besichtigung vor Ort: date (calendar) · time (time picker) · durch
   · Schadensart: the list + "Other" (your own words become the title)
   · Unterzeichnungsort + Unterzeichnungsdatum (today each time you open it) → "Ort, Datum"
   · photos: Beschreibung · in the report · × (asks in the row) · Renovierung: Vorher / Nachher
   · Create PDF → a ready view in the same pop-up with a big "Open PDF" */
const MT_SB_FIELDS = [
  ['mtS-found', 'festgestellt_am', 'date'], ['mtS-visit', 'besichtigung'],
  ['mtS-vdate', 'besichtigung_am', 'date', 17], ['mtS-vtime', 'besichtigung_zeit', '', 17], ['mtS-vby', 'besichtigung_durch', '', 17],
  ['mtS-police', 'polizei_az'], ['mtS-bild', 'schadensbild', '', 16], ['mtS-cause', 'ursache'], ['mtS-measures', 'massnahmen'],
  ['mtS-ask', 'bitte_hv'], ['mtS-urgent', 'report_dringend'], ['mtS-ort', 'report_ort'],
  ['mtR-anlass', 'rb_anlass', '', 17], ['mtR-arbeiten', 'rb_arbeiten', '', 17], ['mtR-ergebnis', 'rb_ergebnis', '', 17], ['mtR-hinweise', 'rb_hinweise', '', 17],
  ['mtO-ort', 'so_ort', '', 30], ['mtO-zeit', 'so_zeit', '', 30], ['mtO-teil', 'so_teilnehmer', '', 30],   // D30: Sonstiges
];
const MT_STY_DEF = { schadensbild: 'list', ursache: 'text', massnahmen: 'list', bitte_hv: 'list', report_dringend: 'text',
                     rb_anlass: 'text', rb_arbeiten: 'list', rb_ergebnis: 'text', rb_hinweise: 'list' };
const MT_STY_SO = { rb_anlass: 'list', rb_ergebnis: 'list', rb_hinweise: 'list' };      // D30: Sonstiges → points by default
const mtSty = (c, col) => (c && c.report_style && c.report_style[col]) || (c && c.kind === 'sonstiges' && MT_STY_SO[col]) || MT_STY_DEF[col] || 'text';
const MT_SO_ARTEN = ['Hausversammlung', 'Mieterfest'];                                   // D30: + "Other" (your own words)
const mtBerichtLbl = c => (c && c.kind === 'renovierung' ? 'Renovierungsbericht'
  : c && c.kind === 'sonstiges' ? (c.so_art === 'Hausversammlung' ? 'Protokoll' : 'Bericht') : 'Schadensbericht');

async function mtSbOpen(id) {
  const c = mtCase(id);
  if (!c || MT.sb) return;
  if (!MT.d5) { mtSay('Run MAINTENANCE-D5.sql in Supabase first.'); return; }
  if (c.kind === 'renovierung' && !MT.d17) { mtSay('Run MAINTENANCE-D17.sql in Supabase first.'); return; }
  if (c.kind === 'sonstiges' && !(MT.d17 && MT.d30)) { mtSay('Run MAINTENANCE-D30.sql in Supabase first.'); return; }
  if (MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(c.id) && mtActive(c)) { mtSay('Save or cancel the open form first.'); return; }
  MT.sb = { caseId: c.id, ready: false, view: 'form' };
  mtSbRender();
  await mtSbLoad();
  const f = MT.sb;
  if (!f || String(f.caseId) !== String(c.id)) return;
  const casa = mtIsCasa(c.property_id), rooms = MT.sbData.rooms;
  const room = casa ? (c.report_room || mtRoomGuess(c.area) || rooms.find(r => mtNorm(c.area).includes(mtNorm(r))) || '') : '';
  const S = (typeof appSettings !== 'undefined' && appSettings) || {}, apt = casa ? null : mtSbApt(c);
  const auto = c.kind === 'schaden' ? mtSbTenant(c, room) : '';
  Object.assign(f, {
    ready: true, room,
    mieter: c.report_mieter !== null && c.report_mieter !== undefined ? c.report_mieter : auto,
    mieterAuto: c.report_mieter === null || c.report_mieter === undefined,
    // signing place = the city of the property: Casa Castel → Profile › Unterzeichnung; apartments → their card, else their city
    ort: c.report_ort || (casa ? S.unterschrift_ort : ((apt && apt.unterschrift_ort) || (apt && typeof ccPlaceOf === 'function' ? ccPlaceOf(apt.plz_ort) : ''))) || '',
    signDate: ccTodayISO(),                                   // Unterzeichnungsdatum: today, every time
    dringend: c.report_dringend || '',
    photosOn: mtSbPhotos(c).length > 0, busy: false, done: '', askDel: null,
  });
  mtSbRender();
}

function mtStyHTML(c, col) {
  const v = mtSty(c, col);
  return `<span class="mt-sty" role="group" aria-label="Points or text">
      <button type="button" class="mt-sty__b${v === 'list' ? ' is-on' : ''}" data-mt="sty" data-col="${col}" data-v="list" aria-pressed="${v === 'list'}">Points</button><button type="button" class="mt-sty__b${v === 'text' ? ' is-on' : ''}" data-mt="sty" data-col="${col}" data-v="text" aria-pressed="${v === 'text'}">Text</button></span>`;
}
function mtSbTa(c, id, col, label, v, ph, rows) {
  return `<div class="mt-f mt-f--full"><div class="mt-kl"><label class="mt-k" for="${id}">${label}</label>${MT.d17 ? mtStyHTML(c, col) : ''}</div>
      <textarea class="mt-in mt-ta" id="${id}" data-col="${col}" data-sty="${MT.d17 ? mtSty(c, col) : 'text'}" rows="${rows || 3}" maxlength="2000" placeholder="${mtEsc(ph)}">${mtEsc(MT.d17 && mtSty(c, col) === 'list' ? mtBulletize(v) : (v || ''))}</textarea></div>`;
}
/* Ausführende Firmen: the providers of the entry's Kosten (name – what they did) */
function mtRbFirmen(c) {
  const seen = new Map();
  MT.costs.filter(r => String(r.case_id) === String(c.id) && !r.return_of && r.kind === 'provider' && String(r.brand || '').trim())
    .sort((a, b) => String(a.cost_date || '').localeCompare(String(b.cost_date || '')))
    .forEach(r => { const k = r.brand.trim(); if (!seen.has(k)) seen.set(k, []); if (String(r.description || '').trim()) seen.get(k).push(r.description.trim()); });
  return [...seen.entries()].map(([k, ds]) => k + (ds.length ? ' – ' + [...new Set(ds)].join(', ') : ''));
}
function mtSbFieldsBody(c, f) {
  const casa = mtIsCasa(c.property_id), police = /Einbruch/.test(c.schadensart || '');
  const arten = typeof MT_SB_ARTEN !== 'undefined' ? MT_SB_ARTEN : [];
  const art = c.schadensart || '', other = !!art && !arten.includes(art);
  const visit = MT.d17
    ? `<div class="mt-f"><label class="mt-k" for="mtS-vdate">Besichtigung am</label><input class="mt-in" id="mtS-vdate" type="date" value="${mtEsc(c.besichtigung_am || '')}"/></div>
       <div class="mt-f"><label class="mt-k" for="mtS-vtime">Uhrzeit</label><input class="mt-in mt-time" id="mtS-vtime" type="time" value="${mtEsc(c.besichtigung_zeit || '')}"/></div>
       <div class="mt-f mt-f--full"><label class="mt-k" for="mtS-vby">Besichtigung durch</label>
         <input class="mt-in" id="mtS-vby" type="text" maxlength="120" autocomplete="off" placeholder="z. B. die Eigentümer" value="${mtEsc(c.besichtigung_durch || '')}"/></div>`
    : `<div class="mt-f mt-f--full"><label class="mt-k" for="mtS-visit">Besichtigung vor Ort</label>
         <input class="mt-in" id="mtS-visit" type="text" maxlength="160" autocomplete="off" placeholder="z. B. 14.10.2026, 20:00 Uhr, durch die Eigentümer" value="${mtEsc(c.besichtigung || '')}"/></div>`;
  return `
      <div class="mt-f"><label class="mt-k" for="mtS-art">Schadensart</label><select class="mt-in" id="mtS-art">
        <option value=""${art ? '' : ' selected'}>—</option>${arten.map(a => `<option value="${mtEsc(a)}"${art === a ? ' selected' : ''}>${mtEsc(a)}</option>`).join('')}
        <option value="__other"${other ? ' selected' : ''}>Other (type it)</option></select></div>
      <div class="mt-f"><label class="mt-k" for="mtS-found">Festgestellt am</label><input class="mt-in" id="mtS-found" type="date" value="${mtEsc(c.festgestellt_am || '')}"/></div>
      <div class="mt-f mt-f--full" id="mtS-artxBox"${other ? '' : ' hidden'}><label class="mt-k" for="mtS-artx">Schadensart (your words)</label>
        <input class="mt-in" id="mtS-artx" type="text" maxlength="80" autocomplete="off" placeholder="z. B. Rohrbruch im Keller" value="${mtEsc(other ? art : '')}"/></div>
      ${visit}
      <div class="mt-f"><label class="mt-k" for="mtS-mieter">Gemeldet von</label>
        <input class="mt-in" id="mtS-mieter" type="text" maxlength="160" autocomplete="off" placeholder="optional" value="${mtEsc(f.mieter || '')}"/></div>
      <div class="mt-f" id="mtS-policeBox"${police ? '' : ' hidden'}><label class="mt-k" for="mtS-police">Polizei-Aktenzeichen</label>
        <input class="mt-in" id="mtS-police" type="text" maxlength="60" autocomplete="off" value="${mtEsc(c.polizei_az || '')}"/></div>
      <p class="mt-hint mt-f--full">Gemeldet von is filled with the Mieter living there; change it if someone else reported it.</p>
      ${mtSbTa(c, 'mtS-bild', 'schadensbild', 'Schadensbild', c.schadensbild, 'One point per line, e.g. Wasser tropft durch die Deckenleuchte', 4)}
      ${mtSbTa(c, 'mtS-cause', 'ursache', 'Vermutete Ursache', c.ursache, 'z. B. Wasser kommt aus der Wohnung zwei Stockwerke darüber – noch ungeklärt', 2)}
      ${mtSbTa(c, 'mtS-measures', 'massnahmen', 'Sofortmaßnahmen', c.massnahmen, 'One point per line, e.g. Hausmeister hat das Wasser abgestellt', 3)}
      ${casa ? '' : mtSbTa(c, 'mtS-ask', 'bitte_hv', 'Bitte an die Hausverwaltung', c.bitte_hv, 'One point per line, e.g. Leckortung veranlassen', 3)}
      ${mtSbTa(c, 'mtS-urgent', 'report_dringend', 'Dringend <span class="mt-mu">(optional)</span>', f.dringend, 'z. B. Wasser tritt aus Decke und Leuchte aus, Elektrik im Bad defekt', 2)}`;
}
function mtRbFieldsBody(c) {
  const firmen = mtRbFirmen(c);
  return `
      ${mtSbTa(c, 'mtR-anlass', 'rb_anlass', 'Ausgangslage', c.rb_anlass, 'Why the renovation, the condition before', 3)}
      ${mtSbTa(c, 'mtR-arbeiten', 'rb_arbeiten', 'Durchgeführte Arbeiten', c.rb_arbeiten, 'One point per line, e.g. Fliesen im Bad erneuert', 4)}
      <div class="mt-f mt-f--full"><span class="mt-k">Ausführende Firmen</span>
        <p class="mt-rbf">${firmen.length ? firmen.map(mtEsc).join('<br>') : 'Filled from Kosten (provider receipts).'}</p></div>
      ${mtSbTa(c, 'mtR-ergebnis', 'rb_ergebnis', 'Ergebnis', c.rb_ergebnis, 'The condition after the renovation', 2)}
      ${mtSbTa(c, 'mtR-hinweise', 'rb_hinweise', 'Hinweise <span class="mt-mu">(optional)</span>', c.rb_hinweise, 'One point per line, e.g. Silikonfugen jährlich prüfen', 2)}
      <label class="mt-chk mt-f--full"><input type="checkbox" id="mtR-kosten"${c.rb_kosten ? ' checked' : ''}/><span>Show the costs in the report (Gesamt · Selbst gekauft · Dienstleister)</span></label>`;
}
/* D30 · Sonstiges (Hausversammlung, Mieterfest …): Art · Uhrzeit · Ort · Teilnehmer + three boxes.
   The boxes and the Kosten switch use the Renovierungsbericht fields (rb_anlass · rb_ergebnis · rb_hinweise · rb_kosten). */
function mtSoFieldsBody(c, f) {
  const casa = mtIsCasa(c.property_id), art = c.so_art || '', other = !!art && !MT_SO_ARTEN.includes(art);
  const rooms = casa ? ((MT.sbData && MT.sbData.rooms) || MT.rooms || []) : [];
  const teil = String(c.so_teilnehmer || ''), inTeil = r => teil.split(/\s*,\s*/).some(x => x && mtNorm(x) === mtNorm(r));
  const chips = rooms.length ? `<div class="mt-chips mt-so__chips">${rooms.map(r => `<button type="button" class="mt-chip mt-chip--pick${inTeil(r) ? ' is-on' : ''}" data-mt="soTeil" data-v="${mtEsc(r)}" aria-pressed="${inTeil(r)}">${mtEsc(r)}</button>`).join('')}</div>` : '';
  return `
      <div class="mt-f"><label class="mt-k" for="mtO-art">Art</label><select class="mt-in" id="mtO-art">
        <option value=""${art ? '' : ' selected'}>—</option>${MT_SO_ARTEN.map(a => `<option value="${mtEsc(a)}"${art === a ? ' selected' : ''}>${mtEsc(a)}</option>`).join('')}
        <option value="__other"${other ? ' selected' : ''}>Other (type it)</option></select></div>
      <div class="mt-f"><label class="mt-k" for="mtO-zeit">Uhrzeit</label><input class="mt-in mt-time" id="mtO-zeit" type="time" value="${mtEsc(c.so_zeit || '')}"/></div>
      <div class="mt-f mt-f--full" id="mtO-artxBox"${other ? '' : ' hidden'}><label class="mt-k" for="mtO-artx">Art (your words)</label>
        <input class="mt-in" id="mtO-artx" type="text" maxlength="80" autocomplete="off" placeholder="z. B. Gartentag" value="${mtEsc(other ? art : '')}"/></div>
      <div class="mt-f mt-f--full"><label class="mt-k" for="mtO-ort">Ort</label>
        <input class="mt-in" id="mtO-ort" type="text" maxlength="120" autocomplete="off" placeholder="z. B. Gemeinschaftsküche" value="${mtEsc(c.so_ort || '')}"/></div>
      <div class="mt-f mt-f--full"><label class="mt-k" for="mtO-teil">Teilnehmer</label>${chips}
        <input class="mt-in" id="mtO-teil" type="text" maxlength="400" autocomplete="off" placeholder="${casa ? 'Tap the rooms above, or type' : 'z. B. Mieter WHG 3, Hausmeister'}" value="${mtEsc(teil)}"/></div>
      <p class="mt-hint mt-f--full">Datum comes from the entry (${mtEsc(mtDate(c.case_date) || 'not set yet')}).</p>
      ${mtSbTa(c, 'mtR-anlass', 'rb_anlass', 'Anlass / Themen', c.rb_anlass, 'One point per line, e.g. Putzplan Küche', 3)}
      ${mtSbTa(c, 'mtR-ergebnis', 'rb_ergebnis', 'Besprochen / Vereinbart', c.rb_ergebnis, 'One point per line, e.g. Müll wird sonntags rausgebracht', 4)}
      ${mtSbTa(c, 'mtR-hinweise', 'rb_hinweise', 'Nächste Schritte <span class="mt-mu">(optional)</span>', c.rb_hinweise, 'One point per line, e.g. Neuer Putzplan ab 01.11.', 2)}
      <label class="mt-chk mt-f--full"><input type="checkbox" id="mtR-kosten"${c.rb_kosten ? ' checked' : ''}/><span>Show the costs in the report (each receipt and the total)</span></label>`;
}
/* D30 · Teilnehmer: a room chip adds / removes that room in the line (house order first, typed names after) */
function mtSoTeil(b) {
  const inp = document.getElementById('mtO-teil'); if (!inp || !b) return;
  const rooms = (MT.sbData && MT.sbData.rooms) || MT.rooms || [], r = b.dataset.v;
  const list = String(inp.value || '').split(/\s*,\s*/).map(x => x.trim()).filter(Boolean);
  const isRoom = x => rooms.some(r2 => mtNorm(r2) === mtNorm(x));
  const sel = new Set(list.filter(isRoom).map(mtNorm)), on = !sel.has(mtNorm(r));
  if (on) sel.add(mtNorm(r)); else sel.delete(mtNorm(r));
  inp.value = rooms.filter(r2 => sel.has(mtNorm(r2))).concat(list.filter(x => !isRoom(x))).join(', ');
  b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on));
  mtSbFlush();
}
/* D39 · the pop-up's parts { h: header, b: body, f: footer } — mtSbRender fills them into the sheet that is built once */
function mtSbFormHTML(c, f) {
  const kl = mtBerichtLbl(c), no = mtCaseLabel(c) || f.reportNo || c.report_no;   // D29: the case number
  const h = `<div><p class="mt-modal__k">${kl}${no ? ' · ' + mtEsc(no) : ''}</p>
        <p class="mt-modal__t" id="mtSbT">${mtEsc(c.title)}</p>
        <p class="mt-modal__sub">${mtEsc([mtPropName(c), mtWhere(c)].filter(Boolean).join(' · '))}</p></div>
      <button type="button" class="mt-modal__x" data-mt="sbClose" aria-label="Close"${f.busy ? ' disabled' : ''}><i class="ti ti-x" aria-hidden="true"></i></button>`;
  if (!f.ready) return { h, b: '<p class="mt-up" role="status"><span class="mt-spin" aria-hidden="true"></span>Loading</p>', f: '' };
  if (f.view === 'ready') return { h, b: `<div class="mt-ready">
        <span class="mt-ready__ic"><i class="ti ti-file-check" aria-hidden="true"></i></span>
        <p class="mt-ready__t">${kl} is ready</p>
        <p class="mt-ready__s">${mtEsc([no, 'Stand ' + f.done].filter(Boolean).join(' · '))}</p>
        <p class="mt-ready__s">Saved in Documents</p>
        <button type="button" class="mt-ready__open" data-mt="sbOpenPdf"><i class="ti ti-file-text" aria-hidden="true"></i>Open PDF</button>
      </div>`,
    f: `<span class="cc-foot-right">
        <button type="button" class="cc-foot-btn" data-mt="sbBack">Back to the report</button>
        <button type="button" class="cc-foot-btn" data-mt="sbClose">Close</button>
      </span>` };
  const casa = mtIsCasa(c.property_id);
  const up = (() => { const u = mtUpFor(c); return u && u.where === 'sb' ? u : null; })();
  const att = mtSbAttachDocs(c);
  const attRows = att.map(d => {
    const vid = d.doc_type === 'video', on = d.in_report !== false;
    return `<label class="mt-sba${on ? '' : ' is-off'}"><input type="checkbox" data-sb-att="${mtEsc(d.id)}"${on ? ' checked' : ''}/>
      <span class="mt-sba__t">${mtEsc(MT_DOC[d.doc_type] ? MT_DOC[d.doc_type].label : 'Document')}<small>${mtEsc([d.file_name, mtDate(d.doc_date)].filter(Boolean).join(' · '))}</small></span>
      <em>${vid ? 'sent separately' : 'added to the PDF'}</em></label>`;
  }).join('');
  return { h, b: `<div class="mt-grid">
      ${!MT.d17 ? '<p class="mt-hint mt-f--full">Run MAINTENANCE-D17.sql in Supabase to get all fields of this report.</p>' : ''}
      ${casa && c.kind !== 'sonstiges' ? `<p class="mt-sb__room mt-f--full">${f.room ? `Zimmer <b>${mtEsc(mtRoomLabel(f.room))}</b>` : 'No Zimmer yet'} · set in Edit</p>` : ''}
      ${c.kind === 'renovierung' ? mtRbFieldsBody(c) : c.kind === 'sonstiges' ? mtSoFieldsBody(c, f) : mtSbFieldsBody(c, f)}
      ${mtSbPhotosHTML(c, f)}
      <div class="mt-f mt-f--full"><span class="mt-k">Anlagen</span>
        ${att.length ? `<div class="mt-sbal">${attRows}</div>
          <p class="mt-hint">PDFs that are on are added at the end of the report, so you send one file. Add more with "Document" in the entry.</p>`
          : '<p class="mt-hint">No documents yet. Add an Angebot or an e-mail with "Document" in the entry — it can then go into the report.</p>'}
      </div>
      <div class="mt-f"><label class="mt-k" for="mtS-ort">Unterzeichnungsort</label>
        <input class="mt-in" id="mtS-ort" type="text" maxlength="60" autocomplete="off" placeholder="z. B. Mainz" value="${mtEsc(f.ort || '')}"/></div>
      <div class="mt-f"><label class="mt-k" for="mtS-sdate">Unterzeichnungsdatum</label>
        <input class="mt-in" id="mtS-sdate" type="date" value="${mtEsc(f.signDate || ccTodayISO())}"/></div>
    </div>`,
    f: `<p class="mt-sb__status" id="mtSb-status" role="status" hidden></p>
      <span class="cc-foot-right">
        <button type="button" class="cc-foot-btn" data-mt="sbClose"${f.busy ? ' disabled' : ''}>Close</button>
        <button type="button" class="cc-foot-btn mt-save${f.busy ? ' is-busy' : ''}" id="mtSb-make" data-mt="sbMake" data-cc-pdf="1"${f.busy || up ? ' disabled' : ''}>${f.busy ? '<span class="mt-spin" aria-hidden="true"></span>' : ''}${up ? 'Uploading photos' : 'Create PDF'}</button>
      </span>` };
}
/* Photos: one row each — thumbnail (number in the report) · Beschreibung · (Vorher / Nachher) · in the report · × */
async function mtSbStyle(col, v) {
  const c = mtSbCase();
  if (!c) return;
  if (!MT.d17) { mtSay('Run MAINTENANCE-D17.sql in Supabase first.'); return; }
  const was = c.report_style || null, st = { ...(was || {}), [col]: v };
  c.report_style = st;
  document.querySelectorAll(`#mtSbModal [data-mt="sty"][data-col="${col}"]`).forEach(b => { const on = b.dataset.v === v; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
  const ta = document.querySelector(`#mtSbModal textarea[data-col="${col}"]`);      // D20: the bullets appear / go in the box
  if (ta) { ta.value = v === 'list' ? mtBulletize(ta.value) : mtUnbulletClean(ta.value); ta.dataset.sty = v; mtGrow(ta); }
  const r = await mtTry(() => _ctlSupa.from('maint_cases').update({ report_style: st }).eq('id', c.id));
  if (r.error) { c.report_style = was; mtSay('Not saved. Check the connection.'); }
}
async function mtSbPhase(id, v) {
  const d = MT.docs.find(x => String(x.id) === String(id));
  if (!d || !MT.sb) return;
  if (!MT.d17) { mtSay('Run MAINTENANCE-D17.sql in Supabase first.'); return; }
  const was = d.phase || null, nv = d.phase === v ? null : v;        // tap the chosen one again = none
  d.phase = nv;
  mtSbCapsFlush(); mtSbPhotosRender();
  const r = await mtTry(() => _ctlSupa.from('maint_docs').update({ phase: nv }).eq('id', d.id));
  if (r.error) { d.phase = was; mtSbPhotosRender(); mtSay('Not saved. Check the connection.'); }
}
async function mtSbDelPhoto(id) {
  const d = MT.docs.find(x => String(x.id) === String(id));
  if (!d || !MT.sb) return;
  mtSbCapsFlush();
  MT.docs = MT.docs.filter(x => x !== d);
  MT.sb.askDel = null;
  mtSbPhotosRender();
  const r = await mtTry(() => _ctlSupa.from('maint_docs').delete().eq('id', d.id));
  if (r.error) { MT.docs.push(d); mtSbPhotosRender(); mtSay('Not deleted. Check the connection.'); return; }
  try { await _ctlSupa.storage.from(MT_BUCKET).remove(mtFilesOf(d)); } catch (e) { console.warn('[maintenance] photo file not removed:', e); }
}
async function mtRbKosten(on) {
  const c = mtSbCase(); if (!c) return;
  const was = !!c.rb_kosten; c.rb_kosten = on;
  const r = await mtTry(() => _ctlSupa.from('maint_cases').update({ rb_kosten: on }).eq('id', c.id));
  if (r.error) { c.rb_kosten = was; const cb = document.getElementById('mtR-kosten'); if (cb) cb.checked = was; mtSay('Not saved. Check the connection.'); }
}
/* Every report field → the entry (only what changed). Returns false when it could not be saved. */
async function mtSbFlush() {
  const f = MT.sb, c = mtSbCase();
  if (!f || !c || !f.ready || f.view === 'ready') return true;
  const g = id => document.getElementById(id), patch = {};
  for (const [id, col, kind, need] of MT_SB_FIELDS) {
    const el = g(id);
    if (!el || el.closest('[hidden]')) continue;
    if ((need === 16 && !MT.d16) || (need === 17 && !MT.d17) || (need === 30 && !MT.d30)) continue;
    if (['besichtigung', 'bitte_hv', 'report_ort', 'report_dringend'].includes(col) && !MT.d6) continue;
    let v = kind === 'date' ? (el.value || '') : String(el.value || '').trim();
    if (el.dataset && el.dataset.sty === 'list') v = mtUnbulletClean(el.value);       // D20: saved without the bullets
    if (kind === 'date' && !v && mtNativeVal(el).trim()) { mtSay('Check the date (TT.MM.JJJJ).'); continue; }
    v = v || null;
    if ((c[col] ?? null) !== v) patch[col] = v;
  }
  const sel = g('mtS-art');
  if (sel) {
    const v = (sel.value === '__other' ? String(g('mtS-artx')?.value || '').trim() : sel.value) || null;
    if ((c.schadensart ?? null) !== v) patch.schadensart = v;
  }
  const soSel = g('mtO-art');                                // D30: Sonstiges › Art ("Other" = your own words)
  if (soSel && MT.d30) {
    const v = (soSel.value === '__other' ? String(g('mtO-artx')?.value || '').trim() : soSel.value) || null;
    if ((c.so_art ?? null) !== v) patch.so_art = v;
  }
  const mie = g('mtS-mieter');
  if (mie) {
    f.mieter = mie.value;
    const want = f.mieterAuto ? null : String(mie.value || '').trim();
    if ((c.report_mieter ?? null) !== want) patch.report_mieter = want;
  }
  if (g('mtS-ort')) f.ort = g('mtS-ort').value;
  if (g('mtS-urgent')) f.dringend = g('mtS-urgent').dataset.sty === 'list' ? mtUnbulletClean(g('mtS-urgent').value) : g('mtS-urgent').value;
  if (g('mtS-sdate')) f.signDate = g('mtS-sdate').value || ccTodayISO();
  if (!Object.keys(patch).length) return true;
  const old = {};
  Object.keys(patch).forEach(k => { old[k] = c[k]; });
  Object.assign(c, patch);
  const r = await mtTry(() => _ctlSupa.from('maint_cases').update(patch).eq('id', c.id));
  if (r.error) { Object.assign(c, old); mtSay('Not saved. Check the connection and try again.'); return false; }
  return true;
}
function mtSbChange(t) {
  const g = id => document.getElementById(id);
  if (t.dataset.sbAtt) return mtSbAttToggle(t.dataset.sbAtt, t.checked);
  if (t.dataset.inrep) return mtSbInRep(t.dataset.inrep, t.checked);
  if (t.dataset.cap !== undefined) return mtSbCap(t.dataset.cap, t.value);
  if (t.id === 'mtR-kosten') return mtRbKosten(t.checked);
  if (t.id === 'mtS-sdate') { if (MT.sb) MT.sb.signDate = t.value || ccTodayISO(); return; }
  if (t.id === 'mtS-art') {
    const ob = g('mtS-artxBox'); if (ob) ob.hidden = t.value !== '__other';
    const pb = g('mtS-policeBox'); if (pb) pb.hidden = !/Einbruch/.test(t.value);
    if (t.value === '__other') { g('mtS-artx')?.focus(); return; }
  }
  if (t.id === 'mtO-art') {                                  // D30
    const ob = g('mtO-artxBox'); if (ob) ob.hidden = t.value !== '__other';
    if (t.value === '__other') { g('mtO-artx')?.focus(); return; }
  }
  if (t.id && (t.id.startsWith('mtS-') || t.id.startsWith('mtR-') || t.id.startsWith('mtO-'))) mtSbFlush();
}
/* ── D20 · Points in the box itself (like Word) ─────────────────────────────
   Points: every line starts with "• " · Enter = new bullet · Backspace at a bullet joins the
   line with the one above · pasted lines get bullets. Text: free text. Saved without bullets. */
const MT_BUL = '• ';
const mtUnbulletClean = v => String(v || '').split('\n').map(l => l.replace(/^\s*[•\-–*]\s?/, '').trim()).filter(Boolean).join('\n');
const mtBulletize = v => { const t = mtUnbulletClean(v); return t ? t.split('\n').map(l => MT_BUL + l).join('\n') : ''; };
const mtIsBulletTa = t => !!(t && t.matches && t.matches('#mtSbModal textarea[data-sty="list"]'));
function mtTaSet(el, v, caret) {
  el.value = v;
  try { el.setSelectionRange(caret, caret); } catch (e) {}
  mtGrow(el);
}
function mtBulletKey(e) {
  const el = e.target;
  if (!mtIsBulletTa(el) || e.isComposing) return;
  const a = el.selectionStart, z = el.selectionEnd, v = el.value;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const ins = (a > 0 ? '\n' : '') + MT_BUL;
    mtTaSet(el, v.slice(0, a) + ins + v.slice(z), a + ins.length);
  } else if (e.key === 'Backspace' && a === z) {
    const before = v.slice(0, a);
    if (before.endsWith('\n' + MT_BUL)) { e.preventDefault(); mtTaSet(el, v.slice(0, a - 3) + v.slice(a), a - 3); }
    else if (before === MT_BUL) { e.preventDefault(); mtTaSet(el, v.slice(2), 0); }
  }
}
function mtBulletFix(el) {                                   // after paste / autocorrect: each line keeps its "• "
  const v = el.value;
  if (!v) return;
  const pos = el.selectionStart;
  let shift = 0, at = 0;
  const out = v.split('\n').map(line => {
    const start = at;
    at += line.length + 1;
    if (line.startsWith(MT_BUL)) return line;
    const fixed = MT_BUL + line.replace(/^\s*[•\-–*]\s?/, '');
    if (start <= pos) shift += fixed.length - line.length;
    return fixed;
  }).join('\n');
  if (out !== v) mtTaSet(el, out, Math.max(0, pos + shift));
}

/* ── D20 · Photos: two cards per row — photo (number / "Not in the report", ×), Beschreibung,
   (Vorher | Nachher), "In the report" switch · delete asks on the photo · "Add photo" always there */

/* ── D21 · Photos: one row per photo — thumbnail left (number, ×), a large Beschreibung right;
   a bar below: (Vorher | Nachher) · "In the report" switch — delete asks in that bar.
   "Add photo" is a small link next to "Photos". */
function mtSbPhotosHTML(c, f) {
  const rb = c.kind === 'renovierung';
  const photos = mtSbPhotos(c);
  const u = mtUpFor(c), up = u && u.where === 'sb' ? u : null;
  let n = 0;
  const rows = !f.photosOn ? '' : photos.map(p => {
    const on = p.in_report !== false, id = mtEsc(p.id), ask = f.askDel === String(p.id);
    const vn = rb ? `<span class="mt-pr__vn" role="group" aria-label="Vorher oder Nachher">${['vorher', 'nachher'].map(ph =>
      `<button type="button" class="${p.phase === ph ? 'is-on' : ''}" data-mt="phase" data-id="${id}" data-v="${ph}" aria-pressed="${p.phase === ph}">${ph === 'vorher' ? 'Vorher' : 'Nachher'}</button>`).join('')}</span>` : '';
    const bar = ask
      ? `<span class="mt-pr__ask">Delete this photo?</span><span class="mt-pr__btns"><button type="button" class="mt-pr__del" data-mt="sbDelYes" data-id="${id}">Delete</button><button type="button" class="mt-pr__keep" data-mt="sbDelNo">Keep</button></span>`
      : vn + `<label class="mt-pr__sw"><span>${on ? 'In the report' : 'Not in the report'}</span><input type="checkbox" data-inrep="${id}"${on ? ' checked' : ''}/><span class="mt-swi" aria-hidden="true"></span></label>`;
    return `<div class="mt-pr${on ? '' : ' is-off'}${ask ? ' is-ask' : ''}">
        <div class="mt-pr__t">
          <div class="mt-pr__th"><img alt="" loading="lazy" data-path="${mtEsc(p.file_path)}" data-thumb="${mtEsc(mtThumbPath(p.file_path))}"/>${on ? `<span class="mt-pr__no">${++n}</span>` : ''}${ask ? '' : `<button type="button" class="mt-pr__x" data-mt="sbDelPhoto" data-id="${id}" aria-label="Delete photo"><i class="ti ti-x" aria-hidden="true"></i></button>`}</div>
          <div class="mt-pr__tx"><label class="mt-k" for="mtCap-${id}">Beschreibung</label>
            <textarea class="mt-in mt-ta mt-pr__cap" id="mtCap-${id}" rows="3" maxlength="200" data-cap="${id}" placeholder="Beschreibung (optional)">${mtEsc(p.caption || '')}</textarea></div>
        </div>
        <div class="mt-pr__bar${vn && !ask ? ' has-vn' : ''}">${bar}</div>
      </div>`;
  }).join('');
  return `<div class="mt-f mt-f--full" id="mtSb-photos">
      <div class="mt-pr__hd"><span class="mt-k">Photos${photos.length ? ' · ' + photos.length : ''}</span>
        ${up ? '' : '<button type="button" class="mt-link mt-pr__add" data-mt="sbAddPhoto"><i class="ti ti-camera" aria-hidden="true"></i>Add photo</button>'}</div>
      <div class="mt-seg" role="group" aria-label="Photos in the report">
        <button type="button" class="mt-seg__b${f.photosOn ? '' : ' is-on'}" data-mt="sbFotos" data-v="0" aria-pressed="${!f.photosOn}">Without photos</button>
        <button type="button" class="mt-seg__b${f.photosOn ? ' is-on' : ''}" data-mt="sbFotos" data-v="1" aria-pressed="${!!f.photosOn}">With photos</button>
      </div>
      ${up ? `<p class="mt-up" role="status"><span class="mt-spin" aria-hidden="true"></span>${up.what ? mtEsc(up.what) + ' · ' : 'Uploading '}${Math.min(up.done + 1, up.total)} of ${up.total}</p>` : ''}
      ${rows ? `<div class="mt-prl">${rows}</div>` : ''}
      <p class="mt-hint">${f.photosOn ? 'Switch a photo off to leave it out. The number is its place in the report.' + (rb ? ' Vorher / Nachher sorts them.' : '')
        : (photos.length ? 'The report goes without photos. Choose "With photos" to show them.' : 'A new photo turns on "With photos".')}</p>
    </div>`;
}
function mtSbRenumber() {
  let n = 0;
  document.querySelectorAll('#mtSbModal .mt-pr').forEach(row => {
    const cb = row.querySelector('[data-inrep]'), th = row.querySelector('.mt-pr__th'), lbl = row.querySelector('.mt-pr__sw > span:first-child');
    if (!cb || !th) return;
    row.classList.toggle('is-off', !cb.checked);
    th.querySelector('.mt-pr__no')?.remove();
    if (cb.checked) th.insertAdjacentHTML('beforeend', `<span class="mt-pr__no">${++n}</span>`);
    if (lbl) lbl.textContent = cb.checked ? 'In the report' : 'Not in the report';
  });
}

/* ── D22 · Both tabs together: a slim white strip under the tabs, the same in both tabs ── */
/* D38 · the slim bar under the tabs (pinned): year pill ‹ 2026 › · this tab's sum for the year + what is open */
function mtBarHTML(sum, counts) {
  const yy = mtSumYear(), yrs = mtListYears(), yi = yrs.indexOf(yy);
  return `<div class="mt-ybar">
      <div class="mt-ypill" role="group" aria-label="Year">
        <button type="button" class="mt-ypill__a" data-mt="yrGo" data-v="prev" aria-label="Previous year"${yi < yrs.length - 1 ? '' : ' disabled'}><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
        <label class="mt-ypill__y"><select data-mt-year aria-label="Year">${yrs.map(v => `<option value="${v}"${v === yy ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <button type="button" class="mt-ypill__a" data-mt="yrGo" data-v="next" aria-label="Next year"${yi > 0 ? '' : ' disabled'}><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
      </div>
      <span class="mt-ybar__r"><b>${mtEur(sum)}</b><span>${mtEsc(counts)}</span></span>
    </div>`;
}
/* D38 · under the title: all tabs of the year (· the tab's all-time total when it differs) + PDF / Invoices */
function mtMetaHTML(tabYear, tabTotal) {
  const ids = MT.cases.map(c => c.id), yy = mtSumYear();
  return `<div class="mt-meta"><span>All tabs <em>${mtEur(mtCost(ids, yy))}</em>${Math.abs(tabTotal - tabYear) > 0.004 ? ` · Total <em>${mtEur(tabTotal)}</em>` : ''}</span>
      <span class="mt-meta__chips">${mtPdfChip('pdfYear', '', mtHasCosts(ids.map(String), yy))}${mtInvChip(mtHasInvoiceFiles(ids.map(String), yy))}</span></div>`;
}
/* ── D39 (Nov 2026) · Pop-ups: one shell each, built once ──────────────────────────────────────────────
   mtModal(id, o) builds a pop-up the first time (backdrop · sheet with header, body, footer) and returns it;
   later renders fill only the inner parts (mtModalFill), so the sheet stays the same element: its slide-in plays
   once, the field you are in keeps the focus (and the cursor) and the body keeps its scroll.
   o = { cls, close: data-mt of the backdrop, label: id of the title }. A pop-up stacked on another one (a sheet with
   its own z-index over the receipt) uses the same helpers; .mt-modal--fit keeps a sheet at its own height on phones. */
function mtModal(id, o) {
  let m = document.getElementById(id);
  if (m) return m;
  m = document.createElement('div');
  m.id = id; m.className = 'mt-modal' + (o.cls ? ' ' + o.cls : '');
  m.innerHTML = `<div class="mt-modal__bg" data-mt="${mtEsc(o.close || '')}"></div>
    <div class="mt-modal__s" role="dialog" aria-modal="true"${o.label ? ` aria-labelledby="${mtEsc(o.label)}"` : ''}><div class="mt-modal__h"></div><div class="mt-modal__b"></div><div class="mt-modal__f"></div></div>`;
  const sh = m.querySelector('.mt-modal__s');
  sh.addEventListener('animationend', e => { if (e.target === sh) m.classList.add('is-shown'); });   // it never slides in twice
  // D39 fix: the field you type in (and when it lost the focus, with its cursor) — "Keep editing" in a question gives it back
  m.addEventListener('focusin', e => { const t = e.target; if (t.matches && t.matches(MT_ED_FIELD)) m._fld = { el: t, id: t.id, out: 0, sel: null }; });
  m.addEventListener('focusout', e => { const f = m._fld; if (f && f.el === e.target) { f.out = Date.now(); f.sel = mtSelOf(e.target); } });
  document.body.appendChild(m);
  mtLockSync();
  return m;
}
function mtModalDrop(id) { const m = document.getElementById(id); if (m) { m.remove(); mtLockSync(); } }
/* Fill a pop-up's parts { h, b, f } (HTML; a part left out stays). keep = the same form as before → the body's scroll
   and the focused field (with its selection) come back. after(m) runs before that (e.g. to move the footer). */
function mtModalFill(m, parts, keep, after) {
  const q = k => m.querySelector(':scope > .mt-modal__s > .mt-modal__' + k);
  const b = q('b'), top = keep && b ? b.scrollTop : 0;
  const ae = document.activeElement, fid = keep && ae && ae.id && m.contains(ae) ? ae.id : '';
  let sel = null;
  try { if (fid && typeof ae.selectionStart === 'number') sel = [ae.selectionStart, ae.selectionEnd, ae.selectionDirection || 'none']; } catch (_) {}
  if (parts.h !== undefined && m._h !== parts.h) { q('h').innerHTML = parts.h; m._h = parts.h; }
  if (parts.b !== undefined && b) b.innerHTML = parts.b;
  if (parts.f !== undefined) q('f').innerHTML = parts.f;
  if (after) after(m);
  if (b) b.scrollTop = top;
  const el = fid ? document.getElementById(fid) : null;
  if (el && el !== document.activeElement && m.contains(el)) {
    try { el.focus({ preventScroll: true }); if (sel) el.setSelectionRange(sel[0], sel[1], sel[2]); } catch (_) {}
  }
}

/* ── D39 · The page behind a pop-up is locked, like the calendar does it (cc-german-format.js B24) ───────────
   While a pop-up (.mt-modal) or the camera is open the body is position:fixed at −scrollY: nothing can move the
   page (the iPhone keyboard, a redraw behind the pop-up) and it comes back exactly where it was on the last close.
   The pinned header and year bar keep their place (moved back by what they moved, if the browser lets them go).
   A classic scrollbar's width stays taken by the body (bug 9: no sideways shift; the dimmed backdrop still covers
   the whole window — with scrollbar-gutter a strip beside it stayed un-dimmed and short pages sat off-centre).
   mtPageY / mtPageTo read and set the page position in both states (mtAnchor / mtRestore work while locked).
   On phones the open sheet follows window.visualViewport (the keyboard): it sits in the visible part and its body
   scrolls the field into view, so iOS has no reason to pan the page ("jumps up, then returns"). */
const MT_LOCK = { on: false, y: 0, prev: null, stick: [], back: null };
const MT_STICKY = '.cc-header, .mt-ybar';
const mtStickEls = () => [...document.querySelectorAll(MT_STICKY)].filter(el => el.getClientRects().length);
const mtPageY = () => (MT_LOCK.on ? MT_LOCK.y : window.scrollY);
function mtPageTo(y) {
  y = Math.max(0, y);
  if (MT_LOCK.on) { MT_LOCK.y = y; document.body.style.top = -y + 'px'; mtLockStick(); return; }
  if (MT_LOCK.back) MT_LOCK.back.y = y;                     // just closed: the place to come back to moves along
  window.scrollTo({ top: y, left: 0, behavior: 'instant' });
}
function mtLockStick() {
  if (!MT_LOCK.on) return;
  MT_LOCK.stick.forEach(s => {
    const el = mtStickEls().find(x => x.matches(s.k));
    if (!el) return;
    el.style.transform = '';
    const d = s.top - el.getBoundingClientRect().top;
    if (Math.abs(d) > 0.5) el.style.transform = `translateY(${d}px)`;
  });
}
function mtLockSync(force) {
  const want = !!(force || document.querySelector('.mt-modal, #mtCam'));
  const html = document.documentElement, bd = document.body, shell = document.getElementById('appShell');
  // Nov 2026 (D39 fix): pop-ups stacked on another (Who pays over the receipt) → only the top one takes the focus and
  // the keys; the one below waits, as the page behind does (no Tab into a Save you can't see)
  const ms = [...document.querySelectorAll('.mt-modal')], zOf = x => Number(getComputedStyle(x).zIndex) || 0;
  const top = ms.reduce((a, x) => (!a || zOf(x) >= zOf(a) ? x : a), null);
  ms.forEach(x => { const v = x !== top; if (x.inert !== v) x.inert = v; });
  if (want && !MT_LOCK.on) {
    const y = window.scrollY;
    const tops = mtStickEls().map(el => ({ k: el.matches('.mt-ybar') ? '.mt-ybar' : '.cc-header', top: el.getBoundingClientRect().top }));
    const sbw = Math.max(0, window.innerWidth - html.clientWidth);   // bug 9: a classic scrollbar (laptop) — its width stays taken
    html.classList.add('mt-modal-open');
    if (getComputedStyle(bd).position === 'fixed') return;  // someone else holds the page already
    MT_LOCK.prev = { position: bd.style.position, top: bd.style.top, left: bd.style.left, right: bd.style.right, width: bd.style.width };
    Object.assign(bd.style, { position: 'fixed', top: -y + 'px', left: '0', right: '0', width: sbw ? `calc(100% - ${sbw}px)` : '100%' });
    Object.assign(MT_LOCK, { on: true, y, back: null, stick: tops });
    mtLockStick();
    if (shell) shell.inert = true;                           // nothing behind the pop-up takes the focus
    mtVV(true);
  } else if (!want && (MT_LOCK.on || html.classList.contains('mt-modal-open'))) {
    html.classList.remove('mt-modal-open');
    if (!MT_LOCK.on) return;
    const y = MT_LOCK.y;
    Object.assign(MT_LOCK, { on: false, stick: [] });
    document.querySelectorAll(MT_STICKY).forEach(el => { el.style.transform = ''; });
    Object.assign(bd.style, MT_LOCK.prev || {});
    if (shell) shell.inert = false;
    mtVV(false);
    window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    // the iPhone may still move the page while its keyboard closes → back to the place (unless you scroll yourself)
    const back = MT_LOCK.back = { y };
    [80, 400].forEach(ms => setTimeout(() => {
      if (MT_LOCK.back === back && !MT_LOCK.on && Math.abs(window.scrollY - back.y) > 2) window.scrollTo({ top: back.y, left: 0, behavior: 'instant' });
    }, ms));
    setTimeout(() => { if (MT_LOCK.back === back) MT_LOCK.back = null; }, 600);
  } else if (want) html.classList.add('mt-modal-open');
}
['touchstart', 'wheel', 'keydown'].forEach(t => document.addEventListener(t, () => { if (!MT_LOCK.on) MT_LOCK.back = null; }, { capture: true, passive: true }));
/* The calendar opened on top of a pop-up: the page is held here, so the calendar must not move it on close (it noted
   scrollY 0 under the fixed body, and its late retries would send the page to the top after the pop-up closed) */
new MutationObserver(ms => { if (MT_LOCK.on) ms.forEach(m => m.addedNodes.forEach(n => { if (n.id === 'ccCal') n._sy = undefined; })); })
  .observe(document.body, { childList: true });
/* visualViewport → --mt-vvh / --mt-vvt (used by the phone CSS): the sheet stays in the part you see */
function mtVV(on) {
  const vv = window.visualViewport, st = document.documentElement.style;
  if (!vv) return;
  if (on) { vv.addEventListener('resize', mtVVResize); vv.addEventListener('scroll', mtVVMove); mtVVMove(); return; }
  vv.removeEventListener('resize', mtVVResize); vv.removeEventListener('scroll', mtVVMove);
  st.removeProperty('--mt-vvh'); st.removeProperty('--mt-vvt');
}
function mtVVMove() {
  const vv = window.visualViewport, st = document.documentElement.style;
  if (!vv || !MT_LOCK.on) return;
  st.setProperty('--mt-vvh', vv.height + 'px');
  st.setProperty('--mt-vvt', vv.offsetTop + 'px');
}
function mtVVResize() { mtVVMove(); requestAnimationFrame(mtVVField); }
function mtVVField() {                                       // the field you type in stays in view — its sheet scrolls, not the page
  const a = document.activeElement, b = a && a.closest && a.closest('.mt-modal__b');
  if (!b) return;
  const r = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  if (r.bottom > rb.bottom - 8) b.scrollTop += r.bottom - rb.bottom + 12;
  else if (r.top < rb.top + 8) b.scrollTop -= rb.top - r.top + 12;
}

/* ── D22 · The receipt form as a pop-up (new receipt, a receipt row, a return) ──
   D39: built once — later renders fill its header / body / footer in place (no new slide-in; focus and scroll stay).
   A redraw in the background (MT.bg: a save or an upload) leaves a form that is showing exactly as it is. */
function mtCostModalSync() {
  const s = MT.sel;
  if (s && s.cost) return;
  mtWhoNestDrop(null);                                       // D39 fix: a Who pays sheet of that receipt never stays alone
  mtModalDrop('mtCostModal');
}
function mtWhoNestDrop(f) { if (MT.who && MT.who.nest && MT.who.f !== f) { MT.who = null; mtModalDrop('mtWhoModal'); } }
function mtCostModalRender() {
  const s = MT.sel, f = s && s.cost, c = s && !s.isNew ? mtCase(s.id) : null;
  mtWhoNestDrop(f);                                          // D39 fix: another form in the pop-up → its Who pays sheet goes
  if (!f || !c) { mtCostModalSync(); mtDraftClosed(); return; }
  mtDraftSoon();
  const m = mtModal('mtCostModal', { close: 'costCancel', label: 'mtCostT' });
  const same = m.dataset.fid === String(f.id);
  if (!(MT.bg && same)) {
    const ret = !!f.return_of;
    const kk = ret ? (f.isNew ? 'New return' : 'Return') : (f.isNew ? 'New receipt' : 'Receipt');
    const h = `<div><p class="mt-modal__k">${kk}</p><p class="mt-modal__t" id="mtCostT">${mtEsc(c.title)}</p>
          <p class="mt-modal__sub">${mtEsc([mtPropName(c), mtWhere(c)].filter(Boolean).join(' · '))}</p></div>
        <button type="button" class="mt-modal__x" data-mt="costCancel" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button>`;
    const body = mtCostFormHTML(f);
    if (same && m._b === body) mtModalFill(m, { h }, true);  // nothing changed (the fields already show it)
    else mtModalFill(m, { h, b: body }, same, mm => {
      const foot = mm.querySelector('#mtC-form > .cc-sec-foot'), mf = mm.querySelector(':scope > .mt-modal__s > .mt-modal__f');
      const st = document.createElement('p'); st.className = 'mt-sb__status'; st.id = 'mtC-stat'; st.setAttribute('role', 'status'); st.hidden = true;
      if (mf) mf.replaceChildren(...[st, foot].filter(Boolean));   // Cancel · Save (· Delete · Return) at the bottom of the pop-up
    });
    m._b = body;
    m.dataset.fid = String(f.id);
  }
  mtCostStat(m, f, c);
  mtCostHoldShow();
}
/* D39 · "Save + next": while the last receipt's photos still upload, the next form says so in its footer */
function mtCostStat(m, f, c) {
  const p = m.querySelector('#mtC-stat');
  if (!p) return;
  const u = MT.up && MT.up.where === 'costs' && MT.up.costId && String(MT.up.costId) !== String(f.id) && String(MT.up.caseId) === String(c.id) ? MT.up : null;
  const t = u ? `The last receipt: ${u.what || 'uploading'} · ${Math.min(u.done + 1, u.total)} of ${u.total}` : '';
  if (p.textContent !== t) p.textContent = t;
  p.hidden = !t;
}

/* ── D39 (Nov 2026) · "Who pays?" per receipt (Casa Castel receipts only · MAINTENANCE-D39.sql) ─────────────────────
   Each receipt row has a small tag under its amount — its own tap (the row itself still edits the receipt):
     NK              → in the NK-Abrechnung (Teil A) under a cost type (none = Allgemeine Hauskosten)
     Kleinreparatur  → Teil B1 · Mietvertrag § 7: only up to 150 € per case, on the NET (receipt − its returns)
     Schaden         → Teil B2
     Where           Gemeinschaftsfläche (Kleinreparatur: every Zimmer rented on the receipt date · Schaden: the Zimmer
                     that caused it) or one Zimmer · Payment: with the NK-Abrechnung, or Direct (Paid on … / open)
     no tag          → you pay
   The sheet #mtWhoModal is a small pop-up of its own (z-index 450: over the receipt pop-up, under the calendar).
   From the tag its Save stores at once (the row shows it first, back on an error); from the receipt pop-up ("nested")
   its Save only fills the receipt form, stored with the receipt's own Save. Opening it never redraws the entry behind
   (nothing moves); it is built once per open and later only its buttons change in place (mtMorph: no blink, the
   focus stays). No typing in it: "Paid on" is the app's date field, set with the calendar. */
const MT_WHO_KEYS = ['pay_type', 'pay_cat', 'pay_where', 'pay_rooms', 'pay_via', 'pay_paid_on'];
const MT_WHO_MAX = 150;                                      // § 7: a Kleinreparatur is at most 150 € (NET) per case
const MT_WHO_SQL = /pay_(type|cat|where|rooms|via|paid_on)|maint_refund_of|maint_pay|nk_keep/i;   // "run MAINTENANCE-D39.sql"
const mtWhoOn = c => !!(MT.d39 && c && mtIsCasa(c.property_id));
const mtWhoD = v => (typeof ccParseDate === 'function' && ccParseDate(v)) || mtIso(v);   // TT.MM.JJJJ, ISO, timestamps
/* Cost types, tenants and the locked Settlements years — loaded once; what fails is simply left out */
async function mtWhoLoad() {
  const sb = _ctlSupa;
  const rows = q => { try { return Promise.resolve(q()).then(r => (r && !r.error && Array.isArray(r.data) ? r.data : null), () => null); } catch (e) { return Promise.resolve(null); } };
  const [cats, ten, locks] = await Promise.all([
    rows(() => sb.from('ctrl_castel_categories').select('*').order('sort_order')),
    rows(() => sb.from('tenant_records').select('room,status,mietbeginn,mietende')),
    rows(() => sb.from('nk_abrechnung_casa').select('year,period_from,period_to,locked_at,tb:snapshot->input->teilB').not('locked_at', 'is', null)),
  ]);
  MT.whoCats = cats ? cats.slice().sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)) : null;
  MT.whoTen = ten;
  MT.whoLock = locks ? locks.filter(x => x && x.locked_at).map(x => ({ year: x.year, from: mtWhoD(x.period_from), to: mtWhoD(x.period_to),
    ids: new Set((Array.isArray(x.tb) ? x.tb : []).map(p => String(p && p.id))) })) : null;
}
/* the pay_* fields of a row / form (missing = null) */
function mtWhoPick(r) {
  r = r || {};
  return { pay_type: r.pay_type ?? null, pay_cat: r.pay_cat ?? null, pay_where: r.pay_where ?? null,
    pay_rooms: Array.isArray(r.pay_rooms) ? r.pay_rooms.slice() : null, pay_via: r.pay_via ?? null, pay_paid_on: r.pay_paid_on ?? null };
}
/* NET = the receipt (amount = what is typed in its form) − its returns, never below 0 */
function mtNet(r, amount) {
  const back = r && r.id ? mtReturnsOf(r.id).reduce((a, t) => a + mtNum(t.amount), 0) : 0;
  return Math.max(0, mtNum(mtNum(amount === undefined ? r.amount : amount) - back));
}
/* room names: as in Casa Castel › Rooms ("New york" = "New York"), once each, in the rooms' order */
const mtRoomCanon = n => MT.rooms.find(x => mtNorm(x) === mtNorm(n)) || String(n || '').trim();
function mtRoomSort(list) {
  const at = n => { const i = MT.rooms.indexOf(n); return i < 0 ? 1e6 : i; };
  return [...new Set((list || []).map(mtRoomCanon).filter(Boolean))].sort((a, b) => at(a) - at(b));
}
/* a row / form → the choice { t, cat, w, r, v, p } (the sheet works on this) */
function mtWhoFrom(src) {
  const p = mtWhoPick(src), t = ['nk', 'klein', 'schaden'].includes(p.pay_type) ? p.pay_type : null;
  const r = mtRoomSort(p.pay_rooms), tb = t === 'klein' || t === 'schaden';
  const w = p.pay_where === 'zimmer' || p.pay_where === 'gemein' ? p.pay_where : tb ? (r.length === 1 ? 'zimmer' : 'gemein') : null;   // as Settlements reads it
  return { t, cat: t === 'nk' ? p.pay_cat : null, w, r, v: p.pay_via === 'direct' ? 'direct' : 'nk', p: p.pay_paid_on ? String(p.pay_paid_on).slice(0, 10) : null };
}
/* Who lives in a Zimmer when — the tenancy rule of Controlling (_cxTenancies): tenant_records.room (matched normalised),
   from = Mietbeginn, to = Mietende, else active → open end, else (former) the day before the next move-in there or today */
function mtWhoWins(room) {
  const today = ccTodayISO();
  const ws = (MT.whoTen || []).filter(t => mtNorm(t.room) === mtNorm(room))
    .map(t => ({ t, from: mtWhoD(t.mietbeginn), to: mtWhoD(t.mietende) })).filter(w => w.from)
    .sort((a, b) => a.from.localeCompare(b.from));
  ws.forEach((w, i) => {
    if (w.to) return;
    if (w.t.status === 'active') { w.to = '9999-12-31'; return; }
    const next = ws.slice(i + 1).find(x => x.from > w.from);
    w.to = next ? mtAddDays(next.from, -1) : today;
  });
  return ws;
}
/* the Zimmer on a day: rented (anyone living there) · vacant · known = false when the tenants could not be loaded */
function mtWhoRooms(day) {
  const all = MT.rooms.slice(), d = String(day || ccTodayISO()).slice(0, 10);
  if (!MT.whoTen) return { all, rented: all.slice(), vacant: [], known: false };
  const rented = all.filter(n => mtWhoWins(n).some(w => w.from <= d && d <= w.to));
  return { all, rented, vacant: all.filter(n => !rented.includes(n)), known: true };
}
/* the choice → the 6 pay_* fields in the normal form of the data contract: nk → type + cat · klein / schaden → type,
   where, rooms, via ('nk' | 'direct'), paid on (Direct only) · you pay → all null. day = the receipt date: a
   Kleinreparatur on the Gemeinschaftsfläche is shared by the Zimmer rented that day. key = only to compare (that list out). */
function mtWhoNorm(s, day, key) {
  const out = { pay_type: null, pay_cat: null, pay_where: null, pay_rooms: null, pay_via: null, pay_paid_on: null };
  if (s.t === 'nk') return Object.assign(out, { pay_type: 'nk', pay_cat: s.cat ?? null });
  if (s.t !== 'klein' && s.t !== 'schaden') return out;
  const w = s.w === 'zimmer' ? 'zimmer' : 'gemein', direct = s.v === 'direct';
  let rooms;
  if (s.t === 'klein' && w === 'gemein') rooms = key ? null : mtWhoKleinRooms(s.had || s.r, day);   // the sheet: the rooms it had (never its picks)
  else rooms = w === 'zimmer' ? s.r.slice(0, 1) : s.r.slice();
  return Object.assign(out, { pay_type: s.t, pay_where: w, pay_rooms: rooms, pay_via: direct ? 'direct' : 'nk', pay_paid_on: direct ? (s.p || null) : null });
}
const mtWhoKey = f => JSON.stringify(mtWhoNorm(mtWhoFrom(f), null, true));
/* Kleinreparatur on the Gemeinschaftsfläche: the Zimmer rented that day (tenants not loaded: the ones it had, else all) */
function mtWhoKleinRooms(had, day) { const R = mtWhoRooms(day); return R.known || !had.length ? R.rented : had.slice(); }
/* "NK 2026": the Casa Castel NK period with this date (its start from Controlling, like ctlPeriodOf) → the year it ends */
function mtWhoYear(day) {
  const p = mtProp(MT_CASA_ID) || MT.props.find(x => mtIsCasa(x.id)) || {};
  const st = /^\d{2}-\d{2}$/.test(String(p.nk_period_start || '')) ? p.nk_period_start : '01-01';
  const d = String(day || ccTodayISO()).slice(0, 10);
  let y = Number(d.slice(0, 4)); if (d < y + '-' + st) y--;
  return st === '01-01' ? y : y + 1;
}
/* already billed? a locked NK year in Settlements: its Teil B holds this receipt · or (NK) the receipt's date is in it */
function mtWhoLockOf(r) {
  if (!r || !MT.whoLock) return '';
  const t = r.pay_type, d = String(r.cost_date || '').slice(0, 10);
  const L = MT.whoLock.find(x => (t === 'klein' || t === 'schaden') ? x.ids.has(String(r.id)) : t === 'nk' && !!x.from && x.from <= d && d <= x.to);
  return L ? `Billed in NK ${L.year} · locked in Settlements` : '';
}
/* D39 fix · a locked NK year can't take anything new: the locked period of a date (or null) · and the one a choice
   would need although it can't bill it any more — NK (Teil A) on a date in it, or a Kleinreparatur / Schaden with
   the NK-Abrechnung that is not in its snapshot. p = the pay_* fields (normal form). */
function mtWhoYrOf(day) {
  const d = String(day || '').slice(0, 10);
  return (d && MT.whoLock && MT.whoLock.find(x => !!x.from && x.from <= d && d <= x.to)) || null;
}
function mtWhoYrBar(p, id, day) {
  const L = mtWhoYrOf(day);
  if (!L || !p) return null;
  if (p.pay_type === 'nk') return L;
  return (p.pay_type === 'klein' || p.pay_type === 'schaden') && p.pay_via !== 'direct' && !L.ids.has(String(id)) ? L : null;
}
const mtWhoCatAll = () => (MT.whoCats || []).filter(c => c.code !== 'RATE' && c.nk_key !== 'none');   // like Controlling's NK cost types
function mtWhoCatName(id) {
  if (id === null || id === undefined || id === '') return 'Allgemeine Hauskosten';
  const c = (MT.whoCats || []).find(x => String(x.id) === String(id));
  return c ? c.name : '';
}
/* the cost types shown first: the 4 used most (else the first by order) + the chosen one; "more …" adds the rest */
function mtWhoCatIds(sel) {
  const cats = mtWhoCatAll(), use = {};
  MT.costs.forEach(r => { if (!r.return_of && r.pay_type === 'nk' && r.pay_cat !== null && r.pay_cat !== undefined) use[r.pay_cat] = (use[r.pay_cat] || 0) + 1; });
  const top = cats.slice().sort((a, b) => (use[b.id] || 0) - (use[a.id] || 0)).slice(0, 4);   // stable: ties keep the order
  const cur = sel === null || sel === undefined ? null : cats.find(c => String(c.id) === String(sel));
  if (cur && !top.includes(cur)) top.push(cur);
  return top.map(c => String(c.id));
}
/* D39 fix · "Book in Controlling" off (the receipt's or the entry's switch): no Controlling line → NK never reaches Teil A
   and a tenant's direct payment is deducted nowhere (MAINTENANCE-D39.sql books neither); Teil B reads the receipt itself */
const mtWhoOff = (c, r) => !!((c && c.book_ctrl === false) || (r && r.book_ctrl === false));
/* the tag: { t: text, k: unset · nk · set · bad } — bad = a Kleinreparatur over 150 € (NET), no Zimmer, or NK while the
   receipt is not in Controlling (it has no effect then) */
function mtWhoTag(s, net, off) {
  if (!s.t) return { t: '+ Who pays', k: 'unset' };
  if (s.t === 'nk') { const n = mtWhoCatName(s.cat); return { t: n ? 'NK · ' + n : 'NK', k: off ? 'bad' : 'nk' }; }
  if (s.t === 'klein' && net > MT_WHO_MAX + 0.004) return { t: 'Kleinrep. >150 €', k: 'bad' };
  const head = s.t === 'klein' ? 'Kleinrep.' : 'Schaden';
  if (!s.r.length) return { t: head + ' · no Zimmer', k: 'bad' };
  const where = s.t === 'klein' && s.w !== 'zimmer' ? 'Gemeinschaft' : s.r.length >= 3 ? s.r.length + ' Zimmer' : s.r.join(', ');
  return { t: head + ' · ' + where + (s.v === 'direct' ? (s.p ? ' · paid' : ' · open') : ''), k: 'set' };
}
const mtWhoAria = (k, off) => 'Who pays: ' + (k.k === 'unset' ? 'not set (you pay)' : k.t) + (off && k.k === 'bad' && /^NK/.test(k.t) ? ' · not in Controlling' : '');
function mtWhoTagHTML(r, tap) {
  const off = mtWhoOff(mtCase(r.case_id), r), k = mtWhoTag(mtWhoFrom(r), mtNet(r), off), id = mtEsc(r.id);
  return tap ? `<button type="button" class="mt-who mt-who--${k.k}" data-mt="whoPays" data-id="${id}" aria-label="${mtEsc(mtWhoAria(k, off))}">${mtEsc(k.t)}</button>`
             : `<span class="mt-who mt-who--${k.k}" data-id="${id}">${mtEsc(k.t)}</span>`;   // rows are inert (another form is open)
}
/* the quiet row in the receipt pop-up: Who pays  <tag>  › */
function mtCostWhoRowHTML(f) {
  const off = mtWhoOff(MT.sel ? mtCase(MT.sel.id) : null, f), k = mtWhoTag(mtWhoFrom(f), mtNet(f, f.amount), off);
  return `<button type="button" class="mt-wrow" id="mtC-whorow" data-mt="whoNest" aria-label="${mtEsc(mtWhoAria(k, off))}"><span>Who pays</span><span class="mt-wrow__r"><span class="mt-who mt-who--${k.k}">${mtEsc(k.t)}</span><span class="mt-wrow__c" aria-hidden="true">›</span></span></button>`;
}
function mtCostWhoSync() {                                    // the row follows the form in place (amount typed, sheet saved)
  const box = document.getElementById('mtC-whobox'), f = MT.sel && MT.sel.cost;
  if (!box || !f) return;
  mtCostCapture();
  mtMorph(box, mtCostWhoRowHTML(f));
}

/* ── the sheet ── */
/* from the tag of a stored receipt: its Save stores at once */
function mtWhoOpen(id) {
  const c = mtOpenCase(), r = mtCostById(id);
  if (!c || !r || r.return_of || String(r.case_id) !== String(c.id) || !mtWhoOn(c) || MT.who) return;
  if (MT.busy) { mtBusySay(); return; }                      // a save / upload is running → wait (and say so)
  if (mtActive(c)) return;                                   // another form is open (its rows are inert anyway)
  MT.who = mtWhoState(r, c, { id: String(r.id), nest: false, day: String(r.cost_date || ccTodayISO()).slice(0, 10), net: mtNet(r),
    what: String(r.description || '').trim() || c.title, lock: mtWhoLockOf(r), off: mtWhoOff(c, r) });
  mtWhoRender();                                             // no panel redraw: the page behind stays exactly as it is
}
/* from the receipt pop-up: its Save fills the form (stored with the receipt's Save) */
function mtWhoNest() {
  const s = MT.sel, f = s && s.cost, c = s && !s.isNew ? mtCase(s.id) : null;
  if (!f || !c || f.return_of || !mtWhoOn(c) || MT.costHold === f || MT.who) return;
  mtCostCapture();                                           // the amount / date / What as typed right now
  const stored = f.isNew ? null : mtCostById(f.id);
  MT.who = mtWhoState(f, c, { id: String(f.id), nest: true, f, day: String(f.cost_date || ccTodayISO()).slice(0, 10), net: mtNet(f, f.amount),
    what: String(f.description || '').trim() || c.title, lock: stored ? mtWhoLockOf(stored) : '', off: mtWhoOff(c, f) });
  mtWhoRender();
}
function mtWhoState(src, c, o) {
  const W = Object.assign({ caseId: c.id, room0: c.report_room || null, more: false }, o, mtWhoFrom(src));
  // D39 fix: a stored Kleinreparatur on the Gemeinschaftsfläche keeps its Zimmer apart (had): they follow the tenants, so they
  // are never picks (e.g. for "Caused by") — and earlier picks ("Caused by") never become its Zimmer
  W.had = W.t === 'klein' && W.w === 'gemein' ? W.r.slice() : [];
  if (W.t === 'klein' && W.w === 'gemein') W.r = [];
  W.cats = mtWhoCatIds(W.cat);
  W.yr = W.lock ? null : mtWhoYrOf(W.day);                    // D39 fix: its NK year is locked → no NK, no "With NK-Abrechnung"
  return W;
}
const mtWhoViaOff = W => !!W.yr && !W.yr.ids.has(String(W.id));   // that year's NK-Abrechnung can't bill it any more
/* Kleinreparatur / Schaden chosen: Where from the entry's Ort (a Zimmer → that Zimmer · Gemeinschaftsfläche) */
function mtWhoPrefill(W) {
  const v = W.room0;
  if (v && v !== MT_SB_ALL) { W.w = 'zimmer'; const o = mtWhoOrt(W); W.r = o ? [o] : []; } else W.w = 'gemein';
}
/* D39 fix: the entry's Zimmer is chosen for you only when someone lives there on the receipt date (or the tenants could
   not be loaded) — a vacant Zimmer is never picked (its chip is off: "Choose the Zimmer") */
function mtWhoOrt(W) {
  const v = W.room0;
  if (!v || v === MT_SB_ALL) return null;
  const n = mtRoomCanon(v), R = mtWhoRooms(W.day);
  return !R.known || R.rented.includes(n) ? n : null;
}
const mtWhoOver = W => W.net > MT_WHO_MAX + 0.004;
const mtWhoPayRooms = W => (W.t === 'klein' && W.w !== 'zimmer' ? (W.lock && W.had.length ? W.had.slice() : mtWhoKleinRooms(W.had, W.day))   // locked: as billed
  : W.w === 'zimmer' ? W.r.slice(0, 1) : W.r.slice());
const mtWhoVac = W => { const R = mtWhoRooms(W.day); return R.known ? mtWhoPayRooms(W).filter(n => !R.rented.includes(n)) : []; };   // chosen, but vacant that day
/* what keeps Save off: '' · lock · over (Kleinreparatur > 150 €) · room (no Zimmer chosen) · vacant (a chosen Zimmer is
   vacant that day, e.g. a stored choice after the date changed) · norent (nobody lives there) */
function mtWhoProblem(W, noLock) {
  if (W.lock && !noLock) return 'lock';
  if (W.t === 'klein' && mtWhoOver(W)) return 'over';
  if (W.yr && (W.t === 'nk' || ((W.t === 'klein' || W.t === 'schaden') && W.v !== 'direct' && mtWhoViaOff(W)))) return 'yrlock';
  if (W.t !== 'klein' && W.t !== 'schaden') return '';
  if (W.w === 'zimmer' || W.t === 'schaden') return !W.r.length ? 'room' : mtWhoVac(W).length ? 'vacant' : '';
  const R = mtWhoRooms(W.day);
  return R.known && !R.rented.length ? 'norent' : '';
}
/* the sentence in the beige box */
function mtWhoResHTML(W) {
  const E = mtEur, net = W.net, yr = 'NK ' + mtWhoYear(W.day);
  const two = (a, b) => a + (b ? `<br><span>${b}</span>` : '');
  if (!W.t) return `You pay <b>${E(net)}</b>`;
  if (mtWhoProblem(W, true) === 'yrlock') return two(`NK ${W.yr.year} is locked in Settlements`,
    W.t === 'nk' ? 'tap NK again: you pay — or choose Kleinreparatur / Schaden' : 'choose Direct — or tap the type again: you pay');
  if (W.t === 'nk') return two(`<b>${E(net)}</b> to NK · ${mtEsc(mtWhoCatName(W.cat) || 'its cost type')}`, W.off ? `Not in Controlling · so not in the NK (${yr} · Teil A)` : `${yr} · Teil A`);
  const pb = mtWhoProblem(W, true);
  if (pb === 'over') return two(`<b>${E(net)}</b> is over 150,00 € · not a Kleinreparatur`, `Mietvertrag § 7 · choose Schaden${W.yr ? '' : ' or NK'} — or tap it again: you pay`);
  if (pb === 'room') return two(W.w === 'zimmer' ? 'Choose the Zimmer' : 'Choose who caused it', `${E(net)} · nothing is charged yet`);
  if (pb === 'vacant') { const v = mtWhoVac(W);
    return two(`${mtEsc(v.join(', '))} ${v.length === 1 ? 'is' : 'are'} vacant on ${mtDate(W.day)} · tap ${v.length === 1 ? 'it' : 'them'} off`, `${E(net)} · nothing is charged yet`); }
  if (pb === 'norent') return two(`No Zimmer rented on ${mtDate(W.day)}`, `You pay ${E(net)}`);
  const rooms = mtWhoPayRooms(W), n = rooms.length, gem = W.t === 'klein' && W.w !== 'zimmer';
  const cents = Math.round(net * 100), even = cents % n === 0;   // D39 fix: ≈ the share to the cent = what most Zimmer pay in Settlements
  const main = n > 1 || gem ? `${E(net)} ÷ ${n} ${even ? '=' : '≈'} <b>${E(Math.round(cents / n) / 100)}</b> ${gem ? 'per Zimmer' : mtEsc(rooms.join(', '))}`
                            : `<b>${E(net)}</b> from ${mtEsc(rooms[0])}`;
  if (W.v === 'direct') return two(main + (W.p ? ' · paid' : ' · open'), W.p && !W.off ? `Controlling deducts ${E(net)} · not in Teil B` : W.p ? 'Not in Controlling · nothing deducted · not in Teil B' : 'not in Teil B');
  return two(main, `${yr} · ${W.t === 'klein' ? 'Teil B1 Kleinreparaturen · § 7' : 'Teil B2 Schäden'}`);
}
function mtWhoHead(W) {
  return `<div class="mt-w__hd"><p class="mt-w__t" id="mtWhoT">Who pays?</p><p class="mt-w__sub">${mtEsc(W.what)} · ${mtEur(W.net)}</p></div>
    <button type="button" class="mt-modal__x" data-mt="whoCancel" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button>`;
}
/* the body: every part is always there (hidden when it does not apply) → a change only flips attributes and texts */
function mtWhoBody(W) {
  const L = !!W.lock, tb = W.t === 'klein' || W.t === 'schaden', over = mtWhoOver(W);
  const on = b => (b ? ' is-on' : ''), pr = b => ` aria-pressed="${!!b}"`, hid = b => (b ? '' : ' hidden');
  const seg = (k, v, label, cur, off) => `<button type="button" class="mt-w__sb${on(cur === v)}" data-mt="${k}" data-v="${v}"${pr(cur === v)}${L || off ? ' disabled' : ''}>${label}</button>`;
  const yr = W.yr, viaOff = mtWhoViaOff(W);                  // D39 fix: a locked NK year takes no NK / NK-Abrechnung (what is set stays tappable off)
  const type = `<div class="mt-w__sec"><span class="mt-w__k" id="mtW-typeL">Type</span>
      <div class="mt-w__seg mt-w__seg--3 mt-w__seg--ink" role="group" aria-labelledby="mtW-typeL">${seg('whoType', 'nk', 'NK', W.t, !!yr && W.t !== 'nk')}<button type="button" class="mt-w__sb${on(W.t === 'klein')}${over ? ' is-over' : ''}" data-mt="whoType" data-v="klein"${pr(W.t === 'klein')}${L || (over && W.t !== 'klein') ? ' disabled' : ''}>${over ? 'Kleinrep. &gt;150 €' : 'Kleinreparatur'}</button>${seg('whoType', 'schaden', 'Schaden', W.t)}</div>
      <span class="mt-w__h"${hid(W.t === 'nk' && !yr)}>NK is always shared by all · like all Betriebskosten</span>
      <span class="mt-w__h"${hid(!!yr)}>NK ${yr ? yr.year : ''} · locked in Settlements · NK${viaOff ? ' and NK-Abrechnung' : ''} off</span></div>`;
  const all = mtWhoCatAll(), ids = W.more ? W.cats.concat(all.map(c => String(c.id)).filter(i => !W.cats.includes(i))) : W.cats;
  const cats = ids.map(i => all.find(c => String(c.id) === i)).filter(Boolean), isCat = c => String(W.cat) === String(c.id);
  const catSec = `<div class="mt-w__sec"${hid(W.t === 'nk' && !!MT.whoCats)}><span class="mt-w__k" id="mtW-catL">Cost type</span>
      <div class="mt-w__chips" role="group" aria-labelledby="mtW-catL">${cats.map(c => `<button type="button" class="mt-w__ch${on(isCat(c))}" data-mt="whoCat" data-v="${mtEsc(c.id)}"${pr(isCat(c))}${L ? ' disabled' : ''}>${mtEsc(c.name)}</button>`).join('')}${!W.more && all.length > W.cats.length ? `<button type="button" class="mt-w__ch mt-w__ch--more" data-mt="whoMore"${L ? ' disabled' : ''}>more …</button>` : ''}</div></div>`;
  const R = mtWhoRooms(W.day), zim = tb && W.w === 'zimmer', kgem = W.t === 'klein' && !zim, sgem = W.t === 'schaden' && !zim;
  const list = MT.rooms.concat(W.r.filter(n => !MT.rooms.includes(n)));            // a Zimmer no longer in Rooms still shows when chosen
  const chip = (n, sel) => { const vac = R.known && !R.rented.includes(n);
    return `<button type="button" class="mt-w__ch${on(sel)}${vac ? ' is-vac' : ''}" data-mt="whoRoom" data-v="${mtEsc(n)}"${pr(sel)}${L || (vac && !sel) ? ' disabled' : ''}>${mtEsc(n)}${vac ? ' · vacant' : ''}</button>`; };
  const nv = R.vacant.length, hint = !R.known ? '' : !R.rented.length ? `No Zimmer rented on ${mtDate(W.day)}`
    : `${R.rented.length} rented Zimmer${nv ? ` · ${R.vacant.join(', ')} vacant, ${nv === 1 ? 'pays' : 'pay'} nothing` : ''}`;
  const whereSec = `<div class="mt-w__sec"${hid(tb)}><span class="mt-w__k" id="mtW-whereL">Where</span>
      <div class="mt-w__seg" role="group" aria-labelledby="mtW-whereL">${seg('whoWhere', 'gemein', W.t === 'klein' ? 'Gemeinschaft<span class="mt-w__lg">sfläche</span> · all' : 'Gemeinschaftsfläche', tb ? W.w : '')}${seg('whoWhere', 'zimmer', 'Zimmer', tb ? W.w : '')}</div>
      <span class="mt-w__h"${hid(kgem && !!hint)}>${mtEsc(hint)}</span>
      <div class="mt-w__chips" role="group" aria-label="Zimmer"${hid(zim)}>${list.map(n => chip(n, zim && W.r[0] === n)).join('')}</div></div>`;
  const bySec = `<div class="mt-w__sec"${hid(sgem)}><span class="mt-w__k" id="mtW-byL">Caused by · several possible</span>
      <div class="mt-w__chips" role="group" aria-labelledby="mtW-byL">${list.map(n => chip(n, sgem && W.r.includes(n))).join('')}</div></div>`;
  const dir = W.v === 'direct';
  const paySec = `<div class="mt-w__sec"${hid(tb)}><span class="mt-w__k" id="mtW-payL">Payment</span>
      <div class="mt-w__seg" role="group" aria-labelledby="mtW-payL">${seg('whoVia', 'nk', 'With NK-Abrechnung', W.v, viaOff)}${seg('whoVia', 'direct', 'Direct', W.v)}</div>
      <button type="button" class="mt-w__paid" data-mt="whoPaid" aria-label="Paid on ${W.p ? mtDate(W.p) : '· empty'} · choose in the calendar"${hid(dir)}${L ? ' disabled' : ''}><span>Paid on</span><span class="mt-w__pv${W.p ? '' : ' is-empty'}">${W.p ? mtDate(W.p) : 'TT.MM.JJJJ'}</span></button>
      <input type="date" id="mtW-paid" aria-label="Paid on" value="${mtEsc(W.p || '')}" hidden data-keep="1"/>
      <span class="mt-w__h"${hid(dir)}>leave empty until paid</span></div>`;
  const lock = `<p class="mt-w__lock"${hid(L)}><i class="ti ti-lock" aria-hidden="true"></i>${mtEsc(W.lock)}</p>`;
  return lock + type + catSec + whereSec + bySec + paySec + `<p class="mt-w__res" aria-live="polite">${mtWhoResHTML(W)}</p>`;
}
function mtWhoFoot(W) {
  return `<button type="button" class="mt-w__reset" data-mt="whoReset"${W.lock ? ' hidden' : ''}>Reset</button>
    <button type="button" class="mt-w__cancel" data-mt="whoCancel">${W.lock ? 'Close' : 'Cancel'}</button>
    <button type="button" class="mt-w__save" data-mt="whoSave"${mtWhoProblem(W) ? ' disabled' : ''}${W.lock ? ' hidden' : ''}>Save</button>`;
}
/* built once per open (one slide-in); afterwards only what changed changes, in place */
function mtWhoRender() {
  const W = MT.who;
  if (!W) { mtModalDrop('mtWhoModal'); return; }
  const fresh = !document.getElementById('mtWhoModal');
  const m = mtModal('mtWhoModal', { cls: 'mt-modal--who mt-modal--fit', close: 'whoCancel', label: 'mtWhoT' });
  const q = k => m.querySelector(':scope > .mt-modal__s > .mt-modal__' + k);
  if (fresh) {
    // Nov 2026 (D39 fix): the height of its tallest layout (Schaden · Caused by · Direct, or NK), measured once here —
    // the sheet is placed by it (top fixed, CSS), so a tap that shows or hides a part below never moves the button
    // under the finger. Locked: nothing changes, its own height.
    // D39 fix 2: with its longest result (every rented Zimmer · paid), so nothing is cut ("more …" may scroll the body).
    const sh = m.querySelector(':scope > .mt-modal__s'), hd = mtWhoHead(W), ft = mtWhoFoot(W);
    let hh = 0;
    sh.style.setProperty('max-height', 'none', 'important'); // its own height (the visible part, e.g. a closing keyboard, still caps it in CSS)
    (W.lock ? [] : [{ t: 'schaden', w: 'gemein', r: mtWhoRooms(W.day).rented, v: 'direct', p: W.day }, { t: 'nk' }]).concat([{}]).forEach(x => {
      mtModalFill(m, { h: hd, b: mtWhoBody(Object.assign({}, W, x)), f: ft }, false);
      hh = Math.max(hh, sh.offsetHeight);
    });
    sh.style.removeProperty('max-height');
    m.style.setProperty('--mt-who-h', Math.ceil(hh) + 'px');
    if (mtFine()) {                                          // laptop: the chosen type (else the first one) — the other parts may be hidden
      const ty = '[aria-labelledby="mtW-typeL"] .mt-w__sb';
      const b = m.querySelector(ty + '.is-on:not(:disabled)') || m.querySelector(ty + ':not(:disabled)') || m.querySelector('.mt-w__cancel');
      if (b) b.focus({ preventScroll: true });
    }
  } else { mtMorph(q('b'), mtWhoBody(W)); mtMorph(q('f'), mtWhoFoot(W)); }
  const pi = document.getElementById('mtW-paid');            // the date field is the calendar's (left alone by mtMorph)
  if (pi && (pi.value || '') !== (W.p || '')) pi.value = W.p || '';
}
/* a tap in the sheet → the choice changes → the sheet follows in place */
function mtWhoSet(what, v) {
  const W = MT.who;
  if (!W || W.lock) return;
  if (what === 'type') {
    if (W.t === v) W.t = null;                               // the active one again → you pay
    else if (v === 'klein' && mtWhoOver(W)) return;          // § 7: over 150 € is not a Kleinreparatur
    else if (v === 'nk' && W.yr) return;                     // D39 fix: its NK year is locked in Settlements
    else {
      W.t = v; if ((v === 'klein' || v === 'schaden') && !W.w) mtWhoPrefill(W);
      if ((v === 'klein' || v === 'schaden') && mtWhoViaOff(W)) W.v = 'direct';   // that year's NK-Abrechnung is done: Direct
    }
  } else if (what === 'where') {
    if (W.w === v) return;
    W.w = v === 'zimmer' ? 'zimmer' : 'gemein';
    if (W.w === 'zimmer' && W.r.length > 1) W.r = W.r.slice(0, 1);                       // one Zimmer
    const o = W.w === 'zimmer' && !W.r.length ? mtWhoOrt(W) : null;
    if (o) W.r = [o];                                        // the entry's Zimmer (if rented that day)
  } else if (what === 'room') {
    const n = mtRoomCanon(v);
    if (W.w === 'zimmer') W.r = W.r[0] === n ? [] : [n];
    else W.r = W.r.includes(n) ? W.r.filter(x => x !== n) : mtRoomSort(W.r.concat([n]));
  } else if (what === 'cat') {
    const c = mtWhoCatAll().find(x => String(x.id) === String(v));
    W.cat = !c || String(W.cat) === String(c.id) ? null : c.id;   // the chosen one again → Allgemeine Hauskosten
  } else if (what === 'more') W.more = true;
  else if (what === 'via') { if (v !== 'direct' && mtWhoViaOff(W)) return; W.v = v === 'direct' ? 'direct' : 'nk'; }
  else if (what === 'paid') W.p = v ? String(v).slice(0, 10) : null;
  else if (what === 'reset') Object.assign(W, { t: null, cat: null, w: null, r: [], v: 'nk', p: null });
  // D39 fix 2: Reset is in the footer — the sheet keeps its height until the next tap, so the footer stays under the
  // finger (a second tap there is Reset again, never the backdrop); any other tap is above the parts it changes
  const sh = document.querySelector('#mtWhoModal > .mt-modal__s');
  if (sh) sh.style.minHeight = what === 'reset' ? sh.offsetHeight + 'px' : '';
  mtWhoRender();
}
/* "Paid on": the app's calendar (over the sheet) — it writes the date field, its change comes back here */
function mtWhoPaidOpen() {
  const W = MT.who, el = document.getElementById('mtW-paid');
  if (!W || W.lock || !el || typeof window.ccOpenCalendar !== 'function') return;
  window.ccOpenCalendar(el);
}
/* ×, Cancel, a tap beside it, Escape: only this sheet closes (the receipt pop-up below stays as it is) */
function mtWhoClose() {
  const W = MT.who;
  MT.who = null;
  mtModalDrop('mtWhoModal');                                 // the page lock follows (a receipt pop-up below keeps it)
  if (!W || !mtFine()) return;
  const id = window.CSS && CSS.escape ? CSS.escape(W.id) : W.id;
  const el = W.nest ? document.getElementById('mtC-whorow') : document.querySelector(`#mtPanel .mt-who[data-id="${id}"]`);
  if (el) try { el.focus({ preventScroll: true }); } catch (e) {}
}
async function mtWhoSave() {
  const W = MT.who;
  if (!W || mtWhoProblem(W)) return;
  if (W.nest) {                                              // into the receipt form — stored with the receipt's own Save
    const f = MT.sel && MT.sel.cost;
    if (f && f === W.f) {
      Object.assign(f, mtWhoNorm(W, W.day));
      mtCostWhoSync();
      const m = document.getElementById('mtCostModal');
      if (m && m.dataset.fid === String(f.id)) m._b = mtCostFormHTML(f);   // the form already shows it (no redraw needed)
      mtDraftSoon();
    }
    mtWhoClose();
    return;
  }
  const r = mtCostById(W.id), c = r && mtCase(r.case_id);
  if (!r || !c) { mtWhoClose(); return; }
  if (MT.busy) { mtBusySay(); return; }
  const pay = mtWhoNorm(W, r.cost_date), old = mtWhoPick(r);
  if (JSON.stringify(pay) === JSON.stringify(old)) { mtWhoClose(); return; }
  // 1 · show it at once: the row behind (drawn while the page is still held — its place kept), then the sheet goes
  MT.busy = true;
  Object.assign(r, pay);
  mtRefresh(c.id);
  mtWhoClose();
  mtFlashRow(r.id);
  // 2 · store it (one retry) · not stored → back as it was
  const res = await mtTry(() => _ctlSupa.from('maint_costs').update(pay).eq('id', r.id));
  MT.busy = false;
  if (!res.error) return;
  console.error('[maintenance] who pays not saved:', res.error);
  const cur = mtCostById(r.id);
  if (cur) Object.assign(cur, old);
  mtRefreshBg(c.id);
  mtSay(MT_WHO_SQL.test(String((res.error && (res.error.message || res.error.details)) || '')) ? 'Not saved: run MAINTENANCE-D39.sql in Supabase first.'
    : 'Not saved. Check the connection and try again.');
}
/* bring an element's content to new HTML in place: the same structure → only attributes and texts change (the buttons
   stay the same elements: no blink, the focus stays); a part that differs is replaced. [data-keep] is left alone. */
function mtMorph(el, html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  mtMorphKids(el, t.content);
}
function mtMorphKids(a, b) {
  const x = [...a.childNodes], y = [...b.childNodes];
  if (x.length !== y.length || x.some((n, i) => n.nodeType !== y[i].nodeType || (n.nodeType === 1 && n.tagName !== y[i].tagName))) { a.replaceChildren(...y); return; }
  x.forEach((n, i) => {
    const m = y[i];
    if (n.nodeType === 3) { if (n.data !== m.data) n.data = m.data; return; }
    if (n.nodeType !== 1 || n.hasAttribute('data-keep')) return;
    [...n.attributes].forEach(at => { if (!m.hasAttribute(at.name)) n.removeAttribute(at.name); });
    [...m.attributes].forEach(at => { if (n.getAttribute(at.name) !== at.value) n.setAttribute(at.name, at.value); });
    mtMorphKids(n, m);
  });
}
/* ── D22 · "Move to Schäden / Renovierungen" in Edit (instead of the type switch) ── */
function mtMoveKind(to) {                                   // D30: three tabs → one link per other tab; tapping it again = undo
  const k = document.getElementById('mtF-kind'), c = MT.sel && !MT.sel.isNew ? mtCase(MT.sel.id) : null;
  if (!k || !c || !MT_KIND[to] || to === c.kind) return;
  k.value = k.value === to ? c.kind : to;
  mtKindChanged();
  document.querySelectorAll('#mtPanel [data-mt="moveKind"], #mtEditModal [data-mt="moveKind"]').forEach(b => {
    const t = b.dataset.v;
    b.innerHTML = '<i class="ti ti-arrows-exchange" aria-hidden="true"></i>' + (k.value === t ? 'Moves to ' + MT_KIND[t].title + ' on Save · undo' : 'Move to ' + MT_KIND[t].title);
  });
}

function mtSbOpenPdf() {
  const f = MT.sb;
  if (!f || !f.pdfPath) return;
  const open = u => (typeof ccOpenUrl === 'function' ? ccOpenUrl(u, f.pdfName || 'PDF') : window.open(u, '_blank'));
  const u = mtLinkNow(f.pdfPath);
  if (u) { open(u); return; }
  mtPrepareLinks([f.pdfPath]).then(() => { const x = mtLinkNow(f.pdfPath); if (x) open(x); else mtSay('The PDF could not be opened. Try again.'); });
}
/* Below the divider of every entry (closed and open): Kostenübersicht · Schadensbericht / Renovierungsbericht */
function mtActsHTML(c, inPanel) {
  const has = mtHasCosts([String(c.id)]), id = mtEsc(c.id), inv = mtHasInvoiceFiles([String(c.id)]);
  return `<div class="mt-acts${inPanel ? ' mt-acts--in' : ''}">
      <span class="mt-pdfw"><button type="button" class="mt-act${has ? '' : ' off'}" data-mt="pdfEntry" data-id="${id}" data-cc-pdf="1" data-label="Kostenübersicht"${has ? '' : ' aria-disabled="true"'}><i class="ti ti-file-text" aria-hidden="true"></i>Kostenübersicht</button></span>
      <span class="mt-pdfw"><button type="button" class="mt-act${inv ? '' : ' off'}" data-mt="invEntry" data-id="${id}" data-cc-pdf="1" data-label="Invoices"${inv ? '' : ' aria-disabled="true"'}><i class="ti ti-files" aria-hidden="true"></i>Invoices</button></span>
      <button type="button" class="mt-act" data-mt="sbOpen" data-id="${id}"><i class="ti ti-file-description" aria-hidden="true"></i>${inPanel ? 'Bericht' : mtBerichtLbl(c)}</button>
    </div>`;
}
function mtSbNextNo(prefix) {
  const P = prefix || 'SB', y = new Date().getFullYear(), re = new RegExp('^' + P + '-(\\d{4})-(\\d+)$');
  const n = MT.cases.map(x => String(x.report_no || '').match(re)).filter(m => m && Number(m[1]) === y).map(m => Number(m[2]));
  return `${P}-${y}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0')}`;
}
/* The photos of the report: Renovierung → Vorher first, then Nachher, then the rest (labelled in the PDF) */
async function mtSbPhotoData(c, onStep) {
  const rb = c.kind === 'renovierung', rank = p => (p.phase === 'vorher' ? 0 : p.phase === 'nachher' ? 1 : 2);
  let list = mtSbPhotos(c).filter(x => x.in_report !== false);
  if (rb) list = list.map((p, i) => [p, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    let blob = null;
    if (onStep) onStep(i + 1, list.length);
    for (let k = 0; k < 2 && !blob; k++) {
      try {
        const r = await Promise.race([_ctlSupa.storage.from(MT_BUCKET).download(p.file_path), new Promise(res => setTimeout(() => res({ error: 'timeout' }), 45000))]);
        if (!r.error) blob = r.data;
      } catch (e) {}
    }
    if (!blob) throw new Error('A photo could not be loaded.');
    const img = await Promise.race([_ccUbLoadImage(blob), new Promise((_, rej) => setTimeout(() => rej(new Error('A photo could not be loaded.')), 30000))]);
    const lbl = rb && p.phase ? (p.phase === 'vorher' ? 'Vorher' : 'Nachher') : '';
    out.push({ ...img, ts: rb ? i : (Date.parse(p.taken_at || p.created_at) || Date.now()), when: mtSbWhen(p), taken: true,
      caption: [lbl, p.caption || ''].filter(Boolean).join(' · ') });
  }
  return out;
}
async function mtSbStore(c, blob, name, docType) {
  const sb = _ctlSupa, id = mtUuid(), path = `${c.id}/${id}.pdf`, type = docType || 'schadenbericht';
  const up = await mtTry(() => sb.storage.from(MT_BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: false, cacheControl: '3600' }));
  if (up.error) { console.error('[maintenance] report upload failed:', up.error); return null; }
  const row = { id, case_id: c.id, doc_type: type, file_path: path, file_name: name, doc_date: ccTodayISO(), generated: true };
  const ins = await mtTry(() => sb.from('maint_docs').insert(row));
  if (ins.error) {
    console.error('[maintenance] report row failed:', ins.error);
    if (/doc_type/i.test(String(ins.error.message || ins.error.details || ''))) MT.sbStoreHint = 'Run MAINTENANCE-D17.sql in Supabase first.';
    try { await sb.storage.from(MT_BUCKET).remove([path]); } catch (e) {}
    return null;
  }
  const old = mtCaseDocs(c.id).filter(d => d.generated && d.doc_type === type && d.doc_date === row.doc_date);
  MT.docs.push({ ...row, created_at: new Date().toISOString() });
  if (old.length) {                                          // one version per day
    const del = await mtTry(() => sb.from('maint_docs').delete().in('id', old.map(d => d.id)));
    if (!del.error) {
      MT.docs = MT.docs.filter(d => !old.includes(d));
      try { await sb.storage.from(MT_BUCKET).remove(old.map(d => d.file_path)); } catch (e) {}
    }
  }
  return path;
}
function mtSbVisit(c) {
  if (c.besichtigung_am || c.besichtigung_zeit || c.besichtigung_durch)
    return [mtDate(c.besichtigung_am), c.besichtigung_zeit ? c.besichtigung_zeit + ' Uhr' : '', c.besichtigung_durch ? 'durch ' + c.besichtigung_durch : ''].filter(Boolean).join(', ');
  return c.besichtigung || '';
}
/* Renovierungsbericht: the same frame as the Schadensbericht, its own sections */
function mtRbData(c, f, photoCount) {
  const b = mtSbData(c, f, photoCount);
  const stat = { open: 'Geplant', in_progress: 'In Arbeit', done: 'Abgeschlossen' }[c.status] || '';
  const rows = MT.costs.filter(r => String(r.case_id) === String(c.id));
  const kindOf = r => (r.return_of ? (mtCostById(r.return_of) || r).kind : r.kind);
  const sum = list => list.reduce((s, r) => s + (r.return_of ? -1 : 1) * Math.abs(Number(r.amount) || 0), 0);
  const kosten = [];
  if (c.rb_kosten && rows.length) {
    kosten.push(['Gesamt', mtEur(sum(rows))]);
    const s = rows.filter(r => kindOf(r) === 'self'), p = rows.filter(r => kindOf(r) === 'provider');
    if (s.length) kosten.push(['Selbst gekauft', mtEur(sum(s))]);
    if (p.length) kosten.push(['Dienstleister', mtEur(sum(p))]);
  }
  return Object.assign(b, {
    mode: 'rb', titel: 'Renovierungsbericht – ' + c.title, subtitle: [mtCaseLabel(c), 'Stand ' + b.stand].filter(Boolean).join(' · '), dringend: '',
    angaben: [['Objekt', b.adresse], ['Einheit', b.einheit], ['Bereich', b.raum], ['Zeitraum', typeof mtCpSpan === 'function' ? mtCpSpan(c) : mtSpan(c)], ['Status', stat]],
    sections: [
      { key: 'anlass', title: 'Ausgangslage', text: c.rb_anlass, style: mtSty(c, 'rb_anlass') },
      { key: 'arbeiten', title: 'Durchgeführte Arbeiten', text: c.rb_arbeiten, style: mtSty(c, 'rb_arbeiten') },
      { key: 'firmen', title: 'Ausführende Firmen', text: mtRbFirmen(c).join('\n'), style: 'list' },
      { key: 'ergebnis', title: 'Ergebnis', text: c.rb_ergebnis, style: mtSty(c, 'rb_ergebnis') },
      { key: 'hinweise', title: 'Hinweise', text: c.rb_hinweise, style: mtSty(c, 'rb_hinweise') },
      { key: 'kosten', title: 'Kosten', kv: kosten },
    ],
  });
}
/* D30 · Sonstiges: the same frame — "Protokoll – Hausversammlung" · "Bericht – Mieterfest" · "Bericht – <your Art or the title>" */
function mtSoData(c, f, photoCount) {
  const b = mtSbData(c, f, photoCount), casa = mtIsCasa(c.property_id);
  const art = String(c.so_art || '').trim();
  const titel = art === 'Hausversammlung' ? 'Protokoll – Hausversammlung' : 'Bericht – ' + (art || c.title);
  const span = c.end_date && c.end_date !== c.case_date ? mtDate(c.case_date) + ' – ' + mtDate(c.end_date) : mtDate(c.case_date);
  const rows = MT.costs.filter(r => String(r.case_id) === String(c.id)), amt = r => Math.abs(Number(r.amount) || 0);
  const kosten = [];
  if (c.rb_kosten && rows.length) {                           // each receipt (minus its returns), then the total
    let total = 0;
    const lines = rows.filter(r => !r.return_of).sort((x, y) => String(x.cost_date || '').localeCompare(String(y.cost_date || '')));
    lines.forEach(r => {
      const v = amt(r) - rows.filter(x => String(x.return_of) === String(r.id)).reduce((s2, x) => s2 + amt(x), 0);
      total += v;
      kosten.push([mtEsc([r.description, r.brand].map(x => String(x || '').trim()).filter(Boolean).join(' · ') || 'Beleg'), mtEur(v)]);
    });
    if (lines.length > 1) kosten.push(['Gesamt', mtEur(total)]);
  }
  return Object.assign(b, {
    mode: 'so', angabenTitel: 'Angaben', titel, dringend: '',
    subtitle: [mtCaseLabel(c), 'Stand ' + b.stand].filter(Boolean).join(' · '),
    einheitLabel: casa ? (c.so_ort ? 'Ort' : '') : b.einheitLabel, einheitWert: casa ? (c.so_ort || '') : b.einheitWert,
    angaben: [['Objekt', b.adresse]].concat(casa ? [] : [['Einheit', b.einheit]]).concat([
      ['Ort', c.so_ort || ''], ['Datum', span], ['Uhrzeit', c.so_zeit ? c.so_zeit + ' Uhr' : ''], ['Teilnehmer', c.so_teilnehmer || '']]),
    sections: [
      { key: 'anlass', title: 'Anlass / Themen', text: c.rb_anlass, style: mtSty(c, 'rb_anlass') },
      { key: 'besprochen', title: 'Besprochen / Vereinbart', text: c.rb_ergebnis, style: mtSty(c, 'rb_ergebnis') },
      { key: 'schritte', title: 'Nächste Schritte', text: c.rb_hinweise, style: mtSty(c, 'rb_hinweise') },
      { key: 'kosten', title: 'Kosten', kv: kosten },
    ],
  });
}
async function mtSbMake() {
  const f = MT.sb, c = mtSbCase();
  const stop = msg => { if (typeof ccCancelPdf === 'function') ccCancelPdf(); if (msg) mtSay(msg); };
  if (!c || !f || !f.ready || f.busy || f.view === 'ready' || MT.busy || MT.up) return stop(MT.up ? 'Wait until the photos are uploaded.' : '');
  const rb = c.kind === 'renovierung', so = c.kind === 'sonstiges';
  let kl = mtBerichtLbl(c);
  if (!rb && !so && mtIsCasa(c.property_id) && !f.room) return stop('Set the Zimmer in Edit first (or Gemeinschaftsfläche).');
  if (typeof mtSbHTML !== 'function' || typeof ccRenderPagesToPdf !== 'function' || typeof ccUbAddPhotoPages !== 'function') return stop('The PDF files are missing. Upload all files of this update.');
  f.busy = true;
  /* D24: the button keeps its name "Create PDF" (spinner while working) and a small line says what it is doing.
     Every step has a time limit → it can never hang on "working" again; Close and × come back in any case. */
  const btn = document.getElementById('mtSb-make');
  const status = t => { const el = document.getElementById('mtSb-status'); if (el) { el.textContent = t || ''; el.hidden = !t; } };
  const setBusy = on => {
    if (btn) { btn.disabled = on; btn.classList.toggle('is-busy', on); btn.innerHTML = (on ? '<span class="mt-spin" aria-hidden="true"></span>' : '') + 'Create PDF'; }
    document.querySelectorAll('#mtSbModal [data-mt="sbClose"]').forEach(x => { if (x.tagName === 'BUTTON') x.disabled = on; });
    if (!on) status('');
  };
  const limit = (pr, sec, step) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + step)), sec * 1000))]);
  setBusy(true);
  status('Saving the fields');
  let box = null, step = 'fields';
  MT.sbStoreHint = '';
  try {
    mtSbCapsFlush();
    if (!(await limit(mtSbFlush(), 30, 'fields'))) throw new Error('fields');
    kl = mtBerichtLbl(c);                                    // D30: the Art may just have changed (Protokoll ↔ Bericht)
    step = 'libs'; status('Getting ready');
    await limit(mtSbLibs(), 45, 'libs');
    f.reportNo = mtCaseLabel(c) || c.report_no || mtSbNextNo(rb ? 'RB' : so ? 'BE' : 'SB');   // D29: the case number (S2 · 2026)
    step = 'photos';
    const photos = f.photosOn ? await limit(mtSbPhotoData(c, (k, n) => status(`Loading photo ${k} of ${n}`)), 120, 'photos') : [];
    step = 'attachments';
    f.att = await limit(mtSbAttachData(c), 60, 'attachments');
    step = 'pages'; status('Building the pages');
    const d = rb ? mtRbData(c, f, photos.length) : so ? mtSoData(c, f, photos.length) : mtSbData(c, f, photos.length);
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#fff;z-index:-1;font-size:11.33px;';
    box.innerHTML = mtSbHTML(d);
    document.body.appendChild(box);
    await limit(document.fonts.ready, 15, 'fonts').catch(() => {});
    await new Promise(r => setTimeout(r, 300));
    const c1 = box.querySelector('.pdf-page .content'), last = c1 && c1.lastElementChild;
    if (last && last.getBoundingClientRect().bottom > c1.getBoundingClientRect().top + c1.clientHeight + 0.5) {
      d.split = true;
      box.innerHTML = mtSbHTML(d);
      await new Promise(r => setTimeout(r, 120));
    }
    _ccUb['mt-sb'] = { on: photos.length > 0, photos };
    await limit(ccUbAddPhotoPages('mt-sb', box, { sub: kl + ' · ' + [c.title, d.objektName].filter(Boolean).join(' · ') }), 30, 'pages');
    const fix = document.createElement('style');
    fix.textContent = 'body > div[style*="visibility: hidden"] > img { display:inline !important; }';
    document.head.appendChild(fix);
    /* D25: each page's hidden copy holds only that page (not the app, its thumbnails or other pages' photos),
       the line says "Building page 2 of 4", and every page has its own limit of 45 s */
    const PAGE_SEC = 45, nPg = box.querySelectorAll('.pdf-page').length;
    let pdf;
    try {
      pdf = await limit(ccRenderPagesToPdf(box, { strict: true, only: true, pageSec: PAGE_SEC,
        onPage: (k, n) => status(`Building page ${k} of ${n}`) }), 30 + PAGE_SEC * (nPg + 2), 'pages');
    } finally { fix.remove(); }
    step = 'save'; status('Saving the PDF');
    const blob = await limit(mtSbMerge(pdf.output('blob'), f.att), 60, 'attachments');   // the Anlagen PDFs at the end
    const path = await limit(mtSbStore(c, blob, `${kl} ${f.reportNo} Stand ${d.stand}.pdf`, rb ? 'renovierungsbericht' : so ? 'bericht' : 'schadenbericht'), 90, 'save');
    if (!path) throw new Error('store');
    await limit(mtSbRemember(c, f), 30, 'save').catch(() => {});
    Object.assign(f, { busy: false, done: d.stand, view: 'ready', pdfPath: path, pdfName: ccPdfFileName(kl, f.reportNo, d.objektName, 'Stand ' + d.stand) });
    await limit(mtPrepareLinks([path]), 30, 'link').catch(() => {});
    const url = mtLinkNow(path), inApp = typeof CC_STANDALONE !== 'undefined' && CC_STANDALONE;
    if (url && !inApp && typeof ccOpenUrl === 'function') ccOpenUrl(url, f.pdfName);   // browser: the tab opened at the tap shows it
    else if (typeof ccCancelPdf === 'function') ccCancelPdf();
    mtSbRender();                                              // the ready view, same pop-up
    mtRefresh(c.id);                                           // D39: the entry behind (new report in Documents), place kept
  } catch (e) {
    console.error('[maintenance] Bericht:', step, e);
    f.busy = false;
    setBusy(false);
    const m = String((e && e.message) || '');
    const STEP = { fields: 'saving the fields', libs: 'getting ready', photos: 'loading the photos', attachments: 'adding the Anlagen', pages: 'building the pages', save: 'saving the PDF', link: 'opening it' };
    stop(MT.sbStoreHint
      || (/did not fit/.test(m) ? m
      : m === 'fields' ? ''                                      // its own message was shown already
      : /^timeout:page:/.test(m) ? `Building page ${m.split(':')[2]} of ${m.split(':')[3]} took too long. Close the app fully, reopen it and try again.`
      : /^timeout:/.test(m) ? `Creating the PDF took too long (${STEP[m.slice(8)] || 'working'}). Check the connection and try again.`
      : /photo/i.test(m) ? 'A photo could not be loaded. Check the connection and try again.'
      : 'The report could not be created. Check the connection and try again.'));
  } finally {
    if (box) box.remove();
    try { delete _ccUb['mt-sb']; } catch (e) {}
    f.att = null;
    if (f.busy) { f.busy = false; setBusy(false); }                // never left on "working"
  }
}


/* D39 (bugs 5/22) · the Bericht pop-up is built once (Loading → form → ready → back: the same sheet, one slide-in,
   the final height from the start); only its parts are filled again. Other pop-ups keep the page locked (bug 4). */
function mtSbRender() {
  const f = MT.sb, c = mtSbCase();
  if (!f || !c) { mtModalDrop('mtSbModal'); return; }
  const m = mtModal('mtSbModal', { close: 'sbClose', label: 'mtSbT' });
  const view = f.ready ? f.view : 'load';
  mtModalFill(m, mtSbFormHTML(c, f), m.dataset.view === view, mm => mm.querySelectorAll('textarea.mt-ta').forEach(mtGrow));
  m.dataset.view = view;
  mtSbThumbs();
}
function mtSbThumbs() {
  const imgs = [...document.querySelectorAll('#mtSbModal img[data-path]')];
  const fill = () => imgs.forEach(img => {
    if (img.getAttribute('src')) return;
    const t = mtLinkNow(img.dataset.thumb), u = mtLinkNow(img.dataset.path);
    if (t) { img.onerror = () => { const x = mtLinkNow(img.dataset.path); img.onerror = null; if (x) img.src = x; }; img.src = t; }
    else if (u) img.src = u;
  });
  fill();
  const need = imgs.filter(i => !i.getAttribute('src')).flatMap(i => [i.dataset.thumb, i.dataset.path]);
  if (need.length) mtPrepareLinks(need).then(fill);
}
/* Photos: one row each — thumbnail (number in the report) · Beschreibung · in the report yes / no */
function mtSbPhotosRender() {
  const c = mtSbCase(), f = MT.sb, el = document.getElementById('mtSb-photos');
  if (!c || !f || !el) return;
  // D39 (bug 3): what you type in a Beschreibung (also while photos upload) is kept — saved first, shown again
  // exactly as typed, and the box you are in keeps the focus, the cursor and the pop-up its scroll
  const a = document.activeElement, cap = a && el.contains(a) && a.dataset && a.dataset.cap !== undefined ? a.id : null;
  let s0 = 0, s1 = 0; try { if (cap) { s0 = a.selectionStart; s1 = a.selectionEnd; } } catch (e) {}
  const typed = {}; el.querySelectorAll('textarea[data-cap]').forEach(t => { typed[t.id] = t.value; });
  const body = el.closest('.mt-modal__b'), top = body ? body.scrollTop : 0;
  mtSbCapsFlush();                                           // mtSbCap sets the caption at once (then stores it)
  el.outerHTML = mtSbPhotosHTML(c, f);
  document.querySelectorAll('#mtSb-photos textarea[data-cap]').forEach(t => { if (typed[t.id] !== undefined) t.value = typed[t.id]; });
  document.querySelectorAll('#mtSb-photos textarea.mt-ta').forEach(mtGrow);
  if (body) body.scrollTop = top;
  const t = cap && document.getElementById(cap);
  if (t) { try { t.focus({ preventScroll: true }); t.setSelectionRange(s0, s1); } catch (e) {} }
  mtSbThumbs();
  const u = mtUpFor(c), mk = document.getElementById('mtSb-make');
  if (mk && !f.busy) { mk.disabled = !!(u && u.where === 'sb'); mk.textContent = mk.disabled ? 'Uploading photos' : 'Create PDF'; }
}
async function mtSbInRep(id, on) {
  const d = MT.docs.find(x => String(x.id) === String(id)); if (!d) return;
  const was = d.in_report;
  d.in_report = on;
  mtSbRenumber();
  const r = await mtTry(() => _ctlSupa.from('maint_docs').update({ in_report: on }).eq('id', d.id));
  if (r.error) { d.in_report = was; mtSbPhotosRender(); mtSay('Not saved. Check the connection.'); }
}
async function mtSbCap(id, v) {
  const d = MT.docs.find(x => String(x.id) === String(id)); if (!d) return;
  const val = String(v || '').trim() || null;
  if ((d.caption ?? null) === val) return;
  const was = d.caption;
  d.caption = val;
  const r = await mtTry(() => _ctlSupa.from('maint_docs').update({ caption: val }).eq('id', d.id));
  if (r.error) { d.caption = was; mtSay('Not saved. Check the connection.'); }
}
const mtSbCapsFlush = () => document.querySelectorAll('#mtSbModal [data-cap]').forEach(i => mtSbCap(i.dataset.cap, i.value));
/* Every report field → the entry (only what changed). Gemeldet von stays automatic (the Mieter)
   until you change it; emptied by you = stays empty. Returns false when it could not be saved. */
async function mtSbClose() {
  const f = MT.sb;
  if (!f || f.busy) return;
  mtSbCapsFlush();
  if (!(await mtSbFlush())) return;                        // not saved → stays open, nothing lost
  if (MT.sel && !MT.sel.isNew) {                           // new photos / reports show in Documents —
    const a = mtAnchor(); mtRenderPanel(); mtRestore(a);   // D39: drawn while the page is still held, the place kept
  }
  MT.sb = null;
  mtSbRender();
}
function mtSbAddPhoto() {
  const c = mtSbCase(), f = MT.sb;
  if (!c || !f || f.busy || MT.up) return;
  mtFileInput('mtSbPhotoInput', 'image/*', true, async files => {
    const c2 = mtSbCase();
    if (!c2 || String(c2.id) !== String(c.id)) return;
    const imgs = files.filter(mtIsImage);
    if (!imgs.length) { mtSay('Choose photos (JPG, PNG or HEIC).'); return; }
    mtSbCapsFlush();
    f.photosOn = true;                                        // D20: a new photo turns on "With photos"
    MT.up = { caseId: c.id, total: imgs.length, done: 0, where: 'sb' };
    mtSbPhotosRender();
    let ok = 0;
    for (const x of imgs) {
      if (await mtUploadOne(c, x, { type: 'photo', amount: null, date: mtFileDay(x) }, await mtPhotoExtra(x))) ok++;
      MT.up.done++;
      mtSbPhotosRender();
    }
    MT.up = null;
    mtSbPhotosRender();
    if (MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(c.id)) { const a = mtAnchor(); mtRenderPanel(); mtRestore(a); }
    if (ok < imgs.length) mtSay(`${ok} of ${imgs.length} photos saved. Add the others again.`);
  });
}
/* Below the divider of every entry (closed and open): Kostenübersicht · Schadensbericht (Schäden) */

/* ── Link from Controlling: #cost=<cost id> · #c=<entry id> → open that entry ── */
function mtOpenLink() {
  const h = String(location.hash || '').replace(/^#/, '');
  if (!h) return;
  const q = {};
  h.split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  if (!q.cost && !q.c) return;
  const r = q.cost ? mtCostById(q.cost) : null;
  const c = mtCase(r ? r.case_id : q.c);
  if (!c) { mtSay('This entry is no longer in Maintenance.'); return; }
  mtSwitchTab(c.kind);
  if (r) { MT.cAll = MT.cAll || {}; MT.cAll[c.id] = true; MT.cgrp = 'all'; }   // D39 (bug 20): the linked receipt is in the list, also an older one
  mtOpen(c.id).then(() => setTimeout(() => {
    const sel = r && (window.CSS && CSS.escape ? CSS.escape(String(r.id)) : String(r.id));
    const row = sel ? document.querySelector(`#mtCosts .mt-cr[data-id="${sel}"]`) : null;
    (row || document.getElementById('mtCosts'))?.scrollIntoView({ block: 'center' });
    if (row) mtFlashOn(row);
  }, 60));
}

/* ── Boot ─────────────────────────────────────────────────── */
async function mtBoot() {
  ctlShowLoading(true);
  const session = await ctlGetSession();
  if (!session) { ctlShowLoading(false); location.replace('login.html'); return; }
  try { localStorage.setItem('mgmt_last_app', 'maintenance.html'); } catch (e) {}
  mtWire();
  try {
    await mtLoad();
    document.getElementById('appShell').style.display = 'block';
    mtSwitchTab(MT.tab);
    mtOpenLink();
    setTimeout(mtDraftOffer, 300);                         // D34: a receipt you were writing when the phone restarted the app
  } catch (e) {
    console.error('[maintenance] boot failed:', e);
    MT.loadError = e;
    document.getElementById('appShell').style.display = 'block';
    mtSwitchTab(MT.tab);
  } finally {
    ctlShowLoading(false);
  }
}


/* ── D34 (Nov 2026) · The pop-up stays where you left it ──────────────────────────────
   1 · Editing mode: from the first tap into a field the pop-up is full height and stays there until
       Save / Cancel / × — closing the keyboard (switching to Photos, a website …) moves nothing.
   2 · Back where you were: the field you were in is in view again with a gold outline; one tap = go on
       typing (the iPhone only opens the keyboard after a tap).
   3 · Draft on the device: the open receipt (photos too) is kept in this phone's storage with every change.
       If the phone restarted the app meanwhile: "Unsaved receipt · Continue?". Save / Cancel deletes it. */
const MT_ED = { last: null, scroll: 0, active: false, t: null, hold: false };   // D39: hold = a receipt is being saved (its draft stays)
const MT_ED_FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), textarea, select';
document.addEventListener('focusin', e => {
  const t = e.target, m = t && t.closest && t.closest('.mt-modal');
  if (!m || !t.matches(MT_ED_FIELD)) return;
  m.classList.add('is-editing');                         // 1 · (D39: phone pop-ups are full height from the start — nothing moves on the first tap)
  MT_ED.last = { modal: m.id, field: t.id || null };
  t.classList.remove('mt-resume');
}, true);
document.addEventListener('scroll', e => {
  const b = e.target && e.target.classList && e.target.classList.contains('mt-modal__b') ? e.target : null;
  if (b) MT_ED.scroll = b.scrollTop;
}, true);
document.addEventListener('input', e => { if (e.target && e.target.closest && e.target.closest('#mtCostModal')) mtDraftSoon(); }, true);
document.addEventListener('change', e => { if (e.target && e.target.closest && e.target.closest('#mtCostModal')) mtDraftSoon(); }, true);

function mtResumeMark(fieldId, scroll) {
  const m = document.querySelector('.mt-modal'); if (!m) return;
  const b = m.querySelector('.mt-modal__b');
  if (b && typeof scroll === 'number') b.scrollTop = scroll;
  const f = fieldId && document.getElementById(fieldId);
  if (!f || document.activeElement === f) return;
  m.classList.add('is-editing');
  f.classList.add('mt-resume');
  if (b && b.contains(f)) {                              // D39: only the pop-up's body scrolls (the page behind is held)
    const r = f.getBoundingClientRect(), rb = b.getBoundingClientRect();
    b.scrollTop += (r.top + r.height / 2) - (rb.top + rb.height / 2);
  }
  clearTimeout(f._mtRes); f._mtRes = setTimeout(() => f.classList.remove('mt-resume'), 12000);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { mtDraftNow(); return; }
  if (MT_ED.last) mtResumeMark(MT_ED.last.field, MT_ED.scroll);   // 2 · back in the app
});
window.addEventListener('pagehide', () => mtDraftNow());

/* 3 · the draft: IndexedDB (keeps the photos as files), one entry */
function mtDraftDb() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open('mt-drafts', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function mtDraftIO(mode, val) {
  try {
    const db = await mtDraftDb();
    return await new Promise((res, rej) => {
      const tx = db.transaction('kv', mode === 'get' ? 'readonly' : 'readwrite'), st = tx.objectStore('kv');
      const q = mode === 'get' ? st.get('receipt') : mode === 'put' ? st.put(val, 'receipt') : st.delete('receipt');
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  } catch (e) { console.warn('[maintenance] draft:', e); return null; }
}
function mtDraftSoon() { clearTimeout(MT_ED.t); MT_ED.t = setTimeout(mtDraftNow, 400); }
function mtDraftNow() {
  clearTimeout(MT_ED.t);
  const s = MT.sel, f = s && s.cost, c = s && !s.isNew ? mtCase(s.id) : null;
  if (!f || !c || !document.getElementById('mtCostModal')) return;
  mtCostCapture();
  MT_ED.active = true;
  const files = f.files.map(x => ({ id: x.id || null, file: x.file || null, name: x.name, img: !!x.img, adopt: x.adopt || null }));
  const { _chk, ...keep } = f;                               // D39 (bug 12): never a temporary "being checked" flag in the draft
  mtDraftIO('put', { v: 1, at: Date.now(), caseId: c.id, caseTitle: c.title || '', last: MT_ED.last, scroll: MT_ED.scroll,
    f: { ...keep, files } });
}
function mtDraftClosed() {                                 // Save / Cancel / × → the draft goes
  if (!MT_ED.active) return;
  MT_ED.active = false; MT_ED.last = null; MT_ED.scroll = 0;
  clearTimeout(MT_ED.t);
  if (!MT_ED.hold) mtDraftIO('del');                       // D39: a receipt being saved keeps its draft until its row is stored
}
async function mtDraftOffer() {
  if (MT.sel && MT.sel.cost) return;
  const d = await mtDraftIO('get');
  if (!d || !d.f) return;
  const c = mtCase(d.caseId);
  const old = Date.now() - (d.at || 0) > 14 * 864e5;
  if (!c || old || (!d.f.isNew && !mtCostById(d.f.id))) { mtDraftIO('del'); return; }
  delete d.f._chk;                                           // D39 (bug 12): drafts stored before kept it → Save did nothing
  if (d.f.isNew && mtCostById(d.f.id)) d.f.isNew = false;    // its row was stored meanwhile → it goes on as that receipt
  // D39 · a draft from before "Who pays?" has none of its keys: empty — or, for a stored receipt, what that receipt has
  // (an empty value would clear its choice on Save)
  if (!d.f.return_of && !('pay_type' in d.f)) Object.assign(d.f, mtWhoPick(d.f.isNew ? {} : mtCostById(d.f.id) || {}));
  const what = [d.f.receipt_no, d.f.description, d.f.amount !== '' && d.f.amount != null ? ccFmtNum(Number(d.f.amount), 2) + ' €' : ''].filter(Boolean).join(' · ');
  const ok = await mtConfirm({ title: 'Unsaved receipt', text: (c.title || 'Receipt') + (what ? ' — ' + what : '') + '. Continue where you left off?',
    ok: 'Continue', cancel: 'Discard' });
  if (!ok) { mtDraftIO('del'); return; }
  mtSwitchTab(c.kind);
  await mtOpen(c.id);
  if (!MT.sel || String(MT.sel.id) !== String(c.id)) return;
  MT.sel.cost = d.f;
  MT_ED.active = true;
  mtRenderPanel();
  MT_ED.last = d.last || null;
  setTimeout(() => mtResumeMark(d.last && d.last.field, d.scroll), 120);
}


/* D37 · swipe left / right over the list = next / previous year (not inside an open entry or a pop-up) */
(function () {
  let sx = null, sy = null, ok = false;
  document.addEventListener('touchstart', e => {
    const t = e.touches && e.touches[0], el = e.target;
    ok = !!(t && el && el.closest && el.closest('#appMain') && !el.closest('#mtPanel, .mt-modal, .cccal-ov, input, textarea, select, .mt-chips'));
    if (ok) { sx = t.clientX; sy = t.clientY; }
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!ok || sx === null) return;
    const t = e.changedTouches && e.changedTouches[0]; if (!t) return;
    const dx = t.clientX - sx, dy = t.clientY - sy; sx = null; ok = false;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) mtYearGo(dx < 0 ? 'next' : 'prev');
  }, { passive: true });
})();


/* ── D38 (Nov 2026) · Edit of an entry as a pop-up (like a receipt): full height, big Save at the bottom,
      Delete / Move to quietly underneath. The form is drawn once when Edit opens (what you type stays). ── */
function mtEditModalSync() {
  const s = MT.sel, c = s && !s.isNew && s.edit ? mtCase(s.id) : null;
  const m0 = document.getElementById('mtEditModal');
  if (!c) { mtModalDrop('mtEditModal'); return; }            // D39: the page stays locked while another pop-up is open
  if (m0 && m0.dataset.id === String(c.id)) return;          // already open: keep what is typed
  if (m0) m0.remove();
  const m = mtModal('mtEditModal', { cls: 'mt-modal--edit', close: 'cancel', label: 'mtEditT' });
  m.dataset.id = String(c.id);
  mtModalFill(m, {
    h: `<div><p class="mt-modal__k">Edit ${mtEsc(MT_KIND[c.kind].one)}</p><p class="mt-modal__t" id="mtEditT">${mtEsc(c.title)}</p></div>
        <button type="button" class="mt-modal__x" data-mt="cancel" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button>`,
    b: mtEditHTML(c, s),
  }, false, mm => {
    const foot = mm.querySelector('.mt-sec--edit > .cc-sec-foot'), mf = mm.querySelector(':scope > .mt-modal__s > .mt-modal__f');
    if (foot && mf) mf.replaceChildren(foot);
    mm.querySelectorAll('textarea.mt-ta').forEach(mtGrow);
  });
  mtSbVis();
}
/* Status buttons → the (hidden) select, so the existing change logic runs */
function mtStatusSet(v) {
  const sel = document.getElementById('mtF-status'); if (!sel) return;
  sel.value = v;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  mtStSegSync();
}
function mtStSegSync() {
  const v = document.getElementById('mtF-status')?.value;
  document.querySelectorAll('.mt-stseg__b').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
}
/* The pinned bar sits right under the app's header (its height changes with the phone) */
(function () {
  const set = () => { const h = document.querySelector('.cc-header'); if (h) document.documentElement.style.setProperty('--mt-hdr-h', h.getBoundingClientRect().height + 'px'); };
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(set); const t = () => { const h = document.querySelector('.cc-header'); if (h) { ro.observe(h); set(); } else setTimeout(t, 200); }; t(); }
  window.addEventListener('resize', set);
})();
