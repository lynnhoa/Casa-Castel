/* ─────────────────────────────────────────────────────────────
   LEERSTAND (planned vacancy) — shared by Rooms · Apartments · Parking
   cc-vacancy.js  (phase 4c)

   A unit you keep empty on purpose (renovation, own use, still looking):
   von · bis · reason. Settlements treats those days as confirmed
   Leerstand ("War leer" happens by itself); Controlling expects no rent
   anyway because there is no tenant.

   Table unit_vacancies: app ('casa' | 'apt' | 'pk'), unit_ref (room name /
   apartment id / parking id), von, bis, grund.
   Section look = the shared card design (cc-cards.css): title left,
   "+ Add" top right → Cancel · Save in the same place.
   ───────────────────────────────────────────────────────────── */

const CC_VAC = { rows: null, loading: null, missing: false, open: null };
const CC_VAC_REASONS = ['Renovierung', 'Eigennutzung', 'Suche läuft', 'Sonstiges'];

function _ccVacDb() { return (typeof sbL !== 'undefined' && sbL) ? sbL : null; }
function _ccVacEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _ccVacFmt(iso) { const s = String(iso || '').slice(0, 10); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; }
function _ccVacParse(s) {
  s = String(s || '').trim(); if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
function _ccVacKey(app, ref) { return 'vac-' + app + '-' + String(ref).replace(/[^A-Za-z0-9]/g, '').slice(0, 24); }

async function ccVacLoad() {
  const db = _ccVacDb(); if (!db) return;
  if (CC_VAC.loading) return CC_VAC.loading;
  CC_VAC.loading = db.from('unit_vacancies').select('*').order('von', { ascending: false })
    .then(({ data, error }) => {
      if (error) { CC_VAC.missing = /unit_vacancies/.test(error.message || '') ; CC_VAC.rows = []; console.warn('[vacancy]', error.message); }
      else CC_VAC.rows = data || [];
      ccVacRefreshAll();
    })
    .finally(() => { CC_VAC.loading = null; });
  return CC_VAC.loading;
}
function ccVacFor(app, ref) { return (CC_VAC.rows || []).filter(v => v.app === app && String(v.unit_ref) === String(ref)); }

/* The section (cls = the tab's class prefix: 'rc' | 'apt' | 'pk') */
function ccVacSectionHTML(app, ref, cls) {
  if (CC_VAC.rows === null && !CC_VAC.loading) setTimeout(ccVacLoad, 0);
  const key = _ccVacKey(app, ref);
  return `<div class="${cls}-section cc-vac" id="${key}" data-app="${app}" data-ref="${_ccVacEsc(ref)}" data-cls="${cls}">${_ccVacInner(app, ref, cls)}</div>`;
}
function _ccVacInner(app, ref, cls) {
  const key = _ccVacKey(app, ref);
  const today = new Date().toISOString().slice(0, 10);
  const list = ccVacFor(app, ref).filter(v => String(v.bis).slice(0, 10) >= _ccVacAddDays(today, -365))
    .sort((a, b) => String(a.von).localeCompare(String(b.von)));
  const editing = CC_VAC.open === key;
  const rows = list.map(v => {
    const now = String(v.von) <= today && String(v.bis) >= today;
    return `<div class="cc-vac-row${now ? ' is-now' : ''}">
      <span class="cc-vac-dates">${_ccVacFmt(v.von)} – ${_ccVacFmt(v.bis)}</span>
      <span class="cc-vac-reason">${_ccVacEsc(v.grund || '')}${now ? ' · now' : ''}</span>
      <button type="button" class="cc-vac-del" aria-label="Delete" onclick="ccVacDelete('${v.id}','${app}','${_ccVacEsc(ref)}')"><i class="ti ti-trash"></i></button>
    </div>`;
  }).join('');
  const form = editing ? `
    <div class="cc-vac-form">
      <div class="${cls}-field"><div class="${cls}-field__label">From</div><input class="${cls}-input" data-v="von" placeholder="TT.MM.JJJJ"/></div>
      <div class="${cls}-field"><div class="${cls}-field__label">Until</div><input class="${cls}-input" data-v="bis" placeholder="TT.MM.JJJJ"/></div>
      <div class="${cls}-field cc-vac-full"><div class="${cls}-field__label">Reason</div>
        <select class="${cls}-input" data-v="grund">${CC_VAC_REASONS.map(r => `<option>${r}</option>`).join('')}</select></div>
      <p class="cc-vac-hint">These days count as Leerstand in Settlements automatically. No rent is expected.</p>
    </div>` : '';
  const slot = editing
    ? `<div class="cc-vac-slot"><button type="button" class="cc-vac-btn" onclick="ccVacCancel('${key}')">Cancel</button><button type="button" class="cc-vac-btn is-primary" onclick="ccVacSave('${app}','${_ccVacEsc(ref)}','${cls}')">Save</button></div>`
    : `<div class="cc-vac-slot"><button type="button" class="${cls === 'rc' ? 'rc-sec-edit-btn' : 'apt-sec-edit-btn'}" onclick="ccVacAdd('${key}')"><i class="ti ti-plus" style="font-size:10px"></i> Add</button></div>`;
  return `<div class="${cls}-stitle">Leerstand</div>${form}
    ${rows || (editing ? '' : `<div class="cc-vac-empty">${CC_VAC.missing ? 'Run the Leerstand SQL first.' : '—'}</div>`)}${slot}`;
}
function _ccVacAddDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

function ccVacRefreshAll() {
  document.querySelectorAll('.cc-vac').forEach(el => { el.innerHTML = _ccVacInner(el.dataset.app, el.dataset.ref, el.dataset.cls); });
}
function _ccVacRefresh(key) {
  const el = document.getElementById(key); if (el) el.innerHTML = _ccVacInner(el.dataset.app, el.dataset.ref, el.dataset.cls);
}
function ccVacAdd(key) { const prev = CC_VAC.open; CC_VAC.open = key; if (prev) _ccVacRefresh(prev); _ccVacRefresh(key); document.querySelector(`#${key} [data-v="von"]`)?.focus(); }
function ccVacCancel(key) { CC_VAC.open = null; _ccVacRefresh(key); }

async function ccVacSave(app, ref, cls) {
  const key = _ccVacKey(app, ref), el = document.getElementById(key); if (!el) return;
  const von = _ccVacParse(el.querySelector('[data-v="von"]').value), bis = _ccVacParse(el.querySelector('[data-v="bis"]').value);
  const grund = el.querySelector('[data-v="grund"]').value;
  if (!von) { el.querySelector('[data-v="von"]').style.borderBottomColor = '#C4705A'; return; }
  if (!bis || bis < von) { el.querySelector('[data-v="bis"]').style.borderBottomColor = '#C4705A'; return; }
  const db = _ccVacDb(); if (!db) return;
  const { data, error } = await db.from('unit_vacancies').insert({ app, unit_ref: String(ref), von, bis, grund }).select().single();
  if (error) { alert('Could not save — ' + (/unit_vacancies/.test(error.message || '') ? 'please run the Leerstand SQL first.' : error.message)); return; }
  (CC_VAC.rows || (CC_VAC.rows = [])).push(data);
  CC_VAC.open = null; _ccVacRefresh(key);
  if (typeof ccSavedToast === 'function') ccSavedToast('Leerstand saved');
}
async function ccVacDelete(id, app, ref) {
  if (!confirm('Delete this Leerstand?')) return;
  const db = _ccVacDb(); if (!db) return;
  const { error } = await db.from('unit_vacancies').delete().eq('id', id);
  if (error) { alert('Could not delete — ' + error.message); return; }
  CC_VAC.rows = (CC_VAC.rows || []).filter(v => v.id !== id);
  _ccVacRefresh(_ccVacKey(app, ref));
}
