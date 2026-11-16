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
    /* Nov 2026 (CP1): money to you green, money from you red — the Settlements tokens */
    :root { --cx-in:#16801F; --cx-in-s:#11691A; --cx-in-bg:#DDEFD3; --cx-out:#C42B14; --cx-out-s:#A3230E; --cx-out-bg:#F9DCD3; }
    .cx-m--in { color:var(--cx-in); font-weight:700; } .cx-m--out { color:var(--cx-out); font-weight:700; }
    .cx-ot-mt__kv .cx-m--in { color:var(--cx-in); } .cx-ot-mt__kv .cx-m--out { color:var(--cx-out); }   /* beats maint-link's ".cx-ot-mt__kv span" */
    .cx-pill--in  { background:var(--cx-in-bg); color:var(--cx-in-s); border-color:#9AC87A; }
    .cx-pill--out { background:var(--cx-out-bg); color:var(--cx-out-s); border-color:#E7A797; }
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
    .cx-pill--open  { background:#FDF0D8; color:#633806; border-color:#E8C97A; }
    .cx-pill--ok    { background:#EAF3DE; color:#27500A; border-color:#9AC87A; }
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
    .cx-sum__big { font-family:'Cormorant Garamond',Georgia,serif; font-size:28px; font-weight:600; color:var(--cx-ink); }   /* CP1: bold, signed, green in / red out */
    .cx-sum__big .cx-m--in, .cx-sum__big .cx-m--out { font-weight:600; }
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
    .cx-stat--open { color:#633806; } .cx-stat--open .cx-dot { background:#E8C97A; }
    .cx-stat--ok { color:#27500A; }   .cx-stat--ok .cx-dot { background:#9AC87A; }
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
    .cx-kv--open { color:#633806; }
    .cx-year { padding:14px 16px; display:flex; justify-content:space-between; align-items:baseline; }
    .cx-year__v { font-family:'Cormorant Garamond',Georgia,serif; font-size:24px; font-weight:400; color:var(--cx-ink); font-variant-numeric:tabular-nums; }
    .cx-year__v.neg { color:var(--cx-neg); }
    /* Soll │ → │ Ist row */
    .cx-r { display:block; padding:10px 16px; border-top:.5px solid var(--cx-line); }
    .cx-r__l { min-width:0; }
    .cx-r__top { display:flex; justify-content:space-between; align-items:center; gap:8px; min-height:18px; }
    .cx-r__top .cx-r__u { min-width:0; }
    .cx-r__mid { display:grid; grid-template-columns:auto minmax(0,1fr) 112px; gap:8px; align-items:center; margin-top:4px; }   /* D1: Soll │ difference │ Ist */
    .cx-soll { justify-self:start; display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 10px; border-radius:6px;
               border:.5px solid #D4B896; background:#F5EFE6; font-family:inherit; font-size:14px; font-weight:600; color:var(--cx-amt);
               font-variant-numeric:tabular-nums; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    .cx-soll i { font-size:13px; color:var(--cx-acc); }
    .cx-soll.on { background:#EAF3DE; border-color:#9AC87A; } .cx-soll.on i { color:#27500A; }
    .cx-r__info { font-size:12px; color:#6E6357; margin-top:2px; }
    .cx-r--set { padding:10px 0; }
    .cx-r--set .cx-link { color:var(--cx-acc); font-weight:500; font-size:12px; padding:6px 0 2px; }
    .cx-set-grp { border-top:.5px solid var(--cx-rule); margin-top:6px; }
    .cx-set-per { display:flex; justify-content:space-between; gap:8px; padding:10px 0 4px; font-size:10.5px; color:var(--cx-mut); border-top:.5px solid var(--cx-line); }
    .cx-bulk { margin-top:2px; padding:10px 12px; border:.5px solid #E8C97A; background:#FDF0D8; border-radius:8px; font-size:12px; color:#633806;
               display:flex; flex-direction:column; gap:8px; }
    .cx-bulk__s { color:var(--cx-mut); font-size:11px; }
    .cx-undo { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; font-size:12px; color:var(--cx-txt); }
    .cx-views { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .cx-r__u { font-size:13px; color:#5F5649; }   /* CP1: 13 px · 7.0:1 (was 11 px #9A8E7E · 3.1:1) */
    .cx-r__s { font-size:14px; font-weight:600; color:var(--cx-ink); font-variant-numeric:tabular-nums; margin-top:1px; }
    .cx-r__sub { font-size:12px; color:#6E6357; margin-top:1px; }   /* CP1: 12 px · 5.7:1 (was 10 px · 3.1:1) */
    .cx-from { color:#786D60; }   /* CP1: the source stays a shade lighter, but readable (4.9:1) */
    .cx-r__note { font-size:12px; color:var(--cx-acc); margin-top:2px; }
    .cx-r__warn { font-size:10px; color:#633806; background:#FDF0D8; border:.5px solid #E8C97A; border-radius:6px; padding:3px 6px; margin-top:4px; line-height:1.35; }
    .cx-r__p { display:flex; justify-content:flex-end; gap:5px; flex-shrink:0; }
    .cx-take { width:30px; height:30px; border-radius:50%; border:.5px solid #D4B896; background:#F5EFE6; color:var(--cx-acc); padding:0;
               display:flex; align-items:center; justify-content:center; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    .cx-take.on { background:#EAF3DE; border-color:#9AC87A; color:#27500A; }
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
    .cx-nd { display:flex; align-items:center; gap:8px; padding:10px 16px; border-top:.5px solid var(--cx-line); font-size:12px; color:#6E6357; }   /* CP1: as the sub lines */
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
    .cx-mchips { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:4px; }   /* CP1: Jan … Dec, 6 × 2 on the phone */
    @media (min-width:600px) { .cx-mchips { grid-template-columns:repeat(12,minmax(0,1fr)); gap:3px; } }
    .cx-mchip { height:30px; border-radius:6px; border:.5px solid var(--cx-rule); background:transparent; font-family:inherit; font-size:12px; color:#6E6357; cursor:pointer; padding:0; }
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
    .cx-ot-r .cx-r__s.pos { color:var(--cx-in); font-weight:700; }
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
    /* CP2 (#10) · D1 (16.11.2026): a difference says in words what happened — costs "more" / "less", income "missing" / "extra" —
       between Soll and Ist: red when it costs you, green when it is good for you, also after it was agreed.
       "Agreed" is the row's own green status: "✓ Agree" on the sub line (one tap); a tap on the green status → reason · Undo */
    .cx-ph__st { display:flex; align-items:center; gap:4px 6px; }
    .cx-ph__w { display:flex; flex-direction:column; align-items:flex-end; }
    .cx-ph__v { display:flex; align-items:center; gap:6px; }
    .cx-ph__gh { display:none; }
    @media (max-width:599px) { .cx-ph__st { flex-direction:column; align-items:flex-end; }   /* "1 open" over "1 to check" on the phone */
      /* the pills as they were before a mark and the widest while typing, invisible and 0 px high: the status keeps its width,
         so the title never re-wraps */
      .cx-ph__gh { display:flex; align-items:center; gap:6px; height:0; overflow:hidden; visibility:hidden; } }
    /* the header's "done … of …" (Income, Expenses) is one piece, as wide as the widest sum it can show (an invisible copy,
       0 px high): booking never re-wraps it. The whole line again, invisible, keeps its height on a phone so narrow that the
       piece has to wrap inside — the card never moves */
    .cx-src--d { display:grid; } .cx-src--d > * { grid-area:1/1; min-width:0; }
    .cx-src__d { display:inline-block; max-width:100%; }
    .cx-src__d::before { content:attr(data-w); display:block; height:0; overflow:hidden; visibility:hidden; }
    .cx-src__g { visibility:hidden; font-style:normal; } .cx-src__g::before { content:attr(data-p); }
    .cx-src__g > b { display:inline-block; max-width:100%; font-weight:inherit; } .cx-src__g > b::before { content:attr(data-w); }
    button.cx-pill { font-family:inherit; margin:0; cursor:pointer; -webkit-appearance:none; appearance:none; -webkit-tap-highlight-color:transparent; }
    /* the green status of an agreed row is a button: 24 px+ to tap, drawn as the pill (the extra reaches into the row's gaps) */
    .cx-pill-tap { position:relative; } .cx-pill-tap::after { content:''; position:absolute; left:-4px; right:-4px; top:-3px; bottom:-3px; }
    /* the ✓ of a status or of Agree is one em high whatever font draws it: a pill with ✓ is exactly as high as one without */
    .cx-ck { display:inline-block; height:1em; line-height:1; }
    /* the difference between Soll and Ist: right-aligned, may wrap once — only at the space before its word (two 16 px lines
       stay inside the 34 px Ist field, so the row keeps its height) */
    .cx-dm { justify-self:end; text-align:right; font-size:12.5px; font-weight:700; line-height:16px; }
    .cx-dm--tn { font-variant-numeric:tabular-nums; }   /* even digits as the Soll ("0,01 €", not "0,01€") — not for 100.000 € and more, which then still fit at 375 px */
    .cx-dm--out { color:var(--cx-out); } .cx-dm--in { color:var(--cx-in); }
    .cx-dm__a { white-space:nowrap; }
    .cx-vh { position:absolute; width:1px; height:1px; margin:-1px; padding:0; border:0; overflow:hidden; clip:rect(0 0 0 0); clip-path:inset(50%); white-space:nowrap; }   /* read aloud, not shown */
    /* the row's pills: as wide as the widest state they can take (the copies are invisible and 0 px high) */
    .cx-r__st { display:flex; flex-direction:column; align-items:flex-end; }
    .cx-r__pv { display:flex; justify-content:flex-end; gap:5px; }
    .cx-r__gh { display:flex; flex-direction:column; align-items:flex-end; height:0; overflow:hidden; visibility:hidden; }
    .cx-r__sub--dif { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .cx-r__sub--dif > span { min-width:0; }
    /* 24 px to tap, drawn as a 20 px pill; its last 4 px reach into the row padding (margin −4 px), so the sub line stays 19.8 px:
       a row with a difference is exactly as high as without one — nothing below moves */
    .cx-dif { position:relative; z-index:0; flex-shrink:0; width:88px; height:24px; margin:-.5px 0 -4px; padding:0 0 4px; border:0; background:transparent; font-family:inherit;
              font-size:11.5px; line-height:1; color:#6E6357; white-space:nowrap; cursor:pointer; -webkit-tap-highlight-color:transparent; }   /* one width: Agree · kept free */
    .cx-dif::before { content:''; position:absolute; z-index:-1; left:0; right:0; top:0; height:20px; box-sizing:border-box; border:.5px solid #D9D1C4; border-radius:10px; }
    .cx-dif:focus-visible { outline:none; } .cx-dif:focus-visible::before { outline:2px solid var(--cx-acc); outline-offset:1px; }
    .cx-dif--ph { visibility:hidden; }
    .cx-dif--agree { color:#27500A; font-weight:600; } .cx-dif--agree::before { border:1px solid #9AC87A; background:var(--cx-card); }   /* green: "done" */
    .cx-dif:disabled { cursor:default; opacity:.5; }
    /* month summary: "2 differences · 1 agreed" and its pill — 20 px with the pill or without (+ 8 px margin): the row you typed in is kept in place exactly */
    .cx-sum__dif { display:flex; justify-content:space-between; align-items:center; gap:8px; min-height:20px; line-height:17px; font-size:12.5px; color:var(--cx-txt); text-align:left; }
    .cx-dif-sh { margin-top:8px; padding:10px 12px; border-radius:10px; background:var(--cx-bg); display:flex; flex-direction:column; gap:8px; }
    .cx-dif-sh .cx-chip { height:32px; padding:0 12px; border-radius:16px; color:var(--cx-txt); background:var(--cx-card); }
    .cx-dif-sh .cx-chip.on { color:var(--cx-card); background:var(--cx-ink); border-color:var(--cx-ink); }
    .cx-dif-x { align-self:flex-start; height:32px; padding:0; border:0; background:none; font-family:inherit; font-size:12px; font-weight:600; color:#8A6535;
                text-decoration:underline; text-underline-offset:2px; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    .cx-dif-sh button:disabled { cursor:default; opacity:.5; }
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
  dif: null,           // CP2 · D1: the agreed row whose reason panel is open ({ id, pick }) — one at a time
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
/* CP1: a signed amount for money that moves — v > 0 in (green "+ 100 €"), v < 0 out (red "− 80 €"), 0 plain.
   fmt = cxW (whole euros, default) or cxEur (cents) */
function cxIO(v, fmt) {
  const f = fmt || cxW, n = cxR(v);
  if (!(f === cxW ? Math.round(n) : n)) return f(0);
  return '<span class="cx-m cx-m--' + (n > 0 ? 'in' : 'out') + '">' + (n > 0 ? '+' : '\u2212') + '\u202f' + f(Math.abs(n)) + '</span>';
}
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
// D1: a status starting with "✓ " draws its ✓ one em high (whatever font has it: the pill keeps its height), not read aloud
const _cxPillTxt = t => { const s = String(t ?? ''); return s.startsWith('\u2713 ') ? '<span class="cx-ck" aria-hidden="true">\u2713</span> ' + cxEsc(s.slice(2)) : cxEsc(s); };
const cxPill = (cls, text) => '<span class="cx-pill cx-pill--' + cls + '">' + _cxPillTxt(text) + '</span>';

/* \u2500\u2500 CP2 (#10) \u00b7 D1 (16.11.2026): differences \u00b7 "Agreed" \u2500\u2500
   cxDiff = Ist \u2212 Soll (0 within half a cent). dir = whose money: +1 Income, \u22121 costs.
   The difference itself is drawn between Soll and Ist in words (cxRow): costs "more" / "less", income "missing" / "extra",
   red when it is less money for you, green when it is more. The status is only the state: open \u00b7 \u2713 Paid \u00b7 To check \u00b7
   \u2713 Agreed (or the reason's word). A mark { ok, reason } (controlling-data.js) = agreed: the row counts as done. */
const CX_DIFF_IN  = [['agreed', 'Agreed'], ['reduction', 'Rent reduction'], ['kaution', 'Kaution'], ['later', 'Pays later'], ['other', 'Other']];
const CX_DIFF_OUT = [['agreed', 'Agreed'], ['reduction', 'Reduction'], ['later', 'Paid later'], ['other', 'Other']];
function cxDiff(soll, ist) {
  if (ist === null || ist === undefined) return 0;
  const d = cxR(Number(ist) - (Number(soll) || 0));
  return Math.abs(d) < 0.005 ? 0 : d;
}
const cxMarked = r => !!(r && r.mark && r.mark.ok);
const cxUnmarked = r => cxMarked(r) ? Object.assign({}, r, { mark: null }) : r;
/* the word of an agreed mark: its reason as the chip says it (costs "Paid later", income "Pays later" \u2026) \u00b7 no reason = "Agreed" */
function cxMarkText(dir, mark) {
  const r = mark && mark.reason, find = l => l.find(x => x[0] === r);
  const hit = r ? find(dir === -1 ? CX_DIFF_OUT : CX_DIFF_IN) || find(CX_DIFF_IN) || find(CX_DIFF_OUT) : null;
  return hit ? hit[1] : 'Agreed';
}
function cxStatus(soll, ist, emptyText, dir, mark) {
  if (!soll && (ist === null || ist === undefined)) return ['grey', emptyText || 'empty'];
  if (ist === null || ist === undefined) return ['open', 'open'];
  if (!cxDiff(soll, ist)) return ['ok', '\u2713 Paid'];
  if (mark && mark.ok) return ['ok', '\u2713 ' + cxMarkText(dir, mark)];   // agreed: green, done
  return ['open', 'To check'];                                          // amber: needs you
}
/* Card header: what still needs you \u2014 open rows AND differences not agreed, side by side ("1 open" "1 to check");
   every row with a Soll or an Ist paid or agreed \u2192 "\u2713 Done" (the card can be closed although Soll and Ist differ) */
function cxGroupStatus(rows, dir) {
  const has = v => v !== null && v !== undefined;
  const act = rows.filter(r => r.soll || has(r.ist));
  const open = act.filter(r => !has(r.ist)).length;
  const check = act.filter(r => cxDiff(r.soll, r.ist) && !cxMarked(r)).length, out = [];
  if (open) out.push(['open', open + ' open']);
  if (check) out.push(['open', check + ' to check']);
  const st = out.length === 1 ? out[0] : out.length ? out : act.length ? ['ok', '\u2713 Done'] : ['grey', 'empty'];
  st.most = rows.length;                                   // D1: no count can grow above it (cxCard keeps that width)
  return st;
}
/* Month summary: all differences, how many of them are agreed, and the rows still open (for "\u2713 Done") */
function cxDiffCount(rows) {
  let n = 0, ok = 0, open = 0;
  for (const r of rows) {
    if (r.soll && (r.ist === null || r.ist === undefined)) open++;
    if (!cxDiff(r.soll, r.ist)) continue;
    n++; if (cxMarked(r)) ok++;
  }
  return { n, ok, open };
}
function cxDiffLine(c) {
  if (!c || !c.n) return '';
  const t = c.n + (c.n === 1 ? ' difference' : ' differences');
  return c.ok ? t + ' \u00b7 ' + (c.ok === c.n ? (c.n === 1 ? 'agreed' : 'all agreed') : c.ok + ' agreed') : t;
}
/* C6: marks on their way (row id | year | month) \u2014 its Agree, reasons and Undo stay off until it is saved, also across drawings */
const _cxDifRun = new Set();
const cxDifBusy = id => _cxDifRun.has(id + '|' + window._ctrl.year + '|' + CX.month);
/* D1: a reason panel that closes moves the rows below it up. The second tap of a double tap would land on whatever
   moved under the finger (a Soll taken over, the next row booked, a card folded), so for one second a tap on the same
   spot does nothing. A tap anywhere else works at once; keyboard (Enter / Space) is not affected. */
let _cxQuiet = null;                                     // { until, x, y } — where the tap that closed a panel landed
const _cxNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
/* Is the month after the current one? (nothing is due yet) */
function cxFuture(y, m) {
  const t = cxToday(), cy = Number(t.slice(0, 4)), cm = Number(t.slice(5, 7));
  return y * 12 + m > cy * 12 + cm;
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
  if (y !== window._ctrl.year) {                          // C1 #17: the other year loads first — if it fails, you stay where you were
    if (typeof ctlShowLoading === 'function') ctlShowLoading(true);
    let ok = true;
    try { await ctlLoadAll(y); } catch (e) { ok = false; cxToastLoad(y, e); }
    if (typeof ctlShowLoading === 'function') ctlShowLoading(false);
    if (!ok) return;
  }
  CX.month = m; CX.open = {}; CX.undo = null; CX.bulk = null; CX.dif = null;
  try { localStorage.setItem('cx_month', String(m)); } catch (e) {}
  cxRenderActive();
}
function cxRenderActive() {
  const f = { dashboard: 'renderDashboard', income: 'renderIncome', expenses: 'renderExpenses', onetime: 'renderOneTime', setup: 'renderSetup' }[CX.tab];
  if (f && typeof window[f] === 'function') window[f]();
}
/* C6: a save that ends after you left its screen does not draw that hidden screen and leaves CX.tab with the screen you
   are on (the month arrows drew the hidden one, and the next amount went into another month). The screen you are on is
   drawn again with the new figures — not while you fill in something there (Setup: once you leave the field,
   _cxSU.due · One-off: an open form keeps what you typed). Returns true when host is not on screen. */
function cxOffScreen(host) {
  if (!host || host.style.display !== 'none') return false;
  const on = document.getElementById('tab-' + CX.tab);
  if (!on || on === host || on.style.display === 'none') return true;
  if (CX.tab === 'onetime' && typeof _cxOt !== 'undefined' && (_cxOt.form !== null || _cxOt.bonus)) return true;
  if (typeof _cxFilling === 'function' && _cxFilling(on)) { if (CX.tab === 'setup' && typeof _cxSU !== 'undefined') _cxSU.due = true; return true; }
  cxRenderActive();
  return true;
}
function cxGoto(tab) { if (typeof switchTab === 'function') switchTab(tab); }

/* ── Summary card (Einnahmen / Ausgaben) ──
   #6: "Alle offenen wie geplant" asks first (count, sum, rows skipped for a data check)
   and offers "Rückgängig" afterwards. o.confirm = { n, sum, skipped } · o.undo = { n }        */
function cxSummary(o) {
  const pct = o.plan ? Math.min(100, o.done / o.plan * 100) : 0;
  const canBulk = (o.bulk !== undefined ? o.bulk : o.open) > 0;
  // CP2 (#4): a month after the current one — nothing is due yet, so no "Book all" (single rows stay editable)
  const bulkBtn = o.future ? '<div class="cx-sum__hint">Not due yet \u00b7 enter amounts one by one</div>'
    : '<button class="cx-btn cx-btn--s cx-btn--full" data-cx="all"' + (canBulk ? '' : ' disabled') + '><i class="ti ti-checks" aria-hidden="true"></i>Book all open as planned</button>';
  const undo = o.undo ? '<div class="cx-undo"><span>' + o.undo.n + (o.undo.n === 1 ? ' item' : ' items') + ' booked as planned</span>' +
    '<button class="cx-link" data-cx="undo" style="padding:4px 0;color:var(--cx-acc);font-weight:500">Undo</button></div>' : '';
  const action = o.confirm && !o.future
    ? '<div class="cx-bulk"><div>' + 'Book ' + o.confirm.n + (o.confirm.n === 1 ? ' item' : ' items') + ' as planned · ' + cxEur(o.confirm.sum) +
        (o.confirm.skipped ? '<div class="cx-bulk__s">' + o.confirm.skipped + ' skipped because of a check – please enter one by one</div>' : '') + '</div>' +
        '<div class="cx-grid2"><button class="cx-btn cx-btn--s" data-cx="allNo">Cancel</button>' +
        '<button class="cx-btn cx-btn--p" data-cx="allYes"' + (o.confirm.n ? '' : ' disabled') + '>Book</button></div></div>'
    : bulkBtn;
  // CP2 (#10) · D1: "2 differences · 1 agreed" — at its right amber "1 to check", or green "✓ Done" once nothing is open and every
  // difference is agreed (else no pill) · "all done" above stays as it is
  const dif = cxDiffLine(o.diffs), dc = o.diffs || {};
  const difPill = dc.n > dc.ok ? cxPill('open', (dc.n - dc.ok) + ' to check') : !dc.open ? cxPill('ok', '\u2713 Done') : '';
  return '<div class="cx-card cx-sum">' +
    '<div class="cx-row-sb"><span class="cx-lbl">' + cxEsc(o.label) + '</span>' + (o.open ? cxPill('open', o.open + ' open') : cxPill('ok', 'all done')) + '</div>' +
    '<div class="cx-sum__v"><span class="cx-sum__big">' + (o.dir ? cxIO(o.dir * o.done) : cxW(o.done)) + '</span><span class="cx-sum__of">of ' + cxW(o.plan) + ' planned</span></div>' +
    '<div class="cx-bar cx-bar--thin"><div style="width:' + pct + '%"></div></div>' +
    (o.split || '') +                                       // e.g. Kalt / NK / Warm table (Income)
    undo + action + (dif ? '<div class="cx-sum__hint cx-sum__dif"><span>' + cxEsc(dif) + '</span>' + difPill + '</div>' : '') +
    (o.note ? '<div class="cx-sum__hint">' + o.note + '</div>' : '') +
    (o.partial && !o.confirm && !o.future ? '<div class="cx-sum__hint">' + (o.partial === 1 ? '1 partial month' : o.partial + ' partial months') + ' · please confirm one by one</div>' : '') +
  '</div>';
}
/* Pending undo for this tab and month? */
function cxUndoFor(tab) {
  const u = CX.undo;
  return u && u.tab === tab && u.y === window._ctrl.year && u.m === CX.month ? u : null;
}
/* C6: an amount you typed or took on a line (Income / Expenses). While its save is on its way every drawing shows it (a save
   waiting behind another one of its row does not flash back to the old amount), and 'Book all' / its Undo leave a line you
   changed since their tap alone (cxTouchedSince: id, year, month, the number taken at the tap) */
let _cxTouchSeq = 0;
const _cxTouched = {}, _cxPend = {};
async function cxMine(id, v, save) {
  const k = id + '|' + window._ctrl.year + '|' + CX.month, p = { v: v === null || v === undefined ? null : cxR(v) };
  _cxTouched[k] = ++_cxTouchSeq; _cxPend[k] = p;
  try { return await save(); } finally { if (_cxPend[k] === p) delete _cxPend[k]; }
}
const cxTouchedSince = (ids, y, m, s) => [].concat(ids).some(id => (_cxTouched[id + '|' + y + '|' + m] || 0) > s);
const cxPendIst = (id, ist) => { const p = _cxPend[id + '|' + window._ctrl.year + '|' + CX.month]; return p ? p.v : ist; };
/* C6: saves of one month row go out one after the other — each starts from the row the one before wrote
   (Zinsen then Tilgung, a mark then a new amount, two marks of one apartment) */
const _cxRowQ = {};
function cxRowQ(key, fn) {
  const job = (_cxRowQ[key] || Promise.resolve()).catch(() => {}).then(fn);
  _cxRowQ[key] = job;
  return job.finally(() => { if (_cxRowQ[key] === job) delete _cxRowQ[key]; });
}

/* D1: the card header's "sub · done X € of Y €" (Income, Expenses). "done … of …" is one piece with an invisible copy of the
   widest sum it can show (the sum, or the plan + 10 % for a payment above it; every digit a 4 — Inter's widest): it stays on
   the first line or starts the second whatever is booked, so the header never moves. A whole invisible copy of the line
   (.cx-src__g) keeps the height where a narrow phone has to wrap the piece inside. The copies are drawn from data-* (not read
   aloud, no text of their own) */
function _cxSrcDone(sub, sum, plan) {
  const of = plan ? ' of ' + cxW(plan) : '', most = 'done ' + cxW(Math.max(Math.abs(sum), Math.abs(plan || 0) * 1.1)).replace(/\d/g, '4') + of;
  return '<span>' + (sub ? cxEsc(sub) + ' · ' : '') + '<span class="cx-src__d" data-w="' + cxEsc(most) + '">' + cxEsc('done ' + cxW(sum) + of) + '</span></span>' +
    '<i class="cx-src__g" aria-hidden="true" data-p="' + (sub ? cxEsc(sub + ' · ') : '') + '"><b data-w="' + cxEsc(most) + '"></b></i>';
}

/* ── Property card with fold-up ── */
function cxCard(o) {
  const g = o.status;
  const gs = !g ? [] : Array.isArray(g[0]) ? g : [g];        // CP2: one pill, or several side by side ("1 open" "1 to check")
  // CP2: o.statusWas = the status without the marks (cxGroupStatus) — kept as an invisible width on the phone, so marking moves nothing.
  // D1: + the widest "open" / "to check" its rows can reach (4 is Inter's widest digit), so typing an amount moves nothing either
  const gw0 = !o.statusWas ? [] : Array.isArray(o.statusWas[0]) ? o.statusWas : [o.statusWas];
  const most = o.statusWas && o.statusWas.most ? String(o.statusWas.most).replace(/\d/g, '4') : '';
  const gw = most ? gw0.concat([['open', most + ' open'], ['open', most + ' to check']]) : gw0;
  const gh = gw.length && gw.map(x => x.join('|')).join('/') !== gs.map(x => x.join('|')).join('/') ? gw : null;
  const isOpen = CX.open[o.key] !== undefined ? CX.open[o.key]
    : (o.defaultOpen !== undefined ? o.defaultOpen : gs.some(x => x[0] === 'open'));   // only what needs you ("open", "to check")
  // CP1 (#18): drawn open because something is open → remembered, so it does not fold up by itself once the
  // last amount is typed (the page would jump); it closes only when you tap its header (month change resets)
  if (isOpen && o.defaultOpen === undefined && CX.open[o.key] === undefined) CX.open[o.key] = true;   // = CX.open[key] ??= isOpen
  return '<div class="cx-card">' +
    '<button class="cx-ph" data-cx="fold" data-k="' + cxEsc(o.key) + '" aria-expanded="' + isOpen + '">' +
      '<span class="cx-ph__l"><span class="cx-pn">' + cxEsc(o.title) + '</span>' +
        (o.subHTML !== undefined ? '<span class="cx-src">' + o.subHTML :   // CP1: a sub with a coloured amount (One-off "Income + 407 €")
        o.sum !== undefined ? '<span class="cx-src cx-src--d">' + _cxSrcDone(o.sub, o.sum, o.plan) :   // D1: Income, Expenses
        '<span class="cx-src">' + cxEsc(o.sub || '')) + '</span></span>' +
      '<span class="cx-ph__r">' + (gh
        // D1: the pills that show, right-aligned on an invisible 0 px high copy (the extra pill + the widest statuses): the extra
        // pill stays next to the status, and the title keeps its width
        ? '<span class="cx-ph__w"><span class="cx-ph__v">' + (o.extraPill || '') + '<span class="cx-ph__st">' + gs.map(x => cxPill(x[0], x[1])).join('') + '</span></span>' +
          '<span class="cx-ph__gh" aria-hidden="true">' + (o.extraPill || '') + '<span class="cx-ph__st">' + gh.map(x => cxPill(x[0], x[1])).join('') + '</span></span></span>'
        : (o.extraPill || '') + (gs.length > 1 ? '<span class="cx-ph__st">' + gs.map(x => cxPill(x[0], x[1])).join('') + '</span>' : gs.map(x => cxPill(x[0], x[1])).join(''))) +
        '<i class="ti ti-chevron-' + (isOpen ? 'up' : 'down') + ' cx-chev" aria-hidden="true"></i></span>' +
    '</button>' + (isOpen ? o.body : '') + '</div>';
}

/* ── Soll │ Ist row (#19) ──
   line 1: label · pills + status      line 2: Soll (tap = take over) │ difference │ Ist field
   then sub line, change notes, info (grey) and data checks                                  */
function cxRow(o) {
  const s = cxStatus(o.soll, o.ist, o.emptyText, o.dir, o.mark);
  const can = !!o.soll || (o.ist !== null && o.ist !== undefined);
  // CP2 (#10) · D1: a difference on a row that can be marked (o.mark given, C1 SQL run) → "✓ Agree" on the sub line (one tap);
  // agreed → the green status is a button: the reason panel (reasons · Undo agreed). The line keeps its height either way (no jump).
  const d = cxDiff(o.soll, o.ist), markable = !!d && o.mark !== undefined && o.mark !== null;
  // every row that can be marked keeps the button's place, with or without a difference: a long sub line
  // (e.g. Pauschal on the phone) wraps the same before and after you type — the rows below never move
  const slot = markable || (o.mark !== undefined && o.mark !== null && !!o.sub);
  const agreed = markable && !!o.mark.ok;
  // D1: a panel left open on a row that is no longer agreed (its mark went with a new amount, e.g. on the other line of a
  // tenant change) is forgotten, so it never opens again by itself when the mark comes back
  if (!agreed && CX.dif && CX.dif.id === o.id && !cxDifBusy(o.id)) CX.dif = null;
  const st = agreed && CX.dif && CX.dif.id === o.id ? CX.dif : null;
  const off = markable && cxDifBusy(o.id) ? ' disabled' : '';   // C6: its mark is on its way
  const idA = ' data-id="' + cxEsc(o.id) + '"';
  const pill = agreed
    ? '<button class="cx-pill cx-pill--' + s[0] + ' cx-pill-tap" data-cx="difTap"' + idA + ' aria-expanded="' + !!st + '" aria-label="' + cxEsc(s[1].slice(2)) + ' – tap for reason or undo">' + _cxPillTxt(s[1]) + '</button>'
    : cxPill(s[0], s[1]);
  let difBtn = '', sheet = '';
  if (markable && !agreed) difBtn = '<button class="cx-dif cx-dif--agree" data-cx="difAgree"' + idA + off + '><span class="cx-ck" aria-hidden="true">\u2713</span> Agree</button>';
  else if (slot) difBtn = '<span class="cx-dif cx-dif--ph" aria-hidden="true"></span>';   // the place stays (also once agreed): the sub line wraps the same
  if (st) {                                               // the reason it has is pressed (none = Agreed) — a tap saves another one at once
    const on = st.pick || o.mark.reason || 'agreed';
    sheet = '<div class="cx-dif-sh" role="group" aria-label="Reason for the difference"><div class="cx-chips">' + (o.dir === -1 ? CX_DIFF_OUT : CX_DIFF_IN).map(([v, t]) =>
        '<button class="cx-chip' + (on === v ? ' on' : '') + '" data-cx="difPick"' + idA + ' data-r="' + v + '" aria-pressed="' + (on === v) + '"' + off + '>' + t + '</button>').join('') + '</div>' +
      '<button class="cx-dif-x" data-cx="difUndo"' + idA + off + '>Undo agreed</button></div>';
  }
  const subLine = slot
    ? '<div class="cx-r__sub cx-r__sub--dif"><span>' + (o.sub || '') + '</span>' + difBtn + '</div>'
    : (o.sub ? '<div class="cx-r__sub">' + o.sub + '</div>' : '');
  // D1: the difference between Soll and Ist in words, no + or − — red: less money for you (a cost paid more, rent missing),
  // green: more money for you (a cost paid less, rent extra). It stays after it was agreed. Read aloud: "difference 0,01 € more"
  const dm = !d ? '<span class="cx-dm"></span>'
    : '<span class="cx-dm cx-dm--' + (d * (o.dir === -1 ? -1 : 1) < 0 ? 'out' : 'in') + (Math.abs(d) < 100000 ? ' cx-dm--tn' : '') + '"><span class="cx-vh">difference </span><span class="cx-dm__a">' + cxEur(Math.abs(d)) + '</span> ' +
      (o.dir === -1 ? (d > 0 ? 'more' : 'less') : (d < 0 ? 'missing' : 'extra')) + '</span>';
  // D1: the pills keep one width in every state the status can take (an invisible, 0 px high copy of each): a long label
  // (e.g. a tenant change) wraps the same before and after you type, agree or pick a reason — the row never moves
  const alts = (o.soll ? ['open'] : [o.emptyText || 'empty']).concat(['To check', '\u2713 Paid'],
    o.mark !== undefined && o.mark !== null ? (o.dir === -1 ? CX_DIFF_OUT : CX_DIFF_IN).map(x => '\u2713 ' + x[1]) : []);
  const pills = '<span class="cx-r__st"><span class="cx-r__pv">' + (o.pills || '') + pill + '</span><span class="cx-r__gh" aria-hidden="true">' +
    alts.map(t => '<span class="cx-r__pv">' + (o.pills || '') + cxPill('grey', t) + '</span>').join('') + '</span></span>';
  const took = o.ist !== null && o.ist !== undefined && o.soll && cxR(o.ist - o.soll) === 0;
  const icon = took ? 'check' : o.ist === null || o.ist === undefined ? 'arrow-right' : '';   // D1: no icon while a difference shows
  const soll = o.soll
    ? '<button class="cx-soll' + (took ? ' on' : '') + '" data-cx="take" data-id="' + cxEsc(o.id) + '" aria-label="Take Soll: ' + cxEsc(cxEur(o.soll)) + '">' +
        '<span>' + cxEur(o.soll) + '</span>' + (icon ? '<i class="ti ti-' + icon + '" aria-hidden="true"></i>' : '') + '</button>'
    : '<span class="cx-r__s">\u2014</span>';
  return '<div class="cx-r">' +
    '<div class="cx-r__top"><span class="cx-r__u">' + cxEsc(o.label) + (o.badge ? ' ' + cxPill('beige', o.badge) : '') + '</span>' +
      '<span class="cx-r__p">' + pills + '</span></div>' +
    '<div class="cx-r__mid">' + soll + dm +
      '<label class="cx-f' + (can || o.allowEmpty ? '' : ' cx-f--off') + '"><input type="text" inputmode="decimal" data-cx-in="' + cxEsc(o.id) + '" value="' + (o.ist === null || o.ist === undefined ? '' : cxE2(o.ist)) + '" placeholder="' + (o.soll || o.allowEmpty ? 'Amount' : '\u2014') + '"' + (o.soll || o.allowEmpty || can ? '' : ' disabled') + ' aria-label="Ist amount ' + cxEsc(o.label) + '"><span>€</span></label>' +
    '</div>' +
    subLine + sheet +
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
/* C1 #17: another year could not be loaded (month / year arrows) — nothing was saved, so not "Saving failed" */
function cxToastLoad(y, e) {
  console.error('[controlling] load ' + y, e);
  if (typeof ctlToast === 'function') ctlToast('Could not load ' + y + ' – please try again');
}

/* ── Wire a tab host once: month arrows, fold, take-over, inputs ── */
/* ── B18: PAINT WITHOUT REBUILDING ─────────────────────────────
   The pages are written with cxPaint(host, html) instead of host.innerHTML.
   The new HTML is compared with what is on screen and only what really
   differs is changed:
   · reload with the same data (app back in front, tab switch) → nothing changes, no blink
   · after a save only that row / card changes — the rest stays exactly as it is
   · fields keep focus, typed text and scroll position (a field you are typing in is never touched)
   A field's value always follows the HTML, like after a full redraw. */
const _CX_CTRL = 'input,select,textarea';
function cxPaint(host, html) {
  if (!host) return;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const a = host.firstElementChild, b = tpl.content.firstElementChild, run = host._cxRun && host._cxRun.size ? host._cxRun : null;
  // C6: a button turned off after a question (e.g. 'Possible duplicate?') counts as busy — seen before the drawing turns it on
  if (run) { for (const e of run.values()) if (!e.busy && e.b.disabled) e.busy = true; _cxRunFree(host, null); }   // the drawing decides first …
  if (a && b && a.id !== b.id) host.replaceChildren(...tpl.content.childNodes);   // another page (e.g. Setup ↔ History)
  else _cxMorphKids(host, tpl.content, _cxFocusPair(host, tpl.content));
  if (run) _cxRunKeep(host, run);                         // … then a button whose save is on its way stays off
}
/* C6: the field you are in (by its id, data-cx-in, data-cx-sel or data-h-date) and the same field in the new HTML, or null */
function _cxFocusPair(host, frag) {
  const f = document.activeElement;
  if (!f || f === host || !host.contains(f) || !f.matches(_CX_CTRL)) return null;
  for (const at of ['id', 'data-cx-in', 'data-cx-sel', 'data-h-date']) {
    const v = f.getAttribute(at), n = v && frag.querySelector('[' + at + '="' + CSS.escape(v) + '"]');
    if (n) return [f, n];
  }
  return null;
}
/* C6: a button its handler turned off for a save (Add, Book, Save …) stays off until that save is done (cxWire).
   A drawing in between (a card opened, a chip, another save ending) follows the HTML and turned it on again:
   a second tap saved twice. The tap's key: the button's data-* (+ area / month on Income and Expenses, h.place). */
const _cxRunKey = (host, x) => JSON.stringify(x.dataset) + (host._cxPlace ? '|' + host._cxPlace() : '');
function _cxRunKeep(host, run) {
  host.querySelectorAll('[data-cx]').forEach(x => {
    const k = _cxRunKey(host, x), e = run.get(k);
    if (e && e.busy && !x.disabled) { x.disabled = true; x._cxRunOff = k; }
  });
}
/* C6: a handler that turns its button off after a question: a drawing under the question may have put a new button
   on screen — that one (the same key) is turned off too, until the save is done */
function cxBusyNow(host, b) {
  b.disabled = true;
  const run = host && host._cxRun, e = run && run.get(_cxRunKey(host, b));
  if (e) { e.busy = true; _cxRunKeep(host, run); }
}
function _cxRunFree(host, key) {                          // key null: every button kept off — the next drawing decides again
  host.querySelectorAll('[data-cx]').forEach(x => { if (x._cxRunOff && (key === null || x._cxRunOff === key)) { x._cxRunOff = null; x.disabled = false; } });
}
function _cxWant(t) {                                   // the value a field gets from its HTML
  if (t.tagName === 'SELECT') { const o = t.querySelector('option[selected]') || t.querySelector('option'); return o ? o.value : ''; }
  if (t.tagName === 'TEXTAREA') return t.textContent;
  if (t.type === 'checkbox' || t.type === 'radio') return t.hasAttribute('checked');
  return t.getAttribute('value') || '';
}
function _cxApply(c, want) {
  if (c.type === 'file') return;
  const typing = c === document.activeElement &&
    (c.tagName === 'TEXTAREA' || (c.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|range|color)$/i.test(c.type)));
  if (typing) return;                                   // you are typing here — your text stays
  if (typeof want === 'boolean') { if (c.checked !== want) c.checked = want; }
  else if (c.value !== want) c.value = want;
}
/* German date / number fields (cc-german-format.js) are converted after drawing: type, placeholder,
   keyboard and the classes cc-date / cc-cal belong to that converter — a kept field keeps them
   (otherwise it would turn back into a plain field). Value and data attributes still follow the HTML. */
const _CX_OWN = /^(type|inputmode|autocomplete|placeholder|step|onclick|aria-invalid)$/;
function _cxKeepCls(x, v) {
  ['cc-date', 'cc-cal'].forEach(c => { if (x.classList.contains(c) && !(' ' + v + ' ').includes(' ' + c + ' ')) v = (v + ' ' + c).trim(); });
  return v;
}
function _cxSyncAttrs(x, y) {
  const own = !!(x._ccDate || x._ccNum || x._ccCal);
  for (const at of [...x.attributes]) {
    if (y.hasAttribute(at.name) || (own && (_CX_OWN.test(at.name) || at.name === 'class'))) continue;
    x.removeAttribute(at.name);
  }
  for (const at of [...y.attributes]) {
    if (own && _CX_OWN.test(at.name)) continue;
    const v = own && at.name === 'class' ? _cxKeepCls(x, at.value) : at.value;
    if (x.getAttribute(at.name) !== v) x.setAttribute(at.name, v);
  }
  if (own && !y.hasAttribute('class')) {
    const v = _cxKeepCls(x, '');
    if (v) { if (x.getAttribute('class') !== v) x.setAttribute('class', v); } else x.removeAttribute('class');
  }
}
function _cxMorphKids(a, b, fp) {
  const an = [...a.childNodes], bn = [...b.childNodes];
  // C6: the part that holds the field you are in is matched with the part that holds it in the new HTML, not by place —
  // a row or card that came or went above it gave your field to another one (the keyboard closed, a wrong amount was saved)
  const j = fp ? an.findIndex(x => x.contains(fp[0])) : -1, k = j < 0 ? -1 : bn.findIndex(y => y.contains(fp[1]));
  if (k < 0 || k === j) return _cxMorphList(a, an, bn, null, fp);
  _cxMorphList(a, an.slice(0, j), bn.slice(0, k), an[j], fp);   // what comes before it …
  _cxMorphList(a, [an[j]], [bn[k]], null, fp);                  // … the part with your field …
  _cxMorphList(a, an.slice(j + 1), bn.slice(k + 1), null, fp);  // … and what comes after it
}
function _cxMorphList(a, an, bn, before, fp) {          // an → bn by place; new parts go in front of 'before' (null: at the end)
  for (let i = 0; i < bn.length; i++) {
    const x = an[i], y = bn[i];
    if (!x) { a.insertBefore(y, before); continue; }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { a.replaceChild(y, x); continue; }
    if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
    if (x.isEqualNode(y)) {                             // the same → left alone; only field values follow the HTML
      if (x.matches(_CX_CTRL)) _cxApply(x, _cxWant(y));
      else if (x.querySelector(_CX_CTRL)) {
        const xs = x.querySelectorAll(_CX_CTRL), ys = y.querySelectorAll(_CX_CTRL);
        xs.forEach((c, k) => { if (ys[k]) _cxApply(c, _cxWant(ys[k])); });
      }
      continue;
    }
    const isCtrl = x.matches(_CX_CTRL), want = isCtrl ? _cxWant(y) : null;
    _cxSyncAttrs(x, y);
    _cxMorphKids(x, y, fp);
    if (isCtrl) _cxApply(x, want);
  }
  for (let i = an.length - 1; i >= bn.length; i--) a.removeChild(an[i]);
}

function cxWire(host, h) {
  if (host._cxWired) return;
  host._cxWired = true;
  if (h.place) host._cxPlace = h.place;
  host.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-cx]');
    if (!b || b.disabled) return;
    const q = _cxQuiet;                                     // D1: the 2nd tap of a double tap, on the spot a reason panel just left
    if (ev.detail && q && _cxNow() < q.until && Math.abs(ev.clientX - q.x) < 40 && Math.abs(ev.clientY - q.y) < 40) return;
    if (ev.detail) _cxQuiet = null;                          // a tap anywhere else: you moved on, that spot works again
    const a = b.dataset.cx;
    if (a === 'prev') return cxStepMonth(-1);
    if (a === 'next') return cxStepMonth(1);
    if (a === 'fold') {
      const k = b.dataset.k; const cur = b.getAttribute('aria-expanded') === 'true'; CX.open[k] = !cur;
      // Oct 2026: the tapped header stays where it is (no jump after the list is redrawn)
      return cxKeepPlace(b, () => h.render(), () => [...host.querySelectorAll('[data-cx="fold"]')].find(x => x.dataset.k === k));
    }
    // CP2 (#10) · D1: "✓ Agree" saves the mark at once · a tap on the green status opens / closes its reason panel (one at a time) ·
    // a reason or "Undo agreed" is saved at once and closes it. One save per tap: while a mark is on its way its row's Agree,
    // reasons and Undo stay off, also across drawings (cxDifBusy). Not saved → the toast, the row as it was (the panel stays open)
    if (/^dif/.test(a)) {
      const id = b.dataset.id, y = window._ctrl.year, m = CX.month, where = () => CX.tab + '|' + CX.area + '|' + window._ctrl.year + '|' + CX.month;
      if (cxDifBusy(id)) return;                             // C6: its mark is on its way — nothing changes until it is saved
      const cur = CX.dif && CX.dif.id === id ? CX.dif : null, at = where(), pb = CX.dif ? CX.dif.id : null;
      let to = null;                                         // the control that gets the focus back after the redraw
      if (a === 'difTap') CX.dif = cur ? null : { id };      // the reason panel: open · close (another row's closes)
      else if (a === 'difPick' && b.getAttribute('aria-pressed') === 'true') { if (cur) CX.dif = null; to = 'difTap'; }   // the reason it has: nothing to save
      else if (h.mark && /^dif(Agree|Pick|Undo)$/.test(a)) {
        if (a === 'difAgree' && CX.dif && CX.dif.id !== id) CX.dif = null;   // agreeing a row closes another row's panel
        const k = id + '|' + y + '|' + m, mark = a === 'difUndo' ? null : { ok: true, reason: a === 'difPick' ? b.dataset.r : 'agreed' };
        _cxDifRun.add(k); b.disabled = true;                 // one save per tap
        if (cur && a === 'difPick') cur.pick = b.dataset.r;  // the reason tapped shows pressed while it is saved
        h.render();
        let ok = true;
        try { await h.mark(id, mark); } catch (err) { ok = false; cxToastErr(err); }
        _cxDifRun.delete(k);
        if (cur) cur.pick = null;
        if (ok && cur && CX.dif === cur) CX.dif = null;       // saved → the panel closes · not saved → it stays as it was: try again
        to = ok ? (a === 'difUndo' ? 'difAgree' : 'difTap') : a;
      }
      h.render();
      if (pb && (CX.dif ? CX.dif.id : null) !== pb && ev.detail) _cxQuiet = { until: _cxNow() + 1000, x: ev.clientX, y: ev.clientY };   // a panel closed: the rows below moved up
      // keyboard (Enter / Space): the focus goes back to the row — a tap leaves no focus ring; another screen or month meanwhile: nothing
      return ev.detail === 0 && at === where() ? cxDifFocus(host, id, to) : undefined;
    }
    if (h.click) {
      // C6: a tap whose button its handler turns off (a save) keeps it off until it is done, also across drawings (cxPaint)
      const run = host._cxRun || (host._cxRun = new Map()), key = _cxRunKey(host, b), cur = run.get(key);
      if (cur && (cur.busy || cur.b.disabled)) return;       // its save is still on its way (also: turned off after a question)
      const r = h.click(a, b, ev);
      if (r && typeof r.then === 'function') {
        const e = cur || { n: 0, busy: false };
        e.n++; e.b = b; run.set(key, e);
        const end = () => { if (--e.n) return; run.delete(key); _cxRunFree(host, key); };
        r.then(end, end);
        setTimeout(() => { if (b.disabled && run.get(key) === e) e.busy = true; }, 0);   // a chip or a fold stays tappable
      }
      return r;
    }
  });
  host.addEventListener('change', ev => {
    const id = ev.target && ev.target.dataset && ev.target.dataset.cxIn;
    if (id && CX.dif && CX.dif.id === id) CX.dif = null;     // a new amount: its reason panel closes (the mark goes with the amount)
    if (id && h.input) h.input(id, cxParse(ev.target.value), ev.target);
  });
  host.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target && ev.target.dataset && ev.target.dataset.cxIn) ev.target.blur();
    if (ev.key === 'Escape' && CX.dif && !cxDifBusy(CX.dif.id)) { const d = CX.dif; CX.dif = null; h.render(); cxDifFocus(host, d.id, 'difTap'); }   // the panel closes, the focus goes back to its status
  });
}
/* CP2: after the redraw the tapped control may be gone (Agree, a reason, Undo agreed) — the focus goes to this row's
   next control instead of the page start (keyboard and screen readers keep their place) */
function cxDifFocus(host, id, kind) {
  if (!kind) return;
  const ae = document.activeElement;
  if (ae && ae !== document.body && ae.isConnected) return;
  const x = [...host.querySelectorAll('[data-cx="' + kind + '"]')].find(e => e.dataset.id === id);
  if (x) { try { x.focus({ preventScroll: true }); } catch (e) {} }
}

/* ── KEEP PLACE (Oct 2026) ─────────────────────────────────────
   A card that closes (or a list that redraws) keeps its header exactly where it is on screen.
   Without this the page gets shorter, the phone snaps back and the header jumps (lower cards).
   mutate() does the change (class toggle or redraw) · find() returns the header afterwards.
   A spacer at the end fills the missing height and shrinks away as soon as you scroll up.   */
function cxKeepPlace(el, mutate, find) {
  if (typeof mutate !== 'function') return;
  if (!el || !el.isConnected) return mutate();
  const before = el.getBoundingClientRect().top;
  const res = mutate();
  const now = (typeof find === 'function' ? find() : el) || null;
  if (!now || !now.isConnected) return res;
  const shift = now.getBoundingClientRect().top - before;          // > 0 → the page was pulled back
  if (Math.abs(shift) < 1) return res;
  let sp = document.getElementById('ccEndSpace');
  if (!sp) { sp = document.createElement('div'); sp.id = 'ccEndSpace'; sp.setAttribute('aria-hidden', 'true'); sp.style.cssText = 'height:0;pointer-events:none;'; document.body.appendChild(sp); }
  const target = Math.max(0, window.scrollY + shift);
  const need = Math.ceil(target + window.innerHeight - document.documentElement.scrollHeight);
  if (need > 0) sp.style.height = ((parseFloat(sp.style.height) || 0) + need) + 'px';
  try { window.scrollTo({ top: target, behavior: 'instant' }); } catch (e) { window.scrollTo(0, target); }
  if (need > 0) _cxGlideToEnd(); else _cxEndSpaceWatch();   // Oct 2026 (B): at the end of the list the page then glides down — no empty space left
  return res;
}
/* CP2: the redraw after an amount keeps that row where it is — the month summary above can gain or lose
   a line ("1 difference"), which would otherwise push the row you just typed in up or down */
function cxKeepRow(id, render) {
  const f = () => [...document.querySelectorAll('[data-cx-in]')].find(x => x.dataset.cxIn === id) || null;
  return cxKeepPlace(f(), render, f);
}
/* The page glides (~0.35 s) from the kept place to its natural end; the spacer shrinks with it.
   A touch / wheel during the glide stops it (then the spacer shrinks as you scroll).          */
function _cxGlideToEnd() {
  const sp = document.getElementById('ccEndSpace'); if (!sp) return;
  const from = window.scrollY, spH = parseFloat(sp.style.height) || 0;
  const content = document.documentElement.scrollHeight - spH;              // the page without the spacer
  const to = Math.max(0, Math.min(from, content - window.innerHeight));
  if (from - to < 1) { sp.style.height = '0px'; return; }
  let stopped = false;
  const stop = () => { stopped = true; };
  window.addEventListener('touchstart', stop, { once: true, passive: true });
  window.addEventListener('wheel', stop, { once: true, passive: true });
  const t0 = performance.now(), dur = Math.min(550, 280 + (from - to) * 0.5), ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const step = now => {
    if (stopped) { _cxEndSpaceWatch(); return; }
    const k = Math.min(1, (now - t0) / dur), y = from + (to - from) * ease(k);
    try { window.scrollTo({ top: y, behavior: 'instant' }); } catch (e) { window.scrollTo(0, y); }
    sp.style.height = Math.max(0, Math.ceil(y + window.innerHeight - content)) + 'px';
    if (k < 1) requestAnimationFrame(step);
    else { sp.style.height = '0px'; window.removeEventListener('touchstart', stop); window.removeEventListener('wheel', stop); }
  };
  requestAnimationFrame(step);
}
let _cxEndWatching = false;
function _cxEndSpaceWatch() {
  if (_cxEndWatching) return;
  _cxEndWatching = true;
  const trim = () => {
    const sp = document.getElementById('ccEndSpace'), h = sp ? (parseFloat(sp.style.height) || 0) : 0;
    if (!h) return stop();
    const content = document.documentElement.scrollHeight - h;     // the page without the spacer
    const need = Math.max(0, Math.ceil(window.scrollY + window.innerHeight - content));
    if (need < h) sp.style.height = need + 'px';
    if (!need) stop();
  };
  const stop = () => { window.removeEventListener('scroll', trim); window.removeEventListener('resize', trim); _cxEndWatching = false; };
  window.addEventListener('scroll', trim, { passive: true });
  window.addEventListener('resize', trim, { passive: true });
}
