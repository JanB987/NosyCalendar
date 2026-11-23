// Test double for Obsidian's Node helpers. Receiver ownership deliberately wins over focus.
export function installDomHelpers(doc) {
  const win = doc.defaultView;
  function createEl(tag, options = {}, callback) {
    const owner = this.ownerDocument ?? doc;
    const element = owner.createElement(tag);
    const opts = typeof options === 'string' ? { cls: options } : options;
    if (opts.cls) element.className = Array.isArray(opts.cls) ? opts.cls.join(' ') : opts.cls;
    if (opts.text !== undefined) element.textContent = opts.text;
    for (const [name, value] of Object.entries(opts.attr ?? {})) element.setAttribute(name, value);
    callback?.(element);
    if (opts.prepend) this.insertBefore(element, this.firstChild); else this.appendChild(element);
    return element;
  }
  function createDiv(options, callback) { return this.createEl('div', options, callback); }
  function createSpan(options, callback) { return this.createEl('span', options, callback); }
  Object.defineProperties(win.Node.prototype, {
    createEl: { configurable: true, value: createEl },
    createDiv: { configurable: true, value: createDiv },
    createSpan: { configurable: true, value: createSpan },
    win: { configurable: true, get() { return (this.ownerDocument ?? doc).defaultView; } }
  });
}
