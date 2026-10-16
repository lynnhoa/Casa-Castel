// ─────────────────────────────────────────────────────────────
// ServiceCatalog — the only price source for the whole app.
// Cards: Brand Collab / UGC / Editorial / Hotels + custom cards.
// Every section has a type (deliverables, packages, usage rights,
// exclusivity, add-ons, info). Usage + exclusivity percentages are
// edited here once and used by the Calculator, the rate-card PDF
// and the renewal builder. Edits save automatically.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { C, SANS, SERIF, TYPE, Z, catInfo, PDF } from "./constants";
import { uid, fmt, pctSpace } from "./formatters";
import { I, S, B, Lbl, Pill, Tick, ConfirmDialog, LangSwitch, BAR_BTN, NumField } from "./atoms";
import { SETTINGS_DEFAULT } from "./rateCards";
import { exportPDF } from "./PDFExport";
import { editLock } from "./saveStatus";
import {
  normalizeCard, sectionKind, KIND_LABEL, optName, pctText, addonPriceText, BASE_CARD_KEYS,
} from "./pricing";
import type { SectionKind } from "./pricing";

const cardTitle = (rc: any, k: string) => BASE_CARD_KEYS.includes(k) ? catInfo(k).label : (rc?.[k]?.label || k);
const cleanSecT = (t: string) => String(t || "").replace(/\s*[—–-]\s*added to base rate.*$/i, "").replace(/\s*[—–-]\s*\d+%[^"<]*/g, "").replace(/^Volume Discount\s*[&]\s*/i, "").trim();
const money = (p: any) => fmt(Number(p) || 0);          // German: 200,00 €

// Rows a section shows (usage / exclusivity come from the options)
function sectionRows(card: any, sec: any): { key: string; n: string; note?: string; price: string }[] {
  const kind = sectionKind(sec);
  if (kind === "usage" || kind === "exclusivity") {
    const opts = (kind === "usage" ? card.usage : card.excl) || [];
    return opts.filter((o: any) => !o.sentinel).map((o: any, i: number) => ({
      key: `o${i}`, n: optName(o.l), price: Number(o.pct) > 0 ? `+${pctText(o.pct)}` : "included",
    }));
  }
  return (sec.items || []).map((it: any, i: number) => ({
    key: it.id || `i${i}`,
    n: pctSpace(it.n),
    note: pctSpace([it.note, kind === "packages" && it.includes?.length ? `Includes ${it.includes.map((x: any) => `${x.qty || 1}× ${x.n}`).join(", ")}` : ""].filter(Boolean).join(" · ")),
    price: kind === "addons" ? addonPriceText(it) : it.p !== null && it.p !== undefined ? money(it.p) : pctSpace(it.m || ""),
  }));
}

// ── Rate card A4 content ──────────────────────────────────────
function RCContent({ card, lang, rcSecGuards }: any) {
  const l = lang === "de";
  return (
    <div style={{ padding: "90px 62px 130px", fontSize: 9.5, lineHeight: 1.5, fontFamily: SANS, color: PDF.ink, background: PDF.page }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: SERIF, fontSize: 19, fontWeight: "normal", margin: "0 0 4px" }}>{l ? "Preisliste" : "Rate Card"}</h1>
        <p style={{ fontSize: 7.5, color: PDF.label, margin: 0 }}>{pctSpace(card.sub)}</p>
      </div>
      {(card.sections || []).map((sec: any, si: number) => {
        const rows = sectionRows(card, sec);
        if (!rows.length) return null;
        return (
          <div key={si} data-rcsec={si} style={{ marginBottom: 14, paddingTop: rcSecGuards?.[si] || 0 }}>
            <p style={{ fontSize: 7, letterSpacing: 0, textTransform: "uppercase" as const, color: PDF.label, margin: "0 0 3px", paddingBottom: "3px", borderBottom: `1px solid ${PDF.rule}` }}>
              {cleanSecT(sec.t)}{sectionKind(sec) === "usage" || sectionKind(sec) === "exclusivity" ? (l ? " — auf den Grundpreis" : " — added to base rate") : ""}
            </p>
            {rows.map(r => (
              <div key={r.key} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${PDF.rule}` }}>
                <div>
                  <span style={{ fontSize: 8.5 }}>{r.n}</span>
                  {r.note && <span style={{ fontSize: 7, color: PDF.faint, display: "block" }}>{r.note}</span>}
                </div>
                <span style={{ fontFamily: SERIF, fontSize: 8.5, whiteSpace: "nowrap" as const, marginLeft: 12 }}>{r.price}</span>
              </div>
            ))}
          </div>
        );
      })}
      {card.fine && <p style={{ fontSize: 7.5, color: PDF.label, lineHeight: 1.7, marginTop: 14 }}>{pctSpace(card.fine)}</p>}
    </div>
  );
}

// ── A4 pages with header / footer (preview + PDF capture) ─────
function RCPages({ card, lang, settings, scale = 1 }: any) {
  const PAGE_H = 841;
  const measureRef = useRef<HTMLDivElement>(null);
  const [docHeight, setDocHeight] = useState(PAGE_H);
  const [guards, setGuards] = useState<number[]>([]);
  const sett = { ...SETTINGS_DEFAULT, ...(settings || {}) };

  useEffect(() => {
    setGuards([]);
    const el = measureRef.current;
    if (!el) return;
    const calc = () => {
      const h = el.offsetHeight;
      if (h > 100) setDocHeight(h);
      const secEls = Array.from(el.querySelectorAll("[data-rcsec]")) as HTMLElement[];
      if (!secEls.length) return;
      const next: number[] = [];
      const guarded = new Set<number>();
      secEls.forEach(secEl => {
        const idx = parseInt(secEl.getAttribute("data-rcsec") || "0", 10);
        const page = Math.floor(secEl.offsetTop / PAGE_H);
        const bottomInPage = secEl.offsetTop + secEl.offsetHeight - page * PAGE_H;
        if (bottomInPage > PAGE_H - 80 && !guarded.has(page)) { next[idx] = Math.max(0, PAGE_H + 52 - secEl.offsetTop); guarded.add(page); }
      });
      setGuards(prev => {
        const merged = next.map((v, i) => Math.max(v || 0, prev[i] || 0));
        return merged.length === prev.length && merged.every((v, i) => v === prev[i]) ? prev : merged;
      });
    };
    calc();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [card, lang]);

  const numPages = docHeight > PAGE_H + 220 ? Math.ceil(docHeight / PAGE_H) : 1;
  return (
    <>
      <div ref={measureRef} style={{ position: "fixed", top: 0, left: -9999, width: 595, visibility: "hidden", pointerEvents: "none", zIndex: -1 }}>
        <RCContent card={card} lang={lang} rcSecGuards={guards} />
      </div>
      {Array.from({ length: numPages }, (_, i) => (
        <div key={i} style={{ width: 595 * scale, height: PAGE_H * scale, overflow: "hidden", flexShrink: 0, boxShadow: "0 4px 24px rgba(0,0,0,0.32)" }}>
          <div data-pdf-page="true" style={{ width: 595, height: PAGE_H, overflow: "hidden", background: PDF.page, position: "relative", transform: scale < 1 ? `scale(${scale})` : "none", transformOrigin: "top left" }}>
            <div style={{ position: "absolute", top: -i * PAGE_H, left: 0, width: 595 }}>
              <RCContent card={card} lang={lang} rcSecGuards={guards} />
            </div>
            <div style={{ position: "absolute", bottom: 59, left: 0, right: 0, height: 28, background: PDF.page, zIndex: 2, pointerEvents: "none" }} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, background: PDF.page, zIndex: 3, borderBottom: `1px solid ${PDF.rule}` }}>
              <div style={{ padding: "13px 62px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 7, letterSpacing: 0, color: PDF.faint, textTransform: "uppercase" as const }}>{sett.company || sett.name || "Lynn Hoa"}</span>
                <span style={{ fontSize: 7, letterSpacing: 0, color: PDF.faint, textTransform: "uppercase" as const }}>{card.label || "Rate Card"}</span>
              </div>
            </div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: PDF.page, zIndex: 3, borderTop: `1px solid ${PDF.rule}` }}>
              <div style={{ padding: "26px 62px 22px", fontSize: 7, color: PDF.label, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{[sett.email, sett.website].filter(Boolean).join(" · ")}</span>
                {numPages > 1 && <span style={{ letterSpacing: 0, color: PDF.faint }}>{i + 1}</span>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

// ── Full-screen shell: panel left, live A4 preview right ──────
// (one level: everything about a card happens in this one window)
function CardShell({ title, card, settings, panel, footer, onClose }: any) {
  useEffect(() => editLock.acquire(), []);      // no reload while this window is open
  const [lang, setLang] = useState("en");
  const [winW, setWinW] = useState(() => window.innerWidth);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = () => setWinW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  const isM = winW < 768;
  const scale = isM ? Math.min(1, (winW - 32) / 595) : 1;
  const download = () => exportPDF({
    preview: { ...card, ctype: card.label || "Rate Card" }, type: "ratecard",
    root: previewRef.current || undefined, filename: `Rate Card – ${card.label || "Card"}`,
    onStart: () => setBusy(true), onDone: () => setBusy(false),
  } as any);

  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: Z.modal, display: "flex", flexDirection: "column", fontFamily: SANS }}>
      <div style={{ borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
        <div style={{ height: 44, display: "flex", alignItems: "center", padding: "0 8px 0 2px", gap: 6 }}>
          <button onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 20 }}>✕</button>
          <span style={{ fontFamily: SERIF, fontSize: TYPE.body.size, color: C.black, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{title}</span>
          <div style={{ flex: 1 }} />
          <LangSwitch lang={lang} onChange={setLang} />
          <B onClick={download} s={{ ...BAR_BTN, opacity: busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Save PDF"}</B>
        </div>
        {isM && (
          <div style={{ display: "flex", gap: 6, padding: "0 10px 8px" }}>
            <Pill size="sm" on={view === "edit"} onClick={() => setView("edit")}>Edit</Pill>
            <Pill size="sm" on={view === "preview"} onClick={() => setView("preview")}>Preview</Pill>
          </div>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {(!isM || view === "edit") && (
          <div style={{ width: isM ? "100%" : 380, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: isM ? "none" : `1px solid ${C.rule}` }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px 14px", WebkitOverflowScrolling: "touch" as any }}>{panel}</div>
            {footer && <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.rule}`, flexShrink: 0 }}>{footer}</div>}
          </div>
        )}
        {(!isM || view === "preview") && (
          <div ref={previewRef} style={{ flex: 1, background: "#888", overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: isM ? "20px 12px" : "32px 28px", gap: isM ? 16 : 28 }}>
            <RCPages card={card} lang={lang} settings={settings} scale={scale} />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Rate Card PDF (label, subtitle, fine print + live preview) ─
function RateCardPreview({ card, settings, onSave, onClose }: any) {
  const [staged, setStaged] = useState(() => JSON.parse(JSON.stringify(card)));
  const [askClose, setAskClose] = useState(false);
  const [flash, setFlash] = useState(false);
  const dirty = JSON.stringify(staged) !== JSON.stringify(card);
  const save = () => { onSave(staged); setFlash(true); setTimeout(() => setFlash(false), 1800); };
  const close = () => (dirty && !flash ? setAskClose(true) : onClose());
  return (
    <>
      {askClose && (
        <ConfirmDialog title="Save before closing?" text="Changes will be lost if you don't save." okLabel="Yes, save" cancelLabel="No, discard"
          onOk={() => { onSave(staged); setAskClose(false); onClose(); }} onCancel={() => { setAskClose(false); onClose(); }} />
      )}
      <CardShell
        title={`Rate Card PDF — ${staged.label || ""}`}
        card={staged}
        settings={settings}
        onClose={close}
        panel={
          <>
            <Lbl>Card Label</Lbl>
            <I value={staged.label || ""} onChange={(e: any) => setStaged((p: any) => ({ ...p, label: e.target.value }))} s={{ marginBottom: 10 }} />
            <Lbl>Subtitle</Lbl>
            <I value={staged.sub || ""} onChange={(e: any) => setStaged((p: any) => ({ ...p, sub: e.target.value }))} s={{ marginBottom: 10 }} />
            <Lbl>Fine Print</Lbl>
            <textarea value={staged.fine || ""} onChange={(e: any) => setStaged((p: any) => ({ ...p, fine: e.target.value }))}
              style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.rule}`, background: C.bg, fontFamily: SANS, fontSize: TYPE.sectionHeading.size, color: C.black, borderRadius: 2, outline: "none", resize: "vertical" as const, boxSizing: "border-box" as const, minHeight: 96 }} />
            <p style={{ fontSize: TYPE.label.size, color: C.muted, margin: "12px 0 0", lineHeight: 1.6 }}>Items, prices and percentages are edited in the catalog (Edit).</p>
          </>
        }
        footer={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {flash && <span style={{ fontSize: TYPE.label.size, color: C.green }}>Saved ✓</span>}
            <div style={{ flex: 1 }} />
            <B onClick={save} s={{ opacity: dirty ? 1 : 0.5 }}>Save</B>
          </div>
        }
      />
    </>
  );
}

// ── Add Card (one window: builder + live preview) ─────────────
function AddCardModal({ rc, settings, onSave, onClose }: any) {
  const [name,    setName]    = useState("");
  const [base,    setBase]    = useState<string>("");     // "" = empty card
  const [card,    setCard]    = useState<any>(() => normalizeCard({ label: "", sub: "", sections: [], fine: "", usage: rc.influencer?.usage || [], excl: rc.influencer?.excl || [] }));
  const [err,     setErr]     = useState<string | null>(null);
  const [askClose, setAskClose] = useState(false);
  const allKeys = Object.keys(rc || {});

  // every item of a type across all cards, for "+ Add item"
  const library = (kind: SectionKind) => {
    const seen = new Set<string>();
    return allKeys.flatMap(k => (rc[k]?.sections || [])
      .filter((s: any) => sectionKind(s) === kind)
      .flatMap((s: any) => (s.items || []).map((it: any) => ({ ...it, _from: cardTitle(rc, k) }))))
      .filter((it: any) => { const key = `${it.n}|${it.p}|${it.pct}`; if (seen.has(key)) return false; seen.add(key); return true; });
  };

  const startFrom = (k: string) => {
    setBase(k);
    if (!k) { setCard((c: any) => normalizeCard({ ...c, sections: [], fine: "" })); return; }
    const src = JSON.parse(JSON.stringify(rc[k]));
    setCard((c: any) => normalizeCard({
      ...src, label: c.label, sub: c.sub || src.sub,
      sections: (src.sections || []).map((s: any) => ({ ...s, id: uid(), items: (s.items || []).map((it: any) => ({ ...it, id: uid() })) })),
    }));
  };

  const upSec = (si: number, fn: (s: any) => any) => setCard((c: any) => ({ ...c, sections: c.sections.map((s: any, i: number) => i === si ? fn(s) : s) }));
  const display = { ...card, label: name || "New card", sub: card.sub || name };

  const save = () => {
    const label = name.trim();
    if (!label) { setErr("Give the card a name."); return; }
    if (!card.sections.some((s: any) => ["deliverables", "packages"].includes(sectionKind(s)) && (s.items || []).length)) {
      setErr("Add at least one deliverable or package."); return;
    }
    // always a NEW card — base cards are never overwritten
    const slug = label.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "") || "card";
    let key = `custom-${slug}`;
    for (let n = 2; rc[key] || BASE_CARD_KEYS.includes(key); n++) key = `custom-${slug}-${n}`;
    onSave(key, { ...card, label, sub: card.sub || label });
  };

  const panel = (
    <>
      <Lbl>Card name</Lbl>
      <I value={name} onChange={(e: any) => { setName(e.target.value); setErr(null); }} placeholder="e.g. Campaign Bundle" s={{ marginBottom: 12 }} />
      <Lbl>Start from</Lbl>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 14 }}>
        <Pill on={base === ""} onClick={() => startFrom("")}>Empty</Pill>
        {allKeys.map(k => <Pill key={k} on={base === k} onClick={() => startFrom(k)}>{cardTitle(rc, k)}</Pill>)}
      </div>
      {card.sections.map((sec: any, si: number) => {
        const kind = sectionKind(sec);
        const optionKind = kind === "usage" || kind === "exclusivity";
        const lib = optionKind ? [] : library(kind).filter((it: any) => !(sec.items || []).some((x: any) => x.n === it.n && x.p === it.p));
        return (
          <div key={sec.id || si} style={{ border: `1px solid ${C.rule}`, borderRadius: 2, padding: "10px 12px", marginBottom: 10, background: C.white }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <I value={sec.t} onChange={(e: any) => upSec(si, s => ({ ...s, t: e.target.value }))} s={{ flex: 1 }} />
              <button onClick={() => setCard((c: any) => ({ ...c, sections: c.sections.filter((_: any, i: number) => i !== si) }))} title="Remove section" style={{ background: "none", border: "none", cursor: "pointer", color: C.red, fontSize: TYPE.body.size, minWidth: 32, minHeight: 32 }}>✕</button>
            </div>
            <p style={{ fontSize: TYPE.micro.size, color: C.light, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 6px" }}>{KIND_LABEL[kind]}</p>
            {optionKind ? (
              <p style={{ fontSize: TYPE.label.size, color: C.muted, margin: 0 }}>Percentages come from the card's {kind === "usage" ? "usage" : "exclusivity"} options (edit them after saving).</p>
            ) : (sec.items || []).map((it: any) => (
              <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: `1px solid ${C.rule}` }}>
                <span style={{ fontSize: TYPE.label.size }}>{it.n}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: TYPE.label.size, color: C.muted, fontFamily: SERIF }}>{kind === "addons" ? addonPriceText(it) : it.p != null ? money(it.p) : it.m || ""}</span>
                  <button onClick={() => upSec(si, s => ({ ...s, items: s.items.filter((x: any) => x.id !== it.id) }))} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: TYPE.label.size, minWidth: 28, minHeight: 28 }}>✕</button>
                </span>
              </div>
            ))}
            {lib.length > 0 && (
              <S value="" onChange={(e: any) => { const it = lib.find((x: any) => `${x._from}|${x.id}` === e.target.value); if (it) { const { _from, ...clean } = it; upSec(si, s => ({ ...s, items: [...(s.items || []), { ...clean, id: uid() }] })); } }} s={{ marginTop: 8 }}>
                <option value="">+ Add item…</option>
                {lib.map((it: any) => <option key={`${it._from}|${it.id}`} value={`${it._from}|${it.id}`}>{it.n}{it.p != null ? ` — ${fmt(Number(it.p) || 0)}` : ""} · {it._from}</option>)}
              </S>
            )}
          </div>
        );
      })}
      <S value="" onChange={(e: any) => { const kind = e.target.value as SectionKind; if (kind) setCard((c: any) => ({ ...c, sections: [...c.sections, { id: uid(), t: KIND_LABEL[kind], kind, items: [] }] })); }}>
        <option value="">+ Add section…</option>
        {(Object.keys(KIND_LABEL) as SectionKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
      </S>
      {err && <p style={{ fontSize: TYPE.label.size, color: C.red, margin: "10px 0 0" }}>{err}</p>}
    </>
  );

  return (
    <>
      {askClose && (
        <ConfirmDialog title="Discard this card?" text="It hasn't been saved." okLabel="Discard" danger
          onOk={() => { setAskClose(false); onClose(); }} onCancel={() => setAskClose(false)} />
      )}
      <CardShell
        title="Add Rate Card"
        card={display}
        settings={settings}
        onClose={() => (name || card.sections.length ? setAskClose(true) : onClose())}
        panel={panel}
        footer={<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><B v="sec" onClick={() => (name || card.sections.length ? setAskClose(true) : onClose())}>Cancel</B><B onClick={save}>Save card</B></div>}
      />
    </>
  );
}

// ── Main ServiceCatalog component ─────────────────────────────
interface ServiceCatalogProps {
  rc:         any;
  upsertCard: (key: string, card: any) => Promise<string | null>;
  deleteCard: (key: string) => Promise<string | null>;
  settings:   any;
  isMobile?:  boolean;
}

export default function ServiceCatalog({ rc, upsertCard, deleteCard, settings, isMobile = false }: ServiceCatalogProps) {
  const [tab,         setTab]         = useState("influencer");
  const [edit,        setEdit]        = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [askRemove,   setAskRemove]   = useState<string | null>(null);
  const [askSection,  setAskSection]  = useState<number | null>(null);

  const tabs = [...BASE_CARD_KEYS.filter(k => rc[k]), ...Object.keys(rc).filter(k => !BASE_CARD_KEYS.includes(k) && rc[k]?.label).sort()];
  const card = normalizeCard(rc[tab] || rc.influencer);

  const setCard = (fn: (c: any) => any) => upsertCard(tab, fn(card));
  const upSec   = (si: number, fn: (s: any) => any) => setCard(c => ({ ...c, sections: c.sections.map((s: any, i: number) => i === si ? fn(s) : s) }));
  const upItem  = (si: number, id: string, patch: any) => upSec(si, s => ({ ...s, items: s.items.map((it: any) => it.id === id ? { ...it, ...patch } : it) }));
  const remItem = (si: number, id: string) => upSec(si, s => ({ ...s, items: s.items.filter((it: any) => it.id !== id) }));
  const addItem = (si: number, kind: SectionKind) => upSec(si, s => ({
    ...s,
    items: [...s.items, kind === "addons" ? { id: uid(), n: "New add-on", note: "", p: 50, pct: null, perMonth: false, info: false }
      : kind === "info" ? { id: uid(), n: "New line", note: "", p: null, m: "" }
      : kind === "packages" ? { id: uid(), n: "New package", note: "", p: 0, includes: [] }
      : { id: uid(), n: "New item", note: "", p: 0 }],
  }));
  const optKey = (kind: SectionKind) => (kind === "usage" ? "usage" : "excl");
  const upOpt  = (kind: SectionKind, i: number, patch: any) => setCard(c => ({ ...c, [optKey(kind)]: c[optKey(kind)].map((o: any, j: number) => j === i ? { ...o, ...patch } : o) }));
  const remOpt = (kind: SectionKind, i: number) => setCard(c => ({ ...c, [optKey(kind)]: c[optKey(kind)].filter((_: any, j: number) => j !== i) }));
  const addOpt = (kind: SectionKind) => setCard(c => ({ ...c, [optKey(kind)]: [...c[optKey(kind)], { l: kind === "usage" ? "Paid ads — 1 month" : "Category — 1 month", pct: 0, mo: 1 }] }));

  const confirmRemove = () => {
    const k = askRemove; setAskRemove(null);
    if (!k) return;
    deleteCard(k);
    if (tab === k) setTab("influencer");
  };
  const saveBuilt = (key: string, built: any) => { upsertCard(key, built); setTab(key); setShowBuilder(false); };

  const LinkBtn = ({ onClick, children }: any) => (
    <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: SANS, fontSize: TYPE.micro.size, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" as const, padding: "17px 0", lineHeight: 1, flexShrink: 0 }}>{children}</button>
  );
  const CompactB = ({ onClick, children }: any) => (
    <button onClick={onClick} style={{ background: C.black, color: C.white, border: "none", borderRadius: 2, minHeight: 36, padding: "0 16px", cursor: "pointer", fontFamily: SANS, fontSize: TYPE.micro.size, letterSpacing: "0.10em", textTransform: "uppercase" as const, flexShrink: 0 }}>{children}</button>
  );
  const smallX = (onClick: () => void, title = "Remove") => (
    <button onClick={onClick} title={title} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: TYPE.body.size, minWidth: 32, minHeight: 32, flexShrink: 0 }}>✕</button>
  );
  const deliverableNames = card.sections.filter((s: any) => sectionKind(s) === "deliverables").flatMap((s: any) => (s.items || []).map((it: any) => it.n)).filter(Boolean);

  return (
    <div>
      {askRemove && (
        <ConfirmDialog title={`Delete "${rc[askRemove]?.label || askRemove}"?`} text="This rate card is removed. Quotes already made keep their prices." okLabel="Delete" danger
          onOk={confirmRemove} onCancel={() => setAskRemove(null)} />
      )}
      {askSection !== null && (
        <ConfirmDialog title={`Remove "${cleanSecT(card.sections[askSection]?.t)}"?`} text="The section and its items are removed from this card." okLabel="Remove" danger
          onOk={() => { const si = askSection; setAskSection(null); setCard(c => ({ ...c, sections: c.sections.filter((_: any, i: number) => i !== si) })); }}
          onCancel={() => setAskSection(null)} />
      )}
      {showBuilder && <AddCardModal rc={rc} settings={settings} onSave={saveBuilt} onClose={() => setShowBuilder(false)} />}
      {showPreview && <RateCardPreview card={card} settings={settings} onSave={(saved: any) => upsertCard(tab, saved)} onClose={() => setShowPreview(false)} />}

      {/* ── HEADER ── */}
      <div>
        <h2 style={{ fontFamily: SERIF, fontSize: TYPE.pageTitle.size, fontWeight: "normal", margin: "0 0 4px" }}>Service Catalog</h2>
        <p style={{ fontSize: TYPE.micro.size, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" as const, margin: "0 0 6px" }}>The only price list — the Calculator uses it</p>
      </div>

      {/* ── ACTION ROW ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, borderBottom: `1px solid ${C.rule}`, marginBottom: 14 }}>
        {edit ? (
          <>
            <S value="" onChange={(e: any) => { const kind = e.target.value as SectionKind; if (kind) setCard(c => ({ ...c, sections: [...c.sections, { id: uid(), t: KIND_LABEL[kind], kind, items: [] }] })); }} s={{ width: "auto", minWidth: 150, height: 36, margin: "6px 0" }}>
              <option value="">+ Section…</option>
              {(Object.keys(KIND_LABEL) as SectionKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </S>
            <div style={{ flex: 1 }} />
            <CompactB onClick={() => setEdit(false)}>Done</CompactB>
          </>
        ) : (
          <>
            <LinkBtn onClick={() => setShowPreview(true)}>Rate Card PDF</LinkBtn>
            <LinkBtn onClick={() => setShowBuilder(true)}>+ Add Card</LinkBtn>
            <div style={{ flex: 1 }} />
            <CompactB onClick={() => setEdit(true)}>Edit</CompactB>
          </>
        )}
      </div>

      {/* ── CARD TABS ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, alignItems: "center", ...(isMobile ? { overflowX: "auto" as const, flexWrap: "nowrap" as const, WebkitOverflowScrolling: "touch" as any, paddingBottom: 2 } : { flexWrap: "wrap" as const }) }}>
        {tabs.map(k => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            <Pill on={tab === k} onClick={() => setTab(k)}>{cardTitle(rc, k)}</Pill>
            {!BASE_CARD_KEYS.includes(k) && smallX(() => setAskRemove(k), "Delete card")}
          </div>
        ))}
      </div>

      {/* ── SECTIONS ── */}
      {card.sections.map((sec: any, si: number) => {
        const kind = sectionKind(sec);
        const optionKind = kind === "usage" || kind === "exclusivity";
        const opts = optionKind ? card[optKey(kind)] : [];
        return (
          <div key={sec.id || si} style={{ marginBottom: 16 }}>
            {/* Section title */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: `1px solid ${C.rule}` }}>
              {edit ? (
                <>
                  <I value={sec.t} onChange={(e: any) => upSec(si, s => ({ ...s, t: e.target.value }))} s={{ flex: 1 }} />
                  <span style={{ fontSize: TYPE.micro.size, color: C.light, letterSpacing: "0.06em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>{KIND_LABEL[kind]}</span>
                  {smallX(() => setAskSection(si), "Remove section")}
                </>
              ) : (
                <span style={{ fontSize: TYPE.label.size, color: C.muted, letterSpacing: "0.09em", textTransform: "uppercase" as const, border: `1px solid ${C.rule}`, padding: "3px 9px", borderRadius: 2 }}>{cleanSecT(sec.t)}</span>
              )}
            </div>

            {/* Usage / exclusivity: one list of options with months and % */}
            {optionKind && (edit ? (
              <>
                {opts.map((o: any, i: number) => o.sentinel ? null : (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.rule}`, flexWrap: isMobile ? "wrap" as const : "nowrap" as const }}>
                    <I value={optName(o.l)} onChange={(e: any) => upOpt(kind, i, { l: e.target.value })} s={{ flex: isMobile ? "1 1 100%" : 1 }} />
                    <I type="number" min={0} value={o.mo} onChange={(e: any) => upOpt(kind, i, { mo: Math.max(0, parseInt(e.target.value) || 0) })} s={{ width: 64 }} />
                    <span style={{ fontSize: TYPE.label.size, color: C.muted }}>mo.</span>
                    <NumField minDec={0} value={o.pct} onChange={(n) => upOpt(kind, i, { pct: Math.max(0, n || 0) })} s={{ width: 72 }} ariaLabel="Percent" />
                    <span style={{ fontSize: TYPE.label.size, color: C.muted }}>%</span>
                    {smallX(() => remOpt(kind, i))}
                  </div>
                ))}
                <B v="sec" onClick={() => addOpt(kind)} s={{ marginTop: 8, minHeight: 36 }}>+ Option</B>
                <p style={{ fontSize: TYPE.label.size, color: C.muted, margin: "6px 0 0" }}>0 % = included. Used by the Calculator, the PDF and renewals.</p>
              </>
            ) : sectionRows(card, sec).map(r => (
              <div key={r.key} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.rule}` }}>
                <span style={{ fontSize: TYPE.body.size }}>{r.n}</span>
                <span style={{ fontFamily: SERIF, fontSize: TYPE.label.size, whiteSpace: "nowrap" as const, marginLeft: 12 }}>{r.price}</span>
              </div>
            )))}

            {/* Items */}
            {!optionKind && (sec.items || []).map((it: any) => (
              <div key={it.id} style={{ padding: "7px 0", borderBottom: `1px solid ${C.rule}` }}>
                {edit ? (
                  <>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: isMobile ? "wrap" as const : "nowrap" as const }}>
                      <I value={it.n} onChange={(e: any) => upItem(si, it.id, { n: e.target.value })} s={{ flex: isMobile ? "1 1 100%" : 1 }} />
                      <I value={it.note || ""} onChange={(e: any) => upItem(si, it.id, { note: e.target.value })} s={{ flex: 1 }} placeholder="note" />
                      {kind === "info" ? (
                        <I value={it.m || ""} onChange={(e: any) => upItem(si, it.id, { m: e.target.value })} s={{ width: 110 }} placeholder="text" />
                      ) : kind === "addons" ? (
                        <>
                          <S value={it.pct !== null && it.pct !== undefined && (it.p === null || it.p === undefined) ? "pct" : "eur"}
                             onChange={(e: any) => upItem(si, it.id, e.target.value === "pct" ? { pct: it.pct ?? 30, p: null } : { p: it.p ?? 50, pct: null })} s={{ width: 70 }}>
                            <option value="eur">€</option>
                            <option value="pct">%</option>
                          </S>
                          <NumField minDec={it.p !== null && it.p !== undefined ? 2 : 0}
                             value={it.p !== null && it.p !== undefined ? it.p : (it.pct ?? null)}
                             onChange={(n) => { const v = Math.max(0, n || 0); upItem(si, it.id, it.p !== null && it.p !== undefined ? { p: v } : { pct: v }); }} s={{ width: 80 }} ariaLabel="Add-on price" />
                        </>
                      ) : (
                        <NumField value={it.p ?? null} onChange={(n) => upItem(si, it.id, { p: n === null ? null : Math.max(0, n) })} ariaLabel="Price" s={{ width: 80 }} placeholder="€" />
                      )}
                      {smallX(() => remItem(si, it.id))}
                    </div>
                    {kind === "addons" && (
                      <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" as const }}>
                        <Tick on={!!it.perMonth} onClick={() => upItem(si, it.id, { perMonth: !it.perMonth })} size={18} label="per month" />
                        <Tick on={!!it.info} onClick={() => upItem(si, it.id, { info: !it.info })} size={18} label="info only (not charged)" />
                      </div>
                    )}
                    {kind === "packages" && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, alignItems: "center" }}>
                          <span style={{ fontSize: TYPE.label.size, color: C.muted }}>Includes:</span>
                          {(it.includes || []).map((inc: any, k: number) => (
                            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: TYPE.label.size, border: `1px solid ${C.rule}`, borderRadius: 2, padding: "2px 4px 2px 8px" }}>
                              <input type="number" min={1} value={inc.qty || 1}
                                onChange={(e: any) => upItem(si, it.id, { includes: it.includes.map((x: any, j: number) => j === k ? { ...x, qty: Math.max(1, parseInt(e.target.value) || 1) } : x) })}
                                style={{ width: 44, fontSize: TYPE.sectionHeading.size, border: "none", background: "transparent", fontFamily: SANS }} />
                              × {inc.n}
                              {smallX(() => upItem(si, it.id, { includes: it.includes.filter((_: any, j: number) => j !== k) }))}
                            </span>
                          ))}
                          {deliverableNames.length > 0 && (
                            <S value="" onChange={(e: any) => { const n = e.target.value; if (n) upItem(si, it.id, { includes: [...(it.includes || []), { n, qty: 1 }] }); }} s={{ width: "auto", minWidth: 170, height: 36 }}>
                              <option value="">+ Add content…</option>
                              {deliverableNames.map((n: string) => <option key={n} value={n}>{n}</option>)}
                            </S>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ fontSize: TYPE.body.size, color: C.black, margin: "0 0 3px" }}>{pctSpace(it.n)}{kind === "addons" && it.info ? <span style={{ fontSize: TYPE.micro.size, color: C.light, marginLeft: 6, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>info</span> : null}</p>
                      {it.note && <p style={{ fontSize: TYPE.subtext.size, color: C.muted, margin: 0 }}>{pctSpace(it.note)}</p>}
                      {kind === "packages" && it.includes?.length > 0 && <p style={{ fontSize: TYPE.subtext.size, color: C.muted, margin: "2px 0 0" }}>Includes {it.includes.map((x: any) => `${x.qty || 1}× ${x.n}`).join(", ")}</p>}
                    </div>
                    <span style={{ fontFamily: SERIF, fontSize: TYPE.label.size, color: C.black, whiteSpace: "nowrap" as const, marginLeft: 12 }}>
                      {kind === "addons" ? addonPriceText(it) : it.p !== null && it.p !== undefined ? money(it.p) : pctSpace(it.m || "")}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {edit && !optionKind && <B v="sec" onClick={() => addItem(si, kind)} s={{ marginTop: 8, minHeight: 36 }}>+ Add</B>}
          </div>
        );
      })}

      {/* ── FINE PRINT ── */}
      {edit ? (
        <div style={{ marginTop: 10 }}>
          <Lbl>Fine Print</Lbl>
          <textarea value={card.fine || ""} onChange={(e: any) => setCard(c => ({ ...c, fine: e.target.value }))}
            style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.rule}`, background: C.bg, fontFamily: SANS, fontSize: TYPE.sectionHeading.size, color: C.black, borderRadius: 2, outline: "none", resize: "vertical" as const, boxSizing: "border-box" as const, minHeight: 64 }} />
        </div>
      ) : (
        <p style={{ fontSize: TYPE.label.size, color: C.muted, lineHeight: 1.75, marginTop: 10 }}>{pctSpace(card.fine)}</p>
      )}
    </div>
  );
}
