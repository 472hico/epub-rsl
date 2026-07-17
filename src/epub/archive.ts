import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import yauzl, { type Entry } from "yauzl";
import yazl from "yazl";

import { EpubRslError } from "../errors.js";

export interface EpubEntry {
  readonly path: string;
  readonly data: Buffer;
  readonly compressionMethod: number;
  readonly offset: number;
}

export interface EpubArchive {
  readonly entries: EpubEntry[];
  readonly mimetypeValid: boolean;
  readonly mimetypeFirst: boolean;
  readonly mimetypeStored: boolean;
}

function isUnsafePath(path: string): boolean {
  return path.startsWith("/") || path.split("/").some((part) => part === "..");
}

function readEntry(zipFile: yauzl.ZipFile, entry: Entry): Promise<Buffer> {
  return new Promise((resolveBuffer, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }
      if (!stream) {
        reject(new EpubRslError(`Could not read ZIP entry: ${entry.fileName}`));
        return;
      }

      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.once("error", reject);
      stream.once("end", () => resolveBuffer(Buffer.concat(chunks)));
    });
  });
}

export async function readEpubArchive(filePath: string): Promise<EpubArchive> {
  const absolutePath = resolve(filePath);

  return await new Promise((resolveArchive, reject) => {
    yauzl.open(absolutePath, { lazyEntries: true, decodeStrings: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(
          new EpubRslError(
            `Could not open EPUB as a ZIP archive: ${openError?.message ?? absolutePath}`,
          ),
        );
        return;
      }

      const entries: EpubEntry[] = [];
      const seen = new Set<string>();

      zipFile.once("error", reject);
      zipFile.once("end", () => {
        const mimetype = entries.find((entry) => entry.path === "mimetype");
        resolveArchive({
          entries,
          mimetypeValid: mimetype?.data.toString("utf8") === "application/epub+zip",
          mimetypeFirst: entries[0]?.path === "mimetype",
          mimetypeStored: mimetype?.compressionMethod === 0,
        });
      });

      zipFile.on("entry", (entry: Entry) => {
        void (async () => {
          try {
            if (isUnsafePath(entry.fileName)) {
              throw new EpubRslError(`Unsafe path in EPUB archive: ${entry.fileName}`);
            }
            if (seen.has(entry.fileName)) {
              throw new EpubRslError(`Duplicate path in EPUB archive: ${entry.fileName}`);
            }
            seen.add(entry.fileName);

            if (entry.fileName.endsWith("/")) {
              zipFile.readEntry();
              return;
            }

            const data = await readEntry(zipFile, entry);
            entries.push({
              path: entry.fileName,
              data,
              compressionMethod: entry.compressionMethod,
              offset: entry.relativeOffsetOfLocalHeader,
            });
            zipFile.readEntry();
          } catch (error) {
            zipFile.close();
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        })();
      });

      zipFile.readEntry();
    });
  });
}

export async function writeEpubArchive(
  entries: readonly EpubEntry[],
  outputPath: string,
): Promise<void> {
  const mimetype = entries.find((entry) => entry.path === "mimetype");
  if (!mimetype || mimetype.data.toString("utf8") !== "application/epub+zip") {
    throw new EpubRslError("EPUB must contain a valid mimetype entry.");
  }

  const absoluteOutput = resolve(outputPath);
  await mkdir(dirname(absoluteOutput), { recursive: true });
  const temporaryPath = `${absoluteOutput}.${randomUUID()}.tmp`;
  const zipFile = new yazl.ZipFile();

  const complete = new Promise<void>((resolveWrite, reject) => {
    const output = createWriteStream(temporaryPath, { flags: "wx" });
    output.once("error", reject);
    output.once("close", resolveWrite);
    zipFile.outputStream.once("error", reject);
    zipFile.outputStream.pipe(output);
  });

  zipFile.addBuffer(mimetype.data, "mimetype", { compress: false });
  for (const entry of entries) {
    if (entry.path === "mimetype") continue;
    zipFile.addBuffer(entry.data, entry.path, { compress: true });
  }
  zipFile.end();

  try {
    await complete;
    await rename(temporaryPath, absoluteOutput);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
