export type DemoState =
  | "idle"
  | "owner_typing"
  | "owner_sent"
  | "employee_thinking"
  | "employee_responded"
  | "task_plan_created"
  | "inventory_checked"
  | "promotion_drafted"
  | "discount_required"
  | "sales_reviewed"
  | "report_created"
  | "sharing_approval_required"
  | "completed";

export const DEMO_ORDER: DemoState[] = [
  "idle",
  "owner_typing",
  "owner_sent",
  "employee_thinking",
  "employee_responded",
  "task_plan_created",
  "inventory_checked",
  "promotion_drafted",
  "discount_required",
  "sales_reviewed",
  "report_created",
  "sharing_approval_required",
  "completed"
];

export function nextState(s: DemoState): DemoState {
  const i = DEMO_ORDER.indexOf(s);
  return DEMO_ORDER[Math.min(DEMO_ORDER.length - 1, i + 1)];
}

export function prevState(s: DemoState): DemoState {
  const i = DEMO_ORDER.indexOf(s);
  return DEMO_ORDER[Math.max(0, i - 1)];
}

export function resetState(): DemoState {
  return "idle";
}

// Approvals are local demo intent only — never trigger network sends.
// Scroll-back resets them for demo clarity.
export type ApprovalFlags = {
  discount: "awaiting" | "set" | "keep";
  sharing: "awaiting" | "approved" | "review";
};

export const initialApprovals: ApprovalFlags = { discount: "awaiting", sharing: "awaiting" };
