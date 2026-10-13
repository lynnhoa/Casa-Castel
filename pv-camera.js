/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS · CAMERA (boards P3 · P3c · P3d) · Phase 3
   pv-camera.js — the only surface besides the day screen.

   Tap anywhere = photo → compressed JPEG (≤ 1280 px) → upload to
   provider-proofs <visit>/<point>-<id>.jpg → pv_take_photo (server
   time) → tile ✓ → next open point.
   Tiles: ✓ done (+ taker's initial) · spinner uploading · dark now ·
   pictogram open · – nicht möglich. Tap a tile = jump / retake.
   Offline: photos wait in a queue and retry while the camera is
   open; ✓ only after the server saved them, so nothing is lost
   silently. ✕ pauses — the card then says "Weiter x/13".
   Alles fertig: Extra-Foto (≤ 4) · Schaden melden · Senden.
   Redo: only the flagged areas.

   The live camera is the kitchen-proof camera (chat-compose.js:
   ccCamSupported · ccCamOpen · ccCamSnap · ccCamStop ·
   ccCompressImage). Blocked camera → one-line hint → the phone's
   own camera (capture input) — never the photo library.

   Depends on: constants.js, pv-core.js, pv-pics.js, chat-compose.js,
               pv-service.js (_pvState, _pvLoad, _pvToLogin)
   ───────────────────────────────────────────────────────────── */

const _cam = {
  open: false, visit: null, mode: 'run',     // run · extra · damage
  cur: null, retake: false,                  // current point key · jumped to a done tile
  live: false, stream: null, video: null, blocked: false,
  queue: [], local: {}, npLocal: {},         // waiting photos · saved here (thumb) · np marked here
  np: false, npOther: false, saved: null, offline: false,
  damage: null, closeArm: 0, busy: false, poll: null, refreshT: null
};

/* ── DATA ───────────────────────────────────────────────── */
function _camVisit() {
  const s = _pvState;
  if (!s || !s.card) return null;
  if (s.card.id === _cam.visit) return s.card;
  if (s.card.redo_other && s.card.redo_other.id === _cam.visit) return s.card.redo_other;
  return null;
}
function _camPoints(v) {                     /* tiles in camera order */
  const pts = (v.points || []).filter(p => p.mode === 'required' || p.mode === 'optional');
  return v.status === 'redo' ? pts.filter(p => p.flagged) : pts;
}
function _camPending(key) { return _cam.queue.some(q => q.point === key); }
function _camDone(v, p) {
  if (_cam.local[p.key] || _cam.npLocal[p.key]) return true;
  if (v.status === 'redo') return !!(p.redone && (p.path || p.np));
  return !!(p.path || p.np);
}
function _camOpenReq(v, p) { return p.mode === 'required' && !_camDone(v, p) && !_camPending(p.key); }
function _camNextOpen(v, fromKey) {
  const pts = _camPoints(v);
  const i0 = pts.findIndex(p => p.key === fromKey);
  for (let k = 1; k <= pts.length; k++) {
    const p = pts[(Math.max(i0, 0) + k) % pts.length];
    if (_camOpenReq(v, p)) return p.key;
  }
  return null;
}
function _camFirstOpen(v) { const p = _camPoints(v).find(x => _camOpenReq(v, x)); return p ? p.key : null; }
function _camCounts(v) {
  const req = _camPoints(v).filter(p => p.mode === 'required');
  const done = req.filter(p => _camDone(v, p));
  return { total: req.length, done: done.length, left: req.length - done.length,
           np: done.filter(p => (p.np || _cam.npLocal[p.key]) && !p.path && !_cam.local[p.key]).length };
}
function _camExtras(v, kind) { return (v.extras || []).filter(x => x.kind === kind).length; }
function _camIns(key) {                      /* instructions of the step a point belongs to */
  const fl = (_pvState && _pvState.list && _pvState.list.floors) || [];
  for (const f of fl) for (const st of (f.steps || [])) {
    if ((st.points || []).some(pt => pt.key === key)) return { de: st.ins_de || '', en: st.ins_en || '' };
  }
  return { de: '', en: '' };
}
function _camShortFloor(l) { return String(l || '').replace(/\.\s*OG$/i, '').trim(); }

/* ── OPEN · CLOSE ───────────────────────────────────────── */
async function pvCamOpen(visitId) {
  Object.assign(_cam, { open: true, visit: visitId, mode: 'run', np: false, npOther: false, damage: null,
                        saved: null, closeArm: 0, retake: false, local: {}, npLocal: {} });
  const v = _camVisit();
  if (!v) { _cam.open = false; pvToast('Termin geändert · Visit changed'); return; }
  _cam.cur = _camFirstOpen(v);
  document.getElementById('pv-cam').classList.remove('pv-hidden');
  _camRender();
  await _camStartLive();
  _camRender();
  clearInterval(_cam.poll);
  _cam.poll = setInterval(() => { if (_cam.open && !document.hidden) _pvLoad(); }, 15000);   /* 2nd phone */
}
function pvCamClose(force) {
  if (!_cam.open) return;
  if (_cam.queue.length && !force && Date.now() - _cam.closeArm > 4000) {
    _cam.closeArm = Date.now();
    pvToast(`${_cam.queue.length} ${_cam.queue.length === 1 ? 'Foto wird' : 'Fotos werden'} noch gesendet – nochmal ✕ = trotzdem schließen · still sending – tap ✕ again to close`);
    return;
  }
  _cam.open = false;
  clearInterval(_cam.poll);
  _camStopLive();
  _cam.queue.forEach(q => q.url && URL.revokeObjectURL(q.url));
  _cam.queue = [];
  if (_cam.damage && _cam.damage.url) URL.revokeObjectURL(_cam.damage.url);
  _cam.damage = null;
  document.getElementById('pv-cam').classList.add('pv-hidden');
  _pvLoad();
}
function pvCamKill() {                      /* logout: close without a reload */
  if (!_cam.open) return;
  _cam.open = false; clearInterval(_cam.poll); _camStopLive();
  _cam.queue.forEach(q => q.url && URL.revokeObjectURL(q.url)); _cam.queue = [];
  document.getElementById('pv-cam').classList.add('pv-hidden');
}
async function _camStartLive() {
  if (_cam.live && _cam.stream && _cam.stream.active) return;
  _cam.live = false;
  _cam.blocked = false;
  if (typeof ccCamSupported === 'function' && ccCamSupported()) {
    try {
      if (!_cam.video) {
        _cam.video = document.createElement('video');
        _cam.video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
      }
      _cam.stream = await ccCamOpen(_cam.video);
      _cam.live = true;
      return;
    } catch (e) { console.warn('[pv-camera] live camera not possible → phone camera', e); _cam.blocked = true; }
  } else _cam.blocked = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof ccIsLaptop === 'function' && !ccIsLaptop();
}
function _camStopLive() {
  _cam.live = false;
  if (typeof ccCamStop === 'function') ccCamStop(_cam.stream);
  _cam.stream = null;
  if (_cam.video) { try { _cam.video.srcObject = null; } catch (e) {} }
}

/* called by pv-service.js after every pv_state load */
function pvCamOnState() {
  if (!_cam.open) return;
  const v = _camVisit();
  if (!v || (v.status !== 'in_progress' && v.status !== 'redo')) {
    const st = v ? v.status : '';
    pvCamClose(true);
    pvToast(st === 'sent' ? 'Gesendet ✓ · Sent' : (st === 'cancelled' || st === 'cancelled_by_provider') ? 'Termin abgesagt · Visit cancelled' : 'Termin geändert · Visit changed');
    return;
  }
  (v.points || []).forEach(p => {                           /* the server has it now → drop the local marks */
    if (_cam.npLocal[p.key] && p.np) delete _cam.npLocal[p.key];
  });
  if (_cam.mode === 'run' && !_cam.retake && (!_cam.cur || !_camOpenReq(v, (v.points || []).find(p => p.key === _cam.cur) || {})))
    _cam.cur = (_cam.cur && _camNextOpen(v, _cam.cur)) || _camFirstOpen(v);
  if (_cam.open && !_cam.live && !_cam.blocked && !document.hidden) _camStartLive().then(_camRender);
  _camRender();
}
function _camRefreshSoon() {
  clearTimeout(_cam.refreshT);
  _cam.refreshT = setTimeout(() => { if (_cam.open) _pvLoad(); }, 500);
}

/* ── SHOOT · QUEUE ──────────────────────────────────────── */
async function _camShoot() {
  if (_cam.busy || !_cam.open) return;
  const v = _camVisit();
  if (!v) return;
  if (_cam.mode === 'run' && !_cam.cur) return;
  if (_cam.mode === 'damage' && _cam.damage) return;
  if (_cam.live && _cam.video && _cam.video.videoWidth) {
    _cam.busy = true;
    const fr = document.getElementById('pv-cam-frame');
    const ratio = fr && fr.clientWidth && fr.clientHeight ? fr.clientWidth / fr.clientHeight : 3 / 4;
    const blob = await ccCamSnap(_cam.video, ratio);         /* saved photo = what the frame showed */
    _cam.busy = false;
    if (blob) _camGot(blob);
    return;
  }
  const fi = document.getElementById('pv-cam-file');         /* phone camera — capture, no library */
  fi.value = '';
  fi.onchange = async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    _camGot(await ccCompressImage(f));
  };
  fi.click();
}
function _camGot(blob) {
  const v = _camVisit();
  if (!v || !_cam.open) return;
  if (_cam.mode === 'damage') { _cam.damage = { blob, url: URL.createObjectURL(blob) }; _camRender(); return; }
  let point, kind = 'normal';
  if (_cam.mode === 'extra') {
    point = 'extra-' + Math.min(4, _camExtras(v, 'extra') + _cam.queue.filter(q => q.kind === 'extra').length + 1);
    kind = 'extra';
    _cam.mode = 'run';                                       /* back to "Alles fertig" */
  } else {
    point = _cam.cur;
    if (_cam.local[point]) { URL.revokeObjectURL(_cam.local[point]); delete _cam.local[point]; }   /* retake */
    delete _cam.npLocal[point];
    _cam.retake = false;
  }
  _cam.queue.push({ point, kind, blob, takenAt: new Date().toISOString(), url: URL.createObjectURL(blob), path: null });
  if (kind !== 'extra') _cam.cur = _camNextOpen(v, point);
  _camRender();
  _camPump();
}
let _camPumping = false;
async function _camPump() {
  if (_camPumping) return;
  _camPumping = true;
  try {
    while (_cam.open && _cam.queue.length) {
      const q = _cam.queue[0];
      const r = await _camSend(q);
      if (r === 'retry') {
        _cam.offline = true; _camRender();
        await new Promise(res => setTimeout(res, 4000));
        continue;
      }
      _cam.queue.shift();
      _cam.offline = false;
      if (r === 'saved') {
        if (q.kind === 'extra') URL.revokeObjectURL(q.url);
        else _cam.local[q.point] = q.url;                    /* own thumbnail until the server copy loads */
        _cam.saved = { key: q.point, kind: q.kind, at: Date.now() };
      } else URL.revokeObjectURL(q.url);
      _camRender();
      _camRefreshSoon();
    }
  } finally { _camPumping = false; }
}
async function _camSend(q) {
  if (!q.path) {
    const path = `${_cam.visit}/${q.point}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
    let up;
    try { up = await pvSupa.storage.from('provider-proofs').upload(path, q.blob, { contentType: 'image/jpeg', upsert: false }); }
    catch (e) { return 'retry'; }
    if (up && up.error) {
      if (/security|policy|violates|not allowed|unauthori/i.test(String(up.error.message || up.error))) {
        pvToast('Foto nicht angenommen · Photo not accepted'); _camRefreshSoon(); return 'drop';
      }
      return 'retry';
    }
    q.path = path;
  }
  const { data, error } = await pvRpc('pv_take_photo', { p_token: localStorage.getItem('pv_token'), p_visit: _cam.visit,
    p_point: q.point, p_path: q.path, p_taken_at: q.takenAt, p_kind: q.kind === 'extra' ? 'extra' : 'normal' });
  if (error) {
    if (String(error).indexOf('pv_auth') !== -1) { pvCamClose(true); _pvToLogin(); return 'drop'; }
    return 'retry';
  }
  if (data && data.error) { pvToast('Schon geändert · Already changed'); _camRefreshSoon(); return 'drop'; }
  return 'saved';
}
window.addEventListener('online', () => { if (_cam.open && _cam.queue.length) _camPump(); });

/* ── NICHT MÖGLICH · SEND · DAMAGE ──────────────────────── */
async function _camMarkNp(reason) {
  const v = _camVisit();
  const key = _cam.cur;
  if (!v || !key) return;
  const note = reason === 'anderes' ? (document.getElementById('pv-cam-npnote') || {}).value || '' : '';
  if (reason === 'anderes' && !note.trim()) { pvToast('Bitte kurz erklären · Please explain briefly'); return; }
  _cam.busy = true;
  const { data, error } = await pvRpc('pv_mark_np', { p_token: localStorage.getItem('pv_token'), p_visit: _cam.visit,
    p_point: key, p_reason: reason, p_note: note.trim() || null });
  _cam.busy = false;
  if (error) { if (String(error).indexOf('pv_auth') !== -1) { pvCamClose(true); _pvToLogin(); return; } pvToast('Kein Internet · No internet'); return; }
  if (data && data.error) { pvToast(data.error === 'note' ? 'Bitte kurz erklären · Please explain briefly' : 'Schon geändert · Already changed'); _camRefreshSoon(); return; }
  if (_cam.local[key]) { URL.revokeObjectURL(_cam.local[key]); delete _cam.local[key]; }
  _cam.npLocal[key] = reason;
  _cam.np = false; _cam.npOther = false; _cam.retake = false;
  _cam.cur = _camNextOpen(v, key);
  _camRender();
  _camRefreshSoon();
}
async function _camSendVisit() {
  const v = _camVisit();
  if (!v || _cam.queue.length || _cam.busy) return;
  _cam.busy = true;
  const { data, error } = await pvRpc('pv_send', { p_token: localStorage.getItem('pv_token'), p_visit: _cam.visit });
  _cam.busy = false;
  if (error) { if (String(error).indexOf('pv_auth') !== -1) { pvCamClose(true); _pvToLogin(); return; } pvToast('Kein Internet · No internet'); return; }
  if (data && data.error === 'incomplete') { pvToast(`Noch ${data.left} offen · ${data.left} left`); _camRefreshSoon(); return; }
  if (data && data.error) { pvToast('Schon geändert · Already changed'); pvCamClose(true); return; }
  pvCamClose(true);
  pvToast('Gesendet ✓ · Sent');
}
async function _camSendDamage() {
  const d = _cam.damage;
  const note = ((document.getElementById('pv-cam-dmgnote') || {}).value || '').trim();
  if (!d || _cam.busy) return;
  if (!note) { pvToast('Bitte kurz beschreiben · Please describe briefly'); return; }
  _cam.busy = true;
  try {
    if (!d.path) {
      const path = `${_cam.visit}/damage-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
      const up = await pvSupa.storage.from('provider-proofs').upload(path, d.blob, { contentType: 'image/jpeg', upsert: false });
      if (up && up.error) { pvToast('Kein Internet – nochmal versuchen · No internet – try again'); return; }
      d.path = path;
    }
    const { data, error } = await pvRpc('pv_report', { p_token: localStorage.getItem('pv_token'), p_kind: 'damage',
      p_payload: { path: d.path, note }, p_visit: _cam.visit });
    if (error) { pvToast('Kein Internet – nochmal versuchen · No internet – try again'); return; }
    if (data && data.error) { pvToast('Schon geändert · Already changed'); return; }
    URL.revokeObjectURL(d.url);
    _cam.damage = null; _cam.mode = 'run';
    pvToast('Schaden gemeldet · Damage reported');
    _camRefreshSoon();
  } catch (e) { pvToast('Kein Internet – nochmal versuchen · No internet – try again'); }
  finally { _cam.busy = false; _camRender(); }
}

/* ── RENDER ─────────────────────────────────────────────── */
function _camTile(v, p) {
  const q = _cam.queue.find(x => x.point === p.key);
  const done = _camDone(v, p);
  const now = _cam.mode === 'run' && p.key === _cam.cur;
  let cls = 'pic', st = 'flex:0 0 32px;height:46px;border-radius:7px;position:relative;cursor:pointer;', inner = '';
  if (q) {
    st += `background:#3A3530 url('${q.url}') center/cover;`;
    inner = '<span class="pv-spin" style="color:#FDFCFA;width:12px;height:12px;"></span>';
  } else if (done && (_cam.npLocal[p.key] || (p.np && !p.path && !_cam.local[p.key]))) {
    cls += ' pic--np'; inner = pvPic('tile_np', 14);
  } else if (done) {
    const url = _cam.local[p.key] || (p.path ? pvProofUrl(p.path) : '');
    const who = _cam.local[p.key] ? ((_pvState.person && _pvState.person.name) || '') : (p.by || '');
    st += `background:#CDC5B8 url('${pvEsc(url)}') center/cover;`;
    inner = `<span class="pic__ok">${pvPic('tile_ok', 9)}</span>${who ? `<span style="position:absolute;left:3px;bottom:1px;font-size:9px;font-weight:700;color:#FDFCFA;text-shadow:0 0 3px rgba(0,0,0,.8);">${pvEsc(who[0].toUpperCase())}</span>` : ''}`;
  } else if (now) {
    cls += ' pic--now'; inner = pvPic(p.pic, 18);
  } else {
    cls += ' pic--' + pvEsc(p.zone || 'c'); inner = pvPic(p.pic, 18);
  }
  if (now && (done || q)) st += 'box-shadow:0 0 0 2px #FDFCFA,0 0 0 3.5px #1E1B18;';
  return `<span class="${cls}" data-tile="${pvEsc(p.key)}" style="${st}" title="${p.n} · ${pvEsc(p.de)}">${inner}</span>`;
}

function _camFrame(ghostPic, extraTop) {
  const sv = _cam.saved && Date.now() - _cam.saved.at < 2600 ? _cam.saved : null;
  const v = _camVisit();
  const svp = sv && v ? (v.points || []).find(p => p.key === sv.key) : null;
  return `<div style="flex:1;min-height:0;padding:0 12px;display:flex;">
      <div class="pl-frame" id="pv-cam-frame" data-cam="shoot" style="flex:1;height:auto;max-height:none;aspect-ratio:auto;flex-direction:column;gap:8px;cursor:pointer;">
        <span id="pv-cam-live" style="position:absolute;inset:0;"></span>
        <span class="pl-corner pl-corner--tl"></span><span class="pl-corner pl-corner--tr"></span><span class="pl-corner pl-corner--bl"></span><span class="pl-corner pl-corner--br"></span>
        ${sv ? `<span style="position:absolute;top:14px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:7px;padding:4px 12px 4px 5px;border-radius:18px;background:rgba(253,252,250,.95);color:#27500A;font-size:12px;font-weight:500;white-space:nowrap;line-height:1.3;z-index:2;"><span class="pic pic--${pvEsc(svp ? svp.zone : 'x')}" style="width:24px;height:24px;border-radius:12px;">${pvPic(svp ? svp.pic : 'extras', 14)}</span>${pvPic('saved_check', 12)}${pvEsc(svp ? svp.de : 'Extra-Foto')} gespeichert · saved</span>` : ''}
        ${_cam.offline ? `<span style="position:absolute;top:${sv ? 50 : 14}px;left:50%;transform:translateX(-50%);padding:5px 12px;border-radius:14px;background:#FDF0D8;color:#633806;font-size:12px;font-weight:500;white-space:nowrap;z-index:2;">Kein Internet – ${_cam.queue.length} ${_cam.queue.length === 1 ? 'Foto wartet' : 'Fotos warten'} · waiting</span>` : ''}
        ${extraTop || ''}
        ${_cam.live ? '' : `<span class="pic pic-ghost" style="background:none;width:112px;height:112px;">${pvPic(ghostPic, 88)}</span>
          <span class="pl-frame__lbl" style="text-align:center;padding:0 16px;">${_cam.blocked ? 'Kamera gesperrt – tippen öffnet die Handy-Kamera · camera blocked – tap opens the phone camera' : 'Tippen öffnet die Kamera · tap opens the camera'}</span>`}
        <span style="position:absolute;bottom:14px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:7px;padding:7px 14px 7px 11px;border-radius:18px;background:rgba(30,27,24,.62);color:#FDFCFA;font-size:12px;font-weight:500;white-space:nowrap;line-height:1.3;z-index:2;">${pvPic('tap', 14)}Tippen = Foto · Tap = photo</span>
      </div>
    </div>`;
}
function _camShutter() {
  return `<button type="button" data-cam="shoot" aria-label="Foto aufnehmen · Take photo" style="width:76px;height:76px;border-radius:50%;border:3px solid #1E1B18;background:#FDFCFA;display:flex;align-items:center;justify-content:center;padding:0;"><span style="display:block;width:60px;height:60px;border-radius:50%;background:#1E1B18;"></span></button>`;
}
function _camBack() {
  return `<button type="button" data-cam="back" style="width:104px;min-height:48px;display:flex;align-items:center;gap:8px;text-align:left;background:none;border:none;padding:0;color:#6B5E4E;"><span style="font-size:13px;font-weight:500;line-height:1.25;">← Zurück<br><span style="font-weight:400;color:#9A8E7E;font-size:11px;">Back</span></span></button>`;
}

function _camPointView(v, c) {
  const p = (v.points || []).find(x => x.key === _cam.cur);
  if (!p) return '';
  const ins = _camIns(p.key);
  const fl = _camShortFloor(p.floor);
  const head = `<div style="display:flex;align-items:center;gap:14px;padding:14px 16px 12px;flex-shrink:0;background:#FDFCFA;">
      <span class="pic pic--${pvEsc(p.zone || 'c')}" style="width:68px;height:68px;border-radius:18px;">${pvPic(p.pic, 40)}${fl ? `<span class="pic__fl">${pvPic('fl_badge', 9)}${pvEsc(fl)}</span>` : ''}</span>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;"><span class="pl-now">${p.n} · ${_cam.retake ? 'Neu · Again' : 'Jetzt · Now'}</span><span style="font-size:11px;color:#9A8E7E;">${pvEsc([p.floor, p.room_de !== p.de ? p.room_de : ''].filter(Boolean).join(' · '))}</span></div>
        <p style="margin-top:6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;font-weight:500;line-height:1;color:#1E1B18;">${pvEsc(p.de)} <span style="font-family:'Inter',system-ui,sans-serif;font-size:13px;font-weight:400;color:#9A8E7E;">${pvEsc(p.en || '')}</span></p>
        ${ins.de ? `<p class="pl-row__ins" style="font-size:13px;margin-top:5px;">${pvEsc(ins.de)}${ins.en ? ` <span class="en">· ${pvEsc(ins.en)}</span>` : ''}</p>` : ''}
        ${p.hint_de ? `<span class="pl-row__hint" style="margin-top:5px;">${pvPic('hint', 11)}${pvEsc(p.hint_de)}${p.hint_en ? ' · ' + pvEsc(p.hint_en) : ''}</span>` : ''}
      </div>
    </div>`;
  let ctrl;
  if (_cam.np) {
    const r = [['besetzt', 'np_busy', 'Besetzt', 'Occupied'], ['kaputt', 'np_broken', 'Kaputt', 'Broken'], ['anderes', 'np_other', 'Anderes', 'Other']];
    ctrl = `<div style="flex-shrink:0;margin:10px 12px 4px;padding:12px;border-radius:16px;background:#F5EEE8;border:1px solid #D4A87A;">
        <p style="font-size:14px;font-weight:600;color:#8C5A30;line-height:1.2;display:flex;align-items:center;gap:6px;">${pvPic('np_btn', 16)}Warum nicht möglich? <span style="font-weight:400;color:#9A8E7E;font-size:12px;">· Why?</span></p>
        <div style="display:flex;gap:8px;margin-top:10px;">${r.map(x => `<button type="button" data-np="${x[0]}" style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px 10px;border-radius:14px;border:${_cam.npOther && x[0] === 'anderes' ? '1.5px solid #8C5A30' : '1px solid #D4A87A'};background:#FDFCFA;color:#8C5A30;"><span class="pic pic--np" style="width:52px;height:52px;border-radius:16px;border-style:solid;">${pvPic(x[1], 28)}</span><span style="font-size:14px;font-weight:600;color:#1E1B18;line-height:1.1;">${x[2]}</span><span style="font-size:11px;color:#9A8E7E;line-height:1.1;">${x[3]}</span></button>`).join('')}</div>
        ${_cam.npOther ? `<div style="display:flex;gap:8px;margin-top:10px;"><input id="pv-cam-npnote" class="cc-input" maxlength="200" placeholder="Kurz erklären · explain briefly" style="flex:1;font-family:inherit;"/><button type="button" data-cam="np-ok" style="min-width:64px;border-radius:10px;border:none;background:#8C5A30;color:#FDFCFA;font-weight:600;">OK</button></div>` : ''}
        <button type="button" data-cam="np-back" style="display:block;margin:8px auto 0;min-height:36px;padding:0 12px;background:none;border:none;font-size:13px;font-weight:500;color:#6B5E4E;text-decoration:underline;text-underline-offset:3px;">Zurück · Back</button>
      </div>`;
  } else {
    ctrl = `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 18px 6px;flex-shrink:0;">
        <button type="button" data-cam="np" style="width:104px;min-height:48px;display:flex;align-items:center;gap:8px;text-align:left;background:none;border:none;padding:0;color:#8C5A30;">
          <span class="pic pic--np" style="width:38px;height:38px;border-radius:19px;">${pvPic('np_btn', 18)}</span>
          <span style="font-size:12px;font-weight:500;line-height:1.25;">Nicht<br>möglich<br><span style="font-weight:400;color:#9A8E7E;font-size:11px;">Not possible</span></span>
        </button>
        ${_camShutter()}
        <div style="width:104px;display:flex;flex-direction:column;align-items:flex-end;line-height:1.1;">
          <span style="font-size:24px;font-weight:600;color:#1E1B18;">${c.done} <span style="font-size:15px;font-weight:400;color:#9A8E7E;">/ ${c.total}</span></span>
          <span style="font-size:11px;color:#9A8E7E;margin-top:3px;">Fotos · photos</span>
        </div>
      </div>`;
  }
  return head + _camFrame(p.pic) + ctrl;
}

function _camSpecialView(kind, v) {          /* extra photo · damage report */
  const extra = kind === 'extra';
  const head = `<div style="display:flex;align-items:center;gap:14px;padding:14px 16px 12px;flex-shrink:0;background:#FDFCFA;">
      <span class="pic ${extra ? 'pic--x' : ''}" style="width:68px;height:68px;border-radius:18px;${extra ? '' : 'background:#FCEBEB;color:#A32D2D;'}">${pvPic(extra ? 'extras' : 'damage', 40)}</span>
      <div style="flex:1;min-width:0;">
        <span class="pl-now">${extra ? 'Extra · optional' : 'Schaden · Damage'}</span>
        <p style="margin-top:6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;font-weight:500;line-height:1;color:#1E1B18;">${extra ? 'Extra-Foto' : 'Schaden melden'} <span style="font-family:'Inter',system-ui,sans-serif;font-size:13px;font-weight:400;color:#9A8E7E;">${extra ? 'Extra photo' : 'Report damage'}</span></p>
        <p class="pl-row__ins" style="font-size:13px;margin-top:5px;">${extra ? 'Alles Zusätzliche. <span class="en">· Anything extra.</span>' : 'Foto vom Schaden, dann kurz beschreiben. <span class="en">· Photo of the damage, then describe it.</span>'}</p>
      </div>
    </div>`;
  if (!extra && _cam.damage) {
    return head + `<div style="flex:1;min-height:0;padding:0 12px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;">
        <div style="flex:1;min-height:140px;border-radius:12px;background:#2B2622 url('${_cam.damage.url}') center/cover;"></div>
        <textarea id="pv-cam-dmgnote" class="cc-input pv-textarea" rows="2" maxlength="300" placeholder="Was ist kaputt? · What is broken?" style="font-family:inherit;height:auto;padding-top:10px;width:100%;"></textarea>
        <button type="button" data-cam="dmg-send" style="width:100%;min-height:52px;border-radius:14px;border:none;background:#A32D2D;color:#FFFFFF;font-weight:600;font-size:16px;">Melden <span style="font-weight:400;font-size:12px;color:#F7C1C1;">· Report</span></button>
        <button type="button" data-cam="dmg-retake" style="display:block;margin:0 auto 6px;min-height:36px;background:none;border:none;font-size:13px;color:#6B5E4E;text-decoration:underline;">Neues Foto · New photo</button>
      </div>`;
  }
  return head + _camFrame(extra ? 'extras' : 'damage') + `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 18px 6px;flex-shrink:0;">
      ${_camBack()}${_camShutter()}<div style="width:104px;text-align:right;font-size:11px;color:#9A8E7E;">${extra ? `Extra ${_camExtras(v, 'extra') + 1} / 4` : ''}</div>
    </div>`;
}

function _camDoneView(v, c) {
  const extras = _camExtras(v, 'extra');
  const photos = c.done - c.np;
  const redo = v.status === 'redo';
  return `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px 24px;text-align:center;background:#FDFCFA;overflow-y:auto;">
      <span class="pic pic--x" style="width:96px;height:96px;border-radius:28px;">${pvPic('done_big', 56)}</span>
      <p style="margin-top:6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:500;line-height:1;color:#1E1B18;">Alles fertig</p>
      <p style="font-size:13px;color:#9A8E7E;line-height:1.2;">All done</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:4px;">
        <span class="ph-chip" style="background:#EAF3DE;color:#27500A;">${pvPic('chip_photos', 12)}${photos} ${photos === 1 ? 'Foto · photo' : 'Fotos · photos'}</span>
        ${c.np ? `<span class="ph-chip" style="background:#F5EEE8;color:#8C5A30;">${pvPic('chip_np', 12)}${c.np} nicht möglich · not possible</span>` : ''}
        ${extras ? `<span class="ph-chip" style="background:#FCE9DD;color:#A3512A;">${pvPic('cam', 12)}${extras} Extra</span>` : ''}
      </div>
      ${!redo && extras < 4 ? `<button class="pv-big pv-big--light" type="button" data-cam="extra" style="margin-top:18px;width:auto;min-height:50px;padding:8px 18px 8px 10px;">
        <span class="pv-big__ico" style="width:34px;height:34px;background:#FCE9DD;color:#A3512A;">${pvPic('extra_photo', 18)}</span>
        <span class="pv-big__txt"><span class="pv-big__de" style="font-size:15px;">Extra-Foto</span><span class="pv-big__en">optional · extra photo</span></span>
      </button>` : ''}
      ${!redo ? `<button class="pv-big pv-big--light" type="button" data-cam="damage" style="margin-top:8px;width:auto;min-height:50px;padding:8px 18px 8px 10px;border-color:#F09595;">
        <span class="pv-big__ico" style="width:34px;height:34px;background:#FCEBEB;color:#A32D2D;">${pvPic('damage', 18)}</span>
        <span class="pv-big__txt"><span class="pv-big__de" style="font-size:15px;color:#A32D2D;">Schaden melden</span><span class="pv-big__en">optional · report damage</span></span>
      </button>` : ''}
    </div>`;
}

function _camRender() {
  const el = document.getElementById('pv-cam');
  if (!el || !_cam.open) return;
  const v = _camVisit();
  if (!v) return;
  const c = _camCounts(v);
  const pts = _camPoints(v);
  const waiting = _cam.queue.filter(q => q.kind !== 'extra').length;
  const ready = c.left === 0 && !_cam.queue.length;
  const pct = c.total ? Math.round(c.done / c.total * 1000) / 10 : 0;
  let body;
  if (_cam.mode === 'extra' || _cam.mode === 'damage') body = _camSpecialView(_cam.mode, v);
  else if (_cam.cur) body = _camPointView(v, c);
  else if (waiting) body = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#6B5E4E;text-align:center;padding:24px;">
      <span class="pv-spin" style="width:28px;height:28px;color:#B8956A;"></span>
      <p style="font-size:15px;font-weight:500;">${waiting} ${waiting === 1 ? 'Foto wird' : 'Fotos werden'} gesendet …<span style="display:block;font-size:12px;color:#9A8E7E;font-weight:400;">${_cam.offline ? 'Kein Internet – es geht weiter, sobald Netz da ist. · No internet – continues when online.' : 'Sending photos …'}</span></p></div>`;
  else body = _camDoneView(v, c);
  el.innerHTML = `
    <div class="scr-top" style="background:#FDFCFA;"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 6px 0 16px;flex-shrink:0;background:#FDFCFA;">
      <div class="pl-title"><b>${v.status === 'redo' ? 'Nochmal' : 'Fotos'}</b><span>${v.status === 'redo' ? 'Redo' : 'Photos'} · ${pvEsc(pvWdFull(v.date))}</span></div>
      <button class="pl-x" type="button" data-cam="close" aria-label="Pause, später weiter · Pause, continue later">${pvPic('pause_x', 20)}</button>
    </div>
    <div class="pv-prog${c.left === 0 ? ' pv-prog--green' : ''}" style="margin-top:0;border-radius:0;height:4px;flex-shrink:0;"><span style="width:${pct}%;border-radius:0;"></span></div>
    ${body}
    <div id="pv-cam-tiles" style="display:flex;gap:4px;padding:8px 12px 10px;overflow-x:auto;flex-shrink:0;-webkit-overflow-scrolling:touch;" aria-label="${c.total} Fotos · ${c.total} photos">${pts.map(p => _camTile(v, p)).join('')}</div>
    <div class="pl-foot" style="padding-top:8px;">
      <button class="pl-send" type="button" data-cam="send"${ready ? ' style="background:#F3DDB0;border:1px solid #D9B878;color:#4A3410;"' : ' disabled'}>${pvPic('send', 18)}<b>Senden</b><small>Send · ${ready ? c.total + ' / ' + c.total : 'noch ' + c.left + ' · ' + c.left + ' left'}</small></button>
    </div>`;
  const slot = document.getElementById('pv-cam-live');
  if (slot && _cam.live && _cam.video && _cam.stream) {
    slot.appendChild(_cam.video);
    ccCamAttach(_cam.video, _cam.stream);
  }
  const nowTile = el.querySelector(`[data-tile="${CSS.escape(_cam.cur || '')}"]`);
  if (nowTile && nowTile.scrollIntoView) nowTile.scrollIntoView({ block: 'nearest', inline: 'center' });
  if (_cam.saved && Date.now() - _cam.saved.at < 2600) {
    clearTimeout(_cam.savedT);
    _cam.savedT = setTimeout(() => { if (_cam.open) _camRender(); }, 2700 - (Date.now() - _cam.saved.at));
  }
}

/* ── TAPS ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('pv-cam');
  if (!el) return;
  el.addEventListener('click', e => {
    if (!_cam.open) return;
    const t = e.target.closest('[data-tile]');
    if (t) {
      const v = _camVisit(); const key = t.getAttribute('data-tile');
      const p = v && (v.points || []).find(x => x.key === key);
      if (!p) return;
      _cam.mode = 'run'; _cam.np = false; _cam.npOther = false;
      _cam.cur = key; _cam.retake = _camDone(v, p) || _camPending(key);
      _camRender();
      return;
    }
    const n = e.target.closest('[data-np]');
    if (n) {
      const r = n.getAttribute('data-np');
      if (r === 'anderes') { _cam.npOther = true; _camRender(); const i = document.getElementById('pv-cam-npnote'); if (i) i.focus(); }
      else _camMarkNp(r);
      return;
    }
    const b = e.target.closest('[data-cam]');
    if (!b) return;
    const a = b.getAttribute('data-cam');
    if (a === 'shoot') _camShoot();
    else if (a === 'close') pvCamClose(false);
    else if (a === 'np') { _cam.np = true; _cam.npOther = false; _camRender(); }
    else if (a === 'np-back') { _cam.np = false; _cam.npOther = false; _camRender(); }
    else if (a === 'np-ok') _camMarkNp('anderes');
    else if (a === 'send') _camSendVisit();
    else if (a === 'extra') { _cam.mode = 'extra'; _cam.cur = null; _camRender(); }
    else if (a === 'damage') { _cam.mode = 'damage'; _cam.cur = null; _cam.damage = null; _camRender(); }
    else if (a === 'back') { _cam.mode = 'run'; _cam.damage = null; _camRender(); }
    else if (a === 'dmg-send') _camSendDamage();
    else if (a === 'dmg-retake') { if (_cam.damage) URL.revokeObjectURL(_cam.damage.url); _cam.damage = null; _camRender(); }
  });
});
