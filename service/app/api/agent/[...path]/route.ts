import { NextResponse } from "next/server";
import { agentBase, agentHeaders } from "@/lib/agent";

/**
 * Server-side proxy to the WhatsApp agent. Browser pages must call the agent
 * through here (`/api/agent/...`) instead of hitting :3001 directly — the
 * AGENT_API_KEY stays secret on the server and every call carries it, so
 * nothing 401s silently and contacts/groups/QR actually load.
 */

async function forward(req: Request, path: string[]) {
  const url = new URL(req.url);
  const target = `${agentBase()}/${path.map(encodeURIComponent).join("/")}${url.search}`;
  const headers: Record<string, string> = { ...agentHeaders() };
  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const buf = await req.arrayBuffer().catch(() => null);
    if (buf && buf.byteLength > 0) {
      init.body = buf;
      const ct = req.headers.get("content-type");
      if (ct) headers["content-type"] = ct;
    }
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  init.signal = ctrl.signal;
  try {
    const res = await fetch(target, init);
    clearTimeout(t);
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    clearTimeout(t);
    return NextResponse.json({ error: "Agent unreachable — is it running?" }, { status: 502 });
  }
}

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  return forward(req, params.path);
}

export async function POST(req: Request, { params }: { params: { path: string[] } }) {
  return forward(req, params.path);
}

export async function PUT(req: Request, { params }: { params: { path: string[] } }) {
  return forward(req, params.path);
}

export async function DELETE(req: Request, { params }: { params: { path: string[] } }) {
  return forward(req, params.path);
}
