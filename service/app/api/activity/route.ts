import { NextResponse } from "next/server";
import mongoose, { Schema } from "mongoose";
import { dbConnect } from "@/lib/db/mongoose";
import { agentBase, agentHeaders } from "@/lib/agent";

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

/** Fallback: compute the same stats straight from Mongo (shared DB), so the
 *  home cards work even when the agent process is down. */
async function localStats() {
  const now = Date.now();
  const since7 = new Date(now - 7 * 24 * 60 * 60_000);
  const sincePrev = new Date(now - 14 * 24 * 60 * 60_000);
  const since14 = new Date(now - 14 * 24 * 60 * 60_000);
  const since30 = new Date(now - 30 * 24 * 60 * 60_000);
  const [msgs7d, msgsPrev, cust7d, custPrev, pending, toolCalls7d, perDay, replies30d] =
    await Promise.all([
      MemoryView.countDocuments({ role: "user", ts: { $gte: since7 } }).catch(() => 0),
      MemoryView.countDocuments({ role: "user", ts: { $gte: sincePrev, $lt: since7 } }).catch(
        () => 0,
      ),
      ProcessedView.distinct("chatJid", { ts: { $gte: since7 } }).catch(() => [] as unknown[]),
      ProcessedView.distinct("chatJid", {
        ts: { $gte: sincePrev, $lt: since7 },
      }).catch(() => [] as unknown[]),
      JobView.countDocuments({ status: "pending" }).catch(() => 0),
      ToolUseView.countDocuments({ at: { $gte: since7 } }).catch(() => 0),
      MemoryView.aggregate([
        { $match: { role: "user", ts: { $gte: since14 } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$ts" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).catch(() => [] as { _id: string; count: number }[]),
      MemoryView.countDocuments({ role: "assistant", ts: { $gte: since30 } }).catch(() => 0),
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
  const [recent, tools, agentStats] = await Promise.all([
    agentGet("/sessions/recent?limit=20"),
    agentGet("/sessions/tools"),
    agentGet("/sessions/stats"),
  ]);
  const chats = (recent as { chats?: unknown } | null)?.chats ?? [];
  const toolList = (tools as { tools?: unknown } | null)?.tools ?? [];

  let scheduled: unknown[] = [];
  let stats = agentStats as {
    messages7d: number;
    messagesPrev7d: number;
    customers7d: number;
    customersPrev7d: number;
    pendingTasks: number;
    toolCalls7d: number;
    traffic: { day: string; messages: number }[];
    replies30d: number;
  } | null;
  try {
    await dbConnect();
    const docs = await JobView.find({ status: "pending" }).sort({ runAt: 1 }).limit(20).lean();
    scheduled = docs.map((d) => ({
      id: String(d._id),
      userId: d.userId,
      chat: d.chatJid,
      kind: d.kind,
      text: d.text,
      runAt: d.runAt instanceof Date ? d.runAt.toISOString() : String(d.runAt),
    }));
    if (!stats) stats = await localStats();
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
