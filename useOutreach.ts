// ─────────────────────────────────────────────────────────────
// useOutreach — the Outreach email list (table outreach_contacts)
// and, from Stage 2, the pitch log (table outreach_pitches).
// Contacts come in through the Claude prompt (SQL in Supabase);
// the app lists, changes and deletes them, sets their status and
// logs pitches and follow-ups.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./useSupabase";
import { registerReloader } from "./saveStatus";
import { today } from "./formatters";
import type { OutreachContact, OutreachCategory, OutreachTier, OutreachStatus, Pitch, PitchAccount } from "./outreach";

const rowToContact = (r: any): OutreachContact => ({
  id:          r.id,
  company:     r.company ?? "",
  contactName: r.contact_name ?? "",
  email:       r.email ?? "",
  category:    (r.category ?? "others") as OutreachCategory,
  tier:        (r.tier ?? "now") as OutreachTier,
  status:      (r.status || "new") as OutreachStatus,
  lastContact: r.last_contact ? String(r.last_contact).slice(0, 10) : null,
  web:         r.web ?? "",
  city:        r.city ?? "",
  notes:       r.notes ?? "",
  source:      r.source ?? "",
  createdAt:   r.created_at ?? "",
});

const rowToPitch = (r: any): Pitch => ({
  id: r.id, contactId: r.contact_id, account: r.account, kind: r.kind === "follow_up" ? "follow_up" : "pitch",
  sentOn: String(r.sent_on).slice(0, 10),
});
const chunks = <T,>(a: T[], n = 400): T[][] => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

export function useOutreach(userId: string | null) {
  const [contacts,   setContacts]   = useState<OutreachContact[]>([]);
  const [pitches,    setPitches]    = useState<Pitch[]>([]);
  const [pitchError, setPitchError] = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");

  const load = useCallback(async () => {
    if (!userId) { setContacts([]); setLoading(false); return; }
    const res: any = await supabase.from("outreach_contacts").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (res?.error) {
      // table not created yet → say so plainly
      const missing = /outreach_contacts/.test(res.error.message || "") && /exist|schema cache|relation/i.test(res.error.message || "");
      setLoadError(missing ? "The email list table doesn't exist yet — run the Outreach SQL in Supabase once." : res.error.message);
    } else {
      setLoadError(null);
      setContacts((res?.data || []).map(rowToContact));
    }
    // the pitch log (Stage 2); if its table isn't there yet, the list still works
    const pr: any = await supabase.from("outreach_pitches").select("*").eq("user_id", userId).order("sent_on");
    if (pr?.error) setPitchError(/outreach_pitches/.test(pr.error.message || "") ? "The pitch log table doesn't exist yet — run the Phase 6 SQL in Supabase once." : pr.error.message);
    else { setPitchError(null); setPitches((pr?.data || []).map(rowToPitch)); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => registerReloader(() => { load(); }), [load]);
  useEffect(() => {
    let cancelled = false;
    try {
      supabase.auth?.getSession?.().then((r: any) => { if (!cancelled) setLoginEmail(r?.data?.session?.user?.email || ""); });
    } catch { /* no session info: the prompt shows a placeholder */ }
    return () => { cancelled = true; };
  }, [userId]);

  const updateContact = useCallback(async (id: string, patch: Partial<OutreachContact>) => {
    const row: any = {};
    if (patch.company     !== undefined) row.company      = patch.company.trim();
    if (patch.contactName !== undefined) row.contact_name = patch.contactName.trim();
    if (patch.email       !== undefined) row.email        = patch.email.trim().toLowerCase();
    if (patch.category    !== undefined) row.category     = patch.category;
    if (patch.tier        !== undefined) row.tier         = patch.tier;
    if (patch.web         !== undefined) row.web          = patch.web.trim();
    if (patch.city        !== undefined) row.city         = patch.city.trim();
    if (patch.notes       !== undefined) row.notes        = patch.notes;
    const { error } = await supabase.from("outreach_contacts").update(row).eq("id", id).eq("user_id", userId);
    if (error) throw new Error(/unique|duplicate/i.test(error.message) ? "This email is already on your list." : error.message);
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...patch, email: row.email ?? c.email } : c));
  }, [userId]);

  const deleteContact = useCallback(async (id: string) => {
    const { error } = await supabase.from("outreach_contacts").delete().eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    setContacts(prev => prev.filter(c => c.id !== id));
  }, [userId]);

  // ── tracking ────────────────────────────────────────────────
  const setStatus = useCallback(async (id: string, status: OutreachStatus) => {
    const { error } = await supabase.from("outreach_contacts").update({ status: status === "new" ? null : status }).eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    setContacts(prev => prev.map(c => (c.id === id ? { ...c, status } : c)));
  }, [userId]);

  // Log a pitch or follow-up for one or many contacts: not-contacted → Pitched, last contact = that day
  const logPitches = useCallback(async (ids: string[], account: PitchAccount, kind: "pitch" | "follow_up", sentOn: string = today()) => {
    if (!ids.length) return;
    const added: Pitch[] = [];
    for (const part of chunks(ids)) {
      const { data, error } = await supabase.from("outreach_pitches").insert(part.map(id => ({ contact_id: id, account, kind, sent_on: sentOn }))).select();
      if (error) throw new Error(error.message);
      (data || []).forEach((r: any) => added.push(rowToPitch(r)));
    }
    const byId = new Map(contacts.map(c => [c.id, c]));
    const toPitched = ids.filter(id => (byId.get(id)?.status || "new") === "new");
    const newer     = ids.filter(id => { const lc = byId.get(id)?.lastContact; return !lc || lc < sentOn; });
    for (const part of chunks(toPitched)) {
      const { error } = await supabase.from("outreach_contacts").update({ status: "pitched" }).in("id", part).eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    for (const part of chunks(newer)) {
      const { error } = await supabase.from("outreach_contacts").update({ last_contact: sentOn }).in("id", part).eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    const tp = new Set(toPitched), nw = new Set(newer);
    setPitches(prev => [...prev, ...added]);
    setContacts(prev => prev.map(c => (tp.has(c.id) || nw.has(c.id) ? { ...c, status: tp.has(c.id) ? "pitched" : c.status, lastContact: nw.has(c.id) ? sentOn : c.lastContact } : c)));
  }, [userId, contacts]);

  // Remove a wrong entry: last contact goes back to the one before; no entries left → not contacted again
  const deletePitch = useCallback(async (p: Pitch) => {
    const { error } = await supabase.from("outreach_pitches").delete().eq("id", p.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    const rest = pitches.filter(x => x.contactId === p.contactId && x.id !== p.id);
    const last = rest.reduce<string | null>((m, x) => (!m || x.sentOn > m ? x.sentOn : m), null);
    const c = contacts.find(x => x.id === p.contactId);
    const patch: any = { last_contact: last };
    const backToNew = !rest.length && c?.status === "pitched";
    if (backToNew) patch.status = null;
    const { error: e2 } = await supabase.from("outreach_contacts").update(patch).eq("id", p.contactId).eq("user_id", userId);
    if (e2) throw new Error(e2.message);
    setPitches(prev => prev.filter(x => x.id !== p.id));
    setContacts(prev => prev.map(x => (x.id === p.contactId ? { ...x, lastContact: last, status: backToNew ? "new" : x.status } : x)));
  }, [userId, pitches, contacts]);

  return { contacts, pitches, pitchError, loading, loadError, loginEmail, reload: load, updateContact, deleteContact, setStatus, logPitches, deletePitch };
}
