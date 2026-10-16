// ─────────────────────────────────────────────────────────────
// RenewalModal — usage rights / exclusivity renewal (or a rights
// extension as an amendment). One window: builder on the left,
// the live document on the right. Percentages come from each
// line's own rate card; the base is the line's base price (before
// earlier usage / exclusivity / add-ons). Saving creates the draft
// invoice (renewal) or the draft amendment; the caller opens it.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { editLock } from "./saveStatus";
import { C, SANS, SERIF, TYPE, Z } from "./constants";
import { fmt, fmtD, addM, addD, today, r2 } from "./formatters";
import { I, S, B, Lbl, Pill, CatPill, LangSwitch, BAR_BTN, NumField } from "./atoms";
import DocPages from "./DocPages";
import { dueFrom } from "./docs";
import type { DocView } from "./docs";
import { normalizeCards, lineBase, renewalOptions, pctOn, optName, pctText, renewalStart } from "./pricing";

type Mode = "none" | "predefined" | "custom";

export default function RenewalModal({ p, onSave, onClose, rc: rawRc, settings, client, mode = "renewal", onCalc }: any) {
  const isAmendMode = mode === "amend";
  const rc = useMemo(() => normalizeCards(rawRc), [rawRc]);
  useEffect(() => editLock.acquire(), []);
  const q = p.qd;

  // all billable lines from the quote + signed amendments
  const allLines = useMemo(() => {
    const orig  = (q?.lines || []).map((l: any) => ({ ...l, _src: "quote" }));
    const amend = (p.amendments || []).filter((a: any) => a.signed).flatMap((a: any) => (a.lines || []).map((l: any) => ({ ...l, _src: a.aNo || "Amendment" })));
    return [...orig, ...amend].filter((l: any) => Number(l.amt) > 0).map((l: any, i: number) => ({
      ...l, _key: l.id || `line_${i}`, _unitBase: r2(lineBase(l) / Math.max(1, parseInt(l.qty) || 1)),
    }));
  }, [q, p.amendments]);

  // ── 01 which deliverables ──
  const [selQty, setSelQty] = useState<Record<string, number>>({});
  const setQty = (key: string, max: number, val: number) => setSelQty(s => ({ ...s, [key]: Math.max(0, Math.min(max, val)) }));
  const selected = allLines.filter((l: any) => (selQty[l._key] || 0) > 0).map((l: any) => ({ l, qty: selQty[l._key], base: r2(l._unitBase * selQty[l._key]) }));
  const base = r2(selected.reduce((s: number, x: any) => s + x.base, 0));
  const mainCat = selected[0]?.l.cat || q?.ctab || allLines[0]?.cat || "influencer";

  // ── 02 usage / 03 exclusivity (options from the line's own card) ──
  const uOpts = renewalOptions(rc, rc[mainCat] ? mainCat : "influencer", "usage");
  const eOpts = renewalOptions(rc, rc[mainCat] ? mainCat : "influencer", "excl");
  const [uMode, setUMode] = useState<Mode>("none");
  const [eMode, setEMode] = useState<Mode>("none");
  const [uIdx, setUIdx] = useState(() => Math.max(0, uOpts.findIndex((o: any) => Number(o.pct) > 0)));
  const [eIdx, setEIdx] = useState(0);
  const [uN, setUN] = useState(""); const [uUnit, setUUnit] = useState<"months" | "days">("months");
  const [eN, setEN] = useState(""); const [eUnit, setEUnit] = useState<"months" | "days">("months");
  const [uFeeIn, setUFeeIn] = useState<string | null>(null);   // manual override (custom)
  const [eFeeIn, setEFeeIn] = useState<string | null>(null);
  const uOpt = uOpts[Math.min(uIdx, uOpts.length - 1)];
  const eOpt = eOpts[Math.min(eIdx, eOpts.length - 1)];

  // fee for a set of lines: each line uses its own card's % for the chosen option
  const feeFor = (kind: "usage" | "excl", opt: any, factor: number) =>
    Math.round(selected.reduce((s: number, x: any) => s + x.base * pctOn(rc, x.l.cat || mainCat, kind, opt) / 100 * factor, 0));
  const factorOf = (opt: any, n: string, unit: "months" | "days") => {
    const v = parseInt(n) || 0;
    const refMo = Number(opt?.mo) || 1;
    return unit === "months" ? v / refMo : v / (refMo * 30);
  };
  const uCalc = uMode === "predefined" ? feeFor("usage", uOpt, 1) : uMode === "custom" ? feeFor("usage", uOpt, factorOf(uOpt, uN, uUnit)) : 0;
  const eCalc = eMode === "predefined" ? feeFor("excl", eOpt, 1) : eMode === "custom" ? feeFor("excl", eOpt, factorOf(eOpt, eN, eUnit)) : 0;
  const uFee = uMode === "custom" && uFeeIn !== null ? Math.max(0, parseFloat(uFeeIn) || 0) : uCalc;
  const eFee = eMode === "custom" && eFeeIn !== null ? Math.max(0, parseFloat(eFeeIn) || 0) : eCalc;

  // ── 04 dates: start = day after the current license ends ──
  const [startD, setStartD] = useState(() => renewalStart(p));
  const endOf = (m: Mode, opt: any, n: string, unit: "months" | "days") =>
    m === "predefined" ? addM(startD, Number(opt?.mo) || 0)
    : m === "custom" ? (unit === "months" ? addM(startD, parseInt(n) || 0) : addD(startD, parseInt(n) || 0))
    : null;
  const uEnd = endOf(uMode, uOpt, uN, uUnit);
  const eEnd = endOf(eMode, eOpt, eN, eUnit);
  const endD = uEnd && eEnd ? (uEnd > eEnd ? uEnd : eEnd) : uEnd || eEnd;
  const totalFee = uFee + eFee;
  const canSave = base > 0 && (uMode !== "none" || eMode !== "none") && totalFee > 0;

  // ── the document being built (shown live on the right) ──
  const doc: DocView = useMemo(() => {
    const items = selected.map((x: any) => `${x.qty}× ${x.l.name}`).join(", ");
    const lines: any[] = [];
    const lineFor = (title: string, m: Mode, opt: any, n: string, unit: string, fee: number, end: string | null, kind: "usage" | "excl") => {
      const label = m === "predefined" ? optName(opt?.l) : `${n} ${unit}`;
      const pctNote = m === "predefined"
        ? ` · ${fmt(base)} × ${pctText(pctOn(rc, mainCat, kind, opt))}`
        : ` · pro rata of ${optName(opt?.l)}`;
      lines.push({ name: `${title} — ${label}`, note: `${items}${pctNote} · ${fmtD(startD)}${end ? ` → ${fmtD(end)}` : ""}`, qty: 1, up: fee, amt: fee });
    };
    if (uMode !== "none" && uFee > 0) lineFor("Usage Rights", uMode, uOpt, uN, uUnit, uFee, uEnd, "usage");
    if (eMode !== "none" && eFee > 0) lineFor("Exclusivity", eMode, eOpt, eN, eUnit, eFee, eEnd, "excl");
    const common = { brand: q?.brand, contact: q?.contact, ctype: q?.ctype || "Content Creator", lines, startDate: startD, endDate: endD, footer: "" };
    const d0 = today();
    return isAmendMode
      ? { kind: "amendment", docNo: "", revision: 0, status: "draft", docDate: d0, lang: "en", data: { ...common, amendTotal: totalFee, origTotal: p.amount || 0 } }
      : { kind: "invoice", subtype: "renewal", docNo: "", revision: 0, status: "draft", docDate: d0, dueDate: dueFrom(d0), periodStart: startD, periodEnd: endD || startD, lang: "en", data: common };
  }, [selected.map((x: any) => `${x.l._key}:${x.qty}`).join(","), uMode, eMode, uIdx, eIdx, uN, eN, uUnit, eUnit, uFee, eFee, startD, endD]);

  const [lang, setLang]     = useState("en");
  const [winW, setWinW]     = useState(() => window.innerWidth);
  const [view, setView]     = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);
  useEffect(() => {
    const fn = () => setWinW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  const isM = winW < 768;
  const scale = isM ? Math.min(1, (winW - 32) / 595) : 1;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true); setErr(null);
    const optLabelText = [
      uMode !== "none" ? (uMode === "predefined" ? optName(uOpt?.l) : `Usage ${uN} ${uUnit} (${optName(uOpt?.l)})`) : "",
      eMode !== "none" ? (eMode === "predefined" ? optName(eOpt?.l) : `Exclusivity ${eN} ${eUnit} (${optName(eOpt?.l)})`) : "",
    ].filter(Boolean).join(" + ") || "Renewal";
    const usageEnd = uMode !== "none" && uFee > 0 ? uEnd : null;
    const exclEnd  = eMode !== "none" && eFee > 0 ? eEnd : null;
    const record = isAmendMode
      ? { aNo: "", lines: doc.data.lines, amendTotal: totalFee, origTotal: p.amount || 0, signed: false, doc: { kind: "extension", usageEnd, exclEnd } }
      : { optLabel: optLabelText, startDate: startD, endDate: endD, usageEnd, exclEnd, fee: totalFee, rNo: "", signed: true, paid: false, doc: {} };
    try { await onSave(record, { ...doc, lang: lang as any }); }
    catch (e: any) { setErr(e?.message || "Save failed"); setSaving(false); }
  };

  // plain render helpers (not components) so inputs keep focus while typing
  const section = (n: string, title: string, children: any) => (
    <div style={{ border: `1px solid ${C.rule}`, borderRadius: 2, padding: "10px 12px", marginBottom: 10, background: C.white }}>
      <p style={{ fontSize: TYPE.micro.size, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 10px", paddingBottom: 6, borderBottom: `1px solid ${C.rule}` }}>{n} — {title}</p>
      {children}
    </div>
  );
  const modeToggle = (val: Mode, set: (v: Mode) => void) => (
    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
      <Pill on={val === "none"} onClick={() => set("none")}>None</Pill>
      <Pill on={val === "predefined"} onClick={() => set("predefined")}>From rate card</Pill>
      <Pill on={val === "custom"} onClick={() => set("custom")}>Custom</Pill>
    </div>
  );
  const optText = (o: any) => `${optName(o.l)}${Number(o.pct) > 0 ? ` (+${pctText(o.pct)})` : " (included)"}`;
  const customBlock = ({ opt, opts, idx, setIdx, n, setN, unit, setUnit, calc, feeIn, setFeeIn }: any) => (
    <>
      <Lbl>Reference option <span style={{ fontWeight: "normal", color: C.light }}>(for the pro-rata fee)</span></Lbl>
      <S value={idx} onChange={(e: any) => { setIdx(parseInt(e.target.value)); setFeeIn(null); }} s={{ marginBottom: 8 }}>
        {opts.map((o: any, i: number) => <option key={i} value={i}>{optText(o)}</option>)}
      </S>
      <div style={{ display: "flex", gap: 7, marginBottom: 6 }}>
        <I type="number" min={1} placeholder="Duration" value={n} onChange={(e: any) => { setN(e.target.value); setFeeIn(null); }} s={{ flex: 1 }} />
        <S value={unit} onChange={(e: any) => { setUnit(e.target.value); setFeeIn(null); }} s={{ flex: 1 }}>
          <option value="months">Months</option>
          <option value="days">Days</option>
        </S>
      </div>
      {(parseInt(n) || 0) > 0 && base > 0 && (
        <p style={{ fontSize: TYPE.label.size, color: C.muted, margin: "0 0 6px" }}>
          Pro rata: {n} {unit} of {Number(opt?.mo) || 1} {Number(opt?.mo) === 1 ? "month" : "months"} → {fmt(calc)}
        </p>
      )}
      <Lbl>Fee (€)</Lbl>
      <NumField value={feeIn !== null ? (parseFloat(feeIn) || 0) : calc} onChange={(n) => setFeeIn(String(n === null ? 0 : Math.max(0, n)))} ariaLabel="Fee" />
    </>
  );

  const panel = (
    <>
      <p style={{ fontSize: TYPE.label.size, color: C.muted, margin: "0 0 12px" }}>Project: <strong style={{ color: C.black }}>{p.name}</strong></p>
      {isAmendMode && (
        <p style={{ fontSize: TYPE.label.size, color: C.muted, margin: "0 0 12px", lineHeight: 1.5 }}>
          Extend usage rights or exclusivity on items already delivered — the items are not charged again.{" "}
          {onCalc && <button onClick={onCalc} style={{ background: "none", border: "none", cursor: "pointer", color: C.black, fontSize: TYPE.label.size, padding: 0, textDecoration: "underline", fontFamily: SANS }}>Adding new deliverables? Open Calculator →</button>}
        </p>
      )}

      {section("01", "Which deliverables", <>
        <p style={{ fontSize: TYPE.label.size, color: C.muted, margin: "0 0 8px" }}>The % is taken from each item's base price (without earlier usage, exclusivity or add-ons).</p>
        {allLines.map((l: any) => {
          const max = Math.max(1, parseInt(l.qty) || 1);
          const qty = selQty[l._key] || 0;
          return (
            <div key={l._key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.rule}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
                  <span style={{ fontSize: TYPE.label.size, color: C.black }}>{l.name}</span>
                  {l.cat && <CatPill cat={l.cat} label={l.catLabel} />}
                  {l._src !== "quote" && <span style={{ fontSize: TYPE.micro.size, color: C.amber }}>{l._src}</span>}
                </div>
                <span style={{ fontSize: TYPE.micro.size, color: C.light }}>base {fmt(l._unitBase)} each · max {max}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <button onClick={() => setQty(l._key, max, qty - 1)} style={{ width: 32, height: 32, border: `1px solid ${C.rule}`, borderRadius: 2, background: "none", cursor: "pointer", fontSize: TYPE.body.size, color: qty > 0 ? C.black : C.light }}>−</button>
                <span style={{ fontSize: TYPE.label.size, fontFamily: SERIF, minWidth: 18, textAlign: "center" as const }}>{qty}</span>
                <button onClick={() => setQty(l._key, max, qty + 1)} style={{ width: 32, height: 32, border: `1px solid ${C.rule}`, borderRadius: 2, background: "none", cursor: "pointer", fontSize: TYPE.body.size, color: qty < max ? C.black : C.light }}>+</button>
              </div>
            </div>
          );
        })}
        {base > 0 && <p style={{ fontSize: TYPE.label.size, color: C.muted, margin: "8px 0 0", textAlign: "right" as const }}>Base: <strong style={{ color: C.black, fontFamily: SERIF }}>{fmt(base)}</strong></p>}
      </>)}

      {section("02", "Usage rights", <>
        {modeToggle(uMode, setUMode)}
        {uMode === "predefined" && <>
          <S value={uIdx} onChange={(e: any) => setUIdx(parseInt(e.target.value))} s={{ marginBottom: 6 }}>
            {uOpts.map((o: any, i: number) => <option key={i} value={i}>{optText(o)}</option>)}
          </S>
          {base > 0 && <p style={{ fontSize: TYPE.label.size, color: C.muted, margin: 0 }}>Fee: <strong style={{ color: C.black, fontFamily: SERIF }}>{fmt(uFee)}</strong></p>}
        </>}
        {uMode === "custom" && customBlock({ opt: uOpt, opts: uOpts, idx: uIdx, setIdx: setUIdx, n: uN, setN: setUN, unit: uUnit, setUnit: setUUnit, calc: uCalc, feeIn: uFeeIn, setFeeIn: setUFeeIn })}
      </>)}

      {section("03", "Exclusivity", <>
        {modeToggle(eMode, setEMode)}
        {eMode === "predefined" && <>
          <S value={eIdx} onChange={(e: any) => setEIdx(parseInt(e.target.value))} s={{ marginBottom: 6 }}>
            {eOpts.map((o: any, i: number) => <option key={i} value={i}>{optText(o)}</option>)}
          </S>
          {base > 0 && <p style={{ fontSize: TYPE.label.size, color: C.muted, margin: 0 }}>Fee: <strong style={{ color: C.black, fontFamily: SERIF }}>{fmt(eFee)}</strong></p>}
        </>}
        {eMode === "custom" && customBlock({ opt: eOpt, opts: eOpts, idx: eIdx, setIdx: setEIdx, n: eN, setN: setEN, unit: eUnit, setUnit: setEUnit, calc: eCalc, feeIn: eFeeIn, setFeeIn: setEFeeIn })}
      </>)}

      {section("04", "Dates", <>
        <Lbl>Start date <span style={{ fontWeight: "normal", color: C.light }}>(day after the current license ends)</span></Lbl>
        <I type="date" value={startD} onChange={(e: any) => setStartD(e.target.value)} s={{ marginBottom: 6 }} />
        {endD && <p style={{ fontSize: TYPE.label.size, color: C.muted, margin: 0 }}>End date: <strong style={{ color: C.black }}>{fmtD(endD)}</strong></p>}
      </>)}
    </>
  );

  const footer = (
    <>
      {err && <p style={{ fontSize: TYPE.label.size, color: C.red, margin: "0 0 8px" }}>{err}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: TYPE.micro.size, color: C.muted, letterSpacing: "0.07em", textTransform: "uppercase" as const }}>{isAmendMode ? "Amendment total" : "Renewal total"}</span>
        <span style={{ fontFamily: SERIF, fontSize: TYPE.sectionHeading.size }}>{fmt(totalFee)}</span>
        <div style={{ flex: 1 }} />
        <B onClick={save} s={{ opacity: canSave && !saving ? 1 : 0.4 }}>{saving ? "Saving…" : isAmendMode ? "Save amendment" : "Save renewal"}</B>
      </div>
      <p style={{ fontSize: TYPE.micro.size, color: C.light, margin: "6px 0 0" }}>
        {isAmendMode ? "Saved as a draft amendment — the number is assigned when you save." : "Saved as a draft invoice — the number is assigned when you finalize it."}
      </p>
    </>
  );

  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: Z.modal, display: "flex", flexDirection: "column", fontFamily: SANS }}>
      <div style={{ borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
        <div style={{ height: 44, display: "flex", alignItems: "center", padding: "0 8px 0 2px", gap: 6 }}>
          <button onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 20 }}>✕</button>
          <span style={{ fontFamily: SERIF, fontSize: TYPE.body.size, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{isAmendMode ? "Amendment — Rights Extension" : "Add Renewal"}</span>
          <div style={{ flex: 1 }} />
          <LangSwitch lang={lang} onChange={setLang as any} />
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
          <div style={{ width: isM ? "100%" : 400, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: isM ? "none" : `1px solid ${C.rule}` }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px 14px" }}>{panel}</div>
            <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.rule}`, flexShrink: 0 }}>{footer}</div>
          </div>
        )}
        {(!isM || view === "preview") && (
          <div style={{ flex: 1, background: "#888", overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: isM ? "20px 12px" : "32px 28px", gap: isM ? 16 : 28 }}>
            <DocPages doc={{ ...doc, lang: lang as any }} settings={settings} client={client} lang={lang} scale={scale} />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
