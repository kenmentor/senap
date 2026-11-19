"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  type Auth,
} from "firebase/auth";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/** True only when the Firebase web config is present. */
export function firebaseConfigured(): boolean {
  return missingFirebaseKeys().length === 0;
}

/** Human labels of whichever public Firebase keys are absent (for setup hints). */
export function missingFirebaseKeys(): string[] {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) missing.push("API key");
  if (!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) missing.push("auth domain");
  if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) missing.push("project ID");
  if (!process.env.NEXT_PUBLIC_FIREBASE_APP_ID) missing.push("app ID");
  return missing;
}

function getClientAuth(): Auth | null {
  if (typeof window === "undefined" || !firebaseConfigured()) return null;
  if (!app) {
    const apps = getApps();
    app =
      apps[0] ??
      initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      });
  }
  auth ??= getAuth(app);
  return auth;
}

const NEXT_KEY = "senap-next";

/** Start Google sign-in via redirect (works on desktop + mobile browsers). */
export async function beginGoogleSignIn(next: string): Promise<void> {
  const a = getClientAuth();
  if (!a) throw new Error("Google sign-in isn't set up yet.");
  try {
    window.sessionStorage.setItem(NEXT_KEY, next);
  } catch {
    /* private mode — falls back to /dashboard */
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithRedirect(a, provider);
}

/** After returning from Google: ID token, or null when this isn't a callback. */
export async function completeGoogleRedirect(): Promise<{ idToken: string; next: string } | null> {
  const a = getClientAuth();
  if (!a || typeof window === "undefined") return null;
  let next = "/dashboard";
  try {
    next = window.sessionStorage.getItem(NEXT_KEY) || "/dashboard";
  } catch {
    /* ignore */
  }
  if (!next.startsWith("/") || next.startsWith("//")) next = "/dashboard";
  try {
    const result = await getRedirectResult(a);
    if (!result) return null;
    try {
      window.sessionStorage.removeItem(NEXT_KEY);
    } catch {
      /* ignore */
    }
    return { idToken: await result.user.getIdToken(), next };
  } catch (e) {
    throw new Error(friendlyAuthError(e));
  }
}

function friendlyAuthError(e: unknown): string {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code.includes("auth/unauthorized-domain"))
    return "This domain isn't allowed for sign-in yet — contact support.";
  if (code.includes("auth/network-request-failed"))
    return "No connection — check your internet and retry.";
  if (code.includes("auth/account-exists-with-different-credential"))
    return "That Google account is linked another way — contact support.";
  if (code.includes("auth/user-disabled")) return "This account is disabled.";
  if (code.includes("auth/popup-closed-by-user")) return "Sign-in was closed before finishing — try again.";
  if (e instanceof Error && e.message) return e.message;
  return "Google sign-in failed — try again.";
}
