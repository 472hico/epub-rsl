import {
  DOMParser,
  XMLSerializer,
  type Document as XmlDocument,
  type Element as XmlElement,
  type Node as XmlNode,
} from "@xmldom/xmldom";

import { EpubRslError } from "./errors.js";

export function parseXml(xml: string, label: string): XmlDocument {
  const messages: string[] = [];
  const document = new DOMParser({
    onError: (_level, message) => messages.push(message),
  }).parseFromString(xml, "application/xml");

  if (!document.documentElement || messages.length > 0) {
    throw new EpubRslError(`Invalid XML in ${label}: ${messages.join("; ") || "no root element"}`);
  }

  return document;
}

export function serializeXml(document: XmlDocument): string {
  return new XMLSerializer().serializeToString(document);
}

export function childElements(parent: XmlNode, localName?: string): XmlElement[] {
  const elements: XmlElement[] = [];
  for (let index = 0; index < parent.childNodes.length; index += 1) {
    const child = parent.childNodes.item(index);
    if (child?.nodeType !== 1) continue;
    const element = child as XmlElement;
    if (!localName || element.localName === localName) elements.push(element);
  }
  return elements;
}

export function descendantElements(parent: XmlNode, localName: string): XmlElement[] {
  const elements: XmlElement[] = [];
  const visit = (node: XmlNode): void => {
    for (let index = 0; index < node.childNodes.length; index += 1) {
      const child = node.childNodes.item(index);
      if (!child) continue;
      if (child.nodeType === 1) {
        const element = child as XmlElement;
        if (element.localName === localName) elements.push(element);
        visit(element);
      }
    }
  };
  visit(parent);
  return elements;
}
