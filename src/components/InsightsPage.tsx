"use client";
import dynamic from "next/dynamic";
import { AppHeader } from "./AppHeader";
import { Spinner } from "./ui";

// AG Studio is browser-only and large; load it on this page only.
const Insights = dynamic(() => import("./Insights"), { ssr: false, loading: () => <Spinner label="Loading AG Studio" /> });

export function InsightsPage() {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6">
        <h1 className="font-display text-3xl text-ink">Insights</h1>
        <p className="mt-1 max-w-2xl text-ink-soft">
          Your receivables, the agent&rsquo;s actions and payments received, in an interactive report built with AG Studio. Click a chart segment to cross-filter, or build your own report.
        </p>
        <div className="mt-6">
          <Insights />
        </div>
      </main>
    </div>
  );
}
