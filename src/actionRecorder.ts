/// <reference path="./types.ts" />
/// <reference path="./state.ts" />

function recordAction(
  action: Types.Action,
  shouldUpdateLast: boolean = false
): void {
  chrome.storage.local.get(
    ["actions", "baseUrl"],
    (result: Partial<Types.StorageData>) => {
      const actions: Types.Action[] = result.actions || [];

      // If this is the first action, save the current URL
      if (actions.length === 0 && !result.baseUrl) {
        chrome.storage.local.set({ baseUrl: window.location.href });
      }

      while (shouldUpdateLast && actions.length > 0) {
        const lastAction = actions[actions.length - 1];
        if (
          lastAction.type === action.type &&
          lastAction.selector === action.selector
        ) {
          actions.pop();
        } else {
          break;
        }
      }
      actions.push(action);
      chrome.storage.local.set({ actions });
    }
  );
}
