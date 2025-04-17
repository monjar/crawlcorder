/// <reference path="./types.ts" />


const statusEl: HTMLElement | null = document.getElementById("status");

function updateStatus(): void {
  chrome.storage.local.get(
    ["isRecording"],
    (result: Partial<Types.StorageData>) => {
      if (!statusEl) return;
      if (result.isRecording) {
        statusEl.textContent = "Recording";
        statusEl.style.color = "red";
      } else {
        statusEl.textContent = "Not Recording";
        statusEl.style.color = "black";
      }
    }
  );
}

function setRecording(isRecording: boolean): void {
  chrome.storage.local.set({ isRecording });
  updateStatus();
}

function sendCommand(command: string): void {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs[0]?.id) {
      console.error("No active tab found");
      return;
    }

    try {
      // Set storage state first
      if (command === "start") {
        await chrome.storage.local.set({ isRecording: true, actions: [] });
      } else if (command === "stop") {
        await chrome.storage.local.set({ isRecording: false });
      }

      // Then send message to content script
      await chrome.tabs.sendMessage(tabs[0].id, { command });
      updateStatus();
    } catch (error) {
      console.error("Error sending command:", error);
      if (chrome.runtime.lastError) {
        // Try re-injecting the content script
        await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ["content.js"]
        });
        // Retry sending the command
        await chrome.tabs.sendMessage(tabs[0].id, { command });
        updateStatus();
      }
    }
  });
}

document.getElementById("start")?.addEventListener("click", () => {
  sendCommand("start");
});

document.getElementById("stop")?.addEventListener("click", () => {
  sendCommand("stop");
});

document.getElementById("view")?.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id !== undefined) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { command: "getActions" },
        (response) => {
          const output = document.getElementById("output");
          if (output && response) {
            output.textContent = JSON.stringify(response, null, 2);
          } else {
            output!.textContent = "No response or no actions recorded.";
          }
        }
      );
    }
  });
});

document.getElementById("export")?.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id !== undefined) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { command: "getActions" },
        (response) => {
          if (response) {
            const blob = new Blob([JSON.stringify(response, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "recorded_actions.json";
            a.click();
            URL.revokeObjectURL(url);
          }
        }
      );
    }
  });
});

document.getElementById("delete")?.addEventListener("click", () => {
  if (confirm("Are you sure you want to delete all recorded actions?")) {
    chrome.storage.local.set({ actions: [] }, () => {
      const output = document.getElementById("output");
      if (output) {
        output.textContent = "All recordings deleted.";
      }
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  updateStatus();
});
