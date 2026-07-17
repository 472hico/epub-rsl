import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadPolicy } from "../src/rsl/policy.js";
import { buildRslElement, validateEmbeddedRsl } from "../src/rsl/xml.js";
import { parseXml } from "../src/xml.js";

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

  it("rejects an unqualified extension token", () => {
    const rsl = buildRslElement({
      content: { url: "https://publisher.example/book.epub" },
      license: {
        permits: [{ type: "usage", values: ["example-extension"] }],
      },
    });

    expect(validateEmbeddedRsl(rsl)).toEqual([
      expect.objectContaining({
        level: "error",
        code: "unknown-rule-token",
      }),
    ]);
  });

  it("accepts a QName extension token with a declared namespace", () => {
    const document = parseXml(
      `<rsl:rsl xmlns:rsl="https://rslstandard.org/rsl" xmlns:vendor="https://vendor.example/rsl">
        <rsl:content url="https://publisher.example/book.epub">
          <rsl:license>
            <rsl:permits type="usage">vendor:archive</rsl:permits>
          </rsl:license>
        </rsl:content>
      </rsl:rsl>`,
      "extension fixture",
    );
    const root = document.documentElement;
    if (!root) throw new Error("Fixture has no root element.");

    expect(validateEmbeddedRsl(root)).toEqual([]);
  });

  it("rejects multiple accepts elements", () => {
    const document = parseXml(
      `<rsl:rsl xmlns:rsl="https://rslstandard.org/rsl">
        <rsl:content url="https://publisher.example/book.epub">
          <rsl:license>
            <rsl:payment type="use">
              <rsl:accepts type="application/x402+json"/>
              <rsl:accepts type="application/example+json"/>
            </rsl:payment>
          </rsl:license>
        </rsl:content>
      </rsl:rsl>`,
      "multiple accepts fixture",
    );
    const root = document.documentElement;
    if (!root) throw new Error("Fixture has no root element.");

    expect(validateEmbeddedRsl(root)).toContainEqual(
      expect.objectContaining({ level: "error", code: "multiple-accepts" }),
    );
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

  it("treats an omitted payment as a valid free license", () => {
    const rsl = buildRslElement({
      content: { url: "https://publisher.example/book.epub" },
      license: {},
    });

    expect(validateEmbeddedRsl(rsl)).toEqual([]);
  });

  it("rejects non-lowercase encrypted values in existing RSL", () => {
    const document = parseXml(
      `<rsl:rsl xmlns:rsl="https://rslstandard.org/rsl">
        <rsl:content url="https://publisher.example/book.epub" encrypted="TRUE">
          <rsl:license/>
        </rsl:content>
      </rsl:rsl>`,
      "encrypted fixture",
    );
    const root = document.documentElement;
    if (!root) throw new Error("Fixture has no root element.");

    expect(validateEmbeddedRsl(root)).toContainEqual(
      expect.objectContaining({ level: "error", code: "invalid-encrypted" }),
    );
  });
});
