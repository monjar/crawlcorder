/// <reference path="./types.ts" />
/// <reference path="./state.ts" />
/// <reference path="./selectors.ts" />
/// <reference path="./actionRecorder.ts" />
/// <reference path="./tooltip.ts" />
/// <reference path="./handlers.ts" />

chrome.storage.local.get(
  ["isRecording"],
  (result: Partial<Types.StorageData>) => {
    isRecording = result.isRecording || false;
    if (isRecording) {
      console.log("Initializing listeners due to existing recording state");
      initializeListeners();
    }
  }
);

async function initializeListeners(): Promise<void> {
  document.addEventListener("click", handleClick, true);
  document.addEventListener("input", handleInput, true);
  await createRecorderTooltip();
  await createStationaryTooltip();
}

function removeListeners(): void {
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("input", handleInput, true);
  removeRecorderTooltip();
  removeStationaryTooltip();
}

function checkRecordingState(): void {
  chrome.storage.local.get(
    ["isRecording"],
    (result: Partial<Types.StorageData>) => {
      isRecording = result.isRecording || false;
      console.log("checkRecordingState...");
      if (isRecording) {
        initializeListeners();
      }
    }
  );
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", checkRecordingState)
  : checkRecordingState();

chrome.runtime.onMessage.addListener(
  (
    message: Types.MessageCommand,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: Types.Action[]) => void
  ): boolean | undefined => {
    if (message.command === "start") {
      isRecording = true;
      console.log("Starting to record actions...");
      initializeListeners();
    } else if (message.command === "stop") {
      isRecording = false;
      removeListeners();
    } else if (message.command === "getActions") {
      chrome.storage.local.get(
        ["actions"],
        (result: Partial<Types.StorageData>) => {
          sendResponse(result.actions || []);
        }
      );
      return true;
    }
  }
);
