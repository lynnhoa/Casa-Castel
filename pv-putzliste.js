/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS · PUTZLISTE VIEW (board P3b)
   pv-putzliste.js — read-only cleaning list for the provider:
   floor route, house info (only when filled), "Extra heute",
   floors with steps + photo numbers in camera order, bin guide
   + Müll-Plan PDF, "then on this floor" block, extras, close.

   Buttons carry data-act: pl-close · muell
   Depends on: pv-core.js (pvEsc, pvProofUrl), pv-pics.js (pvPic)
   ───────────────────────────────────────────────────────────── */

const _PL_ROOM  = { b: 'room_b', g: 'room_g', k: 'room_k', c: 'house', f: 'supplies', x: 'extra_sec' };
const _PL_BADGE = { b: 'badge_b', g: 'badge_g', k: 'badge_k' };

function _plPicBox(zone, name, box, icon, radius, extra) {
  return `<span class="pic pic--${pvEsc(zone || 'c')}" style="width:${box}px;height:${box}px;border-radius:${radius}px;${extra || ''}">${pvPic(name, icon)}</span>`;
}
function _plChip(n, label, style) {
  if (!n) return '';
  return `<span class="ph-chip"${style ? ` style="${style}"` : ''}>${pvPic('cam', 12)}${n}${label ? ` <small>${pvEsc(label)}</small>` : ''}</span>`;
}
function _plStepPic(st, zone) {
  return PV_PICS[st.pic] ? st.pic : (_PL_ROOM[zone] || 'extras');
}

/* photo numbers in camera order — the same rule as pv_points in the database:
   floors → steps with photo → points → the floor's block photo · extra task last */
function pvPutzlisteNumbers(floors, extra) {
  const map = {};
  let n = 0;
  (floors || []).forEach(f => {
    (f.steps || []).forEach(st => {
      if (st.photo !== 'required' && st.photo !== 'optional') return;
      (st.points || []).forEach(pt => { if (pt.key) map[pt.key] = ++n; });
    });
    const bp = f.block && f.block.photo;
    if (bp && typeof bp === 'object' && bp.key) map[bp.key] = ++n;
  });
  if (extra && extra.de && String(extra.photo) === 'true') map[extra.key || 'extra-task'] = ++n;
  return map;
}

/* Müll-Plan: 'static:<file>' = file in the repo, else a path in provider-proofs */
function pvMuellUrl(path) {
  if (!path) return '';
  return String(path).indexOf('static:') === 0 ? '/' + String(path).slice(7) : pvProofUrl(path);
}

function _plBins(list) {
  const bins = [
    ['bin_yellow', 'Gelbe Tonne', 'Verpackungen · packaging', 'Bordstein · curb'],
    ['bin_paper',  'Papier',      'Papier, Kartons · paper',  'Bordstein · curb'],
    ['bin_bio',    'Bio',         'Essensreste · food waste', 'Betonbox'],
    ['bin_rest',   'Restmüll',    'Alles andere · the rest',  'Betonbox']
  ];
  return `<div class="bin-box">
      <p class="bin-box__t">Welche Tonne? <span class="en">Which bin?</span></p>
      <div class="bin-grid">${bins.map(b => `<div class="bin">${pvPic(b[0], 30)}<div><b>${b[1]}</b><span>${b[2]}</span><i>${b[3]}</i></div></div>`).join('')}</div>
      <p class="bin-way">Weg: Haustür raus → links → wieder links. Glas nicht in diese Tonnen.<span class="en">Out the front door → left → left again. No glass in these bins.</span></p>
      ${list && list.muell ? `<button class="bin-pdf" type="button" data-act="muell">${pvPic('pdf', 15)}Müll-Plan öffnen · waste guide (PDF)</button>` : ''}
    </div>`;
}

function pvPutzlisteHTML(list, card) {
  const floors = (list && list.floors) || [];
  const extra = card && card.extra_task && card.extra_task.de ? card.extra_task : null;
  const num = pvPutzlisteNumbers(floors, extra);
  const hi = (list && list.house_info) || {};

  /* head: title · hint · floor route */
  const route = floors.map((f, i) =>
    `${i ? `<span class="pl-route__arrow" style="margin-bottom:14px;">${pvPic('route_arrow', 14)}</span>` : ''}` +
    `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">${_plPicBox(f.zone, _PL_ROOM[f.zone] || 'house', 40, 26, 12)}` +
    `<span style="font-size:10.5px;font-weight:700;color:#1E1B18;line-height:1;">${pvEsc(f.label || '')}</span></div>`).join('');
  let h = `<div class="pl-head">
      <div class="pl-head__row">
        <div class="pl-title"><b>Putzliste</b><span>Anleitung · cleaning instructions</span></div>
        <button class="pl-x" type="button" data-act="pl-close" aria-label="Schließen · Close">${pvPic('close', 20)}</button>
      </div>
      <p class="pl-hint">Von oben nach unten, Etage für Etage. <span class="ph-chip" style="height:20px;padding:0 7px;vertical-align:1px;">${pvPic('cam', 11)}</span> = Foto machen.<span class="en">Top to bottom, floor by floor. Camera = take a photo.</span></p>
      ${floors.length ? `<div class="pl-route" style="align-items:center;padding:10px 14px;">${route}</div>` : ''}
    </div>
    <div class="pl-body" style="flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;">`;

  /* house info (only what is filled in) */
  const hiRows = [
    ['access',    'c', 'access',    'Zugang',                   'Access'],
    ['supplies',  'f', 'supplies',  'Putzmittel & Staubsauger', 'Supplies'],
    ['emergency', 'x', 'emergency', 'Notfall',                  'Emergency']
  ].filter(r => hi[r[0]] && (hi[r[0]].de || hi[r[0]].en));
  if (hiRows.length) {
    h += `<div class="pl-sec pl-sec--pic" style="padding-top:14px;"><span class="pic pic--c">${pvPic('house', 17)}</span>Haus-Infos <span class="en">House info</span></div>
      <div class="pl-row" style="flex-direction:column;align-items:stretch;gap:0;padding:4px 14px;">` +
      hiRows.map((r, i) => `<div style="display:flex;gap:12px;align-items:flex-start;padding:8px 0;border-top:${i ? '.5px solid #EDE8E0' : 'none'};">${_plPicBox(r[1], r[2], 40, 24, 12)}<div><p class="pl-row__de" style="font-size:14px;">${pvEsc(r[3])} <span style="font-size:11px;font-weight:400;color:#9A8E7E;">· ${r[4]}</span></p><p class="pl-row__ins">${pvEsc(hi[r[0]].de || '')}${hi[r[0]].en ? ` <span class="en">· ${pvEsc(hi[r[0]].en)}</span>` : ''}</p></div></div>`).join('') +
      `</div>`;
  }

  /* extra task of this visit (never part of the list) */
  if (extra) {
    h += `<div class="pl-sec pl-sec--pic" style="padding-top:14px;"><span class="pic pic--x">${pvPic('extra_sec', 17)}</span>Extra heute <span class="en">only this visit</span></div>
      <div class="pl-row" style="align-items:flex-start;gap:14px;padding:12px 12px 12px 14px;border-color:#F6C3A3;">
        ${_plPicBox('x', 'extra', 52, 34, 15, 'margin-top:2px;')}
        <div class="pl-row__txt"><p class="pl-row__de">${pvEsc(extra.de)}</p>${extra.en ? `<p class="pl-row__en">${pvEsc(extra.en)}</p>` : ''}
          ${num[extra.key || 'extra-task'] ? `<div class="pl-chips">${_plChip(num[extra.key || 'extra-task'], 'Extra')}</div>` : ''}</div>
      </div>`;
  }

  /* floors */
  floors.forEach(f => {
    h += `<div class="pl-sec pl-sec--pic" style="padding-top:18px;"><span style="display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 9px 0 7px;border-radius:12px;background:#1E1B18;color:#FDFCFA;font-size:11px;font-weight:700;letter-spacing:.02em;line-height:1;white-space:nowrap;">${pvPic(_PL_BADGE[f.zone] || 'badge_b', 9)}${pvEsc(f.label || '')}</span><span class="pic pic--${pvEsc(f.zone || 'c')}">${pvPic(_PL_ROOM[f.zone] || 'house', 17)}</span>${pvEsc(f.room_de || '')} <span class="en">${pvEsc(f.room_en || '')}</span></div>`;
    (f.steps || []).forEach(st => {
      const zone = st.zone || f.zone;
      const pts = (st.photo === 'required' || st.photo === 'optional') ? (st.points || []) : [];
      const chips = pts.map(pt => _plChip(num[pt.key], pts.length > 1 ? pt.de : '')).join('');
      h += `<div class="pl-row" style="align-items:flex-start;gap:14px;padding:12px 12px 12px 14px;">
          ${_plPicBox(zone, _plStepPic(st, zone), 52, 34, 15, 'margin-top:2px;')}
          <div class="pl-row__txt">
            <p class="pl-row__de">${pvEsc(st.de || '')}</p><p class="pl-row__en">${pvEsc(st.en || '')}</p>
            ${st.ins_de ? `<p class="pl-row__ins">${pvEsc(st.ins_de)}${st.ins_en ? ` <span class="en">· ${pvEsc(st.ins_en)}</span>` : ''}</p>` : ''}
            ${chips ? `<div class="pl-chips">${chips}${st.photo === 'optional' ? '<span class="ph-chip ph-chip--opt">optional</span>' : ''}</div>` : ''}
            ${st.hint_de && pts.length ? `<span class="pl-row__hint">${pvPic('hint', 11)}Foto: ${pvEsc(st.hint_de)}${st.hint_en ? ' · ' + pvEsc(st.hint_en) : ''}</span>` : ''}
          </div>
        </div>`;
      if (st.bins) h += _plBins(list);
    });
    const bl = f.block || {};
    const bp = bl.photo && typeof bl.photo === 'object' ? bl.photo : null;
    const items = [];
    if (bl.surfaces || bp) items.push(['c', 'surfaces', 'Oberflächen sauber machen', 'Clean surfaces', bp ? _plChip(num[bp.key], bp.de, 'margin-top:2px;') : '']);
    if (bl.vacuum) items.push(['f', 'vacuum', 'Saugen', 'Vacuum', '']);
    if (bl.mop)    items.push(['f', 'mop', 'Wischen', 'Mop', '']);
    if (items.length) {
      h += `<div class="pl-row" style="flex-direction:column;align-items:stretch;gap:8px;padding:10px 12px 12px;background:#F9F6F1;border:1px dashed #D9CFC0;">
          <p style="font-size:12px;font-weight:600;color:#3A3530;line-height:1.3;">Dann auf dieser Etage <span style="font-weight:400;color:#9A8E7E;">· then on this floor</span></p>
          <div style="display:flex;align-items:flex-start;gap:2px;">` +
        items.map((it, i) => `${i ? `<span class="fl-arrow" style="margin-top:15px;">${pvPic('fl_arrow', 14)}</span>` : ''}<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;">${_plPicBox(it[0], it[1], 44, 28, 13)}<span style="font-size:11.5px;font-weight:500;color:#1E1B18;line-height:1.2;">${it[2]}</span><span style="font-size:10.5px;color:#9A8E7E;line-height:1.2;">${it[3]}</span>${it[4]}</div>`).join('') +
        `</div>${f.stairs && (bl.vacuum || bl.mop) ? `<p class="k-note" style="margin-top:0;text-align:center;">Saugen + Wischen: Treppe runter mit. · Vacuum + mop: incl. stairs down.</p>` : ''}
        </div>`;
    }
  });

  /* extras (optional) + finish */
  h += `<div class="pl-sec pl-sec--pic" style="padding-top:18px;"><span class="pic pic--x">${pvPic('extra_sec', 17)}</span>Extras <span class="en">optional · bis zu 4 · up to 4</span></div>
      <div class="pl-row" style="align-items:flex-start;gap:14px;padding:12px 12px 12px 14px;">
        ${_plPicBox('x', 'extras', 52, 34, 15, 'margin-top:2px;')}
        <div class="pl-row__txt"><p class="pl-row__de">Extras</p><p class="pl-row__en">Extras</p>
          <p class="pl-row__ins">Alles Zusätzliche oder Schäden. <span class="en">· Anything extra or damage.</span></p>
          <div class="pl-chips"><span class="ph-chip ph-chip--opt">${pvPic('cam_opt', 12)}Foto optional · photo optional</span></div></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:14px 0 4px;">
        ${_plPicBox('x', 'done', 42, 28, 13)}
        <div><p style="font-size:16px;font-weight:600;color:#1E1B18;line-height:1.2;">Fertig!</p><p style="font-size:11px;color:#9A8E7E;line-height:1.3;">All done → Senden · send</p></div>
      </div>
    </div>
    <div class="pl-foot"><button class="pv-big pv-big--light" type="button" data-act="pl-close" style="margin-top:0;justify-content:center;"><span class="pv-big__txt" style="flex:0 1 auto;align-items:center;"><span class="pv-big__de">Schließen</span><span class="pv-big__en">Close</span></span></button></div>`;
  return h;
}
