# epub-rsl

[English](README.md)

`epub-rsl`は、EPUBへ
[Really Simple Licensing（RSL）1.0](https://rslstandard.org/rsl)のメタデータを安全に埋め込み、
検証するCLIです。

出版社、著者、出版制作パイプラインが、AI学習、AI入力、索引、検索、出典表記、買い切り、
従量利用などの条件を機械可読にする用途を想定しています。

> [!IMPORTANT]
> RSLは利用条件を宣言します。RSLを埋め込むだけでは、EPUBの暗号化、条件の強制、決済、
> コピー防止は行われません。強制するにはライセンスサーバー、アクセス制御、EMS、
> CAP/OLP、x402などの決済プロトコルを別途組み合わせる必要があります。

## 現在の状態

このプロジェクトは初期MVPです。EPUBファイル全体を1つの資産としてRSLを埋め込めます。
ライセンスサーバー、章単位API、DRM、EMS暗号化、x402決済処理はまだ提供しません。

## 必要環境

- Node.js 20以上
- npm 10以上

## ソースからインストール

npmパッケージはまだ公開していません。

```bash
git clone https://github.com/472hico/epub-rsl.git
cd epub-rsl
npm install
npm run build
npm link
```

## クイックスタート

ポリシーの雛形を作ります。

```bash
epub-rsl init
```

生成された`rsl-policy.yaml`を編集します。

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
      type: application/x402+json
```

EPUBへ埋め込みます。

```bash
epub-rsl apply book.epub --policy rsl-policy.yaml
```

`book.rsl.epub`が新しく作られ、原本は変更されません。

結果を確認・検証します。

```bash
epub-rsl inspect book.rsl.epub
epub-rsl validate book.rsl.epub
```

## コマンド

### `init [output]`

既存ファイルを上書きせず、ポリシーの雛形を生成します。

```bash
epub-rsl init publisher-policy.yaml
```

### `inspect <file>`

書誌情報、EPUBアーカイブの状態、埋め込まれたRSLを表示します。

```bash
epub-rsl inspect book.epub
epub-rsl inspect book.epub --json
```

### `apply <files...>`

RSLを埋め込みます。既存RSLが1つなら更新し、複数あれば競合として停止します。

```bash
epub-rsl apply book.epub --policy policy.yaml --output licensed.epub
epub-rsl apply books/*.epub --policy policy.yaml --output-dir dist
```

出力はアトミックに作成し、入力や既存出力は上書きしません。再梱包後もEPUBで必須の
「`mimetype`が先頭かつ無圧縮」というZIP要件を保ちます。

### `validate <files...>`

EPUBコンテナ、OPFの検出、`mimetype`要件、RSL構造、canonical URL、ルール種別、
決済種別、通貨、x402 JSONを検査します。

```bash
epub-rsl validate dist/*.epub
epub-rsl validate book.epub --json
```

エラーがあれば終了コード`1`を返すため、CIでも利用できます。

## 対応するRSLポリシー

- `content.url`、`content.server`、`content.encrypted`
- `usage`、`user`、`geo`を対象にした`permits`と`prohibits`
- `purchase`、`subscription`、`training`、`crawl`、`use`、`contribution`、
  `attribution`、`free`の各決済種別
- `amount`、`standard`、`custom`、1つの`accepts`
- `application/x402+json`によるx402利用宣言

RSL 1.0標準のusage/user語彙を検証します。拡張トークンには、RSL XML内で名前空間を
宣言したQNameが必要です。

## 埋め込み方法

EPUBはZIPコンテナです。`epub-rsl`は`META-INF/container.xml`からOPFを特定し、
その`metadata`要素へ名前空間付きの`rsl:rsl`を1つ追加します。RSLはEPUBと一緒に流通し、
canonical URLで出版物を識別します。

ストア固有のDRMや署名を適用する前にRSLを付与してください。保護済みEPUBを変更すると、
署名やDRMパッケージが無効になる可能性があります。

## 開発

```bash
npm install
npm run check
```

[CONTRIBUTING.md](CONTRIBUTING.md)と[SECURITY.md](SECURITY.md)も参照してください。

## ライセンス

Apache-2.0
