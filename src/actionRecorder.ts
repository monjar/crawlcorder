/// <reference path="./types.ts" />
/// <reference path="./state.ts" />

function recordAction(
  action: Types.Action,
  shouldUpdateLast: boolean = false
): void {
  chrome.storage.local.get(
    ["actions"],
    (result: Partial<Types.StorageData>) => {
      const actions: Types.Action[] = result.actions || [];
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
