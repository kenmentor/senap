import { redirect } from "next/navigation";

/** One passwordless entry point — /signup now lands on the email flow. */
export default function SignupPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const next = searchParams?.next;
  redirect(
    next && next.startsWith("/") && !next.startsWith("//")
      ? `/signin?next=${encodeURIComponent(next)}`
      : "/signin",
  );
}
