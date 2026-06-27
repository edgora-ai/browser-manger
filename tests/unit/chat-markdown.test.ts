// Markdown rendering tests.
//
// The renderer (core.js) wraps `marked.parse` + a sanitizer. Rather than load
// the whole core.js into a vm sandbox (fragile), we verify the two contracts
// that matter: (1) marked produces the expected HTML for common inputs, and
// (2) the sanitizer regex used as the DOMPurify fallback strips XSS vectors.
// The sanitizer regex is mirrored from core.js::sanitizeMdHtml fallback.
import { describe, it, expect } from "vitest";
import { marked } from "marked";

// Mirror of the DOMPurify-absent fallback sanitizer in core.js::sanitizeMdHtml.
function sanitizeMdHtml(html: string): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '$1="#"');
}

function render(text: string): string {
  marked.setOptions({ breaks: true, gfm: true, headerIds: false, mangle: false });
  return sanitizeMdHtml(marked.parse(text) as string);
}

describe("chat markdown — marked output", () => {
  it("renders headings", () => {
    const html = render("# Title\n## Sub");
    expect(html).toMatch(/<h1[^>]*>Title<\/h1>/);
    expect(html).toMatch(/<h2[^>]*>Sub<\/h2>/);
  });

  it("renders bullet and ordered lists", () => {
    const html = render("- a\n- b\n1. one\n2. two");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>one</li>");
  });

  it("renders fenced code blocks with language class", () => {
    const html = render("```js\nconst x = 1;\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("language-js");
    expect(html).toContain("const x = 1;");
  });

  it("renders inline code", () => {
    const html = render("use `npm test` to run");
    expect(html).toContain("<code>npm test</code>");
  });

  it("renders bold and italic", () => {
    const html = render("**bold** and *italic*");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders links with safe href", () => {
    const html = render("[Anthropic](https://www.anthropic.com)");
    expect(html).toMatch(/<a [^>]*href="https:\/\/www\.anthropic\.com"/);
  });

  it("renders tables", () => {
    const html = render("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders task lists (GFM checkboxes)", () => {
    const html = render("- [x] done\n- [ ] todo");
    expect(html).toContain("checkbox");
  });

  it("renders blockquotes", () => {
    const html = render("> quoted text");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("quoted text");
  });

  it("renders horizontal rules", () => {
    const html = render("a\n\n---\n\nb");
    expect(html).toContain("<hr");
  });

  it("renders nested lists", () => {
    const html = render("- top\n  - nested");
    expect(html).toContain("<ul>");
    expect(html).toContain("nested");
  });
});

describe("chat markdown — XSS sanitization", () => {
  it("strips <script> blocks", () => {
    const html = render("<script>alert(1)</script>");
    expect(html).not.toMatch(/<script/i);
  });

  it("strips inline event handlers", () => {
    // marked escapes raw HTML, but be defensive: if a handler survives, kill it.
    const html = sanitizeMdHtml('<a href="#" onclick="alert(1)">x</a>');
    expect(html).not.toMatch(/onclick=/i);
  });

  it("neutralizes javascript: URLs from markdown links", () => {
    const html = render("[click](javascript:alert(1))");
    expect(html).not.toMatch(/href="javascript:/i);
  });

  it("escapes HTML inside code blocks (no execution)", () => {
    const html = render("```\n<div onclick=alert(1)>\n```");
    expect(html).not.toMatch(/<div onclick/i);
  });

  it("returns safe output for empty input", () => {
    const html = render("");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
  });

  it("keeps legitimate https links intact", () => {
    const html = render("[docs](https://example.com/docs)");
    expect(html).toMatch(/href="https:\/\/example\.com\/docs"/);
  });
});
