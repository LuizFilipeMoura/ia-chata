import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToHtml } from "./js/markdown.js";

test("markdownToHtml renders common Gemma markdown", () => {
  const html = markdownToHtml([
    "## Attack Result",
    "",
    "**Hit:** roll `2d6`.",
    "",
    "- Apply damage",
    "- Mark heat",
  ].join("\n"));

  assert.match(html, /<h2>Attack Result<\/h2>/);
  assert.match(html, /<strong>Hit:<\/strong>/);
  assert.match(html, /<code>2d6<\/code>/);
  assert.match(html, /<ul><li>Apply damage<\/li><li>Mark heat<\/li><\/ul>/);
});

test("markdownToHtml escapes raw HTML and unsafe links", () => {
  const html = markdownToHtml("Hello <img src=x onerror=alert(1)> [bad](javascript:alert(1))");

  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<a href="#">bad<\/a>/);
});
