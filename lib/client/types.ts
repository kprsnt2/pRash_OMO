export interface Rung {
  provider: string;
  label: string;
  model: string;
  endpoint: string;
  vision: boolean;
  available: boolean;
  note?: string;
}

export interface AgentSummaryView {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  category: string;
  vision: boolean;
  starters: string[];
}

export interface ConfigResponse {
  agents: AgentSummaryView[];
  chain: Rung[];
  privacySafeProviders: string[];
  authRequired: boolean;
  anyProviderKey: boolean;
}

export interface UiAttachment {
  id: string;
  name: string;
  mime: string;
  kind: string;
  size: number;
  text?: string;
  base64?: string;
  previewUrl?: string;
}

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: UiAttachment[];
  served?: { provider: string; label: string; model: string };
  attempts?: { provider: string; model: string; ok: boolean; status?: number; error?: string; ms: number }[];
  skipped?: { id: string; provider: string; reason: string }[];
  error?: string;
  createdAt: number;
}
