// QA flight: drives the real chat UI in a browser my code owns (throwaway profile, headless),
// so the user-visible behaviour is exercised end to end and captured as screenshots + a JSON log.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SKILL = "C:/Users/hplap/.bun/install/global/node_modules/omo-ai/plugin/skills/browser";
const EVIDENCE = "C:/Users/hplap/Desktop/pRash/pRash_omo/qa/evidence";
const APP = process.env.QA_URL || "http://localhost:3000";

const { loadOmowright } = await import(`${SKILL}/scripts/omowright.mjs`);
const { omowright } = await loadOmowright();

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (Bun.file(candidate).size > 0) return candidate;
  }
  throw new Error("no chrome binary found");
}

function buildPdf() {
  const content = "BT /F1 12 Tf 20 100 Td (haemoglobin 9.1 g/dL) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const log = [];
const record = (step, detail) => {
  log.push({ step, detail });
  console.log(`[qa] ${step}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
};

mkdirSync(EVIDENCE, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "onechat-qa-"));
const attachmentDir = mkdtempSync(join(tmpdir(), "onechat-files-"));
const pngPath = join(attachmentDir, "child-drawing.png");
const pdfPath = join(attachmentDir, "blood-report.pdf");
const txtPath = join(attachmentDir, "notes.md");
writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]));
writeFileSync(pdfPath, buildPdf());
writeFileSync(txtPath, "# practice notes\nreading level 2\n");

let browser;
let ok = false;
try {
  browser = await omowright.connectPipe({
    browserPath: chromePath(),
    browserArgs: ["--headless=new", "--no-first-run", "--disable-gpu", "--window-size=1440,1000", `--user-data-dir=${profile}`],
    storageRoot: profile,
    dialogPolicy: { accept: true },
  });
  record("browser", "owned chrome launched");

  const page = await browser.newTab(`${APP}/`);
  record("navigate", APP);

  const shot1 = await page.screenshot();
  writeFileSync(join(EVIDENCE, "01-empty-state.png"), shot1);
  record("screenshot", "01-empty-state.png");

  const title = await page.evaluate(() => document.title);
  record("title", title);

  async function clickText(text, selectors) {
    for (const selector of selectors) {
      try {
        await page.locator(selector).first().click({ timeout: 4000 });
        return `css:${selector}`;
      } catch {
        /* try the next strategy */
      }
    }
    const clicked = await page.evaluate((needle) => {
      const elements = [...document.querySelectorAll("button, [role=button]")];
      const target = elements.find((el) => (el.textContent ?? "").trim().toLowerCase().includes(needle.toLowerCase()));
      if (!target) return false;
      target.click();
      return true;
    }, text);
    return clicked ? "js-fallback" : "MISS";
  }

  record("click agent picker", await clickText("Genie", ['button:has-text("Genie")', "header button"]));
  await new Promise((r) => setTimeout(r, 300));
  const shotPicker = await page.screenshot();
  writeFileSync(join(EVIDENCE, "02-agent-picker-open.png"), shotPicker);
  record("screenshot", "02-agent-picker-open.png");
  record("click PulseLens", await clickText("PulseLens", ['button:has-text("PulseLens")']));
  await new Promise((r) => setTimeout(r, 300));

  const filled = await page
    .locator("textarea")
    .first()
    .fill("Explain this blood report: haemoglobin 9.1 g/dL - is that low, and what should we ask the doctor?")
    .then(() => "locator.fill")
    .catch(async () => {
      const done = await page.evaluate((value) => {
        const textarea = document.querySelector("textarea");
        if (!textarea) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        setter?.call(textarea, value);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }, "Explain this blood report: haemoglobin 9.1 g/dL - is that low, and what should we ask the doctor?");
      return done ? "js-fallback" : "MISS";
    });
  record("fill composer", filled);

  const attached = await page
    .locator('input[aria-label="attach files"]')
    .first()
    .setInputFiles([pngPath, pdfPath, txtPath])
    .then(() => "setInputFiles")
    .catch((error) => `unavailable: ${error.message}`);
  record("attach files", attached);
  await new Promise((r) => setTimeout(r, 600));
  const shotAttached = await page.screenshot();
  writeFileSync(join(EVIDENCE, "03-attachments-ready.png"), shotAttached);
  record("screenshot", "03-attachments-ready.png");
  const chipsBeforeSend = await page.evaluate(() =>
    [...document.querySelectorAll("span.chip")].map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim()),
  );
  record("composer chips", chipsBeforeSend);

  record("click send", await clickText("Send", ['button:has-text("Send")']));

  let replyText = "";
  let served = "";
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const bubbles = [...document.querySelectorAll(".md")];
      const chip = [...document.querySelectorAll("span")].map((s) => s.textContent ?? "").find((t) => t.includes("gpt-5.4") || t.includes("gemini-flash-latest") || t.includes("llama-3.3"));
      return { text: bubbles.map((b) => b.textContent ?? "").join("\n"), chip: chip ?? "" };
    });
    replyText = state.text;
    served = state.chip;
    if (replyText.includes("Hello from the mock")) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const shot2 = await page.screenshot();
  writeFileSync(join(EVIDENCE, "04-streamed-reply.png"), shot2);
  record("screenshot", "04-streamed-reply.png");

  const composerChips = await page.evaluate(() => {
    const chips = [...document.querySelectorAll("span.chip")].map((c) => (c.textContent ?? "").trim());
    return chips;
  });
  const upstreamPayload = await fetch("http://localhost:4111/__stats").then((r) => r.json());
  record("upstream payload", upstreamPayload.lastBodies.openai);

  const userBubble = await page.evaluate(() => {
    const bubbles = [...document.querySelectorAll("div")].filter((d) => (d.className ?? "").includes("whitespace-pre-wrap"));
    return bubbles.map((b) => (b.textContent ?? "").slice(0, 120));
  });

  record("reply", replyText.slice(0, 200));
  record("served badge", served);
  record("attachment chips", composerChips);
  record("user bubble", userBubble);

  ok = replyText.includes("Hello from the mock");
} catch (error) {
  record("ERROR", error instanceof Error ? `${error.message}\n${error.stack?.slice(0, 600)}` : String(error));
} finally {
  if (browser) await browser.close().catch(() => {});
  rmSync(profile, { recursive: true, force: true });
  rmSync(attachmentDir, { recursive: true, force: true });
  writeFileSync(join(EVIDENCE, "browser-qa-log.json"), JSON.stringify({ ok, log }, null, 2));
  record("cleanup", `browser closed; removed ${profile} and ${attachmentDir}`);
}
console.log(JSON.stringify({ ok, steps: log.length }));
process.exit(ok ? 0 : 1);
