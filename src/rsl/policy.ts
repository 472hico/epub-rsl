import { readFile } from "node:fs/promises";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { EpubRslError } from "../errors.js";

export const paymentTypes = [
  "purchase",
  "subscription",
  "training",
  "crawl",
  "use",
  "contribution",
  "attribution",
  "free",
] as const;

const urlSchema = z.string().url();
const ruleSchema = z.object({
  type: z.enum(["usage", "user", "geo"]),
  values: z.array(z.string().min(1)).min(1),
});
const amountSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/, "currency must be an ISO 4217 code"),
  value: z.union([z.string().min(1), z.number().nonnegative()]).transform(String),
});
const acceptsSchema = z.object({
  type: z.string().min(1),
  data: z.unknown().optional(),
});
const paymentSchema = z.object({
  type: z.enum(paymentTypes),
  amount: amountSchema.optional(),
  standard: urlSchema.optional(),
  custom: urlSchema.optional(),
  accepts: z.array(acceptsSchema).optional(),
});

export const policySchema = z.object({
  content: z.object({
    url: urlSchema,
    server: urlSchema.optional(),
    encrypted: z.boolean().optional(),
  }),
  license: z
    .object({
      permits: z.array(ruleSchema).optional(),
      prohibits: z.array(ruleSchema).optional(),
      payment: paymentSchema.optional(),
    })
    .refine(
      (license) => license.permits || license.prohibits || license.payment,
      "license must define permits, prohibits, or payment",
    ),
});

export type RslPolicy = z.infer<typeof policySchema>;

export const examplePolicy: RslPolicy = {
  content: {
    url: "https://publisher.example/books/example-book.epub",
    server: "https://license.publisher.example",
  },
  license: {
    permits: [{ type: "usage", values: ["search", "ai-input"] }],
    prohibits: [{ type: "usage", values: ["ai-train"] }],
    payment: {
      type: "use",
      amount: { currency: "USD", value: "0.01" },
      accepts: [{ type: "application/x402+json" }],
    },
  },
};

export function formatPolicy(policy: RslPolicy): string {
  return stringifyYaml(policy, { lineWidth: 100 });
}

export async function loadPolicy(filePath: string): Promise<RslPolicy> {
  let parsed: unknown;
  try {
    parsed = parseYaml(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new EpubRslError(
      `Could not read policy file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = policySchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "policy"}: ${issue.message}`)
      .join("; ");
    throw new EpubRslError(`Invalid RSL policy: ${details}`);
  }
  if (result.data.content.encrypted && !result.data.content.server) {
    throw new EpubRslError("Encrypted content requires content.server.");
  }
  return result.data;
}
