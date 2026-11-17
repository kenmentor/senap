"use client";

import { useState } from "react";

export type AccessRow = {
  jid: string;
  name: string;
  sub: string;
  imgUrl?: string | null;
  badge?: string;
  rule: { list: "black" | "white" } | null;
};

type Props = {
  rows: AccessRow[];
  pendingJid: string | null;
  onToggle: (row: AccessRow, list: "black" | "white" | null) => void;
  emptyText: string;
};

function hueOf(s: string | null | undefined): number {
  const str = s ?? "";
  let h = 11;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return h % 360;
}

function initialsOf(name: string | null | undefined): string {
  return (
    (name ?? "")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

/** WhatsApp-style avatar: synced photo when there is one, initials tile otherwise. */
function RowAvatar({ jid, name, imgUrl }: { jid: string | null | undefined; name: string | null | undefined; imgUrl?: string | null }) {
  const [broken, setBroken] = useState(false);
  const hue = hueOf(jid);
  const showPhoto = !!imgUrl && imgUrl.startsWith("http") && !broken;
  return (
    <span
      className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-bold"
      style={{
        background: `linear-gradient(135deg, hsl(${hue},32%,30%), hsl(${(hue + 50) % 360},36%,18%))`,
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.14)",
      }}
    >
      {initialsOf(name)}
      {showPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgUrl as string}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}

/**
 * WhatsApp-style contact table (shadcn-table look): header row, avatar +
 * name rows, Block / Allow checkbox columns.
 */
export default function ContactAccessTable({ rows, pendingJid, onToggle, emptyText }: Props) {
  if (rows.length === 0) {
    return <p className="mt-3 text-[12.5px]" style={{ color: "#636c73" }}>{emptyText}</p>;
  }
  return (
    <div className="mt-3 overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      <div
        className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5 text-[10.5px] font-bold uppercase"
        style={{ background: "rgba(255,255,255,0.04)", color: "#636c73", letterSpacing: "0.08em" }}
      >
        <span>Contact</span>
        <span className="w-14 text-center">Block</span>
        <span className="w-14 text-center">Allow</span>
      </div>
      <ul className="flex flex-col" style={{ background: "rgba(255,255,255,0.015)" }}>
        {rows.map((row, i) => {
          const blocked = row.rule?.list === "black";
          const allowed = row.rule?.list === "white";
          const busy = pendingJid === row.jid;
          const displayName = row.name ?? "Unknown";
          return (
            <li
              key={row.jid ?? `row-${i}`}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5"
              style={{
                borderTop: i === 0 ? undefined : "1px solid rgba(255,255,255,0.06)",
                background: blocked ? "rgba(230,106,106,0.05)" : undefined,
              }}
            >
              <span className="flex min-w-0 items-center gap-3">
                <RowAvatar jid={row.jid} name={displayName} imgUrl={row.imgUrl} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ color: "#e9edef" }}>
                    <span className="truncate">{displayName}</span>
                    {row.badge && (
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(0,168,132,0.12)", color: "#00d19f" }}>
                        {row.badge}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11.5px]" style={{ color: "#636c73" }}>
                    {row.sub}
                    {blocked ? " · BLOCKED" : allowed ? " · allowed" : ""}
                  </span>
                </span>
              </span>
              <span className="flex w-14 justify-center">
                <input
                    type="checkbox"
                    checked={!!blocked}
                    disabled={busy}
                    onChange={() => onToggle(row, blocked ? null : "black")}
                    aria-label={`Block ${displayName}`}
                  title="Block (messages are dropped instantly)"
                  className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#e66a6a] disabled:opacity-50"
                />
              </span>
              <span className="flex w-14 justify-center">
                <input
                  type="checkbox"
                  checked={!!allowed}
                  disabled={busy}
                    onChange={() => onToggle(row, allowed ? null : "white")}
                    aria-label={`Allow ${displayName}`}
                  title="Allow (counts in Invite-only mode)"
                  className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#00a884] disabled:opacity-50"
                />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
