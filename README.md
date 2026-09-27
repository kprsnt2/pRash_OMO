# OneChat

A personal, all-in-one chat app: pick an **agent** (persona/plugin), pick a **model tier**, attach as many
files as you want, and get streamed answers. Built because ChatGPT and Claude choke on many attachments at once.

## What it does

- **Agent picker in the chat.** 21 personas, each with its own system prompt, starters and vision capability:

  | Name | id | What it does |
  | --- | --- | --- |
  | Genie | `assistant` | everyday everything - the default |
  | LullaQuill | `kidstory` | bedtime story + reading practice for your child |
  | SimpleSage | `studybuddy` | explains any topic simply, then checks you |
  | PaperMint | `worksheet` | printable worksheets from a photo or a topic |
  | MetricAlchemist | `dataanalyst` | Looker Studio / Tableau formulas, SQL, sheets |
  | PulseLens | `doctor` | explains prescriptions and lab reports plainly |
  | CalmCompass | `psycho` | calm, judgement-free space to talk |
  | SoulCartographer | `spiritual` | life's big questions across traditions |
  | BabelBridge | `translator` | translation with script and grammar notes |
  | SegfaultSensei | `codementor` | finds the bug first, then fixes it |
  | PaperOwl | `docvision` | forms, invoices and receipts into tables |
  | WanderFare | `travelplanner` | itineraries, budgets, packing lists |
  | MasalaMuse | `recipechef` | cooks from what is already in your kitchen |
  | IronGuru | `fitnesscoach` | home workouts and simple nutrition |
  | PaisaPilot | `financehelper` | budgeting, EMI math, Indian tax basics |
  | InboxInk | `mailwriter` | drafts mail, replies and follow-ups |
  | ErrandElf | `errandelf` | daily plans, checklists, shopping lists |
  | FinePrint | `legalguide` | decodes contracts, notices and terms |
  | FixItFox | `fixitfox` | home, device and appliance troubleshooting |
  | GistGenie | `gistgenie` | boils long text and reports down to what matters |
  | CareerClimb | `careerclimb` | resumes, interviews, salary and career moves |
- **Model picker + automatic fallback chain.** Tries, in order:
  `gpt-5.4-mini` -> `gpt-5.4-nano` -> `gemini-flash-latest` -> NVIDIA NIM -> Groq.
  A failing rung (quota, 5xx, empty stream, no first token) is skipped and the next one answers, so one dead
  provider never blocks a chat. The reply badge shows which provider/model actually served, plus what was skipped.
- **Many attachments per message.** Images, PDFs and text/csv/json/markdown files, several at once, drag-drop,
  paste or the + button. PDFs get their text extracted server-side (pdfjs) so even text-only models can read them;
  scanned PDFs are still passed through as raw PDF to Gemini, which reads them natively.
- **Privacy mode.** One toggle routes **only** to Gemini (your paid key, which does not train on your data) and
  stops writing the conversation to disk. OpenAI/NVIDIA/Groq are removed from the chain while it is on.
- **Browser-only storage.** Conversations live in IndexedDB in your browser; nothing is stored on a server.
  Export/import as JSON from the sidebar.
- **Optional password gate.** Set `APP_PASSWORD` and every page and API route requires it (HttpOnly cookie).

## Local development

```bash
bun install
cp .env.example .env.local     # Windows: copy .env.example .env.local
# paste at least one provider key into .env.local
bun run dev                    # http://localhost:3000
```

Other scripts: `bun run build`, `bun run start`, `bun test`, `bun run typecheck`.

## Environment, deployment and troubleshooting

All of it lives in **[deploy.md](./deploy.md)**: the full variable table, Vercel steps, Cloudflare Workers
steps, the post-deploy checklist, key rotation and the failure modes.

Keys are read on the server only. The UI learns which rungs exist from `/api/config`, which never returns a key.

## Architecture

```
app/api/chat/route.ts     streaming endpoint: agent system prompt -> chain plan -> fallback runner -> SSE
app/api/config/route.ts    what agents and rungs exist (no secrets)
app/api/auth/route.ts      password -> HttpOnly cookie
middleware.ts              password gate for pages and API
lib/providers/config.ts    chain from env (order, defaults, vision flags)
lib/route/plan.ts          pure routing decision (privacy, vision, pinned model/provider)
lib/providers/run.ts       walks the chain, commits to the first rung that produces a token
lib/providers/openai.ts    OpenAI-compatible adapter (OpenAI, NVIDIA NIM, Groq)
lib/providers/gemini.ts    native Gemini adapter (system instruction, inlineData, SSE)
lib/agents/registry.ts     the 15 personas
lib/attachments/extract.ts PDF/text extraction for attachments
components/               ChatApp, AgentPicker, ModelPicker, Composer, Sidebar, MessageBubble, Markdown
```
