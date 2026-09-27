import { adapterFor } from "./adapters";
import type { Attempt, ChainEntry, ChatRequest } from "./types";

export interface OpenResult {
  entry: ChainEntry;
  deltas: AsyncGenerator<string, void, unknown>;
  attempts: Attempt[];
}

export class AllProvidersFailedError extends Error {
  attempts: Attempt[];
  constructor(attempts: Attempt[]) {
    super(`all ${attempts.length} provider attempt(s) failed`);
    this.name = "AllProvidersFailedError";
    this.attempts = attempts;
  }
}

export function errorDetail(err: unknown): string {
  if (err instanceof Error) {
    const withStatus = err as Error & { status?: number; detail?: string };
    const bits = [withStatus.status ? `HTTP ${withStatus.status}` : "", withStatus.detail ?? err.message]
      .filter(Boolean)
      .join(" - ");
    return bits.slice(0, 500) || err.name;
  }
  return String(err).slice(0, 500);
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Releases an abandoned attempt without waiting: a generator whose next() is still pending would
 * never settle, so both the generator and the response body are cancelled fire-and-forget.
 */
function release(generator: AsyncGenerator<string, void, unknown>, body: ReadableStream<Uint8Array> | null): void {
  try {
    void generator.return?.(undefined)?.catch(() => {});
  } catch {
    /* nothing to release */
  }
  try {
    void body?.cancel().catch(() => {});
  } catch {
    /* nothing to release */
  }
}

export interface RunOptions {
  /** how long the first token of an attempt may take before the rung is abandoned */
  firstChunkMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Walks the chain until one rung produces its first token. Failures on a rung are recorded and
 * the next rung is tried, so the user still gets an answer. Nothing is emitted to the caller
 * until a rung has committed, which keeps the visible answer single-provider and coherent.
 */
export async function openFirstWorking(
  entries: ChainEntry[],
  req: ChatRequest,
  options: RunOptions = {},
): Promise<OpenResult> {
  const attempts: Attempt[] = [];
  const doFetch = options.fetchImpl ?? fetch;
  const firstChunkMs = options.firstChunkMs ?? 30_000;

  for (const entry of entries) {
    const started = Date.now();
    const adapter = adapterFor(entry.provider);
    let generator: AsyncGenerator<string, void, unknown> | null = null;
    try {
      const res = await doFetch(adapter.url(entry), adapter.init(entry, req));
      if (!res.ok || !res.body) {
        const detail = res.body ? (await res.text()).slice(0, 500) : "empty response body";
        attempts.push({ entry, ok: false, status: res.status, error: detail, ms: Date.now() - started });
        continue;
      }
      generator = adapter.parse(res.body);
      const first = await withTimeout(generator.next(), firstChunkMs, `no first token within ${firstChunkMs}ms`);
      if (first.done || !first.value) {
        attempts.push({ entry, ok: false, status: res.status, error: "stream produced no text", ms: Date.now() - started });
        release(generator, res.body);
        continue;
      }
      const committed = first.value;
      const stream = generator;
      attempts.push({ entry, ok: true, status: res.status, ms: Date.now() - started });
      const deltas = (async function* () {
        yield committed;
        for await (const delta of stream) yield delta;
      })();
      return { entry, deltas, attempts };
    } catch (err) {
      if (generator) release(generator, null);
      attempts.push({ entry, ok: false, error: errorDetail(err), ms: Date.now() - started });
    }
  }

  throw new AllProvidersFailedError(attempts);
}

/** Rejects any attempt once the caller aborts, so a slow rung cannot hang the request. */
export function abortSignalFor(request: Request, firstChunkMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(firstChunkMs * 4);
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  return anyFn ? anyFn([request.signal, timeout]) : timeout;
}
