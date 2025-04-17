/// <reference path="./types.ts" />

// Track which tabs have content scripts
const injectedTabs = new Set<number>();

// Inject content script into a tab
async function injectContentScript(tabId: number): Promise<void> {
  if (injectedTabs.has(tabId)) return;
  
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    injectedTabs.add(tabId);
    console.log(`Content script injected into tab ${tabId}`);
  } catch (err) {
    console.error(`Failed to inject content script into tab ${tabId}:`, err);
  }
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    injectContentScript(tabId);
  }
});

// Initial setup when extension is installed
chrome.runtime.onInstalled.addListener(async () => {
  console.log("Extension installed");
  await chrome.storage.local.set({ isRecording: false, actions: [] });
  
  // Inject into all existing tabs
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    if (tab.id) {
      await injectContentScript(tab.id);
    }
  }
});

// Handle recording state changes
chrome.runtime.onMessage.addListener(
  (
    message: Types.Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: Types.RecordingStateResponse) => void
  ): boolean => {
    if (message.type === "GET_RECORDING_STATE") {
      chrome.storage.local.get(["isRecording"], (result) => {
        sendResponse({ isRecording: result.isRecording || false });
      });
      return true;
    }
    return false;
  }
);