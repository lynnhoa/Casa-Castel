// ─────────────────────────────────────────────────────────────
// outreachExport — the email list as Excel or PDF, and the empty
// Excel template. Columns come from outreach.ts (one source).
// PDF: A4 landscape, same print settings as all other PDFs.
// ─────────────────────────────────────────────────────────────

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { SANS, SERIF, PDF } from "./constants";
import { fmtD, today } from "./formatters";
import { SETTINGS_DEFAULT } from "./rateCards";
import { openPdfWindow, pagesToPdf, deliverPdf } from "./PDFExport";
import { makeXlsx, saveBytes, XLSX_MIME } from "./xlsxWriter";
import { OUTREACH_COLUMNS, OUTREACH_CATEGORIES, OUTREACH_TIERS, catOf, tierOf } from "./outreach";
import type { OutreachContact } from "./outreach";

const addedText = (c: OutreachContact) => (c.createdAt ? fmtD(c.createdAt.slice(0, 10)) : "");
const cellOf = (c: OutreachContact, key: string): string =>
  key === "category" ? catOf(c.category).label : key === "tier" ? tierOf(c.tier).label : String((c as any)[key] ?? "");

// ── Excel ─────────────────────────────────────────────────────
export function downloadExcel(list: OutreachContact[], filename: string) {
  const head = [...OUTREACH_COLUMNS.map(c => c.label), "Added"];
  const rows = list.map(c => [...OUTREACH_COLUMNS.map(col => cellOf(c, col.key)), addedText(c)]);
  const bytes = makeXlsx([{
    name: "Email list", rows: [head, ...rows], autoFilter: true,
    widths: [26, 32, 20, 14, 10, 24, 16, 36, 12],
  }]);
  saveBytes(bytes, `${filename}.xlsx`, XLSX_MIME);
}

// Empty template: the column titles, a Category dropdown, and the allowed values on a 2nd sheet
export function downloadTemplate(filename: string) {
  const bytes = makeXlsx([
    {
      name: "Email list", rows: [OUTREACH_COLUMNS.map(c => c.label)], autoFilter: false,
      widths: [26, 32, 20, 14, 10, 24, 16, 36],
      dropdown: [
        { col: OUTREACH_COLUMNS.findIndex(c => c.key === "category"), values: OUTREACH_CATEGORIES.map(c => c.key), toRow: 2000 },
        { col: OUTREACH_COLUMNS.findIndex(c => c.key === "tier"),     values: OUTREACH_TIERS.map(t => t.key),      toRow: 2000 },
      ],
    },
    { name: "Categories", rows: [["Category"], ...OUTREACH_CATEGORIES.map(c => [c.key])], widths: [18] },
    { name: "Tiers", rows: [["Tier"], ...OUTREACH_TIERS.map(t => [t.key])], widths: [14] },
  ]);
  saveBytes(bytes, `${filename}.xlsx`, XLSX_MIME);
}

// ── PDF ───────────────────────────────────────────────────────
const W = 842, H = 595, PX = 40, ROW_H = 17, FIRST = 24, NEXT = 28;
const COLS: { key: string; label: string; w: number }[] = [
  { key: "company", label: "Company", w: 130 }, { key: "contactName", label: "Contact", w: 92 },
  { key: "email", label: "Email", w: 170 }, { key: "category", label: "Category", w: 74 },
  { key: "tier", label: "Tier", w: 40 },
  { key: "city", label: "City", w: 82 }, { key: "web", label: "Website / Instagram", w: 110 },
  { key: "added", label: "Added", w: 64 },
];   // sum = 762 = W − 2 × PX
const cell = (w: number): any => ({ width: w, flexShrink: 0, paddingRight: 6, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", boxSizing: "border-box" });

function ListPages({ list, title, settings }: { list: OutreachContact[]; title: string; settings: any }) {
  const s = { ...SETTINGS_DEFAULT, ...(settings || {}) };
  const pages: OutreachContact[][] = [];
  let i = 0; while (i < list.length || pages.length === 0) { const n = pages.length === 0 ? FIRST : NEXT; pages.push(list.slice(i, i + n)); i += n; if (i >= list.length) break; }
  return (
    <>
      {pages.map((rows, pi) => (
        <div key={pi} data-report-page="true" style={{ width: W, height: H, position: "relative", overflow: "hidden", background: PDF.page, fontFamily: SANS, color: PDF.ink }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 36, borderBottom: `1px solid ${PDF.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${PX}px`, fontSize: 7, color: PDF.faint, textTransform: "uppercase" as const }}>
            <span>{s.company || s.name || "LH Studio"}</span><span>Email list</span>
          </div>
          <div style={{ position: "absolute", top: 36, left: PX, right: PX, bottom: 40, paddingTop: pi === 0 ? 18 : 14 }}>
            {pi === 0 && (
              <div style={{ marginBottom: 14 }}>
                <h1 style={{ fontFamily: SERIF, fontSize: 19, fontWeight: "normal", margin: "0 0 4px" }}>{title}</h1>
                <p style={{ fontSize: 7.5, color: PDF.label, margin: 0 }}>created {fmtD(today())} · {list.length} {list.length === 1 ? "contact" : "contacts"}</p>
              </div>
            )}
            <div style={{ display: "flex", height: 18, alignItems: "flex-end", paddingBottom: 3, borderBottom: `1px solid ${PDF.ink}`, fontSize: 7, textTransform: "uppercase" as const, color: PDF.label }}>
              {COLS.map(c => <div key={c.key} style={cell(c.w)}>{c.label}</div>)}
            </div>
            {rows.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", height: ROW_H, borderBottom: `0.5px solid ${PDF.rule}`, fontSize: 7.5 }}>
                <div style={cell(130)}>{c.company}</div>
                <div style={cell(92)}>{c.contactName}</div>
                <div style={cell(170)}>{c.email}</div>
                <div style={cell(74)}>{catOf(c.category).label}</div>
                <div style={cell(40)}>{tierOf(c.tier).label}</div>
                <div style={cell(82)}>{c.city}</div>
                <div style={cell(110)}>{c.web}</div>
                <div style={cell(64)}>{addedText(c)}</div>
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, borderTop: `1px solid ${PDF.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${PX}px`, fontSize: 7, color: PDF.faint }}>
            <span>{[s.email, s.website].filter(Boolean).join(" · ")}</span><span>{pi + 1} / {pages.length}</span>
          </div>
        </div>
      ))}
    </>
  );
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function downloadListPdf(list: OutreachContact[], title: string, filename: string, settings: any) {
  const mw = openPdfWindow();                 // in the tap (iPhone)
  const wrap = document.createElement("div");
  wrap.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;pointer-events:none;`;
  document.body.appendChild(wrap);
  const root = createRoot(wrap);
  try {
    flushSync(() => root.render(<ListPages list={list} title={title} settings={settings} />));
    try { await (document as any).fonts?.ready; } catch { /* optional */ }
    await pause(60);
    const pages = Array.from(wrap.querySelectorAll("[data-report-page]")) as HTMLElement[];
    const pdf = await pagesToPdf(pages, "landscape");
    deliverPdf(pdf, filename, mw);
  } catch (e) {
    mw?.close();
    throw e;
  } finally {
    root.unmount();
    wrap.remove();
  }
}
