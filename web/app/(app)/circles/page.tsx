import type { Metadata } from "next";
import { SavingsCircles } from "@/components/savings/circles";
export const metadata: Metadata = { title: "My circles" };
export default function CirclesPage() {
  return <SavingsCircles />;
}
