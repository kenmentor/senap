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
  | { ready: false; reason: "missing" | "invalid-json" | "invalid-cred"; hint?: string };

let state: AdminState | null = null;

/** Keep UI-safe diagnostics free of key material: one line, truncated. */
function hintOf(msg: string): string {
  return msg.replace(/\s+/g, " ").trim().slice(0, 160) || "unknown error";
}

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
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[firebase-admin] service account is not valid JSON:", msg);
      state = { ready: false, reason: "invalid-json", hint: hintOf(msg) };
      return false;
    }
    if (!parsed || typeof parsed !== "object") {
      console.error("[firebase-admin] service account JSON is not an object");
      state = { ready: false, reason: "invalid-json", hint: "JSON is not an object" };
      return false;
    }
    // Required-field check so the UI can say *what* is wrong instead of a
    // cryptic cert() throw. Values are never logged or returned.
    const rec = parsed as Record<string, unknown>;
    for (const field of ["type", "project_id", "private_key", "client_email"]) {
      if (typeof rec[field] !== "string" || !(rec[field] as string).trim()) {
        const hint = `missing field: ${field}`;
        console.error(`[firebase-admin] ${hint}`);
        state = { ready: false, reason: "invalid-cred", hint };
        return false;
      }
    }
    if (!String(rec.private_key).includes("BEGIN PRIVATE KEY")) {
      const hint = "private_key is not a PEM block";
      console.error(`[firebase-admin] ${hint}`);
      state = { ready: false, reason: "invalid-cred", hint };
      return false;
    }
    if (getApps().length === 0) {
      initializeApp({ credential: cert(parsed as never) });
    }
    // Warm the auth client now so runtime failures surface here, once.
    getAuth();
    state = { ready: true };
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[firebase-admin] credential rejected:", msg);
    state = { ready: false, reason: "invalid-cred", hint: hintOf(msg) };
    return false;
  }
}

/** Why the admin SDK is unavailable (for 503 messages + the signin banner). */
export async function adminStatus(): Promise<{
  ready: boolean;
  reason?: "missing" | "invalid";
  detail?: "missing" | "invalid-json" | "invalid-cred";
  hint?: string;
}> {
  await init();
  if (state?.ready) return { ready: true };
  if (!state || state.ready) return { ready: false, reason: "missing", detail: "missing" };
  // Normalize detailed internal reasons to the public "missing" | "invalid"
  // contract the sign-in page and API route rely on, but keep `detail` + a
  // sanitized `hint` so the UI can show *why* without leaking secrets.
  if (state.reason === "missing") return { ready: false, reason: "missing", detail: "missing" };
  return { ready: false, reason: "invalid", detail: state.reason, hint: state.hint };
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
