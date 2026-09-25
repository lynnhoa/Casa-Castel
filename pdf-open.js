/* ─────────────────────────────────────────────────────────────
   REAL ESTATE MANAGEMENT — PDF OPEN + GENERATOR DRAFTS
   pdf-open.js   (loaded by landlord.html and rentals-index.html)

   WHY THIS FILE EXISTS
   The old PDF code moved the app page itself to the PDF (pdf.save /
   download link). On iPhone that unloads the app, so closing the PDF
   restarted it and sent you to the login page with the form gone.

   HOW IT WORKS NOW
   1. The PDF is created once (print quality, low memory).
   2. It is stored for a few minutes in the private "pdf-temp" storage
      (only a logged-in landlord can read it) and opened with a
      10-minute link:
        · iPhone  → the iPhone's own full-page PDF viewer opens ON TOP of
                    the app (Share → Save to Files / Mail, Done → back)
        · Computer → the browser's PDF viewer opens in a new tab
      The app page is never replaced, so everything you typed stays.
   3. The PDF tab / viewer is opened AT THE MOMENT you tap "Generate PDF"
      (showing "Creating PDF…"), and the finished PDF is loaded into it.
      Phones and browsers only allow opening directly from a tap — creating
      the PDF takes a few seconds, so waiting would get it blocked.
      (A "PDF ready" sheet is only a last resort if even that is blocked.)
      Installed app (home-screen icon): the app page is never replaced; after
      creating, the Generate button becomes "Open PDF" (iPhone viewer on top of
      the app, X brings you back) + "Save / Share" (real file name).
   4. If the temporary storage is not reachable, the iPhone share menu
      (or a normal download on the computer) is used instead.
   5. Generator drafts: what you type in a generator is kept for 2 hours
      (cleared on Cancel / logout) and restored if the app ever restarts.

   Public API:
     ccRenderPagesToPdf(container)   → jsPDF (one render per .pdf-page)
     ccOpenPdf(pdfOrBlob, filename)  → opens the PDF as described above
     ccOpenUrl(url, label)           → opens an existing (signed) link
     ccDraftAutoSave(key, root, metaFn) / ccDraftGet(key)
     ccDraftApply(root, draft) / ccDraftClear(key) / ccDraftClearAll()
   Depends on: supabase-client.js (sbL), html2canvas, jsPDF
   ───────────────────────────────────────────────────────────── */

const CC_PDF_BUCKET        = 'pdf-temp';
const CC_PDF_LINK_SECONDS  = 1800;           // the opening link works for 30 minutes
const CC_PDF_KEEP_MINUTES  = 40;             // older temporary PDFs are deleted (after the link has expired)
const CC_DRAFT_MAX_MS      = 2 * 60 * 60 * 1000;   // generator drafts: 2 hours
const CC_DRAFT_PREFIX      = 'cc_draft_';
const CC_APT_DRAFT_KEY     = 'rnt_apt_contract_draft';   // existing Rentals apartments draft

/* ── FILE NAME ──────────────────────────────────────────────
   ASCII only (Übergabeprotokoll → Uebergabeprotokoll): iOS and some
   browsers mishandle umlauts in file names.                      */
function ccPdfSafeName(name) {
  let n = String(name || 'document.pdf')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!/\.pdf$/i.test(n)) n += '.pdf';
  return n || 'document.pdf';
}

/* ── RENDER ─────────────────────────────────────────────────
   Every .pdf-page (794×1123 px) becomes one A4 page. One render per
   page at 2× (≈190 dpi, sharp in print) and each canvas is released
   straight away — the old code rendered twice at up to 3×.       */
async function ccRenderPagesToPdf(container, opts = {}) {
  try { await ccFlowPages(container); } catch (e) { console.warn('[pdf] page flow skipped:', e); }
  const pages = container ? container.querySelectorAll('.pdf-page') : [];
  if (!pages.length) { _ccCloseWaitingTab(); throw new Error('no .pdf-page nodes rendered'); }
  try { return await _ccRender(pages, opts); }
  catch (e) { _ccCloseWaitingTab(); throw e; }
}
async function _ccRender(pages, opts) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const canvas = await html2canvas(pages[i], {
      scale: opts.scale || 2, useCORS: true, backgroundColor: '#ffffff',
      width: 794, height: 1123, windowWidth: 794,
    });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, 210, 297);
    canvas.width = 0; canvas.height = 0;   // free the memory right away
  }
  return pdf;
}

/* ── AUTOMATIC PAGE FLOW (nothing is cut off) ──────────────
   Every PDF page is a fixed A4 block; text that does not fit used to be cut
   off at the bottom (Verwendungszweck, rent lines, Mietzeit with 2–3 tenants,
   long inventory lists). Before rendering, each page is measured:
   · what does not fit moves on — to the top of the next page if it fits there,
     otherwise onto a new page with the same header and footer;
   · a section moves together with its heading (never a heading alone at the
     bottom), so bank details or signatures are not torn apart;
   · long tables (inventory, meters) continue on the next page, header repeated;
   · page numbers in the footer are renumbered afterwards.            */
const CC_FLOW_HEADINGS = '.sec, .doc-title, .doc-subtitle';
function _ccFlowKids(content) {
  return [...content.children].filter(k => {
    const cs = getComputedStyle(k);
    return cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed';
  });
}
function _ccFlowLimit(content) {
  const r = content.getBoundingClientRect();
  return r.top + content.clientHeight;
}
function _ccOverflowing(content) {
  const limit = _ccFlowLimit(content);
  return _ccFlowKids(content).some(k => k.getBoundingClientRect().bottom > limit + 0.5);
}
// Splits a table (or a block holding one table) at the first row that does not
// fit. Returns the continuation block (header rows kept), or null.
function _ccSplitTable(el, limit) {
  const table = el.tagName === 'TABLE' ? el : el.querySelector('table');
  if (!table) return null;
  const dataRows = t => [...t.querySelectorAll('tr')].filter(tr => !tr.closest('thead') && !tr.querySelector('th'));
  const rows = dataRows(table);
  const r = rows.findIndex(tr => tr.getBoundingClientRect().bottom > limit + 0.5);
  if (r <= 0) return null;
  const clone = el.cloneNode(true);
  const cTable = clone.tagName === 'TABLE' ? clone : clone.querySelector('table');
  // continuation keeps only the table (no repeated title text around it)
  if (clone !== cTable) {
    let n = cTable;
    while (n && n !== clone) {
      [...n.parentElement.children].forEach(sib => { if (sib !== n && !sib.contains(cTable)) sib.remove(); });
      n = n.parentElement;
    }
  }
  dataRows(cTable).slice(0, r).forEach(tr => tr.remove());
  rows.slice(r).forEach(tr => tr.remove());
  clone.setAttribute('data-cc-continued', '1');
  return clone;
}
function _ccCanReceive(content) {
  const first = _ccFlowKids(content)[0];
  if (!first) return true;
  if (first.matches('.doc-title')) return false;                         // a new document part
  return !/^\s*Anlage/i.test(first.textContent || '');                  // an annex starts its own page
}
function _ccPlaceAfter(container, pg, moved) {
  const pages = [...container.querySelectorAll('.pdf-page')];
  const next = pages[pages.indexOf(pg) + 1];
  const nextContent = next && next.querySelector(':scope > .content');
  if (nextContent && _ccCanReceive(nextContent)) {
    const anchor = nextContent.firstChild;
    moved.forEach(m => nextContent.insertBefore(m, anchor));
    if (!_ccOverflowing(nextContent)) return;
    moved.forEach(m => m.remove());                                      // does not fit there → new page
  }
  const np = pg.cloneNode(true);
  const npc = np.querySelector(':scope > .content');
  npc.innerHTML = '';
  moved.forEach(m => npc.appendChild(m));
  pg.after(np);
}
function _ccRenumberPages(container) {
  const spans = [...container.querySelectorAll('.pdf-page')].map(p => p.querySelector('.ftr__row > span:last-child'));
  if (spans.length && spans.every(sp => sp && /^\s*\d+\s*$/.test(sp.textContent)))
    spans.forEach((sp, i) => { sp.textContent = String(i + 1); });
}
async function ccFlowPages(container) {
  if (!container) return;
  try { if (document.fonts) await document.fonts.ready; } catch (e) {}
  let guard = 0;
  for (let i = 0; i < container.querySelectorAll('.pdf-page').length && guard < 200; i++) {
    const pg = container.querySelectorAll('.pdf-page')[i];
    const content = pg.querySelector(':scope > .content');
    if (!content) continue;
    for (let round = 0; round < 40 && guard < 200; round++, guard++) {
      const limit = _ccFlowLimit(content);
      const kids = _ccFlowKids(content);
      const idx = kids.findIndex(k => k.getBoundingClientRect().bottom > limit + 0.5);
      if (idx < 0) break;
      const el = kids[idx];
      let moved = null;
      // 1) a table that partly fits → continue its rows on the next page
      if (el.getBoundingClientRect().top < limit - 30) {
        const cont = _ccSplitTable(el, limit);
        if (cont) moved = [cont, ...kids.slice(idx + 1)];
      }
      if (!moved) {
        // 2) move the whole section (from its heading) — unless it is very long
        let start = idx;
        for (let s = idx; s >= 0; s--) { if (kids[s].matches(CC_FLOW_HEADINGS)) { start = s; break; } }
        const pageH = content.clientHeight;
        if (start === 0 || (limit - kids[start].getBoundingClientRect().top) > pageH * 0.5) start = idx;
        while (start > 0 && kids[start - 1].matches(CC_FLOW_HEADINGS)) start--;   // never leave a heading alone
        if (start === 0) {
          if (kids.length > 1 && idx > 0) start = idx;                       // page starts with this section
          else break;                                                        // one block taller than a page
        }
        moved = kids.slice(start);
      }
      if (!moved.length) break;
      _ccPlaceAfter(container, pg, moved);
    }
  }
  _ccRenumberPages(container);
}

/* ── OPEN THE PDF TAB RIGHT AT THE TAP ───────────────────────
   Every "Generate PDF" button and every document "View" button opens its
   tab/viewer immediately (a tap is the only moment phones allow it). The
   tab shows "Creating PDF…" until the finished PDF is loaded into it. */
const CC_PDF_TRIGGERS = '#contractPdfBtn, #aptKzPdfBtn, #aptGwPdfBtn, #aptMvPdfBtn, #aptUebergPdfBtn, '
                      + '#pkMvPdfBtn, #pkUebergPdfBtn, [onclick*="ViewDoc("]';
const CC_WAITING_PAGE =
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Creating PDF…</title></head>' +
  '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#F5F2ED;' +
  'font-family:-apple-system,BlinkMacSystemFont,Inter,Helvetica,Arial,sans-serif;color:#3A3530;">' +
  '<div style="text-align:center;padding:24px;"><p style="font-size:17px;margin:0 0 6px;">Creating PDF…</p>' +
  '<p style="font-size:13px;margin:0;color:#9A8E7E;">It opens here in a moment.</p>' +
  '<p id="slow" style="display:none;font-size:13px;margin:14px 0 0;color:#9A8E7E;">Taking longer than usual? ' +
  'Switch back to the app for a moment — the PDF then opens here.</p></div>' +
  '<script>setTimeout(function(){var e=document.getElementById("slow");if(e)e.style.display="block";},20000);<\/script>' +
  '</body></html>';
let _ccPending = null;   // { win, timer } — the tab opened at the tap, waiting for its PDF

/* Installed app (home-screen icon): the app page is NEVER replaced (that made the
   iPhone restart the app at the login page when the viewer was closed). Instead the
   Generate button turns into "Open PDF" + "Save / Share" — see _ccShowReady. */
let _ccLastTrigger = null;   // the Generate button that was tapped
const CC_STANDALONE = (() => {
  try { return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; }
  catch (e) { return false; }
})();
const CC_PDF_RETURN_KEY = 'cc_pdf_return';   // set while the PDF viewer is open (installed app)
const CC_PDF_RETURN_MS  = 15 * 60 * 1000;

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target.closest(CC_PDF_TRIGGERS) : null;
  if (!t || t.disabled || t.classList.contains('off')) return;
  _ccLastTrigger = t;
  if (CC_STANDALONE) return;                             // installed app: see _ccShowReady
  _ccOpenWaitingTab();
}, true);   // capture: runs before the button's own handler, still inside the tap

function _ccOpenWaitingTab() {
  if (_ccPending && _ccPending.win && !_ccPending.win.closed) return;
  let win = null;
  try { win = window.open('', '_blank'); } catch (e) { win = null; }
  if (!win) { _ccPending = null; return; }
  try { win.document.open(); win.document.write(CC_WAITING_PAGE); win.document.close(); } catch (e) {}
  _ccPending = { win, timer: setTimeout(_ccCloseWaitingTab, 3 * 60 * 1000) };   // never leave it hanging
}
function _ccTakeWaitingTab() {
  const p = _ccPending; _ccPending = null;
  if (p) clearTimeout(p.timer);
  return (p && p.win && !p.win.closed) ? p.win : null;
}
function _ccCloseWaitingTab() {
  const w = _ccTakeWaitingTab();
  if (w) { try { w.close(); } catch (e) {} }
}
// A generator that stops (missing field, error message) → close the waiting tab first,
// so you land back in the app where the message is shown.
(function () {
  const nativeAlert = window.alert;
  window.alert = function (msg) { _ccCloseWaitingTab(); return nativeAlert.call(window, msg); };
})();

/* ── OPEN A FINISHED PDF ─────────────────────────────────── */
async function ccOpenPdf(pdfOrBlob, filename) {
  const name = ccPdfSafeName(filename);
  const blob = (pdfOrBlob && typeof pdfOrBlob.output === 'function')
    ? pdfOrBlob.output('blob') : pdfOrBlob;
  const url = await _ccUploadTempPdf(blob, name);
  if (CC_STANDALONE) return _ccShowReady(url, blob, name);
  if (url) return ccOpenUrl(url, name);
  return _ccFallbackDeliver(blob, name);
}

/* ── INSTALLED APP: "Open PDF" + "Save / Share" in place of Generate ──
   The iPhone only opens its viewer ON TOP of the app from a tap, so the ready
   PDF gets one button: tap → viewer over the app → X → generator untouched. */
function _ccShowReady(url, blob, name) {
  const trigger = (_ccLastTrigger && document.contains(_ccLastTrigger)) ? _ccLastTrigger : null;
  _ccLastTrigger = null;
  const footer = trigger && trigger.parentElement;
  if (!footer) {                                        // no generator footer (should not happen)
    if (url) { _ccShowSheet({ title: 'PDF ready', name, href: url, action: 'Open PDF' }); return 'sheet'; }
    return _ccFallbackDeliver(blob, name);
  }
  _ccClearReady(footer);
  const box = document.createElement('div');
  box.className = 'cc-pdf-ready';
  box.style.cssText = 'display:flex;gap:8px;flex:1;justify-content:flex-end;align-items:center;';
  if (url) {
    const open = document.createElement('a');
    open.className = 'cc-pdf-ready__open';
    open.href = url; open.target = '_blank'; open.rel = 'noopener';
    open.textContent = 'Open PDF';
    // Safety net: if the iPhone ever reloads the app while the viewer is open,
    // you still come back into this generator (marker is dropped on normal return).
    open.addEventListener('click', () => {
      try { sessionStorage.setItem(CC_PDF_RETURN_KEY, String(Date.now())); } catch (e) {}
      const back = () => {
        if (document.visibilityState !== 'visible') return;
        document.removeEventListener('visibilitychange', back);
        try { sessionStorage.removeItem(CC_PDF_RETURN_KEY); } catch (e) {}
      };
      setTimeout(() => document.addEventListener('visibilitychange', back), 500);
    });
    open.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;padding:11px 16px;border-radius:10px;' +
      'background:#B8976A;color:#fff;font-weight:600;font-size:14px;text-decoration:none;white-space:nowrap;';
    box.appendChild(open);
  }
  const share = document.createElement('button');
  share.type = 'button';
  share.className = 'cc-pdf-ready__share';
  share.textContent = url ? 'Save / Share' : 'Save / Share PDF';
  share.style.cssText = 'padding:11px 14px;border-radius:10px;border:1px solid #D9CFC2;background:#fff;color:#3A3530;' +
    'font:inherit;font-size:14px;cursor:pointer;white-space:nowrap;';
  share.onclick = () => _ccSharePdf(blob, name);
  box.appendChild(share);
  trigger.style.display = 'none';
  footer.appendChild(box);
  // Anything changed in the generator → this PDF is outdated → Generate button back
  const sheet = footer.closest('.rm-sheet') || footer.parentElement;
  const reset = e => {
    if (e && box.contains(e.target)) return;
    sheet.removeEventListener('input', reset, true);
    sheet.removeEventListener('change', reset, true);
    _ccClearReady(footer);
  };
  sheet.addEventListener('input', reset, true);
  sheet.addEventListener('change', reset, true);
  setTimeout(() => { if (box.isConnected) reset(); }, 25 * 60 * 1000);   // link valid 30 min
  return 'ready';
}
function _ccClearReady(footer) {
  footer.querySelectorAll('.cc-pdf-ready').forEach(b => b.remove());
  footer.querySelectorAll(CC_PDF_TRIGGERS).forEach(b => { if (b.style.display === 'none') b.style.display = ''; });
}
// iPhone share menu with the real file name (Save to Files, Mail, Print); computer: download
async function _ccSharePdf(blob, name) {
  let file = null;
  try { file = new File([blob], name, { type: 'application/pdf' }); } catch (e) { file = null; }
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); } catch (e) { /* closed */ }
    return;
  }
  const bUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = bUrl; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(bUrl); a.remove(); }, 60000);
}

/* ── OPEN A LINK (new tab / iPhone viewer on top of the app) ── */
function ccOpenUrl(url, label) {
  const waiting = _ccTakeWaitingTab();                 // opened at the tap → just load the PDF into it
  if (waiting) { try { waiting.location.replace(url); return 'opened'; } catch (e) {} }
  let win = null;
  try { win = window.open(url, '_blank'); } catch (e) { win = null; }
  if (win) return 'opened';
  // Last resort (the tap-time tab could not be opened, e.g. pop-ups fully
  // disabled): one-tap sheet. If the app page went to the background, it opened.
  setTimeout(() => {
    if (document.visibilityState === 'hidden' || document.hidden) return;
    _ccShowSheet({ title: 'PDF ready', name: label, href: url, action: 'Open PDF' });
  }, 700);
  return 'sheet';
}

/* ── TEMPORARY PRIVATE STORAGE ───────────────────────────── */
async function _ccUploadTempPdf(blob, name) {
  if (typeof sbL === 'undefined' || !sbL || !sbL.storage || !blob) return null;
  try {
    _ccCleanupTempPdfs();                                   // background, not awaited
    const folder = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const path   = folder + '/' + name;
    const store  = sbL.storage.from(CC_PDF_BUCKET);
    const up = await store.upload(path, blob, { contentType: 'application/pdf', upsert: false });
    if (up && up.error) { console.warn('[pdf] temporary upload failed:', up.error.message); return null; }
    const { data, error } = await store.createSignedUrl(path, CC_PDF_LINK_SECONDS);
    if (error || !data || !data.signedUrl) { console.warn('[pdf] link failed:', error && error.message); return null; }
    return data.signedUrl;
  } catch (e) {
    console.warn('[pdf] temporary link failed:', e);
    return null;
  }
}

let _ccCleanupRunning = false;
async function _ccCleanupTempPdfs() {
  if (_ccCleanupRunning || typeof sbL === 'undefined' || !sbL || !sbL.storage) return;
  _ccCleanupRunning = true;
  try {
    const store  = sbL.storage.from(CC_PDF_BUCKET);
    const cutoff = Date.now() - CC_PDF_KEEP_MINUTES * 60 * 1000;
    const { data: folders } = await store.list('', { limit: 100 });
    for (const f of folders || []) {
      const ts = parseInt(f.name, 10);
      if (!ts || ts > cutoff) continue;
      const { data: files } = await store.list(f.name, { limit: 20 });
      const paths = (files || []).map(x => f.name + '/' + x.name);
      if (paths.length) await store.remove(paths);
    }
  } catch (e) { /* cleanup is best effort */ }
  finally { _ccCleanupRunning = false; }
}

/* ── FALLBACK (temporary storage not reachable) ──────────── */
async function _ccFallbackDeliver(blob, name) {
  const waiting = _ccTakeWaitingTab();                 // show the local copy in the tab opened at the tap
  if (waiting) {
    try { waiting.location.replace(URL.createObjectURL(blob)); return 'opened'; } catch (e) {}
  }
  let file = null;
  try { file = new File([blob], name, { type: 'application/pdf' }); } catch (e) { file = null; }
  // iPhone / iPad: the iPhone share menu (Save to Files, Mail, …)
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';     // user closed the menu
      _ccShowSheet({ title: 'PDF ready', name, action: 'Save / Share PDF',
        onTap: () => navigator.share({ files: [file], title: name }).catch(() => {}) });
      return 'sheet';
    }
  }
  // Computer: normal download (never replaces the app page)
  const bUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = bUrl; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(bUrl); a.remove(); }, 60000);
  return 'downloaded';
}

/* ── "PDF READY" SHEET (one tap when automatic opening was blocked) ── */
function _ccShowSheet({ title, name, href, action, onTap }) {
  document.getElementById('ccPdfSheet')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'ccPdfSheet';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:center;';
  const esc_ = s => String(s || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const btnStyle = 'display:flex;align-items:center;justify-content:center;gap:8px;height:48px;border-radius:10px;font-size:14px;font-weight:500;text-decoration:none;cursor:pointer;font-family:inherit;';
  wrap.innerHTML =
    '<div style="width:100%;max-width:480px;background:var(--cc-surface,#fff);border-radius:14px 14px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom,0px));box-shadow:0 -4px 24px rgba(0,0,0,.12);">' +
      '<p style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--cc-taupe,#8a8175);margin:0 0 4px;">' + esc_(title) + '</p>' +
      '<p style="font-size:13px;color:var(--cc-ink,#1e1b18);margin:0 0 16px;word-break:break-all;">' + esc_(name) + '</p>' +
      (href
        ? '<a id="ccPdfSheetGo" href="' + esc_(href) + '" target="_blank" rel="noopener" style="' + btnStyle + 'background:var(--cc-ink,#1e1b18);color:#fff;">' + esc_(action) + '</a>'
        : '<button id="ccPdfSheetGo" type="button" style="' + btnStyle + 'width:100%;border:none;background:var(--cc-ink,#1e1b18);color:#fff;">' + esc_(action) + '</button>') +
      '<button id="ccPdfSheetClose" type="button" style="' + btnStyle + 'width:100%;margin-top:8px;border:0.5px solid var(--cc-rule,#e0dad0);background:none;color:var(--cc-taupe,#8a8175);">Close</button>' +
    '</div>';
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  wrap.querySelector('#ccPdfSheetClose').addEventListener('click', close);
  wrap.querySelector('#ccPdfSheetGo').addEventListener('click', () => {
    if (onTap) onTap();
    setTimeout(close, 300);
  });
}

/* ── GENERATOR DRAFTS (2 hours) ──────────────────────────────
   Keeps what you type in a generator, so a restarted app can reopen the
   same generator with everything filled in. Stored only on this device,
   cleared on Cancel / close / logout and after 2 hours.            */
function _ccIsActive(el) {
  return el.classList.contains('active') || el.classList.contains('active-fael')
      || el.classList.contains('active-mindest') || el.dataset.active === '1';
}
function _ccOptSelector(el) {
  const cls = [...el.classList].find(c => !/^active/.test(c));
  if (!cls || el.dataset.val === undefined) return null;
  return '.' + CSS.escape(cls) + '[data-val="' + CSS.escape(el.dataset.val) + '"]';
}
function ccDraftSnapshot(root) {
  const fields = {}, radios = {}, modes = {}, actives = [];
  root.querySelectorAll('input[id], textarea[id], select[id]').forEach(el => {
    if (el.type === 'radio' || el.type === 'file') return;
    fields[el.id] = el.type === 'checkbox' ? (el.checked ? '__on__' : '__off__') : el.value;
  });
  root.querySelectorAll('input[type=radio]:checked').forEach(r => { if (r.name) radios[r.name] = r.value; });
  root.querySelectorAll('[id][data-mode]').forEach(el => { modes[el.id] = el.dataset.mode; });
  root.querySelectorAll('[data-val]').forEach(el => {
    if (_ccIsActive(el)) { const sel = _ccOptSelector(el); if (sel) actives.push(sel); }
  });
  return { fields, radios, modes, actives };
}
function ccDraftSave(key, root, meta) {
  if (!root || !meta) return;
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), meta, ...ccDraftSnapshot(root) })); }
  catch (e) { /* never block the app */ }
}
function ccDraftGet(key) {
  try {
    const d = JSON.parse(localStorage.getItem(key) || 'null');
    if (!d) return null;
    if (Date.now() - (d.ts || 0) > CC_DRAFT_MAX_MS) { localStorage.removeItem(key); return null; }
    return d;
  } catch (e) { return null; }
}
function ccDraftClear(key) { try { localStorage.removeItem(key); } catch (e) {} }
function ccDraftClearAll() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      if (k.indexOf(CC_DRAFT_PREFIX) === 0 || k === CC_APT_DRAFT_KEY) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}
// Saves while typing (debounced). metaFn() returns null when the generator is closed.
function ccDraftAutoSave(key, root, metaFn) {
  if (!root) return;
  root._ccDraftBinding = { key, metaFn };
  if (root._ccDraftWired) return;
  root._ccDraftWired = true;
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const b = root._ccDraftBinding; if (!b) return;
      const meta = b.metaFn(); if (meta) ccDraftSave(b.key, root, meta);
    }, 400);
  };
  ['input', 'change', 'click'].forEach(ev => root.addEventListener(ev, save, true));
}
// Refills a reopened generator: toggles first, then option buttons, then values.
async function ccDraftApply(root, d) {
  if (!root || !d) return;
  const own = el => el && root.contains(el);
  const applyModes = () => Object.entries(d.modes || {}).forEach(([id, mode]) => {
    const el = document.getElementById(id);
    for (let i = 0; i < 3 && own(el) && el.dataset.mode !== mode; i++) el.click();
  });
  applyModes();
  (d.actives || []).forEach(sel => {
    try { const el = root.querySelector(sel); if (el && !_ccIsActive(el)) el.click(); } catch (e) {}
  });
  Object.entries(d.fields || {}).forEach(([id, val]) => {
    const el = document.getElementById(id); if (!own(el)) return;
    if (el.type === 'checkbox') el.checked = (val === '__on__'); else el.value = val;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  applyModes();                                   // value changes can reset toggles
  Object.entries(d.radios || {}).forEach(([name, val]) => {
    try {
      const r = root.querySelector('input[type=radio][name="' + CSS.escape(name) + '"][value="' + CSS.escape(val) + '"]');
      if (r && !r.checked) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    } catch (e) {}
  });
}


/* ── HELPERS FOR THE GENERATORS ──────────────────────────── */
// A generator that stops without creating a PDF → close the waiting tab.
function ccCancelPdf() { _ccCloseWaitingTab(); }

// True once, right after the PDF viewer was closed (installed app).
function ccCameBackFromPdf() {
  let ts = 0;
  try { ts = +sessionStorage.getItem(CC_PDF_RETURN_KEY) || 0; sessionStorage.removeItem(CC_PDF_RETURN_KEY); } catch (e) {}
  return ts > 0 && Date.now() - ts < CC_PDF_RETURN_MS;
}

/* Unfinished contract: never forced open. A small bar offers it; the
   generator only opens when you tap "Continue". */
function ccOfferDraft({ label, ts, onContinue, onDiscard }) {
  document.getElementById('ccDraftOffer')?.remove();
  const mins = ts ? Math.max(1, Math.round((Date.now() - ts) / 60000)) : 0;
  const bar = document.createElement('div');
  bar.id = 'ccDraftOffer';
  bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:9000;' +
    'max-width:520px;margin:0 auto;background:#fff;border:1px solid #E5DFD6;border-radius:12px;' +
    'box-shadow:0 6px 24px rgba(58,53,48,.14);padding:12px 14px;display:flex;align-items:center;gap:10px;' +
    'font-family:inherit;font-size:13px;color:#3A3530;';
  const txt = document.createElement('div');
  txt.style.cssText = 'flex:1;min-width:0;line-height:1.35;';
  txt.innerHTML = '<div style="font-weight:600;">Unfinished contract</div><div style="color:#9A8E7E;font-size:12px;"></div>';
  txt.lastChild.textContent = label + (mins ? ' · ' + mins + ' min ago' : '');
  const btnGo = document.createElement('button');
  btnGo.type = 'button'; btnGo.textContent = 'Continue';
  btnGo.style.cssText = 'border:0;border-radius:8px;background:#B8976A;color:#fff;padding:8px 12px;font:inherit;font-weight:600;cursor:pointer;';
  const btnX = document.createElement('button');
  btnX.type = 'button'; btnX.textContent = 'Discard';
  btnX.style.cssText = 'border:0;background:none;color:#9A8E7E;padding:8px 4px;font:inherit;cursor:pointer;';
  btnGo.onclick = () => { bar.remove(); try { onContinue && onContinue(); } catch (e) {} };
  btnX.onclick  = () => { bar.remove(); try { onDiscard && onDiscard(); } catch (e) {} };
  bar.append(txt, btnGo, btnX);
  document.body.appendChild(bar);
}
function ccDismissDraftOffer() { document.getElementById('ccDraftOffer')?.remove(); }

// Temporary PDFs are also cleaned up whenever the app opens (not only on the next PDF).
setTimeout(() => { try { _ccCleanupTempPdfs(); } catch (e) {} }, 6000);


/* ── GENERATOR SHEETS: stable size, page behind stays still ──
   The iPhone reports the screen height inconsistently in the installed app
   (first open, keyboard, returning from the viewer), which made a generator
   briefly fill the whole screen. Sheets use the dynamic screen height, and the
   page behind an open sheet is locked so it cannot move along. */
(function () {
  const css = document.createElement('style');
  css.textContent =
    'html.cc-sheet-open, html.cc-sheet-open body { overflow:hidden !important; overscroll-behavior:none; }' +
    '.rm-sheet__body { overscroll-behavior:contain; }';
  document.head.appendChild(css);
  const sync = () => document.documentElement.classList.toggle('cc-sheet-open', !!document.querySelector('.rm-overlay.open'));
  const start = () => {
    new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
    sync();
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
