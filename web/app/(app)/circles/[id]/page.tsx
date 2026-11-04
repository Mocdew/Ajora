import type { Metadata } from "next";
import { CircleDetail } from "@/components/savings/circle-detail";
export const metadata: Metadata = { title: "Circle" };
export default async function CirclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CircleDetail id={id} />;
}
