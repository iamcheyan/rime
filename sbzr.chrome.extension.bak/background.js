const ADD_TO_FIXED_DICT_MENU_ID = 'sbzr-add-to-fixed-dict';
const ADD_TO_FIXED_DICT_COMMAND = 'add-selection-to-fixed-dict';
const NOTEPAD_PAGE_URL = chrome.runtime.getURL('notepad/index.html');

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: ADD_TO_FIXED_DICT_MENU_ID,
      title: '添加到词库',
      contexts: ['selection']
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== ADD_TO_FIXED_DICT_MENU_ID) return;
  if (!info.selectionText) return;

  const message = {
    type: 'sbzr_add_selection_to_fixed_dict',
    text: info.selectionText
  };

  if (tab?.url?.startsWith(NOTEPAD_PAGE_URL)) {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        // Ignore if the notepad page is not listening yet.
      }
    });
    return;
  }

  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, message, () => {
    if (chrome.runtime.lastError) {
      // Ignore pages where the content script is unavailable.
    }
  });
});

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== ADD_TO_FIXED_DICT_COMMAND) return;

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  if (!tab) return;

  const message = {
    type: 'sbzr_add_current_selection_to_fixed_dict'
  };

  if (tab.url?.startsWith(NOTEPAD_PAGE_URL)) {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        // Ignore if the notepad page is not listening yet.
      }
    });
    return;
  }

  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, message, () => {
    if (chrome.runtime.lastError) {
      // Ignore pages where the content script is unavailable.
    }
  });
});
