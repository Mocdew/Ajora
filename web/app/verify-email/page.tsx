import type { Metadata } from "next";
import { VerifyEmailPage } from "@/components/savings/account-email";

export const metadata: Metadata = { title: "Verify email", referrer: "no-referrer", robots: { index: false, follow: false } };

export default function Page() {
  return <VerifyEmailPage />;
}
