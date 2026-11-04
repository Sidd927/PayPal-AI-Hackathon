"use client";
import { createContext, useCallback, useContext, useState } from "react";

type Toast = { id: number; text: string; kind: "ok" | "error" | "info" };
const Ctx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

/** Polite, auto-dismissing confirmations. Errors stay until dismissed. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    if (kind !== "error") setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,460px)] -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start justify-between gap-3 rounded-[var(--radius-soft)] px-4 py-3 text-sm shadow-[0_8px_24px_rgba(23,49,42,0.18)] ${t.kind === "error" ? "bg-alert text-surface" : "bg-ink text-surface"}`}
          >
            <span>{t.text}</span>
            <button className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
