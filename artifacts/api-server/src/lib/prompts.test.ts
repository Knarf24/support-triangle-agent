import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { buildSupportSystemPrompt, domainLabelFor } = await import(
  new URL("./prompts.ts", import.meta.url).href
);

test("the support system prompt asks for plain text with no Markdown", () => {
  for (const domain of ["hackerrank", "claude", "visa", "unknown"]) {
    const prompt: string = buildSupportSystemPrompt(domain);

    assert.match(prompt, /plain text only/i);
    assert.match(prompt, /do not use markdown/i);
    assert.match(prompt, /no headings/i);
    assert.match(prompt, /no bold or italic markers/i);
  }
});

test("existing guidance is preserved in the prompt", () => {
  const prompt: string = buildSupportSystemPrompt("visa");

  assert.match(prompt, /support agent for Visa/);
  assert.match(prompt, /provided documentation context/);
  assert.match(prompt, /under 200 words/);
  assert.match(prompt, /professional and empathetic/);
});

test("domain labels are unchanged", () => {
  assert.equal(domainLabelFor("hackerrank"), "HackerRank");
  assert.equal(domainLabelFor("claude"), "Claude (Anthropic)");
  assert.equal(domainLabelFor("visa"), "Visa");
  assert.equal(domainLabelFor("anything-else"), "a technology company");
});

test("both AI call sites use the shared prompt builder instead of an inline prompt", () => {
  for (const file of ["./triage.ts", "../routes/triage.ts"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");

    assert.match(source, /buildSupportSystemPrompt\(/);
    assert.doesNotMatch(source, /You are a helpful support agent/);
  }
});
