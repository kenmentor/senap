import { NextResponse } from "next/server";
import { agentBase, agentHeaders } from "@/lib/agent";
import { sessionUser, signedOut, ownsLine } from "@/lib/auth-helpers";

/** Real WhatsApp profile pic for one of my lines (dashboard, authed). Falls back to null. */
export async function GET(req: Request) {
  const me = await sessionUser();
  if (!me) return signedOut();
  const line = new URL(req.url).searchParams.get("line")?.trim() ?? "";
  if (!line) return NextResponse.json({ url: null });
  if (!(await ownsLine(me.id, line).catch(() => false))) {
    return NextResponse.json({ error: "Not your line." }, { status: 403 });
  }
  try {
    const headers = agentHeaders();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const stateRes = await fetch(`${agentBase()}/sessions/${encodeURIComponent(line)}`, {
      signal: ctrl.signal,
      headers,
    }).catch(() => null);
    const state = (await stateRes?.json().catch(() => null)) as { me?: unknown } | null;
    const selfJid = typeof state?.me === "string" && state.me ? state.me : null;
    if (!selfJid) {
      clearTimeout(t);
      return NextResponse.json({ url: null });
    }
    const avRes = await fetch(
      `${agentBase()}/sessions/${encodeURIComponent(line)}/avatar?jid=${encodeURIComponent(selfJid)}`,
      { signal: ctrl.signal, headers },
    ).catch(() => null);
    const av = (await avRes?.json().catch(() => null)) as { url?: unknown } | null;
    clearTimeout(t);
    const url = typeof av?.url === "string" && av.url.startsWith("http") ? av.url : null;
    return NextResponse.json(
      { url },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch {
    return NextResponse.json({ url: null });
  }
}
