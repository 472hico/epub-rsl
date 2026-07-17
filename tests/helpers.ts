import { type EpubEntry, writeEpubArchive } from "../src/epub/archive.js";

interface FixtureOptions {
  readonly version?: "2.0" | "3.0";
  readonly rsl?: string;
  readonly omitMetadata?: boolean;
}

function entry(path: string, data: string): EpubEntry {
  return {
    path,
    data: Buffer.from(data, "utf8"),
    compressionMethod: path === "mimetype" ? 0 : 8,
    offset: 0,
  };
}

export async function createEpub(filePath: string, options: FixtureOptions = {}): Promise<void> {
  const version = options.version ?? "3.0";
  const rslNamespace = options.rsl ? ' xmlns:rsl="https://rslstandard.org/rsl"' : "";
  const metadata = options.omitMetadata
    ? ""
    : `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:isbn:9780000000000</dc:identifier>
    <dc:title>Fixture Book</dc:title>
    <dc:creator>Example Author</dc:creator>
    <dc:language>en</dc:language>
    ${options.rsl ?? ""}
  </metadata>`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf"${rslNamespace} version="${version}" unique-identifier="book-id">
  ${metadata}
  <manifest>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="chapter"/></spine>
</package>`;

  const entries = [
    entry("mimetype", "application/epub+zip"),
    entry(
      "META-INF/container.xml",
      `<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    ),
    entry("EPUB/content.opf", opf),
    entry(
      "EPUB/chapter.xhtml",
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello</p></body></html>',
    ),
  ];
  await writeEpubArchive(entries, filePath);
}
