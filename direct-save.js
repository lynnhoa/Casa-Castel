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
