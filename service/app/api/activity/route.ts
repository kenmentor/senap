import { NextResponse } from "next/server";
import mongoose, { Schema } from "mongoose";
import { dbConnect } from "@/lib/db/mongoose";
import { agentBase, agentHeaders } from "@/lib/agent";
import { sessionUser, signedOut, ownedLineIds } from "@/lib/auth-helpers";

const AGENT_URL = agentBase();

// Must match the agent's AGENT_API_KEY — without this every /sessions/* call
// 401s and the dashboard silently shows "offline" with empty chats/tasks.
const AGENT_HEADERS = agentHeaders();

async function agentGet(path: string): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${AGENT_URL}${path}`, {
      signal: ctrl.signal,
      headers: { ...AGENT_HEADERS },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Read-only view over the agent's job queue (same collection the agent uses). */
interface JobRow {
  userId: string;
  chatJid: string;
  kind: string;
  text: string;
  runAt: Date;
  status: string;
  repeatKey?: string;
  lastError?: string;
  createdAt: Date;
}

const JobView =
  mongoose.models.ActivityJob ??
  mongoose.model<JobRow>(
    "ActivityJob",
    new Schema<JobRow>(
      {
        userId: String,
        chatJid: String,
        kind: String,
        text: String,
        runAt: Date,
        status: String,
        repeatKey: String,
        lastError: String,
        createdAt: Date,
      },
      { collection: "agentjobs" },
    ),
  );

const MemoryView =
  mongoose.models.ActivityMemory ??
  mongoose.model(
    "ActivityMemory",
    new Schema(
      { userId: String, chatJid: String, role: String, content: String, ts: Date },
      { collection: "chatmemory" },
    ),
  );

const ProcessedView =
  mongoose.models.ActivityProcessed ??
  mongoose.model(
    "ActivityProcessed",
    new Schema(
      { userId: String, chatJid: String, msgId: String, ts: Date },
      { collection: "processedmsgs" },
    ),
  );

const ToolUseView =
  mongoose.models.ActivityToolUse ??
  mongoose.model(
    "ActivityToolUse",
    new Schema(
      { userId: String, name: String, at: Date },
      { collection: "tooluses" },
    ),
  );

function pctDelta(cur: number, prev: number): string {
  if (prev <= 0) return cur > 0 ? "new this week" : "no change";
  const d = Math.round(((cur - prev) / prev) * 100);
  if (d === 0) return "same as last week";
  return `${d > 0 ? "+" : ""}${d}% vs last week`;
}

type Stats = {
  messages7d: number;
  messagesPrev7d: number;
  customers7d: number;
  customersPrev7d: number;
  pendingTasks: number;
  toolCalls7d: number;
  traffic: { day: string; messages: number }[];
  replies30d: number;
};

/** Fallback: compute the same stats straight from Mongo (shared DB), scoped
 *  to this owner's lines, so the home cards work even when the agent is down. */
async function localStats(lines: string[]): Promise<Stats> {
  const empty: Stats = {
    messages7d: 0,
    messagesPrev7d: 0,
    customers7d: 0,
    customersPrev7d: 0,
    pendingTasks: 0,
    toolCalls7d: 0,
    traffic: [],
    replies30d: 0,
  };
  if (lines.length === 0) {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short" });
    empty.traffic = Array.from({ length: 14 }, (_, k) => {
      const i = 13 - k;
      const d = new Date(now.getTime() - i * 24 * 60 * 60_000);
      return { day: i === 0 ? "Today" : fmt.format(d), messages: 0 };
    });
    return empty;
  }
  const now = Date.now();
  const since7 = new Date(now - 7 * 24 * 60 * 60_000);
  const sincePrev = new Date(now - 14 * 24 * 60 * 60_000);
  const since14 = new Date(now - 14 * 24 * 60 * 60_000);
  const since30 = new Date(now - 30 * 24 * 60 * 60_000);
  const lineFilter = { userId: { $in: lines } };
  const [msgs7d, msgsPrev, cust7d, custPrev, pending, toolCalls7d, perDay, replies30d] =
    await Promise.all([
      MemoryView.countDocuments({ ...lineFilter, role: "user", ts: { $gte: since7 } }).catch(() => 0),
      MemoryView.countDocuments({ ...lineFilter, role: "user", ts: { $gte: sincePrev, $lt: since7 } }).catch(
        () => 0,
      ),
      ProcessedView.distinct("chatJid", { ...lineFilter, ts: { $gte: since7 } }).catch(() => [] as unknown[]),
      ProcessedView.distinct("chatJid", {
        ...lineFilter,
        ts: { $gte: sincePrev, $lt: since7 },
      }).catch(() => [] as unknown[]),
      JobView.countDocuments({ ...lineFilter, status: "pending" }).catch(() => 0),
      ToolUseView.countDocuments({ ...lineFilter, at: { $gte: since7 } }).catch(() => 0),
      MemoryView.aggregate([
        { $match: { ...lineFilter, role: "user", ts: { $gte: since14 } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$ts" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).catch(() => [] as { _id: string; count: number }[]),
      MemoryView.countDocuments({ ...lineFilter, role: "assistant", ts: { $gte: since30 } }).catch(() => 0),
    ]);
  const dayMap = new Map((perDay as { _id: string; count: number }[]).map((d) => [d._id, d.count]));
  const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short" });
  const traffic = Array.from({ length: 14 }, (_, k) => {
    const i = 13 - k;
    const d = new Date(now - i * 24 * 60 * 60_000);
    return {
      day: i === 0 ? "Today" : fmt.format(d),
      messages: dayMap.get(d.toISOString().slice(0, 10)) ?? 0,
    };
  });
  return {
    messages7d: msgs7d,
    messagesPrev7d: msgsPrev,
    customers7d: (cust7d as unknown[]).length,
    customersPrev7d: (custPrev as unknown[]).length,
    pendingTasks: pending,
    toolCalls7d,
    traffic,
    replies30d,
  };
}

/** Dashboard home feed: recent chats + scheduled tasks + tool usage + live metrics. */
export async function GET() {
  const me = await sessionUser();
  if (!me) return signedOut();
  const lines = await ownedLineIds(me.id).catch(() => [] as string[]);
  const lineSet = new Set(lines);

  const [recent] = await Promise.all([
    agentGet("/sessions/recent?limit=20"),
  ]);
  // The agent doesn't know dashboard owners — filter its global feed to my lines.
  const allChats = (recent as { chats?: unknown } | null)?.chats;
  let chats = (Array.isArray(allChats) ? allChats : []).filter((c) => {
    const line = (c as { userId?: unknown })?.userId;
    return typeof line === "string" && lineSet.has(line);
  });

  // Durable tool ranking from Mongo (the agent logs every call there with a
  // 90-day TTL). Live agent counts die with a restart, so the persisted
  // ledger is the source of truth — the agent is only a fallback.
  let toolList: { name: string; count: number }[] = [];
  try {
    await dbConnect();
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const rows = (await ToolUseView.aggregate([
      { $match: { userId: { $in: lines }, at: { $gte: since7 } } },
      { $group: { _id: "$name", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).catch(() => [] as unknown[])) as { _id?: unknown; count?: unknown }[];
    toolList = rows
      .map((r) => ({ name: String(r?._id ?? "unknown"), count: Number(r?.count ?? 0) }))
      .filter((t) => t.name && t.count > 0);
  } catch {
    toolList = [];
  }
  if (toolList.length === 0) {
    // Mongo empty (fresh DB, blip) — merge the agent's live per-line counts.
    const toolTotals = new Map<string, number>();
    await Promise.all(
      lines.map(async (line) => {
        const t = (await agentGet(`/sessions/tools?userId=${encodeURIComponent(line)}`)) as {
          tools?: { name?: unknown; count?: unknown }[];
        } | null;
        const list = Array.isArray(t?.tools) ? t!.tools! : [];
        for (const row of list) {
          const name = String(row?.name ?? "");
          if (!name) continue;
          toolTotals.set(name, (toolTotals.get(name) ?? 0) + Number(row?.count ?? 0));
        }
      }),
    );
    toolList = Array.from(toolTotals.entries()).map(([name, count]) => ({ name, count }));
  }

  if (chats.length === 0 && lines.length > 0) {
    // Agent recent-chats are live memory: after a kill or a fresh boot the
    // list is empty. Rebuild the same feed from the persisted chat ledger
    // so history survives any restart. Names/photos refill on next connect.
    try {
      await dbConnect();
      const rows = (await MemoryView.aggregate([
        { $match: { userId: { $in: lines } } },
        { $sort: { ts: 1 } },
        {
          $group: {
            _id: "$chatJid",
            userId: { $last: "$userId" },
            text: { $last: "$content" },
            role: { $last: "$role" },
            ts: { $last: "$ts" },
            messages: { $sum: 1 },
          },
        },
        { $sort: { ts: -1 } },
        { $limit: 20 },
      ]).catch(() => [] as unknown[])) as {
        _id?: unknown;
        userId?: unknown;
        text?: unknown;
        role?: unknown;
        ts?: unknown;
        messages?: unknown;
      }[];
      chats = rows.map((r) => {
        const jid = String(r?._id ?? "");
        const digits = jid.split("@")[0].replace(/\D/g, "");
        const at = r?.ts instanceof Date ? r.ts.getTime() : Number(r?.ts ?? 0);
        return {
          userId: String(r?.userId ?? ""),
          jid,
          name: digits ? `+${digits}` : "unknown",
          imgUrl: null,
          text: String(r?.text ?? ""),
          fromMe: String(r?.role ?? "") !== "user",
          ts: Number.isFinite(at) ? at : 0,
          messages: Number(r?.messages ?? 0),
        };
      }).filter((c) => c.jid);
    } catch {
      /* keep the empty list */
    }
  }

  let scheduled: unknown[] = [];
  // Model-outage alerts the agent filed while staying silent to customers.
  // Any status (pending → owner DM still queued; done → delivered) so the
  // failure stays visible for days, not just until dispatch.
  let alerts: unknown[] = [];
  // NOTE: the agent's /sessions/stats is global across owners — never use it
  // here. localStats computes the same numbers scoped to my lines.
  let stats: Stats | null = null;
  try {
    await dbConnect();
    const docs = await JobView.find({ userId: { $in: lines }, status: "pending" })
      .sort({ runAt: 1 })
      .limit(20)
      .lean();
    scheduled = docs.map((d) => ({
      id: String(d._id),
      userId: d.userId,
      chat: d.chatJid,
      kind: d.kind,
      text: d.text,
      runAt: d.runAt instanceof Date ? d.runAt.toISOString() : String(d.runAt),
    }));
    const outageDocs = await JobView.find({
      userId: { $in: lines },
      repeatKey: { $regex: "^(model-outage|session-conflict):" },
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    alerts = outageDocs.map((d) => ({
      id: String(d._id),
      userId: d.userId,
      text: d.text,
      status: d.status,
      runAt: d.runAt instanceof Date ? d.runAt.toISOString() : String(d.runAt),
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt ?? ""),
    }));
    stats = await localStats(lines);
  } catch {
    /* DB offline — chats/tools still render; stats fall back on the client */
  }

  const totalTraffic = (stats?.traffic ?? []).reduce((n, d) => n + d.messages, 0);
  const COST_TOTAL = Number(process.env.COST_QUOTA ?? 1000);
  const costUsed = stats?.replies30d ?? 0;

  return NextResponse.json({
    agentOnline: recent !== null,
    chats,
    scheduled,
    alerts,
    tools: toolList,
    stats: stats
      ? [
          {
            label: "Messages handled",
            value: String(stats.messages7d),
            delta: pctDelta(stats.messages7d, stats.messagesPrev7d),
          },
          {
            label: "Active customers",
            value: String(stats.customers7d),
            delta: pctDelta(stats.customers7d, stats.customersPrev7d),
          },
          {
            label: "Lined up",
            value: String(stats.pendingTasks),
            delta: `${stats.toolCalls7d} tool calls this week`,
          },
        ]
      : null,
    traffic: stats?.traffic ?? null,
    trafficTotal: totalTraffic,
    cost:
      stats != null
        ? {
            used: costUsed,
            total: COST_TOTAL,
            pct: COST_TOTAL > 0 ? Math.min(100, Math.round((costUsed / COST_TOTAL) * 100)) : 0,
          }
        : null,
  });
}
