/** One employee, multiple roles. Roles are job descriptions, not personalities. */

export type RoleName =
  | "salesperson"
  | "support"
  | "moderator"
  | "personal_assistant"
  | "store_manager"
  | "marketing"
  | "admin";

export interface RoleDef {
  name: RoleName;
  label: string;
  objective: string;
  responsibilities: string[];
  skills: string[];
  restrictions: string[];
}

export const ROLE_ORDER: RoleName[] = [
  "salesperson",
  "support",
  "moderator",
  "personal_assistant",
  "store_manager",
  "marketing",
  "admin",
];

export const ROLE_DEFS: Record<RoleName, RoleDef> = {
  salesperson: {
    name: "salesperson",
    label: "Salesperson",
    objective: "Convert enquiries into sales.",
    responsibilities: ["Understand needs", "Recommend suitable products", "Close orders", "Follow up"],
    skills: ["product_search", "comparison", "negotiation", "order_creation", "followup"],
    restrictions: ["Never invent prices or promise unavailable stock"],
  },
  support: {
    name: "support",
    label: "Customer support",
    objective: "Handle complaints and enquiries fast.",
    responsibilities: ["Triage issues", "Explain", "Escalate when stuck"],
    skills: ["triage", "explanation", "escalation"],
    restrictions: ["Never promise refunds; escalate instead"],
  },
  moderator: {
    name: "moderator",
    label: "Group moderator",
    objective: "Keep groups healthy.",
    responsibilities: ["Monitor", "Warn within policy", "Resolve disputes"],
    skills: ["moderation", "rule interpretation"],
    restrictions: ["No arbitrary punishment; quota-capped"],
  },
  personal_assistant: {
    name: "personal_assistant",
    label: "Personal assistant",
    objective: "Reminders, schedules, everyday owner jobs.",
    responsibilities: ["Remind", "Schedule", "Retrieve"],
    skills: ["scheduling", "reminders", "retrieval"],
    restrictions: ["Current-chat isolation for customers"],
  },
  store_manager: {
    name: "store_manager",
    label: "Store manager",
    objective: "Keep catalog and inventory truthful.",
    responsibilities: ["Import", "Update", "Audit stock"],
    skills: ["catalog", "inventory"],
    restrictions: ["Owner confirms deletes"],
  },
  marketing: {
    name: "marketing",
    label: "Marketing assistant",
    objective: "Draft campaigns, never blast without approval.",
    responsibilities: ["Draft", "Plan", "Report"],
    skills: ["outreach planning", "broadcast drafting"],
    restrictions: ["Never auto-send bulk; owner go-ahead required"],
  },
  admin: {
    name: "admin",
    label: "Admin assistant",
    objective: "Reports and routine organization.",
    responsibilities: ["Recap", "Summarize", "Organize"],
    skills: ["reporting", "summaries"],
    restrictions: ["Read-only over other chats for customers"],
  },
};

export type RoleMap = Record<RoleName, boolean>;

export const ALL_ROLES_ON: RoleMap = {
  salesperson: true,
  support: true,
  moderator: true,
  personal_assistant: true,
  store_manager: true,
  marketing: true,
  admin: true,
};

/** Fail-open defaults: missing doc or missing keys = that role stays on. */
export function normalizeRoles(raw: unknown): RoleMap {
  const r = (raw ?? {}) as Partial<Record<RoleName, unknown>>;
  const out = { ...ALL_ROLES_ON };
  for (const k of ROLE_ORDER) {
    if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
  }
  return out;
}

/** Short system block: which duties are active this line. */
export function rolesBlock(roles: RoleMap): string {
  const on = ROLE_ORDER.filter((k) => roles[k]);
  const off = ROLE_ORDER.filter((k) => !roles[k]);
  const base = `Active duties: ${on.length > 0 ? on.join(", ") : "none"}. One employee, same identity — activate only listed duties.`;
  if (off.length === 0) return base;
  return `${base} Disabled duties (never perform, redirect to owner): ${off.join(", ")}.`;
}
