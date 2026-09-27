"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentSummaryView } from "@/lib/client/types";

export function AgentPicker({
  agents,
  value,
  onChange,
  needsVision,
}: {
  agents: AgentSummaryView[];
  value: string;
  onChange: (id: string) => void;
  needsVision: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const current = agents.find((a) => a.id === value);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const grouped = useMemo(() => {
    const filtered = agents.filter((a) =>
      `${a.name} ${a.tagline} ${a.category}`.toLowerCase().includes(query.toLowerCase()),
    );
    const map = new Map<string, AgentSummaryView[]>();
    for (const agent of filtered) {
      const list = map.get(agent.category) ?? [];
      list.push(agent);
      map.set(agent.category, list);
    }
    return [...map.entries()];
  }, [agents, query]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-line bg-panel2 px-3 py-2 text-sm hover:border-accent/60"
      >
        <span className="text-base">{current?.emoji ?? "\u{2728}"}</span>
        <span className="font-medium">{current?.name ?? "Agent"}</span>
        <span className="text-muted">v</span>
      </button>

      {open ? (
        <div className="absolute left-0 z-30 mt-2 w-[min(420px,88vw)] overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
          <div className="border-b border-line p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents..."
              className="w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {grouped.map(([category, list]) => (
              <div key={category} className="mb-2">
                <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted">{category}</div>
                {list.map((agent) => {
                  const disabled = needsVision && !agent.vision;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      disabled={disabled}
                      title={disabled ? "This agent cannot read images" : agent.description}
                      onClick={() => {
                        onChange(agent.id);
                        setOpen(false);
                      }}
                      className={`flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-panel2 ${agent.id === value ? "bg-panel2" : ""}`}
                    >
                      <span className="text-lg leading-6">{agent.emoji}</span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {agent.name}
                          {agent.vision ? <span className="text-[10px] text-accent">vision</span> : null}
                        </span>
                        <span className="block truncate text-xs text-muted">{agent.tagline}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            {grouped.length === 0 ? <p className="p-3 text-sm text-muted">No agent matches.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
