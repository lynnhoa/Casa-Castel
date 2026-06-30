/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — SETTINGS
   js/settings.js

   Single source of truth for the settings row in Supabase.
   Exposes:
     - appSettings         global cache object
     - loadSettings()      fetch once, populate cache
     - updateSettings()    partial update, re-cache
     - onSettingsChange()  register a callback for realtime updates
     - initSettingsRealtime() start realtime subscription

   Depends on: constants.js, supabase-client.js
   Load order: after supabase-client.js, before tab modules
   ───────────────────────────────────────────────────────────── */


/* ── CACHE ───────────────────────────────────────────────── */
// Populated by loadSettings(). Read from anywhere in the app.
let appSettings = {
  // Vermieter
  vermieter_name:     '',
  vermieter_adresse:  '',
  vermieter_email:    '',

  // Objekt
  objekt_adresse:     '',
  objekt_plz_ort:     '',
  gerichtsstand:      '',
  unterschrift_ort:   '',

  // Bank
  kontoinhaber:       '',
  bankname:           '',
  iban:               '',
  bic:                '',

  // Energieausweis (§ 16a GEG) — house-level, single source of truth
  energieklasse:     '',   // e.g. 'D'
  endenergiebedarf:  '',   // e.g. '142 kWh/(m²·a)'
  energieausweisart: '',   // 'Verbrauchsausweis' | 'Bedarfsausweis'

  // Building lists
  gemeinschaftsraeume: [],  // string[]
  badezimmer:          [],  // string[]
  zaehler:             [],  // { type: string, nummer: string }[]
};


/* ── CHANGE LISTENERS ────────────────────────────────────── */
// Tab modules register callbacks here to react to realtime updates.
// Only called when gemeinschaftsraeume or badezimmer actually change.
const _settingsListeners = [];

function onSettingsChange(cb) {
  if (typeof cb === 'function') _settingsListeners.push(cb);
}

function _notifyListeners(changedFields) {
  _settingsListeners.forEach(cb => {
    try { cb(appSettings, changedFields); } catch (e) { console.warn('Settings listener error:', e); }
  });
}


/* ── FETCH ───────────────────────────────────────────────── */
async function loadSettings() {
  if (!sbL) return appSettings;

  const { data, error } = await sbL
    .from('settings')
    .select('*')
    .eq('id', 'default')
    .single();

  if (error) {
    console.warn('[settings] fetch error:', error.message);
    return appSettings;
  }

  _applyToCache(data);
  return appSettings;
}


/* ── UPDATE ──────────────────────────────────────────────── */
// Pass only the fields you want to change.
// Returns { ok: true } or { ok: false, error }
async function updateSettings(fields) {
  if (!sbL) return { ok: false, error: 'No database connection.' };

  const { error } = await sbL
    .from('settings')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', 'default');

  if (error) {
    console.warn('[settings] update error:', error.message);
    return { ok: false, error: error.message };
  }

  // Optimistically update cache
  const changed = Object.keys(fields);
  Object.assign(appSettings, fields);
  _notifyListeners(changed);

  return { ok: true };
}


/* ── REALTIME ────────────────────────────────────────────── */
// Subscribes to changes on the settings row.
// On UPDATE: re-fetch, update cache, notify listeners if
// gemeinschaftsraeume or badezimmer changed (room cards need to re-render).
let _settingsChannel = null;

function initSettingsRealtime() {
  if (!sbL) return;
  if (_settingsChannel) return; // already subscribed

  _settingsChannel = sbL
    .channel('settings-row')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'settings', filter: 'id=eq.default' },
      payload => {
        const prev = {
          gemeinschaftsraeume: JSON.stringify(appSettings.gemeinschaftsraeume),
          badezimmer:          JSON.stringify(appSettings.badezimmer),
        };

        _applyToCache(payload.new);

        // Only notify if building-level lists changed
        // (avoids unnecessary room card re-renders on e.g. bank detail saves)
        const changed = [];
        if (JSON.stringify(appSettings.gemeinschaftsraeume) !== prev.gemeinschaftsraeume) {
          changed.push('gemeinschaftsraeume');
        }
        if (JSON.stringify(appSettings.badezimmer) !== prev.badezimmer) {
          changed.push('badezimmer');
        }
        if (changed.length) _notifyListeners(changed);
      }
    )
    .subscribe();
}


/* ── INTERNAL ────────────────────────────────────────────── */
function _applyToCache(row) {
  if (!row) return;
  appSettings.vermieter_name      = row.vermieter_name      ?? appSettings.vermieter_name;
  appSettings.vermieter_adresse   = row.vermieter_adresse   ?? appSettings.vermieter_adresse;
  appSettings.vermieter_email     = row.vermieter_email     ?? appSettings.vermieter_email;
  appSettings.objekt_adresse      = row.objekt_adresse      ?? appSettings.objekt_adresse;
  appSettings.objekt_plz_ort      = row.objekt_plz_ort      ?? appSettings.objekt_plz_ort;
  appSettings.gerichtsstand       = row.gerichtsstand       ?? appSettings.gerichtsstand;
  appSettings.unterschrift_ort    = row.unterschrift_ort    ?? appSettings.unterschrift_ort;
  appSettings.kontoinhaber        = row.kontoinhaber        ?? appSettings.kontoinhaber;
  appSettings.bankname            = row.bankname            ?? appSettings.bankname;
  appSettings.iban                = row.iban                ?? appSettings.iban;
  appSettings.bic                 = row.bic                 ?? appSettings.bic;
  appSettings.gemeinschaftsraeume = Array.isArray(row.gemeinschaftsraeume) ? row.gemeinschaftsraeume : appSettings.gemeinschaftsraeume;
  appSettings.badezimmer          = Array.isArray(row.badezimmer)          ? row.badezimmer          : appSettings.badezimmer;
  appSettings.zaehler             = Array.isArray(row.zaehler)             ? row.zaehler             : appSettings.zaehler;
  appSettings.energieklasse       = row.energieklasse     ?? appSettings.energieklasse;
  appSettings.endenergiebedarf    = row.endenergiebedarf  ?? appSettings.endenergiebedarf;
  appSettings.energieausweisart   = row.energieausweisart ?? appSettings.energieausweisart;
}
