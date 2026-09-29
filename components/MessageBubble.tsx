"use client";

import { useEffect, useState } from "react";
import { Markdown } from "./Markdown";
import type { UiMessage } from "@/lib/client/types";
import { humanSize } from "@/lib/client/files";
import { cancelSpeech, isSpeechSynthesisSupported, speakText } from "@/lib/client/speech";
import { WorksheetPrintModal } from "./WorksheetPrintModal";

function AttachmentChips({ message }: { message: UiMessage }) {
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a) =>
        a.kind === "image" && a.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={a.id} src={a.previewUrl} alt={a.name} className="h-20 w-20 rounded-lg border border-line object-cover" />
        ) : (
          <span key={a.id} className="chip text-muted">
            <span className="text-ink">{a.kind === "pdf" ? "PDF" : "TXT"}</span>
            {a.name}
            <span className="text-muted/70">{humanSize(a.size)}</span>
          </span>
        ),
      )}
    </div>
  );
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

function routingExplanation(message: UiMessage): string {
  const failed = (message.attempts ?? []).filter((a) => !a.ok);
  const skipped = message.skipped ?? [];
  if (failed.length === 0 && skipped.length === 0) return "";
  const parts = [
    ...failed.map(
      (f) => `${f.provider} ${f.model}${f.status ? ` (HTTP ${f.status})` : ""}: ${f.error ?? "failed"} after ${formatMs(f.ms)}`,
    ),
    ...skipped.map((s) => `${s.provider}: ${s.reason}`),
  ];
  return `Auto-routed past ${parts.length} option(s) before this answer - ${parts.join("; ")}.`;
}

export function MessageBubble({
  message,
  streaming,
  agentName,
}: {
  message: UiMessage;
  streaming?: boolean;
  agentName?: string;
}) {
  const isUser = message.role === "user";
  const served = message.served;
  const failures = (message.attempts ?? []).filter((a) => !a.ok);
  const [canSpeak, setCanSpeak] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    setCanSpeak(isSpeechSynthesisSupported());
    return () => cancelSpeech();
  }, []);

  function toggleSpeech() {
    if (speaking) {
      cancelSpeech();
      setSpeaking(false);
      return;
    }
    if (speakText(message.content, { onEnd: () => setSpeaking(false) })) setSpeaking(true);
  }
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-panel2 text-sm">
          {served ? "\u{1F916}" : "\u{2728}"}
        </div>
      ) : null}
      <div className={`max-w-[min(980px,94%)] rounded-2xl border px-4 py-3 ${isUser ? "border-accent2/30 bg-accent2/10" : "border-line bg-panel/70"}`}>
        {isUser ? (
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</div>
        ) : message.content ? (
          <Markdown text={message.content} />
        ) : (
          <div className="text-sm text-muted">{message.error ? "" : "Thinking..."}</div>
        )}
        {streaming ? <span className="caret ml-1" /> : null}
        <AttachmentChips message={message} />

        {message.error ? (
          <div className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {message.error}
            {failures.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-xs text-red-200/80">
                {failures.map((f, i) => (
                  <li key={`${f.provider}-${i}`}>
                    {f.provider} / {f.model}: {f.status ? `HTTP ${f.status}` : ""} {f.error?.slice(0, 140)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {served ? (
          <div className="mt-3 border-t border-line/70 pt-2 text-[11px] text-muted">
            <div className="flex flex-wrap items-center gap-2">
              {agentName ? <span>{agentName}</span> : null}
              <span className={`chip ${failures.length ? "border-amber-400/40 text-amber-200" : "border-emerald-400/30 text-emerald-200"}`}>
                {served.label} {"\u00B7"} {served.model}
              </span>
              {message.elapsedMs !== undefined ? <span>{formatMs(message.elapsedMs)}</span> : null}
              {message.content.length > 0 ? (
                <span title="Estimated from the reply length until the provider reports exact usage">
                  {message.content.length} chars {"\u00B7"} {"\u2248"} {estimateTokens(message.content)} tokens
                </span>
              ) : null}
              {canSpeak && message.content.length > 0 ? (
                <button
                  type="button"
                  onClick={toggleSpeech}
                  className="rounded-md border border-line px-2 py-0.5 text-muted hover:border-accent/50 hover:text-ink"
                  title={speaking ? "Stop reading aloud" : "Read this reply aloud"}
                >
                  {speaking ? "stop" : "listen"}
                </button>
              ) : null}
              {message.content.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setPrinting(true)}
                  className="rounded-md border border-line px-2 py-0.5 text-muted hover:border-accent/50 hover:text-ink"
                  title="Open a print-ready sheet - worksheets print with or without their answer key"
                >
                  print
                </button>
              ) : null}
            </div>
            {routingExplanation(message) ? <p className="mt-1 leading-relaxed">{routingExplanation(message)}</p> : null}
          </div>
        ) : null}
      </div>
      {printing ? <WorksheetPrintModal content={message.content} onClose={() => setPrinting(false)} /> : null}
    </div>
  );
}
