import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { AjoraWordmark } from "@/components/ajora-wordmark";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 pb-24 pt-16">
      <Link href="/dashboard" aria-label="Ajora, go to dashboard" className="w-fit rounded-lg">
        <AjoraWordmark />
      </Link>
      <p className="eyebrow mt-16">404</p>
      <h1 className="text-hero mt-3 pb-1 text-5xl font-bold tracking-tighter">
        This page isn&rsquo;t here
      </h1>
      <p className="mt-4 max-w-prose text-base text-muted-foreground">
        The link may be old or mistyped. Your dashboard, transfers and audit log
        are all one step away.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link href="/dashboard" className="btn-primary text-base">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to your dashboard
        </Link>
        <Link href="/audit" className="link-accent">
          Open the audit log
        </Link>
      </div>
    </main>
  );
}
