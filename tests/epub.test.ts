import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { applyPolicy, initPolicy, validateEpub } from "../src/commands.js";
import { readEpubArchive } from "../src/epub/archive.js";
import {
  embedRsl,
  findEmbeddedRsl,
  inspectBookMetadata,
  loadEpubPackage,
} from "../src/epub/opf.js";
import { buildRslElement, serializeRsl, validateEmbeddedRsl } from "../src/rsl/xml.js";
import { examplePolicy, formatPolicy } from "../src/rsl/policy.js";
import { serializeXml } from "../src/xml.js";
import { createEpub } from "./helpers.js";

describe("EPUB processing", () => {
  it.each(["2.0", "3.0"] as const)("loads EPUB %s metadata", async (version) => {
    const directory = await mkdtemp(join(tmpdir(), "epub-rsl-"));
    const file = join(directory, `book-${version}.epub`);
    await createEpub(file, { version });

    const epubPackage = await loadEpubPackage(file);
    expect(epubPackage.opfPath).toBe("EPUB/content.opf");
    expect(inspectBookMetadata(epubPackage.opfDocument)).toMatchObject({
      title: "Fixture Book",
      creators: ["Example Author"],
      language: "en",
      epubVersion: version,
    });
  });

  it("builds valid embedded RSL", () => {
    const rsl = buildRslElement(examplePolicy);
    expect(validateEmbeddedRsl(rsl)).toEqual([]);
    expect(rsl.namespaceURI).toBe("https://rslstandard.org/rsl");
    expect(serializeRsl(rsl).match(/xmlns:rsl=/g)).toHaveLength(1);
  });

  it("replaces one existing RSL fragment and rejects multiple fragments", async () => {
    const directory = await mkdtemp(join(tmpdir(), "epub-rsl-"));
    const file = join(directory, "book.epub");
    const existing =
      '<rsl:rsl><rsl:content url="https://old.example/book.epub"><rsl:license><rsl:payment type="free"/></rsl:license></rsl:content></rsl:rsl>';
    await createEpub(file, { rsl: existing });

    const epubPackage = await loadEpubPackage(file);
    embedRsl(epubPackage.opfDocument, buildRslElement(examplePolicy));
    expect(findEmbeddedRsl(epubPackage.opfDocument)).toHaveLength(1);
    expect(findEmbeddedRsl(epubPackage.opfDocument)[0]?.textContent).toContain("0.01");

    const metadata = epubPackage.opfDocument.getElementsByTagNameNS(
      "http://www.idpf.org/2007/opf",
      "metadata",
    )[0]!;
    metadata.appendChild(epubPackage.opfDocument.importNode(buildRslElement(examplePolicy), true));
    expect(() => embedRsl(epubPackage.opfDocument, buildRslElement(examplePolicy))).toThrow(
      /multiple embedded RSL/,
    );
  });

  it("is idempotent when the same policy is embedded repeatedly", async () => {
    const directory = await mkdtemp(join(tmpdir(), "epub-rsl-"));
    const file = join(directory, "book.epub");
    await createEpub(file);
    const epubPackage = await loadEpubPackage(file);
    const rsl = buildRslElement(examplePolicy);

    embedRsl(epubPackage.opfDocument, rsl);
    const first = serializeXml(epubPackage.opfDocument);
    embedRsl(epubPackage.opfDocument, rsl);
    const second = serializeXml(epubPackage.opfDocument);

    expect(second).toBe(first);
  });

  it("rejects an OPF without metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "epub-rsl-"));
    const file = join(directory, "invalid.epub");
    await createEpub(file, { omitMetadata: true });

    await expect(loadEpubPackage(file)).rejects.toThrow(/exactly one metadata/);
  });

  it("applies a policy without modifying the source and writes a compliant archive", async () => {
    const directory = await mkdtemp(join(tmpdir(), "epub-rsl-"));
    const input = join(directory, "book.epub");
    const output = join(directory, "book.rsl.epub");
    const policy = join(directory, "policy.yaml");
    await createEpub(input);
    await writeFile(policy, formatPolicy(examplePolicy), "utf8");
    const before = await readFile(input);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await applyPolicy([input], { policy, output });

    expect(await readFile(input)).toEqual(before);
    const archive = await readEpubArchive(output);
    expect(archive).toMatchObject({
      mimetypeValid: true,
      mimetypeFirst: true,
      mimetypeStored: true,
    });
    const outputPackage = await loadEpubPackage(output);
    const embedded = findEmbeddedRsl(outputPackage.opfDocument);
    expect(embedded).toHaveLength(1);
    expect(validateEmbeddedRsl(embedded[0]!)).toEqual([]);
    expect(await validateEpub([output], { json: true })).toBe(true);
  });

  it("refuses to overwrite output", async () => {
    const directory = await mkdtemp(join(tmpdir(), "epub-rsl-"));
    const input = join(directory, "book.epub");
    const output = join(directory, "existing.epub");
    const policy = join(directory, "policy.yaml");
    await createEpub(input);
    await writeFile(output, "keep", "utf8");
    await writeFile(policy, formatPolicy(examplePolicy), "utf8");

    await expect(applyPolicy([input], { policy, output })).rejects.toThrow(/Refusing to overwrite/);
    expect(await readFile(output, "utf8")).toBe("keep");
  });

  it("initializes a policy once and reports missing RSL as invalid", async () => {
    const directory = await mkdtemp(join(tmpdir(), "epub-rsl-"));
    const policy = join(directory, "rsl-policy.yaml");
    const input = join(directory, "book.epub");
    await createEpub(input);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await initPolicy(policy);
    expect(await readFile(policy, "utf8")).toContain("application/x402+json");
    await expect(initPolicy(policy)).rejects.toThrow(/Refusing to overwrite/);
    expect(await validateEpub([input], { json: true })).toBe(false);
  });
});
