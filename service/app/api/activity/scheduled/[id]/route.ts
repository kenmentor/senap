import { NextResponse } from "next/server";
import mongoose, { Schema } from "mongoose";
import { dbConnect } from "@/lib/db/mongoose";

const JobView =
  mongoose.models.ActivityJobCancel ??
  mongoose.model(
    "ActivityJobCancel",
    new Schema(
      { status: String },
      { collection: "agentjobs" },
    ),
  );

/** Cancel a pending scheduled task from the dashboard. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await dbConnect();
    const res = await JobView.updateOne(
      { _id: params.id, status: "pending" },
      { $set: { status: "failed", lastError: "cancelled from dashboard" } },
    );
    if (res.matchedCount === 0) return NextResponse.json({ error: "Job not found." }, { status: 404 });
    return NextResponse.json({ cancelled: true });
  } catch {
    return NextResponse.json({ error: "Database is offline." }, { status: 503 });
  }
}
