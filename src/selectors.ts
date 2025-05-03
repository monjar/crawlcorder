/// <reference path="./types.ts" />
/// <reference path="./state.ts" />

function getUniqueSelector(element: HTMLElement): string {
  const root = element.getRootNode() as HTMLElement;
  if (!element || element === root) return "";

  // 1. Unique id
  const id = element.getAttribute("id");
  if (id && root.querySelectorAll(`#${CSS.escape(id)}`).length === 1) {
    return `#${CSS.escape(id)}`;
  }

  // 2. Tag + class combo
  const tag = element.tagName.toLowerCase();
  const classes = Array.from(element.classList).map(CSS.escape);
  let selector = classes.length ? `${tag}.${classes.join(".")}` : tag;

  // 3. Add :nth-of-type if not unique
  if (root.querySelectorAll(selector).length !== 1) {
    const parent = element.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter(
        (sib) => sib.tagName === element.tagName
      );
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(element) + 1; // 1‑based
        selector += `:nth-of-type(${index})`;
      }
    }
  }

  if (root.querySelectorAll(selector).length === 1) {
    return selector; // unique → done
  }

  // 4. Prepend ancestor’s selector recursively
  const parentSel = getUniqueSelector(element.parentElement!);
  return parentSel ? `${parentSel} > ${selector}` : selector;
}

function findTableElement(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    if (
      current.tagName === "TABLE" ||
      current.getAttribute("role") === "table" ||
      current.classList.contains("table")
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function isInteractiveClick(event: MouseEvent): boolean {
  const target = event.target as HTMLElement;
  const tag = target.tagName.toLowerCase();
  if (tag === "button" || tag === "a" || tag === "input") return true;
  if (
    target.getAttribute("role") === "button" ||
    target.getAttribute("role") === "link" ||
    target.getAttribute("onclick")
  )
    return true;

  const hasClickCursor = getComputedStyle(target).cursor === "pointer";
  const isFocusable = target.tabIndex >= 0;
  return hasClickCursor || isFocusable;
}

function shouldIgnoreElement(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    if (current.classList.contains("ignore-recorder")) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function isHighlightableElement(element: HTMLElement): boolean {
  if (shouldIgnoreElement(element)) return false;
  if (element.children.length > 0) return false;
  const text = element.textContent?.trim();
  return !!text;
}
