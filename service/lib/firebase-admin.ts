/**
 * Lazy Firebase Admin SDK (server only). Everything loads inside init() so a
 * missing/broken install can never 500 a route at import time — callers get
 * a machine-readable reason instead.
 *
 * Credentials come from one env var:
 * FIREBASE_SERVICE_ACCOUNT = the full service-account JSON (one line).
 */

type AdminState =
  | { ready: true }
  | { ready: false; reason: "missing" | "invalid" };

let state: AdminState | null = null;

async function init(): Promise<boolean> {
  if (state) return state.ready;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT ?? "").trim();
  if (!raw) {
    state = { ready: false, reason: "missing" };
    return false;
  }
  try {
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");
    if (getApps().length === 0) {
      const cred = JSON.parse(raw);
      initializeApp({ credential: cert(cred) });
    }
    // Warm the auth client now so runtime failures surface here, once.
    getAuth();
    state = { ready: true };
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[firebase-admin] init failed:", msg);
    state = { ready: false, reason: "invalid" };
    return false;
  }
}

/** Why the admin SDK is unavailable (for 503 messages + the signin banner). */
export async function adminStatus(): Promise<{ ready: boolean; reason?: "missing" | "invalid" }> {
  await init();
  if (state?.ready) return { ready: true };
  return { ready: false, reason: state && !state.ready ? state.reason : "missing" };
}

/** Verify a Firebase ID token. Failure carries a machine-readable code. */
export type VerifyResult =
  | { ok: true; uid: string; email: string }
  | { ok: false; code: "unconfigured" | "invalid-token" | "wrong-project" };

export async function verifyFirebaseToken(idToken: string): Promise<VerifyResult> {
  if (!idToken || !(await init())) return { ok: false, code: "unconfigured" };
  try {
    const { getAuth } = await import("firebase-admin/auth");
    const decoded = await getAuth().verifyIdToken(idToken);
    const email = typeof decoded.email === "string" ? decoded.email.toLowerCase().trim() : "";
    if (!decoded.uid || !email) return { ok: false, code: "invalid-token" };
    return { ok: true, uid: decoded.uid, email };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[firebase-admin] verifyIdToken failed:", msg);
    if (/audience|a project/i.test(msg)) return { ok: false, code: "wrong-project" };
    return { ok: false, code: "invalid-token" };
  }
}
