import { describe, expect, test } from "bun:test";
import { normalizeWorksheetMarkdown, splitWorksheet } from "../lib/client/worksheet";

const WORKSHEET = [
  "Class 4 Maths - Multiplication (20 marks)",
  "",
  "Answer all questions.",
  "",
  "1. 6 x 7 = ____",
  "2. 8 x 9 = ____",
  "",
  "---",
  "",
  "Answer key",
  "",
  "1. 42",
  "2. 72",
].join("\n");

describe("worksheet splitter", () => {
  test("keeps the answer key when it splits the reply", () => {
    const parts = splitWorksheet(WORKSHEET);
    expect(parts.hasAnswerKey).toBe(true);
    expect(parts.questions).toContain("1. 6 x 7 = ____");
    expect(parts.questions).not.toContain("Answer key");
    expect(parts.answerKey).toContain("Answer key");
    expect(parts.answerKey).toContain("1. 42");
    expect(parts.answerKey).not.toContain("6 x 7");
  });

  test("drops the page-break rule that separated the two parts", () => {
    expect(splitWorksheet(WORKSHEET).questions.endsWith("---")).toBe(false);
  });

  test("recognises the heading variants the worksheet agents emit", () => {
    for (const heading of [
      "### Teacher & Parent Answer Key",
      "## Answer key",
      "**Answer Key**",
      "### Answers",
      "Answer keys",
    ]) {
      const parts = splitWorksheet(`1. q\n\n${heading}\n\n1. a`);
      expect(parts.hasAnswerKey).toBe(true);
      expect(parts.answerKey).toContain("1. a");
    }
  });

  test("does not mistake a question line for the answer key", () => {
    const parts = splitWorksheet("Answer the following:\n\n1. 6 x 7 = ____");
    expect(parts.hasAnswerKey).toBe(false);
    expect(parts.questions).toContain("Answer the following");
  });

  test("treats a reply without an answer key as all questions", () => {
    const parts = splitWorksheet("Class 4 Maths\n\n1. 6 x 7 = ____");
    expect(parts.hasAnswerKey).toBe(false);
    expect(parts.answerKey).toBe("");
    expect(parts.questions).toContain("6 x 7");
  });
});

describe("worksheet markdown normalisation", () => {
  test("puts blank lines around a rule so markdown cannot read it as a heading", () => {
    expect(normalizeWorksheetMarkdown("1. q\n---\n2. q")).toBe("1. q\n\n---\n\n2. q");
  });

  test("collapses the blank lines it adds", () => {
    expect(normalizeWorksheetMarkdown("1. q\n\n\n\n---\n\n\n\n2. q")).toBe("1. q\n\n---\n\n2. q");
  });

  test("leaves ordinary text alone", () => {
    expect(normalizeWorksheetMarkdown("1. q\n2. q")).toBe("1. q\n2. q");
  });
});
