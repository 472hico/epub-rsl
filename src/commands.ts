import { constants } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import { EpubRslError } from "./errors.js";
import { writeEpubArchive } from "./epub/archive.js";
import {
  findEmbeddedRsl,
  inspectBookMetadata,
  loadEpubPackage,
  replaceOpfEntry,
  embedRsl,
} from "./epub/opf.js";
import { examplePolicy, formatPolicy, loadPolicy } from "./rsl/policy.js";
import { buildRslElement, serializeRsl, validateEmbeddedRsl } from "./rsl/xml.js";

export interface OutputOptions {
  readonly json?: boolean;
}

export interface ApplyOptions {
  readonly policy: string;
  readonly output?: string;
  readonly outputDir?: string;
  readonly json?: boolean;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function print(value: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  } else if (typeof value === "string") {
    process.stdout.write(`${value}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  }
}

export async function initPolicy(outputPath: string): Promise<void> {
  const absolutePath = resolve(outputPath);
  if (await pathExists(absolutePath)) {
    throw new EpubRslError(`Refusing to overwrite existing file: ${absolutePath}`);
  }
  await writeFile(absolutePath, formatPolicy(examplePolicy), { encoding: "utf8", flag: "wx" });
  print(`Created ${absolutePath}`, false);
}

export async function inspectEpub(filePath: string, options: OutputOptions): Promise<void> {
  const epubPackage = await loadEpubPackage(filePath);
  const metadata = inspectBookMetadata(epubPackage.opfDocument);
  const embedded = findEmbeddedRsl(epubPackage.opfDocument);
  const result = {
    file: resolve(filePath),
    opfPath: epubPackage.opfPath,
    metadata,
    archive: {
      mimetypeValid: epubPackage.archive.mimetypeValid,
      mimetypeFirst: epubPackage.archive.mimetypeFirst,
      mimetypeStored: epubPackage.archive.mimetypeStored,
    },
    rsl: embedded.map((element) => ({
      xml: serializeRsl(element),
      issues: validateEmbeddedRsl(element),
    })),
  };

  if (options.json) {
    print(result, true);
    return;
  }

  const lines = [
    `File: ${result.file}`,
    `OPF: ${result.opfPath}`,
    `Title: ${metadata.title ?? "(unknown)"}`,
    `Creator: ${metadata.creators.join(", ") || "(unknown)"}`,
    `Language: ${metadata.language ?? "(unknown)"}`,
    `EPUB version: ${metadata.epubVersion ?? "(unknown)"}`,
    `RSL: ${embedded.length === 0 ? "not embedded" : `${embedded.length} fragment(s)`}`,
  ];
  if (embedded[0]) lines.push("", serializeRsl(embedded[0]));
  print(lines.join("\n"), false);
}

function defaultOutput(input: string, outputDir?: string): string {
  const extension = extname(input);
  const stem = basename(input, extension);
  return join(outputDir ? resolve(outputDir) : dirname(resolve(input)), `${stem}.rsl.epub`);
}

export async function applyPolicy(files: readonly string[], options: ApplyOptions): Promise<void> {
  if (files.length > 1 && options.output) {
    throw new EpubRslError("--output can only be used with a single EPUB.");
  }

  const policy = await loadPolicy(options.policy);
  const generatedRsl = buildRslElement(policy);
  const generatedIssues = validateEmbeddedRsl(generatedRsl).filter(
    (issue) => issue.level === "error",
  );
  if (generatedIssues.length > 0) {
    throw new EpubRslError(
      `Policy generated invalid RSL: ${generatedIssues.map((issue) => issue.message).join("; ")}`,
    );
  }

  const results: { input: string; output: string }[] = [];
  for (const filePath of files) {
    const input = resolve(filePath);
    const output = resolve(options.output ?? defaultOutput(input, options.outputDir));
    if (input === output) {
      throw new EpubRslError("Output must differ from input; in-place updates are not supported.");
    }
    if (await pathExists(output)) {
      throw new EpubRslError(`Refusing to overwrite existing file: ${output}`);
    }

    const epubPackage = await loadEpubPackage(input);
    embedRsl(epubPackage.opfDocument, generatedRsl);
    await writeEpubArchive(replaceOpfEntry(epubPackage), output);
    results.push({ input, output });
  }

  if (options.json) {
    print(results, true);
  } else {
    print(results.map((result) => `Created ${result.output}`).join("\n"), false);
  }
}

export async function validateEpub(
  files: readonly string[],
  options: OutputOptions,
): Promise<boolean> {
  const results: {
    file: string;
    valid: boolean;
    issues: { level: "error" | "warning"; code: string; message: string }[];
  }[] = [];

  for (const filePath of files) {
    const issues: { level: "error" | "warning"; code: string; message: string }[] = [];
    try {
      const epubPackage = await loadEpubPackage(filePath);
      if (!epubPackage.archive.mimetypeValid) {
        issues.push({
          level: "error",
          code: "invalid-mimetype",
          message: "mimetype must contain application/epub+zip.",
        });
      }
      if (!epubPackage.archive.mimetypeFirst) {
        issues.push({
          level: "error",
          code: "mimetype-not-first",
          message: "mimetype must be the first ZIP entry.",
        });
      }
      if (!epubPackage.archive.mimetypeStored) {
        issues.push({
          level: "error",
          code: "mimetype-compressed",
          message: "mimetype must be stored without compression.",
        });
      }

      const embedded = findEmbeddedRsl(epubPackage.opfDocument);
      if (embedded.length === 0) {
        issues.push({
          level: "error",
          code: "missing-rsl",
          message: "EPUB does not contain embedded RSL metadata.",
        });
      } else if (embedded.length > 1) {
        issues.push({
          level: "error",
          code: "multiple-rsl",
          message: "EPUB contains multiple embedded RSL fragments.",
        });
      }
      for (const element of embedded) issues.push(...validateEmbeddedRsl(element));
    } catch (error) {
      issues.push({
        level: "error",
        code: "invalid-epub",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    results.push({
      file: resolve(filePath),
      valid: !issues.some((issue) => issue.level === "error"),
      issues,
    });
  }

  if (options.json) {
    print(results, true);
  } else {
    const lines = results.flatMap((result) => [
      `${result.valid ? "PASS" : "FAIL"} ${result.file}`,
      ...result.issues.map(
        (issue) =>
          `  ${issue.level === "error" ? "ERROR" : "WARN"} ${issue.code}: ${issue.message}`,
      ),
    ]);
    print(lines.join("\n"), false);
  }
  return results.every((result) => result.valid);
}
