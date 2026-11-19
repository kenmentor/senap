"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  type Auth,
  type User,
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

function validNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
}

function loadNext(fallback: string): string {
  try {
    return validNext(window.sessionStorage.getItem(NEXT_KEY) ?? fallback);
  } catch {
    return validNext(fallback);
  }
}

function isMobileBrowser(): boolean {
  try {
    return /android|iphone|ipad|ipod|mobile/i.test(window.navigator.userAgent);
  } catch {
    return false;
  }
}

export type GoogleStart = { idToken: string; next: string } | { redirected: true };

/**
 * Popup first (the only flow that works on localhost and desktops), redirect
 * fallback for mobile browsers that block popups. Redirect on localhost is a
 * documented Firebase limitation — popup is the local path, redirect is the
 * production-mobile path.
 */
export async function beginGoogleSignIn(next: string): Promise<GoogleStart> {
  const a = getClientAuth();
  if (!a) throw new Error("Google sign-in isn't set up yet.");
  try {
    window.sessionStorage.setItem(NEXT_KEY, next);
  } catch {
    /* private mode — falls back to /dashboard */
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  if (isMobileBrowser()) {
    await signInWithRedirect(a, provider);
    return { redirected: true };
  }
  try {
    const cred = await signInWithPopup(a, provider);
    return { idToken: await cred.user.getIdToken(), next: loadNext(next) };
  } catch (e) {
    const code = codeOf(e);
    if (code.includes("auth/popup-blocked")) {
      await signInWithRedirect(a, provider);
      return { redirected: true };
    }
    throw new Error(friendlyAuthError(e));
  }
}

/**
 * One-shot redirect result. Returns null when this load isn't a redirect
 * callback — including the documented localhost case where the handshake
 * yields nothing. Throws a readable error for real failures.
 */
export async function awaitRedirectResult(): Promise<{ idToken: string; next: string } | null> {
  const a = getClientAuth();
  if (!a || typeof window === "undefined") return null;
  try {
    const result = await getRedirectResult(a);
    if (!result) return null;
    return { idToken: await result.user.getIdToken(), next: loadNext("/dashboard") };
  } catch (e) {
    throw new Error(friendlyAuthError(e));
  }
}

/** Observer fallback: fires with the user even when the redirect handshake yields null. */
export function subscribeGoogleUser(cb: (user: User) => void): () => void {
  const a = getClientAuth();
  if (!a) return () => {};
  return onAuthStateChanged(a, (user) => {
    if (user) cb(user);
  });
}

function codeOf(e: unknown): string {
  return typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
}

function friendlyAuthError(e: unknown): string {
  const code = codeOf(e);
  if (code.includes("auth/unauthorized-domain"))
    return "This domain isn't allowed for sign-in yet — contact support.";
  if (code.includes("auth/network-request-failed"))
    return "No connection — check your internet and retry.";
  if (code.includes("auth/account-exists-with-different-credential"))
    return "That Google account is linked another way — contact support.";
  if (code.includes("auth/user-disabled")) return "This account is disabled.";
  if (code.includes("auth/popup-closed-by-user")) return "Sign-in was closed before finishing — try again.";
  if (code.includes("auth/cancelled-popup-request")) return "Sign-in was interrupted — try again.";
  if (e instanceof Error && e.message) return e.message;
  return "Google sign-in failed — try again.";
}
