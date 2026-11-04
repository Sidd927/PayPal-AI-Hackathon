import type { Metadata } from "next";
import { PayerPage } from "@/components/PayerPage";

export const metadata: Metadata = { title: "Your invoice", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PayerPage token={token} />;
}
