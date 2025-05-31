/// <reference path="./types.ts" />
/// <reference path="./state.ts" />
/// <reference path="./selectors.ts" />
/// <reference path="./actionRecorder.ts" />

function handleClick(event: MouseEvent): void {
  if (!isRecording) return;
  const target = event.target as HTMLElement;
  if (shouldIgnoreElement(target)) return;

  // Table selection mode
  if (tableLoopState === TableLoopState.SELECTING) {
    const tableElement = findTableElement(target);
    if (tableElement) {
      selectedTable = tableElement;
      tableLoopState = TableLoopState.SELECTING_NEXT_BUTTON;
      recordAction({
        type: "tableLoopStart",
        selector: getUniqueSelector(tableElement),
        timestamp: Date.now(),
      });
      updateTableLoopButton();
      return;
    }
  }

  // Next button selection mode
  if (tableLoopState === TableLoopState.SELECTING_NEXT_BUTTON) {
    if (isInteractiveClick(event)) {
      // Record the next button selector
      recordAction({
        type: "tablePaginationNext",
        selector: getUniqueSelector(target),
        timestamp: Date.now(),
      });
      tableLoopState = TableLoopState.ACTIVE;
      updateTableLoopButton();
      return;
    }
  }

  // General click recording
  if (isInteractiveClick(event)) {
    recordAction({
      type: "click",
      selector: getUniqueSelector(target),
      timestamp: Date.now(),
    });
  }
}

function handleInput(event: Event): void {
  if (!isRecording) return;
  const target = event.target as HTMLInputElement;
  if (shouldIgnoreElement(target)) return;
  const selector = getUniqueSelector(target);
  recordAction(
    {
      type: "input",
      selector,
      value: target.value,
      timestamp: Date.now(),
    },
    true
  );
}

function handleSelect(event: Event): void {
  if (!isRecording) return;
  const target = event.target as HTMLSelectElement;
  if (shouldIgnoreElement(target)) return;
  const selector = getUniqueSelector(target);
  if (!selector || !target || !target.options) return;
  const selectedOption = target.options[target.selectedIndex];
  recordAction({
    type: "select",
    selector,
    value: target.value,
    selectedText: selectedOption ? selectedOption.text : "",
    timestamp: Date.now(),
  });
}

// Key event handlers
document.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Control") {
    if (isControlPressed) {
      unfixTooltip();
      isControlPressed = false;
    } else {
      isControlPressed = true;
    }
  }
});

document.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Alt") {
    isAltPressed = true;
    e.preventDefault();
  }
});

document.addEventListener("keyup", (e: KeyboardEvent) => {
  if (e.key === "Alt") {
    isAltPressed = false;
    if (lastHighlightedTable) {
      lastHighlightedTable.classList.remove("recorder-highlight-table");
      lastHighlightedTable = null;
    }
    // If a table has been selected via Alt, record tableLoopStart
    if (selectedTable) {
      recordAction({
        type: "tableLoopStart",
        selector: getUniqueSelector(selectedTable),
        timestamp: Date.now(),
      });
      selectedTable = null;
    }
  }
});
