/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — QR CODES FOR THE APP LINKS (Oct 2026)
   cc-qr.js · needs qrcode-gen.min.js (loaded before this file)

   ccQrSvg(text, size) → '<svg …>': dark modules on white with the
   quiet zone built in, so phone cameras read it straight away.
   Used by: Casa Castel › Tenants (tenant app) and Providers
   (provider app, guest links).
   ───────────────────────────────────────────────────────────── */
function ccQrSvg(text, size) {
  if (typeof qrcode !== 'function' || !text) return '';
  const q = qrcode(0, 'M');                       // version picked by length · M = 15 % may be covered
  q.addData(String(text));
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n;) {
      if (!q.isDark(y, x)) { x++; continue; }
      const x0 = x;
      while (x < n && q.isDark(y, x)) x++;
      d += `M${x0} ${y}h${x - x0}v1h-${x - x0}z`;
    }
  }
  const m = 4, w = n + 2 * m, s = size ? ` width="${size}" height="${size}"` : '';
  return `<svg${s} viewBox="${-m} ${-m} ${w} ${w}" shape-rendering="crispEdges" role="img" aria-label="QR code" style="display:block"><rect x="${-m}" y="${-m}" width="${w}" height="${w}" fill="#fff"/><path fill="#1E1B18" d="${d}"/></svg>`;
}
