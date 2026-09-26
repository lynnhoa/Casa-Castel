/* ─────────────────────────────────────────────────────────────
   DIRECT SAVE — shared by all cards (landlord.html + rentals-index.html)
   direct-save.js

   How every card save works now:
   1. Tap Save → the card switches to its saved view at once (no "…", no wait)
   2. The database write runs in the background, retried once after 400 ms
      (a cold mobile connection often fails only the first attempt)
   3. If it still fails, the old values come back and a message says so

   Writes for the same record run one after another (never out of order),
   so two quick saves can't overwrite each other in the wrong sequence.
   ───────────────────────────────────────────────────────────── */

/* Run a Supabase write; one retry on error. writeFn returns a query (thenable). */
async function ccPersist(writeFn) {
  let r;
  try { r = await writeFn(); } catch (e) { r = { error: e }; }
  if (r && r.error) {
    await new Promise(res => setTimeout(res, 400));
    try { r = await writeFn(); } catch (e) { r = { error: e }; }
  }
  return r || {};
}

/* Same as ccPersist, but queued per record key */
const _ccWriteQueues = {};
function ccQueueWrite(key, writeFn) {
  const prev = _ccWriteQueues[key] || Promise.resolve();
  const next = prev.catch(() => {}).then(() => ccPersist(writeFn));
  _ccWriteQueues[key] = next;
  return next;
}

/* Small bottom message (same look as the existing app toasts) */
function ccToast(msg, isError) {
  document.getElementById('cc-save-toast')?.remove();
  const t = document.createElement('div');
  t.id = 'cc-save-toast';
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:max(28px,env(safe-area-inset-bottom,28px));left:50%;transform:translateX(-50%);' +
    `background:${isError ? '#A32D2D' : 'var(--cc-ink)'};color:var(--cc-white);font-family:inherit;font-size:12px;` +
    'font-weight:500;letter-spacing:.02em;padding:8px 18px;border-radius:var(--cc-r-pill);z-index:9500;' +
    'max-width:calc(100% - 32px);text-align:center;pointer-events:none;transition:opacity .3s';
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, isError ? 4000 : 2200);
}

function ccSaveFailed(err, where) {
  console.error('[save] ' + (where || '') + ' failed:', err);
  ccToast('Not saved — connection problem. Your previous values are back, please try again.', true);
}


/* ═════════════════════════════════════════════════════════════
   SAVE BUTTONS — one look and one behaviour for every Save (both apps)

   Two states, nothing in between:
     dark  SAVE      → you changed something that is not saved yet
     grey  ✓ SAVED   → everything is saved (stays until your next change)

   Markup:
     class="cc-save"                   two states (starts as ✓ SAVED)
     class="cc-save cc-save--create"   creates something new → always dark SAVE,
                                        shows "Saving…" while it waits for the database
   Scope (what "a change" belongs to): the nearest editor around the button —
   a card section editor, the rent form, the profile section, the Kaution block
   ([data-cc-save-scope]) or a pop-up sheet.
   ═════════════════════════════════════════════════════════════ */
const CC_SAVE_SCOPES = '.rc-sec-edit, .apt-sec-edit, .pk-sec-edit, .tn-rent-form, [id^="psec-"], [data-cc-save-scope], .tn-sheet';

function ccSaveSet(btn, state) {
  if (!btn || !btn.classList || !btn.classList.contains('cc-save') || btn.classList.contains('cc-save--create')) return;
  if (btn.dataset.ccSave === state) return;
  btn.dataset.ccSave = state;
  btn.innerHTML = state === 'dirty' ? 'Save' : '<i class="ti ti-check" aria-hidden="true"></i> Saved';
}
function _ccSaveButtonsFor(el) {
  const scope = el && el.closest ? el.closest(CC_SAVE_SCOPES) : null;
  return scope ? scope.querySelectorAll('.cc-save:not(.cc-save--create)') : [];
}
function ccSaveMarkDirtyFrom(el) { _ccSaveButtonsFor(el).forEach(b => ccSaveSet(b, 'dirty')); }

(function () {
  // New buttons start as ✓ SAVED (nothing changed yet)
  const init = root => (root.querySelectorAll ? root.querySelectorAll('.cc-save:not([data-cc-save]):not(.cc-save--create)') : [])
    .forEach(b => ccSaveSet(b, 'saved'));
  const start = () => {
    init(document);
    new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches('.cc-save:not([data-cc-save]):not(.cc-save--create)')) ccSaveSet(n, 'saved');
        else if (n.querySelector('.cc-save:not([data-cc-save])')) init(n);
      }
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  // Typing / choosing in a field → that editor's Save turns dark
  const onEdit = e => {
    const t = e.target;
    if (!t || !t.matches || !t.matches('input, select, textarea')) return;
    if (t.type === 'hidden' || t.closest('.cc-save')) return;
    ccSaveMarkDirtyFrom(t);
  };
  document.addEventListener('input',  onEdit, true);
  document.addEventListener('change', onEdit, true);

  // Steppers, chips, pill toggles, add/remove rows inside an editor → also a change
  document.addEventListener('click', e => {
    const c = e.target && e.target.closest && e.target.closest('button, [onclick], [data-mode], .rc-chip, .tn-contract-toggle button');
    if (!c || c.matches('input, select, textarea, label')) return;
    if (c.closest('.cc-save')) return;
    if (!c.closest('.rc-sec-edit, .apt-sec-edit, .pk-sec-edit, .tn-contract-toggle')) return;
    if (/cancel/i.test(c.className || '') || /^\s*cancel\s*$/i.test(c.textContent || '')) return;
    ccSaveMarkDirtyFrom(c);
  }, true);

  // After a Save: if the editor closed (the normal case), the button is saved.
  // If it is still visible (e.g. a required field was missing), it stays dark.
  // The Kaution block stays open by design and sets ✓ SAVED itself.
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('.cc-save:not(.cc-save--create)');
    if (!b) return;
    setTimeout(() => { if (b.isConnected && !b.offsetParent) ccSaveSet(b, 'saved'); }, 0);
  }, false);

  if (document.getElementById('cc-save-styles')) return;
  const s = document.createElement('style');
  s.id = 'cc-save-styles';
  s.textContent = `
button.cc-save {
  height:36px !important; min-width:96px; padding:0 18px !important; margin:0;
  border-radius:var(--cc-r-md) !important; border:.5px solid var(--cc-ink) !important;
  background:var(--cc-ink) !important; color:var(--cc-white) !important;
  font-family:inherit !important; font-size:11px !important; font-weight:500 !important;
  letter-spacing:.07em !important; text-transform:uppercase !important; line-height:1 !important;
  display:inline-flex !important; align-items:center !important; justify-content:center !important; gap:5px !important;
  white-space:nowrap !important; flex:0 0 auto !important; cursor:pointer; opacity:1;
  -webkit-tap-highlight-color:transparent;
}
button.cc-save:not(.cc-save--create)[data-cc-save="saved"] {
  background:var(--cc-white) !important; color:#3B6D11 !important; border-color:var(--cc-rule) !important;
}
button.cc-save i { font-size:13px !important; }
button.cc-save:disabled { opacity:.5 !important; cursor:default; }
*:has(> button.cc-save) { justify-content:flex-end; align-items:center; }
*:has(> button.cc-save) > button:not(.cc-save):not(.cc-tpl-save) {
  height:36px !important; padding:0 16px !important; border-radius:var(--cc-r-md) !important;
  flex:0 0 auto !important; font-size:11px !important; letter-spacing:.07em; text-transform:uppercase;
}
  `;
  document.head.appendChild(s);
})();
