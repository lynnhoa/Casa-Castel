/* ─────────────────────────────────────────────────────────────
   CONTROLLING — SHARED UI
   controlling-ui.js

   One set of building blocks for every tab, so Dashboard, Einnahmen,
   Ausgaben, Einmalig and Setup look and behave identically:
     · month selector (same place on every tab, "Stand" date)
     · pills (one colour = one meaning, everywhere)
     · Soll │ → │ Ist row
     · summary card, property card with fold-up
     · money formatting / parsing (German)
   ───────────────────────────────────────────────────────────── */

'use strict';

/* ── Design system styles (injected once, so the look is right even if an
      older controlling.html is still being served) ── */
const _CX_CSS = `
    /* ════════ Controlling design system (cx) ════════
       Inter everywhere (wordmark excepted) · brown / beige tones, no black ·
       one pill colour = one meaning · 34 px fields, 13 px text.            */
    :root { --cc-ink:#3D3027; }                                   /* #23: espresso brown, no black on this page */
    :root { --cx-ink:#3D3027; --cx-txt:var(--cc-charcoal,#3A3530); --cx-amt:#3D3027; --cx-mut:var(--cc-taupe,#9A8E7E);
            --cx-sub:var(--cc-stone,#C8BFB0); --cx-acc:var(--cc-gold,#B8956A); --cx-neg:#A0533A; --cx-line:#EDE8E0;
            --cx-rule:var(--cc-rule,#E0DAD0); --cx-card:var(--cc-white,#FDFCFA); --cx-bg:var(--cc-bg,#F5F2ED); }   /* = Rentals */
    body.is-landlord { color:var(--cx-ink); }
    .cx-page { max-width:560px; margin:0 auto; padding:4px 0 48px; display:flex; flex-direction:column; gap:8px;
               font-family:'Inter',system-ui,sans-serif; color:var(--cx-ink); }
    .cx-lbl { font-size:9px; font-weight:500; letter-spacing:.14em; text-transform:uppercase; color:var(--cx-mut); }
    .cx-head { display:flex; justify-content:space-between; padding:6px 4px 0; }
    .cx-row-sb { display:flex; justify-content:space-between; align-items:center; gap:8px; }
    .cx-card { background:var(--cx-card); border:.5px solid var(--cx-rule); border-radius:12px; overflow:hidden; }
    .cx-title { font-family:'Cormorant Garamond',Georgia,serif; font-size:32px; font-weight:300; color:var(--cx-ink); }   /* = .rp-title */
    .cx-title__s { font-size:11px; color:var(--cx-mut); margin:-4px 0 4px; }
    .cx-empty { padding:14px; font-size:12px; color:var(--cx-mut); text-align:center; }
    /* month selector */
    .cx-month { display:flex; justify-content:space-between; align-items:center; padding:2px 0 4px; }
    .cx-month__t { text-align:center; }
    .cx-month__m { font-family:'Cormorant Garamond',Georgia,serif; font-size:26px; font-weight:400; color:var(--cx-ink); line-height:1.15; }
    .cx-month__s { font-size:10px; color:var(--cx-sub); margin-top:2px; }
    .cx-arw { width:32px; height:32px; border-radius:50%; border:.5px solid var(--cx-rule); background:transparent; color:var(--cx-mut);
              display:flex; align-items:center; justify-content:center; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    /* pills */
    .cx-pill { display:inline-block; font-size:9px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; padding:2px 7px;
               border-radius:20px; border:.5px solid; white-space:nowrap; line-height:1.5; }
    .cx-pill--open  { background:#FAEEDA; color:#7A4A12; border-color:#E9B06A; }
    .cx-pill--ok    { background:#EEF0DD; color:#55622A; border-color:#B9C28A; }
    .cx-pill--diff  { background:#F7E4DC; color:#8A3B22; border-color:#D9957C; }
    .cx-pill--grey  { background:#EFE9E0; color:var(--cx-mut); border-color:var(--cx-rule); }
    .cx-pill--beige { background:#F3EADC; color:var(--cx-acc); border-color:#D4B896; }
    /* ── Area sub-tabs (Rentals / Casa Castel → Income · Expenses · One-off) ── */
    .cx-subnav { max-width:560px; margin:0 auto 10px; display:flex; border:.5px solid var(--cx-rule); border-radius:10px; overflow:hidden; background:var(--cx-card); height:36px; }
    .cx-subnav button { flex:1; border:none; background:transparent; font-family:'Inter',system-ui,sans-serif; font-size:12.5px; color:var(--cx-mut); cursor:pointer; }
    .cx-subnav button.on { background:var(--cx-ink); color:#fff; }
    /* ── Dashboard v2 (hybrid: big number · one bar · calculation on tap · per property) ── */
    .cxd-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .cxd-top .cx-seg { width:150px; flex-shrink:0; }
    .cxd-per { display:flex; align-items:center; gap:6px; }
    .cxd-per__t { font-family:'Cormorant Garamond',Georgia,serif; font-size:26px; font-weight:500; color:var(--cx-ink); line-height:1.1; }
    .cxd-hero { text-align:center; padding:14px 0 4px; }
    .cxd-hero__l { font-size:12px; color:var(--cx-mut); }
    .cxd-hero__v { font-family:'Cormorant Garamond',Georgia,serif; font-size:54px; font-weight:500; line-height:1.05; color:var(--cx-ink); }
    .cxd-hero__v.neg { color:var(--cx-neg); }
    .cxd-hero__s { font-size:12.5px; color:#6B5E4E; }
    .cxd-hero__s b { font-weight:500; color:var(--cx-ink); }
    .cxd-hero__t { font-size:11.5px; color:var(--cx-mut); margin-top:4px; }
    .cxd-open { display:block; width:100%; margin-top:8px; border:none; background:none; font-family:inherit; font-size:12.5px; color:#854F0B; cursor:pointer; text-align:center; }
    .cxd-open u { text-underline-offset:2px; }
    .cxd-bar { display:flex; height:34px; border-radius:8px; overflow:hidden; margin:8px 0 2px; background:var(--cx-line); }
    .cxd-bar span { display:flex; align-items:center; justify-content:center; font-size:10.5px; font-weight:500; color:#fff; white-space:nowrap; overflow:hidden; min-width:0; }
    .cxd-kalt { position:relative; height:16px; }
    .cxd-kalt i { position:absolute; top:4px; border-top:1.5px solid var(--cx-ink); }
    .cxd-kalt span { position:absolute; right:0; top:5px; font-size:10px; color:var(--cx-ink); }
    .cxd-leg { display:grid; grid-template-columns:1fr 1fr; gap:5px 10px; font-size:11.5px; color:#6B5E4E; margin-top:6px; }
    .cxd-leg i { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:5px; vertical-align:-1px; }
    .cxd-hint { display:block; width:100%; margin-top:8px; border:none; background:none; padding:0; font-family:inherit; font-size:11.5px; color:#854F0B; text-align:left; cursor:pointer; }
    .cxd-calcbtn { display:flex; width:100%; align-items:center; justify-content:space-between; margin-top:12px; padding:10px 0 0; border:none; border-top:.5px solid var(--cx-line); background:none; font-family:inherit; font-size:13px; color:var(--cx-ink); cursor:pointer; text-align:left; }
    .cxd-calcbtn small { display:block; font-size:11px; color:var(--cx-mut); }
    .cxd-calcbtn i { color:var(--cx-sub); }
    .cxd-tbl { margin-top:6px; }
    .cxd-tr { display:grid; grid-template-columns:1fr 76px 76px; align-items:center; column-gap:6px; }
    .cxd-tr > span:not(:first-child) { text-align:right; font-variant-numeric:tabular-nums; }
    .cxd-th { font-size:9.5px; font-weight:500; letter-spacing:.12em; color:var(--cx-mut); padding:8px 0 4px; }
    .cxd-st { padding:4px 0 4px 10px; font-size:12px; color:var(--cx-mut); }
    .cxd-res { padding:10px 0; border-top:.5px solid var(--cx-line); }
    .cxd-res > span:first-child { font-size:13.5px; font-weight:500; color:var(--cx-ink); }
    .cxd-res > span:first-child small { display:block; font-size:11px; font-weight:400; color:var(--cx-mut); }
    .cxd-res > span:not(:first-child) { font-family:'Cormorant Garamond',Georgia,serif; font-size:21px; font-weight:500; color:var(--cx-ink); }
    .cxd-fin { background:#F6FAF1; margin:2px -14px -10px; padding:11px 14px; border-top:1px solid #97C459; border-radius:0 0 12px 12px; }
    .cxd-fin > span:first-child { color:#27500A; }
    .cxd-tnote { font-size:11px; color:var(--cx-mut); margin-top:12px; line-height:1.45; }
    .cxd-pr { display:grid; grid-template-columns:128px 1fr 64px; align-items:center; gap:8px; width:100%; padding:7px 0; border:none; background:none; font-family:inherit; font-size:12.5px; color:var(--cx-ink); text-align:left; cursor:pointer; }
    .cxd-pr__n { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cxd-pr__v { text-align:right; font-weight:500; font-variant-numeric:tabular-nums; }
    .cxd-pr__v.neg { color:var(--cx-neg); }
    .cxd-track { height:10px; border-radius:5px; background:var(--cx-line); position:relative; overflow:hidden; }
    .cxd-track i { position:absolute; left:0; top:0; bottom:0; border-radius:5px; background:var(--cx-acc); }
    .cxd-track i.neg { background:#C0785A; }
    .cxd-pdet { padding:0 0 8px; border-bottom:.5px solid var(--cx-line); }
    .cxd-prow { display:flex; align-items:center; gap:10px; width:100%; padding:10px 0; border:none; border-top:.5px solid var(--cx-line); background:none; font-family:inherit; text-align:left; cursor:pointer; color:var(--cx-ink); }
    .cxd-prow:first-child { border-top:none; }
    .cxd-prow__l { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
    .cxd-prow__n { font-size:14px; font-weight:500; line-height:1.25; }
    .cxd-prow__s { font-size:11.5px; color:var(--cx-mut); }
    .cxd-prow__v { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:500; white-space:nowrap; }
    .cxd-prow__v.pos { color:#3B6D11; }
    .cxd-prow__v.neg { color:var(--cx-neg); }
    .cxd-prow__c { color:var(--cx-sub); font-size:14px; }
    .cx-nkset { margin-top:8px; padding-top:8px; border-top:.5px dashed var(--cx-line); }
    .cx-nkset__k { display:block; font-size:9.5px; font-weight:500; letter-spacing:.12em; text-transform:uppercase; color:#3E6E69; margin-bottom:5px; }
    .cx-nkset__v { font-size:12px; color:var(--cx-mut); }
    .cx-pill--nk { background:#E3EFEE; color:#3E6E69; border-color:#9CC5C0; }   /* Casa cost umgelegt in die NK-Abrechnung */
    .cx-ot-nk { display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:10px; border-radius:10px; border:0.5px solid var(--cx-rule); background:var(--cx-card); font-family:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    .cx-ot-nk.on { border:1px solid #9CC5C0; background:#EEF6F5; }
    .cx-ot-nk__sw { position:relative; width:38px; height:22px; flex-shrink:0; border-radius:11px; background:#D9D2C7; transition:background .15s; }
    .cx-ot-nk__sw::after { content:""; position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#fff; transition:transform .15s; }
    .cx-ot-nk.on .cx-ot-nk__sw { background:#3E6E69; }
    .cx-ot-nk.on .cx-ot-nk__sw::after { transform:translateX(16px); }
    .cx-ot-nk__t { display:flex; flex-direction:column; gap:2px; }
    .cx-ot-nk__t b { font-size:13px; font-weight:500; color:var(--cx-ink); }
    .cx-ot-nk.on .cx-ot-nk__t b { color:#2F5753; }
    .cx-ot-nk__t small { font-size:11px; color:var(--cx-mut); }
    /* buttons */
    .cx-btn { height:36px; padding:0 16px; border-radius:8px; font-family:inherit; font-size:11px; font-weight:500; letter-spacing:.07em;
              text-transform:uppercase; display:inline-flex; align-items:center; justify-content:center; gap:6px; cursor:pointer;
              border:.5px solid transparent; -webkit-tap-highlight-color:transparent; }
    .cx-btn--p { background:var(--cx-ink); color:var(--cx-card); border-color:var(--cx-ink); }
    .cx-btn--s { background:transparent; color:var(--cx-mut); border-color:var(--cx-rule); }
    .cx-btn--full { width:100%; }
    .cx-btn:disabled { opacity:.4; cursor:default; }
    .cx-link { background:none; border:none; font-family:inherit; font-size:11px; color:var(--cx-mut); padding:8px 4px; text-align:left; cursor:pointer; }
    /* summary + hero */
    .cx-sum { padding:14px 16px; }
    .cx-sum__v { display:flex; align-items:baseline; gap:6px; margin-top:6px; font-variant-numeric:tabular-nums; }
    .cx-sum__big { font-family:'Cormorant Garamond',Georgia,serif; font-size:28px; font-weight:400; color:var(--cx-ink); }   /* = .rp-summary__total */
    .cx-sum__of { font-size:12px; color:var(--cx-mut); }
    .cx-sum__hint { font-size:10.5px; color:var(--cx-mut); text-align:center; margin-top:8px; }
    .cx-bar { height:10px; border-radius:5px; background:#E3D5BF; overflow:hidden; }
    .cx-bar > div { height:100%; background:var(--cx-acc); border-radius:5px 0 0 5px; transition:width .25s; }
    .cx-bar > div.over { background:var(--cx-neg); border-radius:5px; }
    .cx-bar--thin { height:6px; margin:8px 0 12px; background:var(--cx-line); }
    .cx-hero { padding:16px; }
    .cx-hero__v { font-family:'Cormorant Garamond',Georgia,serif; font-size:46px; font-weight:400; line-height:1.1; text-align:center; margin-top:4px; color:var(--cx-ink);
                  font-variant-numeric:tabular-nums; white-space:nowrap; }
    .cx-hero__v.neg { color:var(--cx-neg); }
    .cx-hero__c { font-size:11px; color:var(--cx-mut); text-align:center; margin:4px 0 14px; }
    .cx-io { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:10px; }
    .cx-io__v { font-size:15px; font-weight:500; color:var(--cx-ink); margin-top:2px; font-variant-numeric:tabular-nums; }
    .cx-sw { display:inline-block; width:7px; height:7px; border-radius:2px; margin-right:5px; }
    .cx-sw--in { background:#E3D5BF; border:.5px solid #D4B896; } .cx-sw--out { background:var(--cx-acc); }
    .cx-stat { display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%; margin-top:14px; padding:12px 0 0;
               border:none; border-top:.5px solid var(--cx-line); background:none; font-family:inherit; font-size:12px; text-align:left; }
    button.cx-stat { cursor:pointer; }
    .cx-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:8px; vertical-align:0; }
    .cx-stat--open { color:#7A4A12; } .cx-stat--open .cx-dot { background:#E9B06A; }
    .cx-stat--ok { color:#55622A; }   .cx-stat--ok .cx-dot { background:#B9C28A; }
    .cx-stat--muted { color:var(--cx-mut); } .cx-stat--muted .cx-dot { background:var(--cx-rule); }
    .cx-stat__go { font-size:11px; font-weight:500; letter-spacing:.06em; text-transform:uppercase; white-space:nowrap; }
    /* property card */
    .cx-ph { width:100%; display:flex; justify-content:space-between; align-items:center; gap:10px; padding:14px 16px; background:none; border:none;
             font-family:inherit; text-align:left; cursor:pointer; color:inherit; -webkit-tap-highlight-color:transparent; }
    .cx-ph__l { display:flex; flex-direction:column; min-width:0; }
    .cx-ph__r { display:flex; align-items:center; gap:6px; flex-shrink:0; }
    .cx-ph__sum { font-size:12px; color:var(--cx-txt); font-variant-numeric:tabular-nums; white-space:nowrap; }
    .cx-pn { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:400; color:var(--cx-ink); line-height:1.1; }   /* = .apt-hdr__name */
    .cx-pn--s { font-size:19px; }
    .cx-src { font-size:12px; color:var(--cx-txt); margin-top:4px; }   /* = .apt-hdr__rent */
    .cx-src--empty { color:var(--cx-sub); font-style:italic; }
    .cx-chev { color:var(--cx-sub); font-size:14px; }
    .cx-cf { font-size:14px; font-weight:500; color:var(--cx-acc); white-space:nowrap; font-variant-numeric:tabular-nums; }
    .cx-cf.neg { color:var(--cx-neg); }
    .cx-det { padding:0 16px 12px; }
    .cx-kv { display:flex; justify-content:space-between; gap:10px; font-size:12px; padding:5px 0; border-top:.5px solid var(--cx-line); font-variant-numeric:tabular-nums; }
    .cx-kv span:first-child { color:var(--cx-mut); } .cx-kv span:last-child { color:var(--cx-txt); } .cx-kv--sub span { font-size:11px; color:var(--cx-sub) !important; }
    .cx-kv--open { color:#7A4A12; }
    .cx-year { padding:14px 16px; display:flex; justify-content:space-between; align-items:baseline; }
    .cx-year__v { font-family:'Cormorant Garamond',Georgia,serif; font-size:24px; font-weight:400; color:var(--cx-ink); font-variant-numeric:tabular-nums; }
    .cx-year__v.neg { color:var(--cx-neg); }
    /* Soll │ → │ Ist row */
    .cx-r { display:block; padding:10px 16px; border-top:.5px solid var(--cx-line); }
    .cx-r__l { min-width:0; }
    .cx-r__top { display:flex; justify-content:space-between; align-items:center; gap:8px; min-height:18px; }
    .cx-r__top .cx-r__u { min-width:0; }
    .cx-r__mid { display:grid; grid-template-columns:minmax(0,1fr) 112px; gap:8px; align-items:center; margin-top:4px; }
    .cx-soll { justify-self:start; display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 10px; border-radius:6px;
               border:.5px solid #D4B896; background:#F5EFE6; font-family:inherit; font-size:14px; font-weight:600; color:var(--cx-amt);
               font-variant-numeric:tabular-nums; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    .cx-soll i { font-size:13px; color:var(--cx-acc); }
    .cx-soll.on { background:#EEF0DD; border-color:#B9C28A; } .cx-soll.on i { color:#55622A; }
    .cx-r__info { font-size:10px; color:var(--cx-mut); margin-top:2px; }
    .cx-r--set { padding:10px 0; }
    .cx-r--set .cx-link { color:var(--cx-acc); font-weight:500; font-size:12px; padding:6px 0 2px; }
    .cx-set-grp { border-top:.5px solid var(--cx-rule); margin-top:6px; }
    .cx-set-per { display:flex; justify-content:space-between; gap:8px; padding:10px 0 4px; font-size:10.5px; color:var(--cx-mut); border-top:.5px solid var(--cx-line); }
    .cx-bulk { margin-top:2px; padding:10px 12px; border:.5px solid #E9B06A; background:#FAEEDA; border-radius:8px; font-size:12px; color:#7A4A12;
               display:flex; flex-direction:column; gap:8px; }
    .cx-bulk__s { color:var(--cx-mut); font-size:11px; }
    .cx-undo { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; font-size:12px; color:var(--cx-txt); }
    .cx-views { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .cx-r__u { font-size:11px; color:var(--cx-mut); }
    .cx-r__s { font-size:14px; font-weight:600; color:var(--cx-ink); font-variant-numeric:tabular-nums; margin-top:1px; }
    .cx-r__sub { font-size:10px; color:var(--cx-mut); margin-top:1px; }
    .cx-from { color:var(--cx-sub); }
    .cx-r__note { font-size:10px; color:var(--cx-acc); margin-top:2px; }
    .cx-r__warn { font-size:10px; color:#7A4A12; background:#FAEEDA; border:.5px solid #E9B06A; border-radius:6px; padding:3px 6px; margin-top:4px; line-height:1.35; }
    .cx-r__p { display:flex; justify-content:flex-end; gap:5px; flex-shrink:0; }
    .cx-take { width:30px; height:30px; border-radius:50%; border:.5px solid #D4B896; background:#F5EFE6; color:var(--cx-acc); padding:0;
               display:flex; align-items:center; justify-content:center; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    .cx-take.on { background:#EEF0DD; border-color:#B9C28A; color:#55622A; }
    .cx-take:disabled { opacity:.3; cursor:default; }
    .cx-f { display:flex; align-items:center; height:34px; box-sizing:border-box; padding:0 8px; border-radius:6px; border:1px solid var(--cx-rule); background:var(--cx-card); min-width:0; }
    .cx-f:focus-within { border-color:#B8956A; }
    html .cx-f input, html .cx-f select { flex:1; min-width:0; width:100%; height:100%; border:none !important; outline:none; background:transparent !important;
               padding:0 !important; margin:0; box-shadow:none !important; font-family:'Inter',system-ui,sans-serif; font-size:13px !important;
               font-weight:400; color:var(--cx-ink); text-align:right; font-variant-numeric:tabular-nums; -webkit-appearance:none; appearance:none; }
    html .cx-f--l input, html .cx-f--l select { text-align:left; }
    html .cx-f input::placeholder { color:#D6CBBB; }
    html .cx-f input.cc-cal { padding-right:24px !important; background-position:right 0 center !important; background-size:15px 15px !important; }
    .cx-f > span { font-size:11px; color:var(--cx-mut); margin-left:4px; }
    .cx-f > i { color:var(--cx-mut); font-size:13px; margin-left:4px; pointer-events:none; }
    .cx-f--s { width:120px; flex-shrink:0; }
    .cx-f--off { opacity:.6; }
    .cx-nd { display:flex; align-items:center; gap:8px; padding:10px 16px; border-top:.5px solid var(--cx-line); font-size:10.5px; color:var(--cx-mut); }
    /* Einmalig */
    .cx-form { display:flex; flex-direction:column; gap:8px; margin-top:12px; padding-top:12px; border-top:.5px solid var(--cx-line); }
    .cx-grid2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .cx-chips { display:flex; flex-wrap:wrap; gap:6px; }
    .cx-chip { height:30px; padding:0 12px; border-radius:15px; border:.5px solid var(--cx-rule); background:transparent; font-family:inherit;
               font-size:12px; color:var(--cx-mut); cursor:pointer; }
    .cx-chip.on { background:var(--cx-ink); border-color:var(--cx-ink); color:var(--cx-card); }
    .cx-seg { display:flex; border:.5px solid var(--cx-rule); border-radius:8px; overflow:hidden; height:34px; }
    .cx-seg--view { background:var(--cx-card); margin-bottom:2px; }
    .cx-davon { margin-top:10px; padding-top:6px; border-top:.5px solid var(--cx-line); }
    .cx-davon .cx-kv { border-top:none; padding:3px 0; }
    .cx-davon .cx-kv span:first-child { color:var(--cx-txt); }
    .cx-davon__h { color:var(--cx-mut); }
    .cx-davon__t { color:var(--cx-acc) !important; font-weight:500; }
    .cx-seg button { flex:1; border:none; background:transparent; font-family:inherit; font-size:12px; color:var(--cx-mut); cursor:pointer; }
    .cx-seg button.on { background:var(--cx-ink); color:var(--cx-card); }
    .cx-sug { display:grid; grid-template-columns:minmax(0,1fr) auto 30px; gap:8px; align-items:center; padding:12px 16px; }
    .cx-it { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; padding:12px 16px; }
    .cx-it__l { min-width:0; } .cx-it__t { font-size:13px; font-weight:500; color:var(--cx-ink); }
    .cx-it__p { margin-top:5px; }
    .cx-it__r { display:flex; align-items:center; gap:8px; flex-shrink:0; }
    .cx-amt { font-size:14px; font-weight:600; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .cx-amt.pos { color:var(--cx-acc); } .cx-amt.neg { color:var(--cx-neg); }
    .cx-del { width:30px; height:30px; border-radius:50%; border:.5px solid var(--cx-rule); background:transparent; color:var(--cx-mut); cursor:pointer;
              display:flex; align-items:center; justify-content:center; padding:0; }
    /* Setup */
    .cx-set { padding:0 16px 14px; display:flex; flex-direction:column; gap:6px; }
    .cx-set__row { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:4px; }
    .cx-set__k { font-size:11px; color:var(--cx-mut); }
    .cx-set__sub { font-size:9px; font-weight:500; letter-spacing:.14em; text-transform:uppercase; color:var(--cx-mut); margin-top:10px; padding-top:10px; border-top:.5px solid var(--cx-line); }
    .cx-mchips { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:3px; }
    .cx-mchip { height:28px; border-radius:6px; border:.5px solid var(--cx-rule); background:transparent; font-family:inherit; font-size:11px; color:var(--cx-mut); cursor:pointer; padding:0; }
    .cx-mchip.on { background:#F3EADC; border-color:#D4B896; color:var(--cx-acc); font-weight:600; }
    .cx-cat { padding:12px 16px; border-top:.5px solid var(--cx-line); display:flex; flex-direction:column; gap:6px; }
    .cx-cat:first-child { border-top:none; }
    .cx-hint { display:grid; grid-template-columns:minmax(0,1fr) 28px; gap:8px; align-items:start; margin-top:6px; padding-top:6px;
               border-top:.5px solid var(--cx-line); font-size:12px; color:var(--cx-txt); line-height:1.45; }
    .cx-x { width:28px; height:28px; border-radius:50%; border:.5px solid var(--cx-rule); background:transparent; color:var(--cx-mut);
            display:flex; align-items:center; justify-content:center; padding:0; cursor:pointer; font-size:13px; -webkit-tap-highlight-color:transparent; }
    .cx-hint-foot { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:0 4px; font-size:11px; color:var(--cx-mut); }
    .cx-hint-foot .cx-link { color:var(--cx-acc); font-weight:500; padding:4px 0; }
    .cx-abr { border-top:.5px solid var(--cx-rule); margin-top:2px; }
    .cx-abr-h { display:flex; justify-content:space-between; align-items:center; padding:10px 16px 0; }
    .cx-abr-h .cx-link { color:var(--cx-acc); font-weight:500; padding:4px 0; }
    .cx-abr--empty .cx-abr-h { padding-bottom:10px; }
    .cx-abr-form { margin:8px 16px 14px; }
    .cx-link--a { color:var(--cx-acc); font-weight:500; }
    .cx-link--in { display:inline; padding:0; font-size:10px; }
    /* One-off: same card and row pattern as Income / Expenses */
    .cx-ot-top { display:flex; justify-content:space-between; align-items:center; padding:8px 16px; border-top:.5px solid var(--cx-line); }
    .cx-ot-top .cx-link { color:var(--cx-acc); font-weight:500; font-size:12px; padding:4px 0; }
    .cx-ot-m { width:100%; display:flex; justify-content:space-between; align-items:center; padding:10px 16px 6px; background:#FAF7F2; border:none;
               border-top:.5px solid var(--cx-line); font-family:inherit; font-size:9px; font-weight:500; letter-spacing:.14em; text-transform:uppercase;
               color:var(--cx-mut); cursor:pointer; -webkit-tap-highlight-color:transparent; }
    .cx-ot-more { width:100%; padding:10px 16px; background:none; border:none; border-top:.5px solid var(--cx-line); font-family:inherit; font-size:12px;
                  font-weight:500; color:var(--cx-acc); cursor:pointer; text-align:center; }
    .cx-ot-ms { font-size:11px; letter-spacing:0; text-transform:none; font-weight:400; color:var(--cx-mut); font-variant-numeric:tabular-nums; }
    button.cx-ot-r { width:100%; background:none; border:none; border-top:.5px solid var(--cx-line); font-family:inherit; text-align:left; cursor:pointer;
                     color:inherit; -webkit-tap-highlight-color:transparent; }
    .cx-ot-r .cx-r__u { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .cx-ot-r .cx-r__s { margin-top:4px; }
    .cx-ot-r .cx-r__s.pos { color:var(--cx-acc); }
    .cx-ot-r .cx-chev { font-size:13px; }
    .cx-ot-edit { padding:0 16px 12px; border-top:.5px solid var(--cx-line); }
    .cx-ot-edit--top { border-top:none; }
    .cx-ot-edit--top .cx-form { margin-top:0; }
    .cx-sum .cx-form { margin-top:12px; }
    @keyframes cxFlash { from { background:#F3EADC; } to { background:transparent; } }
    .cx-ot-flash { animation:cxFlash 1.8s ease-out; }
    @media (prefers-reduced-motion: reduce) { .cx-ot-flash { animation:none; background:#F7F1E6; } }
    .cx-ot-tot { font-size:14px; font-weight:600; color:var(--cx-amt); font-variant-numeric:tabular-nums; white-space:nowrap; }
    .cx-ot-q { background:var(--cx-card); }
    .cx-ot-exp__go { display:flex; gap:8px; }
    .cx-ot-exp__go > .cx-btn { flex:1; }
    #cxOtList { display:flex; flex-direction:column; gap:8px; }   /* same card spacing as the other tabs */
    .cx-btn--del { color:var(--cx-neg); border-color:#D9957C; }
    .cx-ot-del { color:var(--cx-neg); align-self:center; padding:6px 0 0; }
    .cx-su-u { display:flex; flex-direction:column; gap:6px; padding:10px 0; border-top:.5px solid var(--cx-line); }
    .cx-set__sub + .cx-su-u { border-top:none; padding-top:2px; }
    .cx-su-n { font-size:13px; font-weight:500; color:var(--cx-ink); min-width:0; }
    .cx-su-a { display:flex; gap:14px; }
    .cx-su-a:empty { display:none; }
    .cx-su-a .cx-link { color:var(--cx-acc); font-weight:500; font-size:12px; padding:2px 0; }
`;
(function () {
  if (typeof document === 'undefined' || document.getElementById('cx-styles')) return;
  const s = document.createElement('style');
  s.id = 'cx-styles';
  s.textContent = _CX_CSS;
  (document.head || document.documentElement).appendChild(s);
})();

const CX = {
  month: (() => {
    try { const v = Number(localStorage.getItem('cx_month')); if (v >= 1 && v <= 12) return v; } catch (e) {}
    return new Date().getMonth() + 1;
  })(),
  open: {},            // fold state per card key
  tab: 'dashboard',
  area: null,          // null = Dashboard (everything) · 'rentals' · 'casa'
  sub: 'income',       // sub-tab inside Rentals / Casa Castel: income · expenses · onetime
};

/* Area filter (Rentals = all apartments · Casa Castel = the house) */
function cxAreaPid(pid) {
  if (!CX.area) return true;
  return CX.area === 'casa' ? Number(pid) === CASA_PROP_ID : Number(pid) !== CASA_PROP_ID;
}
const cxAreaOk = p => cxAreaPid(p.id);

const CX_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/* ── Money ── */
const cxR    = v => Math.round((Number(v) || 0) * 100) / 100;
const cxE2   = v => cxR(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cxEur  = v => cxE2(v) + '\u202f€';
const cxW    = v => { const n = Math.round(Number(v) || 0); return (n < 0 ? '\u2212\u202f' : '') + Math.abs(n).toLocaleString('de-DE') + '\u202f€'; };
const cxWS   = v => { const n = Math.round(Number(v) || 0); return (n < 0 ? '\u2212\u202f' : n > 0 ? '+\u202f' : '') + Math.abs(n).toLocaleString('de-DE') + '\u202f€'; };
const cxEsc  = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function cxParse(s) {
  if (typeof ccParseEUR === 'function') { const n = ccParseEUR(s); return (n === null || n === undefined || isNaN(n)) ? null : n; }
  s = String(s ?? '').replace(/[€\s\u202f]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) ? n : null;
}
function cxToday() {
  if (typeof ccTodayISO === 'function') return ccTodayISO();
  const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const cxFmtDate = iso => { const s = String(iso || '').slice(0, 10); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; };

/* ── Pills: one colour = one meaning ── */
const cxPill = (cls, text) => '<span class="cx-pill cx-pill--' + cls + '">' + cxEsc(text) + '</span>';
function cxStatus(soll, ist, emptyText) {
  if (!soll && (ist === null || ist === undefined)) return ['grey', emptyText || 'empty'];
  if (ist === null || ist === undefined) return ['open', 'open'];
  const d = cxR(ist - soll);
  if (!d) return ['ok', 'paid'];
  return ['diff', (d < 0 ? '\u2212 ' : '+ ') + cxEur(Math.abs(d)) + (d < 0 ? ' less' : ' more')];
}
function cxGroupStatus(rows) {
  const act = rows.filter(r => r.soll || (r.ist !== null && r.ist !== undefined));
  const open = act.filter(r => r.ist === null || r.ist === undefined).length;
  const diff = act.some(r => r.ist !== null && r.ist !== undefined && cxR(r.ist - r.soll) !== 0);
  if (diff) return ['diff', 'difference'];
  if (open) return ['open', open + ' open'];
  return act.length ? ['ok', 'done'] : ['grey', 'empty'];
}

/* ── Month selector (same on every tab) ── */
function cxMonthBar() {
  const today = cxFmtDate(cxToday());
  return '<div class="cx-month">' +
    '<button class="cx-arw" data-cx="prev" aria-label="Previous month"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<div class="cx-month__t"><div class="cx-month__m">' + CX_MONTHS[CX.month - 1] + ' ' + window._ctrl.year + '</div>' +
    '<div class="cx-month__s">As of ' + today + '</div></div>' +
    '<button class="cx-arw" data-cx="next" aria-label="Next month"><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
}
async function cxStepMonth(delta) {
  let m = CX.month + delta, y = window._ctrl.year;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  CX.month = m; CX.open = {}; CX.undo = null; CX.bulk = null;
  try { localStorage.setItem('cx_month', String(m)); } catch (e) {}
  if (y !== window._ctrl.year) {
    if (typeof ctlShowLoading === 'function') ctlShowLoading(true);
    try { await ctlLoadAll(y); } catch (e) { cxToastErr(e); }
    if (typeof ctlShowLoading === 'function') ctlShowLoading(false);
  }
  cxRenderActive();
}
function cxRenderActive() {
  const f = { dashboard: 'renderDashboard', income: 'renderIncome', expenses: 'renderExpenses', onetime: 'renderOneTime', setup: 'renderSetup' }[CX.tab];
  if (f && typeof window[f] === 'function') window[f]();
}
function cxGoto(tab) { if (typeof switchTab === 'function') switchTab(tab); }

/* ── Summary card (Einnahmen / Ausgaben) ──
   #6: "Alle offenen wie geplant" asks first (count, sum, rows skipped for a data check)
   and offers "Rückgängig" afterwards. o.confirm = { n, sum, skipped } · o.undo = { n }        */
function cxSummary(o) {
  const pct = o.plan ? Math.min(100, o.done / o.plan * 100) : 0;
  const canBulk = (o.bulk !== undefined ? o.bulk : o.open) > 0;
  const undo = o.undo ? '<div class="cx-undo"><span>' + o.undo.n + (o.undo.n === 1 ? ' item' : ' items') + ' booked as planned</span>' +
    '<button class="cx-link" data-cx="undo" style="padding:4px 0;color:var(--cx-acc);font-weight:500">Undo</button></div>' : '';
  const action = o.confirm
    ? '<div class="cx-bulk"><div>' + 'Book ' + o.confirm.n + (o.confirm.n === 1 ? ' item' : ' items') + ' as planned · ' + cxEur(o.confirm.sum) +
        (o.confirm.skipped ? '<div class="cx-bulk__s">' + o.confirm.skipped + ' skipped because of a check – please enter one by one</div>' : '') + '</div>' +
        '<div class="cx-grid2"><button class="cx-btn cx-btn--s" data-cx="allNo">Cancel</button>' +
        '<button class="cx-btn cx-btn--p" data-cx="allYes"' + (o.confirm.n ? '' : ' disabled') + '>Book</button></div></div>'
    : '<button class="cx-btn cx-btn--s cx-btn--full" data-cx="all"' + (canBulk ? '' : ' disabled') + '><i class="ti ti-checks" aria-hidden="true"></i>Book all open as planned</button>';
  return '<div class="cx-card cx-sum">' +
    '<div class="cx-row-sb"><span class="cx-lbl">' + cxEsc(o.label) + '</span>' + (o.open ? cxPill('open', o.open + ' open') : cxPill('ok', 'all done')) + '</div>' +
    '<div class="cx-sum__v"><span class="cx-sum__big">' + cxW(o.done) + '</span><span class="cx-sum__of">of ' + cxW(o.plan) + ' planned</span></div>' +
    '<div class="cx-bar cx-bar--thin"><div style="width:' + pct + '%"></div></div>' +
    (o.split || '') +                                       // e.g. Kalt / NK / Warm table (Income)
    undo + action + (o.note ? '<div class="cx-sum__hint">' + o.note + '</div>' : '') +
    (o.partial && !o.confirm ? '<div class="cx-sum__hint">' + (o.partial === 1 ? '1 partial month' : o.partial + ' partial months') + ' · please confirm one by one</div>' : '') +
  '</div>';
}
/* Pending undo for this tab and month? */
function cxUndoFor(tab) {
  const u = CX.undo;
  return u && u.tab === tab && u.y === window._ctrl.year && u.m === CX.month ? u : null;
}

/* ── Property card with fold-up ── */
function cxCard(o) {
  const g = o.status;
  const isOpen = CX.open[o.key] !== undefined ? CX.open[o.key]
    : (o.defaultOpen !== undefined ? o.defaultOpen : !!g && (g[0] === 'open' || g[0] === 'diff'));   // only what needs you
  return '<div class="cx-card">' +
    '<button class="cx-ph" data-cx="fold" data-k="' + cxEsc(o.key) + '" aria-expanded="' + isOpen + '">' +
      '<span class="cx-ph__l"><span class="cx-pn">' + cxEsc(o.title) + '</span><span class="cx-src">' +
        cxEsc([o.sub || '', o.sum !== undefined ? 'done ' + cxW(o.sum) + (o.plan ? ' of ' + cxW(o.plan) : '') : ''].filter(Boolean).join(' · ')) + '</span></span>' +
      '<span class="cx-ph__r">' + (o.extraPill || '') +
        (g ? cxPill(g[0], g[1]) : '') + '<i class="ti ti-chevron-' + (isOpen ? 'up' : 'down') + ' cx-chev" aria-hidden="true"></i></span>' +
    '</button>' + (isOpen ? o.body : '') + '</div>';
}

/* ── Soll │ Ist row (#19) ──
   line 1: label · pills + status      line 2: Soll (tap = take over) │ Ist field
   then sub line, change notes, info (grey) and data checks                                  */
function cxRow(o) {
  const s = cxStatus(o.soll, o.ist, o.emptyText);
  const can = !!o.soll || (o.ist !== null && o.ist !== undefined);
  const took = o.ist !== null && o.ist !== undefined && o.soll && cxR(o.ist - o.soll) === 0;
  const soll = o.soll
    ? '<button class="cx-soll' + (took ? ' on' : '') + '" data-cx="take" data-id="' + cxEsc(o.id) + '" aria-label="Take Soll: ' + cxEsc(cxEur(o.soll)) + '">' +
        '<span>' + cxEur(o.soll) + '</span><i class="ti ti-' + (took ? 'check' : 'arrow-right') + '" aria-hidden="true"></i></button>'
    : '<span class="cx-r__s">\u2014</span>';
  return '<div class="cx-r">' +
    '<div class="cx-r__top"><span class="cx-r__u">' + cxEsc(o.label) + (o.badge ? ' ' + cxPill('beige', o.badge) : '') + '</span>' +
      '<span class="cx-r__p">' + (o.pills || '') + cxPill(s[0], s[1]) + '</span></div>' +
    '<div class="cx-r__mid">' + soll +
      '<label class="cx-f' + (can || o.allowEmpty ? '' : ' cx-f--off') + '"><input type="text" inputmode="decimal" data-cx-in="' + cxEsc(o.id) + '" value="' + (o.ist === null || o.ist === undefined ? '' : cxE2(o.ist)) + '" placeholder="' + (o.soll || o.allowEmpty ? 'Amount' : '\u2014') + '"' + (o.soll || o.allowEmpty || can ? '' : ' disabled') + ' aria-label="Ist amount ' + cxEsc(o.label) + '"><span>€</span></label>' +
    '</div>' +
    (o.sub ? '<div class="cx-r__sub">' + o.sub + '</div>' : '') +
    (o.notes || []).map(n => '<div class="cx-r__note"><i class="ti ti-arrow-up-right" aria-hidden="true"></i> ' + cxEsc(n) + '</div>').join('') +
    (o.info ? '<div class="cx-r__info">' + cxEsc(o.info) + '</div>' : '') +
    (o.warn ? '<div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ' + cxEsc(o.warn) + '</div>' : '') +
  '</div>';
}
function cxNotDue(list) {
  if (!list || !list.length) return '';
  return '<div class="cx-nd">' + cxPill('grey', 'not due') + '<span>' + list.map(n => cxEsc(n.label) + (n.next ? ' · next in ' + n.next : '')).join(' · ') + '</span></div>';
}

/* ── Toasts ── */
function cxToastErr(e) {
  console.error('[controlling]', e);
  // Short reason in the message, so a problem can be named from a screenshot
  const why = String((e && (e.message || e.details)) || e || '').replace(/\s+/g, ' ').slice(0, 70);
  if (typeof ctlToast === 'function') ctlToast('Saving failed – please try again' + (why ? ' · ' + why : ''));
}

/* ── Wire a tab host once: month arrows, fold, take-over, inputs ── */
function cxWire(host, h) {
  if (host._cxWired) return;
  host._cxWired = true;
  host.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-cx]');
    if (!b || b.disabled) return;
    const a = b.dataset.cx;
    if (a === 'prev') return cxStepMonth(-1);
    if (a === 'next') return cxStepMonth(1);
    if (a === 'fold') { const k = b.dataset.k; const cur = b.getAttribute('aria-expanded') === 'true'; CX.open[k] = !cur; return h.render(); }
    if (h.click) return h.click(a, b, ev);
  });
  host.addEventListener('change', ev => {
    const id = ev.target && ev.target.dataset && ev.target.dataset.cxIn;
    if (id && h.input) h.input(id, cxParse(ev.target.value), ev.target);
  });
  host.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target && ev.target.dataset && ev.target.dataset.cxIn) ev.target.blur();
  });
}
