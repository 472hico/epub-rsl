import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadPolicy } from "../src/rsl/policy.js";
import { buildRslElement, validateEmbeddedRsl } from "../src/rsl/xml.js";

describe("RSL policy", () => {
  it("rejects encrypted content without a license server", async () => {
    const directory = await mkdtemp(join(tmpdir(), "epub-rsl-"));
    const policy = join(directory, "policy.yaml");
    await writeFile(
      policy,
      `content:
  url: https://publisher.example/book.epub.enc
  encrypted: true
license:
  payment:
    type: purchase
`,
      "utf8",
    );

    await expect(loadPolicy(policy)).rejects.toThrow(/requires content.server/);
  });

  it("warns about extension vocabulary without rejecting the RSL", () => {
    const rsl = buildRslElement({
      content: { url: "https://publisher.example/book.epub" },
      license: {
        permits: [{ type: "usage", values: ["example-extension"] }],
      },
    });

    expect(validateEmbeddedRsl(rsl)).toEqual([
      expect.objectContaining({
        level: "warning",
        code: "unknown-rule-token",
      }),
    ]);
  });

  it("accepts all standard payment types", () => {
    for (const type of [
      "purchase",
      "subscription",
      "training",
      "crawl",
      "use",
      "contribution",
      "attribution",
      "free",
    ] as const) {
      const rsl = buildRslElement({
        content: { url: "https://publisher.example/book.epub" },
        license: { payment: { type } },
      });
      expect(validateEmbeddedRsl(rsl)).toEqual([]);
    }
  });
});
