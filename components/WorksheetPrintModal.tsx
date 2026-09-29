"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Markdown } from "./Markdown";
import { normalizeWorksheetMarkdown, splitWorksheet } from "@/lib/client/worksheet";

export function WorksheetPrintModal({
  content,
  agentName,
  onClose,
}: {
  content: string;
  agentName?: string;
  onClose: () => void;
}) {
  const parts = useMemo(() => splitWorksheet(content), [content]);
  const [showAnswers, setShowAnswers] = useState(parts.hasAnswerKey);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const printable = showAnswers && parts.hasAnswerKey ? content : parts.questions;

  async function copy() {
    try {
      await navigator.clipboard.writeText(printable);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setNote("Clipboard is blocked in this browser.");
    }
  }

  if (!mounted) return null;

  // A portal keeps the sheet out of the message scroller, whose CSS mask would otherwise clip it.
  return createPortal(
    <div className="print-overlay fixed inset-0 z-50 overflow-y-auto bg-black/80 p-2 sm:p-6">
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-3">
        <div className="print-hide flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel px-3 py-2">
          <span className="mr-auto text-sm font-medium">Worksheet preview</span>
          {parts.hasAnswerKey ? (
            <button
              type="button"
              onClick={() => setShowAnswers((v) => !v)}
              className="rounded-xl border border-line bg-panel2 px-3 py-1.5 text-sm text-muted hover:text-ink"
            >
              {showAnswers ? "Hide answer key" : "Show answer key"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={copy}
            className="rounded-xl border border-line bg-panel2 px-3 py-1.5 text-sm text-muted hover:text-ink"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:brightness-110"
          >
            Print / Save as PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line bg-panel2 px-3 py-1.5 text-sm text-muted hover:text-ink"
          >
            Close
          </button>
        </div>

        {note ? <p className="print-hide text-xs text-amber-300">{note}</p> : null}

        <div className="print-sheet rounded-2xl bg-white px-6 py-7 text-[#111] shadow-2xl sm:px-10 sm:py-9">
          <div className="mb-4 flex items-baseline justify-between border-b border-[#e5e7eb] pb-2">
            <span className="text-xs uppercase tracking-wider text-[#6b7280]">
              {agentName ? `${agentName} worksheet` : "Worksheet"}
            </span>
            <span className="text-xs text-[#6b7280]">Answer key {showAnswers && parts.hasAnswerKey ? "included" : "hidden"}</span>
          </div>
          <Markdown text={normalizeWorksheetMarkdown(parts.questions)} />
          {showAnswers && parts.hasAnswerKey ? (
            <div className="print-answers mt-8 border-t border-[#e5e7eb] pt-6">
              <Markdown text={normalizeWorksheetMarkdown(parts.answerKey)} />
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
