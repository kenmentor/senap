import mongoose from "mongoose";

const URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/senap";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

// Reuse the connection across hot reloads in dev.
const globalAny = global as unknown as { __senapMongoose?: Cache };
const cache: Cache = globalAny.__senapMongoose ?? { conn: null, promise: null };
globalAny.__senapMongoose = cache;

export async function dbConnect(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose.connect(URI, { bufferCommands: false });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}

/** Plain-object id mapping for API responses. */
export function docId<T extends { _id: unknown }>(d: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = d as T & { _id: { toString(): string } };
  return { ...(rest as Omit<T, "_id">), id: _id.toString() };
}
