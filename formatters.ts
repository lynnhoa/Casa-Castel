// ─────────────────────────────────────────────────────────────
// FORMATTERS — pure utility functions
// No UI. No side effects. Import anywhere.
// ─────────────────────────────────────────────────────────────

// ─── CURRENCY (German format: 1.234,00 €) ────────────────────
const num2 = (n: number | null | undefined): string =>
  Number(n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmt = (n: number | null | undefined): string => `${num2(n)} €`;

// Number only, German format, 2 decimals ("1.234,00")
export const fmtE = (n: number | null | undefined): string => num2(n);

// Percent, German format ("22,15 %"; whole numbers stay "20 %")
export const fmtPct = (n: number | null | undefined): string => {
  const v = Number(n || 0);
  return `${Number.isInteger(v) ? String(v) : v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
};

// Round to cents
export const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

// ─── DATES (local calendar dates, never shifted by UTC) ──────
const pad2 = (n: number) => String(n).padStart(2, "0");

// Date object → "YYYY-MM-DD" in local time
export const ymd = (dt: Date): string =>
  `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

// "YYYY-MM-DD" (or ISO with time) → local Date at midnight, or null
export const parseYMD = (d: string | null | undefined): Date | null => {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
};

export const today = (): string => ymd(new Date());

// "15.03.2026" (German format everywhere; second argument kept for old calls)
export const fmtD = (d: string | null | undefined, _german?: boolean): string => {
  const dt = parseYMD(d);
  if (!dt) return "—";
  return `${pad2(dt.getDate())}.${pad2(dt.getMonth() + 1)}.${dt.getFullYear()}`;
};

// Add days to a date string
export const addD = (d: string, days: number): string | null => {
  const dt = parseYMD(d);
  if (!dt || !days) return null;
  dt.setDate(dt.getDate() + days);
  return ymd(dt);
};

// Add months; end of month is clamped (31 Jan + 1 month = 28/29 Feb)
export const addM = (d: string, m: number): string | null => {
  const dt = parseYMD(d);
  if (!dt || !m) return null;
  const day = dt.getDate();
  const target = new Date(dt.getFullYear(), dt.getMonth() + m, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return ymd(target);
};

// Whole days from today to a date (negative = past)
export const dLeft = (d: string | null | undefined): number | null => {
  const dt = parseYMD(d);
  if (!dt) return null;
  const t = parseYMD(today())!;
  return Math.round((dt.getTime() - t.getTime()) / 864e5);
};

// First / last day of the month of a date
export const monthStart = (d: string): string => {
  const dt = parseYMD(d) || new Date();
  return ymd(new Date(dt.getFullYear(), dt.getMonth(), 1));
};
export const monthEnd = (d: string): string => {
  const dt = parseYMD(d) || new Date();
  return ymd(new Date(dt.getFullYear(), dt.getMonth() + 1, 0));
};

// ─── IDS ─────────────────────────────────────────────────────
export const uid = (): string =>
  Math.random().toString(36).slice(2, 9);

// ─── DOCUMENT NUMBERS ────────────────────────────────────────
export const deriveContractNo = (qNo: string): string =>
  `CON-${(qNo || "").replace(/^QUO-?/i, "").trim() || "001"}`;

export const deriveInvoiceNo = (
  iNo: string | undefined,
  qNo: string
): string =>
  iNo || `INV-${(qNo || "").replace(/^QUO-?/i, "").trim() || "001"}`;

// ─── RATE CARD HELPERS ────────────────────────────────────────
// A section title is "single" if it is not a meta-section
// (packages, usage rights, exclusivity, add-ons, etc.)
export const isSingle = (t: string): boolean =>
  !["package", "usage", "excl", "add", "volume", "brand ambass", "retainer", "hosted"]
    .some(k => t.toLowerCase().includes(k));

// ─── USAGE MONTHS ────────────────────────────────────────────
// Extract usage months from a QuoteDoc
export const getUsageMo = (qd: any): number | null => {
  if (!qd) return null;
  if (qd.mo && qd.mo > 0) return qd.mo;
  const lines = qd.lines || [];
  for (const l of lines) {
    if (l.usageLabel) {
      const m = String(l.usageLabel).match(/([0-9]+)\s*month/i);
      if (m) return parseInt(m[1]);
    }
    if (l.name) {
      const m = String(l.name).match(/([0-9]+)\s*month/i);
      if (m) return parseInt(m[1]);
    }
  }
  return null;
};

// ─── STATUS COLOR / CATEGORY LABEL (one source: constants.ts) ─
import { C, STATUS_COLOR, catInfo } from "./constants";

export const scol = (s: string): string => STATUS_COLOR[String(s || "").toLowerCase()] || C.light;

export const catLabel = (cat: string): string => catInfo(cat).label;

// ─── INITIALS ────────────────────────────────────────────────
export const initials = (nameOrCompany: string): string => {
  const n = (nameOrCompany || "LH").trim();
  const parts = n.split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : n.slice(0, 2).toUpperCase();
};

// ─── GERMAN NUMBER INPUT ──────────────────────────────────────
// Reads what people type: "212,50" · "1.200,75" · "1200.75" · "30 %"
// German: comma = decimals, dots = thousands. Returns null when empty/invalid.
export function parseDE(raw: any): number | null {
  let s = String(raw ?? "").replace(/[€%\s\u00a0]/g, "").replace(/\u2212/g, "-");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Number in German format for a field: 1200.5 → "1.200,50" (money) or "22,5" (min decimals 0)
export const fmtNumDE = (n: number | null | undefined, minDec = 2): string =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? "" :
  Number(n).toLocaleString("de-DE", { minimumFractionDigits: minDec, maximumFractionDigits: 2 });

// "20% off" → "20 % off" (German spacing, for texts people typed)
export const pctSpace = (t: any): string => String(t ?? "").replace(/(\d)\s?%/g, "$1 %");
