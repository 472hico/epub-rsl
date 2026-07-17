# epub-rsl

[日本語](README.ja.md)

`epub-rsl` is a command-line tool that safely embeds and validates
[Really Simple Licensing (RSL) 1.0](https://rslstandard.org/rsl) metadata in EPUB files.

It is designed for publishers, authors, and automated publishing pipelines that need
machine-readable terms for AI training, AI input, indexing, search, attribution, purchase, or
usage-based licensing.

> [!IMPORTANT]
> RSL metadata declares licensing terms. It does not encrypt an EPUB, enforce those terms, collect
> payments, or prevent copying by itself. A license server, access control, EMS, CAP/OLP, or a
> payment protocol such as x402 is required for enforcement.

## Status

This project is an early MVP. It supports embedded RSL metadata for a whole EPUB asset. It does not
yet provide a license server, chapter-level API, DRM, EMS encryption, or x402 settlement.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Install from source

The npm package is not published yet.

```bash
git clone https://github.com/472hico/epub-rsl.git
cd epub-rsl
npm install
npm run build
npm link
```

## Quick start

Create an example policy:

```bash
epub-rsl init
```

Edit `rsl-policy.yaml`:

```yaml
content:
  url: https://publisher.example/books/example-book.epub
  server: https://license.publisher.example
license:
  permits:
    - type: usage
      values:
        - search
        - ai-input
  prohibits:
    - type: usage
      values:
        - ai-train
  payment:
    type: use
    amount:
      currency: USD
      value: "0.01"
    accepts:
      - type: application/x402+json
```

Embed the policy:

```bash
epub-rsl apply book.epub --policy rsl-policy.yaml
```

This creates `book.rsl.epub`. The source file is never modified.

Inspect and validate the result:

```bash
epub-rsl inspect book.rsl.epub
epub-rsl validate book.rsl.epub
```

## Commands

### `init [output]`

Creates an example policy without overwriting an existing file.

```bash
epub-rsl init publisher-policy.yaml
```

### `inspect <file>`

Shows EPUB metadata, archive checks, and embedded RSL.

```bash
epub-rsl inspect book.epub
epub-rsl inspect book.epub --json
```

### `apply <files...>`

Embeds or replaces one existing RSL fragment. Multiple existing fragments are treated as a conflict.

```bash
epub-rsl apply book.epub --policy policy.yaml --output licensed.epub
epub-rsl apply books/*.epub --policy policy.yaml --output-dir dist
```

Output files are created atomically. Existing files and input files are not overwritten. Repacked
EPUBs preserve the required first, uncompressed `mimetype` entry.

### `validate <files...>`

Checks the EPUB container, OPF discovery, EPUB `mimetype` packaging rules, embedded RSL structure,
canonical URLs, rule types, payment types, currencies, and x402 JSON.

```bash
epub-rsl validate dist/*.epub
epub-rsl validate book.epub --json
```

The command exits with status `1` when any error is found, making it suitable for CI.

## Supported RSL policy fields

- `content.url`, `content.server`, and `content.encrypted`
- `permits` and `prohibits` with `usage`, `user`, or `geo` scope
- Payment types: `purchase`, `subscription`, `training`, `crawl`, `use`, `contribution`,
  `attribution`, and `free`
- `amount`, `standard`, `custom`, and one or more `accepts` payment methods
- `application/x402+json` payment declarations

The validator recognizes the RSL 1.0 standard usage and user vocabularies. Unknown tokens are
reported as warnings so extension vocabularies remain possible.

## How embedding works

An EPUB is a ZIP container. `epub-rsl` reads `META-INF/container.xml`, locates the OPF package
document, and adds one namespaced `rsl:rsl` fragment to its `metadata` element. The fragment travels
with the EPUB and identifies the publication through a canonical URL.

Apply RSL before store-specific DRM or signing. Modifying a protected EPUB may invalidate its
signature or DRM package.

## Development

```bash
npm install
npm run check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

Apache-2.0
