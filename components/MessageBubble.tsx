"use client";

import { Markdown } from "./Markdown";
import type { UiMessage } from "@/lib/client/types";
import { humanSize } from "@/lib/client/files";

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

export function MessageBubble({ message, streaming }: { message: UiMessage; streaming?: boolean }) {
  const isUser = message.role === "user";
  const served = message.served;
  const failures = (message.attempts ?? []).filter((a) => !a.ok);
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-panel2 text-sm">
          {served ? "\u{1F916}" : "\u{2728}"}
        </div>
      ) : null}
      <div className={`max-w-[min(760px,88%)] rounded-2xl border px-4 py-3 ${isUser ? "border-accent2/30 bg-accent2/10" : "border-line bg-panel/70"}`}>
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
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span className={`chip ${failures.length ? "border-amber-400/40 text-amber-200" : "border-emerald-400/30 text-emerald-200"}`}>
              {served.label} \u00B7 {served.model}
            </span>
            {failures.length > 0 ? <span>{failures.length} provider(s) failed before this one</span> : null}
            {(message.skipped ?? []).length > 0 ? (
              <span title={(message.skipped ?? []).map((s) => `${s.provider}: ${s.reason}`).join("\n")}>
                {(message.skipped ?? []).length} rung(s) skipped
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
