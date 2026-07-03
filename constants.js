/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — CONSTANTS
   js/constants.js

   Single source of truth for all app-wide values.
   Import or load this first — everything else depends on it.
   ───────────────────────────────────────────────────────────── */

/* ── SUPABASE ──────────────────────────────────────────── */
const SB_URL  = 'https://nqxsonmmcnmdastcpiff.supabase.co';
const SB_KEY  = 'sb_publishable_t2gaxYkyyGS32sEJJuCAnA_qk_G7sYM';

/* ── AUTH ───────────────────────────────────────────────── */
/* Landlord auth = Supabase email + password on login.html.
   No hardcoded landlord password anymore.                    */

/* ── ROOMS ──────────────────────────────────────────────── */
const ALL_ROOMS     = ['Paris','Copenhagen','Stockholm','Oslo','London','New York','Los Angeles'];
const KITCHEN_ROOMS = ['London','Copenhagen','Stockholm','Oslo'];

/* ── HOUSE CLEANING ROTATION ────────────────────────────── */
/* All 7 rooms rotate monthly from HC_START                  */
const HC_START = new Date('2026-05-01T00:00:00');

/* ── KITCHEN ROTATION ───────────────────────────────────── */
/* Kitchen rooms only, weekly from K_START (Mon–Sun)         */
const K_ROTATION  = ['London','Copenhagen','Stockholm','Oslo'];
const K_START     = new Date('2026-01-05T00:00:00'); /* Mon 05 Jan 2026 */

/* ── BUILDING INFO ──────────────────────────────────────── */
const BIN_DAY = 'Every Friday';
const ADDRESS = 'Alsenstraße 60, 55252 Mainz-Kastel';
