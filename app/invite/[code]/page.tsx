import Link from "next/link";
import { getInvitePreview } from "@/lib/invites";
import { AcceptInviteButton } from "./AcceptInviteButton";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const invite = await getInvitePreview(code);

  if (!invite) {
    return (
      <main className="safe-top flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-4xl">🤔</p>
        <p className="font-bold">This invite link doesn&apos;t exist.</p>
        <Link href="/login" className="text-sm font-bold text-primary">
          Go to Splitzy →
        </Link>
      </main>
    );
  }

  return (
    <main className="safe-top flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <span
        className={`grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br ${invite.inviter_color} text-3xl font-black text-white shadow-lg`}
      >
        {invite.inviter_name.slice(0, 1).toUpperCase() || "?"}
      </span>

      <div>
        <h1 className="text-xl font-black">
          {invite.inviter_name || "A friend"} invited you to Splitzy
        </h1>
        {invite.group_name && (
          <p className="mt-1 text-sm font-semibold text-muted">
            to split bills in {invite.group_emoji} {invite.group_name}
          </p>
        )}
      </div>

      {invite.accepted ? (
        <p className="font-bold text-muted">This invite has already been used.</p>
      ) : invite.expired ? (
        <p className="font-bold text-muted">This invite link has expired — ask for a new one.</p>
      ) : (
        <AcceptInviteButton code={code} />
      )}

      <Link href="/login" className="text-sm font-bold text-primary">
        Have an account already? Sign in →
      </Link>
    </main>
  );
}
