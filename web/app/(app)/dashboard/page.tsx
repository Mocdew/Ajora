import type { Metadata } from "next";
import { SavingsHome } from "@/components/savings/home";
export const metadata: Metadata = { title: "Home" };
export default function DashboardPage() {
  return <SavingsHome />;
}
