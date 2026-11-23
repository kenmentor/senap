import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db/mongoose";
import { sessionUser } from "@/lib/auth-helpers";
import { isPlatformAdminEmail } from "@/lib/admin";
import { User } from "@/lib/db/models/User";
import { LinkedAccount } from "@/lib/db/models/LinkedAccount";
import { Product } from "@/lib/db/models/Product";

function dbError() {
  return NextResponse.json({ error: "Database is offline." }, { status: 503 });
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

/** Platform-wide tracking. Admin emails only (PLATFORM_ADMIN_EMAILS). No message bodies, ever. */
export async function GET() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isPlatformAdminEmail(me.email)) {
    return NextResponse.json({ error: "Not a platform admin." }, { status: 403 });
  }
  try {
    await dbConnect();
    const { default: mongoose } = await import("mongoose");
    const db = mongoose.connection.db;
    const days14 = lastNDays(14);
    const since14 = new Date();
    since14.setDate(since14.getDate() - 13);
    since14.setHours(0, 0, 0, 0);
    const since7 = new Date();
    since7.setDate(since7.getDate() - 7);

    const coll = (name: string) => {
      try {
        return db?.collection(name) ?? null;
      } catch {
        return null;
      }
    };

    // Core counts (fail-open per metric).
    const [userCount, lineCount, productCount] = await Promise.all([
      User.estimatedDocumentCount().catch(() => 0),
      LinkedAccount.estimatedDocumentCount().catch(() => 0),
      Product.estimatedDocumentCount().catch(() => 0),
    ]);

    const chatmemory = coll("chatmemory");
    const orders = coll("orders");
    const agentjobs = coll("agentjobs");
    const tooluses = coll("tooluses");
    const customerprofiles = coll("customerprofiles");
    const salesstates = coll("salesstates");

    const [msgTotal, msg7d, customerChats, profilesCount, salesStatesCount, pendingJobs] = await Promise.all([
      chatmemory?.estimatedDocumentCount().catch(() => 0) ?? Promise.resolve(0),
      chatmemory?.countDocuments({ ts: { $gte: since7 } }).catch(() => 0) ?? Promise.resolve(0),
      chatmemory?.distinct("chatJid").then((a) => a.length).catch(() => 0) ?? Promise.resolve(0),
      customerprofiles?.estimatedDocumentCount().catch(() => 0) ?? Promise.resolve(0),
      salesstates?.estimatedDocumentCount().catch(() => 0) ?? Promise.resolve(0),
      agentjobs?.countDocuments({ status: "pending" }).catch(() => 0) ?? Promise.resolve(0),
    ]);

    const [orderCount, orderValue] = await (async (): Promise<[number, number]> => {
      if (!orders) return [0, 0];
      try {
        const rows = await orders
          .aggregate([{ $group: { _id: null, n: { $sum: 1 }, v: { $sum: { $ifNull: ["$total", 0] } } } }])
          .toArray();
        const r = rows[0] as { n?: number; v?: number } | undefined;
        return [Number(r?.n ?? 0), Number(r?.v ?? 0)];
      } catch {
        return [0, 0];
      }
    })();

    // Timeseries (14d): messages, orders, signups.
    const [msgsByDay, ordersByDay, signupsByDay] = await Promise.all([
      (async () => {
        if (!chatmemory) return [];
        try {
          return (await chatmemory
            .aggregate([
              { $match: { ts: { $gte: since14 } } },
              { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$ts" } }, n: { $sum: 1 } } },
            ])
            .toArray()) as { _id: string; n: number }[];
        } catch {
          return [];
        }
      })(),
      (async () => {
        if (!orders) return [];
        try {
          return (await orders
            .aggregate([
              { $match: { createdAt: { $gte: since14 } } },
              { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, n: { $sum: 1 } } },
            ])
            .toArray()) as { _id: string; n: number }[];
        } catch {
          return [];
        }
      })(),
      (async () => {
        try {
          return (await User.aggregate([
            { $match: { createdAt: { $gte: since14 } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, n: { $sum: 1 } } },
          ])) as { _id: string; n: number }[];
        } catch {
          return [];
        }
      })(),
    ]);
    const mapOf = (rows: { _id: string; n: number }[]) => new Map(rows.map((r) => [r._id, r.n]));
    const mm = mapOf(msgsByDay);
    const om = mapOf(ordersByDay);
    const sm = mapOf(signupsByDay);

    // Tool leaderboard.
    const topTools: { name: string; count: number }[] = await (async () => {
      if (!tooluses) return [];
      try {
        const rows = (await tooluses
          .aggregate([{ $group: { _id: "$name", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }])
          .toArray()) as { _id: string; count: number }[];
        return rows.map((r) => ({ name: String(r._id), count: Number(r.count) }));
      } catch {
        return [];
      }
    })();

    // Newest shops (no PII beyond business email/name).
    const recentUsers = await (async () => {
      try {
        const docs = await User.find({}).sort({ createdAt: -1 }).limit(10).select("email name createdAt").lean();
        const ids = docs.map((d) => String(d._id));
        const lineCounts = new Map<string, number>();
        try {
          const rows = (await LinkedAccount.aggregate([
            { $match: { ownerId: { $in: ids } } },
            { $group: { _id: "$ownerId", n: { $sum: 1 } } },
          ])) as { _id: string; n: number }[];
          for (const r of rows) lineCounts.set(r._id, r.n);
        } catch {
          /* line counts best-effort */
        }
        return docs.map((d) => ({
          email: d.email,
          name: d.name || "—",
          joined: (d as unknown as { createdAt?: Date }).createdAt ?? null,
          lines: lineCounts.get(String(d._id)) ?? 0,
        }));
      } catch {
        return [];
      }
    })();

    return NextResponse.json({
      totals: {
        users: userCount,
        lines: lineCount,
        products: productCount,
        messages: msgTotal,
        messages7d: msg7d,
        customerChats,
        profiles: profilesCount,
        activeSalesStates: salesStatesCount,
        orders: orderCount,
        orderValue,
        pendingJobs,
      },
      series: days14.map((d) => ({
        day: d.slice(5),
        messages: mm.get(d) ?? 0,
        orders: om.get(d) ?? 0,
        signups: sm.get(d) ?? 0,
      })),
      topTools,
      recentUsers,
    });
  } catch {
    return dbError();
  }
}
