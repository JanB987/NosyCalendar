/** Obsidian's Node helpers use the receiver's document, including in unfocused popouts. */
export function detachedEl<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K): HTMLElementTagNameMap[K] {
  const element = doc.createDocumentFragment().createEl(tag);
  element.remove();
  return element;
}
