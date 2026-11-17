// Liveness probe for hosts (Render health check). No DB, no auth.
export function GET(): Response {
  return Response.json({ ok: true });
}
