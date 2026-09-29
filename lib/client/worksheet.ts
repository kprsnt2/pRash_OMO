const ANSWER_KEY_LINE =
  /^\s*(?:#{1,6}\s*|\*\*|__)?\s*(?:teacher\s*(?:&|and)\s*parent\s+)?answers?(?:\s*keys?)?\s*:?\s*(?:\*\*|__)?\s*(?:\([^)]*\))?\s*$/i;
const RULE_LINE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

export interface WorksheetParts {
  questions: string;
  answerKey: string;
  hasAnswerKey: boolean;
}

/** Splits a worksheet at its answer-key heading so the key can be shown, hidden or printed apart. */
export function splitWorksheet(content: string): WorksheetParts {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!ANSWER_KEY_LINE.test(lines[i])) continue;
    const before = lines.slice(0, i);
    while (before.length > 0 && before[before.length - 1].trim() === "") before.pop();
    while (before.length > 0 && RULE_LINE.test(before[before.length - 1])) before.pop();
    while (before.length > 0 && before[before.length - 1].trim() === "") before.pop();
    return {
      questions: before.join("\n").trim(),
      answerKey: lines.slice(i).join("\n").trim(),
      hasAnswerKey: true,
    };
  }
  return { questions: content.trim(), answerKey: "", hasAnswerKey: false };
}

/**
 * A rule line directly under a text line is parsed as a setext heading by markdown, which mangles
 * worksheet pages; blank lines around every rule stop that.
 */
export function normalizeWorksheetMarkdown(text: string): string {
  return text
    .split("\n")
    .reduce<string[]>((out, line) => {
      if (RULE_LINE.test(line)) {
        if (out.length > 0 && out[out.length - 1].trim() !== "") out.push("");
        out.push(line, "");
        return out;
      }
      if (line.trim() === "" && out[out.length - 1] === "") return out;
      out.push(line);
      return out;
    }, [])
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
