# Deploying OneChat

Everything needed to put this app on the internet. Keys stay on the server side; the browser only ever
talks to `/api/chat` and `/api/config`.

## 1. Before you deploy

- Decide the host: **Vercel** (simplest for Next.js) or **Cloudflare Workers** via OpenNext. Both configs
  are already in this repo; the Cloudflare dependency is a dev dependency.
- Have at least one provider key ready. Any provider without a key is skipped automatically, but privacy
  mode needs `GEMINI_API_KEY`.
- Pick an `APP_PASSWORD`. Without it the deployment is open to anyone with the URL, and every API route
  is reachable, which spends your keys.
- Remember: the app stores chats in the browser (IndexedDB), so no database and no server storage is needed.

## 2. Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | - | enables the two OpenAI rungs (primary tier) |
| `OPENAI_MODEL` | `gpt-5.4-mini` | primary rung |
| `OPENAI_FALLBACK_MODEL` | `gpt-5.4-nano` | second rung |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | set only for a proxy or gateway |
| `GEMINI_API_KEY` | - | enables the Gemini rung; required by privacy mode |
| `GEMINI_MODEL` | `gemini-flash-latest` | Gemini rung |
| `GEMINI_FALLBACK_MODEL` | - | optional extra Gemini rung |
| `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | override |
| `NVIDIA_API_KEY` | - | enables the NVIDIA NIM rung |
| `NVIDIA_MODEL` | `meta/llama-3.3-70b-instruct` | use a `...vision...` model id to let this rung read images |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` | override |
| `GROQ_API_KEY` | - | enables the Groq rung |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | last rung |
| `GROQ_BASE_URL` | `https://api.groq.com/openai/v1` | override |
| `APP_PASSWORD` | - | when set, the whole app is behind this password |

Fallback order is fixed: OpenAI mini -> OpenAI nano -> Gemini flash -> NVIDIA NIM -> Groq. Rungs without a
key are dropped from the chain before the request starts, and the reply badge shows which rung served.

## 3. Deploy to Vercel

1. Push this repository to GitHub, then import it at vercel.com, or run `bunx vercel` from the repo root.
2. Framework preset: **Next.js**. Leave the build command as `next build` (`vercel.json` already sets it,
   plus `installCommand: bun install` and `Cache-Control: no-store` for `/api/*`).
3. Add every key from the table above under Settings -> Environment Variables, for Production and Preview.
4. Deploy, then open the URL. With `APP_PASSWORD` set you land on the password page first.
5. PDF extraction runs on the Node.js runtime, which Vercel provides by default - no extra configuration.

## 4. Deploy to Cloudflare Workers

```bash
bunx opennextjs-cloudflare build
bunx wrangler deploy
bunx wrangler secret put OPENAI_API_KEY      # repeat for GEMINI_API_KEY, NVIDIA_API_KEY, GROQ_API_KEY, APP_PASSWORD
bunx wrangler secret put OPENAI_MODEL        # optional; any variable can be a secret
```

`wrangler.jsonc` points at `./.open-next/worker.js`, enables `nodejs_compat` (needed by the PDF parser) and
serves `./.open-next/assets`. `open-next.config.ts` holds the adapter config. After editing secrets, redeploy
so the Worker picks them up.

## 5. After deploy: what to check

1. Open the app, pick an agent, send "hello" - a streamed reply with a provider badge means the chain works.
2. Turn on **Privacy mode** and send one message. The badge must read Gemini, and no OpenAI/NVIDIA/Groq
   request should have happened.
3. Attach two images, a PDF and a text file in one message - the reply should use their content, which proves
   extraction and multi-attachment payloads work on the host runtime.
4. Wrong password -> you are bounced back to the login page; correct password -> you stay signed in for 90 days.
5. Export a conversation from the sidebar: a JSON file should download.

## 6. Rotating or removing a key

Remove the variable (or the Worker secret) and redeploy/restart. The provider disappears from `/api/config`,
the picker shows it as "no key", and the chain simply skips it - no code change needed.

## 7. Troubleshooting

- **"Every provider in the fallback chain failed."** The reply lists each attempt with its HTTP status: usually
  a wrong/absent key, an exhausted quota, or a model id your account cannot access.
- **Privacy mode returns nothing.** Only Gemini serves privacy mode; set `GEMINI_API_KEY`.
- **Attachments ignored on NVIDIA/Groq.** Those rungs are text-only unless the model id looks vision-capable;
  switch `NVIDIA_MODEL`/`GROQ_MODEL`, or let the request fall through to OpenAI/Gemini.
- **PDFs empty on a text-only rung.** The PDF was a scan with no text layer; Gemini receives the raw PDF and
  can read it, other rungs cannot.
- **No saved chats after refresh.** Browser storage is per origin; incognito windows and cleared site data
  remove it. Use Export for backups.
- **httponly cookie not set behind a proxy.** Serve over HTTPS in production; the cookie is marked `secure`
  in production builds, and `APP_PASSWORD` must be identical across instances.
