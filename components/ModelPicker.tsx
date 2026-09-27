"use client";

import { useEffect, useRef, useState } from "react";
import type { Rung } from "@/lib/client/types";

export function ModelPicker({
  chain,
  provider,
  model,
  privacy,
  onChange,
}: {
  chain: Rung[];
  provider: string;
  model: string;
  privacy: boolean;
  onChange: (next: { provider: string; model: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const isAuto = provider === "auto" && model === "auto";
  const label = isAuto ? "Auto fallback chain" : `${provider} \u00B7 ${model}`;

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-line bg-panel2 px-3 py-2 text-sm hover:border-accent/60"
      >
        <span className="text-muted">{privacy ? "\u{1F512}" : "\u{1F9E0}"}</span>
        <span className="max-w-[190px] truncate font-medium">{label}</span>
        <span className="text-muted">v</span>
      </button>

      {open ? (
        <div className="absolute left-0 z-30 mt-2 w-[min(420px,88vw)] overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
          <button
            type="button"
            onClick={() => {
              onChange({ provider: "auto", model: "auto" });
              setOpen(false);
            }}
            className={`flex w-full flex-col items-start gap-1 px-3 py-3 text-left hover:bg-panel2 ${isAuto ? "bg-panel2" : ""}`}
          >
            <span className="text-sm font-medium">Auto \u2014 walk the whole chain</span>
            <span className="text-xs text-muted">
              Tries each rung in order and stops at the first that answers, so a quota error never blocks you.
            </span>
          </button>
          <div className="border-t border-line px-3 py-2 text-[11px] uppercase tracking-wider text-muted">
            {privacy ? "Privacy mode: Gemini only" : "Pin a rung"}
          </div>
          <div className="max-h-[46vh] overflow-y-auto pb-2">
            {chain.map((rung, index) => {
              const pinned = provider === rung.provider && model === rung.model;
              const blockedByPrivacy = privacy && rung.provider !== "gemini";
              const disabled = !rung.available || blockedByPrivacy;
              return (
                <button
                  key={`${rung.provider}-${rung.model}-${index}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange({ provider: rung.provider, model: rung.model });
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-panel2 ${pinned ? "bg-panel2" : ""}`}
                  title={blockedByPrivacy ? "Privacy mode only routes to Gemini" : rung.available ? rung.endpoint : "No API key configured"}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {index + 1}. {rung.label} \u00B7 {rung.model}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {rung.note ?? (rung.vision ? "reads images" : "text only")}
                    </span>
                  </span>
                  <span className={`shrink-0 text-[11px] ${rung.available ? (blockedByPrivacy ? "text-amber-300" : "text-emerald-300") : "text-muted/60"}`}>
                    {blockedByPrivacy ? "privacy" : rung.available ? "ready" : "no key"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
