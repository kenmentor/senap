import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { normalizeJid } from "./store.js";
import { ensureMongo } from "../mongo.js";
import { JobModel } from "./jobs.js";
import { countMessages } from "../chat-memory.js";
import {
  getGroupAgent,
  saveGroupAgent,
  setGroupAgentEnabled,
  deletePendingChain,
  nextPendingRun,
  repeatKeyFor,
} from "./group-agent-store.js";

const MIN_INTERVAL_HOURS = 1;
const MAX_INTERVAL_HOURS = 168;
const DEFAULT_INTERVAL_HOURS = 6;
const MAX_STYLE_EXAMPLES = 15;

/** Shared builder: what each recurring engagement tick tells the agent. */
export function buildEngagementInstruction(input: {
  name: string;
  role: string;
  subject: string;
  maxPerDay: number;
  duty: string;
}): string {
  const who = input.name ? `${input.name}, ${input.role || "assistant"}` : "the group's assistant";
  return (
    `[RECURRING GROUP ENGAGEMENT] You are ${who} of the WhatsApp group "${input.subject}". ` +
    `Keep the group lively with ONE short message in the group's own style (greeting, question, hype, mini-poll idea — never an announcement voice). ` +
    `Rules, in order: 1) FIRST call check_group_quota for this group — if over the daily limit, do nothing this round. ` +
    `2) Never repeat anything from the last 20 messages. ` +
    `3) If the last 2-3 messages are all yours, stay silent (a reaction is enough). ` +
    `4) Sound human and brief — no AI talk, no lectures, no hashtags. ` +
    `Hard cap: ${input.maxPerDay} engagement messages per day.` +
    (input.duty ? ` Extra duty: ${input.duty}` : "")
  );
}

/** Recent group voice from the live session view (style learning, no extra I/O). */
export function styleExamplesFromLog(log: { text: string; fromMe: boolean }[] | undefined): string[] {
  if (!log) return [];
  const out: string[] = [];
  for (let i = log.length - 1; i >= 0 && out.length < MAX_STYLE_EXAMPLES; i--) {
    const t = (log[i]?.text ?? "").trim();
    if (!t || log[i].fromMe || /^\[.*\]$/.test(t) || t.length < 3) continue;
    const short = t.length > 160 ? `${t.slice(0, 160)}…` : t;
    if (!out.includes(short)) out.push(short);
  }
  return out.reverse();
}

function requireGroupJid(raw: string): string {
  const jid = raw.trim();
  if (!jid) throw new Error("groupJid is required.");
  const norm = jid.includes("@") ? jid : normalizeJid(jid);
  if (!norm.endsWith("@g.us")) throw new Error(`"${raw}" is not a group chat.`);
  return norm;
}

export const groupAgentTools: ToolDefinition[] = [
  {
    name: "setup_group_agent",
    description:
      "OWNER ONLY. Activate the agent for a WhatsApp group in ONE step: give it a name/role/personality plus an engagement rhythm (e.g. every 6 hours), and it analyzes the group (subject, size, admin status, recent vibe), stores its persona, and starts its own recurring engagement job — then works that group independently. Use when the owner says 'activate/manage this group' or 'make the group lively'.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        groupJid: { type: "string", description: "Group JID ending in @g.us (or phone-style id)." },
        name: { type: "string", description: "Agent's name in the group (e.g. 'Nala')." },
        role: { type: "string", description: "Agent's role (e.g. 'vibe manager', 'sales rep')." },
        personality: { type: "string", description: "How it should come across (e.g. 'playful pidgin, never formal')." },
        duty: { type: "string", description: "Extra standing duty (e.g. 'drop weekend deals every Friday')." },
        intervalHours: { type: "number", description: `Engagement rhythm in hours, ${MIN_INTERVAL_HOURS}-${MAX_INTERVAL_HOURS} (default ${DEFAULT_INTERVAL_HOURS}).` },
        maxPerDay: { type: "number", description: "Hard cap on engagement messages per day (default 4, max 20)." },
        replyThreshold: { type: "number", description: "Reply confidence 0-1 (default 0.3 = active). Scale: 0.15 very active (replies to most chat), 0.3 active (default, lively but human), 0.45 balanced (answers when relevant/addressed), 0.65 quiet (only direct mentions), 0.8+ nearly invisible. WARNING: 0.6+ goes stale fast — the group will look dead and members stop tagging it, so it may never be helpful. Prefer 0.25-0.35 for lively groups, never exceed 0.5 unless the owner explicitly wants silence." },
      },
      required: ["groupJid"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const groupJid = requireGroupJid(toolArgs.asString(args.groupJid));
      const intervalHours = Math.min(
        MAX_INTERVAL_HOURS,
        Math.max(MIN_INTERVAL_HOURS, Math.round(toolArgs.asNumber(args.intervalHours, DEFAULT_INTERVAL_HOURS))),
      );
      const maxPerDay = Math.min(20, Math.max(1, Math.round(toolArgs.asNumber(args.maxPerDay, 4))));
      const replyThreshold = Math.min(1, Math.max(0, Number(toolArgs.asNumber(args.replyThreshold, 0.3)) || 0));
      const name = toolArgs.asString(args.name).trim().slice(0, 60);
      const role = toolArgs.asString(args.role).trim().slice(0, 120);
      const personality = toolArgs.asString(args.personality).trim().slice(0, 300);
      const duty = toolArgs.asString(args.duty).trim().slice(0, 300);

      // Analyze the group from the live session: subject, size, own standing.
      let subject = "this group";
      let members = 0;
      let amAdmin = false;
      try {
        if (ctx.sock) {
          const meta = await ctx.sock.groupMetadata(groupJid);
          subject = meta.subject || subject;
          members = meta.participants?.length ?? 0;
          const { isSelfJid } = await import("./store.js");
          const meUser = ctx.sock.user as unknown as { id?: string; lid?: string; phoneNumber?: string } | null | undefined;
          const ownForms = [meUser?.id, meUser?.lid, meUser?.phoneNumber].filter((x): x is string => !!x);
          const me = (meta.participants ?? []).find((p) => ownForms.some((s) => isSelfJid(p.id, s)));
          const flag = (me as { admin?: string | null } | undefined)?.admin;
          amAdmin = flag === "admin" || flag === "superadmin";
        }
      } catch {
        /* offline metadata — proceed with persona + rhythm anyway */
      }

      const style = styleExamplesFromLog(ctx.messageLog.get(groupJid));
      const repeatKey = repeatKeyFor(ctx.userId, groupJid);
      await deletePendingChain(ctx.userId, repeatKey);

      const instruction = buildEngagementInstruction({ name, role, subject, maxPerDay, duty });
      const firstAt = new Date(Date.now() + intervalHours * 3_600_000);
      const doc = await JobModel.create({
        userId: ctx.userId,
        chatJid: groupJid,
        createdBy: ctx.customerJid,
        createdByIsOwner: true,
        kind: "agent",
        text: instruction,
        runAt: firstAt,
        status: "pending",
        attempts: 0,
        lastError: "",
        repeatMs: intervalHours * 3_600_000,
        repeatKey,
      });

      const baseCfg = {
        userId: ctx.userId,
        groupJid,
        enabled: true,
        name,
        role,
        personality,
        duty,
        intervalHours,
        maxPerDay,
        replyThreshold,
        subject,
        autoWhitelisted: false,
        styleExamples: style,
        repeatKey,
        jobId: String(doc._id),
      };
      await saveGroupAgent(baseCfg);

      // Activation implies access: allow-list the group so its messages are
      // never swallowed by EXCLUSIVE mode (lifts a STOP block too — reported).
      let accessNote = "";
      try {
        const { ensureGroupAllowed } = await import("../chat-access.js");
        const r = await ensureGroupAllowed(ctx.userId, groupJid, subject);
        if (r.whitelisted) {
          await saveGroupAgent({ ...baseCfg, autoWhitelisted: true });
        }
        accessNote = r.wasBlocked
          ? " The group was blocked (e.g. a STOP opt-out) — activation lifted the block."
          : " The group is now allow-listed so its messages always reach the agent.";
      } catch {
        accessNote = " (Allow-listing failed — if messages don't arrive, whitelist the group on the Link page.)";
      }

      try {
        const m = await import("../task-queue.js");
        m.wake();
      } catch {
        /* dispatcher re-arms on its own */
      }

      return {
        activated: true,
        group: subject,
        members,
        amAdmin,
        intervalHours,
        maxPerDay,
        styleSamples: style.length,
        firstRunAt: firstAt.toISOString(),
        access: accessNote.trim(),
        note: amAdmin
          ? "The line is an admin here — full engagement is available."
          : "The line is a regular member here — it engages by message only (no admin actions).",
      };
    },
  },
  {
    name: "update_group_agent",
    description:
      "OWNER ONLY. Change a group's agent persona, rhythm, or reply chattiness (any subset of name/role/personality/duty/intervalHours/maxPerDay/replyThreshold). Changing the rhythm restarts its recurring loop from now.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        groupJid: { type: "string", description: "Group JID ending in @g.us." },
        name: { type: "string" },
        role: { type: "string" },
        personality: { type: "string" },
        duty: { type: "string" },
        intervalHours: { type: "number" },
        maxPerDay: { type: "number" },
        replyThreshold: { type: "number", description: "Reply confidence 0-1. Scale: 0.15 very active, 0.3 active (recommended), 0.45 balanced, 0.65 quiet, 0.8+ invisible. WARNING: above 0.6 the agent goes stale and stops being helpful — keep 0.25-0.35 unless owner explicitly wants silence." },
      },
      required: ["groupJid"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const groupJid = requireGroupJid(toolArgs.asString(args.groupJid));
      const existing = await getGroupAgent(ctx.userId, groupJid);
      if (!existing) return { error: "No group agent configured here — call setup_group_agent first." };
      const patch: Partial<typeof existing> = {};
      for (const k of ["name", "role", "personality", "duty"] as const) {
        const v = toolArgs.asString((args as Record<string, unknown>)[k]).trim();
        if (v) patch[k] = v.slice(0, k === "name" ? 60 : k === "role" ? 120 : 300);
      }
      const iv = toolArgs.asNumber(args.intervalHours, 0);
      if (iv > 0) patch.intervalHours = Math.min(MAX_INTERVAL_HOURS, Math.max(MIN_INTERVAL_HOURS, Math.round(iv)));
      const mp = toolArgs.asNumber(args.maxPerDay, 0);
      if (mp > 0) patch.maxPerDay = Math.min(20, Math.max(1, Math.round(mp)));
      const rt = toolArgs.asNumber(args.replyThreshold, -1);
      if (rt >= 0) patch.replyThreshold = Math.min(1, Math.max(0, rt));
      const merged = { ...existing, ...patch, enabled: true };
      await saveGroupAgent(merged);

      // Rhythm changed → restart the loop so the new cadence takes effect now.
      if (patch.intervalHours !== undefined || patch.maxPerDay !== undefined || patch.duty !== undefined) {
        await deletePendingChain(ctx.userId, merged.repeatKey);
        const style = styleExamplesFromLog(ctx.messageLog.get(groupJid));
        const firstAt = new Date(Date.now() + merged.intervalHours * 3_600_000);
        const doc = await JobModel.create({
          userId: ctx.userId,
          chatJid: groupJid,
          createdBy: ctx.customerJid,
          createdByIsOwner: true,
          kind: "agent",
          text: buildEngagementInstruction({
            name: merged.name,
            role: merged.role,
            subject: groupJid,
            maxPerDay: merged.maxPerDay,
            duty: merged.duty,
          }),
          runAt: firstAt,
          status: "pending",
          attempts: 0,
          lastError: "",
          repeatMs: merged.intervalHours * 3_600_000,
          repeatKey: merged.repeatKey,
        });
        await saveGroupAgent({ ...merged, styleExamples: style.length > 0 ? style : merged.styleExamples, jobId: String(doc._id) });
        try {
          const m = await import("../task-queue.js");
          m.wake();
        } catch {
          /* dispatcher re-arms on its own */
        }
        return { updated: true, loopRestarted: true, firstRunAt: firstAt.toISOString() };
      }
      return { updated: true, loopRestarted: false };
    },
  },
  {
    name: "disable_group_agent",
    description: "OWNER ONLY. Switch the agent off for a group: persona stays saved, the recurring loop stops.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        groupJid: { type: "string", description: "Group JID ending in @g.us." },
      },
      required: ["groupJid"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const groupJid = requireGroupJid(toolArgs.asString(args.groupJid));
      const existing = await getGroupAgent(ctx.userId, groupJid);
      if (!existing) return { error: "No group agent configured here." };
      const cancelled = await deletePendingChain(ctx.userId, existing.repeatKey);
      await setGroupAgentEnabled(ctx.userId, groupJid, false);
      let accessRemoved = false;
      if (existing.autoWhitelisted) {
        try {
          const { removeAutoWhitelist } = await import("../chat-access.js");
          await removeAutoWhitelist(ctx.userId, groupJid);
          accessRemoved = true;
        } catch {
          /* rule stays — harmless, owner can remove it on the Link page */
        }
      }
      return { disabled: true, cancelledLoops: cancelled, accessRemoved };
    },
  },
  {
    name: "group_agent_status",
    description: "OWNER ONLY. Report a group's agent setup: persona, rhythm, next run, today's engagement count vs cap.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        groupJid: { type: "string", description: "Group JID ending in @g.us." },
      },
      required: ["groupJid"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const groupJid = requireGroupJid(toolArgs.asString(args.groupJid));
      const cfg = await getGroupAgent(ctx.userId, groupJid);
      if (!cfg) return { configured: false };
      const [next, sentToday] = await Promise.all([
        nextPendingRun(ctx.userId, cfg.repeatKey),
        (async () => {
          const { countMessages } = await import("../chat-memory.js");
          const day = new Date();
          day.setHours(0, 0, 0, 0);
          return countMessages(ctx.userId, groupJid, "assistant", day);
        })(),
      ]);
      return {
        configured: true,
        enabled: cfg.enabled,
        name: cfg.name,
        role: cfg.role,
        intervalHours: cfg.intervalHours,
        maxPerDay: cfg.maxPerDay,
        replyThreshold: typeof cfg.replyThreshold === "number" ? cfg.replyThreshold : 0.5,
        sentToday,
        nextRunAt: next ? next.toISOString() : null,
      };
    },
  },
  {
    name: "check_group_quota",
    description:
      "How many engagement messages already went to a group chat today vs its cap. Recurring engagement MUST call this first and stop when over — it keeps groups from feeling spammed.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        groupJid: { type: "string", description: "Group JID. Defaults to the current chat." },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const raw = toolArgs.asString(args.groupJid).trim() || ctx.customerJid;
      const groupJid = raw.includes("@") ? raw : normalizeJid(raw);
      const cfg = await getGroupAgent(ctx.userId, groupJid);
      const maxPerDay = cfg?.maxPerDay ?? 4;
      const { countMessages } = await import("../chat-memory.js");
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      const sentToday = await countMessages(ctx.userId, groupJid, "assistant", day);
      return { sentToday, maxPerDay, over: sentToday >= maxPerDay };
    },
  },
];
