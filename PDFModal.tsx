// ─────────────────────────────────────────────────────────────
// PDFModal — the one document modal
// Preview (all pages) + edit panel for drafts. Sent / signed /
// paid documents are read-only. Status actions (Mark sent,
// Finalize, Mark paid …) come from the caller and sit in one bar.
// After Save the modal stays open and returns to the read view.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useMemo } from "react";
import { C, SANS, SERIF, TYPE, Z } from "./constants";
import { I, B, Lbl, Pill, ConfirmDialog, LangSwitch, BAR_BTN, NumField } from "./atoms";
import { editLock } from "./saveStatus";
import { fmt, r2 } from "./formatters";
import { openPdfWindow } from "./PDFExport";
import DocPages, { downloadDocPdf } from "./DocPages";
import { clauseContext, clauseTemplates, fillTokens, tokenizeClause } from "./A4Document";
import { STATUS_LABEL, docFileName, lineAmt, lineQty } from "./docs";
import type { DocView } from "./docs";

export interface DocAction {
  key:      string;
  label:    string;
  kind?:    "pri" | "sec" | "danger";
  confirm?: string;                       // ask before running
  date?:    string;                       // ask for a date (label) before running
  run:      (date?: string) => Promise<void> | void;
}

interface PDFModalProps {
  doc:        DocView;
  settings:   any;
  client?:    any;
  editable:   boolean;
  isNew?:     boolean;
  justSaved?: boolean;
  note?:      string;
  onSave?:    (next: DocView) => Promise<DocView | void>;   // returns the stored document
  onPdf?:     (d: DocView) => Promise<DocView>;            // before the PDF: mark sent / finalize
  pdfConfirm?:(d: DocView) => string | null;               // one question before the PDF (draft invoices)
  actions?:   DocAction[];
  onClose:    () => void;
}

const clone = (x: any) => JSON.parse(JSON.stringify(x));

const STATUS_COLOR: Record<string, string> = {
  draft: C.amber, sent: C.blue, signed: C.green, paid: C.green, cancelled: C.red, superseded: C.light,
};

export default function PDFModal({
  doc, settings, client, editable, isNew, justSaved, note, onSave, onPdf, pdfConfirm, actions = [], onClose,
}: PDFModalProps) {
  const [hs,           setHs]           = useState({ hist: [clone(doc)], idx: 0 });
  const [lang,         setLang]         = useState<"en" | "de">(doc.lang || "en");
  const [panelW,       setPanelW]       = useState(380);
  const [flash,        setFlash]        = useState<string | null>(justSaved ? "saved" : null);
  const [saving,       setSaving]       = useState(false);
  const [busy,         setBusy]         = useState<string | null>(null);
  const [err,          setErr]          = useState<string | null>(null);
  const [downloading,  setDownloading]  = useState(false);
  const [showEdit,     setShowEdit]     = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [dialog,       setDialog]       = useState<{ action: DocAction } | null>(null);
  const [pdfAsk,       setPdfAsk]       = useState<string | null>(null);
  const [winW,         setWinW]         = useState(() => window.innerWidth);

  const baseRef  = useRef<string>(JSON.stringify({ ...clone(doc), lang: doc.lang || "en" }));
  const pagesRef = useRef<HTMLDivElement>(null);

  const staged   = hs.hist[hs.idx] as DocView;
  const current  = useMemo(() => ({ ...staged, lang } as DocView), [staged, lang]);
  const dirty    = editable && JSON.stringify(current) !== baseRef.current;
  const isMobile = winW < 768;
  const pageScale = isMobile ? Math.min(1, (winW - 32) / 595) : 1;
  const canEdit  = editable && !!onSave;

  useEffect(() => {
    const fn = () => setWinW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // no background reloads while a document is open
  useEffect(() => editLock.acquire(), []);

  // A fresh document from the parent (after Finalize, Mark paid …):
  // take it over unless the user is in the middle of editing.
  useEffect(() => {
    const incoming = JSON.stringify({ ...clone(doc), lang: doc.lang || "en" });
    if (incoming === baseRef.current) return;
    if (!dirty) {
      setHs({ hist: [clone(doc)], idx: 0 });
      setLang(doc.lang || "en");
      baseRef.current = incoming;
    }
  }, [doc]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  // ── History ─────────────────────────────────────────────────
  const setStaged = (fn: (p: DocView) => DocView) =>
    setHs(prev => {
      const next = [...prev.hist.slice(0, prev.idx + 1), clone(fn(prev.hist[prev.idx]))];
      return { hist: next, idx: next.length - 1 };
    });
  const setData = (fn: (d: any) => any) => setStaged(p => ({ ...p, data: fn(p.data || {}) }));
  const canUndo = hs.idx > 0;
  const canRedo = hs.idx < hs.hist.length - 1;
  const undo = () => canUndo && setHs(p => ({ ...p, idx: p.idx - 1 }));
  const redo = () => canRedo && setHs(p => ({ ...p, idx: p.idx + 1 }));

  // ── Save ────────────────────────────────────────────────────
  const save = async (): Promise<boolean> => {
    if (!onSave || saving) return false;
    setSaving(true); setErr(null);
    try {
      await onSave(current);
      baseRef.current = JSON.stringify(current);
      setFlash("saved");
      if (isMobile) setShowEdit(false);      // back to the read view
      return true;
    } catch (e: any) {
      setErr(e?.message || "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ── Actions (Mark sent, Finalize …) ─────────────────────────
  const runAction = async (a: DocAction, date?: string) => {
    setErr(null);
    if (dirty || isNew) {                   // unsaved edits are saved first
      const ok = await save();
      if (!ok) return;
    }
    setBusy(a.key);
    try { await a.run(date); }
    catch (e: any) { setErr(e?.message || "Something went wrong"); }
    finally { setBusy(null); }
  };
  const clickAction = (a: DocAction) => {
    if (a.date || a.confirm) setDialog({ action: a });
    else runAction(a);
  };

  // ── Close ───────────────────────────────────────────────────
  const tryClose = () => {
    if (canEdit && (isNew || dirty)) { setConfirmClose(true); return; }
    onClose();
  };

  // ── Save PDF ────────────────────────────────────────────────
  // One tap: saves unsaved changes, brings a draft to "sent" (an invoice
  // gets its number), then draws the document fresh and saves the PDF.
  // Nothing in the profile is required — missing details are left off.
  const startPdf = async () => {
    setErr(null);
    if (settings && settings.__ready === false && !current.data?.sender) {
      setErr("Your profile is still loading — try again in a moment."); return;
    }
    const mw = openPdfWindow();               // must happen in the tap (iPhone)
    setDownloading(true);
    try {
      let d: DocView = current;
      if (canEdit && (isNew || dirty)) {
        setSaving(true);
        const res = await onSave!(current);
        setSaving(false);
        if (res) d = res as DocView;
        baseRef.current = JSON.stringify(current);
        setFlash("saved");
      }
      if (onPdf && d.status === "draft") d = await onPdf(d);
      await downloadDocPdf({ ...d, lang } as DocView, settings, client, docFileName(d), mw);
    } catch (e: any) {
      mw?.close();
      setErr(e?.message || "The PDF couldn't be created.");
    } finally {
      setSaving(false);
      setDownloading(false);
    }
  };
  const download = () => {
    if (downloading) return;
    const ask = pdfConfirm ? pdfConfirm(current) : null;
    if (ask) { setPdfAsk(ask); return; }
    startPdf();
  };

  // ── Line editing ────────────────────────────────────────────
  const updLine = (i: number, key: string, raw: string) =>
    setData(d => {
      const lines = [...(d.lines || [])];
      const ln = { ...lines[i] };
      if (key === "qty") {
        const oldQ = lineQty(ln);
        const newQ = Math.max(1, parseInt(raw) || 1);
        ln.amt = r2(lineAmt(ln) / oldQ * newQ);
        ln.qty = newQ;
      } else if (key === "amt") {
        const v = parseFloat(String(raw).replace(",", "."));
        ln.amt = Number.isFinite(v) ? r2(v) : 0;
      } else {
        ln[key] = raw;
      }
      lines[i] = ln;
      return { ...d, lines };
    });
  const removeLine = (i: number) => setData(d => ({ ...d, lines: (d.lines || []).filter((_: any, j: number) => j !== i) }));
  const addLine = () => setData(d => ({ ...d, lines: [...(d.lines || []), { id: Math.random().toString(36).slice(2, 9), name: "New item", note: "", qty: 1, amt: 0 }] }));

  // ── Clause editing (per language, keeps {fee}/{creator} live) ─
  const ctx = clauseContext(current, lang, settings, client);
  const templates = clauseTemplates(current.data, lang);
  const writeClauses = (next: { title: string; text: string }[]) =>
    setData(d => {
      const c = d.clauses;
      let obj: any = {};
      if (Array.isArray(c) && c.length > 0) {
        const de = /vertrag|lieferung|zahlung|nutzungsrecht|korrektur|stornierung/i.test(String(c[0]?.title || "") + String(c[0]?.text || "").slice(0, 80));
        obj[de ? "de" : "en"] = c;
      } else if (c && typeof c === "object") obj = { ...c };
      obj[lang] = next;
      return { ...d, clauses: obj };
    });
  const editClause = (ci: number, field: "title" | "text", val: string) => {
    const arr = templates.map(x => ({ ...x }));
    arr[ci] = { ...arr[ci], [field]: tokenizeClause(val, ctx) };
    writeClauses(arr);
  };
  const moveClause = (ci: number, dir: number) => {
    const arr = templates.map(x => ({ ...x }));
    const ni = ci + dir;
    if (ni < 0 || ni >= arr.length) return;
    [arr[ci], arr[ni]] = [arr[ni], arr[ci]];
    writeClauses(arr);
  };
  const deleteClause = (ci: number) => writeClauses(templates.filter((_, j) => j !== ci));
  const addClause = () => writeClauses([...templates, { title: `§ ${templates.length + 1} — ${lang === "de" ? "Neue Klausel" : "New clause"}`, text: "" }]);

  const kind  = current.kind;
  const isInv = kind === "invoice" && current.subtype !== "storno";
  const statusBadge = (
    <span style={{ fontSize: TYPE.micro.size, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: STATUS_COLOR[current.status] || C.muted, border: `1px solid ${STATUS_COLOR[current.status] || C.rule}`, height: 22, padding: "0 7px", display: "inline-flex", alignItems: "center", borderRadius: 2, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
      {isNew ? "New" : STATUS_LABEL[current.status] || current.status}
    </span>
  );

  const taStyle: any = { width: "100%", padding: "8px 10px", border: `1px solid ${C.rule}`, background: C.bg, fontFamily: SANS, fontSize: 16, color: C.black, borderRadius: 2, outline: "none", resize: "vertical", boxSizing: "border-box", minHeight: 72 };

  const showPanel   = canEdit && (!isMobile || showEdit);
  const showPreview = !isMobile || !showEdit || !canEdit;

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: Z.modal, display: "flex", flexDirection: "column", fontFamily: SANS }}>

      {/* ── TOP BAR (one row: close on the left, actions on the right) ── */}
      <div style={{ height: 44, borderBottom: `1px solid ${C.rule}`, display: "flex", alignItems: "center", padding: "0 8px 0 2px", gap: 6, flexShrink: 0 }}>
        <button onClick={tryClose} aria-label="Close" title="Close"
          style={{ width: 44, height: 44, flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 20, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        <LangSwitch lang={lang} onChange={setLang} />
        {statusBadge}
        <div style={{ flex: 1 }} />
        {isMobile && canEdit && (
          <B v="sec" onClick={() => setShowEdit(e => !e)} s={BAR_BTN}>{showEdit ? "View" : "Edit"}</B>
        )}
        {canEdit && (isNew || dirty) && (
          <B v="sec" onClick={() => { save(); }} s={{ ...BAR_BTN, opacity: saving ? 0.5 : 1 }}>{saving ? "Saving…" : "Save"}</B>
        )}
        <B onClick={download} s={{ ...BAR_BTN, opacity: downloading ? 0.5 : 1 }}>{downloading ? "Preparing…" : "Save PDF"}</B>
      </div>

      {/* ── ACTION BAR (status actions) ── */}
      {(actions.length > 0 || err || flash) && (
        <div style={{ borderBottom: `1px solid ${C.rule}`, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", flexWrap: "wrap" as const, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            {err && <span style={{ fontSize: TYPE.label.size, color: C.red }}>{err}</span>}
            {!err && flash === "saved" && <span style={{ fontSize: TYPE.label.size, color: C.green }}>Saved ✓</span>}
          </div>
          {actions.map(a => (
            <B key={a.key} v={a.kind === "danger" ? "danger" : a.kind === "sec" ? "sec" : "pri"}
              onClick={() => !busy && clickAction(a)}
              s={{ minHeight: 36, padding: "0 14px", opacity: busy && busy !== a.key ? 0.4 : 1 }}>
              {busy === a.key ? "…" : a.label}
            </B>
          ))}
        </div>
      )}

      {/* ── BODY ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", flexDirection: isMobile ? "column" : "row" }}>

        {showPanel && (
          <div style={{ width: isMobile ? "100%" : panelW, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: isMobile ? "none" : `1px solid ${C.rule}`, flex: isMobile ? 1 : undefined, minHeight: 0 }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 14px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 8 }}>
                <button onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo" style={{ width: 30, height: 30, background: "none", border: `1px solid ${canUndo ? C.rule : "transparent"}`, borderRadius: 2, cursor: canUndo ? "pointer" : "default", color: canUndo ? C.black : C.light, fontSize: 14 }}>←</button>
                <button onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo" style={{ width: 30, height: 30, background: "none", border: `1px solid ${canRedo ? C.rule : "transparent"}`, borderRadius: 2, cursor: canRedo ? "pointer" : "default", color: canRedo ? C.black : C.light, fontSize: 14 }}>→</button>
                <span style={{ fontSize: TYPE.micro.size, color: C.light, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginLeft: 4 }}>Undo · Redo</span>
              </div>
              {note && <p style={{ fontSize: TYPE.label.size, color: C.muted, margin: "10px 0 0", lineHeight: 1.5 }}>{note}</p>}

              <Lbl>Brand</Lbl>
              <I value={staged.data?.brand || ""} onChange={(e: any) => setData(d => ({ ...d, brand: e.target.value }))} />
              <Lbl>Contact</Lbl>
              <I value={staged.data?.contact || ""} onChange={(e: any) => setData(d => ({ ...d, contact: e.target.value }))} />
              <Lbl>Date</Lbl>
              <I type="date" value={staged.docDate || ""} onChange={(e: any) => setStaged(p => ({ ...p, docDate: e.target.value }))} />

              {kind === "quote" && <>
                <Lbl>Valid until</Lbl>
                <I type="date" value={staged.data?.validUntil || ""} onChange={(e: any) => setData(d => ({ ...d, validUntil: e.target.value }))} />
              </>}

              {isInv && <>
                <Lbl>Service period</Lbl>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <I type="date" value={staged.periodStart || ""} onChange={(e: any) => setStaged(p => ({ ...p, periodStart: e.target.value || null }))} />
                  <I type="date" value={staged.periodEnd || ""} onChange={(e: any) => setStaged(p => ({ ...p, periodEnd: e.target.value || null }))} />
                </div>
                <Lbl>Due date</Lbl>
                <I type="date" value={staged.dueDate || ""} onChange={(e: any) => setStaged(p => ({ ...p, dueDate: e.target.value || null }))} />
              </>}

              <Lbl>Line items</Lbl>
              {(staged.data?.lines || []).map((ln: any, i: number) => (
                <div key={ln.id || i} style={{ border: `1px solid ${C.rule}`, borderRadius: 2, padding: 10, marginBottom: 7, background: C.white }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}>
                    <I value={ln.name || ""} onChange={(e: any) => updLine(i, "name", e.target.value)} />
                    <button onClick={() => removeLine(i)} title="Remove line" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 14, padding: "0 2px" }}>✕</button>
                  </div>
                  <I value={ln.note || ""} onChange={(e: any) => updLine(i, "note", e.target.value)} s={{ marginBottom: 5, color: C.muted }} placeholder="note (optional)" />
                  <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 6, alignItems: "center" }}>
                    <I type="number" min={1} value={lineQty(ln)} onChange={(e: any) => updLine(i, "qty", e.target.value)} />
                    <NumField value={lineAmt(ln)} onChange={(n) => updLine(i, "amt", n === null ? "" : String(n))} placeholder="Amount €" ariaLabel="Amount" />
                  </div>
                  <p style={{ fontSize: TYPE.micro.size, color: C.muted, margin: "5px 0 0" }}>Unit price {fmt(lineAmt(ln) / lineQty(ln))}</p>
                </div>
              ))}
              <button onClick={addLine} style={{ fontSize: TYPE.label.size, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: "0 0 4px", fontFamily: SANS, textDecoration: "underline", textDecorationColor: C.rule }}>+ Add line</button>

              {kind === "contract" && (
                <div style={{ marginTop: 6 }}>
                  <Lbl>Contract clauses ({lang.toUpperCase()})</Lbl>
                  {templates.map((cl, ci) => (
                    <div key={ci} style={{ border: `1px solid ${C.rule}`, borderRadius: 2, padding: "9px 10px", marginBottom: 7, background: C.white }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 3, marginBottom: 5 }}>
                        <button onClick={() => moveClause(ci, -1)} disabled={ci === 0} style={{ background: "none", border: `1px solid ${C.rule}`, borderRadius: 2, cursor: ci === 0 ? "default" : "pointer", color: ci === 0 ? C.light : C.muted, fontSize: TYPE.label.size, padding: "1px 6px" }}>↑</button>
                        <button onClick={() => moveClause(ci, 1)} disabled={ci === templates.length - 1} style={{ background: "none", border: `1px solid ${C.rule}`, borderRadius: 2, cursor: ci === templates.length - 1 ? "default" : "pointer", color: ci === templates.length - 1 ? C.light : C.muted, fontSize: TYPE.label.size, padding: "1px 6px" }}>↓</button>
                        <button onClick={() => deleteClause(ci)} style={{ background: "none", border: `1px solid ${C.rule}`, borderRadius: 2, cursor: "pointer", color: C.red, fontSize: TYPE.label.size, padding: "1px 6px" }}>✕</button>
                      </div>
                      <I value={fillTokens(cl.title, ctx)} onChange={(e: any) => editClause(ci, "title", e.target.value)} s={{ marginBottom: 5, fontFamily: SERIF }} />
                      <textarea value={fillTokens(cl.text, ctx)} onChange={(e: any) => editClause(ci, "text", e.target.value)} style={taStyle} />
                    </div>
                  ))}
                  <button onClick={addClause} style={{ fontSize: TYPE.label.size, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: "0 0 4px", fontFamily: SANS, textDecoration: "underline", textDecorationColor: C.rule }}>+ Add clause</button>
                </div>
              )}

              <Lbl>Closing note</Lbl>
              <textarea value={staged.data?.footer || ""} onChange={(e: any) => setData(d => ({ ...d, footer: e.target.value }))} style={taStyle} />
            </div>

            <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.rule}`, flexShrink: 0 }}>
              <B onClick={save} s={{ width: "100%", opacity: saving ? 0.5 : 1 }}>{saving ? "Saving…" : "Save"}</B>
            </div>
          </div>
        )}

        {/* Drag resizer */}
        {showPanel && !isMobile && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX, startW = panelW;
              const onMove = (ev: MouseEvent) => setPanelW(Math.max(260, Math.min(700, startW + ev.clientX - startX)));
              const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}
            style={{ width: 6, flexShrink: 0, cursor: "col-resize", background: C.rule, opacity: 0.5 }}
          />
        )}

        {showPreview && (
          <div ref={pagesRef} style={{ flex: 1, background: "#888", overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: isMobile ? "16px 0" : "32px 28px", gap: isMobile ? 16 : 28 }}>
            <DocPages doc={current} settings={settings} client={client} lang={lang} scale={pageScale} />
          </div>
        )}
      </div>

      {/* ── CONFIRM CLOSE ── */}
      {confirmClose && (
        <ConfirmDialog
          title={isNew ? "Save this document?" : "Save before closing?"}
          text={isNew ? "It will be added to the client's project." : "Changes will be lost if you don't save."}
          error={err}
          okLabel={saving ? "Saving…" : "Yes, save"}
          cancelLabel="No, discard"
          onOk={async () => { const ok = await save(); if (ok) { setConfirmClose(false); onClose(); } }}
          onCancel={() => { setConfirmClose(false); setErr(null); onClose(); }}
        />
      )}

      {/* ── QUESTION BEFORE THE PDF (draft invoice → finalize) ── */}
      {pdfAsk && (
        <ConfirmDialog
          title="Finalize and save the PDF?"
          text={pdfAsk}
          okLabel="Finalize & save PDF"
          onOk={() => { setPdfAsk(null); startPdf(); }}
          onCancel={() => setPdfAsk(null)}
        />
      )}

      {/* ── ACTION DIALOG (date / confirm) ── */}
      {dialog && (
        <ConfirmDialog
          title={dialog.action.label}
          text={dialog.action.confirm}
          dateLabel={dialog.action.date}
          okLabel={dialog.action.label}
          danger={dialog.action.kind === "danger"}
          onOk={(date) => { const dg = dialog; setDialog(null); runAction(dg.action, dg.action.date ? date : undefined); }}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
