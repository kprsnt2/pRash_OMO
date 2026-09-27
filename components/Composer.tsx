"use client";

import { useRef, useState } from "react";
import { TOTAL_ATTACHMENT_BYTES, attachmentsBudget, humanSize, readPickedFiles, type PickedFile } from "@/lib/client/files";

const ACCEPT =
  "image/*,.pdf,.txt,.md,.markdown,.csv,.json,.log,.xml,.html,.yml,.yaml,.ts,.tsx,.js,.py,.sql,application/pdf,text/plain,text/csv,application/json";

export function Composer({
  onSend,
  onStop,
  busy,
  disabled,
  disabledReason,
  starters,
  onStarter,
}: {
  onSend: (text: string, files: PickedFile[]) => void;
  onStop: () => void;
  busy: boolean;
  disabled: boolean;
  disabledReason?: string;
  starters: string[];
  onStarter: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function addFiles(incoming: FileList | File[]) {
    if (disabled) return;
    const list = Array.from(incoming);
    if (list.length === 0) return;
    try {
      const picked = await readPickedFiles(list);
      setFiles((previous) => {
        const next = [...previous, ...picked];
        const budget = attachmentsBudget(next);
        if (!budget.ok) {
          setNotice(`That would be ${humanSize(budget.total)} - keep the total under ${humanSize(TOTAL_ATTACHMENT_BYTES)}.`);
          return previous;
        }
        setNotice("");
        return next;
      });
    } catch {
      setNotice("Could not read one of those files.");
    }
  }

  function submit() {
    const hasText = text.trim().length > 0;
    if ((!hasText && files.length === 0) || busy || disabled) return;
    onSend(text, files);
    setText("");
    setFiles([]);
    setNotice("");
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div
      className="relative border-t border-line bg-panel/60 px-3 pb-3 pt-3 backdrop-blur sm:px-5"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void addFiles(e.dataTransfer.files);
      }}
    >
      {disabled && disabledReason ? (
        <p className="mx-auto mb-2 max-w-3xl rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          {disabledReason}
        </p>
      ) : null}

      {files.length > 0 ? (
        <div className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-2">
          {files.map((file) => (
            <span key={file.id} className="chip">
              {file.kind === "image" && file.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.previewUrl} alt={file.name} className="h-6 w-6 rounded object-cover" />
              ) : (
                <span className="text-ink">{file.kind === "pdf" ? "PDF" : "TXT"}</span>
              )}
              <span className="max-w-[180px] truncate">{file.name}</span>
              <span className="text-muted/70">{humanSize(file.size)}</span>
              <button
                type="button"
                className="text-muted hover:text-red-300"
                onClick={() => setFiles((prev) => prev.filter((f) => f.id !== file.id))}
                aria-label={`remove ${file.name}`}
              >
                x
              </button>
            </span>
          ))}
          <span className="text-[11px] text-muted">
            {files.length} file(s) \u00B7 {humanSize(totalSize)}
          </span>
        </div>
      ) : null}

      {starters.length > 0 && text.length === 0 && files.length === 0 ? (
        <div className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-2">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => onStarter(starter)}
              className="rounded-full border border-line bg-panel2 px-3 py-1 text-xs text-muted hover:border-accent/50 hover:text-ink"
            >
              {starter.length > 62 ? `${starter.slice(0, 62)}...` : starter}
            </button>
          ))}
        </div>
      ) : null}

      {notice ? <p className="mx-auto mb-2 max-w-3xl text-xs text-amber-300">{notice}</p> : null}

      <div
        className={`mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border bg-panel2 p-2 transition ${dragging ? "border-accent" : "border-line"}`}
      >
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          title="Attach files - as many as you like"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line text-muted hover:border-accent/60 hover:text-ink"
        >
          <span className="text-lg leading-none">+</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          aria-label="attach files"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <textarea
          value={text}
          disabled={disabled}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const pasted = Array.from(e.clipboardData.files);
            if (pasted.length > 0) {
              e.preventDefault();
              void addFiles(pasted);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={disabled ? "Add an API key to start chatting" : "Message your agent...  (Enter to send, Shift+Enter for a new line, paste or drop files)"}
          className="max-h-52 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-[15px] leading-6 outline-none placeholder:text-muted/70"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="h-9 shrink-0 rounded-xl border border-red-400/50 px-3 text-sm font-medium text-red-300 hover:bg-red-400/10"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={disabled || (text.trim().length === 0 && files.length === 0)}
            className="h-9 shrink-0 rounded-xl bg-accent px-3 text-sm font-semibold text-[#04231f] hover:brightness-110"
          >
            Send
          </button>
        )}
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-[11px] text-muted/70">
        Attachments: images, PDFs and text files, many at once. PDFs and text are extracted on the server before the model sees them.
      </p>
    </div>
  );
}
