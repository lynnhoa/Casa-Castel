// ─────────────────────────────────────────────────────────────
// App.tsx — root component (self-contained auth, no external useAuth)
// ─────────────────────────────────────────────────────────────

import { Component, useState, useEffect, useRef, useMemo } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useSettings }  from "./useSettings";
import { useClients }   from "./useClients";
import { useRateCards } from "./useRateCards";
import AuthScreen       from "./AuthScreen";
import ManagerApp       from "./ManagerApp";
import CreatorApp       from "./CreatorApp";
import { Loading, SaveToast, LoadErrorBanner } from "./atoms";
import PlaceholderApp from "./PlaceholderApp";
import OutreachApp from "./OutreachApp";
import PlannerApp from "./PlannerApp";
import { editLock, reloadAll } from "./saveStatus";
import { newVersionAvailable } from "./appVersion";
import { supabase, supabaseConfigured } from "./useSupabase";
import { C, SANS, SERIF, TYPE } from "./constants";
import type { Role } from "./types";

// ─── INLINE AUTH HOOK (no external file) ─────────────────────
function useAuth() {
  const [userId, setUserId]   = useState<string | null>(null);
  const [role, setRole]       = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const signingIn = useRef(false);

  const ROLES: Role[] = ["planner", "outreach", "manager", "creator"];
  const getRole = (): Role => {
    try { const r = sessionStorage.getItem("lh_role") as Role; return ROLES.includes(r) ? r : "manager"; }
    catch { return "manager"; }
  };

  useEffect(() => {
    let cancelled = false;

    // Safe session check — no destructuring
    supabase.auth.getSession().then((res) => {
      if (cancelled) return;
      const session = res?.data?.session;
      if (session?.user) {
        setUserId(session.user.id);
        setRole(getRole());
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    // Safe auth listener — no destructuring
    let unsub: (() => void) | null = null;
    try {
      const listener = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;
        if (event === "SIGNED_OUT") {
          try { sessionStorage.removeItem("lh_role"); } catch {}
          setUserId(null);
          setRole(null);
          setLoading(false);
        }
        if (event === "SIGNED_IN" && session?.user && signingIn.current) {
          signingIn.current = false;
          setUserId(session.user.id);
          setRole(getRole());
          setLoading(false);
        }
      });
      unsub = () => { try { listener?.data?.subscription?.unsubscribe(); } catch {} };
    } catch {}

    return () => { cancelled = true; if (unsub) unsub(); };
  }, []);

  const signIn = async (email: string, password: string, r: Role): Promise<string | null> => {
    try { sessionStorage.setItem("lh_role", r); } catch {}
    signingIn.current = true;
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        signingIn.current = false;
        try { sessionStorage.removeItem("lh_role"); } catch {}
        setError(err.message);
        setLoading(false);
        return err.message;
      }
      return null;
    } catch (e: any) {
      signingIn.current = false;
      setLoading(false);
      return e?.message || "Sign in failed";
    }
  };

  const signOut = async () => {
    try { sessionStorage.removeItem("lh_role"); } catch {}
    await supabase.auth.signOut();
  };

  // go straight to any of the four apps (no new login)
  const switchTo = (next: Role) => {
    try { sessionStorage.setItem("lh_role", next); } catch {}
    setRole(next);
    window.scrollTo(0, 0);
  };

  return { userId, role, loading, error, signIn, signOut, switchTo };
}

// ─── ERROR BOUNDARY ──────────────────────────────────────────
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[LH Studio] Uncaught error:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: C.bg, fontFamily: SANS, padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" as const }}>
            <h1 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: "normal", color: C.black, margin: "0 0 12px" }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: TYPE.subtext.size, color: C.muted, lineHeight: 1.7, margin: "0 0 20px" }}>
              An unexpected error occurred. Your data is safe — just reload to continue.
            </p>
            {this.state.error && (
              <div style={{ border: `1px solid ${C.rule}`, borderRadius: 2, padding: "10px 14px", marginBottom: 20, background: C.white, textAlign: "left" as const }}>
                <p style={{ fontSize: TYPE.micro.size, fontFamily: "monospace", color: C.red, margin: 0, wordBreak: "break-word" as const }}>
                  {this.state.error.message} {this.state.error.stack?.split("\n")[1] || ""}
                </p>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{ padding: "12px 32px", background: C.black, color: C.white, border: "none", borderRadius: 2, cursor: "pointer", fontFamily: SANS, fontSize: TYPE.button.size, letterSpacing: "0.10em", textTransform: "uppercase" as const, minHeight: 44 }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── ENV MISSING ─────────────────────────────────────────────
function EnvMissingScreen() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: C.bg, fontFamily: SANS, padding: 24 }}>
      <div style={{ maxWidth: 480, textAlign: "center" as const }}>
        <h1 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: "normal", color: C.black, margin: "0 0 12px" }}>Lynn Hoa Studio</h1>
        <div style={{ border: `1px solid ${C.red}`, borderRadius: 2, padding: "20px 24px", background: "#fdf0f0", marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: C.red, margin: "0 0 8px", fontWeight: "600" }}>Supabase environment variables missing</p>
          <p style={{ fontSize: 12, color: C.red, margin: 0, lineHeight: 1.6 }}>
            <code style={{ background: "rgba(0,0,0,0.07)", padding: "1px 5px", borderRadius: 2 }}>VITE_SUPABASE_URL</code>
            {" "}and{" "}
            <code style={{ background: "rgba(0,0,0,0.07)", padding: "1px 5px", borderRadius: 2 }}>VITE_SUPABASE_ANON_KEY</code>
            {" "}are not set.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── ROOT ────────────────────────────────────────────────────
export default function App() {
  if (!supabaseConfigured) return <EnvMissingScreen />;
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}

function AppInner() {
  const { userId, role, loading: authLoading, signIn, signOut, switchTo } = useAuth();
  const settingsHook  = useSettings(userId);
  const clientsHook   = useClients(userId);
  const rateCardsHook = useRateCards(userId);
  const { updateSettings } = settingsHook;

  // settings + "really loaded" flag (PDFs check it before downloading)
  const settings = useMemo(
    () => ({ ...settingsHook.settings, __ready: settingsHook.loaded }),
    [settingsHook.settings, settingsHook.loaded]
  );

  // Coming back to the app after 30 s or more → reload (not while a document is open for editing)
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 30000 && !editLock.active()) {
        // a newer version online → load it (nothing is being edited); otherwise just refresh the data
        newVersionAvailable().then(isNew => {
          if (isNew && !editLock.active()) window.location.reload();
          else reloadAll();
        });
      }
      hiddenAt = 0;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (authLoading) return <Loading />;
  if (!userId) return <AuthScreen onSignIn={signIn} loading={authLoading} />;

  const banners = (
    <>
      {clientsHook.loadError   && <LoadErrorBanner what="Your clients and projects" message={clientsHook.loadError}   onRetry={() => clientsHook.reload()} />}
      {settingsHook.loadError  && <LoadErrorBanner what="Your profile"              message={settingsHook.loadError}  onRetry={settingsHook.reload} />}
      {rateCardsHook.loadError && <LoadErrorBanner what="Your rate cards"           message={rateCardsHook.loadError} onRetry={rateCardsHook.reload} />}
    </>
  );

  return (
    <>
      {role === "manager" ? (
        <ManagerApp
          settings={settings}
          updateSettings={updateSettings}
          clientsHook={clientsHook}
          rateCardsHook={rateCardsHook}
          signOut={signOut}
          switchTo={switchTo}
          banners={banners}
        />
      ) : role === "creator" ? (
        <CreatorApp
          settings={settings}
          clientsHook={clientsHook}
          signOut={signOut}
          switchTo={switchTo}
          banners={banners}
        />
      ) : role === "outreach" ? (
        <OutreachApp userId={userId} settings={settings} signOut={signOut} switchTo={switchTo} banners={banners} />
      ) : role === "planner" ? (
        <PlannerApp userId={userId} settings={settings} signOut={signOut} switchTo={switchTo} banners={banners} />
      ) : (
        <PlaceholderApp app={role || "planner"} settings={settings} signOut={signOut} switchTo={switchTo} banners={banners} />
      )}
      <SaveToast />
    </>
  );
}
