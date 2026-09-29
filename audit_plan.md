# OneChat — Project Audit & Remediation Plan

- **Project:** OneChat — a personal multi-agent, multi-provider chat app (Next.js 16 App Router, React 19, TypeScript, Bun).
- **Audit date:** 2026-09-27 (local scans run against the working tree).
- **Auditor scope:** correctness, security/privacy, reliability, maintainability, portability, and the health of tests/scripts/deploy config.
- **Method:** full read of source (`app/`, `lib/`, `components/`, `tests/`, `scripts/`, `qa/`), all deploy/config files, plus a live health check: `bun run typecheck` (clean, 0 errors) and `bun test` (**42 pass / 0 fail / 218 asserts**).

## 1. Executive summary

OneChat is a **well-architected, well-tested personal app**. The core value — a provider fallback chain (OpenAI mini → OpenAI nano → Gemini → NVIDIA → Groq), privacy-mode routing to Gemini only, server-side PDF/text extraction, and browser-only IndexedDB storage — is implemented cleanly and covered by a meaningful test suite and QA harness. Typecheck and all unit tests pass.

There are **no committed secrets** and the API correctly keeps keys server-side. The issues found are **mostly medium/low severity**: portability bugs (hardcoded machine paths in dev scripts), a few **data-loss / silent-failure edge cases**, **missing server-side request limits and HTTP security headers**, and **documentation drift**. None of these block normal use, but several matter for the project's own goals (privacy guarantees, resilience, cost control on a paid key).

No P0 "the app is fundamentally broken" defects. The plan below is phased so the highest-leverage fixes land first.

### Severity legend
- **P0** — security/data-loss with real exposure
- **P1** — correctness/resilience/cost bug, silent failure, or portability break
- **P2** — hygiene, docs, minor input-hardening

## 2. Findings at a glance

| # | Severity | Area | Finding | Location |
|---|----------|------|---------|----------|
| F1 | P1 | Reliability | Attachment **text is dropped on save**, so a reloaded conversation loses attachment context on later turns | `components/ChatApp.tsx:42`, `lib/storage/local.ts:5` |
| F2 | P1 | Reliability | `hydrateAttachments(...).catch(() => [])` **silently discards the entire message** (text + attachments) if extraction throws | `app/api/chat/route.ts:58` |
| F3 | P1 | Security | **No server-side request/attachment size or count limits**; the 60 MB budget is client-only → cost/DoS exposure to `/api/chat` | `route.ts:17-24`, `lib/client/files.ts:56-61` |
| F4 | P1 | Portability | **Hardcoded absolute machine paths** in dev/QA scripts break the repo on any other checkout | `scripts/real-smoke.mjs:5`, `qa/browser-qa.mjs:7-8` |
| F5 | P2 | Security | **No security headers** (no CSP, HSTS, X-Frame-Options, Referrer-Policy) on HTML/API | `next.config.ts:6-8` |
| F6 | P2 | Correctness | `planChain` pinning drops non-pinned rungs and **does not record them in `skipped`**; comment/test name contradict behavior | `lib/route/plan.ts:36-46`, `tests/plan.test.ts:69-72` |
| F7 | P2 | Security | Password auth uses **unsalted SHA-256** and **non-constant-time** comparison | `lib/auth.ts:6-10`, `proxy.ts:16`, `app/api/auth/route.ts:17` |
| F8 | P2 | Correctness | Model output rendered via **`dangerouslySetInnerHTML`** (hljs); safe today, but an unchecked XSS surface | `components/Markdown.tsx:54` |
| F9 | P2 | Correctness | `temperature`/`maxTokens`/`provider`/`model` from the body are **not validated or clamped** | `app/api/chat/route.ts:66-71,89` |
| F10 | P2 | Maintainability | **No lint configured** yet code carries `eslint-disable` directives; no `lint` script | `package.json:6-11`, `components/*.tsx` |
| F11 | P2 | Correctness | `config` endpoint **omits the Gemini alt rung** that `envChain` actually adds (`GEMINI_FALLBACK_MODEL`) | `app/api/config/route.ts:41-46` vs `lib/providers/config.ts:64-67` |
| F12 | P2 | Docs | README/comment **drift**: "15 personas" (actual 21) and `middleware.ts` (actual `proxy.ts`, Next 16 rename) | `README.md:70,76` |

## 3. Detailed findings

### F1 — Attachment text is not persisted (P1, Reliability / affects the "many attachments" core feature)
- **Where:** `components/ChatApp.tsx:42` (`toStored`) and `lib/storage/local.ts:5` (`StoredMessage.attachments` type).
- **Evidence:** `toStored` maps attachments to `{ id, name, mime, kind, size }` only — no `text`. `fromStored` restores exactly those. On the next `send()`, replayed history attachments take the no-`base64` branch and are sent as `{ kind, size, text: a.text ?? "" }` (`ChatApp.tsx:200-204`). Since stored attachments carry no `text`, the server receives `""`.
- **Impact:** If you attach a PDF/CSV/text and then refresh (or reopen from the sidebar) and continue the chat, the model can no longer "see" that document. The extraction machinery supports replay text (`lib/attachments/extract.ts:82-91`), but storage never persists it. This defeats cross-turn continuity on the app's headline feature.
- **Trade-off to decide:** persisting `text` slightly enlarges IndexedDB and stores document content at rest (privacy mode *already* refuses to save anything — `ChatApp.tsx:142`). For normal (non-privacy) chats, persisting `text` (still not the image/PDF bytes) is consistent with the existing "browser-only" storage model.
- **Fix:** add `text?: string` to stored attachment metadata and carry it through `toStored`/`fromStored`; keep `data`/`base64` out of storage.

### F2 — Extraction failure silently blanks the message (P1, Reliability)
- **Where:** `app/api/chat/route.ts:58` — `const hydrate = await hydrateAttachments(body.messages).catch(() => []);`
- **Evidence:** on any throw, `hydrate` becomes `[]`, so `chatMessages = []`, `hasImages = false`, and the provider is invoked with only the system prompt + an empty content turn.
- **Impact:** a single malformed/oversized attachment can make the whole user turn (including its text) vanish, producing a confusing empty answer and possibly a wrong model tier (text-only) silently.
- **Fix:** on failure, fall back to the raw messages with metadata-only (or skipped) attachments rather than `[]`; surface a per-attachment error to the user and never lose `m.content`.

### F3 — No server-side request limits (P1, Security / cost)
- **Where:** `app/api/chat/route.ts:17-24` (request body typed but unbounded) and `lib/client/files.ts:56-61` (`attachmentsBudget`, enforced only in the browser).
- **Evidence:** the 60 MB cap and any file-count limit live client-side. A direct `POST /api/chat` can send arbitrarily large base64 payloads or an unbounded message history.
- **Impact:** with `APP_PASSWORD` unset (a supported, documented mode), the chain — and your paid keys — are exposed to unbounded spend and memory pressure. Even with the password, there is no cost guard.
- **Fix:** enforce server-side guards: request body byte ceiling (e.g., reject > ~25–60 MB), per-message attachment count, and a cap on total history turns/tokens. Add a lightweight per-IP/per-session in-memory rate limit. Document `APP_PASSWORD` + a reverse-proxy WAF/limit as the recommended posture.

### F4 — Hardcoded machine paths in scripts (P1, Portability)
- **Where:** `scripts/real-smoke.mjs:5` (`C:/Users/hplap/Desktop/pRash/pRash_omo/.env.local`), `qa/browser-qa.mjs:7-8` (`.bun/.../omo-ai/plugin/skills/browser` and `.../qa/evidence`).
- **Evidence:** literal absolute paths to this author's home directory.
- **Impact:** `bun scripts/real-smoke.mjs` reads the wrong (non-existent) `.env.local` elsewhere; the QA harness can't find its `browser` skill or write evidence. These are dev tools, so this won't affect the shipped app, but it makes the QA story non-reproducible for anyone else.
- **Fix:** resolve paths from `import.meta.dir` / `process.cwd()` (e.g., `.env.local` in the project root, `qa/evidence` relative to repo root) and make the external `browser` skill dependency injectable via env with a clear error if absent.

### F5 — Missing HTTP security headers (P2, Security)
- **Where:** `next.config.ts` sets only `Cache-Control: no-store` for `/api/*`; no CSP/HSTS/etc. anywhere.
- **Evidence:** headers() covers one route family only.
- **Impact:** no defense-in-depth against clickjacking / MIME sniffing / mixed content; a CSP is especially relevant given F8's `dangerouslySetInnerHTML`. Low likelihood for a personal, authenticated app, but cheap to add.
- **Fix:** add a baseline header set: `Content-Security-Policy` (restrictive, allow `'unsafe-inline'` for styles if the dark theme needs inline vars, and `data:` for image previews), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and HSTS for the production host.

### F6 — Provider-pinning semantics vs. comment/test (P2, Correctness)
- **Where:** `lib/route/plan.ts:36-46`; test at `tests/plan.test.ts:69-72`.
- **Evidence:** when `forceProvider` matches, non-matching providers are filtered out but not pushed to `skipped`. The only fallback trigger is "pinned provider unavailable" (`:43-46`). The test is named "...the chain stays as fallback" yet asserts `entries` == `["groq"]` only.
- **Impact:** pinning a provider removes cross-provider resilience — if the pinned provider's rung fails at request time, `openFirstWorking` throws `AllProvidersFailedError` instead of cascading to others. That may be intended (user explicitly chose), but the code/comment/test disagree, and the UI can't explain "0 rungs skipped" when other keys exist.
- **Fix:** pick one contract. Recommended: keep only-the-pinned-provider behavior but **record the excluded providers in `skipped`** with reason "pinned to X", and rename the test to match ("pin restricts to that provider; full set is used only if it has no keys").

### F7 — Password hashing/comparison (P2, Security)
- **Where:** `lib/auth.ts:6-10` (SHA-256, no salt); `proxy.ts:16` and `app/api/auth/route.ts:17` use `===`/`!==` on the hash.
- **Evidence:** `crypto.subtle.digest("SHA-256", "onechat:v1:"+password)`; non-constant-time compare.
- **Impact:** acceptable for a single shared gate, but the cookie is a fast, unsalted hash of a possibly-weak shared password; offline brute-force of a leaked cookie is cheap. Timing attack is theoretical here (shared token, network noise dominates).
- **Fix (light):** use a constant-time compare; optionally add a random per-install salt env (`APP_PASSWORD` derivation) and document a strong-password requirement. A full password KDF is likely overkill for this threat model — prefer documenting the assumption.

### F8 — dangerouslySetInnerHTML for code blocks (P2, Security)
- **Where:** `components/Markdown.tsx:54`.
- **Evidence:** `code` renderer injects `hljs.highlight(code, {language}).value`.
- **Impact:** safe **today** — highlight.js HTML-escapes text, and `react-markdown` (no `rehype-raw`) already escapes any raw HTML the model emits. The risk is latent: it depends entirely on hljs internal escaping staying correct and on the `code`/`className` parsing. Model output is prompt-influenceable.
- **Fix:** keep hljs output as the only innerHTML source (never concatenate untrusted strings into it); add a unit test asserting that a payload like `` ```<img onerror>` `` renders escaped, never as a live element. Consider `rehype-sanitize` if raw HTML is ever enabled.

### F9 — Unvalidated chat params (P2, Correctness/robustness)
- **Where:** `app/api/chat/route.ts:66-71` (provider/model cast) and `:89-90` (`temperature`, `maxTokens`).
- **Evidence:** `body.temperature` and `agent.maxTokens` are forwarded verbatim; `provider` is loosely cast.
- **Impact:** an out-of-range `temperature` (e.g., negative or > bounds) or absurd `maxTokens` causes provider 4xx/5xx that present as a fallback-failure rather than a client error. `provider`/`model` are already handled gracefully by `planChain` (unknown → full set), so those are fine.
- **Fix:** clamp `temperature` to `[0, 2]` and cap `maxTokens` to a per-agent/provider-safe maximum before building the request.

### F10 — No lint setup (P2, Maintainability)
- **Where:** `package.json` has no `lint`; `components/Composer.tsx` / `MessageBubble.tsx` carry `// eslint-disable-next-line @next/next/no-img-element`.
- **Evidence:** eslint-disable directives with no ESLint config or script.
- **Impact:** the disable comments are dead weight; there is no automated style/a11y gate.
- **Fix:** add ESLint (`eslint` + `eslint-config-next`) with a `lint` script **or** remove the dangling disable comments. Either way, make CI run one consistent gate.

### F11 — `/api/config` omits the Gemini alt rung (P2, Correctness)
- **Where:** `app/api/config/route.ts:41-46` lists 5 rungs (OpenAI, OpenAI fallback, Gemini, NVIDIA, Groq) but **not** `GEMINI_FALLBACK_MODEL`, which `envChain` adds to the live chain (`lib/providers/config.ts:64-67`).
- **Evidence:** config rungs are hardcoded; envChain is dynamic.
- **Impact:** if `GEMINI_FALLBACK_MODEL` is set, a rung exists at runtime (and can serve) that the picker never shows — a minor "surprise provider" and an inconsistency between UI and reality.
- **Fix:** have `/api/config` derive its rung list from `envChain` (mapped to previews) so UI and runtime can never diverge.

### F12 — Documentation drift (P2, Maintainability)
- **Where:** `README.md:70` (`middleware.ts`) and `README.md:76` (`lib/agents/registry.ts the 15 personas`).
- **Evidence:** actual file is `proxy.ts` (Next.js 16 renamed Middleware → Proxy; confirmed in `node_modules/next/dist/docs/.../proxy.md` and installed `next@16.3.6`); the registry ships **21** agents (counted in `lib/agents/registry.ts`, and the README intro correctly says 21).
- **Impact:** stale docs mislead contributors about the auth mechanism and agent count.
- **Fix:** update architecture notes to `proxy.ts` and "21 personas"; keep the intro table and architecture in sync going forward.

## 4. Remediation plan (phased)

### Phase 0 — Quick wins & portability (½ day, low risk)
1. **F4:** De-hardcode paths in `scripts/real-smoke.mjs` and `qa/browser-qa.mjs` (`import.meta.dir`/`process.cwd()`; injectable skill path). Re-run `bun scripts/real-smoke.mjs` to confirm it reads local `.env.local`.
2. **F12:** Fix README (`proxy.ts`, "21 personas").
3. **F10:** Add `eslint` + `eslint-config-next` and a `lint` script (or strip the dead disable comments). Wire lint into `typecheck`'s place in the checklist.

### Phase 1 — Correctness & resilience of the core feature (1 day)
4. **F1:** Persist attachment `text` (typed in `local.ts`, carried by `toStored`/`fromStored`); keep bytes out of storage; re-verify privacy mode still saves nothing. Add a test for the replay path (attach → persist → reload → re-send contains text).
5. **F2:** Replace `.catch(() => [])` with a safe fallback that preserves `content` and marks failed attachments; return a per-attachment error to the user. Add a unit test where one bad attachment doesn't blank the turn.
6. **F9:** Clamp `temperature`/`maxTokens` server-side; add tests for out-of-range inputs.
7. **F6/F11:** Align `planChain` skipped-recording + fix the test name; derive `/api/config` rungs from `envChain`.

### Phase 2 — Security & cost hardening (1 day)
8. **F3:** Enforce server-side body-size, attachment-count, and history-length limits; add a basic per-IP rate limit; return `413`/`429` with clear messages. Document the recommended `APP_PASSWORD`+proxy posture.
9. **F5:** Add baseline security headers (CSP, HSTS on prod, nosniff, Referrer-Policy, X-Frame-Options). Validate the app still renders (CSP allows the image `data:` previews and any needed inline styles).
10. **F7:** Constant-time compare for the auth cookie; document strong-password guidance (optional salted derivation).
11. **F8:** Add the escaped-render regression test; note in comments that hljs output is the sole innerHTML source.

### Phase 3 — Keep it green & documented (ongoing)
12. Ensure `bun run typecheck && bun test` stay in CI; consider adding `next build` and the mock-upstream browser QA (`qa/browser-qa.mjs` + `qa/mock-upstream.mjs`) as an optional job.
13. Maintain a short `AGENTS.md` note: this is Next.js 16 (Proxy, not Middleware); verify model IDs in `lib/providers/config.ts` defaults against current provider docs before each provider bump.

## 5. Suggested task breakdown (trackable)

- [ ] **T1** De-hardcode `scripts/real-smoke.mjs` + `qa/browser-qa.mjs` paths (F4)
- [ ] **T2** Persist + replay attachment `text`; regression test (F1)
- [ ] **T3** Non-swallowing `hydrateAttachments` fallback in chat route; test (F2)
- [ ] **T4** Server-side request/attachment/history limits + rate limit; tests (F3)
- [ ] **T5** Add security headers in `next.config.ts`; smoke-render check (F5)
- [ ] **T6** Align `planChain` skipped semantics + fix `plan.test.ts` name; derive config rungs from `envChain` (F6, F11)
- [ ] **T7** Constant-time auth compare + alg note (F7)
- [ ] **T8** Clamp `temperature`/`maxTokens`; tests (F9)
- [ ] **T9** Markdown innerHTML escaping regression test (F8)
- [ ] **T10** Add ESLint config + `lint` script (or remove dead disables) (F10)
- [ ] **T11** README/architecture doc fixes (F12)
- [ ] **T12** CI: `typecheck` + `test` (+ optional `build`/browser QA)

## 6. Validation checklist (run after each phase)

```bash
bun run typecheck   # expect: 0 errors
bun test            # expect: all pass (currently 42)
bun run build       # optional: full production build still succeeds
bun scripts/real-smoke.mjs   # after F4; needs at least one key
```

Manual acceptance (mirrors `deploy.md` §5):
- Attach a PDF/CSV, send, refresh, reopen the chat, send again → the model still references the file's content (proves F1 fix).
- Set `APP_PASSWORD`, hit `/api/chat` with a valid cookie but an oversized body → clear `413`, no upstream call (proves F3).
- Privacy mode on → badge shows Gemini only and no other provider is called (unchanged behavior; guard against regression in F6).

## 7. What's already solid (keep)

- Clean layering: pure `planChain`, adapters per provider, a resilient `openFirstWorking` runner that commits to the first rung producing a token and releases abandoned generators (`lib/providers/run.ts`).
- Privacy-mode routing to Gemini only, with skip reasons surfaced to the UI.
- Server-side PDF (pdfjs) and text extraction, with graceful degradation for scans/binary/unknown files.
- No committed secrets; `/api/config` exposes availability booleans only.
- Strong unit coverage for chain/plan/adapters/extraction plus a mock-upstream + headless-browser QA harness with screenshots.
- Node-runtime streaming with a sane first-token timeout (30 s) and request timeout (120 s).
