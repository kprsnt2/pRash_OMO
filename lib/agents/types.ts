export type AgentCategory =
  | "kids"
  | "study"
  | "work"
  | "health"
  | "life"
  | "creative"
  | "utility";

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  /** one line shown in the picker */
  tagline: string;
  /** longer description shown in the info panel */
  description: string;
  category: AgentCategory;
  /** true when the agent is much better with images/PDF attachments */
  vision: boolean;
  /** full system prompt sent as the leading system message */
  system: string;
  /** click-to-send example prompts */
  starters: string[];
  temperature?: number;
  maxTokens?: number;
}

export interface AgentSummary {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  category: AgentCategory;
  vision: boolean;
  starters: string[];
}
