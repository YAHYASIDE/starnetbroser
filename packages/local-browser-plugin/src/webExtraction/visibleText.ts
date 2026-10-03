const BLOCK_TAGS = new Set([
  "DIV", "P", "LI", "TR", "H1", "H2", "H3", "H4", "H5", "H6", "SECTION", "HEADER", "FOOTER", "TABLE", "BR",
]);

/**
 * A from-scratch, block-aware text serializer - deliberately not HTMLElement#innerText, which
 * depends on real layout and behaves inconsistently between jsdom (used in tests) and a real
 * WebView. Walking the DOM directly like this behaves identically in both, which is what makes
 * the same extraction code trustworthy in tests and safe to inject for real.
 */
export function toVisibleText(root: Element): string {
  let out = "";

  function walk(node: Node) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== 1 /* ELEMENT_NODE */) return;

    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE") return;
    if (el.hidden) return;
    if (el.style && el.style.display === "none") return;

    for (const child of Array.from(el.childNodes)) {
      walk(child);
    }

    if (BLOCK_TAGS.has(tag)) {
      out += "\n";
    }
  }

  walk(root);
  return out;
}

export function toLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
