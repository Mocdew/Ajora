"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { engineGet } from "@/lib/api/engine";
import { useRouter } from "next/navigation";
import { Plus, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import {
  useCircles,
  useSavingsAction,
  type SavingsSession,
  type InvitationPreview,
} from "@/lib/api/savings";
import {
  CircleCard,
  ErrorNotice,
  Loading,
  SavingsGate,
  TrackingNote,
  inputClass,
  localToday,
} from "./shared";

function Circles({ session }: { session: SavingsSession }) {
  const circles = useCircles(session.user_id);
  const action = useSavingsAction();
  const router = useRouter();
  const [form, setForm] = useState<"create" | "join" | null>(null);
  const [localError, setLocalError] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("invite"))
      setForm("join");
  }, []);
  return (
    <>
      <PageHeader
        eyebrow="Ajo & esusu"
        title="My circles"
        description="A shared commitment. A clear contribution. A turn for everyone."
        actions={
          <>
            <button
              className="btn-secondary"
              onClick={() => {
                setForm("join");
                action.reset();
                setLocalError("");
              }}
            >
              Join a circle
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setForm("create");
                action.reset();
                setLocalError("");
              }}
            >
              <Plus className="h-4 w-4" />
              Create a circle
            </button>
          </>
        }
      />
      {form && (
        <section
          className="card-soft mb-8 border border-border p-6"
          aria-label={form === "create" ? "Create a circle" : "Join a circle"}
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {form === "create"
                ? "Start your savings circle"
                : "Join your people"}
            </h2>
            <button
              className="btn-secondary"
              onClick={() => setForm(null)}
              disabled={action.isPending}
            >
              Cancel
            </button>
          </div>
          <>
            {form === "join" ? (
              <JoinCircle onJoined={(id) => router.push(`/circles/${id}`)} />
            ) : (
              <form
                className="space-y-5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const values = new FormData(e.currentTarget);
                  setLocalError("");
                  try {
                    let body: unknown;
                    if (form === "create") {
                      const amountText = String(values.get("amount"));
                      if (!/^\d+(\.\d{1,2})?$/.test(amountText)) {
                        setLocalError(
                          "Enter a contribution amount with no more than two decimal places.",
                        );
                        return;
                      }
                      const amount = Math.round(Number(amountText) * 100);
                      if (!Number.isSafeInteger(amount) || amount <= 0) {
                        setLocalError("Enter a valid contribution amount.");
                        return;
                      }
                      body = {
                        name: values.get("name"),
                        contribution_kobo: amount,
                        frequency: values.get("frequency"),
                        member_limit: Number(values.get("member_limit")),
                        start_date: values.get("start_date"),
                        rules: values.get("rules"),
                      };
                    } else
                      body = {
                        invite_code: String(values.get("invite_code")).trim(),
                      };
                    const circle = await action.mutateAsync({
                      path: form === "create" ? "/circles" : "/join",
                      body,
                    });
                    router.push(`/circles/${circle.id}`);
                  } catch {
                    /* shown below */
                  }
                }}
              >
                {form === "create" ? (
                  <>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <label className="block text-sm font-medium">
                        Circle name
                        <input
                          className={inputClass}
                          name="name"
                          required
                          minLength={2}
                          maxLength={100}
                          placeholder="e.g. Market Friends"
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        Contribution per person (₦)
                        <input
                          className={inputClass}
                          name="amount"
                          type="number"
                          required
                          min="0.01"
                          max="1000000000"
                          step="0.01"
                          placeholder="10000"
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        Contribution frequency
                        <select name="frequency" className={inputClass}>
                          <option value="monthly">Monthly</option>
                          <option value="weekly">Weekly</option>
                        </select>
                      </label>
                      <label className="block text-sm font-medium">
                        Number of members
                        <input
                          name="member_limit"
                          className={inputClass}
                          type="number"
                          required
                          min={2}
                          max={50}
                          defaultValue={5}
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        First contribution date
                        <input
                          name="start_date"
                          className={inputClass}
                          type="date"
                          required
                          min={localToday()}
                          defaultValue={localToday()}
                        />
                      </label>
                    </div>
                    <label className="block text-sm font-medium">
                      Circle rules
                      <textarea
                        name="rules"
                        className={inputClass}
                        required
                        maxLength={2000}
                        rows={3}
                        placeholder="Agree how to pay, when contributions are due, and what happens if someone is late."
                      />
                    </label>
                    <p className="text-xs text-muted-foreground">
                      You will be the organiser and first member. Invite
                      everyone, agree the payout order, then start the circle.
                      Membership and payout order lock when it starts.
                    </p>
                  </>
                ) : (
                  <label className="block max-w-lg text-sm font-medium">
                    Invite code
                    <input
                      name="invite_code"
                      className={inputClass}
                      required
                      maxLength={100}
                      autoComplete="off"
                      placeholder="Paste your circle’s invite code"
                    />
                    <span className="mt-2 block text-xs text-muted-foreground">
                      Ask the organiser for the private code. You can review the
                      rules and payout order inside the circle before it starts.
                    </span>
                  </label>
                )}
                <ErrorNotice
                  error={localError ? new Error(localError) : action.error}
                />
                <button className="btn-primary" disabled={action.isPending}>
                  {action.isPending
                    ? "Saving…"
                    : form === "create"
                      ? "Create circle"
                      : "Join circle"}
                </button>
              </form>
            )}
          </>
        </section>
      )}
      {circles.isPending ? (
        <Loading />
      ) : circles.error ? (
        <ErrorNotice error={circles.error} retry={() => circles.refetch()} />
      ) : circles.data?.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {circles.data.map((c) => (
            <CircleCard key={c.id} circle={c} />
          ))}
        </div>
      ) : (
        <div className="card-soft p-10 text-center">
          <UsersThree className="mx-auto h-10 w-10 text-accent" />
          <h2 className="mt-4 text-xl font-semibold">No circles yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a circle with people you trust, or enter an invite code to
            join theirs.
          </p>
        </div>
      )}
      <TrackingNote />
    </>
  );
}
export function SavingsCircles() {
  return (
    <SavingsGate>{(session) => <Circles session={session} />}</SavingsGate>
  );
}

function JoinCircle({ onJoined }: { onJoined: (id: string) => void }) {
  const [code, setCode] = useState("");
  useEffect(() => {
    const invitation = new URLSearchParams(window.location.search).get(
      "invite",
    );
    if (invitation) setCode(invitation);
  }, []);
  const [accepted, setAccepted] = useState(false);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const lookup = useMutation({
    mutationFn: () =>
      engineGet<InvitationPreview>(
        `/savings/invitations/${encodeURIComponent(code.trim())}`,
      ),
    onSuccess: (data) => {
      setPreview(data);
      setAccepted(false);
    },
  });
  const join = useSavingsAction();
  return (
    <div className="space-y-5">
      <form
        className="flex flex-col items-start gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          lookup.mutate();
        }}
      >
        <label className="block min-w-0 flex-1 text-sm font-medium">
          Invite code
          <input
            className={inputClass}
            value={code}
            disabled={lookup.isPending || join.isPending}
            onChange={(e) => {
              setCode(e.target.value);
              setPreview(null);
              setAccepted(false);
              lookup.reset();
              join.reset();
            }}
            required
            maxLength={100}
            autoComplete="off"
            placeholder="Paste your circle’s invite code"
          />
        </label>
        <button
          className="btn-secondary"
          disabled={lookup.isPending || !code.trim()}
        >
          {lookup.isPending ? "Finding circle…" : "Review invitation"}
        </button>
      </form>
      <ErrorNotice error={lookup.error ?? join.error} />
      {preview && (
        <form
          className="panel-inset space-y-4 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const circle = await join.mutateAsync({
                path: "/join",
                body: { invite_code: code.trim() },
              });
              onJoined(circle.id);
            } catch {
              /* shown above */
            }
          }}
        >
          <h3 className="text-xl font-semibold">{preview.name}</h3>
          <p className="text-sm text-muted-foreground">
            {new Intl.NumberFormat("en-NG", {
              style: "currency",
              currency: "NGN",
              maximumFractionDigits: 2,
            }).format(preview.contribution_kobo / 100)}{" "}
            per member · {preview.frequency} · {preview.member_count}/
            {preview.member_limit} members
          </p>
          <p className="text-sm text-muted-foreground">
            First contribution: {preview.start_date}
          </p>
          <div>
            <p className="text-sm font-semibold">Circle rules</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {preview.rules}
            </p>
          </div>
          {preview.status !== "draft" ||
          preview.member_count >= preview.member_limit ? (
            <p role="status" className="text-sm text-muted-foreground">
              This circle is no longer accepting members.
            </p>
          ) : (
            <>
              <label className="flex items-start gap-3 text-sm">
                <input
                  className="mt-1 h-4 w-4 accent-accent"
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  required
                />
                <span>
                  I have reviewed the contribution amount, schedule, and rules
                  and agree to join this circle.
                </span>
              </label>
              <button
                className="btn-primary"
                disabled={!accepted || join.isPending}
              >
                {join.isPending ? "Joining…" : "Accept and join circle"}
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
