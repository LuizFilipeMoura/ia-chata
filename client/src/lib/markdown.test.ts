import { markdownToHtml } from "./markdown";

test("markdownToHtml renders common Gemma markdown", () => {
  const html = markdownToHtml(
    ["## Attack Result", "", "**Hit:** roll `2d6`.", "", "- Apply damage", "- Mark heat"].join("\n"),
  );
  expect(html).toMatch(/<h2>Attack Result<\/h2>/);
  expect(html).toMatch(/<strong>Hit:<\/strong>/);
  expect(html).toMatch(/<code>2d6<\/code>/);
  expect(html).toMatch(/<ul><li>Apply damage<\/li><li>Mark heat<\/li><\/ul>/);
});

test("markdownToHtml escapes raw HTML and unsafe links", () => {
  const html = markdownToHtml("Hello <img src=x onerror=alert(1)> [bad](javascript:alert(1))");
  expect(html).not.toMatch(/<img/i);
  expect(html).toMatch(/&lt;img src=x onerror=alert\(1\)&gt;/);
  expect(html).toMatch(/<a href="#">bad<\/a>/);
});
