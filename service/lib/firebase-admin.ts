import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/**
 * Lazy Firebase Admin SDK (server only). Credentials come from one env var:
 * FIREBASE_SERVICE_ACCOUNT = the full service-account JSON (one line).
 * Null when unconfigured — callers fall back to an explicit 503.
 */

function init(): boolean {
  if (getApps().length > 0) return true;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT ?? "").trim();
  if (!raw) return false;
  try {
    const cred = JSON.parse(raw) as ServiceAccount;
    initializeApp({ credential: cert(cred) });
    return true;
  } catch {
    return false;
  }
}

/** Verify a Firebase ID token → { uid, email } or null. */
export async function verifyFirebaseToken(
  idToken: string,
): Promise<{ uid: string; email: string } | null> {
  if (!idToken || !init()) return null;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    const email = typeof decoded.email === "string" ? decoded.email.toLowerCase().trim() : "";
    if (!decoded.uid || !email) return null;
    return { uid: decoded.uid, email };
  } catch {
    return null;
  }
}
