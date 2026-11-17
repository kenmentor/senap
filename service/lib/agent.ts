/**
 * Shared agent-connection helpers. Both services are deployed separately, so
 * the dashboard reaches the agent ONLY through these env vars:
 *
 *   AGENT_URL / NEXT_PUBLIC_AGENT_URL — agent base URL
 *   AGENT_API_KEY / NEXT_PUBLIC_AGENT_KEY — shared secret (must match agent)
 *
 * Hosts that inject a bare hostname (e.g. Render `fromService: host` gives
 * `senap-agent.onrender.com` with no scheme) are normalized to https://,
 * except localhost which stays http://.
 */

export function withScheme(raw: string): string {
  const v = (raw ?? "").trim().replace(/\/+$/, "");
  if (!v) return v;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v;
  const host = v.replace(/^\/+/, "");
  return /^(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?$/i.test(host)
    ? `http://${host}`
    : `https://${host}`;
}

/** Base URL of the WhatsApp agent (no trailing slash). */
export function agentBase(): string {
  return withScheme(
    process.env.AGENT_URL ??
      process.env.NEXT_PUBLIC_AGENT_URL ??
      "http://localhost:3001",
  );
}

/** Shared secret the agent checks on /sessions/*. Empty = open (dev only). */
export function agentKey(): string {
  return (
    process.env.AGENT_API_KEY ??
    process.env.NEXT_PUBLIC_AGENT_KEY ??
    ""
  ).trim();
}

/** Auth headers for agent calls — empty object when no key is configured. */
export function agentHeaders(): Record<string, string> {
  const key = agentKey();
  return key ? { authorization: `Bearer ${key}`, "x-agent-key": key } : {};
}
