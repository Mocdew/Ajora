import type { Metadata } from "next";
import { ForgotPasswordPage } from "@/components/savings/account-email";

export const metadata: Metadata = { title: "Forgot password", referrer: "no-referrer", robots: { index: false, follow: false } };

export default function Page() {
  return <ForgotPasswordPage />;
}
