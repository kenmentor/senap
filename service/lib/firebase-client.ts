"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  type Auth,
} from "firebase/auth";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/** True only when the Firebase web config is present. */
export function firebaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  );
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

/** Send the Firebase sign-in link. Throws with a readable message. */
export async function sendEmailLink(email: string): Promise<void> {
  const a = getClientAuth();
  if (!a) throw new Error("Sign-in is not configured yet — try the demo account.");
  const url = `${window.location.origin}/signin`;
  try {
    await sendSignInLinkToEmail(a, email, { url, handleCodeInApp: true });
  } catch (e) {
    throw new Error(friendlyAuthError(e));
  }
  try {
    window.localStorage.setItem("senap-email-link", email);
  } catch {
    /* private mode — the link step asks for the email again */
  }
}

/** True when this page load is a Firebase email-link callback. */
export function isEmailLinkCallback(): boolean {
  const a = getClientAuth();
  if (!a || typeof window === "undefined") return false;
  try {
    return isSignInWithEmailLink(a, window.location.href);
  } catch {
    return false;
  }
}

/** Complete a Firebase email-link sign-in, returning the ID token. */
export async function completeEmailLink(): Promise<string> {
  const a = getClientAuth();
  if (!a) throw new Error("Sign-in is not configured yet — try the demo account.");
  let email: string | null = null;
  try {
    email = window.localStorage.getItem("senap-email-link");
  } catch {
    email = null;
  }
  if (!email) {
    email = window.prompt("Confirm the email address you signed in with:");
    if (!email) throw new Error("Email address needed to finish signing in.");
  }
  try {
    const cred = await signInWithEmailLink(a, email.trim(), window.location.href);
    try {
      window.localStorage.removeItem("senap-email-link");
    } catch {
      /* ignore */
    }
    return await cred.user.getIdToken();
  } catch (e) {
    throw new Error(friendlyAuthError(e));
  }
}

function friendlyAuthError(e: unknown): string {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code.includes("auth/invalid-email")) return "That doesn't look like an email address.";
  if (code.includes("auth/expired-action-code") || code.includes("auth/invalid-action-code"))
    return "That link expired or was already used — request a fresh one.";
  if (code.includes("auth/user-disabled")) return "This account is disabled.";
  if (code.includes("auth/network-request-failed")) return "No connection — check your internet and retry.";
  if (code.includes("auth/unauthorized-domain"))
    return "This domain isn't allowed for sign-in yet — contact support.";
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong — try again.";
}
