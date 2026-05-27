export function installDomShim(): void {
  const proto = HTMLElement.prototype as any;

  if (!proto.empty) {
    proto.empty = function empty() {
      this.innerHTML = "";
      return this;
    };
  }

  if (!proto.addClass) {
    proto.addClass = function addClass(cls: string) {
      this.classList.add(cls);
      return this;
    };
  }

  if (!proto.createDiv) {
    proto.createDiv = function createDiv(opts?: { cls?: string; text?: string }) {
      const el = document.createElement("div") as any;
      if (opts?.cls) el.className = opts.cls;
      if (opts?.text) el.textContent = opts.text;
      this.appendChild(el);
      return el;
    };
  }

  if (!proto.createEl) {
    proto.createEl = function createEl(tag: string, opts?: { cls?: string; text?: string }) {
      const el = document.createElement(tag) as any;
      if (opts?.cls) el.className = opts.cls;
      if (opts?.text) el.textContent = opts.text;
      this.appendChild(el);
      return el;
    };
  }
}