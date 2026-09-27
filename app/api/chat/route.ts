import { AGENTS } from "@/lib/agents/registry";
import { extractAll } from "@/lib/attachments/extract";
import { envChain, type ChatMode } from "@/lib/providers/config";
import { AllProvidersFailedError, abortSignalFor, openFirstWorking } from "@/lib/providers/run";
import type { Attachment, ChatMessage, ChatRequest, ChainEntry } from "@/lib/providers/types";
import { planChain } from "@/lib/route/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IncomingAttachment {
  name: string;
  mime?: string;
  base64: string;
}

interface ChatBody {
  agentId?: string;
  model?: string;
  provider?: string;
  mode?: ChatMode;
  temperature?: number;
  messages: { role: ChatMessage["role"]; content: string; attachments?: IncomingAttachment[] }[];
}

const DEFAULT_SYSTEM =
  "You are a helpful, concise personal assistant. Answer in markdown. Use the user's language when they write in one.";

function systemPromptFor(agentId: string | undefined): { text: string; agent: { id: string; name: string; temperature?: number; maxTokens?: number } } {
  const agent = AGENTS.find((a) => a.id === agentId) ?? AGENTS[0];
  if (!agent) return { text: DEFAULT_SYSTEM, agent: { id: "default", name: "Assistant" } };
  return { text: agent.system, agent: { id: agent.id, name: agent.name, temperature: agent.temperature, maxTokens: agent.maxTokens } };
}

async function hydrateAttachments(messages: ChatBody["messages"]): Promise<ChatMessage[]> {
  return Promise.all(
    messages.map(async (m) => {
      const incoming = m.attachments ?? [];
      if (incoming.length === 0) return { role: m.role, content: m.content };
      const attachments: Attachment[] = await extractAll(incoming);
      return { role: m.role, content: m.content, attachments };
    }),
  );
}

function metaEvent(entry: ChainEntry, attempts: ReturnType<typeof Array.prototype.slice>, skipped: unknown[]) {
  return {
    type: "meta" as const,
    served: { provider: entry.provider, label: entry.label, model: entry.model },
    attempts,
    skipped,
  };
}

export async function POST(request: Request) {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages[] is required" }, { status: 400 });
  }

  const mode: ChatMode = body.mode === "privacy" ? "privacy" : "normal";
  const hydrate = await hydrateAttachments(body.messages).catch(() => []);
  const hasImages = hydrate.some((m) => (m.attachments ?? []).some((a) => a.kind === "image"));
  const chatMessages: ChatMessage[] = hydrate;

  const { text: system, agent } = systemPromptFor(body.agentId);
  const messages: ChatMessage[] = [{ role: "system", content: system }, ...chatMessages];

  const entries = envChain(process.env);
  const plan = planChain({
    entries,
    mode,
    hasImages,
    forceProvider: (body.provider as ChainEntry["provider"] | "auto") ?? "auto",
    forceModel: body.model && body.model !== "auto" ? body.model : "auto",
  });

  if (plan.entries.length === 0) {
    return Response.json(
      {
        error:
          entries.length === 0
            ? "No provider API keys are configured. Set at least one of OPENAI_API_KEY, GEMINI_API_KEY, NVIDIA_API_KEY, GROQ_API_KEY."
            : "No configured provider can serve this request.",
        skipped: plan.skipped,
      },
      { status: 503 },
    );
  }

  const chatRequest: ChatRequest = {
    messages,
    temperature: body.temperature ?? agent.temperature,
    maxTokens: agent.maxTokens,
    signal: abortSignalFor(request, 30_000),
  };

  let opened;
  try {
    opened = await openFirstWorking(plan.entries, chatRequest);
  } catch (err) {
    if (err instanceof AllProvidersFailedError) {
      return Response.json(
        {
          error: "Every provider in the fallback chain failed.",
          attempts: err.attempts.map((a) => ({
            provider: a.entry.provider,
            model: a.entry.model,
            status: a.status,
            error: a.error,
            ms: a.ms,
          })),
          skipped: plan.skipped,
        },
        { status: 502 },
      );
    }
    return Response.json({ error: err instanceof Error ? err.message : "unknown provider error" }, { status: 500 });
  }

  const { entry, deltas, attempts } = opened;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      send({
        type: "meta",
        served: { provider: entry.provider, label: entry.label, model: entry.model },
        agent: { id: agent.id, name: agent.name },
        mode,
        attempts: attempts.map((a) => ({ provider: a.entry.provider, model: a.entry.model, ok: a.ok, status: a.status, error: a.error, ms: a.ms })),
        skipped: plan.skipped,
      });
      const lastUser = [...chatMessages].reverse().find((m) => m.role === "user");
      send({
        type: "extract",
        attachments: (lastUser?.attachments ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          mime: a.mime,
          kind: a.kind,
          size: a.size,
          text: a.text ?? "",
        })),
      });
      let chars = 0;
      try {
        for await (const delta of deltas) {
          if (!delta) continue;
          chars += delta.length;
          send({ type: "delta", text: delta });
        }
        send({ type: "done", chars });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "stream failed mid-answer", chars });
      } finally {
        controller.close();
      }
    },
    cancel() {
      void deltas.return?.(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-oc-provider": entry.provider,
      "x-oc-model": entry.model,
      "x-oc-agent": agent.id,
      "x-oc-attempts": String(attempts.length),
    },
  });
}
