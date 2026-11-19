const BOOT_AT = new Date();
let bootState: "electing" | "standby" | "starting" | "live" = "electing";
let lastReconcileAt: Date | null = null;
let lastReconcileNote = "not run yet";

export function setBootState(s: typeof bootState): void {
  bootState = s;
}

export function setReconcile(note: string): void {
  lastReconcileAt = new Date();
  lastReconcileNote = note;
}

export function serverStatus() {
  return {
    bootState,
    bootAt: BOOT_AT.toISOString(),
    uptimeSec: Math.floor((Date.now() - BOOT_AT.getTime()) / 1000),
    lastReconcileAt: lastReconcileAt?.toISOString() ?? null,
    lastReconcileNote,
  };
}
