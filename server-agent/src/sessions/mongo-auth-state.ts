import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import mongoose, { Schema } from "mongoose";
import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { ensureMongo } from "./mongo.js";

interface AuthStateDoc {
  userId: string;
  /** Same name Baileys would use on disk, e.g. "creds.json", "pre-key-5.json" */
  file: string;
  /** JSON text with BufferJSON encoding — byte-identical to the file version */
  payload: string;
}

const AuthStateSchema = new Schema<AuthStateDoc>(
  {
    userId: { type: String, index: true },
    file: String,
    payload: String,
  },
  { collection: "waauthstates" },
);
AuthStateSchema.index({ userId: 1, file: 1 }, { unique: true });

const AuthStateModel =
  mongoose.models.WaAuthState ??
  mongoose.model<AuthStateDoc>("WaAuthState", AuthStateSchema);

async function ensureConn(): Promise<void> {
  await ensureMongo();
}

// Tiny per-file promise-chain lock (same job the file version does with async-mutex)
const locks = new Map<string, Promise<void>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(key, prev.then(() => current));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
}

const fixFileName = (file: string) =>
  file?.replace(/\//g, "__")?.replace(/:/g, "-");

export function legacyAuthDir(userId: string): string {
  return `auth_info_baileys-${userId}`;
}

/** One-time move: copy a legacy folder into Mongo, then remove the folder. */
async function migrateLegacyFolder(userId: string): Promise<void> {
  const dir = legacyAuthDir(userId);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return; // no legacy folder — fresh user
  }
  if (files.length === 0) {
    await rm(dir, { recursive: true, force: true });
    return;
  }
  const existing = await AuthStateModel.countDocuments({ userId });
  if (existing > 0) return; // Mongo already has it — leave the folder alone
  const docs: AuthStateDoc[] = [];
  for (const file of files) {
    try {
      const payload = await readFile(join(dir, file), "utf-8");
      JSON.parse(payload); // sanity check before storing
      docs.push({ userId, file, payload });
    } catch {
      /* skip corrupt files */
    }
  }
  if (docs.length > 0) {
    await AuthStateModel.insertMany(docs, { ordered: false }).catch(() => {});
    console.log(`Migrated ${docs.length} auth file(s) for ${userId} into Mongo`);
  }
  await rm(dir, { recursive: true, force: true });
}

/**
 * Mongo-backed Baileys auth state. Same shape as useMultiFileAuthState,
 * so it plugs straight into makeWASocket — no JSON files on disk.
 */
export async function useMongoAuthState(userId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearState: () => Promise<void>;
}> {
  await ensureConn();
  await migrateLegacyFolder(userId);

  const readData = async (file: string): Promise<unknown> => {
    const name = fixFileName(file);
    const doc = await AuthStateModel.findOne({ userId, file: name }).lean();
    if (!doc) return null;
    try {
      return JSON.parse(doc.payload, BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const writeData = async (data: unknown, file: string): Promise<void> => {
    const name = fixFileName(file);
    await withLock(`${userId}::${name}`, async () => {
      await AuthStateModel.updateOne(
        { userId, file: name },
        { $set: { payload: JSON.stringify(data, BufferJSON.replacer) } },
        { upsert: true },
      );
    });
  };

  const removeData = async (file: string): Promise<void> => {
    const name = fixFileName(file);
    await withLock(`${userId}::${name}`, async () => {
      await AuthStateModel.deleteOne({ userId, file: name });
    });
  };

  const stored = (await readData("creds.json")) as AuthenticationCreds | null;
  const creds: AuthenticationCreds = stored ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(
          type: T,
          ids: string[],
        ) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let value: any = await readData(`${type}-${id}.json`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            }),
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            const bucket = data[category as keyof SignalDataTypeMap];
            if (!bucket) continue;
            for (const id in bucket) {
              const value = (bucket as Record<string, unknown>)[id];
              const file = `${category}-${id}.json`;
              tasks.push(value ? writeData(value, file) : removeData(file));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, "creds.json"),
    clearState: async () => {
      await AuthStateModel.deleteMany({ userId });
    },
  };
}
