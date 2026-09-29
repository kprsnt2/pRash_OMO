"use client";

import { useEffect, useRef, useState } from "react";
import type { ModelGroupView, Rung } from "@/lib/client/types";

export function ModelPicker({
  chain,
  models,
  provider,
  model,
  privacy,
  onChange,
}: {
  chain: Rung[];
  models: ModelGroupView[];
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
        <div className="absolute left-0 z-30 mt-2 w-[min(460px,90vw)] overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
          <button
            type="button"
            onClick={() => {
              onChange({ provider: "auto", model: "auto" });
              setOpen(false);
            }}
            className={`flex w-full flex-col items-start gap-1 px-3 py-3 text-left hover:bg-panel2 ${isAuto ? "bg-panel2" : ""}`}
          >
            <span className="text-sm font-medium">{"Auto \u2014 walk the whole chain"}</span>
            <span className="text-xs text-muted">
              {privacy
                ? "Privacy mode: only the Gemini rung is tried."
                : `Tries ${chain.filter((r) => r.available).map((r) => r.model).join(" \u2192 ") || "each configured rung"} in order and stops at the first that answers, so a quota error never blocks you.`}
            </span>
          </button>
          <div className="border-t border-line px-3 py-2 text-[11px] uppercase tracking-wider text-muted">
            {privacy ? "Privacy mode: Gemini only" : "Pin a specific model"}
          </div>
          <div className="max-h-[56vh] overflow-y-auto pb-2">
            {models.map((group) => {
              const blockedByPrivacy = privacy && group.provider !== "gemini";
              const disabled = !group.available || blockedByPrivacy;
              return (
                <div key={group.provider} className="mb-1">
                  <div className="flex items-center justify-between px-3 pb-1 pt-2">
                    <span className="text-[11px] uppercase tracking-wider text-muted">{group.label}</span>
                    <span className={`text-[11px] ${group.available ? (blockedByPrivacy ? "text-amber-300" : "text-emerald-300") : "text-muted/60"}`}>
                      {blockedByPrivacy ? "privacy mode" : group.available ? "key set" : "no key"}
                    </span>
                  </div>
                  {group.models.map((candidate) => {
                    const pinned = provider === group.provider && model === candidate;
                    const isPrimary = group.primary === candidate;
                    return (
                      <button
                        key={`${group.provider}-${candidate}`}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          onChange({ provider: group.provider, model: candidate });
                          setOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-panel2 ${pinned ? "bg-panel2" : ""} ${disabled ? "opacity-50" : ""}`}
                        title={
                          blockedByPrivacy
                            ? "Privacy mode only routes to Gemini"
                            : group.available
                              ? "Other providers stay in the chain as fallback"
                              : "No API key configured for this provider"
                        }
                      >
                        <span className="min-w-0 truncate text-sm">{candidate}</span>
                        {isPrimary ? (
                          <span className="shrink-0 rounded-md border border-accent/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent">
                            default
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
