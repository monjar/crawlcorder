/// <reference path="./types.ts" />

// Shared state variables
let isRecording: boolean = false;
let lastHighlightedElement: HTMLElement | null = null;
let isControlPressed: boolean = false;
let isTooltipFixed: boolean = false;
let isAltPressed: boolean = false;
let selectedTable: HTMLElement | null = null;
let lastHighlightedTable: HTMLElement | null = null;

// Table loop state
enum TableLoopState {
  INACTIVE,
  SELECTING,
  ACTIVE,
}

let tableLoopState: TableLoopState = TableLoopState.INACTIVE;
