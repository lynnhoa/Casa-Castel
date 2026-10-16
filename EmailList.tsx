// ─────────────────────────────────────────────────────────────
// EmailList — Outreach › Email list
// Header: count + copy symbol (copies the emails in view),
//         [Excel columns] [Prompt]
// Toolbar (28 px): Search · Filter · Sort · Download
// Phone: two lines per contact · iPad/desktop: one-line table
// Windows (one level): Filter (sheet on phone), contact, columns
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { C, SANS, SERIF, TYPE, Z } from "./constants";
import { fmtD } from "./formatters";
import { B, I, S, Lbl, ConfirmDialog, BAR_BTN } from "./atoms";
import {
  OUTREACH_CATEGORIES, OUTREACH_COLUMNS, SORTS, ADDED, DEFAULT_VIEW, catOf, applyView, activeFilters,
  emailsText, copyText, headerRow, buildPrompt,
} from "./outreach";
import type { OutreachContact, OutreachView, SortKey } from "./outreach";
import { downloadExcel, downloadTemplate, downloadListPdf } from "./outreachExport";
import { editLock } from "./saveStatus";

// ── small line icons (no icon library needed) ─────────────────
const Ico = ({ d, size = 14, color = "currentColor" }: { d: string; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d={d} /></svg>
);
const IC = {
  copy:     "M9 9h10v10H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  search:   "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
  filter:   "M4 5h16l-6 7.5V19l-4 1v-7.5z",
  sort:     "M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  table:    "M3 5h18v14H3zM3 10h18M3 15h18M9 5v14",
};

const VIEW_KEY = "lh_outreach_view";
const loadView = (): OutreachView => { try { return { ...DEFAULT_VIEW, ...JSON.parse(sessionStorage.getItem(VIEW_KEY) || "{}") }; } catch { return DEFAULT_VIEW; } };

const CatPill = ({ k }: { k: string }) => {
  const c = catOf(k);
  return <span style={{ fontSize: TYPE.micro.size, padding: "2px 8px", borderRadius: 10, border: `1px solid ${c.border}`, background: c.bg, color: c.color, whiteSpace: "nowrap" as const }}>{c.label}</span>;
};

interface EmailListProps {
  outreach:  any;          // useOutreach()
  settings:  any;
  isMobile:  boolean;
  isWide:    boolean;      // ≥ 1200 px
  stickyTop: number;       // height of the app header (table header sticks below it)
}

export default function EmailList({ outreach, settings, isMobile, isWide, stickyTop }: EmailListProps) {
  const { contacts, loading, loadError, loginEmail } = outreach;
  const [view, setView]       = useState<OutreachView>(loadView);
  const [open, setOpen]       = useState<null | "filter" | "sort" | "download">(null);
  const [showCols, setShowCols] = useState(false);
  const [openId, setOpenId]   = useState<string | null>(null);
  const [toast, setToast]     = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);

  useEffect(() => { try { sessionStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch { /* ignore */ } }, [view]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 1800); return () => clearTimeout(t); }, [toast]);

  const shown  = useMemo(() => applyView(contacts, view), [contacts, view]);
  const cities = useMemo(() => Array.from(new Set(contacts.map((c: OutreachContact) => (c.city || "").trim()).filter(Boolean))).sort((a: any, b: any) => a.localeCompare(b, "de")) as string[], [contacts]);
  const counts = useMemo(() => { const m: Record<string, number> = {}; contacts.forEach((c: OutreachContact) => { m[c.category] = (m[c.category] || 0) + 1; }); return m; }, [contacts]);
  const nFilters = activeFilters(view);
  const filtered = nFilters > 0 || !!view.q.trim();
  const brand = (settings?.company || settings?.name || "LH Studio").trim();
  const set = (patch: Partial<OutreachView>) => setView(v => ({ ...v, ...patch }));

  const copy = async (text: string, msg: string) => { const ok = await copyText(text); setToast(ok ? msg : "Couldn't copy"); };
  const fileName = (which: "filtered" | "full") =>
    `${brand} – Email list${which === "filtered" ? ` – ${view.cat !== "all" ? catOf(view.cat).label : "Filtered"}` : ""} – ${fmtD(new Date().toISOString().slice(0, 10))}`;
  const pdfTitle = (which: "filtered" | "full", n: number) =>
    `Email list${which === "filtered" && view.cat !== "all" ? ` · ${catOf(view.cat).label}` : ""} · ${n} ${n === 1 ? "contact" : "contacts"}`;
  const doDownload = async (which: "filtered" | "full", kind: "excel" | "pdf") => {
    setOpen(null);
    const list = which === "filtered" ? shown : applyView(contacts, { ...DEFAULT_VIEW, sort: view.sort });
    if (kind === "excel") { downloadExcel(list, fileName(which)); return; }
    setBusy(true);
    try { await downloadListPdf(list, pdfTitle(which, list.length), fileName(which), settings); }
    catch (e: any) { setToast(e?.message || "The PDF couldn't be created."); }
    finally { setBusy(false); }
  };

  const iconBtn = (key: "filter" | "sort" | "download", icon: string, label: string, active = false, badge = 0) => (
    <button key={key} onClick={() => setOpen(o => (o === key ? null : key))} aria-label={label} title={label}
      style={{ height: 28, minWidth: 28, padding: isMobile ? 0 : "0 9px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, border: `1px solid ${active ? C.black : C.rule}`, background: active ? C.black : "transparent", color: active ? C.white : C.black, borderRadius: 2, cursor: "pointer", position: "relative", flexShrink: 0, fontFamily: SANS, fontSize: TYPE.micro.size, letterSpacing: "0.1em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>
      <Ico d={icon} />
      {!isMobile && <span>{label}</span>}
      {badge > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 15, height: 15, borderRadius: 8, background: C.amber, color: C.white, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: 0 }}>{badge}</span>}
    </button>
  );

  // ── popovers / sheet ────────────────────────────────────────
  const menuBox: any = { position: "absolute", top: "calc(100% + 6px)", right: 0, background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 2, boxShadow: "0 6px 20px rgba(0,0,0,0.10)", zIndex: Z.menu, padding: "4px 0" };
  const opt = (on: boolean): any => ({ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", height: 34, padding: "0 12px", border: "none", background: on ? "rgba(0,0,0,0.035)" : "none", color: on ? C.black : C.muted, fontFamily: SANS, fontSize: 13, cursor: "pointer", textAlign: "left" as const });

  const filterBody = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: SERIF, fontSize: 17 }}>Filter</span>
        <button onClick={() => set({ cat: "all", city: "all", added: "any" })} style={{ background: "none", border: "none", color: C.muted, textDecoration: "underline", cursor: "pointer", fontFamily: SANS, fontSize: TYPE.label.size }}>Reset</button>
      </div>
      <Lbl>Category</Lbl>
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 2, maxHeight: isMobile ? 260 : 300, overflowY: "auto" }}>
        <button onClick={() => set({ cat: "all" })} style={opt(view.cat === "all")}><span>All</span><span>{contacts.length}{view.cat === "all" ? " ✓" : ""}</span></button>
        {OUTREACH_CATEGORIES.map(c => (
          <button key={c.key} onClick={() => set({ cat: c.key })} style={opt(view.cat === c.key)}><span>{c.label}</span><span>{counts[c.key] || 0}{view.cat === c.key ? " ✓" : ""}</span></button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
        <div><Lbl>City</Lbl>
          <S value={view.city} onChange={(e: any) => set({ city: e.target.value })}>
            <option value="all">All</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </S>
        </div>
        <div><Lbl>Added</Lbl>
          <S value={view.added} onChange={(e: any) => set({ added: e.target.value })}>
            {ADDED.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </S>
        </div>
      </div>
      <B onClick={() => setOpen(null)} s={{ width: "100%", marginTop: 14 }}>Show {shown.length} {shown.length === 1 ? "contact" : "contacts"}</B>
    </>
  );

  const toolbar = (
    <div style={{ display: "flex", gap: 6, alignItems: "center", position: "relative" }}>
      <div style={{ flex: isMobile ? 1 : "0 1 300px", height: 28, border: `1px solid ${C.rule}`, borderRadius: 2, display: "flex", alignItems: "center", gap: 6, padding: "0 8px", boxSizing: "border-box" as const, color: C.muted }}>
        <Ico d={IC.search} size={13} />
        <input value={view.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search" aria-label="Search"
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: SANS, fontSize: 16, color: C.black, height: 26, padding: 0 }} />
      </div>
      <div style={{ position: "relative" }}>
        {iconBtn("filter", IC.filter, nFilters ? `Filter · ${nFilters}` : "Filter", nFilters > 0, isMobile ? nFilters : 0)}
        {open === "filter" && !isMobile && <div style={{ ...menuBox, width: 300, padding: 14 }}>{filterBody}</div>}
      </div>
      <div style={{ position: "relative" }}>
        {iconBtn("sort", IC.sort, SORTS.find(s => s.key === view.sort)?.short || "Sort")}
        {open === "sort" && (
          <div style={{ ...menuBox, width: 180 }}>
            {SORTS.map(s => <button key={s.key} onClick={() => { set({ sort: s.key as SortKey }); setOpen(null); }} style={opt(view.sort === s.key)}><span>{s.label}</span><span>{view.sort === s.key ? "✓" : ""}</span></button>)}
          </div>
        )}
      </div>
      <div style={{ position: "relative" }}>
        {iconBtn("download", IC.download, busy ? "Preparing…" : "Download")}
        {open === "download" && (
          <div style={{ ...menuBox, width: 250 }}>
            {(filtered ? (["filtered", "full"] as const) : (["full"] as const)).map((w, i) => (
              <div key={w} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderTop: i ? `1px solid ${C.rule}` : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.black }}>{w === "filtered" ? "Filtered list" : "Full list"}</div>
                  <div style={{ fontSize: TYPE.label.size, color: C.muted }}>{w === "filtered" ? `${view.cat !== "all" ? catOf(view.cat).label + " · " : ""}${shown.length}` : `All · ${contacts.length}`}</div>
                </div>
                <B v="sec" onClick={() => doDownload(w, "excel")} s={{ ...BAR_BTN, height: 26, minHeight: 26 }}>Excel</B>
                <B v="sec" onClick={() => doDownload(w, "pdf")} s={{ ...BAR_BTN, height: 26, minHeight: 26 }}>PDF</B>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const tagStyle = (c?: any): any => ({ height: 22, padding: "0 6px 0 8px", border: `1px solid ${c?.border || C.rule}`, background: c?.bg || "transparent", color: c?.color || C.muted, borderRadius: 11, fontSize: TYPE.label.size, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: SANS });
  const tags = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginTop: 7 }}>
      {view.cat !== "all" && <button onClick={() => set({ cat: "all" })} style={tagStyle(catOf(view.cat))}>{catOf(view.cat).label} ✕</button>}
      {view.city !== "all" && <button onClick={() => set({ city: "all" })} style={tagStyle()}>{view.city} ✕</button>}
      {view.added !== "any" && <button onClick={() => set({ added: "any" })} style={tagStyle()}>{ADDED.find(a => a.key === view.added)?.label} ✕</button>}
      <span style={{ ...tagStyle(), cursor: "default", padding: "0 8px" }}>{SORTS.find(s => s.key === view.sort)?.short}</span>
    </div>
  );

  // ── list ────────────────────────────────────────────────────
  const emailCell = (c: OutreachContact, small = false) => (
    <button onClick={(e) => { e.stopPropagation(); copy(c.email, "Email copied ✓"); }} title="Copy email" className="lh-copy-email"
      style={{ background: "none", border: "none", padding: 0, cursor: "copy", display: "inline-flex", alignItems: "center", gap: 5, color: small ? C.muted : C.black, fontFamily: SANS, fontSize: small ? 12 : 13, minWidth: 0, maxWidth: "100%" }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.email}</span>
      <span className="lh-copy-ico" style={{ color: C.light, display: "inline-flex", opacity: isMobile ? 1 : 0 }}><Ico d={IC.copy} size={12} /></span>
    </button>
  );

  const phoneList = (
    <div style={{ marginTop: 8, borderTop: `1px solid ${C.rule}` }}>
      {shown.map((c: OutreachContact) => (
        <div key={c.id} onClick={() => setOpenId(c.id)} style={{ padding: "8px 0", borderBottom: `1px solid ${C.rule}`, cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.company || c.email}</span>
            <CatPill k={c.category} />
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2, display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
            {c.contactName && <span style={{ flexShrink: 0 }}>{c.contactName} ·</span>}
            {emailCell(c, true)}
          </div>
        </div>
      ))}
    </div>
  );

  const cols: { key: string; label: string; fr: string; sort?: SortKey[] }[] = [
    { key: "company", label: "Company", fr: "1.3fr", sort: ["az", "za"] },
    { key: "contactName", label: "Contact", fr: "1fr" },
    { key: "email", label: "Email", fr: "1.8fr" },
    { key: "category", label: "Category", fr: "0.9fr", sort: ["cat"] },
    { key: "city", label: "City", fr: "0.9fr" },
    { key: "web", label: "Website / IG", fr: "1.2fr" },
    ...(isWide ? [{ key: "added", label: "Added", fr: "0.8fr", sort: ["new", "old"] as SortKey[] }] : []),
  ];
  const headClick = (c: typeof cols[number]) => {
    if (!c.sort) return;
    const [a, b] = c.sort;
    set({ sort: view.sort === a && b ? b : a });
  };
  const arrow = (c: typeof cols[number]) => !c.sort ? "" : view.sort === c.sort[0] ? (c.key === "added" ? " ▾" : " ▴") : view.sort === c.sort[1] ? (c.key === "added" ? " ▴" : " ▾") : "";
  const td: any = { padding: "0 10px", height: 36, display: "flex", alignItems: "center", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", borderBottom: `1px solid ${C.rule}`, minWidth: 0 };
  const cut = (t: any) => <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, minWidth: 0 }}>{t}</span>;
  const table = (
    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: cols.map(c => `minmax(0,${c.fr})`).join(" ") }}>
      {cols.map(c => (
        <div key={c.key} onClick={() => headClick(c)} style={{ position: "sticky", top: stickyTop, background: C.bg, zIndex: 2, padding: "0 10px", height: 30, display: "flex", alignItems: "center", fontSize: TYPE.micro.size, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, borderBottom: `1px solid ${C.black}`, cursor: c.sort ? "pointer" : "default", userSelect: "none" as const }}>{c.label}{arrow(c)}</div>
      ))}
      {shown.map((c: OutreachContact) => (
        <div key={c.id} className="lh-row" onClick={() => setOpenId(c.id)} style={{ display: "contents", cursor: "pointer" }}>
          <div style={td}>{cut(c.company)}</div>
          <div style={{ ...td, color: c.contactName ? C.black : C.light }}>{cut(c.contactName || "—")}</div>
          <div style={td}>{emailCell(c)}</div>
          <div style={td}><CatPill k={c.category} /></div>
          <div style={td}>{cut(c.city)}</div>
          <div style={{ ...td, color: C.muted }}>{cut(c.web)}</div>
          {isWide && <div style={{ ...td, color: C.muted }}>{c.createdAt ? fmtD(c.createdAt.slice(0, 10)) : ""}</div>}
        </div>
      ))}
    </div>
  );

  const current = contacts.find((c: OutreachContact) => c.id === openId) || null;

  return (
    <div>
      {/* hover: row tint + show the copy icon (desktop / iPad) */}
      <style>{`.lh-row:hover > div { background: rgba(0,0,0,0.025); } .lh-row:hover .lh-copy-ico, .lh-copy-email:focus .lh-copy-ico { opacity: 1 !important; }`}</style>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-end", gap: 8 }}>
        <div>
          <h2 style={{ fontFamily: SERIF, fontSize: isMobile ? 22 : 24, fontWeight: "normal", margin: 0, lineHeight: 1.1 }}>Email list</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: TYPE.micro.size, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: C.muted }}>
            <span>{filtered ? `${shown.length} of ${contacts.length}` : contacts.length} {contacts.length === 1 ? "contact" : "contacts"}</span>
            {shown.length > 0 && (
              <button onClick={() => copy(emailsText(shown), `${shown.length} ${shown.length === 1 ? "email" : "emails"} copied ✓`)} aria-label="Copy the emails in view" title="Copy the emails in view"
                style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: C.black, display: "inline-flex" }}><Ico d={IC.copy} size={13} /></button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" as const, justifyContent: "flex-end" }}>
          {!isMobile && toolbar}
          <B v="sec" onClick={() => setShowCols(true)} s={{ ...BAR_BTN, height: 28, minHeight: 28, gap: 5, display: "inline-flex", alignItems: "center", marginLeft: isMobile ? 0 : 10 }}><Ico d={IC.table} size={12} />Excel columns</B>
          <B v="sec" onClick={() => copy(buildPrompt(loginEmail), "Prompt copied ✓ — paste it into Claude")} s={{ ...BAR_BTN, height: 28, minHeight: 28, gap: 5, display: "inline-flex", alignItems: "center" }}><Ico d={IC.copy} size={12} />Prompt</B>
        </div>
      </div>

      {isMobile && <div style={{ marginTop: 12 }}>{toolbar}</div>}
      {tags}

      {/* ── CONTENT ── */}
      {loading ? (
        <p style={{ fontSize: TYPE.label.size, color: C.muted, marginTop: 16 }}>Loading…</p>
      ) : loadError ? (
        <p style={{ fontSize: TYPE.label.size, color: C.red, marginTop: 16, lineHeight: 1.5 }}>{loadError}</p>
      ) : contacts.length === 0 ? (
        <div style={{ marginTop: 18, padding: "18px 0", borderTop: `1px solid ${C.rule}` }}>
          <p style={{ fontFamily: SERIF, fontSize: 15, color: C.muted, margin: "0 0 8px" }}>No contacts yet</p>
          <p style={{ fontSize: TYPE.label.size, color: C.muted, margin: 0, lineHeight: 1.7 }}>
            1 · Build your Excel with the <strong>Excel columns</strong>.<br />
            2 · Tap <strong>Prompt</strong>, paste it into Claude and attach the Excel.<br />
            3 · Run Claude's SQL in Supabase → SQL editor, then come back here.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p style={{ fontSize: TYPE.label.size, color: C.muted, marginTop: 16 }}>No contacts match. <button onClick={() => set({ q: "", cat: "all", city: "all", added: "any" })} style={{ background: "none", border: "none", padding: 0, color: C.black, textDecoration: "underline", cursor: "pointer", fontFamily: SANS, fontSize: TYPE.label.size }}>Clear search and filters</button></p>
      ) : isMobile ? phoneList : table}

      {/* click outside closes a menu */}
      {open && !(open === "filter" && isMobile) && <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: Z.menu - 1 }} />}

      {/* ── FILTER SHEET (phone) ── */}
      {open === "filter" && isMobile && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: Z.modal }}>
          <div onClick={() => setOpen(null)} style={{ position: "absolute", inset: 0, background: "rgba(26,26,26,0.25)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: C.bg, borderTop: `1px solid ${C.rule}`, padding: "12px 14px calc(16px + env(safe-area-inset-bottom))", fontFamily: SANS }}>{filterBody}</div>
        </div>, document.body)}

      {/* ── CONTACT WINDOW ── */}
      {current && <ContactWindow c={current} outreach={outreach} isMobile={isMobile} onClose={() => setOpenId(null)} onCopy={(t) => copy(t, "Email copied ✓")} />}

      {/* ── EXCEL COLUMNS WINDOW ── */}
      {showCols && (
        <Window title="Excel columns" isMobile={isMobile} onClose={() => setShowCols(false)}>
          <p style={{ fontSize: 12, color: C.muted, margin: "0 0 8px", lineHeight: 1.5 }}>Use these as the first row of your Excel. Claude also understands similar names.</p>
          {OUTREACH_COLUMNS.map(col => (
            <div key={col.key} style={{ display: "grid", gridTemplateColumns: "128px minmax(0,1fr)", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.rule}` }}>
              <div>
                <div style={{ fontSize: 13 }}>{col.label}</div>
                <div style={{ fontSize: 9, letterSpacing: "0.08em", color: col.required ? C.amber : C.light, marginTop: 2 }}>{col.required ? "REQUIRED" : "OPTIONAL"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12 }}>{col.example}</div>
                {col.note && <div style={{ fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{col.note}</div>}
              </div>
            </div>
          ))}
          <p style={{ fontSize: 11, color: C.light, margin: "6px 0 12px" }}>Date added and source file are filled in automatically.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <B v="sec" onClick={() => copy(headerRow(), "Header row copied ✓ — paste into cell A1")} s={{ flex: 1, height: 32, minHeight: 32, fontSize: TYPE.micro.size }}>Copy header row</B>
            <B v="sec" onClick={() => downloadTemplate(`${brand} – Email list template`)} s={{ flex: 1, height: 32, minHeight: 32, fontSize: TYPE.micro.size }}>Excel template</B>
          </div>
        </Window>
      )}

      {toast && createPortal(
        <div role="status" style={{ position: "fixed", left: "50%", top: stickyTop + 10, transform: "translateX(-50%)", zIndex: Z.toast, background: C.black, color: C.white, fontFamily: SANS, fontSize: 12, padding: "8px 14px", borderRadius: 2, maxWidth: "calc(100vw - 32px)", boxShadow: "0 4px 14px rgba(0,0,0,0.15)" }}>{toast}</div>,
        document.body)}
    </div>
  );
}

// ── One-level window: full screen on the phone, centred elsewhere ─
function Window({ title, isMobile, onClose, children, footer }: { title: string; isMobile: boolean; onClose: () => void; children: any; footer?: any }) {
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: Z.modal, display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "center", background: isMobile ? C.bg : "rgba(250,249,247,0.85)", fontFamily: SANS }}>
      <div style={{ width: "100%", maxWidth: isMobile ? "none" : 480, maxHeight: isMobile ? "none" : "88vh", background: C.bg, border: isMobile ? "none" : `1px solid ${C.rule}`, borderRadius: isMobile ? 0 : 2, boxShadow: isMobile ? "none" : "0 8px 32px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 44, display: "flex", alignItems: "center", gap: 6, padding: "0 8px 0 2px", borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
          <button onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 20 }}>✕</button>
          <span style={{ fontFamily: SERIF, fontSize: 15, color: C.black, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{title}</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 16px" }}>{children}</div>
        {footer && <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.rule}`, flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// ── Contact: read view, Edit → Save returns to the read view ─────
function ContactWindow({ c, outreach, isMobile, onClose, onCopy }: { c: OutreachContact; outreach: any; isMobile: boolean; onClose: () => void; onCopy: (t: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(c);
  const [err, setErr] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  useEffect(() => { if (!edit) setF(c); }, [c, edit]);
  useEffect(() => (edit ? editLock.acquire() : undefined), [edit]);     // no reload while editing

  const save = async () => {
    setErr(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { setErr("Please enter a valid email."); return; }
    try { await outreach.updateContact(c.id, f); setEdit(false); }
    catch (e: any) { setErr(e?.message || "Couldn't save."); }
  };
  const del = async () => {
    setAskDelete(false);
    try { await outreach.deleteContact(c.id); onClose(); }
    catch (e: any) { setErr(e?.message || "Couldn't delete."); }
  };
  const row = (label: string, value: any) => (
    <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0,1fr)", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.rule}`, fontSize: 13 }}>
      <span style={{ fontSize: TYPE.micro.size, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, paddingTop: 2 }}>{label}</span>
      <span style={{ minWidth: 0, overflowWrap: "anywhere" as const }}>{value || <span style={{ color: C.light }}>—</span>}</span>
    </div>
  );
  const field = (label: string, key: keyof OutreachContact, type = "text") => (
    <div><Lbl>{label}</Lbl><I type={type} value={(f as any)[key]} onChange={(e: any) => setF({ ...f, [key]: e.target.value })} /></div>
  );

  return (
    <>
      {askDelete && <ConfirmDialog title={`Delete ${c.company || c.email}?`} text="The contact is removed from your email list." okLabel="Delete" danger onOk={del} onCancel={() => setAskDelete(false)} />}
      <Window title={c.company || c.email} isMobile={isMobile} onClose={onClose}
        footer={edit ? (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <B v="sec" onClick={() => { setEdit(false); setErr(null); }}>Cancel</B>
            <B onClick={save}>Save</B>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            <B v="danger" onClick={() => setAskDelete(true)}>Delete</B>
            <div style={{ display: "flex", gap: 8 }}>
              <B v="sec" onClick={() => onCopy(c.email)}>Copy email</B>
              <B onClick={() => setEdit(true)}>Edit</B>
            </div>
          </div>
        )}>
        {err && <p style={{ fontSize: TYPE.label.size, color: C.red, margin: "0 0 8px" }}>{err}</p>}
        {!edit ? (
          <>
            {row("Company", c.company)}
            {row("Email", c.email)}
            {row("Contact", c.contactName)}
            {row("Category", <CatPill k={c.category} />)}
            {row("Website / IG", c.web)}
            {row("City", c.city)}
            {row("Notes", c.notes)}
            {row("Added", c.createdAt ? fmtD(c.createdAt.slice(0, 10)) : "")}
            {row("Source", c.source)}
          </>
        ) : (
          <>
            {field("Company", "company")}
            {field("Email", "email", "email")}
            {field("Contact name", "contactName")}
            <div><Lbl>Category</Lbl>
              <S value={f.category} onChange={(e: any) => setF({ ...f, category: e.target.value })}>
                {OUTREACH_CATEGORIES.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
              </S>
            </div>
            {field("Website / Instagram", "web")}
            {field("City", "city")}
            <div><Lbl>Notes</Lbl>
              <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })}
                style={{ width: "100%", minHeight: 72, padding: "8px 10px", border: `1px solid ${C.rule}`, background: C.bg, fontFamily: SANS, fontSize: 16, color: C.black, borderRadius: 2, outline: "none", resize: "vertical" as const, boxSizing: "border-box" as const }} />
            </div>
          </>
        )}
      </Window>
    </>
  );
}
