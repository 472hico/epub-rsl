#!/usr/bin/env node

import { Command } from "commander";

import { applyPolicy, initPolicy, inspectEpub, validateEpub } from "./commands.js";
import { EpubRslError } from "./errors.js";

const program = new Command();

program
  .name("epub-rsl")
  .description("Safely embed and validate RSL 1.0 metadata in EPUB files.")
  .version("0.1.0");

program
  .command("init")
  .description("Create an example RSL policy file.")
  .argument("[output]", "policy file path", "rsl-policy.yaml")
  .action(async (output: string) => {
    await initPolicy(output);
  });

program
  .command("inspect")
  .description("Show EPUB metadata and embedded RSL.")
  .argument("<file>", "EPUB file")
  .option("--json", "output machine-readable JSON")
  .action(async (file: string, options: { json?: boolean }) => {
    await inspectEpub(file, options);
  });

program
  .command("apply")
  .description("Embed an RSL policy in one or more EPUB files.")
  .argument("<files...>", "EPUB files")
  .requiredOption("-p, --policy <file>", "RSL policy YAML file")
  .option("-o, --output <file>", "output path for a single EPUB")
  .option("--output-dir <directory>", "output directory for all EPUBs")
  .option("--json", "output machine-readable JSON")
  .action(
    async (
      files: string[],
      options: {
        policy: string;
        output?: string;
        outputDir?: string;
        json?: boolean;
      },
    ) => {
      await applyPolicy(files, options);
    },
  );

program
  .command("validate")
  .description("Validate EPUB packaging and embedded RSL metadata.")
  .argument("<files...>", "EPUB files")
  .option("--json", "output machine-readable JSON")
  .action(async (files: string[], options: { json?: boolean }) => {
    const valid = await validateEpub(files, options);
    if (!valid) process.exitCode = 1;
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof EpubRslError) {
    process.stderr.write(`epub-rsl: ${error.message}\n`);
    process.exitCode = error.exitCode;
  } else {
    process.stderr.write(`epub-rsl: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
