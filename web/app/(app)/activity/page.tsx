import type { Metadata } from "next";
import { SavingsActivity } from "@/components/savings/activity";
export const metadata: Metadata = { title: "Activity" };
export default function ActivityPage() {
  return <SavingsActivity />;
}
