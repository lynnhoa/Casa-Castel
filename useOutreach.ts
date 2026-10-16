// ─────────────────────────────────────────────────────────────
// useOutreach — the Outreach email list (table outreach_contacts)
// Contacts come in through the Claude prompt (SQL in Supabase);
// the app lists, changes and deletes them.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./useSupabase";
import { registerReloader, editLock } from "./saveStatus";
import type { OutreachContact, OutreachCategory } from "./outreach";

const rowToContact = (r: any): OutreachContact => ({
  id:          r.id,
  company:     r.company ?? "",
  contactName: r.contact_name ?? "",
  email:       r.email ?? "",
  category:    (r.category ?? "others") as OutreachCategory,
  web:         r.web ?? "",
  city:        r.city ?? "",
  notes:       r.notes ?? "",
  source:      r.source ?? "",
  createdAt:   r.created_at ?? "",
});

export function useOutreach(userId: string | null) {
  const [contacts,   setContacts]   = useState<OutreachContact[]>([]);
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
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => registerReloader(() => { load(); }), [load]);

  // Every time you come back to the app (e.g. after running Claude's SQL in
  // Supabase) the list reloads at once — not while a contact is being edited.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible" && !editLock.active()) load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, [load]);
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

  return { contacts, loading, loadError, loginEmail, reload: load, updateContact, deleteContact };
}
