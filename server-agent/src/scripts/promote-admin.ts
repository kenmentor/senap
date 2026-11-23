/**
 * Promote (or revoke) a platform admin in Mongo.
 * Run: npx tsx src/scripts/promote-admin.ts user@example.com [--revoke]
 * Sets users.isPlatformAdmin — the /dashboard/admin + /api/admin/* gate.
 */
import dotenv from "dotenv";

dotenv.config();

async function main(): Promise<void> {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const revoke = process.argv.includes("--revoke");
  if (!email || !email.includes("@")) {
    console.error("Usage: npx tsx src/scripts/promote-admin.ts user@example.com [--revoke]");
    process.exit(1);
  }
  const { ensureMongo } = await import("../sessions/mongo.js");
  const mongoose = (await import("mongoose")).default;
  await ensureMongo();
  const Users = mongoose.connection.db?.collection("users");
  if (!Users) throw new Error("No DB connection.");
  const res = await Users.updateOne({ email }, { $set: { isPlatformAdmin: !revoke } });
  if (res.matchedCount === 0) {
    console.error(JSON.stringify({ ok: false, error: `No user with email "${email}" — they must sign in once first.` }));
    process.exit(1);
  }
  const doc = await Users.findOne({ email }, { projection: { email: 1, name: 1, isPlatformAdmin: 1 } });
  console.log(JSON.stringify({ ok: true, email: doc?.email, name: doc?.name ?? null, isPlatformAdmin: doc?.isPlatformAdmin === true }));
  process.exit(0);
}

void main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e) }));
  process.exit(1);
});
