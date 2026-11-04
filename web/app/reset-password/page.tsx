import type { Metadata } from "next";
import { ResetPasswordPage } from "@/components/savings/account-email";

export const metadata: Metadata = { title: "Reset password", referrer: "no-referrer", robots: { index: false, follow: false } };

export default function Page() {
  return <ResetPasswordPage />;
}
