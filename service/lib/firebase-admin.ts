/**
 * Lazy Firebase Admin SDK (server only). Everything loads inside init() so a
 * missing/broken install can never 500 a route at import time — callers get
 * a clean { configured: false } instead.
 *
 * Credentials come from one env var:
 * FIREBASE_SERVICE_ACCOUNT = the full service-account JSON (one line).
 */

let state: { ready: boolean; reason?: string } | null = null;

async function init(): Promise<boolean> {
  if (state) return state.ready;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT ?? "").trim();
  if (!raw) {
    state = { ready: false, reason: "FIREBASE_SERVICE_ACCOUNT is empty" };
    return false;
  }
  try {
    const [{ initializeApp, getApps, cert }, { getAuth }] = await Promise.all([
      import("firebase-admin/app"),
      import("firebase-admin/auth"),
    ]);
    if (getApps().length === 0) {
      const cred = JSON.parse(raw);
      initializeApp({ credential: cert(cred) });
    }
    // Warm the auth client now so runtime failures surface here, once.
    getAuth();
    state = { ready: true };
    return true;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error("[firebase-admin] init failed:", reason);
    state = { ready: false, reason };
    return false;
  }
}

/** Why the admin SDK is unavailable (for 503 messages + terminal logs). */
export async function adminStatus(): Promise<{ ready: boolean; reason?: string }> {
  await init();
  return state ?? { ready: false, reason: "unknown" };
}

/** Verify a Firebase ID token → { uid, email } or null. */
export async function verifyFirebaseToken(
  idToken: string,
): Promise<{ uid: string; email: string } | null> {
  if (!idToken || !(await init())) return null;
  try {
    const [{ getAuth }] = await Promise.all([import("firebase-admin/auth")]);
    const decoded = await getAuth().verifyIdToken(idToken);
    const email = typeof decoded.email === "string" ? decoded.email.toLowerCase().trim() : "";
    if (!decoded.uid || !email) return null;
    return { uid: decoded.uid, email };
  } catch (e) {
    console.error("[firebase-admin] verifyIdToken failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
