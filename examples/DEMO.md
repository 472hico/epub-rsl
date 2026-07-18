# Demo: embed RSL in a sample EPUB

This folder contains a public-domain style sample book for trying `epub-rsl`.

| File                   | Purpose                 |
| ---------------------- | ----------------------- |
| `sample-book.epub`     | EPUB without RSL        |
| `sample-book.rsl.epub` | Same book after `apply` |
| `rsl-policy.yaml`      | Demo licensing policy   |
| `run-demo.sh`          | One-command walkthrough |

## One command

From the repository root:

```bash
./examples/run-demo.sh
```

Or with the published package only:

```bash
npx epub-rsl@0.1.0 inspect examples/sample-book.epub
npx epub-rsl@0.1.0 apply examples/sample-book.epub \
  --policy examples/rsl-policy.yaml \
  --output /tmp/sample-book.rsl.epub
npx epub-rsl@0.1.0 inspect /tmp/sample-book.rsl.epub
npx epub-rsl@0.1.0 validate /tmp/sample-book.rsl.epub
```

## What you should see

**Before**

```text
Title: A Quiet Protocol
RSL: not embedded
```

**After**

```text
RSL: 1 fragment(s)
<rsl:rsl ...>
  permits: search ai-input
  prohibits: ai-train
  payment: use $0.01 via application/x402+json
</rsl:rsl>
```

**Validate**

```text
PASS .../sample-book.rsl.epub
```

The source `sample-book.epub` stays unchanged. `apply` always writes a new file.
