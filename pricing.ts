// ─────────────────────────────────────────────────────────────
// PRICING — the rate card is the only price source.
// No UI. No side effects. Used by the Calculator, the Service
// Catalog, the rate-card PDF and the renewal builder.
// ─────────────────────────────────────────────────────────────

import { r2, addM, addD, today, fmt } from "./formatters";
import { RENEWAL_OPTS } from "./rateCards";

// ─── SECTION TYPES ───────────────────────────────────────────
export type SectionKind = "deliverables" | "packages" | "usage" | "exclusivity" | "addons" | "info";

export const KIND_LABEL: Record<SectionKind, string> = {
  deliverables: "Deliverables",
  packages:     "Packages",
  usage:        "Usage rights",
  exclusivity:  "Exclusivity",
  addons:       "Add-ons",
  info:         "Info (not priced)",
};

// Cards made before section types existed: infer the type from the title once
export function sectionKind(sec: any): SectionKind {
  if (sec?.kind && KIND_LABEL[sec.kind as SectionKind]) return sec.kind;
  const t = String(sec?.t || "").toLowerCase();
  if (t.includes("package"))                              return "packages";
  if (t.includes("usage"))                                return "usage";
  if (t.includes("exclusiv"))                             return "exclusivity";
  if (/add-?ons?\b/.test(t))                              return "addons";
  if (t.includes("ambassador") || t.includes("retainer")) return "info";
  return "deliverables";
}

// ─── PERCENT HELPERS ─────────────────────────────────────────
const PCT_RE = /([+−-]?\s*\d+(?:[.,]\d+)?)\s*%/;
export const parsePct = (s: any): number | null => {
  const m = PCT_RE.exec(String(s ?? ""));
  return m ? Math.abs(parseFloat(m[1].replace(/[\s+−-]/g, "").replace(",", "."))) : null;
};
export const pctText = (p: number) => `${String(r2(Number(p) || 0)).replace(".", ",")} %`;

// Usage / exclusivity option: the label is stored without the price part
export const optName  = (l: any) => String(l ?? "").replace(/\s*\((?:\+?\s*\d+(?:[.,]\d+)?\s*%|included)\)\s*$/i, "").trim();
export const optLabel = (o: any) =>
  !o ? "" : o.sentinel ? String(o.l) : Number(o.pct) > 0 ? `${optName(o.l)} (+${pctText(o.pct)})` : `${optName(o.l)} (included)`;

// ─── NORMALIZE (idempotent) ──────────────────────────────────
function normItem(it: any, kind: SectionKind) {
  const out: any = { ...it };
  out.p = out.p === null || out.p === undefined || out.p === "" ? null : (Number(out.p) || 0);
  if (kind === "addons") {
    if (out.pct === undefined || out.pct === "") {
      const pc = out.p === null ? parsePct(out.m) : null;
      out.pct = pc;
    } else if (out.pct !== null) out.pct = Number(out.pct) || 0;
    if (out.perMonth === undefined) out.perMonth = /\/\s*mo/i.test(String(out.m || ""));
    if (out.info === undefined)     out.info     = /kill\s*fee/i.test(String(out.n || ""));
  }
  if (kind === "packages" && !Array.isArray(out.includes)) out.includes = [];
  return out;
}

function normOpts(arr: any[], sentinelLabel: string) {
  const list = (arr || []).map((o: any) =>
    o?.sentinel ? { ...o } : { ...o, l: optName(o?.l), pct: Number(o?.pct) || 0, mo: Number(o?.mo) || 0 }
  );
  if (!list.some((o: any) => o.sentinel)) list.unshift({ l: sentinelLabel, pct: 0, mo: 0, sentinel: true });
  return list;
}

export function normalizeCard(card: any) {
  if (!card) return card;
  return {
    ...card,
    sections: (card.sections || []).map((s: any) => {
      const kind = sectionKind(s);
      return { ...s, kind, items: (s.items || []).map((it: any) => normItem(it, kind)) };
    }),
    usage: normOpts(card.usage, "— Select usage rights —"),
    excl:  normOpts(card.excl,  "— Select exclusivity —"),
  };
}

export function normalizeCards(rc: any) {
  const out: any = {};
  Object.entries(rc || {}).forEach(([k, v]) => { out[k] = normalizeCard(v); });
  return out;
}

// ─── CARD LOOKUPS ────────────────────────────────────────────
export const BASE_CARD_KEYS = ["influencer", "ugc", "editorial", "hotels"];

export interface CardChoice { key: string; kind: "deliverable" | "package"; item: any; section: string; }

// Everything that can be quoted from a card
export function cardChoices(card: any): CardChoice[] {
  const out: CardChoice[] = [];
  (card?.sections || []).forEach((s: any, si: number) => {
    const kind = sectionKind(s);
    if (kind !== "deliverables" && kind !== "packages") return;
    (s.items || []).forEach((it: any, ii: number) => {
      if (!it?.n) return;
      out.push({ key: it.id || `${si}_${ii}`, kind: kind === "packages" ? "package" : "deliverable", item: it, section: s.t || "" });
    });
  });
  return out;
}

export function cardAddons(card: any): any[] {
  return (card?.sections || [])
    .filter((s: any) => sectionKind(s) === "addons")
    .flatMap((s: any, si: number) => (s.items || []).map((it: any, ii: number) => ({ ...it, key: it.id || `a${si}_${ii}` })))
    .filter((it: any) => it.n && !it.info);
}

// Card keys that can be quoted, base cards first, then custom cards
export function pricingCats(rc: any): string[] {
  const keys = Object.keys(rc || {}).filter(k => cardChoices(rc[k]).length > 0);
  return [...BASE_CARD_KEYS.filter(k => keys.includes(k)), ...keys.filter(k => !BASE_CARD_KEYS.includes(k)).sort()];
}

// Add-on price text for menus and the rate card
export const addonPriceText = (a: any) =>
  a.p !== null && a.p !== undefined ? `${fmt(Number(a.p) || 0)}${a.perMonth ? " / month" : ""}`
  : a.pct !== null && a.pct !== undefined ? `+${pctText(a.pct)}${a.perMonth ? " / month" : ""}`
  : (a.m || "");

// ─── LINE PRICING ────────────────────────────────────────────
export function volPct(cat: string, qty: number, on: boolean): number {
  if (!on) return 0;
  if (cat === "editorial") return 10;
  if (qty >= 10) return 20;
  if (qty >= 3)  return 15;
  return 0;
}

export interface AddonPick { addon: any; months?: number; }

export interface LineCalc {
  unit: number; qty: number; gross: number; volPct: number; base: number;
  usagePct: number; exclPct: number; uplifted: number;
  addons: { n: string; amt: number; months?: number }[];
  amt: number;
}

export function priceLine(a: { unit: number; qty: number; cat: string; vol: boolean; usagePct: number; exclPct: number; addons: AddonPick[] }): LineCalc {
  const unit     = Math.max(0, Number(a.unit) || 0);
  const qty      = Math.max(1, Math.round(Number(a.qty) || 1));
  const gross    = unit * qty;
  const vp       = volPct(a.cat, qty, a.vol);
  const base     = r2(gross * (1 - vp / 100));
  const usagePct = Number(a.usagePct) || 0;
  const exclPct  = Number(a.exclPct)  || 0;
  const uplifted = r2(base * (1 + (usagePct + exclPct) / 100));
  const addons   = (a.addons || []).map(({ addon, months }) => {
    const m   = addon.perMonth ? Math.max(1, Math.round(Number(months) || 1)) : 1;
    const amt = addon.p !== null && addon.p !== undefined
      ? r2((Number(addon.p) || 0) * m)
      : r2(uplifted * (Number(addon.pct) || 0) / 100 * m);
    return { n: addon.n, amt, ...(addon.perMonth ? { months: m } : {}) };
  });
  const amt = r2(uplifted + addons.reduce((s, x) => s + x.amt, 0));   // keep the cents (212,50 € stays 212,50 €)
  return { unit, qty, gross, volPct: vp, base, usagePct, exclPct, uplifted, addons, amt };
}

// ─── RENEWALS ────────────────────────────────────────────────
// Base price of a quote line (before usage / exclusivity / add-ons)
export function lineBase(ln: any): number {
  if (typeof ln?.base === "number") return ln.base;
  const u = typeof ln?.usagePct === "number" ? ln.usagePct : (parsePct(ln?.usageLabel) ?? 0);
  const e = typeof ln?.exclPct  === "number" ? ln.exclPct  : (parsePct(ln?.exclLabel)  ?? 0);
  const addons = Array.isArray(ln?.addonDetail) ? ln.addonDetail.reduce((s: number, x: any) => s + (Number(x.amt) || 0), 0) : 0;
  return r2(Math.max(0, (Number(ln?.amt) || 0) - addons) / (1 + (u + e) / 100));
}

// Options for a renewal, from the line's own rate card
export function renewalOptions(rc: any, cat: string, kind: "usage" | "excl"): any[] {
  const card = rc?.[cat] || rc?.influencer;
  const list = (card?.[kind] || []).filter((o: any) => !o.sentinel);
  return list.length ? list : (RENEWAL_OPTS as any)[kind];
}

// Percent of the same option on another card (same name, else same months + same type)
export function pctOn(rc: any, cat: string, kind: "usage" | "excl", opt: any): number {
  const list: any[] = rc?.[cat]?.[kind] || [];
  const name = optName(opt?.l).toLowerCase();
  const byName = list.find(o => !o.sentinel && optName(o.l).toLowerCase() === name);
  if (byName) return Number(byName.pct) || 0;
  const type = (l: string) => /paid/i.test(l) ? "paid" : /organic/i.test(l) ? "organic" : /full/i.test(l) ? "full" : /categ/i.test(l) ? "category" : "";
  const sameType = list.find(o => !o.sentinel && Number(o.mo) === Number(opt?.mo) && type(o.l) === type(opt?.l || ""));
  return sameType ? Number(sameType.pct) || 0 : Number(opt?.pct) || 0;
}

// When the current license ends (usage), across the original quote and renewals
export function licenseEnd(pr: any): string | null {
  const usageMo = (() => {
    let mo = 0;
    (pr?.qd?.lines || []).forEach((ln: any) => {
      const m = /(\d+)\s*month/i.exec(String(ln.usageLabel || ""));
      if (m && /paid/i.test(String(ln.usageLabel))) mo = Math.max(mo, parseInt(m[1]));
    });
    return mo;
  })();
  let end: string | null = pr?.usageEndOverride || (pr?.deliveryDate && usageMo ? addM(pr.deliveryDate, usageMo) : null);
  (pr?.renewals || []).forEach((r: any) => {
    if (r.type === "excl") return;
    if (r.endDate && (!end || r.endDate > end)) end = r.endDate;
  });
  return end;
}

export const renewalStart = (pr: any): string => {
  const end = licenseEnd(pr);
  return end ? addD(end, 1) : today();
};
