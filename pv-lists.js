/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS · LYNN: LIST MODAL (board M6) · Phase 5
   pv-lists.js — ONE modal, one level (inline edit rows, Save
   returns to the read view):
     Lists (chips · + List empty or as a copy · Rename · Delete)
     House info (access · supplies · emergency, hidden when empty)
     Photos per visit (all photo steps, or spot check N + all WCs)
     Floors ↑↓ → steps ↑↓ → photo points: name + instruction DE/EN,
       picture, colour, photo Off / Required / Optional, a camera
       line per photo, hint, bin guide; per floor the closing block
       (Oberflächen · Saugen · Wischen + optional photo) and
       "Treppe runter mit" (every floor but the lowest).
     Müll-Plan PDF attach / replace (provider-proofs/lists/…).
   Planned visits follow the list at once; running and past visits
   keep the copy taken at their first photo (snapshot rule).

   Depends on: utils.js (esc, ccConfirm), pv-core.js, pv-pics.js,
               pv-putzliste.js (pvPutzlisteNumbers, _PL_BADGE),
               pv-admin.js (pvaRpc, pvaToast, pvaLoad, _pvaData, _pvaJob),
               controlling-auth.js (_ctlSupa)
   ───────────────────────────────────────────────────────────── */

let _pvl = null;        // { job, lists, sel }
let _pvlEdit = null;    // { kind, fi, si }
let _pvlDraft = null;   // working copy of the open edit row
let _pvlBusy = false;

const _PVL_ZONES = [['b', 'Bad'], ['g', 'Gäste-WC'], ['k', 'Küche'], ['c', 'Flächen'], ['f', 'Böden'], ['x', 'Extra']];
const _PVL_PICS = ['shower', 'sink', 'wc', 'guestwc', 'dishes', 'appliances', 'fridge', 'trash', 'surfaces', 'vacuum', 'mop',
                   'room_b', 'room_g', 'room_k', 'house', 'supplies', 'extra', 'extras', 'sup_bags', 'sup_paper', 'sup_cleaner', 'sup_vacbags'];
const _PVL_PHOTO = [['off', 'Off'], ['required', 'Required'], ['optional', 'Optional']];

function _pvlKey() {
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
function _pvlList() { return _pvl ? _pvl.lists.find(l => l.id === _pvl.sel) : null; }
function _pvlCopy(o) { return JSON.parse(JSON.stringify(o)); }
function _pvlChip(grp, v, label, sel) {
  return `<span class="k-mob-n-chip${sel ? ' selected' : ''}" data-grp="${grp}" data-v="${esc(v)}" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">${label}</span>`;
}
function _pvlFoot(left, save) {
  return `<div class="cc-sec-foot" style="margin-top:12px;">${left || ''}<button class="cc-foot-btn" type="button" onclick="pvlClose()">Cancel</button><button class="cc-foot-btn cc-foot-btn--save" type="button" onclick="${save}">Save</button></div>`;
}
function _pvlIn(k, label, val, ph, max) {
  return `<div><label class="pv-k">${label}</label><input class="pv-field" data-k="${k}" maxlength="${max || 80}" placeholder="${esc(ph || '')}" value="${esc(val || '')}"/></div>`;
}
function _pvlCounts(floors) {                 /* required photos + WC photos (always part of a spot check) */
  let req = 0, wc = 0;
  (floors || []).forEach(f => {
    (f.steps || []).forEach(st => {
      if (st.photo !== 'required') return;
      const n = (st.points || []).length;
      req += n;
      if (st.pic === 'wc' || st.pic === 'guestwc') wc += n;
    });
    const bp = f.block && f.block.photo;
    if (bp && typeof bp === 'object' && (bp.mode || 'required') === 'required') req += 1;
  });
  return { req, wc };
}

/* ── OPEN · LOAD · SAVE ─────────────────────────────────── */
async function pvaOpenLists() {
  if (!_pvaData || !_pvaData.job) { pvaToast('Create a job first.'); return; }
  $a('pvaListTitle').innerHTML = `List · <b>${esc(_pvaData.job.name)}</b>`;
  _pvlEdit = null; _pvlDraft = null;
  if (_pvl && _pvl.job === _pvaJob) _pvlRender();
  else $a('pvaListBody').innerHTML = '<p class="pv-k" style="padding:14px 2px;">Loading…</p>';
  $a('pvaListScrim').classList.remove('pv-hidden');
  await _pvlLoad();
}
async function _pvlLoad(selId) {
  const job = _pvaJob;
  const { data, error } = await pvaRpc('pv_admin_lists', { p_job: job });
  if (error || !data || data.error) { pvaToast('Could not load the lists — try again.'); return; }
  const prev = selId || (_pvl && _pvl.job === job ? _pvl.sel : null);
  _pvl = { job, lists: data.lists || [], sel: null };
  _pvl.sel = (_pvl.lists.find(l => l.id === prev) || _pvl.lists[0] || {}).id || null;
  _pvlRender();
}
function _pvlNormalize(L) {                    /* the lowest floor has no stairs below it */
  (L.floors || []).forEach((f, i, a) => { if (i === a.length - 1) f.stairs = false; });
  return L;
}
async function _pvlSave(L, msg, reopen) {
  if (_pvlBusy) return false;
  _pvlBusy = true;
  _pvlNormalize(L);
  const { data, error } = await pvaRpc('pv_admin_save_list', { p_list: L.id, p_name: L.name, p_floors: L.floors,
    p_spot_check: !!L.spot_check, p_spot_size: L.spot_size || 6, p_house_info: L.house_info || {} });
  _pvlBusy = false;
  if (error) { pvaToast('No connection — try again.'); return false; }
  if (data && data.error) {
    pvaToast(data.error === 'name' ? 'The list needs a name.' : 'Already changed — refreshed.');
    _pvlEdit = null; await _pvlLoad(); return false;
  }
  if (msg) pvaToast(msg);
  _pvlEdit = reopen || null;
  if (!reopen) _pvlDraft = null;
  await _pvlLoad(L.id);
  pvaLoad();                                   /* counts on the card follow the list */
  return true;
}

/* ── EDIT ROWS ──────────────────────────────────────────── */
function pvlOpen(kind, fi, si) {
  if (_pvlBusy) return;
  const L = _pvlList();
  if (_pvlEdit && _pvlEdit.kind === kind && _pvlEdit.fi === fi && _pvlEdit.si === si) { pvlClose(); return; }
  _pvlEdit = { kind, fi, si };
  if (kind === 'step') _pvlDraft = _pvlCopy(L.floors[fi].steps[si]);
  else if (kind === 'newstep') {
    const z = L.floors[fi].zone || 'c';
    _pvlDraft = { key: _pvlKey(), de: '', en: '', ins_de: '', ins_en: '', pic: 'surfaces', zone: z, photo: 'required', hint_de: '', hint_en: '', points: [{ key: _pvlKey(), de: '', en: '' }], bins: false };
  } else if (kind === 'floor') _pvlDraft = _pvlCopy(L.floors[fi]);
  else if (kind === 'newfloor') _pvlDraft = { key: _pvlKey(), label: '', room_de: '', room_en: '', zone: 'c', stairs: true, steps: [], block: { surfaces: true, vacuum: true, mop: true, photo: null } };
  else if (kind === 'house') { const h = _pvlCopy(L.house_info || {}); _pvlDraft = { access: h.access || {}, supplies: h.supplies || {}, emergency: h.emergency || {} }; }
  else if (kind === 'rule') _pvlDraft = { spot: !!L.spot_check, size: L.spot_size || 6 };
  else if (kind === 'list') _pvlDraft = { name: L.name };
  else if (kind === 'newlist') _pvlDraft = { name: '', copy: L ? L.id : '' };
  if (_pvlDraft && !_pvlDraft.points && (kind === 'step')) _pvlDraft.points = [];
  if (_pvlDraft && kind === 'step' && !_pvlDraft.points.length) _pvlDraft.points = [{ key: _pvlKey(), de: _pvlDraft.de || '', en: _pvlDraft.en || '' }];
  _pvlRender();
  const r = $a('pvaListBody').querySelector('.pv-edit-row');
  if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function pvlClose() { _pvlEdit = null; _pvlDraft = null; _pvlRender(); }
function pvlSelect(id) { if (_pvlBusy || !_pvl) return; _pvl.sel = id; _pvlEdit = null; _pvlDraft = null; _pvlRender(); }

function _pvlStepForm(fi, si, isNew) {
  const d = _pvlDraft, L = _pvlList(), f = L.floors[fi];
  const n = (f.steps || []).length + (isNew ? 1 : 0);
  const nums = pvPutzlisteNumbers(L.floors, null);
  const first = !isNew && d.points && d.points[0] ? nums[d.points[0].key] : null;
  const photoNote = d.photo === 'off' ? 'Off: instruction only, no photo.'
    : d.photo === 'optional' ? 'Optional: the provider may skip it.'
    : first ? `Required: photo ${first} in the camera.` : 'Required: gets the next photo number.';
  return `<div class="pv-edit-row">
    ${isNew ? '' : `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:8px 10px;border-radius:10px;background:#F5F2ED;"><span class="pv-k">Order · step <b style="color:#3A3530;">${si + 1} of ${n}</b> · floor <b style="color:#3A3530;">${fi + 1} of ${L.floors.length}</b></span><span style="display:flex;gap:6px;"><button class="cc-foot-btn" type="button" aria-label="Move up" onclick="pvlMoveStep(${fi},${si},-1)" style="width:36px;justify-content:center;padding:0;"${si === 0 ? ' disabled' : ''}>↑</button><button class="cc-foot-btn" type="button" aria-label="Move down" onclick="pvlMoveStep(${fi},${si},1)" style="width:36px;justify-content:center;padding:0;"${si >= n - 1 ? ' disabled' : ''}>↓</button></span></div>`}
    <div class="pv-kv">${_pvlIn('de', 'Step (DE)', d.de, 'z. B. Duschglas', 60)}${_pvlIn('en', 'Step (EN)', d.en, 'e.g. Shower glass', 60)}</div>
    <div style="margin-top:12px;">${_pvlIn('ins_de', 'Instruction (DE)', d.ins_de, 'Reinigen: …', 200)}</div>
    <div style="margin-top:12px;">${_pvlIn('ins_en', 'Instruction (EN)', d.ins_en, 'Clean: …', 200)}</div>
    <div style="margin-top:12px;"><p class="pv-k">Picture</p><div class="pic-pick">${_PVL_PICS.map(p => `<span class="pic pic--${esc(d.zone || 'c')}${d.pic === p ? ' pic--sel' : ''}" data-pic="${p}" style="cursor:pointer;">${pvPic(p, 20)}</span>`).join('')}</div></div>
    <div style="margin-top:10px;"><p class="pv-k">Colour</p><div class="pv-chips">${_PVL_ZONES.map(z => _pvlChip('zone', z[0], z[1], d.zone === z[0])).join('')}</div></div>
    <div style="margin-top:12px;"><p class="pv-k">Photo</p><div class="pv-chips">${_PVL_PHOTO.map(o => _pvlChip('photo', o[0], o[1], (d.photo || 'off') === o[0])).join('')}</div><p class="pv-k" style="margin-top:4px;">${photoNote}</p></div>
    ${d.photo !== 'off' ? `<div style="margin-top:10px;"><p class="pv-k">Camera line per photo</p>${(d.points || []).map((pt, i) => `<div class="pv-kv" style="margin-top:6px;"><div><input class="pv-field" data-pt="${i}" data-lang="de" maxlength="60" placeholder="Deutsch" value="${esc(pt.de || '')}"/></div><div style="display:flex;gap:6px;"><input class="pv-field" data-pt="${i}" data-lang="en" maxlength="60" placeholder="English" value="${esc(pt.en || '')}" style="flex:1;"/>${d.points.length > 1 ? `<button class="cc-foot-btn" type="button" data-ptdel="${i}" aria-label="Remove photo" style="width:30px;justify-content:center;padding:0;">✕</button>` : ''}</div></div>`).join('')}
      <div class="cc-sec-foot" style="justify-content:flex-start;margin-top:6px;"><button class="cc-foot-btn" type="button" data-ptadd="1">${pvPic('plus', 12)}Photo</button></div></div>
    <div style="margin-top:10px;"><p class="pv-k">Photo hint (optional)</p><div class="pv-kv">${_pvlIn('hint_de', '', d.hint_de, 'z. B. Deckel + Brille hoch', 80)}${_pvlIn('hint_en', '', d.hint_en, 'e.g. lid + seat up', 80)}</div></div>` : ''}
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;"><div><p class="pv-v">Bin guide + Müll-Plan</p><p class="pv-k">“Welche Tonne?” box under this step</p></div><span class="pv-toggle${d.bins ? '' : ' pv-toggle--off'}" role="button" tabindex="0" data-tog="bins"></span></div>
    ${_pvlFoot(isNew ? '' : `<button class="cc-foot-btn cc-foot-btn--danger is-left" type="button" onclick="pvlDeleteStep(${fi},${si})">Delete step</button>`, `pvlSaveStep(${fi},${isNew ? -1 : si})`)}
  </div>`;
}

function _pvlFloorForm(fi, isNew) {
  const d = _pvlDraft, L = _pvlList();
  const nF = L.floors.length + (isNew ? 1 : 0);
  const idx = isNew ? nF - 1 : fi;
  const b = d.block || {};
  const bp = b.photo && typeof b.photo === 'object' ? b.photo : null;
  const bmode = bp ? (bp.mode || 'required') : 'off';
  return `<div class="pv-edit-row">
    ${isNew ? '' : `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:8px 10px;border-radius:10px;background:#F5F2ED;"><span class="pv-k">Order · floor <b style="color:#3A3530;">${fi + 1} of ${nF}</b> · top to bottom</span><span style="display:flex;gap:6px;"><button class="cc-foot-btn" type="button" aria-label="Move up" onclick="pvlMoveFloor(${fi},-1)" style="width:36px;justify-content:center;padding:0;"${fi === 0 ? ' disabled' : ''}>↑</button><button class="cc-foot-btn" type="button" aria-label="Move down" onclick="pvlMoveFloor(${fi},1)" style="width:36px;justify-content:center;padding:0;"${fi >= nF - 1 ? ' disabled' : ''}>↓</button></span></div>`}
    <div class="pv-kv">${_pvlIn('label', 'Floor', d.label, 'z. B. 2. OG', 12)}${_pvlIn('room_de', 'Room (DE)', d.room_de, 'z. B. Bad 2', 40)}</div>
    <div style="margin-top:12px;">${_pvlIn('room_en', 'Room (EN)', d.room_en, 'e.g. Bathroom 2', 40)}</div>
    <div style="margin-top:10px;"><p class="pv-k">Colour</p><div class="pv-chips">${_PVL_ZONES.map(z => _pvlChip('zone', z[0], z[1], d.zone === z[0])).join('')}</div></div>
    <div style="margin-top:12px;"><p class="pv-k">Then on this floor</p><div class="pv-chips" style="margin-top:4px;">${[['surfaces', 'Oberflächen', 'surfaces'], ['vacuum', 'Saugen', 'vacuum'], ['mop', 'Wischen', 'mop']].map(x => `<span class="k-mob-n-chip${b[x[0]] ? ' selected' : ''}" data-blk="${x[0]}" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">${pvPic(x[2], 14)}${x[1]}</span>`).join('')}</div></div>
    <div style="margin-top:12px;"><p class="pv-k">Photo of the floor at the end</p><div class="pv-chips">${_PVL_PHOTO.map(o => _pvlChip('bphoto', o[0], o[1], bmode === o[0])).join('')}</div>
      ${bp ? `<div class="pv-kv" style="margin-top:6px;"><div><input class="pv-field" data-bp="de" maxlength="40" placeholder="Deutsch" value="${esc(bp.de || '')}"/></div><div><input class="pv-field" data-bp="en" maxlength="40" placeholder="English" value="${esc(bp.en || '')}"/></div></div>` : ''}</div>
    ${idx < nF - 1 ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;"><div><p class="pv-v">Treppe runter mit</p><p class="pv-k">Vacuum + mop include the stairs down</p></div><span class="pv-toggle${d.stairs ? '' : ' pv-toggle--off'}" role="button" tabindex="0" data-tog="stairs"></span></div>` : '<p class="pv-k" style="margin-top:10px;">Lowest floor — no stairs below.</p>'}
    ${_pvlFoot(isNew ? '' : `<button class="cc-foot-btn cc-foot-btn--danger is-left" type="button" onclick="pvlDeleteFloor(${fi})">Delete floor</button>`, `pvlSaveFloor(${isNew ? -1 : fi})`)}
  </div>`;
}

/* ── READ VIEW ──────────────────────────────────────────── */
function _pvlStepRow(st, fi, si, nums, L) {
  const pts = (st.photo === 'required' || st.photo === 'optional') ? (st.points || []) : [];
  const chips = pts.map(pt => `<span class="ph-chip">${pvPic('cam', 12)}${nums[pt.key] || ''}${pts.length > 1 ? ` <small>${esc(pt.de || '')}</small>` : ''}</span>`).join('');
  const mode = st.photo === 'optional' ? '<span class="ph-chip ph-chip--opt">optional</span>' : (!st.photo || st.photo === 'off') ? '<span class="ph-chip ph-chip--none">no photo</span>' : '';
  const muell = st.bins ? `<div class="pl-chips"><span class="ph-chip ph-chip--none" style="border-style:solid;">${pvPic('pdf', 12)}${L.muell ? 'Müll-Plan (PDF) attached' : 'No Müll-Plan PDF yet'}</span><button class="cc-foot-btn" type="button" onclick="event.stopPropagation();pvlPickMuell()">${L.muell ? 'Replace PDF' : 'Attach PDF'}</button></div>` : '';
  return `<div class="pv-li" style="cursor:pointer;" onclick="pvlOpen('step',${fi},${si})"><span class="pic pic--${esc(st.zone || 'c')}">${pvPic(st.pic, 22)}</span>
      <div class="pv-li__main"><p class="pv-li__name">${esc(st.de || '—')}<span class="en">${esc(st.en || '')}</span></p>
        ${st.ins_de ? `<p class="pv-li__ins">${esc(st.ins_de)}${st.ins_en ? ` <span class="en">· ${esc(st.ins_en)}</span>` : ''}</p>` : ''}
        ${chips || mode ? `<div class="pl-chips">${chips}${mode}</div>` : ''}${muell}
      </div></div>`;
}
function _pvlBlockRow(f, nums) {
  const b = f.block || {};
  const items = [b.surfaces ? ['c', 'surfaces', 'Oberflächen sauber machen'] : null, b.vacuum ? ['f', 'vacuum', 'saugen'] : null, b.mop ? ['f', 'mop', 'wischen'] : null].filter(Boolean);
  const bp = b.photo && typeof b.photo === 'object' ? b.photo : null;
  if (!items.length && !bp) return '';
  return `<div class="pv-li" style="align-items:center;"><span style="display:flex;gap:3px;">${items.map(i => `<span class="pic pic--${i[0]}" style="width:26px;height:26px;border-radius:8px;">${pvPic(i[1], 16)}</span>`).join('')}</span>
      <div class="pv-li__main"><p class="pv-li__ins" style="margin-top:0;">Then: ${items.map(i => i[2]).join(', ') || 'photo of the floor'}${f.stairs ? ' (incl. stairs down)' : ''}</p></div>
      ${bp && nums[bp.key] ? `<span class="ph-chip">${pvPic('cam', 12)}${nums[bp.key]} <small>${esc(bp.de || '')}</small></span>` : ''}</div>`;
}
function _pvlRender() {
  const body = $a('pvaListBody');
  if (!body || !_pvl) return;
  const L = _pvlList();
  const ed = _pvlEdit || {};
  const top = body.scrollTop;
  let h = `<p class="pv-intro">One list = the provider's full instruction, floor by floor, top to bottom. Steps with a camera need a photo (number = camera order); the others are instruction only. Planned visits follow your changes at once — running and past visits keep their list.</p>`;
  h += `<div class="pv-sec" style="padding-bottom:10px;"><p class="pv-sec__t">Lists <span class="en">a visit uses one of them</span></p>
      <div class="pv-chips">${_pvl.lists.map(l => `<span class="k-mob-n-chip${l.id === _pvl.sel ? ' selected' : ''}" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;" onclick="pvlSelect('${l.id}')">${esc(l.name)}</span>`).join('')}<span class="k-mob-n-chip" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;" onclick="pvlOpen('newlist')">${pvPic('plus', 12)}List</span></div>
      <span class="k-note">+ List starts empty or as a copy of this one.${L ? ` Used by ${L.planned} planned ${L.planned === 1 ? 'visit' : 'visits'}${L.rhythms ? ' and ' + L.rhythms + ' ' + (L.rhythms === 1 ? 'rhythm' : 'rhythms') : ''}.` : ''}</span>
      ${ed.kind === 'newlist' ? `<div class="pv-edit-row" style="margin-top:10px;">${_pvlIn('name', 'Name of the new list', _pvlDraft.name, 'z. B. Grundreinigung', 40)}
          <div style="margin-top:10px;"><p class="pv-k">Start</p><div class="pv-chips">${_pvlChip('copy', '', 'Empty', !_pvlDraft.copy)}${L ? _pvlChip('copy', L.id, 'Copy “' + esc(L.name) + '”', _pvlDraft.copy === L.id) : ''}</div></div>
          ${_pvlFoot('', 'pvlCreateList()')}</div>`
        : ed.kind === 'list' ? `<div class="pv-edit-row" style="margin-top:10px;">${_pvlIn('name', 'Name', _pvlDraft.name, '', 40)}${_pvlFoot('', 'pvlRename()')}</div>`
        : L ? `<div class="cc-sec-foot">${_pvl.lists.length > 1 ? `<button class="cc-foot-btn cc-foot-btn--danger is-left" type="button" onclick="pvlDeleteList()">Delete list</button>` : ''}<button class="cc-foot-btn" type="button" onclick="pvlOpen('list')">${pvPic('edit', 12)}Rename</button></div>` : ''}
    </div>`;
  if (!L) { body.innerHTML = h; return; }

  const hi = L.house_info || {};
  const rows = [['access', 'c', 'access', 'Access'], ['supplies', 'f', 'supplies', 'Supplies'], ['emergency', 'x', 'emergency', 'Emergency']];
  const filled = rows.filter(r => hi[r[0]] && (hi[r[0]].de || hi[r[0]].en));
  h += `<div class="pv-sec"><p class="pv-sec__t">House info <span class="en">top of the Putzliste</span></p>`;
  if (ed.kind === 'house') {
    h += `<div class="pv-edit-row">${rows.map(r => `<p class="pv-k" style="margin-top:8px;">${r[3]}</p><div class="pv-kv"><div><input class="pv-field" data-hi="${r[0]}" data-lang="de" maxlength="160" placeholder="Deutsch" value="${esc((_pvlDraft[r[0]] || {}).de || '')}"/></div><div><input class="pv-field" data-hi="${r[0]}" data-lang="en" maxlength="160" placeholder="English" value="${esc((_pvlDraft[r[0]] || {}).en || '')}"/></div></div>`).join('')}
      <span class="k-note">Empty lines stay hidden for the provider.</span>${_pvlFoot('', 'pvlSaveHouse()')}</div>`;
  } else {
    h += (filled.length ? filled.map(r => `<div style="display:flex;gap:10px;align-items:flex-start;padding:6px 0;"><span class="pic pic--${r[1]}" style="width:30px;height:30px;border-radius:9px;">${pvPic(r[2], 18)}</span><div><p class="pv-k">${r[3]}</p><p class="pv-v" style="font-size:13.5px;">${esc(hi[r[0]].de || '')}${hi[r[0]].en ? ' · ' + esc(hi[r[0]].en) : ''}</p></div></div>`).join('')
         : '<p class="pv-k" style="padding:2px 0 4px;">Empty — hidden on the Putzliste.</p>')
      + `<div class="cc-sec-foot"><button class="cc-foot-btn" type="button" onclick="pvlOpen('house')">${pvPic('edit', 12)}Edit</button></div>`;
  }
  h += `</div>`;

  const cnt = _pvlCounts(L.floors);
  const spotN = Math.min(L.spot_size || 6, Math.max(cnt.req - cnt.wc, 0)) + cnt.wc;
  h += `<div class="pv-sec"><p class="pv-sec__t">Photos per visit</p>`;
  if (ed.kind === 'rule') {
    h += `<div class="pv-edit-row"><div class="pv-chips">${_pvlChip('rule', 'all', 'All photo steps', !_pvlDraft.spot)}${_pvlChip('rule', 'spot', 'Spot check', _pvlDraft.spot)}</div>
      ${_pvlDraft.spot ? `<div style="margin-top:10px;max-width:160px;"><label class="pv-k">Random photos (+ all WCs)</label><input class="pv-field" data-k="size" inputmode="numeric" maxlength="2" value="${esc(String(_pvlDraft.size))}"/></div>` : ''}
      <span class="k-note">${_pvlDraft.spot ? 'A new pick every visit, taken when she starts — she can’t choose. All WCs are always in.' : `Every photo step, every visit · ${cnt.req} photos.`}</span>${_pvlFoot('', 'pvlSaveRule()')}</div>`;
  } else {
    h += `<div><p class="pv-k">Rule</p><p class="pv-v">${L.spot_check ? `Spot check · ${L.spot_size} random + all WCs · ${spotN} of ${cnt.req} photos` : `All photo steps · ${cnt.req} photos`}</p></div>
      <span class="k-note">${L.spot_check ? 'A new pick every visit.' : `Or spot check: ${L.spot_size || 6} random + all WCs, a new pick every visit.`}</span>
      <div class="cc-sec-foot"><button class="cc-foot-btn" type="button" onclick="pvlOpen('rule')">${pvPic('edit', 12)}Edit</button></div>`;
  }
  h += `</div>`;

  const nums = pvPutzlisteNumbers(L.floors, null);
  (L.floors || []).forEach((f, fi) => {
    const here = (ed.kind === 'floor' || ed.kind === 'step' || ed.kind === 'newstep') && ed.fi === fi;
    h += `<div class="pv-sec"${here ? ' style="border:1px solid #B8956A;"' : ''}>
      <p class="pv-sec__t" style="justify-content:flex-start;"><span style="display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 9px 0 7px;border-radius:12px;background:#1E1B18;color:#FDFCFA;font-size:11px;font-weight:700;letter-spacing:.02em;line-height:1;white-space:nowrap;">${pvPic((typeof _PL_BADGE !== 'undefined' && _PL_BADGE[f.zone]) || 'badge_b', 9)}${esc(f.label || '—')}</span><span>${esc(f.room_de || '')} <span class="en">${esc(f.room_en || '')}</span></span></p>
      ${ed.kind === 'floor' && ed.fi === fi ? _pvlFloorForm(fi, false) : ''}
      ${(f.steps || []).map((st, si) => ed.kind === 'step' && ed.fi === fi && ed.si === si ? _pvlStepForm(fi, si, false) : _pvlStepRow(st, fi, si, nums, L)).join('')}
      ${!(f.steps || []).length && !(ed.kind === 'newstep' && ed.fi === fi) ? '<p class="pv-k" style="padding:4px 0;">No steps yet.</p>' : ''}
      ${ed.kind === 'newstep' && ed.fi === fi ? _pvlStepForm(fi, (f.steps || []).length, true) : ''}
      ${_pvlBlockRow(f, nums)}
      ${ed.kind === 'floor' && ed.fi === fi ? '' : `<div class="cc-sec-foot"><button class="cc-foot-btn is-left" type="button" onclick="pvlOpen('newstep',${fi})">${pvPic('plus', 12)}Step</button><button class="cc-foot-btn" type="button" onclick="pvlOpen('floor',${fi})">${pvPic('edit', 12)}Edit</button></div>`}
    </div>`;
  });
  if (ed.kind === 'newfloor') h += `<div class="pv-sec" style="border:1px solid #B8956A;"><p class="pv-sec__t">New floor</p>${_pvlFloorForm(null, true)}</div>`;
  h += `<div class="pv-sec"><p class="pv-sec__t"><span>Extras <span class="en">optional</span></span></p>
      <div class="pv-li"><span class="pic pic--x">${pvPic('extras', 22)}</span><div class="pv-li__main"><p class="pv-li__name">Extras<span class="en">Extras</span></p><p class="pv-li__ins">Alles Zusätzliche oder Schäden. <span class="en">· Anything extra or damage.</span></p><div class="pl-chips"><span class="ph-chip ph-chip--opt">${pvPic('cam_opt', 12)}Foto optional · photo optional</span></div></div></div>
    </div>
    <div class="cc-sec-foot" style="margin-top:2px;"><button class="cc-foot-btn is-left" type="button" onclick="pvlOpen('newfloor')">${pvPic('plus', 12)}Floor</button></div>
    <input type="file" id="pvlMuellFile" accept="application/pdf" style="display:none;"/>`;
  body.innerHTML = h;
  body.scrollTop = top;
}

/* ── TAPS + TYPING INSIDE THE EDIT ROWS ─────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const body = $a('pvaListBody');
  if (!body) return;
  body.addEventListener('input', e => {
    const t = e.target, d = _pvlDraft;
    if (!d) return;
    if (t.dataset.k) d[t.dataset.k] = t.value;
    else if (t.dataset.pt != null) d.points[+t.dataset.pt][t.dataset.lang] = t.value;
    else if (t.dataset.hi) { d[t.dataset.hi] = d[t.dataset.hi] || {}; d[t.dataset.hi][t.dataset.lang] = t.value; }
    else if (t.dataset.bp && d.block && d.block.photo) d.block.photo[t.dataset.bp] = t.value;
  });
  body.addEventListener('click', e => {
    const d = _pvlDraft;
    const pic = e.target.closest('[data-pic]');
    if (pic && d) { d.pic = pic.dataset.pic; _pvlRender(); return; }
    const chip = e.target.closest('[data-grp]');
    if (chip && d) {
      const g = chip.dataset.grp, v = chip.dataset.v;
      if (g === 'zone') d.zone = v;
      else if (g === 'photo') { d.photo = v; if (v !== 'off' && !(d.points || []).length) d.points = [{ key: _pvlKey(), de: d.de || '', en: d.en || '' }]; }
      else if (g === 'bphoto') {
        d.block = d.block || {};
        if (v === 'off') d.block.photo = null;
        else d.block.photo = Object.assign({ key: _pvlKey(), de: d.room_de || '', en: d.room_en || '', pic: 'surfaces', zone: d.zone || 'c' }, d.block.photo || {}, { mode: v });
      }
      else if (g === 'rule') d.spot = v === 'spot';
      else if (g === 'copy') d.copy = v;
      _pvlRender(); return;
    }
    const blk = e.target.closest('[data-blk]');
    if (blk && d) { d.block = d.block || {}; d.block[blk.dataset.blk] = !d.block[blk.dataset.blk]; _pvlRender(); return; }
    const tog = e.target.closest('[data-tog]');
    if (tog && d) { d[tog.dataset.tog] = !d[tog.dataset.tog]; _pvlRender(); return; }
    if (e.target.closest('[data-ptadd]') && d) { d.points.push({ key: _pvlKey(), de: '', en: '' }); _pvlRender(); return; }
    const del = e.target.closest('[data-ptdel]');
    if (del && d && d.points.length > 1) { d.points.splice(+del.dataset.ptdel, 1); _pvlRender(); }
  });
  body.addEventListener('change', e => { if (e.target.id === 'pvlMuellFile') pvlUploadMuell(e.target); });
});

/* ── SAVE ACTIONS ───────────────────────────────────────── */
function pvlSaveStep(fi, si) {
  const d = _pvlDraft, L = _pvlCopy(_pvlList());
  if (!d || !String(d.de || '').trim()) { pvaToast('The step needs a name (DE).'); return; }
  const st = { key: d.key || _pvlKey(), de: d.de.trim(), en: String(d.en || '').trim(), ins_de: String(d.ins_de || '').trim(), ins_en: String(d.ins_en || '').trim(),
               pic: d.pic || 'surfaces', zone: d.zone || L.floors[fi].zone || 'c', photo: d.photo || 'off',
               hint_de: String(d.hint_de || '').trim() || null, hint_en: String(d.hint_en || '').trim() || null,
               points: (d.points || []).map(p => ({ key: p.key || _pvlKey(), de: String(p.de || '').trim(), en: String(p.en || '').trim(), pic: p.pic })) };
  if (st.photo !== 'off') {
    st.points = st.points.filter(p => p.de || st.points.length === 1);
    if (!st.points.length) st.points = [{ key: _pvlKey(), de: st.de, en: st.en }];
    st.points.forEach(p => { if (!p.de) p.de = st.de; if (!p.en) p.en = st.en; if (!p.pic) delete p.pic; });
  }
  if (d.bins) st.bins = true;
  L.floors[fi].steps = L.floors[fi].steps || [];
  if (si < 0) L.floors[fi].steps.push(st); else L.floors[fi].steps[si] = st;
  _pvlSave(L, si < 0 ? 'Step added.' : 'Step saved.');
}
async function pvlDeleteStep(fi, si) {
  const L = _pvlCopy(_pvlList());
  const st = L.floors[fi].steps[si];
  if (!(await ccConfirm('Delete step?', `“${esc(st.de || '')}” disappears from the list. Past visits keep their photos.`, 'Delete', true))) return;
  L.floors[fi].steps.splice(si, 1);
  _pvlSave(L, 'Step deleted.');
}
function pvlMoveStep(fi, si, dir) {
  const L = _pvlCopy(_pvlList()), arr = L.floors[fi].steps, to = si + dir;
  if (to < 0 || to >= arr.length) return;
  if (_pvlDraft) arr[si] = Object.assign({}, arr[si]);      /* order only — open changes are not saved */
  [arr[si], arr[to]] = [arr[to], arr[si]];
  _pvlDraft = _pvlCopy(arr[to]);
  _pvlSave(L, 'Order saved.', { kind: 'step', fi, si: to });
}
function pvlSaveFloor(fi) {
  const d = _pvlDraft, L = _pvlCopy(_pvlList());
  if (!d || !String(d.label || '').trim()) { pvaToast('The floor needs a name (e.g. 2. OG).'); return; }
  const f = { key: d.key || _pvlKey(), label: d.label.trim(), room_de: String(d.room_de || '').trim(), room_en: String(d.room_en || '').trim(),
              zone: d.zone || 'c', steps: d.steps || [], block: d.block || { surfaces: false, vacuum: false, mop: false, photo: null }, stairs: !!d.stairs };
  if (f.block.photo) {
    f.block.photo.zone = f.zone;
    if (!f.block.photo.de) f.block.photo.de = f.room_de || f.label;
    if (!f.block.photo.en) f.block.photo.en = f.room_en || f.label;
  }
  if (fi < 0) L.floors.push(f); else L.floors[fi] = f;
  _pvlSave(L, fi < 0 ? 'Floor added.' : 'Floor saved.');
}
async function pvlDeleteFloor(fi) {
  const L = _pvlCopy(_pvlList());
  const f = L.floors[fi];
  if (!(await ccConfirm('Delete floor?', `“${esc(f.label)}” and its ${(f.steps || []).length} steps disappear from the list. Past visits keep their photos.`, 'Delete', true))) return;
  L.floors.splice(fi, 1);
  _pvlSave(L, 'Floor deleted.');
}
function pvlMoveFloor(fi, dir) {
  const L = _pvlCopy(_pvlList()), arr = L.floors, to = fi + dir;
  if (to < 0 || to >= arr.length) return;
  [arr[fi], arr[to]] = [arr[to], arr[fi]];
  _pvlDraft = _pvlCopy(arr[to]);
  _pvlSave(L, 'Order saved.', { kind: 'floor', fi: to });
}
function pvlSaveHouse() {
  const L = _pvlCopy(_pvlList()), d = _pvlDraft, hi = {};
  ['access', 'supplies', 'emergency'].forEach(k => {
    const de = String((d[k] || {}).de || '').trim(), en = String((d[k] || {}).en || '').trim();
    if (de || en) hi[k] = { de, en };
  });
  L.house_info = hi;
  _pvlSave(L, 'House info saved.');
}
function pvlSaveRule() {
  const L = _pvlCopy(_pvlList()), d = _pvlDraft;
  const n = parseInt(d.size, 10);
  if (d.spot && !(n >= 1 && n <= 50)) { pvaToast('Random photos: a number from 1 to 50.'); return; }
  L.spot_check = !!d.spot;
  if (d.spot) L.spot_size = n;
  _pvlSave(L, 'Photo rule saved.');
}
function pvlRename() {
  const L = _pvlCopy(_pvlList());
  const n = String(_pvlDraft.name || '').trim();
  if (!n) { pvaToast('The list needs a name.'); return; }
  L.name = n;
  _pvlSave(L, 'Renamed.');
}
async function pvlCreateList() {
  const n = String(_pvlDraft.name || '').trim();
  if (!n) { pvaToast('The list needs a name.'); return; }
  if (_pvlBusy) return;
  _pvlBusy = true;
  const { data, error } = await pvaRpc('pv_admin_create_list', { p_job: _pvaJob, p_name: n, p_copy_from: _pvlDraft.copy || null });
  _pvlBusy = false;
  if (error || !data || data.error) { pvaToast('Could not create the list — try again.'); return; }
  _pvlEdit = null; _pvlDraft = null;
  pvaToast('List created.');
  await _pvlLoad(data.id);
  pvaLoad();
}
async function pvlDeleteList() {
  const L = _pvlList();
  if (!L || !(await ccConfirm('Delete this list?', `“${esc(L.name)}” disappears. Planned visits that used it switch to the first list; past visits keep theirs.`, 'Delete list', true))) return;
  const { data, error } = await pvaRpc('pv_admin_delete_list', { p_list: L.id });
  if (error) { pvaToast('No connection — try again.'); return; }
  if (data && data.error) {
    pvaToast(data.error === 'last' ? 'Keep at least one list.' : data.error === 'in_use' ? 'A rhythm uses this list — change the rhythm first.' : 'Already changed — refreshed.');
    await _pvlLoad(); return;
  }
  pvaToast('List deleted.');
  await _pvlLoad(null);
  pvaLoad();
}

/* ── MÜLL-PLAN PDF (provider-proofs/lists/…) ────────────── */
function pvlPickMuell() { const f = $a('pvlMuellFile'); if (f) { f.value = ''; f.click(); } }
async function pvlUploadMuell(input) {
  const file = input.files && input.files[0];
  const L = _pvlList();
  if (!file || !L) return;
  if (file.type !== 'application/pdf') { pvaToast('Please choose a PDF.'); return; }
  const path = `lists/${L.id}/muell-${Date.now().toString(36)}.pdf`;
  const { error } = await _ctlSupa.storage.from('provider-proofs').upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (error) { pvaToast('Upload failed — try again.'); return; }
  const { data, error: e2 } = await pvaRpc('pv_admin_set_muell', { p_list: L.id, p_path: path });
  if (e2 || (data && data.error)) { pvaToast('Saved the file but not the link — try again.'); return; }
  pvaToast('Müll-Plan replaced.');
  _pvlLoad(L.id);
}
