"use client";

import { useEffect, useState } from "react";
import { Building2, Bell, Users, CreditCard, Database, TriangleAlert, Download, Plus, Crown, ShieldCheck } from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm-dialog";

type Biz = { name: string; owner: string; phone: string; currency: string; timezone: string; address: string };
type Notif = { orders: boolean; approvals: boolean; daily: boolean; lowStock: boolean; marketing: boolean; sms: boolean };
type Member = { name: string; role: string; access: string };
type Plan = "Starter" | "Growth" | "Scale";

const DEFAULT_BIZ: Biz = { name: "Nala Phones", owner: "Business owner", phone: "+234 801 234 5678", currency: "NGN ₦", timezone: "Africa/Lagos (WAT)", address: "12 Admiralty Way, Lekki, Lagos" };
const DEFAULT_NOTIF: Notif = { orders: true, approvals: true, daily: true, lowStock: true, marketing: false, sms: false };
const DEFAULT_TEAM: Member[] = [
  { name: "Business owner", role: "Owner", access: "Full access" },
  { name: "Mr Chi", role: "Manager", access: "Approve & reports" }
];

const card = { border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" } as const;
const field = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#e9edef" } as const;

function Section({ icon: Icon, title, sub, children }: { icon: typeof Building2; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-5 sm:p-6" style={card}>
      <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "#e9edef" }}>
        <Icon size={16} style={{ color: "#00a884" }} /> {title}
      </h2>
      <p className="mt-0.5 text-[12.5px]" style={{ color: "#636c73" }}>{sub}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function RowToggle({ label, desc, on, onFlip }: { label: string; desc: string; on: boolean; onFlip: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3.5 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium" style={{ color: "#e9edef" }}>{label}</p>
        <p className="truncate text-[12px]" style={{ color: "#636c73" }}>{desc}</p>
      </div>
      <button onClick={onFlip} aria-label={label} className="relative h-6 w-11 shrink-0 rounded-full transition" style={{ background: on ? "#00a884" : "rgba(255,255,255,0.12)" }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: on ? 22 : 2 }} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [biz, setBiz] = useState<Biz>(DEFAULT_BIZ);
  const [notif, setNotif] = useState<Notif>(DEFAULT_NOTIF);
  const [team, setTeam] = useState<Member[]>(DEFAULT_TEAM);
  const [plan, setPlan] = useState<Plan>("Growth");
  const [invite, setInvite] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [adminPhone, setAdminPhone] = useState("");
  const [reportAccountId, setReportAccountId] = useState("");
  const [adminVerified, setAdminVerified] = useState(false);
  const [accountOptions, setAccountOptions] = useState<{ id: string; number: string; engineId?: string }[]>([]);
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const s = await res.json();
        if (s.business) setBiz({ ...DEFAULT_BIZ, ...s.business });
        if (s.notifications) setNotif({ ...DEFAULT_NOTIF, ...s.notifications });
        if (Array.isArray(s.team) && s.team.length) setTeam(s.team);
        if (s.plan) setPlan(s.plan);
        if (typeof s.adminPhone === "string") setAdminPhone(s.adminPhone);
        if (typeof s.reportAccountId === "string") setReportAccountId(s.reportAccountId);
        if (typeof s.adminVerified === "boolean") setAdminVerified(s.adminVerified);
      } catch {
        /* offline — keep defaults */
      }
      try {
        const res = await fetch("/api/accounts");
        if (res.ok) setAccountOptions(await res.json());
      } catch {
        /* no linked accounts yet */
      }
    })();
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business: biz, notifications: notif, team, plan, adminPhone, reportAccountId })
      });
      if (!res.ok) throw new Error("save failed");
      const s = await res.json().catch(() => ({}));
      if (typeof s.adminVerified === "boolean") setAdminVerified(s.adminVerified);
      flash("Settings saved.");
    } catch {
      flash("Couldn't save — is MongoDB running?");
    } finally {
      setSaving(false);
    }
  };

  const addMember = () => {
    if (!invite.trim()) return flash("Type a name or phone number to invite.");
    setTeam((t) => [...t, { name: invite.trim(), role: "Staff", access: "View & chat" }]);
    setInvite("");
    flash("Invite added — hit Save all to keep it.");
  };

  const sendAdminCode = async () => {
    if (adminPhone.replace(/\D/g, "").length < 7) return flash("Enter a valid admin WhatsApp number first.");
    setOtpBusy(true);
    try {
      // Persist the number + reporting line first so the code goes out from the right account.
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPhone, reportAccountId }),
      });
      const res = await fetch("/api/settings/admin-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "send" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not send the code.");
      setOtpSent(true);
      setAdminVerified(false);
      flash("Code sent — check that WhatsApp.");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not send the code.");
    } finally {
      setOtpBusy(false);
    }
  };

  const confirmAdminCode = async () => {
    if (otpCode.replace(/\D/g, "").length !== 6) return flash("Enter the 6-digit code.");
    setOtpBusy(true);
    try {
      const res = await fetch("/api/settings/admin-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "confirm", code: otpCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Verification failed.");
      setAdminVerified(true);
      setOtpSent(false);
      setOtpCode("");
      flash("Admin number verified — she'll take your commands from there.");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setOtpBusy(false);
    }
  };

  const planPrice = plan === "Starter" ? "Free" : plan === "Growth" ? "₦4,500/mo" : "₦12,000/mo";

  return (
    <div className="max-w-[720px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-bold" style={{ color: "#e9edef" }}>Platform settings</h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "#8a949b" }}>Business, notifications, team and billing.</p>
        </div>
        <button onClick={saveAll} disabled={saving} className="rounded-xl px-5 text-[13.5px] font-semibold disabled:opacity-50" style={{ background: "#00a884", color: "#04241d", height: 42 }}>
          {saving ? "Saving…" : "Save all"}
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-3.5">
        <Section icon={Building2} title="Business profile" sub="Shown to customers in chats and receipts.">
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Business name</span>
              <input value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} className="rounded-xl px-3.5 text-[14px] outline-none" style={{ ...field, height: 42 }} />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Owner</span>
                <input value={biz.owner} onChange={(e) => setBiz({ ...biz, owner: e.target.value })} className="rounded-xl px-3.5 text-[14px] outline-none" style={{ ...field, height: 42 }} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>WhatsApp number</span>
                <input value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} className="rounded-xl px-3.5 text-[14px] outline-none" style={{ ...field, height: 42 }} />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Currency</span>
                <select value={biz.currency} onChange={(e) => setBiz({ ...biz, currency: e.target.value })} className="rounded-xl px-3.5 text-[14px] outline-none" style={{ ...field, height: 42 }}>
                  <option>NGN ₦</option>
                  <option>GHS ₵</option>
                  <option>KES KSh</option>
                  <option>USD $</option>
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Timezone</span>
                <select value={biz.timezone} onChange={(e) => setBiz({ ...biz, timezone: e.target.value })} className="rounded-xl px-3.5 text-[14px] outline-none" style={{ ...field, height: 42 }}>
                  <option>Africa/Lagos (WAT)</option>
                  <option>Africa/Accra (GMT)</option>
                  <option>Africa/Nairobi (EAT)</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Shop address</span>
              <input value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} className="rounded-xl px-3.5 text-[14px] outline-none" style={{ ...field, height: 42 }} />
            </label>
          </div>
        </Section>

        <Section icon={ShieldCheck} title="Reports & admin control" sub="She sends reports here, and only takes owner commands from this number — or from each line's own chat when left empty (default).">
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Admin WhatsApp (private) — leave empty to use each line&apos;s own number</span>
              <div className="flex gap-2">
                <input
                  value={adminPhone}
                  onChange={(e) => { setAdminPhone(e.target.value); setAdminVerified(false); }}
                  placeholder="+234 801 234 5678"
                  inputMode="tel"
                  className="min-w-0 flex-1 rounded-xl px-3.5 text-[14px] outline-none"
                  style={{ ...field, height: 42 }}
                />
                <span
                  className="flex shrink-0 items-center rounded-full px-3 text-[11.5px] font-bold"
                  style={adminVerified
                    ? { background: "rgba(0,168,132,0.14)", color: "#00d19f", border: "1px solid rgba(0,168,132,0.4)" }
                    : { background: "rgba(255,255,255,0.05)", color: "#8a949b", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  {adminVerified ? "Verified" : "Unverified"}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-[11.5px]" style={{ color: "#636c73" }}>
                  {adminPhone.trim()
                    ? "Commands + escalations go to this number once verified."
                    : "Empty = each line answers to itself (message the line's own chat to command it)."}
                </span>
                {adminPhone.trim() && (
                  <button
                    type="button"
                    onClick={() => { setAdminPhone(""); setAdminVerified(false); setOtpSent(false); setOtpCode(""); flash("Cleared — hit Save all. Each line now answers to itself."); }}
                    className="rounded-lg px-2.5 py-1 text-[11.5px] font-semibold"
                    style={{ background: "rgba(255,255,255,0.06)", color: "#aebac1", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    Use line&apos;s own number instead
                  </button>
                )}
              </div>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Send reports & codes from</span>
              <select
                value={reportAccountId}
                onChange={(e) => setReportAccountId(e.target.value)}
                className="rounded-xl px-3.5 text-[14px] outline-none"
                style={{ ...field, height: 42 }}
              >
                <option value="">First connected account</option>
                {accountOptions.map((a) => {
                  const engine = (a.engineId ?? a.number ?? "").trim();
                  return <option key={a.id} value={engine}>{a.number}</option>;
                })}
              </select>
            </label>
            {!adminVerified && (
              <div className="rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-[12.5px] leading-relaxed" style={{ color: "#8a949b" }}>
                  We prove you own the number with a WhatsApp code — no extra login stored. Save, then send the code from your linked business line.
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button onClick={sendAdminCode} disabled={otpBusy} className="rounded-xl px-4 text-[13px] font-semibold disabled:opacity-50" style={{ background: "#00a884", color: "#04241d", height: 40 }}>
                    {otpBusy ? "Sending…" : otpSent ? "Resend code" : "Send code"}
                  </button>
                  {otpSent && (
                    <>
                      <input
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="6-digit code"
                        inputMode="numeric"
                        className="w-32 rounded-xl px-3.5 text-center text-[14px] font-bold tracking-[0.2em] outline-none"
                        style={{ ...field, height: 40 }}
                      />
                      <button onClick={confirmAdminCode} disabled={otpBusy} className="rounded-xl px-4 text-[13px] font-semibold disabled:opacity-50" style={{ background: "rgba(0,168,132,0.12)", color: "#00d19f", border: "1px solid rgba(0,168,132,0.4)", height: 40 }}>
                        Verify
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </Section>

        <Section icon={Bell} title="Notifications" sub="What pings you — the agent handles the rest quietly.">
          <div className="grid gap-2">
            <RowToggle label="New orders" desc="Instant WhatsApp alert per order" on={notif.orders} onFlip={() => setNotif((v) => ({ ...v, orders: !v.orders }))} />
            <RowToggle label="Approvals needed" desc="Promo or report waiting on you" on={notif.approvals} onFlip={() => setNotif((v) => ({ ...v, approvals: !v.approvals }))} />
            <RowToggle label="Daily summary" desc="Sales roundup every evening" on={notif.daily} onFlip={() => setNotif((v) => ({ ...v, daily: !v.daily }))} />
            <RowToggle label="Low-stock warnings" desc="When stock hits 5 or less" on={notif.lowStock} onFlip={() => setNotif((v) => ({ ...v, lowStock: !v.lowStock }))} />
            <RowToggle label="Marketing tips" desc="Occasional growth ideas" on={notif.marketing} onFlip={() => setNotif((v) => ({ ...v, marketing: !v.marketing }))} />
            <RowToggle label="SMS fallback" desc="If WhatsApp is unreachable" on={notif.sms} onFlip={() => setNotif((v) => ({ ...v, sms: !v.sms }))} />
          </div>
        </Section>

        <Section icon={Users} title="Team" sub="Give staff access without sharing your phone.">
          <div className="flex flex-col gap-2">
            {team.map((m, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold" style={{ background: "rgba(255,255,255,0.08)", color: "#cfd6db" }}>
                  {m.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium" style={{ color: "#e9edef" }}>{m.name}</p>
                  <p className="text-[12px]" style={{ color: "#636c73" }}>{m.role} · {m.access}</p>
                </div>
                <button onClick={() => setTeam((t) => t.filter((_, j) => j !== i))} className="shrink-0 text-[12.5px] font-medium" style={{ color: "#e66a6a" }}>
                  Remove
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMember()}
                placeholder="Invite by name or phone…"
                className="min-w-0 flex-1 rounded-xl px-3.5 text-[14px] outline-none placeholder:text-[#4a545b]"
                style={{ ...field, height: 42 }}
              />
              <button onClick={addMember} className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold" style={{ background: "#00a884", color: "#04241d", height: 42 }}>
                <Plus size={15} strokeWidth={2.5} /> Invite
              </button>
            </div>
          </div>
        </Section>

        <Section icon={CreditCard} title="Billing & usage" sub="Start free. Upgrade when she pays for herself.">
          <div className="grid grid-cols-3 gap-1.5 rounded-xl p-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {(["Starter", "Growth", "Scale"] as Plan[]).map((p) => (
              <button
                key={p}
                onClick={() => setPlan(p)}
                className="flex items-center justify-center gap-1 rounded-lg py-2.5 text-[13px] font-semibold transition"
                style={plan === p ? { background: "#00a884", color: "#04241d" } : { color: "#8a949b" }}
              >
                {p === "Growth" && <Crown size={13} />} {p}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-[11px] font-semibold uppercase" style={{ color: "#636c73", letterSpacing: "0.08em" }}>AI replies</p>
              <p className="mt-1 text-[15px] font-bold" style={{ color: "#e9edef" }}>842 / 2,000</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
                <div className="h-full rounded-full" style={{ width: "42%", background: "#00a884" }} />
              </div>
            </div>
            <div className="rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-[11px] font-semibold uppercase" style={{ color: "#636c73", letterSpacing: "0.08em" }}>Plan</p>
              <p className="mt-1 text-[15px] font-bold" style={{ color: "#e9edef" }}>{planPrice}</p>
              <p className="mt-1 text-[12px]" style={{ color: "#00a884" }}>Renews Dec 10</p>
            </div>
          </div>
        </Section>

        <Section icon={Database} title="Data" sub="Your chats, orders and customers belong to you.">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => flash("Export started — CSV will arrive by WhatsApp.")} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition hover:bg-white/10" style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#cfd6db" }}>
              <Download size={14} /> Export orders
            </button>
            <button onClick={() => flash("Export started — customers CSV on its way.")} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition hover:bg-white/10" style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#cfd6db" }}>
              <Download size={14} /> Export customers
            </button>
          </div>
        </Section>

        <section className="rounded-2xl p-5 sm:p-6" style={{ border: "1px solid rgba(230,106,106,0.3)", background: "rgba(230,106,106,0.04)" }}>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "#e66a6a" }}>
            <TriangleAlert size={16} /> Danger zone
          </h2>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <button onClick={() => flash("Amaka paused for 24h (demo).")} className="rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ border: "1px solid rgba(230,106,106,0.4)", color: "#e66a6a" }}>
              Pause employee
            </button>
            <button onClick={() => setConfirmWipe(true)} className="rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ background: "#e66a6a", color: "#fff" }}>
              Delete everything
            </button>
          </div>
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border px-5 py-3 text-[13.5px] font-semibold shadow-2xl" style={{ background: "#1f2c34", borderColor: "rgba(0,168,132,0.4)", color: "#e9edef" }}>
          {toast}
        </div>
      )}

      <ConfirmDialog
        open={confirmWipe}
        title="Delete all Senap data?"
        description="This permanently removes products, orders, customers and settings. This cannot be undone — we'll still confirm by phone before anything is wiped."
        confirmLabel="Request delete"
        danger
        icon={TriangleAlert}
        onCancel={() => setConfirmWipe(false)}
        onConfirm={() => {
          setConfirmWipe(false);
          flash("Delete requested — we'll confirm by phone first.");
        }}
      />
    </div>
  );
}
