import {
  DOMImplementation,
  XMLSerializer,
  type Document as XmlDocument,
  type Element as XmlElement,
} from "@xmldom/xmldom";

import { RSL_NAMESPACE } from "../epub/opf.js";
import { childElements } from "../xml.js";
import { paymentTypes, type RslPolicy } from "./policy.js";

export interface ValidationIssue {
  readonly level: "error" | "warning";
  readonly code: string;
  readonly message: string;
}

const usageTokens = new Set(["all", "ai-all", "ai-train", "ai-input", "ai-index", "search"]);
const userTokens = new Set(["commercial", "non-commercial", "education", "government", "personal"]);

function rslElement(document: XmlDocument, name: string): XmlElement {
  return document.createElementNS(RSL_NAMESPACE, `rsl:${name}`);
}

export function buildRslElement(policy: RslPolicy): XmlElement {
  const document = new DOMImplementation().createDocument(RSL_NAMESPACE, "rsl:rsl", null);
  const root = document.documentElement;
  if (!root) throw new Error("Could not create RSL XML document.");

  const content = rslElement(document, "content");
  content.setAttribute("url", policy.content.url);
  if (policy.content.server) content.setAttribute("server", policy.content.server);
  if (policy.content.encrypted !== undefined) {
    content.setAttribute("encrypted", String(policy.content.encrypted));
  }

  const license = rslElement(document, "license");
  for (const rule of policy.license.permits ?? []) {
    const element = rslElement(document, "permits");
    element.setAttribute("type", rule.type);
    element.appendChild(document.createTextNode(rule.values.join(" ")));
    license.appendChild(element);
  }
  for (const rule of policy.license.prohibits ?? []) {
    const element = rslElement(document, "prohibits");
    element.setAttribute("type", rule.type);
    element.appendChild(document.createTextNode(rule.values.join(" ")));
    license.appendChild(element);
  }

  const paymentPolicy = policy.license.payment;
  if (paymentPolicy) {
    const payment = rslElement(document, "payment");
    payment.setAttribute("type", paymentPolicy.type);
    if (paymentPolicy.amount) {
      const amount = rslElement(document, "amount");
      amount.setAttribute("currency", paymentPolicy.amount.currency);
      amount.appendChild(document.createTextNode(paymentPolicy.amount.value));
      payment.appendChild(amount);
    }
    if (paymentPolicy.standard) {
      const standard = rslElement(document, "standard");
      standard.appendChild(document.createTextNode(paymentPolicy.standard));
      payment.appendChild(standard);
    }
    if (paymentPolicy.custom) {
      const custom = rslElement(document, "custom");
      custom.appendChild(document.createTextNode(paymentPolicy.custom));
      payment.appendChild(custom);
    }
    const accepted = paymentPolicy.accepts;
    if (accepted) {
      const accepts = rslElement(document, "accepts");
      accepts.setAttribute("type", accepted.type);
      if (accepted.data !== undefined) {
        accepts.appendChild(document.createCDATASection(JSON.stringify(accepted.data, null, 2)));
      }
      payment.appendChild(accepts);
    }
    license.appendChild(payment);
  }

  content.appendChild(license);
  root.appendChild(content);
  return root;
}

export function serializeRsl(element: XmlElement): string {
  return new XMLSerializer().serializeToString(element);
}

function checkUrl(value: string, field: string, issues: ValidationIssue[]): void {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      issues.push({
        level: "error",
        code: "invalid-url-scheme",
        message: `${field} must use http or https.`,
      });
    }
  } catch {
    issues.push({
      level: "error",
      code: "invalid-url",
      message: `${field} must be an absolute URL.`,
    });
  }
}

function validateRules(license: XmlElement, issues: ValidationIssue[]): void {
  for (const name of ["permits", "prohibits"]) {
    const seenTypes = new Set<string>();
    for (const rule of childElements(license, name)) {
      const type = rule.getAttribute("type") ?? "";
      if (!["usage", "user", "geo"].includes(type)) {
        issues.push({
          level: "error",
          code: "invalid-rule-type",
          message: `${name} has unsupported type "${type}".`,
        });
        continue;
      }
      if (seenTypes.has(type)) {
        issues.push({
          level: "error",
          code: "duplicate-rule-type",
          message: `${name} may contain at most one element with type "${type}".`,
        });
      }
      seenTypes.add(type);

      const tokens = (rule.textContent ?? "").trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) {
        issues.push({
          level: "error",
          code: "empty-rule",
          message: `${name} type="${type}" must contain at least one token.`,
        });
      }
      for (const token of tokens) {
        const known =
          type === "usage"
            ? usageTokens.has(token)
            : type === "user"
              ? userTokens.has(token)
              : /^[A-Z]{2}$/.test(token);
        const extension = /^([A-Za-z_][\w.-]*):[A-Za-z_][\w.-]*$/.exec(token);
        const extensionNamespace = extension ? rule.lookupNamespaceURI(extension[1]!) : null;
        if (!known && (!extensionNamespace || extensionNamespace === RSL_NAMESPACE)) {
          issues.push({
            level: "error",
            code: "unknown-rule-token",
            message: `${name} type="${type}" contains unknown or unqualified extension token "${token}".`,
          });
        }
      }
    }
  }
}

function validatePayment(license: XmlElement, issues: ValidationIssue[]): void {
  for (const payment of childElements(license, "payment")) {
    const type = payment.getAttribute("type") ?? "";
    if (!paymentTypes.includes(type as (typeof paymentTypes)[number])) {
      issues.push({
        level: "error",
        code: "invalid-payment-type",
        message: `Unsupported payment type "${type}".`,
      });
    }

    for (const amount of childElements(payment, "amount")) {
      if (!/^[A-Z]{3}$/.test(amount.getAttribute("currency") ?? "")) {
        issues.push({
          level: "error",
          code: "invalid-currency",
          message: "Payment currency must be a three-letter ISO 4217 code.",
        });
      }
      if (!(amount.textContent ?? "").trim()) {
        issues.push({
          level: "error",
          code: "missing-amount",
          message: "Payment amount must not be empty.",
        });
      }
    }

    const acceptedMethods = childElements(payment, "accepts");
    if (acceptedMethods.length > 1) {
      issues.push({
        level: "error",
        code: "multiple-accepts",
        message: "RSL 1.0 payment may contain at most one accepts element.",
      });
    }
    for (const accepts of acceptedMethods) {
      if (!accepts.getAttribute("type")) {
        issues.push({
          level: "error",
          code: "missing-accepts-type",
          message: "accepts requires a media type.",
        });
      }
      const body = (accepts.textContent ?? "").trim();
      if (accepts.getAttribute("type") === "application/x402+json" && body) {
        try {
          JSON.parse(body);
        } catch {
          issues.push({
            level: "error",
            code: "invalid-x402-json",
            message: "application/x402+json accepts body must be valid JSON.",
          });
        }
      }
    }
  }
}

export function validateEmbeddedRsl(element: XmlElement): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (element.localName !== "rsl" || element.namespaceURI !== RSL_NAMESPACE) {
    issues.push({
      level: "error",
      code: "invalid-rsl-root",
      message: `RSL root must use the ${RSL_NAMESPACE} namespace.`,
    });
    return issues;
  }

  const contents = childElements(element, "content").filter(
    (child) => child.namespaceURI === RSL_NAMESPACE,
  );
  if (contents.length !== 1) {
    issues.push({
      level: "error",
      code: "embedded-content-count",
      message: "Embedded RSL must contain exactly one rsl:content element.",
    });
    return issues;
  }

  const content = contents[0]!;
  const canonicalUrl = content.getAttribute("url") ?? "";
  if (!canonicalUrl) {
    issues.push({
      level: "error",
      code: "missing-content-url",
      message: "rsl:content requires a canonical url.",
    });
  } else {
    checkUrl(canonicalUrl, "content.url", issues);
  }

  const server = content.getAttribute("server") ?? "";
  if (server) checkUrl(server, "content.server", issues);
  const encrypted = content.getAttribute("encrypted");
  if (encrypted && !["true", "false"].includes(encrypted)) {
    issues.push({
      level: "error",
      code: "invalid-encrypted",
      message: 'content.encrypted must be lowercase "true" or "false".',
    });
  }
  if (encrypted === "true" && !server) {
    issues.push({
      level: "error",
      code: "encrypted-without-server",
      message: "Encrypted content requires an RSL license server.",
    });
  }

  const licenses = childElements(content, "license");
  if (licenses.length === 0) {
    issues.push({
      level: "error",
      code: "missing-license",
      message: "rsl:content requires at least one rsl:license.",
    });
  }
  for (const license of licenses) {
    validateRules(license, issues);
    validatePayment(license, issues);
  }
  return issues;
}
