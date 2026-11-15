import mongoose from "mongoose";

const URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/senap";

/** Fail fast (8s) instead of hanging ~30s when Mongo is unreachable. */
const OPTS = { serverSelectionTimeoutMS: 8000 };

let pending: Promise<typeof mongoose> | null = null;

/**
 * Shared connection gate for every module. Returns the live connection,
 * joins an in-flight attempt, or starts a fresh one. On failure the gate
 * resets so the next caller retries instead of hanging on a stale promise.
 */
export async function ensureMongo(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!pending) {
    pending = mongoose.connect(URI, OPTS).then(
      (m) => {
        pending = null;
        return m;
      },
      (err) => {
        pending = null;
        throw err;
      },
    );
  }
  return pending;
}
