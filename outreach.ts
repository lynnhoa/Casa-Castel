// ─────────────────────────────────────────────────────────────
// outreach — ONE place for the email list's columns, categories
// and the Claude prompt. The "Excel columns" window, the Prompt
// button, the Excel template and the Excel/PDF downloads all read
// from here, so they always match. Stage 2 adds tracking: a status
// per contact (pitched → replied → gifted / deal) and the pitch log.
// ─────────────────────────────────────────────────────────────

export type OutreachCategory = "fashion" | "beauty" | "agency" | "ugc" | "hotel" | "restaurants" | "events" | "others";

export const OUTREACH_CATEGORIES: { key: OutreachCategory; label: string; color: string; bg: string; border: string }[] = [
  { key: "fashion",     label: "Fashion",     color: "#6a6aaa", bg: "#f0f0f5", border: "#c8c8e0" },
  { key: "beauty",      label: "Beauty",      color: "#a8804f", bg: "#fdf5ee", border: "#e8d8c8" },
  { key: "agency",      label: "Agency",      color: "#6b655e", bg: "#f3f1ee", border: "#e8e4df" },
  { key: "ugc",         label: "UGC",         color: "#9a6a8a", bg: "#f7f0f4", border: "#e4cfdc" },
  { key: "hotel",       label: "Hotel",       color: "#5a7a9a", bg: "#eef3f8", border: "#c8d6e6" },
  { key: "restaurants", label: "Restaurants", color: "#6f8f6f", bg: "#f0f5f0", border: "#b8d4b8" },
  { key: "events",      label: "Events",      color: "#5f8580", bg: "#eef5f4", border: "#c6dcd9" },
  { key: "others",      label: "Others",      color: "#888888", bg: "#f5f4f2", border: "#e0dcd6" },
];
export const catOf = (k: string) => OUTREACH_CATEGORIES.find(c => c.key === k) || OUTREACH_CATEGORIES.find(c => c.key === "others")!;

// Brand tier: who you pitch at which stage (now → Stages 2–3, premium → Stage 4, luxury → Stage 5)
export type OutreachTier = "now" | "premium" | "luxury";
export const OUTREACH_TIERS: { key: OutreachTier; label: string }[] = [
  { key: "now",     label: "Now" },
  { key: "premium", label: "Premium" },
  { key: "luxury",  label: "Luxury" },
];
export const tierOf = (k: string) => OUTREACH_TIERS.find(t => t.key === k) || OUTREACH_TIERS[0];

// Tracking (Stage 2): where a contact stands. "new" = not contacted yet (empty in the table)
export type OutreachStatus = "new" | "pitched" | "replied" | "gifted" | "deal";
export const OUTREACH_STATUSES: { key: OutreachStatus; label: string }[] = [
  { key: "new",     label: "Not contacted" },
  { key: "pitched", label: "Pitched" },
  { key: "replied", label: "Replied" },
  { key: "gifted",  label: "Gifted" },
  { key: "deal",    label: "Deal" },
];
export const statusOf = (k: string) => OUTREACH_STATUSES.find(s => s.key === k) || OUTREACH_STATUSES[0];
// A follow-up is due when a pitched contact hasn't answered for this many days
export const FOLLOW_UP_DAYS = 7;
const daysSince = (ymd: string, now = new Date()) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const a = new Date(y, m - 1, d), b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b.getTime() - a.getTime()) / 864e5);
};
export const followUpDue = (c: { status: string; lastContact: string | null }, now = new Date()) =>
  c.status === "pitched" && !!c.lastContact && daysSince(c.lastContact, now) >= FOLLOW_UP_DAYS;

// One pitch or follow-up sent to a contact, for one account
export type PitchAccount = "lynnhoa" | "createbylynn";
export interface Pitch {
  id:        string;
  contactId: string;
  account:   PitchAccount;
  kind:      "pitch" | "follow_up";
  sentOn:    string;   // yyyy-mm-dd
}
export const PITCH_ACCOUNTS: { key: PitchAccount; label: string }[] = [
  { key: "lynnhoa", label: "@lynnhoa" },
  { key: "createbylynn", label: "@createbylynn" },
];

export interface OutreachContact {
  id:          string;
  company:     string;
  contactName: string;
  email:       string;
  category:    OutreachCategory;
  tier:        OutreachTier;
  status:      OutreachStatus;
  lastContact: string | null;   // date of the last pitch or follow-up
  web:         string;          // website or Instagram
  city:        string;
  notes:       string;
  source:      string;          // file the contact came from
  createdAt:   string;          // ISO timestamp
}

// The columns of the list (Excel columns window, template, downloads)
export interface OutreachColumn { key: keyof OutreachContact; label: string; required: boolean; example: string; note?: string; }
export const OUTREACH_COLUMNS: OutreachColumn[] = [
  { key: "company",     label: "Company",             required: true,  example: "Chanel",             note: "Brand, hotel, restaurant or agency" },
  { key: "email",       label: "Email",               required: true,  example: "pr@chanel.com",      note: "Rows without an email are skipped" },
  { key: "contactName", label: "Contact name",        required: false, example: "Poma" },
  { key: "category",    label: "Category",            required: false, example: "fashion",            note: "fashion · beauty · agency · ugc · hotel · restaurants · events · others — empty: Claude decides" },
  { key: "tier",        label: "Tier",                required: false, example: "now",                note: "now · premium · luxury — empty: now" },
  { key: "web",         label: "Website / Instagram", required: false, example: "@chanel" },
  { key: "city",        label: "City",                required: false, example: "Paris" },
  { key: "notes",       label: "Notes",               required: false, example: "Met at Fashion Week" },
];

// Tab-separated header row: paste into cell A1 in Excel
export const headerRow = () => OUTREACH_COLUMNS.map(c => c.label).join("\t");

// ── The prompt for Claude (SQL for the Supabase SQL editor) ──
export function buildPrompt(loginEmail: string): string {
  const email = loginEmail || "YOUR-LOGIN-EMAIL";
  const cats = OUTREACH_CATEGORIES.map(c => c.key).join(", ");
  return `I'm attaching an Excel/CSV list of contacts for my outreach email list. Please turn it into ONE SQL statement for my Supabase database.

1. Read every row. Find these fields (the column names in my file may differ slightly):
   company, contact name, email, category, tier, website or Instagram, city, notes.
2. Clean the data:
   - trim spaces; write every email in lowercase
   - skip rows without a valid email address
   - if the same email appears more than once in the file, keep it once
3. Category: give every contact exactly one of: ${cats}.
   Use the file's category column if it has one, otherwise decide from the company name, website or notes. If unsure: others.
4. Tier: now, premium or luxury. Use the file's tier column if it has one; otherwise now.
5. Output ONLY this SQL (no explanation before it). Escape apostrophes by doubling them (O'Brien → O''Brien). Use '' for empty fields. Put the file name in "source". If there are more than 500 contacts, make several statements of max. 500 rows.

insert into public.outreach_contacts (user_id, company, contact_name, email, category, tier, web, city, notes, source)
select u.id, v.company, v.contact_name, v.email, v.category, v.tier, v.web, v.city, v.notes, v.source
from (values
  ('Chanel', 'Poma', 'pr@chanel.com', 'fashion', 'luxury', '@chanel', 'Paris', '', 'my-list.xlsx')
) as v(company, contact_name, email, category, tier, web, city, notes, source)
cross join (select id from auth.users where email = '${email}') u
on conflict (user_id, email) do nothing;

6. After the SQL, add a 3-line summary: rows read, rows skipped (no email / duplicate in file), and the count per category.

I'll run the SQL in Supabase → SQL editor. Emails that are already on my list are skipped automatically.`;
}

// Search / filter / sort helpers
export type SortKey = "az" | "za" | "new" | "old" | "cat";
export const SORTS: { key: SortKey; label: string; short: string }[] = [
  { key: "az",  label: "Name A–Z",     short: "A–Z" },
  { key: "za",  label: "Name Z–A",     short: "Z–A" },
  { key: "new", label: "Newest added", short: "Newest" },
  { key: "old", label: "Oldest added", short: "Oldest" },
  { key: "cat", label: "Category",     short: "Category" },
];
export type AddedKey = "any" | "30d" | "year";
export const ADDED: { key: AddedKey; label: string }[] = [
  { key: "any",  label: "Any time" },
  { key: "30d",  label: "Last 30 days" },
  { key: "year", label: "This year" },
];
export interface OutreachView { q: string; cat: string; tier: string; status: string; city: string; added: AddedKey; sort: SortKey; }
export const DEFAULT_VIEW: OutreachView = { q: "", cat: "all", tier: "all", status: "all", city: "all", added: "any", sort: "az" };
// Status filter: the statuses plus "Follow-up due"
export const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  ...OUTREACH_STATUSES.map(s => ({ key: s.key, label: s.label })),
  { key: "followup", label: "Follow-up due" },
];

export function applyView(list: OutreachContact[], v: OutreachView, now = new Date()): OutreachContact[] {
  const q = v.q.trim().toLowerCase();
  const since30 = new Date(now.getTime() - 30 * 864e5).toISOString();
  const yearStart = `${now.getFullYear()}-01-01`;
  const out = list.filter(c =>
    (!q || [c.company, c.contactName, c.email].some(x => (x || "").toLowerCase().includes(q))) &&
    (v.cat === "all" || c.category === v.cat) &&
    (v.tier === "all" || (c.tier || "now") === v.tier) &&
    (!v.status || v.status === "all" || (v.status === "followup" ? followUpDue(c, now) : (c.status || "new") === v.status)) &&
    (v.city === "all" || (c.city || "") === v.city) &&
    (v.added === "any" || (v.added === "30d" ? c.createdAt >= since30 : c.createdAt >= yearStart))
  );
  const byName = (a: OutreachContact, b: OutreachContact) => (a.company || a.email).localeCompare(b.company || b.email, "de", { sensitivity: "base" });
  const catIdx = (c: OutreachContact) => OUTREACH_CATEGORIES.findIndex(x => x.key === c.category);
  out.sort((a, b) =>
    v.sort === "za"  ? byName(b, a)
    : v.sort === "new" ? b.createdAt.localeCompare(a.createdAt)
    : v.sort === "old" ? a.createdAt.localeCompare(b.createdAt)
    : v.sort === "cat" ? (catIdx(a) - catIdx(b)) || byName(a, b)
    : byName(a, b));
  return out;
}

export const activeFilters = (v: OutreachView) => (v.cat !== "all" ? 1 : 0) + (v.tier !== "all" ? 1 : 0) + (v.status && v.status !== "all" ? 1 : 0) + (v.city !== "all" ? 1 : 0) + (v.added !== "any" ? 1 : 0);

// "a@x.com, b@y.com" — ready for BCC in Gmail, Outlook, Apple Mail
export const emailsText = (list: OutreachContact[]) => list.map(c => c.email).filter(Boolean).join(", ");

// Copy text — works in the iPhone home-screen app too
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch { return false; }
  }
}
