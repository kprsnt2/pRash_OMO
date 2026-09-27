"use client";

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

const components: Components = {
  pre: (props) => <>{props.children}</>,
  a: (props) => (
    <a href={props.href} target="_blank" rel="noreferrer">
      {props.children}
    </a>
  ),
  code: (props) => {
    const raw = String(props.children ?? "");
    const language = /language-([\w+-]+)/.exec(props.className ?? "")?.[1];
    if (!language) return <code className="md-inline-code">{props.children}</code>;
    const code = raw.replace(/\n$/, "");
    const safeLanguage = hljs.getLanguage(language) ? language : "plaintext";
    let html = "";
    try {
      html = hljs.highlight(code, { language: safeLanguage }).value;
    } catch {
      html = code;
    }
    return (
      <div className="code-block">
        <div className="code-head">
          <span>{language}</span>
          <CopyButton text={code} />
        </div>
        <pre>
          <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
    );
  },
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
