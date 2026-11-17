import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { ChatSettings, ContactRule } from "@/lib/db/models/ChatAccess";
import { agentBase, agentHeaders } from "@/lib/agent";
import { sessionUser, signedOut, ownsLine, forbidden } from "@/lib/auth-helpers";

function dbError() {
  return NextResponse.json({ error: "Database is offline." }, { status: 503 });
}

/** Best-effort: tell the agent to drop its cached block/allow list. */
async function invalidateAgentCache(userId: string): Promise<void> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    await fetch(`${agentBase()}/sessions/${encodeURIComponent(userId)}/access/invalidate`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { ...agentHeaders() },
    }).catch(() => {});
    clearTimeout(t);
  } catch {
    /* agent offline — short 5s TTL will pick the change up on next message */
  }
}

/** The line id in every call must belong to the signed-in owner. */
async function lineOf(req: Request, getId: () => string | null): Promise<{ me: string; line: string } | NextResponse> {
  const me = await sessionUser();
  if (!me) return signedOut();
  const line = (getId() ?? "").trim();
  if (!line) return NextResponse.json({ error: "userId is required." }, { status: 400 });
  if (!(await ownsLine(me.id, line))) return forbidden("Not your line.");
  return { me: me.id, line };
}

/** GET ?userId= → { mode, rules: [{ id, jid, name, list }] } */
export async function GET(req: Request) {
  const checked = await lineOf(req, () => new URL(req.url).searchParams.get("userId"));
  if (checked instanceof NextResponse) return checked;
  const { line } = checked;
  try {
    await dbConnect();
    const settings = await ChatSettings.findOne({ userId: line }).lean();
    const rules = await ContactRule.find({ userId: line }).sort({ name: 1 }).lean();
    return NextResponse.json({
      userId: line,
      mode: settings?.mode ?? "open",
      rules: rules.map((d) => docId(d)),
    });
  } catch {
    return dbError();
  }
}

/** PUT { userId, mode } — switch open/exclusive. */
export async function PUT(req: Request) {
  const b = await req.json().catch(() => ({}));
  const checked = await lineOf(req, () => String(b.userId ?? ""));
  if (checked instanceof NextResponse) return checked;
  const { line } = checked;
  try {
    await dbConnect();
    if (b.mode !== "open" && b.mode !== "exclusive") {
      return NextResponse.json({ error: "mode must be 'open' or 'exclusive'." }, { status: 400 });
    }
    await ChatSettings.findOneAndUpdate({ userId: line }, { mode: b.mode }, { upsert: true });
    await invalidateAgentCache(line);
    return NextResponse.json({ userId: line, mode: b.mode });
  } catch {
    return dbError();
  }
}

/** POST { userId, jid, name?, list: black|white } — upsert one rule. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const checked = await lineOf(req, () => String(b.userId ?? ""));
  if (checked instanceof NextResponse) return checked;
  const { line } = checked;
  try {
    await dbConnect();
    const jid = String(b.jid ?? "").trim();
    if (!jid) return NextResponse.json({ error: "userId and jid are required." }, { status: 400 });
    if (b.list !== "black" && b.list !== "white") {
      return NextResponse.json({ error: "list must be 'black' or 'white'." }, { status: 400 });
    }
    const doc = await ContactRule.findOneAndUpdate(
      { userId: line, jid },
      { name: String(b.name ?? "unknown").trim() || "unknown", list: b.list },
      { upsert: true, new: true },
    ).lean();
    if (!doc) return NextResponse.json({ error: "Could not save rule." }, { status: 500 });
    await invalidateAgentCache(line);
    return NextResponse.json(docId(doc), { status: 201 });
  } catch {
    return dbError();
  }
}

/** DELETE ?userId=&jid= — remove one rule (unblock / un-allow). */
export async function DELETE(req: Request) {
  const params = new URL(req.url).searchParams;
  const checked = await lineOf(req, () => params.get("userId"));
  if (checked instanceof NextResponse) return checked;
  const { line } = checked;
  try {
    await dbConnect();
    const jid = params.get("jid")?.trim();
    if (!jid) return NextResponse.json({ error: "jid is required." }, { status: 400 });
    await ContactRule.findOneAndDelete({ userId: line, jid });
    await invalidateAgentCache(line);
    return NextResponse.json({ ok: true });
  } catch {
    return dbError();
  }
}
