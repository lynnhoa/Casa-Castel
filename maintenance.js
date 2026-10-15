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
               Receipt no. · Description · Brand / Provider · Amount · Date · Photos
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
   Documents (per case, in the panel):
               Photos  = camera or library, several at once, saved as photos
                         (shrunk to 2000 px + a small preview in /thumbs/)
               Upload  = one file + its Type (Angebot, Schadenbericht, Photo, Other;
                         invoices / receipts belong in Costs)
               Edit    = × deletes a file, tapping a file fixes Type / Betrag / date
               Files are private (bucket maintenance-docs, one folder per case);
               a tap opens them with a short-lived link.
   ───────────────────────────────────────────────────────────── */

'use strict';

const MT = {
  tab: (() => {
    try { const t = localStorage.getItem('mt_last_tab'); return ['renovierung', 'schaden'].includes(t) ? t : 'renovierung'; }
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
};
/* D12 · the year of the summary (and of its PDF): your choice, else this year */
function mtSumYear() {                                     // D22: one year for both tabs
  const v = MT.sumYear.all;
  return v && mtCostYears().includes(v) ? v : mtYear();
}
function mtCostYears() {
  const ys = MT.costs.map(r => String(r.cost_date || '').slice(0, 4)).filter(y => /^\d{4}$/.test(y));
  return [...new Set(ys.concat([mtYear()]))].sort().reverse();
}
const mtHasCosts = (ids, year) => MT.costs.some(r => ids.includes(String(r.case_id)) && (!year || String(r.cost_date || '').slice(0, 4) === String(year)));
const mtPdfChip = (a, id, on) => `<span class="mt-pdfw"><button type="button" class="mt-pdf${on ? '' : ' off'}" data-mt="${a}"${id ? ` data-id="${mtEsc(id)}"` : ''} data-cc-pdf="1" aria-label="PDF overview"${on ? '' : ' aria-disabled="true"'}><i class="ti ti-file-text" aria-hidden="true"></i>PDF</button></span>`;

const MT_KIND = {
  renovierung: { title: 'Renovierungen', one: 'Renovierung', empty: 'No Renovierungen yet.', open: 'Planned', openCount: 'planned' },
  schaden:     { title: 'Schäden',       one: 'Schaden',     empty: 'No Schäden yet.',       open: 'Open',    openCount: 'open' },
};
const MT_DOC = {
  rechnung:       { label: 'Rechnung',       icon: 'ti-file-invoice' },
  angebot:        { label: 'Angebot',        icon: 'ti-file-text' },
  schadenbericht: { label: 'Schadensbericht', icon: 'ti-file-description' },
  renovierungsbericht: { label: 'Renovierungsbericht', icon: 'ti-file-description' },
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
const MT_DOC_DE  = { rechnung: 'Rechnung', angebot: 'Angebot', schadenbericht: 'Schadensbericht / Gutachten', email: 'E-Mail', video: 'Video', other: 'Dokument' };
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
  window.scrollTo(0, 0);
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

function mtRowHTML(c) {
  const sub = [mtWhere(c), mtSpan(c)].filter(Boolean).map(mtEsc).join(' · ');
  const cost = mtCost([c.id]);
  const sel = MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(c.id) ? ' is-sel' : '';
  return `<div class="mt-ent">
      <div class="mt-row${sel}">
        <button type="button" class="mt-row__hit" data-mt="open" data-id="${mtEsc(c.id)}" aria-label="Open ${mtEsc(c.title)}"></button>
        <span class="mt-row__l"><span class="mt-row__t">${mtEsc(c.title)}</span>${sub ? `<span class="mt-row__s">${sub}</span>` : ''}</span>
        <span class="mt-row__r"><span class="mt-row__a${cost ? '' : ' mt-mu'}">${mtAmt(cost)}</span>${mtPill(c.kind, c.status)}</span>
      </div>
      ${mtActsHTML(c, false)}
    </div>`;
}

function mtRender() {
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
    el.innerHTML = mtBothHTML() + head + (newTop ? `<div class="mt-list">${newTop}</div>` : `<p class="mt-empty">${MT_KIND[kind].empty}</p>`);
    mtPlacePanel(el);
    return;
  }

  const ids = list.map(c => c.id), y = mtYear(), yy = mtSumYear();
  const nOpen = list.filter(c => c.status === 'open').length, nProg = list.filter(c => c.status === 'in_progress').length;
  const counts = [nOpen ? `${nOpen} ${MT_KIND[kind].openCount}` : '', nProg ? `${nProg} in progress` : ''].filter(Boolean).join(' · ') || 'all done';
  const sum = `
    <div class="cc-sum2">
      <div class="cc-sum2__meta"><b>Kosten</b><span>${counts}</span></div>
      <div class="cc-sum2__vals"><span><i>${yy}</i>${mtEur(mtCost(ids, yy))}</span><span><i>Total</i>${mtEur(mtCost(ids))}</span></div>
    </div>`;

  const cards = mtGroups(kind).map(g => {
    const total = mtCost(g.cases.map(c => c.id));
    const years = g.years.map(Y => {
      const fk = kind + '|' + g.key + '|' + Y.y;
      // open by default: this year, or a year that still has something not done
      const auto = Y.y === y || Y.cases.some(c => c.status !== 'done');
      const hasOpen = MT.sel && !MT.sel.isNew && Y.cases.some(c => String(c.id) === String(MT.sel.id));
      const open = hasOpen || (MT.open[fk] === undefined ? auto : !!MT.open[fk]);
      return `
        <button type="button" class="mt-yr" data-mt="fold" data-key="${mtEsc(fk)}" data-auto="${auto ? 1 : 0}" aria-expanded="${open}">
          <span class="mt-yr__y">${mtEsc(Y.y)}</span><span class="mt-yr__n">${Y.cases.length} ${Y.cases.length === 1 ? 'entry' : 'entries'}</span>
          <i class="ti ti-chevron-down" aria-hidden="true"></i>
        </button>${open ? Y.cases.map(c => (MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(c.id)) ? '<div class="mt-slot"></div>' : mtRowHTML(c)).join('') : ''}`;
    }).join('');
    return `
      <section class="mt-card" aria-label="${mtEsc(g.name)}">
        <div class="mt-card__hd"><h2 class="mt-card__name">${mtEsc(g.name)}</h2><span class="mt-card__sum${total ? '' : ' mt-mu'}">${mtAmt(total)}</span></div>
        ${years}
      </section>`;
  }).join('');

  el.innerHTML = mtBothHTML() + head + sum + `<div class="mt-list">${newTop}${cards}</div>`;
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
  const title = s.isNew ? 'New ' + MT_KIND[kind].one : c.title;
  const head = `
    <div class="mt-oh__h">
      <button type="button" class="mt-oh__t" data-mt="close" aria-label="Close ${mtEsc(title)}" aria-expanded="true"><span id="mtPanelTitle">${mtEsc(title)}</span></button>
      <button type="button" class="mt-oh__x" data-mt="close" aria-label="Close ${mtEsc(title)}" tabindex="-1"><i class="ti ti-chevron-up" aria-hidden="true"></i></button>
    </div>`;
  if (s.isNew) {
    return head + mtEditHTML(c, s) +
      '<p class="mt-docs-empty mt-after">Receipts, photos and documents can be added after Save.</p>';
  }
  return head + (s.edit ? mtEditHTML(c, s) : mtSummaryHTML(c) + mtActsHTML(c, true)) + mtCostsHTML(c) + mtDocsHTML(c);
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
      ${mtActive(c) ? '' : '<button type="button" class="mt-link" data-mt="edit">Edit</button>'}
    </div>
    ${desc ? `<p class="mt-oh__d${more ? ' is-full' : ''}">${mtEsc(desc)}</p>
      <button type="button" class="mt-link mt-more" data-mt="more" aria-expanded="${more}"${more ? '' : ' data-auto="1" hidden'}>${more ? 'Less' : 'More'}</button>` : ''}`;
}

const MT_DATE_LBL = { renovierung: ['Start', 'End'], schaden: ['Schadenstag', 'Behoben am'] };
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
  const [l1, l2] = MT_DATE_LBL[sch ? 'schaden' : 'renovierung'];
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
        <div class="mt-f"><label class="mt-k" for="mtF-status">Status</label><select class="mt-in" id="mtF-status">${stats}</select></div>
        <div class="mt-f mt-f--full"><label class="mt-k" for="mtF-desc" id="mtF-descL">Description</label>
          <textarea class="mt-in mt-ta" id="mtF-desc" rows="3" maxlength="2000">${mtEsc(d.description || '')}</textarea></div>
      </div>
      <div class="cc-sec-foot">
        ${s.isNew ? '' : `<span class="is-left mt-foot-l"><button type="button" class="cc-foot-btn mt-del" data-mt="del"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button>
          <button type="button" class="mt-link mt-move" id="mtF-move" data-mt="moveKind"><i class="ti ti-arrows-exchange" aria-hidden="true"></i>Move to ${MT_KIND[d.kind === 'schaden' ? 'renovierung' : 'schaden'].title}</button></span>`}
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
    mtParkPanel();
    return;
  }
  mtCostCapture();                                           // an open cost form keeps what is typed
  p.innerHTML = html;
  // the date field becomes a German field right after it is drawn → note the form after that
  if (MT.sel.edit) { const sel = MT.sel; delete sel.snap; setTimeout(() => { if (MT.sel === sel && sel.edit) sel.snap = mtFormSnap(); }, 0); }
  mtAfterPanel();
}
/* The open entry is one element that moves into its place in the list (so a redraw of
   the list never loses what is typed) and back to its hidden home when nothing is open */
function mtParkPanel() {
  const p = document.getElementById('mtPanel'), home = document.getElementById('mtPanelHome');
  if (p && home && p.parentNode !== home) home.appendChild(p);
}
function mtPlacePanel(root) {
  const p = document.getElementById('mtPanel'), slot = root && root.querySelector('.mt-slot');
  if (!p) return;
  if (slot && MT.sel) slot.replaceWith(p); else mtParkPanel();
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
  const [l1, l2] = MT_DATE_LBL[sch ? 'schaden' : 'renovierung'];
  if (g('mtF-dateL')) g('mtF-dateL').textContent = l1;
  if (g('mtF-endL')) g('mtF-endL').textContent = l2;
  mtSbVis();
  if (MT.sel && MT.sel.isNew) {
    MT.sel.draft.kind = kind;
    const t = g('mtPanelTitle');
    if (t) t.textContent = 'New ' + MT_KIND[kind].one;
  }
}
/* D9 · Status and date stay in line (both visible before Save, you can change them back) */
function mtEndChanged() {
  const g = id => document.getElementById(id), end = g('mtF-end')?.value, st = g('mtF-status');
  if (st && end && end <= ccTodayISO() && st.value !== 'done') { st.value = 'done'; mtSay('Status set to Done'); }
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
  const [l1, l2] = MT_DATE_LBL[kind === 'schaden' ? 'schaden' : 'renovierung'];
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
  if (!MT.sel || MT.sel.isNew || mtActive(mtCase(MT.sel.id))) return;
  MT.sel = { id: MT.sel.id, isNew: false, edit: true };
  mtRenderPanel();
}

function mtCancel() {
  if (!MT.sel) return;
  if (MT.sel.isNew) { mtClose(true); return; }
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
  if (!s || !s.edit || MT.busy) return;
  const f = mtReadForm();
  if (!f) return;
  MT.busy = true;
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
  MT.sel = { id: isNew ? null : id, isNew, edit: true, draft: { ...flat } };
  const backTo = isNew ? MT.tab : oldRow.kind;
  if (backTo !== MT.tab) mtSwitchTab(backTo); else mtRender();
  mtRenderPanel();
  mtSay(sqlMissing ? 'Not saved: run the newest MAINTENANCE SQL in Supabase first.' : 'Not saved. Check the connection and save again.');
}

async function mtDelete() {
  const c = MT.sel && !MT.sel.isNew ? mtCase(MT.sel.id) : null;
  if (!c || MT.busy) return;
  if (MT.up && String(MT.up.caseId) === String(c.id)) { mtSay('Wait until the upload is finished.'); return; }
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
const mtFilesOf = d => (d.doc_type === 'photo' ? [d.file_path, mtThumbPath(d.file_path)] : [d.file_path]).filter(Boolean);
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
  mtMoreCheck();
  mtCostModalRender();
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
  const ready = mtLinkNow(d.file_path);
  if (ready) { mtOpenUrl(ready); return; }
  let w = null;                                           // open the tab inside the tap, fill it when the link is there
  if (!(typeof CC_STANDALONE !== 'undefined' && CC_STANDALONE)) { try { w = window.open('', '_blank'); } catch (e) { w = null; } }
  mtPrepareLinks([d.file_path]).then(() => {
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
  const locked = !!(s.edit || s.cost);                     // Details / a cost row in edit → documents only to look at
  const ed = !!s.docEdit && !locked;
  const upAny = mtUpFor(c), up = upAny && upAny.where === 'docs' ? upAny : null;

  let h = '<section class="mt-docs" id="mtDocs"><p class="mt-sec__t">Documents</p>';
  if (s.add && !locked) h += mtDocFormHTML('mtA', s.add, s.add.name, s.add.isImg, 'add');
  if (up) h += `<p class="mt-up" role="status"><span class="mt-spin" aria-hidden="true"></span>Uploading ${Math.min(up.done + 1, up.total)} of ${up.total}</p>`;
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
        : (d.doc_type === 'rechnung' && !d.cost_id && !mtActive(mtCase(d.case_id)) ? `<button type="button" class="mt-link mt-tocost" data-mt="docToCost" data-id="${mtEsc(d.id)}">Move to Kosten</button>` : '')}
    </div>`;
}
/* D11 · An invoice saved as a document (first version) → a receipt row in Kosten: the form opens
   filled in (amount, date, file); Save books it (with the Controlling check) and the file moves along */
function mtDocToCost(id) {
  const c = mtOpenCase(), d = MT.docs.find(x => String(x.id) === String(id));
  if (!c || !d || mtActive(c)) return;
  mtCostNew('provider');
  const f = MT.sel && MT.sel.cost; if (!f) return;
  Object.assign(f, {
    amount: d.amount ?? '', cost_date: d.doc_date || ccTodayISO(),
    description: String(d.file_name || '').replace(/\.[a-z0-9]{2,4}$/i, ''),
    files: [{ id: d.id, adopt: true, name: d.file_name || 'Rechnung', img: /\.(jpe?g|png|webp|heic|gif)$/i.test(String(d.file_path || '')) }],
  });
  f.snap = '';                                                 // filled in → counts as typed
  mtCostModalRender();                                         // D22: show the filled-in form (no re-read of the empty one)
  document.getElementById('mtC-form')?.scrollIntoView({ block: 'nearest' });
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
  if (MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(caseId)) mtRenderPanel();
  mtRender();
}

/* Photos: camera or library, several at once → saved as photos right away */

/* Document: a PDF from Files is kept as it is · photos (camera or library) become ONE PDF,
   a page per photo (e.g. a 3-page Angebot) → its Type → Save. Documents never land in the photo grid;
   documentation photos go through "Photos". */
function mtPickFile() {
  if (!mtOpenCase()) return;
  if (MT.up) { mtSay('Wait until the upload is finished.'); return; }
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
  if (MT.sel && !mtDocsOf(d.case_id).length) MT.sel.docEdit = false;    // nothing left to edit
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
const mtNum = n => Math.round((Number(n) || 0) * 100) / 100;
const mtNeg = n => '\u2212' + mtEur(n);                      // −30,00 €

function mtCostsHTML(c) {
  const s = MT.sel, f = s.cost;
  const rows = mtCostsOf(c.id);
  const busy = !!(s.edit || s.docEdit || s.add || s.fix);  // another part of the panel is being changed
  const upAny = mtUpFor(c), up = upAny && upAny.where === 'costs' ? upAny : null;
  const tap = !busy && !f && !upAny;
  // D4 · receipts first: Kosten on top, then "+ Add receipt", then the table (newest first)
  const self = mtCost([c.id], null, 'self'), prov = mtCost([c.id], null, 'provider');
  let h = `<section class="mt-costs" id="mtCosts">
    <div class="mt-ks"><span class="mt-ks__l"><b>Kosten</b>${!busy && !f && !upAny ? '<button type="button" class="mt-link mt-ks__add" data-mt="costNew" data-k="self"><i class="ti ti-plus" aria-hidden="true"></i>Add receipt</button>' : ''}</span><em>${mtEur(mtCost([c.id]))}</em></div>
`;
  if (up) h += `<p class="mt-up" role="status"><span class="mt-spin" aria-hidden="true"></span>Uploading ${Math.min(up.done + 1, up.total)} of ${up.total}</p>`;
  if (!rows.length) h += '<p class="mt-docs-empty">No receipts yet.</p>';

  Object.keys(MT_COST).forEach(kind => {
    const list = rows.filter(r => r.kind === kind && !r.return_of).sort((a, b) => mtCostByDate(b, a));   // newest first
    if (!list.length) return;
    h += `<div class="mt-cg">
      <div class="mt-cg__h"><span class="mt-cg__t">${MT_COST[kind].label} · ${list.length}</span><span class="mt-cg__s">${mtEur(mtCost([c.id], null, kind))}</span></div>
      <div class="mt-ch" aria-hidden="true"><span>Receipt no.</span><span>Description</span><span>${MT_COST[kind].who}</span><span class="r">Amount</span><span>Date</span><span></span></div>
      ${list.map(r => {
        const rets = mtReturnsOf(r.id);
        let x = mtCostRowHTML(r, tap);
        rets.forEach(t => { x += mtCostRowHTML(t, tap); });
        if (rets.length) x += `<div class="mt-net"><span>Net</span><b>${mtEur(mtNum(r.amount) - rets.reduce((a, t) => a + mtNum(t.amount), 0))}</b></div>`;
        return x;
      }).join('')}
    </div>`;
  });
  return h + '</section>';
}

function mtCostRowHTML(r, tap) {
  const n = mtCostFiles(r.id).length, ret = !!r.return_of;
  const parent = ret ? mtCostById(r.return_of) : null;
  const off = ret ? !!parent && parent.book_ctrl === false : r.book_ctrl === false;
  const no = ret ? (r.receipt_no ? 'Slip ' + r.receipt_no : 'Return') : (r.receipt_no || '—');
  const desc = ret ? (r.description ? 'Return · ' + r.description : 'Return') : (r.description || '');
  return `<button type="button" class="mt-cr${ret ? ' mt-cr--ret' : ''}" data-mt="${tap ? 'costEdit' : 'none'}" data-id="${mtEsc(r.id)}"${tap ? '' : ' tabindex="-1"'}>
      <span class="mt-cr__a"><span class="mt-cr__no">${ret ? '<i class="ti ti-corner-down-right" aria-hidden="true"></i>' : ''}${mtEsc(no)}</span><span class="mt-cr__desc">${mtEsc(desc)}${off ? '<span class="mt-off">not in Controlling</span>' : ''}</span></span>
      <span class="mt-cr__amt">${ret ? mtNeg(r.amount) : mtEur(r.amount)}</span>
      <span class="mt-cr__b"><span class="mt-cr__who">${ret ? '' : mtEsc(r.brand || '')}</span><span class="mt-cr__date">${mtEsc(mtDate(r.cost_date))}</span></span>
      <span class="mt-cr__f">${n ? `<i class="ti ti-paperclip" aria-hidden="true"></i>${n}` : ''}</span>
    </button>`;
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
        <div class="mt-f"><label class="mt-k" for="mtC-no">${ret ? 'Slip no.' : 'Receipt no.'}</label>
          <input class="mt-in" id="mtC-no" type="text" maxlength="60" autocomplete="off" value="${mtEsc(f.receipt_no || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtC-desc">Description</label>
          <input class="mt-in" id="mtC-desc" type="text" maxlength="160" autocomplete="off" value="${mtEsc(f.description || '')}"${ret ? ' placeholder="optional"' : ''}/></div>
        ${ret ? '' : `<div class="mt-f"><label class="mt-k" for="mtC-who" id="mtC-whoLbl">${MT_COST[f.kind].who}</label>
          <input class="mt-in" id="mtC-who" type="text" maxlength="80" autocomplete="off" value="${mtEsc(f.brand || '')}"/></div>`}
        <div class="mt-f"><label class="mt-k" for="mtC-amount">Amount (€)</label>
          <input class="mt-in" id="mtC-amount" data-cc-num="2" inputmode="decimal" autocomplete="off" value="${mtEsc(amt)}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtC-date">Date</label>
          <input class="mt-in" id="mtC-date" type="date" value="${mtEsc(f.cost_date || '')}"/></div>
        <div class="mt-f mt-f--full"><span class="mt-k">Receipt (PDF)</span>
          <div class="mt-chips">${chips}
            <button type="button" class="mt-chip mt-chip--add" data-mt="costFile"><i class="ti ti-camera" aria-hidden="true"></i> Photo / PDF</button>
          </div>${f.files.some(x => x.file && x.img) ? '<p class="mt-hint">The photos become one PDF when you save.</p>' : ''}</div>
        ${ret ? '' : `<div class="mt-f mt-f--full">${caseOff
          ? '<p class="mt-hint">Run MAINTENANCE-D14.sql once, then each receipt has its own switch.</p>'
          : `<label class="mt-chk"><input type="checkbox" id="mtC-book"${f.book_ctrl === false ? '' : ' checked'}/><span>Book in Controlling</span></label>`}</div>`}
        ${!f.isNew && mtCostById(f.id) && mtCostById(f.id).link_ot && !caseOff ? '<p class="mt-hint mt-f--full">Linked to the line you typed in Controlling — it counts once.</p>' : ''}
      </div>
      <div class="cc-sec-foot">
        ${left ? `<span class="is-left mt-foot-l">${left}</span>` : ''}
        <span class="cc-foot-right">
          <button type="button" class="cc-foot-btn" data-mt="costCancel">Cancel</button>
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
const mtCostSnapOf = f => JSON.stringify([f.kind, f.receipt_no || '', f.description || '', f.brand || '', String(f.amount ?? ''), f.cost_date || '',
  f.book_ctrl !== false, f.files.map(x => x.id || x.name).join('|')]);
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
function mtCostNew(kind) {
  const c = mtOpenCase();
  if (!c || mtActive(c)) return;
  MT.sel.cost = { isNew: true, id: mtUuid(), kind: MT_COST[kind] ? kind : 'self', return_of: null, receipt_no: '', description: '', brand: '',
    amount: '', cost_date: ccTodayISO(), book_ctrl: mtLastBook(c), files: [], delIds: [] };
  MT.sel.cost.snap = mtCostSnapOf(MT.sel.cost);
  mtRenderPanel();
  document.getElementById('mtC-form')?.scrollIntoView({ block: 'nearest' });
  if (mtFine()) document.getElementById('mtC-no')?.focus();
}
function mtCostEdit(id) {
  const c = mtOpenCase(), r = mtCostById(id);
  if (!c || !r || mtActive(c)) return;
  MT.sel.cost = { isNew: false, id: r.id, kind: r.kind, return_of: r.return_of || null, receipt_no: r.receipt_no || '', description: r.description || '',
    brand: r.brand || '', amount: r.amount ?? '', cost_date: r.cost_date || '', book_ctrl: r.book_ctrl !== false, delIds: [], files: mtCostFilesOf(r.id) };
  MT.sel.cost.snap = mtCostSnapOf(MT.sel.cost);
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
  MT.sel.cost = { isNew: true, id: mtUuid(), kind: r.kind, return_of: r.id, receipt_no: '', description: '', brand: '',
    amount: '', cost_date: ccTodayISO() < String(r.cost_date || '') ? r.cost_date : ccTodayISO(), files: [], delIds: [] };
  MT.sel.cost.snap = mtCostSnapOf(MT.sel.cost);
  mtRenderPanel();
  document.getElementById('mtC-form')?.scrollIntoView({ block: 'nearest' });
  if (mtFine()) document.getElementById('mtC-no')?.focus();
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
function mtCostFileDel(i) {
  const f = MT.sel && MT.sel.cost;
  if (!f || !f.files[i]) return;
  mtCostCapture();
  const [x] = f.files.splice(i, 1);
  if (x.id && !x.adopt) f.delIds.push(x.id);                 // a moved document stays a document when taken off
  mtRenderPanel();
}
function mtCostCancel() {
  if (!MT.sel) return;
  MT.sel.cost = null;
  mtRenderPanel();
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

/* Receipt / slip no. already used (anywhere) → where */
function mtDupOf(no, selfId) {
  const k = String(no || '').trim().toLowerCase();
  if (!k) return null;
  const d = MT.costs.find(r => String(r.id) !== String(selfId) && String(r.receipt_no || '').trim().toLowerCase() === k);
  if (!d) return null;
  const c = mtCase(d.case_id);
  return { row: d, where: c ? `“${c.title}” (${mtPropName(c)})` : 'another entry', same: MT.sel && String(d.case_id) === String(MT.sel.id) };
}

async function mtCostSave() {
  const s = MT.sel, f = s && s.cost, c = s && !s.isNew ? mtCase(s.id) : null;
  if (!f || !c || MT.busy) return;
  mtCostCapture();
  const g = id => document.getElementById(id);
  const fail = (id, msg) => { const el = g(id); if (el) { el.setAttribute('aria-invalid', 'true'); if (!el.classList.contains('cc-cal')) el.focus(); } mtSay(msg); };
  const ret = !!f.return_of, parent = ret ? mtCostById(f.return_of) : null;
  if (ret && !parent) { mtSay('The receipt of this return was deleted.'); f.return_of = null; return; }
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
  const dup = mtDupOf(f.receipt_no, f.id);
  if (dup) {
    const what = (ret ? 'Slip ' : 'Receipt ') + String(f.receipt_no).trim();
    const ok = await mtConfirm({ title: `${what} already exists`, text: dup.same ? 'It is already in this entry. Save it anyway?' : `It is already in ${dup.where}. Save it anyway?`, ok: 'Save anyway' });
    if (!ok) return;
    if (!MT.sel || MT.sel.cost !== f) return;                  // the panel changed meanwhile
  }

  // D8 · typed by hand in Controlling already? → link it (one line), book separately, or don't book
  let pick = null;
  const prev = f.isNew ? null : mtCostById(f.id);
  const willBook = c.book_ctrl !== false && (ret ? parent.book_ctrl !== false : f.book_ctrl !== false) && amount > 0 && !!mtProp(c.property_id);
  if (willBook && !(prev && (prev.link_ot || prev.ctrl_dup_ok))) {
    if (f._chk) return;
    f._chk = true;
    let v;
    try {
      const cands = await mtCtrlMatches(c.property_id, amount, f.cost_date, ret);
      if (!MT.sel || MT.sel.cost !== f) return;
      if (!cands.length) v = 'none';
      else {
        const line = o => [o.item, o.company, (Number(o.direction) === 1 ? '+' : '\u2212') + mtEur(o.amount), mtDate(String(o.invoice_date).slice(0, 10))].filter(Boolean).join(' · ');
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
    } finally { f._chk = false; }
    if (!v || v === 'cancel') return;
    if (!MT.sel || MT.sel.cost !== f) return;
    if (v === 'sep') pick = { ctrl_dup_ok: true };
    else if (v === 'off') pick = { book_ctrl: false };
    else if (v !== 'none') pick = { link_ot: v.slice(1) };
  }

  MT.busy = true;
  const isNew = f.isNew, id = f.id;
  const now = new Date().toISOString();
  const old = isNew ? null : { ...mtCostById(id) };
  const row = {
    id, case_id: c.id, kind: ret ? parent.kind : f.kind, receipt_no: String(f.receipt_no).trim() || null, description: String(f.description).trim() || null,
    brand: ret ? null : String(f.brand).trim() || null, amount, cost_date: f.cost_date, return_of: ret ? parent.id : null,
    book_ctrl: ret ? true : f.book_ctrl !== false,                 // a return follows its receipt
    ...(pick || {}),
  };
  const kindChanged = !ret && old && old.kind !== row.kind;
  const rets = kindChanged ? mtReturnsOf(id) : [];
  const pending = f.files.filter(x => x.file), dels = f.delIds.slice(), adopt = f.files.filter(x => x.adopt).map(x => x.id);

  // 1 · show it at once (a receipt's returns follow its type)
  if (isNew) MT.costs.push({ ...row, created_at: now, updated_at: now });
  else Object.assign(mtCostById(id), row, { updated_at: now });
  rets.forEach(t => { t.kind = row.kind; });
  s.cost = null;
  if (pending.length) MT.up = { caseId: c.id, total: 1, done: 0, where: 'costs' };
  mtRefresh(c.id);

  // 2 · store the row (one retry)
  const sb = _ctlSupa;
  const { id: _id, ...fields } = row;
  let r = await mtTry(() => (isNew ? sb.from('maint_costs').insert(row) : sb.from('maint_costs').update(fields).eq('id', id)));
  if (!r.error && rets.length) r = await mtTry(() => sb.from('maint_costs').update({ kind: row.kind }).eq('return_of', id));
  if (r.error) {
    console.error('[maintenance] cost save failed:', r.error);
    const emsg = String((r.error && (r.error.message || r.error.details)) || '');
    const d8Missing = /link_ot|ctrl_dup_ok|maint_before|maint_unbook/i.test(emsg);
    const sqlMissing = d8Missing || /book_ctrl|maint_cost_id/i.test(emsg);
    if (isNew) MT.costs = MT.costs.filter(x => String(x.id) !== String(id));
    else Object.assign(mtCostById(id), old);
    rets.forEach(t => { t.kind = old.kind; });
    MT.up = null;
    MT.busy = false;
    if (MT.sel && String(MT.sel.id) === String(c.id)) MT.sel.cost = f;          // the form comes back with what you typed
    mtRefresh(c.id);
    mtSay(sqlMissing ? `Not saved: run ${d8Missing ? 'MAINTENANCE-D8.sql' : 'MAINTENANCE-D3.sql'} in Supabase first.` : 'Not saved. Check the connection and save again.');
    return;
  }

  // 3 · files: removed ones go, new ones are stored with the row
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
  const imgs = pending.filter(x => mtIsImage(x.file)).map(x => x.file);
  let uploads = pending.filter(x => !mtIsImage(x.file)).map(x => x.file);
  if (imgs.length) {
    let pdf = null;                                       // D19: in the apps' style (header · Rechnung · when it was taken)
    try { if (typeof mtBelegPdf === 'function') pdf = await mtBelegPdf(imgs, c, row.receipt_no); }
    catch (e) { console.warn('[maintenance] styled Beleg PDF not possible, plain one instead:', e); }
    if (!pdf) pdf = await mtPhotosToPdf(imgs);
    const nm = ('Beleg ' + (String(row.receipt_no || '').trim() || mtDate(row.cost_date) || mtDate(ccTodayISO())) + '.pdf').replace(/[\\/:*?"<>|]/g, '-');
    uploads = (pdf ? [new File([pdf], nm, { type: 'application/pdf' })] : imgs).concat(uploads);   // PDF not possible → the photos as before
  }
  if (MT.up) MT.up.total = uploads.length;
  let failed = 0;
  for (const file of uploads) {
    const ok = await mtUploadOne(c, file, { type: 'receipt', amount: null, date: row.cost_date }, { cost_id: id });
    if (!ok) failed++;
    if (MT.up) MT.up.done++;
    mtRefresh(c.id);
  }
  MT.up = null;
  MT.busy = false;
  mtRefresh(c.id);
  if (failed) mtSay(`${uploads.length - failed} of ${uploads.length} files saved. Add the others again.`);
}

async function mtCostDelete() {
  const s = MT.sel, f = s && s.cost, c = s && !s.isNew ? mtCase(s.id) : null;
  const r0 = f && !f.isNew ? mtCostById(f.id) : null;
  if (!r0 || !c || MT.busy) return;
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
function mtAsk(o) {
  const host = document.querySelector('#mtCostModal .mt-modal__s');
  if (host) return new Promise(resolve => {                  // D22: inside the receipt pop-up
    host.querySelector('.mt-askv')?.remove();
    const v = document.createElement('div');
    v.className = 'mt-askv';
    v.setAttribute('role', 'alertdialog');
    v.innerHTML = `<p class="mt-cf__t">${mtEsc(o.title || 'Are you sure?')}</p>${o.text ? `<p class="mt-cf__x">${mtEsc(o.text)}</p>` : ''}${o.html || ''}
      <div class="mt-cf__b">${(o.buttons || []).map((b, i) => `<button type="button" class="mt-btn mt-btn--${b.kind || 's'}" data-i="${i}">${mtEsc(b.label)}</button>`).join('')}</div>`;
    host.appendChild(v);
    const done = val => { document.removeEventListener('keydown', key, true); v.remove(); resolve(val); };
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
    const done = v => { document.removeEventListener('keydown', key, true); h.remove(); resolve(v); };
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
  document.querySelectorAll('#mtPanel [data-only="schaden"]').forEach(el => {
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
  if (!document.getElementById('mtPdfFonts')) {
    const l = document.createElement('link');
    l.id = 'mtPdfFonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300;1,400&display=swap';
    document.head.appendChild(l);
  }
  try { await Promise.all(['400 26px "Playfair Display"', '400 12px "Lato"', '700 12px "Lato"', 'italic 400 10px "Lato"'].map(x => document.fonts.load(x))); } catch (e) {}
}
/* The data for the template (maint-schaden-pdf.js) — only what the Hausverwaltung needs */
function mtSbData(c, f, photoCount) {
  const S = (typeof appSettings !== 'undefined' && appSettings) || {};
  const casa = mtIsCasa(c.property_id), apt = casa ? null : mtSbApt(c);
  const adresse = casa ? [S.objekt_adresse, S.objekt_plz_ort].filter(Boolean).join(', ')
                       : (apt ? [apt.adresse, apt.plz_ort].filter(Boolean).join(', ') : '');
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
    subtitle: (casa ? ['Stand ' + stand] : ['an die Hausverwaltung', 'Stand ' + stand]).join(' · '),
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
    else if (a === 'pdfEntry') mtPdfEntry(b.dataset.id, b);
    else if (a === 'docsEdit') { if (MT.sel) { MT.sel.docEdit = true; MT.sel.fix = null; mtRenderPanel(); } }
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
    else if (a === 'costFileDel') mtCostFileDel(Number(b.dataset.i));
    else if (a === 'costCancel') mtCostCancel();
    else if (a === 'costSave') mtCostSave();
    else if (a === 'costDel') mtCostDelete();
    else if (a === 'costReturn') mtCostNewReturn();
    else if (a === 'sbOpen') mtSbOpen(b.dataset.id || (MT.sel && MT.sel.id));
    else if (a === 'sbClose') mtSbClose();
    else if (a === 'sty') mtSbStyle(b.dataset.col, b.dataset.v);
    else if (a === 'phase') mtSbPhase(b.dataset.id, b.dataset.v);
    else if (a === 'sbDelPhoto') { if (MT.sb && !MT.sb.busy) { mtSbCapsFlush(); MT.sb.askDel = String(b.dataset.id); mtSbPhotosRender(); } }
    else if (a === 'sbDelNo') { if (MT.sb) { MT.sb.askDel = null; mtSbPhotosRender(); } }
    else if (a === 'sbDelYes') mtSbDelPhoto(b.dataset.id);
    else if (a === 'sbBack') { if (MT.sb && !MT.sb.busy) { MT.sb.view = 'form'; mtSbRender(); } }
    else if (a === 'sbOpenPdf') mtSbOpenPdf();
    else if (a === 'moveKind') mtMoveKind();
    else if (a === 'more') { if (MT.sel) { MT.sel.more = !MT.sel.more; mtRenderPanel(); } }

    else if (a === 'sbFotos') { const f = MT.sb; if (f && !f.busy) { mtSbCapsFlush(); f.photosOn = b.dataset.v === '1'; mtSbPhotosRender(); } }
    else if (a === 'sbAddPhoto') mtSbAddPhoto();
    else if (a === 'sbMake') mtSbMake();
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (!t) return;
    if (t.closest && t.closest('#mtSbModal')) { mtSbChange(t); return; }
    if (t.id === 'mtF-kind') mtKindChanged();
    else if (t.id === 'mtF-prop' || t.id === 'mtF-art') mtSbVis();
    else if (t.id === 'mtF-end') mtEndChanged();
    else if (t.dataset && t.dataset.mtYear !== undefined) { MT.sumYear.all = t.value; mtRender(); }
    else if (t.id === 'mtF-status') mtStatusChanged();
    else if (t.dataset && t.dataset.docType) mtDocTypeChanged(t.dataset.docType);
  });
  document.addEventListener('keydown', mtBulletKey, true);
  document.addEventListener('focusin', e => { const t = e.target; if (mtIsBulletTa(t) && !t.value) mtTaSet(t, MT_BUL, MT_BUL.length); });
  document.addEventListener('focusout', e => { const t = e.target; if (mtIsBulletTa(t) && /^\s*•?\s*$/.test(t.value)) t.value = ''; });
  document.addEventListener('input', e => {
    if (mtIsBulletTa(e.target)) mtBulletFix(e.target);             // the Mieter typed by hand is kept when the Zimmer changes
    if (e.target && e.target.id === 'mtS-mieter' && MT.sb) MT.sb.mieterAuto = false;
    if (e.target && e.target.matches && e.target.matches('#mtPanel textarea.mt-ta, #mtSbModal textarea.mt-ta')) mtGrow(e.target);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && MT.sel && MT.sel.cost && document.getElementById('mtCostModal') && !document.querySelector('.mt-askv') && !document.getElementById('ccCal')) { mtCostCancel(); return; }
    if (e.key === 'Escape' && MT.sb && !document.getElementById('mtConfirm') && !document.getElementById('ccCal') && !document.getElementById('ccPdfSheet')) { mtSbClose(); return; }
    if (e.key === 'Escape' && MT.sel && !document.getElementById('mtConfirm') && !document.getElementById('ccCal')
        && !document.getElementById('mtSbSheet') && !document.getElementById('ccPdfSheet')) mtClose();
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
];
const MT_STY_DEF = { schadensbild: 'list', ursache: 'text', massnahmen: 'list', bitte_hv: 'list', report_dringend: 'text',
                     rb_anlass: 'text', rb_arbeiten: 'list', rb_ergebnis: 'text', rb_hinweise: 'list' };
const mtSty = (c, col) => (c && c.report_style && c.report_style[col]) || MT_STY_DEF[col] || 'text';
const mtBerichtLbl = c => (c && c.kind === 'renovierung' ? 'Renovierungsbericht' : 'Schadensbericht');

async function mtSbOpen(id) {
  const c = mtCase(id);
  if (!c || MT.sb) return;
  if (!MT.d5) { mtSay('Run MAINTENANCE-D5.sql in Supabase first.'); return; }
  if (c.kind === 'renovierung' && !MT.d17) { mtSay('Run MAINTENANCE-D17.sql in Supabase first.'); return; }
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
function mtSbFormHTML(c, f) {
  const kl = mtBerichtLbl(c), no = f.reportNo || c.report_no;
  const head = `<div class="mt-modal__h">
      <div><p class="mt-modal__k">${kl}${no ? ' · ' + mtEsc(no) : ''}</p>
        <p class="mt-modal__t" id="mtSbT">${mtEsc(c.title)}</p>
        <p class="mt-modal__sub">${mtEsc([mtPropName(c), mtWhere(c)].filter(Boolean).join(' · '))}</p></div>
      <button type="button" class="mt-modal__x" data-mt="sbClose" aria-label="Close"${f.busy ? ' disabled' : ''}><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>`;
  if (!f.ready) return head + '<div class="mt-modal__b"><p class="mt-up" role="status"><span class="mt-spin" aria-hidden="true"></span>Loading</p></div>';
  if (f.view === 'ready') return head + `<div class="mt-modal__b"><div class="mt-ready">
        <span class="mt-ready__ic"><i class="ti ti-file-check" aria-hidden="true"></i></span>
        <p class="mt-ready__t">${kl} is ready</p>
        <p class="mt-ready__s">${mtEsc([no, 'Stand ' + f.done].filter(Boolean).join(' · '))}</p>
        <p class="mt-ready__s">Saved in Documents</p>
        <button type="button" class="mt-ready__open" data-mt="sbOpenPdf"><i class="ti ti-file-text" aria-hidden="true"></i>Open PDF</button>
      </div></div>
      <div class="mt-modal__f"><span class="cc-foot-right">
        <button type="button" class="cc-foot-btn" data-mt="sbBack">Back to the report</button>
        <button type="button" class="cc-foot-btn" data-mt="sbClose">Close</button>
      </span></div>`;
  const casa = mtIsCasa(c.property_id);
  const up = (() => { const u = mtUpFor(c); return u && u.where === 'sb' ? u : null; })();
  const att = mtSbAttachDocs(c);
  const attRows = att.map(d => {
    const vid = d.doc_type === 'video', on = d.in_report !== false;
    return `<label class="mt-sba${on ? '' : ' is-off'}"><input type="checkbox" data-sb-att="${mtEsc(d.id)}"${on ? ' checked' : ''}/>
      <span class="mt-sba__t">${mtEsc(MT_DOC[d.doc_type] ? MT_DOC[d.doc_type].label : 'Document')}<small>${mtEsc([d.file_name, mtDate(d.doc_date)].filter(Boolean).join(' · '))}</small></span>
      <em>${vid ? 'sent separately' : 'added to the PDF'}</em></label>`;
  }).join('');
  return head + `<div class="mt-modal__b"><div class="mt-grid">
      ${!MT.d17 ? '<p class="mt-hint mt-f--full">Run MAINTENANCE-D17.sql in Supabase to get all fields of this report.</p>' : ''}
      ${casa ? `<p class="mt-sb__room mt-f--full">${f.room ? `Zimmer <b>${mtEsc(mtRoomLabel(f.room))}</b>` : 'No Zimmer yet'} · set in Edit</p>` : ''}
      ${c.kind === 'renovierung' ? mtRbFieldsBody(c) : mtSbFieldsBody(c, f)}
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
    </div></div>
    <div class="mt-modal__f">
      <p class="mt-sb__status" id="mtSb-status" role="status" hidden></p>
      <span class="cc-foot-right">
        <button type="button" class="cc-foot-btn" data-mt="sbClose"${f.busy ? ' disabled' : ''}>Close</button>
        <button type="button" class="cc-foot-btn mt-save${f.busy ? ' is-busy' : ''}" id="mtSb-make" data-mt="sbMake" data-cc-pdf="1"${f.busy || up ? ' disabled' : ''}>${f.busy ? '<span class="mt-spin" aria-hidden="true"></span>' : ''}${up ? 'Uploading photos' : 'Create PDF'}</button>
      </span>
    </div>`;
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
    if ((need === 16 && !MT.d16) || (need === 17 && !MT.d17)) continue;
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
  if (t.id && (t.id.startsWith('mtS-') || t.id.startsWith('mtR-'))) mtSbFlush();
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
      ${up ? `<p class="mt-up" role="status"><span class="mt-spin" aria-hidden="true"></span>Uploading ${Math.min(up.done + 1, up.total)} of ${up.total}</p>` : ''}
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
function mtBothHTML() {
  const ids = MT.cases.map(c => c.id), yy = mtSumYear(), yrs = mtCostYears();
  return `<div class="mt-both">
      <div class="mt-both__r1"><span class="mt-both__l">Both tabs ·</span><label class="mt-ysel"><select data-mt-year aria-label="Year">${yrs.map(v => `<option value="${v}"${v === yy ? ' selected' : ''}>${v}</option>`).join('')}</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>
        ${mtPdfChip('pdfYear', '', mtHasCosts(ids.map(String), yy))}</div>
      <div class="mt-both__r2"><span><i>${yy}</i>${mtEur(mtCost(ids, yy))}</span><span><i>Total</i>${mtEur(mtCost(ids))}</span></div>
    </div>`;
}
/* ── D22 · The receipt form as a pop-up (new receipt, a receipt row, a return) ── */
function mtCostModalSync() {
  const s = MT.sel;
  if (s && s.cost) return;
  const m = document.getElementById('mtCostModal');
  if (m) { m.remove(); if (!document.getElementById('mtSbModal')) document.documentElement.classList.remove('mt-modal-open'); }
}
function mtCostModalRender() {
  const s = MT.sel, f = s && s.cost, c = s && !s.isNew ? mtCase(s.id) : null;
  if (!f || !c) { mtCostModalSync(); return; }
  let m = document.getElementById('mtCostModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'mtCostModal'; m.className = 'mt-modal';
    document.body.appendChild(m);
    document.documentElement.classList.add('mt-modal-open');
  }
  const ret = !!f.return_of;
  const kk = ret ? (f.isNew ? 'New return' : 'Return') : (f.isNew ? 'New receipt' : 'Receipt');
  m.innerHTML = `<div class="mt-modal__bg" data-mt="costCancel"></div>
    <div class="mt-modal__s" role="dialog" aria-modal="true" aria-labelledby="mtCostT">
      <div class="mt-modal__h">
        <div><p class="mt-modal__k">${kk}</p><p class="mt-modal__t" id="mtCostT">${mtEsc(c.title)}</p>
          <p class="mt-modal__sub">${mtEsc([mtPropName(c), mtWhere(c)].filter(Boolean).join(' · '))}</p></div>
        <button type="button" class="mt-modal__x" data-mt="costCancel" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button>
      </div>
      <div class="mt-modal__b">${mtCostFormHTML(f)}</div>
      <div class="mt-modal__f"></div>
    </div>`;
  const foot = m.querySelector('#mtC-form > .cc-sec-foot'), mf = m.querySelector('.mt-modal__f');
  if (foot && mf) mf.appendChild(foot);                     // Cancel · Save (· Delete · Return) at the bottom of the pop-up
}
/* ── D22 · "Move to Schäden / Renovierungen" in Edit (instead of the type switch) ── */
function mtMoveKind() {
  const k = document.getElementById('mtF-kind'), c = MT.sel && !MT.sel.isNew ? mtCase(MT.sel.id) : null;
  if (!k || !c) return;
  const orig = c.kind, other = orig === 'schaden' ? 'renovierung' : 'schaden';
  k.value = k.value === orig ? other : orig;
  mtKindChanged();
  const b = document.getElementById('mtF-move');
  if (b) b.textContent = k.value === orig ? 'Move to ' + MT_KIND[other].title : 'Moves to ' + MT_KIND[other].title + ' on Save · undo';
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
  const has = mtHasCosts([String(c.id)]), id = mtEsc(c.id);
  return `<div class="mt-acts${inPanel ? ' mt-acts--in' : ''}">
      <span class="mt-pdfw"><button type="button" class="mt-act${has ? '' : ' off'}" data-mt="pdfEntry" data-id="${id}" data-cc-pdf="1" data-label="Kostenübersicht"${has ? '' : ' aria-disabled="true"'}><i class="ti ti-file-text" aria-hidden="true"></i>Kostenübersicht</button></span>
      <button type="button" class="mt-act" data-mt="sbOpen" data-id="${id}"><i class="ti ti-file-description" aria-hidden="true"></i>${mtBerichtLbl(c)}</button>
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
    mode: 'rb', titel: 'Renovierungsbericht – ' + c.title, subtitle: 'Stand ' + b.stand, dringend: '',
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
async function mtSbMake() {
  const f = MT.sb, c = mtSbCase();
  const stop = msg => { if (typeof ccCancelPdf === 'function') ccCancelPdf(); if (msg) mtSay(msg); };
  if (!c || !f || !f.ready || f.busy || f.view === 'ready' || MT.busy || MT.up) return stop(MT.up ? 'Wait until the photos are uploaded.' : '');
  const rb = c.kind === 'renovierung', kl = mtBerichtLbl(c);
  if (!rb && mtIsCasa(c.property_id) && !f.room) return stop('Set the Zimmer in Edit first (or Gemeinschaftsfläche).');
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
    step = 'libs'; status('Getting ready');
    await limit(mtSbLibs(), 45, 'libs');
    f.reportNo = c.report_no || mtSbNextNo(rb ? 'RB' : 'SB');
    step = 'photos';
    const photos = f.photosOn ? await limit(mtSbPhotoData(c, (k, n) => status(`Loading photo ${k} of ${n}`)), 120, 'photos') : [];
    step = 'attachments';
    f.att = await limit(mtSbAttachData(c), 60, 'attachments');
    step = 'pages'; status('Building the pages');
    const d = rb ? mtRbData(c, f, photos.length) : mtSbData(c, f, photos.length);
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
    let pdf;
    try { pdf = await limit(ccRenderPagesToPdf(box, { strict: true }), 180, 'pages'); }
    finally { fix.remove(); }
    step = 'save'; status('Saving the PDF');
    const blob = await limit(mtSbMerge(pdf.output('blob'), f.att), 60, 'attachments');   // the Anlagen PDFs at the end
    const path = await limit(mtSbStore(c, blob, `${kl} ${f.reportNo} Stand ${d.stand}.pdf`, rb ? 'renovierungsbericht' : 'schadenbericht'), 90, 'save');
    if (!path) throw new Error('store');
    await limit(mtSbRemember(c, f), 30, 'save').catch(() => {});
    Object.assign(f, { busy: false, done: d.stand, view: 'ready', pdfPath: path, pdfName: ccPdfFileName(kl, f.reportNo, d.objektName, 'Stand ' + d.stand) });
    await limit(mtPrepareLinks([path]), 30, 'link').catch(() => {});
    const url = mtLinkNow(path), inApp = typeof CC_STANDALONE !== 'undefined' && CC_STANDALONE;
    if (url && !inApp && typeof ccOpenUrl === 'function') ccOpenUrl(url, f.pdfName);   // browser: the tab opened at the tap shows it
    else if (typeof ccCancelPdf === 'function') ccCancelPdf();
    mtSbRender();                                              // the ready view, same pop-up
    if (MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(c.id)) mtRenderPanel();
    mtRender();
  } catch (e) {
    console.error('[maintenance] Bericht:', step, e);
    f.busy = false;
    setBusy(false);
    const m = String((e && e.message) || '');
    const STEP = { fields: 'saving the fields', libs: 'getting ready', photos: 'loading the photos', attachments: 'adding the Anlagen', pages: 'building the pages', save: 'saving the PDF', link: 'opening it' };
    stop(MT.sbStoreHint
      || (/did not fit/.test(m) ? m
      : m === 'fields' ? ''                                      // its own message was shown already
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


function mtSbRender() {
  const f = MT.sb, c = mtSbCase();
  let m = document.getElementById('mtSbModal');
  if (!f || !c) {
    if (m) m.remove();
    document.documentElement.classList.remove('mt-modal-open');
    return;
  }
  if (!m) {
    m = document.createElement('div');
    m.id = 'mtSbModal'; m.className = 'mt-modal';
    document.body.appendChild(m);
    document.documentElement.classList.add('mt-modal-open');
  }
  m.innerHTML = `<div class="mt-modal__bg" data-mt="sbClose"></div>
    <div class="mt-modal__s" role="dialog" aria-modal="true" aria-labelledby="mtSbT">${mtSbFormHTML(c, f)}</div>`;
  mtSbThumbs();
  m.querySelectorAll('textarea.mt-ta').forEach(mtGrow);
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
  el.outerHTML = mtSbPhotosHTML(c, f);
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
  MT.sb = null;
  mtSbRender();
  if (MT.sel && !MT.sel.isNew) mtRenderPanel();            // new photos / reports show in Documents
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
    if (MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(c.id)) mtRenderPanel();
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
  mtOpen(c.id).then(() => setTimeout(() => {
    const sel = r && (window.CSS && CSS.escape ? CSS.escape(String(r.id)) : String(r.id));
    const row = sel ? document.querySelector(`#mtCosts .mt-cr[data-id="${sel}"]`) : null;
    (row || document.getElementById('mtCosts'))?.scrollIntoView({ block: 'center' });
    if (row) { row.classList.add('is-flash'); setTimeout(() => row.classList.remove('is-flash'), 1600); }
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
  } catch (e) {
    console.error('[maintenance] boot failed:', e);
    MT.loadError = e;
    document.getElementById('appShell').style.display = 'block';
    mtSwitchTab(MT.tab);
  } finally {
    ctlShowLoading(false);
  }
}
