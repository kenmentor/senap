import mongoose, { Schema, type Document } from "mongoose";

export interface UserDoc extends Document {
  name: string;
  email: string;
  /** Legacy password logins only. Passwordless (email-confirm) accounts omit this. */
  passwordHash?: string;
}

const UserSchema = new Schema<UserDoc>(
  {
    name: { type: String, trim: true, default: "" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: false }
  },
  { timestamps: true, versionKey: false }
);

export const User =
  (mongoose.models.User as mongoose.Model<UserDoc> | undefined) ??
  mongoose.model<UserDoc>("User", UserSchema);
