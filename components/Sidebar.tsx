"use client";

import { useRef } from "react";
import type { StoredConversation } from "@/lib/storage/local";

function when(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function Sidebar({
  open,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onExport,
  onExportOne,
  onImport,
  onClose,
  privacy,
}: {
  open: boolean;
  conversations: StoredConversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onExportOne: (id: string) => void;
  onImport: (file: File) => void;
  onClose: () => void;
  privacy: boolean;
}) {
  const importRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {open ? <button type="button" aria-label="close menu" className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={onClose} /> : null}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[280px] flex-col border-r border-line bg-panel/95 backdrop-blur transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <div className="text-lg font-semibold tracking-tight">OneChat</div>
            <div className="text-[11px] text-muted">agents {"\u00B7"} models {"\u00B7"} many attachments</div>
          </div>
          <button type="button" onClick={onClose} className="text-muted lg:hidden">
            x
          </button>
        </div>

        <div className="px-3">
          <button
            type="button"
            onClick={onNew}
            className="w-full rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20"
          >
            + New chat
          </button>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted">
              {privacy ? "Privacy mode: chats are not saved." : "No saved chats yet."}
            </p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`group mb-1 flex items-center gap-2 rounded-xl px-2 py-2 ${conversation.id === activeId ? "bg-panel2" : "hover:bg-panel2/60"}`}
              >
                <button type="button" onClick={() => onSelect(conversation.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm">{conversation.title || "Untitled"}</span>
                  <span className="block text-[11px] text-muted">
                    {conversation.mode === "privacy" ? "private \u00B7 " : ""}
                    {when(conversation.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onExportOne(conversation.id)}
                  className="text-muted opacity-0 transition group-hover:opacity-100 hover:text-accent"
                  aria-label="export this chat"
                  title="Download this chat as JSON - import it later to resume the session"
                >
                  {"\u2193"}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(conversation.id)}
                  className="text-muted opacity-0 transition group-hover:opacity-100 hover:text-red-300"
                  aria-label="delete chat"
                >
                  x
                </button>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-line p-3 text-xs text-muted">
          <div className="flex gap-2">
            <button type="button" onClick={onExport} className="flex-1 rounded-lg border border-line px-2 py-1.5 hover:border-accent/50">
              Export
            </button>
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="flex-1 rounded-lg border border-line px-2 py-1.5 hover:border-accent/50"
            >
              Import
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
                e.target.value = "";
              }}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted/70">
            Chats live in this browser only (IndexedDB). {privacy ? "Privacy mode is on - nothing is written to disk." : ""}
          </p>
        </div>
      </aside>
    </>
  );
}
