export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: { id: string; name: string; mime: string; kind: string; size: number; text?: string }[];
  served?: { provider: string; label: string; model: string };
  attempts?: { provider: string; model: string; ok: boolean; status?: number; error?: string; ms: number }[];
  skipped?: { id: string; provider: string; reason: string }[];
  error?: string;
  elapsedMs?: number;
  agentId?: string;
  createdAt: number;
}

export interface StoredConversation {
  id: string;
  title: string;
  agentId: string;
  model: string;
  provider: string;
  mode: "normal" | "privacy";
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
}

const DB_NAME = "onechat";
const STORE = "conversations";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
    });
  }
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB request failed"));
  });
}

export async function listConversations(): Promise<StoredConversation[]> {
  try {
    const all = await tx<StoredConversation[]>("readonly", (s) => s.getAll() as IDBRequest<StoredConversation[]>);
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function saveConversation(conversation: StoredConversation): Promise<void> {
  try {
    await tx("readwrite", (s) => s.put(conversation));
  } catch {
    /* storage disabled or unavailable - the chat still works in memory */
  }
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* ignore */
  }
}

export async function exportConversations(): Promise<StoredConversation[]> {
  return listConversations();
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
