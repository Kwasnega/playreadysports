import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("crawl-friendly SEO assets", () => {
  it("provides AI crawler guidance and an llms text entry point", () => {
    const rootDir = process.cwd();
    const robots = readFileSync(join(rootDir, "public", "robots.txt"), "utf8");
    const llms = readFileSync(join(rootDir, "public", "llms.txt"), "utf8");

    expect(robots).toContain("User-agent: GPTBot");
    expect(robots).toContain("User-agent: ClaudeBot");
    expect(llms).toContain("PLAYREADYSPORTS");
    expect(llms).toContain("join play ready");
  });
});
