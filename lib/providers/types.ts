export type ProviderId = "openai" | "gemini" | "nvidia" | "groq";

export type AttachmentKind = "image" | "pdf" | "text";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  mime: string;
  size: number;
  /** base64 payload without the data: prefix - images and pdfs */
  data?: string;
  /** extracted plain text - text files and PDFs */
  text?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  attachments?: Attachment[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** One rung of the fallback chain: a concrete (provider, model, endpoint, key) tuple. */
export interface ChainEntry {
  id: string;
  provider: ProviderId;
  label: string;
  model: string;
  endpoint: string;
  apiKey: string;
  /** true when this entry can consume image attachments */
  vision: boolean;
  notes?: string;
}

export interface Attempt {
  entry: ChainEntry;
  ok: boolean;
  status?: number;
  error?: string;
  ms: number;
}

export interface ProviderAdapter {
  id: ProviderId;
  url(entry: ChainEntry): string;
  init(entry: ChainEntry, req: ChatRequest): RequestInit;
  body(entry: ChainEntry, req: ChatRequest): unknown;
  /** yields text deltas from an SSE response body */
  parse(stream: ReadableStream<Uint8Array>): AsyncGenerator<string, void, unknown>;
}
