"use client";

import { useRouter } from "next/navigation";
import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { useSavingsLogout, useSavingsSession } from "@/lib/api/savings";

export function AccountControl({ onNavigate }: { onNavigate: () => void }) {
  const session = useSavingsSession();
  const identity = session.data;
  const logout = useSavingsLogout();
  const router = useRouter();

  if (identity === null) {
    return <a href="/dashboard?login=1" onClick={onNavigate} className="btn-secondary shrink-0 px-4 sm:px-5">Log in</a>;
  }
  if (!identity) return null;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className="btn-secondary px-4 sm:px-5"
        aria-busy={logout.isPending}
        disabled={logout.isPending}
        onClick={() => {
          if (identity.email || window.confirm(
            "Sign out? Make sure you have saved your recovery key so you can return to your circles.",
          )) {
            logout.mutate(undefined, {
              onSuccess: () => {
                onNavigate();
                router.replace("/dashboard?login=1");
              },
            });
          }
        }}
      >
        <SignOut className="hidden h-4 w-4 sm:block" aria-hidden />
        Log out
      </button>
      {logout.error && (
        <div role="alert" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-card p-4 text-sm text-negative shadow-lg">
          {logout.error.message}
        </div>
      )}
    </div>
  );
}
