"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentPicker } from "./AgentPicker";
import { Composer } from "./Composer";
import { MessageBubble } from "./MessageBubble";
import { ModelPicker } from "./ModelPicker";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { readChatStream } from "@/lib/client/sse";
import { cancelSpeech, primeVoices, speakText } from "@/lib/client/speech";
import type { ConfigResponse, UiMessage } from "@/lib/client/types";
import type { PickedFile } from "@/lib/client/files";
import {
  deleteConversation,
  downloadJson,
  exportConversations,
  listConversations,
  saveConversation,
  type StoredConversation,
  type StoredMessage,
} from "@/lib/storage/local";

const VOICE_KEY = "onechat.voice";

const EMPTY_CONFIG: ConfigResponse = {
  agents: [],
  chain: [],
  models: [],
  privacySafeProviders: [],
  authRequired: false,
  anyProviderKey: true,
};

function titleFor(messages: UiMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New chat";
  const text = first.content.trim() || first.attachments?.[0]?.name || "Attachment";
  return text.length > 42 ? `${text.slice(0, 42)}...` : text;
}

function toStored(messages: UiMessage[]): StoredMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    attachments: (m.attachments ?? []).map((a) => ({ id: a.id, name: a.name, mime: a.mime, kind: a.kind, size: a.size, text: a.text })),
    served: m.served,
    attempts: m.attempts,
    skipped: m.skipped,
    error: m.error,
    elapsedMs: m.elapsedMs,
    agentId: m.agentId,
    createdAt: m.createdAt,
  }));
}

function fromStored(stored: StoredMessage[]): UiMessage[] {
  return stored.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    attachments: (m.attachments ?? []).map((a) => ({ ...a })),
    served: m.served,
    attempts: m.attempts,
    skipped: m.skipped,
    error: m.error,
    elapsedMs: m.elapsedMs,
    agentId: m.agentId,
    createdAt: m.createdAt,
  }));
}

export function ChatApp() {
  const [config, setConfig] = useState<ConfigResponse>(EMPTY_CONFIG);
  const [configError, setConfigError] = useState("");
  const [agentId, setAgentId] = useState("assistant");
  const [provider, setProvider] = useState("auto");
  const [model, setModel] = useState("auto");
  const [privacy, setPrivacy] = useState(false);
  const [voice, setVoice] = useState(false);
  const voiceRef = useRef(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef("");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setActiveId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    let wanted = false;
    try {
      wanted = localStorage.getItem(VOICE_KEY) === "on";
    } catch {
      /* private mode: voice defaults to off each visit */
    }
    setVoice(wanted);
    voiceRef.current = wanted;
    if (wanted) primeVoices();
  }, []);

  const toggleVoice = useCallback(() => {
    const next = !voiceRef.current;
    voiceRef.current = next;
    setVoice(next);
    try {
      localStorage.setItem(VOICE_KEY, next ? "on" : "off");
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    if (next) primeVoices();
    else cancelSpeech();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: ConfigResponse) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) setConfigError("Could not load /api/config - is the server running?");
      });
    listConversations().then((list) => {
      if (!cancelled) setConversations(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const agent = useMemo(
    () => config.agents.find((a) => a.id === agentId) ?? config.agents[0],
    [config.agents, agentId],
  );
  const needsVision = messages.some((m) => (m.attachments ?? []).some((a) => a.kind === "image"));

  const flush = useCallback((id: string) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const chunk = bufferRef.current;
    bufferRef.current = "";
    if (!chunk) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: m.content + chunk } : m)));
  }, []);

  const pushDelta = useCallback(
    (id: string, text: string) => {
      bufferRef.current += text;
      if (timerRef.current === null) {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          const chunk = bufferRef.current;
          bufferRef.current = "";
          if (chunk) setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: m.content + chunk } : m)));
        }, 55);
      }
    },
    [],
  );

  const persist = useCallback(
    async (finalMessages: UiMessage[], forAgent: string) => {
      if (privacy || finalMessages.length === 0) return;
      const conversation: StoredConversation = {
        id: activeId,
        title: titleFor(finalMessages),
        agentId: forAgent,
        model,
        provider,
        mode: privacy ? "privacy" : "normal",
        createdAt: conversations.find((c) => c.id === activeId)?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        messages: toStored(finalMessages),
      };
      await saveConversation(conversation);
      const list = await listConversations();
      setConversations(list);
    },
    [activeId, conversations, model, privacy, provider],
  );

  const send = useCallback(
    async (text: string, files: PickedFile[]) => {
      if (busy) return;
      const userMessage: UiMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
        attachments: files.map((f) => ({
          id: f.id,
          name: f.name,
          mime: f.mime,
          kind: f.kind,
          size: f.size,
          base64: f.base64,
          previewUrl: f.previewUrl,
        })),
        createdAt: Date.now(),
      };
      const assistantId = crypto.randomUUID();
      const history = messages;
      const nextMessages: UiMessage[] = [
        ...history,
        userMessage,
        { id: assistantId, role: "assistant", content: "", agentId, createdAt: Date.now() },
      ];
      setMessages(nextMessages);
      setBusy(true);
      setStreamingId(assistantId);
      const startedAt = Date.now();
      const controller = new AbortController();
      abortRef.current = controller;

      const payload = {
        agentId,
        provider,
        model,
        mode: privacy ? "privacy" : "normal",
        messages: [...history, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
          attachments: (m.attachments ?? []).map((a) =>
            a.base64
              ? { name: a.name, mime: a.mime, base64: a.base64, id: a.id, size: a.size }
              : { name: a.name, mime: a.mime, kind: a.kind, size: a.size, text: a.text ?? "", id: a.id },
          ),
        })),
      };

      let spoken = "";
      let served: UiMessage["served"];
      let attempts: UiMessage["attempts"];
      let skipped: UiMessage["skipped"];
      let streamError = "";
      let userAttachments = userMessage.attachments ?? [];
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
            attempts?: UiMessage["attempts"];
            skipped?: UiMessage["skipped"];
          };
          streamError = data.error ?? `Request failed (HTTP ${response.status})`;
          attempts = data.attempts;
          skipped = data.skipped;
          return;
        }

        for await (const event of readChatStream(response)) {
          if (event.type === "meta") {
            served = event.served;
            attempts = event.attempts;
            skipped = event.skipped;
          } else if (event.type === "extract") {
            userAttachments = userAttachments.map((a, index) => ({
              ...a,
              text: event.attachments[index]?.text ?? a.text,
              kind: event.attachments[index]?.kind ?? a.kind,
            }));
            setMessages((prev) => prev.map((m) => (m.id === userMessage.id ? { ...m, attachments: userAttachments } : m)));
          } else if (event.type === "delta") {
            spoken += event.text;
            pushDelta(assistantId, event.text);
          } else if (event.type === "error") {
            flush(assistantId);
            streamError = event.message;
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          if (!spoken) spoken = "_Stopped._";
        } else {
          streamError = error instanceof Error ? error.message : "network error";
        }
      } finally {
        flush(assistantId);
        setBusy(false);
        setStreamingId(null);
        abortRef.current = null;
        // Built from the collected stream rather than read back from a state updater, so what is
        // saved is exactly what the user saw.
        const finalMessages: UiMessage[] = [
          ...history,
          { ...userMessage, attachments: userAttachments },
          {
            id: assistantId,
            role: "assistant",
            content: spoken,
            served,
            attempts,
            skipped,
            error: streamError || undefined,
            elapsedMs: Date.now() - startedAt,
            agentId,
            createdAt: Date.now(),
          },
        ];
        setMessages(finalMessages);
        void persist(finalMessages, agentId);
        if (voiceRef.current && spoken) speakText(spoken);
      }
    },
    [agentId, busy, flush, messages, model, persist, privacy, provider, pushDelta],
  );

  const [draft, setDraft] = useState("");
  const consumeDraft = useCallback(() => setDraft(""), []);

  const starterTexts = agent?.starters ?? [];

  return (
    <div className="app-shell flex h-dvh overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        conversations={conversations}
        activeId={activeId}
        privacy={privacy}
        onClose={() => setSidebarOpen(false)}
        onNew={() => {
          setActiveId(crypto.randomUUID());
          setMessages([]);
          setSidebarOpen(false);
        }}
        onSelect={(id) => {
          const conversation = conversations.find((c) => c.id === id);
          if (!conversation) return;
          setActiveId(id);
          setMessages(fromStored(conversation.messages));
          setAgentId(conversation.agentId || "assistant");
          setProvider(conversation.provider || "auto");
          setModel(conversation.model || "auto");
          setSidebarOpen(false);
        }}
        onDelete={async (id) => {
          await deleteConversation(id);
          setConversations(await listConversations());
          if (id === activeId) {
            setActiveId(crypto.randomUUID());
            setMessages([]);
          }
        }}
        onExport={async () => downloadJson(await exportConversations(), `onechat-export-${Date.now()}.json`)}
        onExportOne={async (id) => {
          const all = await exportConversations();
          const one = all.find((c) => c.id === id);
          if (!one) return;
          const slug = one.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40);
          downloadJson([one], `onechat-${slug || "chat"}.json`);
        }}
        onImport={async (file) => {
          try {
            const parsed = JSON.parse(await file.text()) as StoredConversation[];
            for (const conversation of parsed) {
              await saveConversation(conversation);
            }
            setConversations(await listConversations());
          } catch {
            setConfigError("Could not import that file - expected a OneChat export.");
          }
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-40 flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-xl border border-line px-3 py-2 text-sm lg:hidden"
            aria-label="open chats"
          >
            =
          </button>
          <AgentPicker agents={config.agents} value={agentId} onChange={setAgentId} needsVision={needsVision} />
          <ModelPicker
            chain={config.chain}
            models={config.models}
            provider={provider}
            model={model}
            privacy={privacy}
            onChange={(next) => {
              setProvider(next.provider);
              setModel(next.model);
            }}
          />
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleVoice}
              aria-pressed={voice}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                voice ? "border-accent/60 bg-accent/10 text-accent" : "border-line bg-panel2 text-muted hover:text-ink"
              }`}
              title="Read every reply aloud"
            >
              <span aria-hidden>{voice ? "\u{1F50A}" : "\u{1F509}"}</span>
              <span className="hidden sm:inline">Voice</span>
            </button>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => {
                setPrivacy((v) => !v);
                setProvider("auto");
                setModel("auto");
              }}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                privacy ? "border-accent/60 bg-accent/10 text-accent" : "border-line bg-panel2 text-muted hover:text-ink"
              }`}
              title="Privacy mode routes only to Gemini (your paid key, no training on your data) and stops saving chats"
            >
              <span>{privacy ? "\u{1F512}" : "\u{1F513}"}</span>
              <span className="hidden sm:inline">Privacy mode</span>
              <span className="sm:hidden">{privacy ? "on" : "off"}</span>
            </button>
          </div>
        </header>

        {configError ? (
          <p className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">{configError}</p>
        ) : null}
        {!config.anyProviderKey ? (
          <p className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
            No provider API key is set yet. Copy .env.example to .env.local and add at least one key.
          </p>
        ) : null}
        {privacy ? (
          <p className="border-b border-accent/30 bg-accent/5 px-4 py-2 text-xs text-accent">
            Privacy mode: requests go only to Gemini, and this conversation is not saved anywhere.
          </p>
        ) : null}

        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-fade px-3 py-5 sm:px-6">
          <div className="flex w-full flex-col gap-5">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-line bg-panel/60 p-6">
                <div className="text-2xl">{agent?.emoji ?? "\u{2728}"}</div>
                <h1 className="mt-2 text-xl font-semibold">{agent?.name ?? "OneChat"}</h1>
                <p className="mt-1 text-sm text-muted">{agent?.tagline ?? "Pick an agent and start typing."}</p>
                <p className="mt-3 text-sm text-muted/90">{agent?.description}</p>
                <div className="mt-4 grid gap-2 text-xs text-muted">
                  <span>Model: {provider === "auto" ? "auto fallback chain" : `${provider} \u00B7 ${model}`}</span>
                  <span>Attach as many images, PDFs or text files as you need - each message can carry several.</span>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  streaming={streamingId === message.id}
                  agentName={config.agents.find((a) => a.id === (message.agentId ?? agentId))?.name}
                />
              ))
            )}
          </div>
        </div>

        <Composer
          agentName={agent?.name}
          onSend={send}
          onStop={() => abortRef.current?.abort()}
          busy={busy}
          disabled={!config.anyProviderKey}
          disabledReason={config.anyProviderKey ? undefined : "Add a provider key to .env.local, then restart the dev server."}
          starters={messages.length === 0 ? starterTexts : []}
          onStarter={setDraft}
          draft={draft}
          onDraftUsed={consumeDraft}
        />
      </main>
    </div>
  );
}
