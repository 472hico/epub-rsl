import { posix } from "node:path";

import type { Document as XmlDocument, Element as XmlElement } from "@xmldom/xmldom";

import { EpubRslError } from "../errors.js";
import { childElements, descendantElements, parseXml, serializeXml } from "../xml.js";
import { type EpubArchive, type EpubEntry, readEpubArchive } from "./archive.js";

export const CONTAINER_PATH = "META-INF/container.xml";
export const RSL_NAMESPACE = "https://rslstandard.org/rsl";

export interface EpubPackage {
  readonly archive: EpubArchive;
  readonly opfPath: string;
  readonly opfDocument: XmlDocument;
}

export interface BookMetadata {
  readonly title?: string;
  readonly creators: string[];
  readonly language?: string;
  readonly identifier?: string;
  readonly epubVersion?: string;
}

function requiredEntry(entries: readonly EpubEntry[], path: string): EpubEntry {
  const entry = entries.find((candidate) => candidate.path === path);
  if (!entry) throw new EpubRslError(`Required EPUB entry is missing: ${path}`);
  return entry;
}

function rootElement(document: XmlDocument): XmlElement {
  const root = document.documentElement;
  if (!root) throw new EpubRslError("XML document has no root element.");
  return root;
}

function containerRootfilePath(containerXml: string): string {
  const document = parseXml(containerXml, CONTAINER_PATH);
  const rootfiles = descendantElements(document, "rootfile");
  const rootfile =
    rootfiles.find(
      (element) => element.getAttribute("media-type") === "application/oebps-package+xml",
    ) ?? rootfiles[0];
  const fullPath = rootfile?.getAttribute("full-path");

  if (!fullPath) {
    throw new EpubRslError("EPUB container.xml does not declare an OPF rootfile.");
  }
  if (fullPath.startsWith("/") || fullPath.split("/").includes("..")) {
    throw new EpubRslError(`Unsafe OPF path in container.xml: ${fullPath}`);
  }
  return posix.normalize(fullPath);
}

export async function loadEpubPackage(filePath: string): Promise<EpubPackage> {
  const archive = await readEpubArchive(filePath);
  const container = requiredEntry(archive.entries, CONTAINER_PATH);
  const opfPath = containerRootfilePath(container.data.toString("utf8"));
  const opf = requiredEntry(archive.entries, opfPath);
  const opfDocument = parseXml(opf.data.toString("utf8"), opfPath);
  const root = rootElement(opfDocument);

  if (root.localName !== "package") {
    throw new EpubRslError(`OPF root element must be <package>: ${opfPath}`);
  }
  if (descendantElements(root, "metadata").length !== 1) {
    throw new EpubRslError(`OPF must contain exactly one metadata element: ${opfPath}`);
  }

  return { archive, opfPath, opfDocument };
}

function firstText(parent: XmlElement, localName: string): string | undefined {
  const element = descendantElements(parent, localName)[0];
  const value = element?.textContent?.trim();
  return value || undefined;
}

export function inspectBookMetadata(document: XmlDocument): BookMetadata {
  const root = rootElement(document);
  const metadata = descendantElements(root, "metadata")[0];
  if (!metadata) throw new EpubRslError("OPF metadata element is missing.");

  const result: BookMetadata = {
    creators: descendantElements(metadata, "creator")
      .map((element) => element.textContent?.trim())
      .filter((value): value is string => Boolean(value)),
  };

  const title = firstText(metadata, "title");
  const language = firstText(metadata, "language");
  const identifier = firstText(metadata, "identifier");
  const epubVersion = root.getAttribute("version") || undefined;

  return {
    ...result,
    ...(title ? { title } : {}),
    ...(language ? { language } : {}),
    ...(identifier ? { identifier } : {}),
    ...(epubVersion ? { epubVersion } : {}),
  };
}

export function findEmbeddedRsl(document: XmlDocument): XmlElement[] {
  const metadata = descendantElements(rootElement(document), "metadata")[0];
  if (!metadata) return [];
  return childElements(metadata, "rsl").filter((element) => element.namespaceURI === RSL_NAMESPACE);
}

export function embedRsl(document: XmlDocument, rslElement: XmlElement): void {
  const root = rootElement(document);
  const metadata = descendantElements(root, "metadata")[0];
  if (!metadata) throw new EpubRslError("OPF metadata element is missing.");

  const existing = findEmbeddedRsl(document);
  if (existing.length > 1) {
    throw new EpubRslError(
      "OPF contains multiple embedded RSL fragments; resolve the conflict before applying a policy.",
    );
  }

  if (!root.hasAttribute("xmlns:rsl")) {
    root.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:rsl", RSL_NAMESPACE);
  }

  const imported = document.importNode(rslElement, true);
  if (existing[0]) {
    metadata.replaceChild(imported, existing[0]);
    return;
  }

  const lastChild = metadata.lastChild;
  if (lastChild?.nodeType === 3 && !lastChild.nodeValue?.trim()) {
    metadata.insertBefore(imported, lastChild);
  } else {
    metadata.appendChild(imported);
  }
}

export function replaceOpfEntry(epubPackage: EpubPackage): EpubEntry[] {
  const xml = serializeXml(epubPackage.opfDocument);
  return epubPackage.archive.entries.map((entry) =>
    entry.path === epubPackage.opfPath ? { ...entry, data: Buffer.from(xml, "utf8") } : entry,
  );
}
