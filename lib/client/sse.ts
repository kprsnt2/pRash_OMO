export interface ServedInfo {
  provider: string;
  label: string;
  model: string;
}
export interface AttemptInfo {
  provider: string;
  model: string;
  ok: boolean;
  status?: number;
  error?: string;
  ms: number;
}
export interface SkipInfo {
  id: string;
  provider: string;
  reason: string;
}

export type StreamEvent =
  | {
      type: "meta";
      served: ServedInfo;
      agent: { id: string; name: string };
      mode: string;
      attempts: AttemptInfo[];
      skipped: SkipInfo[];
    }
  | {
      type: "extract";
      attachments: { id: string; name: string; mime: string; kind: string; size: number; text: string }[];
    }
  | { type: "delta"; text: string }
  | { type: "done"; chars: number }
  | { type: "error"; message: string; chars?: number };

/** Reads the /api/chat SSE response and yields typed events. */
export async function* readChatStream(response: Response): AsyncGenerator<StreamEvent, void, unknown> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        try {
          yield JSON.parse(line.slice(5).trim()) as StreamEvent;
        } catch {
          /* ignore keep-alive or malformed frame */
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }
}
