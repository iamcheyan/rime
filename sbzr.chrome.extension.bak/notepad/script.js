const editor = document.getElementById('editor');
const lineNumbers = document.getElementById('line-numbers');
const openDictButton = document.getElementById('open-dict-button');
const reloadDictsButton = document.getElementById('reload-dicts-button');
const autoCopyButton = document.getElementById('auto-copy-button');
const showWhitespaceButton = document.getElementById('show-whitespace-button');
const saveButton = document.getElementById('save-button');
const tabsRoot = document.getElementById('tabs');
const newTabButton = document.getElementById('new-tab-button');
const shortcutsButton = document.getElementById('shortcuts-button');
const shortcutsDialog = document.getElementById('shortcuts-dialog');
const openDictDialog = document.getElementById('open-dict-dialog');
const dictFileList = document.getElementById('dict-file-list');
const whitespaceOverlay = document.getElementById('whitespace-overlay');

const STORAGE_KEY = 'local_notepad_workspace';
const WORKSPACE_SAVE_DELAY = 120;
const AUTO_COPY_IDLE_DELAY = 700;
const SAVE_SUCCESS_FEEDBACK_MS = 1400;
const SAVE_ERROR_FEEDBACK_MS = 2200;
const RELOAD_SUCCESS_FEEDBACK_MS = 1400;
const RELOAD_ERROR_FEEDBACK_MS = 2200;
const TAB_WIDTH = 4;
const HISTORY_LIMIT = 100;
const EDITABLE_DICT_PATHS = window.SBZRShared?.getEditableDictPaths?.() || [];
const RELOADABLE_DICT_PATHS = [
  'dicts/fixed.dict.yaml',
  'dicts/zdy.dict.yaml'
];
const NATIVE_HOST_NAME = 'com.sbzr.filehost';

const FONT_SIZE = {
  min: 12,
  max: 32,
  step: 1,
  default: 16
};

const DEFAULT_TAB_STATE = {
  title: 'Untitled',
  content: '',
  sourcePath: '',
  savedContent: '',
  fontSize: FONT_SIZE.default,
  scrollTop: 0,
  scrollLeft: 0,
  selectionStart: 0,
  selectionEnd: 0,
  wasFocused: true,
  historyUndo: [],
  historyRedo: []
};

let workspace = readWorkspace();
let autoCopyTimer = null;
let workspaceSaveTimer = null;
let saveFeedbackTimer = null;
let reloadFeedbackTimer = null;
let pendingHistorySnapshot = null;
let sbzrImeController = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createId() {
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createTab(title = 'Untitled') {
  return {
    id: createId(),
    ...DEFAULT_TAB_STATE,
    title,
    historyUndo: [],
    historyRedo: []
  };
}

function cloneHistoryEntries(entries) {
  return Array.isArray(entries)
    ? entries.map((entry) => ({
        content: `${entry?.content || ''}`,
        selectionStart: Math.max(0, Number(entry?.selectionStart) || 0),
        selectionEnd: Math.max(0, Number(entry?.selectionEnd) || 0),
        scrollTop: Math.max(0, Number(entry?.scrollTop) || 0),
        scrollLeft: Math.max(0, Number(entry?.scrollLeft) || 0)
      }))
    : [];
}

function getFallbackTabTitle(tab, index = workspace.tabs.findIndex((item) => item.id === tab?.id)) {
  const safeIndex = index >= 0 ? index : 0;
  return `Note ${safeIndex + 1}`;
}

function getTabDisplayTitle(tab, index = workspace.tabs.findIndex((item) => item.id === tab?.id)) {
  if (tab?.sourcePath) {
    return window.SBZRShared?.getDictFileLabel?.(tab.sourcePath) || tab.sourcePath;
  }
  return deriveTabTitle(tab?.content, getFallbackTabTitle(tab, index));
}

function isSourceTabDirty(tab) {
  return !!(tab?.sourcePath && tab.content !== tab.savedContent);
}

function ensureWorkspaceShape(input) {
  const tabs = Array.isArray(input?.tabs) && input.tabs.length > 0
    ? input.tabs.map((tab, index) => ({
        ...DEFAULT_TAB_STATE,
        ...tab,
        id: tab?.id || createId(),
        title: (tab?.title || '').trim() || `Note ${index + 1}`,
        sourcePath: `${tab?.sourcePath || ''}`,
        content: `${tab?.content || ''}`,
        savedContent: `${tab?.savedContent ?? tab?.content ?? ''}`,
        fontSize: clamp(Number(tab?.fontSize) || FONT_SIZE.default, FONT_SIZE.min, FONT_SIZE.max),
        scrollTop: Math.max(0, Number(tab?.scrollTop) || 0),
        scrollLeft: Math.max(0, Number(tab?.scrollLeft) || 0),
        selectionStart: Math.max(0, Number(tab?.selectionStart) || 0),
        selectionEnd: Math.max(0, Number(tab?.selectionEnd) || 0),
        wasFocused: tab?.wasFocused !== false,
        historyUndo: cloneHistoryEntries(tab?.historyUndo),
        historyRedo: cloneHistoryEntries(tab?.historyRedo)
      }))
    : [createTab('Note 1')];

  const activeTabId = tabs.some((tab) => tab.id === input?.activeTabId)
    ? input.activeTabId
    : tabs[0].id;

  return {
    tabs,
    activeTabId,
    autoCopyEnabled: input?.autoCopyEnabled === true,
    showWhitespaceEnabled: input?.showWhitespaceEnabled === true
  };
}

function readWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return ensureWorkspaceShape(null);
    return ensureWorkspaceShape(JSON.parse(raw));
  } catch {
    return ensureWorkspaceShape(null);
  }
}

function saveWorkspace() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

function clearAutoCopyTimer() {
  if (!autoCopyTimer) return;
  window.clearTimeout(autoCopyTimer);
  autoCopyTimer = null;
}

function clearReloadFeedbackTimer() {
  if (!reloadFeedbackTimer) return;
  window.clearTimeout(reloadFeedbackTimer);
  reloadFeedbackTimer = null;
}

function scheduleWorkspaceSave() {
  if (workspaceSaveTimer) window.clearTimeout(workspaceSaveTimer);
  workspaceSaveTimer = window.setTimeout(() => {
    workspaceSaveTimer = null;
    saveWorkspace();
  }, WORKSPACE_SAVE_DELAY);
}

function syncAutoCopyButton() {
  const enabled = workspace.autoCopyEnabled === true;
  const label = enabled ? 'Auto Copy On' : 'Auto Copy Off';
  autoCopyButton.classList.toggle('is-active', enabled);
  autoCopyButton.setAttribute('aria-pressed', String(enabled));
  autoCopyButton.setAttribute('aria-label', label);
  autoCopyButton.title = label;
}

function syncWhitespaceButton() {
  const enabled = workspace.showWhitespaceEnabled === true;
  showWhitespaceButton.classList.toggle('is-active', enabled);
  showWhitespaceButton.setAttribute('aria-pressed', String(enabled));
  showWhitespaceButton.textContent = enabled ? 'Whitespace On' : 'Whitespace Off';
  whitespaceOverlay.classList.toggle('is-visible', enabled);
  editor.classList.toggle('is-whitespace-visible', enabled);
  syncWhitespaceOverlay();
}

function syncReloadButton() {
  clearReloadFeedbackTimer();
  reloadDictsButton.disabled = false;
  reloadDictsButton.classList.remove('is-loading', 'is-saved', 'is-error');
  reloadDictsButton.setAttribute('aria-label', 'Reload dictionaries');
  reloadDictsButton.title = 'Reload dictionaries';
}

function setReloadButtonFeedback(state, message, timeoutMs = 0) {
  clearReloadFeedbackTimer();
  reloadDictsButton.disabled = state === 'is-loading';
  reloadDictsButton.classList.remove('is-loading', 'is-saved', 'is-error');
  if (state) {
    reloadDictsButton.classList.add(state);
  }
  reloadDictsButton.setAttribute('aria-label', message);
  reloadDictsButton.title = message;

  if (timeoutMs > 0) {
    reloadFeedbackTimer = window.setTimeout(() => {
      reloadFeedbackTimer = null;
      syncReloadButton();
    }, timeoutMs);
  }
}

function syncSaveButton() {
  const currentTab = getCurrentTab();
  const isSourceTab = !!currentTab?.sourcePath;
  const isDirty = isSourceTabDirty(currentTab);
  saveButton.disabled = !isSourceTab;
  saveButton.classList.toggle('is-ready', isDirty);
  saveButton.classList.remove('is-saving', 'is-saved', 'is-error');
  saveButton.textContent = 'Save';
  saveButton.title = !isSourceTab
    ? 'Open a dictionary file to save'
    : isDirty
      ? `Save ${window.SBZRShared?.getDictFileLabel?.(currentTab.sourcePath) || currentTab.sourcePath}`
      : 'No changes to save';
}

function clearSaveFeedbackTimer() {
  if (!saveFeedbackTimer) return;
  window.clearTimeout(saveFeedbackTimer);
  saveFeedbackTimer = null;
}

function setSaveButtonFeedback(state, message, timeoutMs = 0) {
  const currentTab = getCurrentTab();
  const isSourceTab = !!currentTab?.sourcePath;

  clearSaveFeedbackTimer();
  saveButton.classList.remove('is-saving', 'is-saved', 'is-error');
  saveButton.textContent = message;
  if (state) {
    saveButton.classList.add(state);
  }

  if (timeoutMs > 0) {
    saveFeedbackTimer = window.setTimeout(() => {
      saveFeedbackTimer = null;
      if (getCurrentTab()?.id === currentTab?.id) {
        syncSaveButton();
      }
    }, timeoutMs);
  } else if (!isSourceTab) {
    saveButton.textContent = 'Save';
  }
}

function getCurrentTab() {
  return workspace.tabs.find((tab) => tab.id === workspace.activeTabId) || workspace.tabs[0];
}

function getCurrentFontSize() {
  return Number.parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--editor-font-size'),
    10
  ) || FONT_SIZE.default;
}

function buildLineNumbers(text) {
  const lineCount = Math.max(1, text.split('\n').length);
  return Array.from({ length: lineCount }, (_, index) => `${index + 1}`).join('\n');
}

function syncLineNumbers() {
  lineNumbers.textContent = buildLineNumbers(editor.value);
}

function syncScroll() {
  lineNumbers.scrollTop = editor.scrollTop;
  whitespaceOverlay.scrollTop = editor.scrollTop;
  whitespaceOverlay.scrollLeft = editor.scrollLeft;
}

function updateEditorTailSpace() {
  const tailSpace = Math.floor(editor.clientHeight * 0.5);
  document.documentElement.style.setProperty('--editor-tail-space', `${tailSpace}px`);
}

function updateCurrentLineHighlight() {
  const caret = editor.selectionStart;
  const textBeforeCaret = editor.value.slice(0, caret);
  const logicalLineIndex = textBeforeCaret.split('\n').length - 1;
  const lineHeight = getCurrentFontSize() * Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--editor-line-height'));
  const top = (logicalLineIndex * lineHeight) - editor.scrollTop + Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--editor-pad-y'));
  document.documentElement.style.setProperty('--current-line-top', `${top}px`);
}

function escapeHtml(text) {
  return `${text || ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getDisplayColumnWidth(char) {
  if (!char || char === '\n') return 0;
  if (char === '\t') return TAB_WIDTH;

  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return 1;

  // Approximate East Asian wide/full-width character ranges so tab stops
  // stay aligned for CJK text when visible whitespace is enabled.
  if (
    codePoint >= 0x1100 && (
      codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    )
  ) {
    return 2;
  }

  return 1;
}

function buildWhitespaceOverlayHtml(text) {
  let html = '';
  let column = 0;

  for (const char of `${text || ''}`) {
    if (char === '\n') {
      html += '\n';
      column = 0;
      continue;
    }

    if (char === '\t') {
      const remainder = column % TAB_WIDTH;
      const width = remainder === 0 ? TAB_WIDTH : TAB_WIDTH - remainder;
      html += `<span class="whitespace-char whitespace-tab" style="width:${width}ch">→</span>`;
      column += width;
      continue;
    }

    if (char === ' ') {
      html += '<span class="whitespace-char whitespace-space">·</span>';
      column += 1;
      continue;
    }

    html += escapeHtml(char);
    column += getDisplayColumnWidth(char);
  }

  return html;
}

function syncWhitespaceOverlay() {
  if (workspace.showWhitespaceEnabled !== true) {
    whitespaceOverlay.textContent = '';
    return;
  }
  whitespaceOverlay.innerHTML = buildWhitespaceOverlayHtml(editor.value);
}

function applyFontSize(size, persist = true) {
  const nextSize = clamp(size, FONT_SIZE.min, FONT_SIZE.max);
  document.documentElement.style.setProperty('--editor-font-size', `${nextSize}px`);
  updateEditorTailSpace();
  if (persist) persistCurrentTabState();
}

function deriveTabTitle(content, fallbackTitle) {
  const text = `${content || ''}`;
  let lineStart = 0;

  while (lineStart < text.length) {
    const nextBreak = text.indexOf('\n', lineStart);
    const lineEnd = nextBreak === -1 ? text.length : nextBreak;
    const trimmed = text.slice(lineStart, lineEnd).trim();
    if (trimmed) {
      return trimmed.slice(0, 24);
    }
    if (nextBreak === -1) break;
    lineStart = nextBreak + 1;
  }

  return fallbackTitle || 'Untitled';
}

function createEditorSnapshot() {
  return {
    content: editor.value,
    selectionStart: editor.selectionStart,
    selectionEnd: editor.selectionEnd,
    scrollTop: editor.scrollTop,
    scrollLeft: editor.scrollLeft
  };
}

function normalizeSnapshot(snapshot, fallbackContent = editor.value) {
  const content = `${snapshot?.content ?? fallbackContent ?? ''}`;
  const maxPosition = content.length;
  const selectionStart = clamp(Number(snapshot?.selectionStart) || 0, 0, maxPosition);
  const selectionEnd = clamp(Number(snapshot?.selectionEnd) || 0, selectionStart, maxPosition);

  return {
    content,
    selectionStart,
    selectionEnd,
    scrollTop: Math.max(0, Number(snapshot?.scrollTop) || 0),
    scrollLeft: Math.max(0, Number(snapshot?.scrollLeft) || 0)
  };
}

function snapshotsEqual(left, right) {
  if (!left || !right) return false;
  return left.content === right.content
    && left.selectionStart === right.selectionStart
    && left.selectionEnd === right.selectionEnd
    && left.scrollTop === right.scrollTop
    && left.scrollLeft === right.scrollLeft;
}

function ensureTabHistory(tab) {
  if (!Array.isArray(tab.historyUndo)) tab.historyUndo = [];
  if (!Array.isArray(tab.historyRedo)) tab.historyRedo = [];
}

function pushHistoryEntry(entries, snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  const previous = entries[entries.length - 1];
  if (previous && snapshotsEqual(previous, normalized)) return;
  entries.push(normalized);
  if (entries.length > HISTORY_LIMIT) {
    entries.splice(0, entries.length - HISTORY_LIMIT);
  }
}

function resetTabHistory(tab) {
  ensureTabHistory(tab);
  tab.historyUndo = [];
  tab.historyRedo = [];
}

function recordHistoryBeforeChange(snapshot) {
  const tab = getCurrentTab();
  if (!tab) return;
  ensureTabHistory(tab);
  pushHistoryEntry(tab.historyUndo, snapshot);
  tab.historyRedo = [];
}

function persistCurrentTabState(options = {}) {
  const {
    save = true,
    render = true
  } = options;
  const tab = getCurrentTab();
  if (!tab) return;

  tab.content = editor.value;
  tab.fontSize = getCurrentFontSize();
  tab.scrollTop = editor.scrollTop;
  tab.scrollLeft = editor.scrollLeft;
  tab.selectionStart = editor.selectionStart;
  tab.selectionEnd = editor.selectionEnd;
  tab.wasFocused = document.activeElement === editor;
  ensureTabHistory(tab);
  const nextTitle = getTabDisplayTitle(tab);
  const titleChanged = tab.title !== nextTitle;
  tab.title = nextTitle;

  if (save) {
    scheduleWorkspaceSave();
  }
  if (render && titleChanged) {
    renderTabs();
  }
  updateCurrentLineHighlight();
}

function restoreTab(tab) {
  editor.value = tab.content;
  applyFontSize(tab.fontSize, false);
  syncLineNumbers();
  syncWhitespaceOverlay();
  updateEditorTailSpace();

  const maxPosition = editor.value.length;
  const selectionStart = Math.min(tab.selectionStart, maxPosition);
  const selectionEnd = Math.min(tab.selectionEnd, maxPosition);

  requestAnimationFrame(() => {
    editor.scrollTop = tab.scrollTop;
    editor.scrollLeft = tab.scrollLeft || 0;
    syncScroll();
    editor.setSelectionRange(selectionStart, selectionEnd);
    updateCurrentLineHighlight();
    if (tab.wasFocused) editor.focus();
  });
}

function applySnapshot(snapshot, options = {}) {
  const {
    preserveFocus = true,
    save = true,
    render = true
  } = options;
  const normalized = normalizeSnapshot(snapshot);

  editor.value = normalized.content;
  syncLineNumbers();
  syncWhitespaceOverlay();
  editor.scrollTop = normalized.scrollTop;
  editor.scrollLeft = normalized.scrollLeft;
  syncScroll();
  if (preserveFocus) {
    editor.focus();
  }
  editor.setSelectionRange(normalized.selectionStart, normalized.selectionEnd);
  persistCurrentTabState({ save, render });
}

function applyEditorValue(nextValue, selectionStart, selectionEnd = selectionStart, options = {}) {
  const {
    recordHistory = true,
    preserveFocus = true
  } = options;

  if (recordHistory) {
    recordHistoryBeforeChange(createEditorSnapshot());
  }

  applySnapshot({
    content: nextValue,
    selectionStart,
    selectionEnd,
    scrollTop: editor.scrollTop,
    scrollLeft: editor.scrollLeft
  }, {
    preserveFocus
  });
}

function undoEditorChange() {
  const tab = getCurrentTab();
  if (!tab) return;
  ensureTabHistory(tab);
  const previous = tab.historyUndo.pop();
  if (!previous) return;
  pushHistoryEntry(tab.historyRedo, createEditorSnapshot());
  applySnapshot(previous);
}

function redoEditorChange() {
  const tab = getCurrentTab();
  if (!tab) return;
  ensureTabHistory(tab);
  const next = tab.historyRedo.pop();
  if (!next) return;
  pushHistoryEntry(tab.historyUndo, createEditorSnapshot());
  applySnapshot(next);
}

function switchTab(tabId) {
  if (tabId === workspace.activeTabId) return;
  persistCurrentTabState({ render: false });
  workspace.activeTabId = tabId;
  saveWorkspace();
  renderTabs();
  restoreTab(getCurrentTab());
}

function addTab(title) {
  persistCurrentTabState();
  const nextIndex = workspace.tabs.length + 1;
  const tab = createTab(title || `Note ${nextIndex}`);
  workspace.tabs.push(tab);
  workspace.activeTabId = tab.id;
  saveWorkspace();
  renderTabs();
  restoreTab(tab);
}

async function openDictFile(path) {
  if (!path) return;

  persistCurrentTabState();
  const existing = workspace.tabs.find((tab) => tab.sourcePath === path);
  if (existing) {
    workspace.activeTabId = existing.id;
    saveWorkspace();
    renderTabs();
    restoreTab(existing);
    syncSaveButton();
    return;
  }

  const content = await window.SBZRShared.readPackagedDictText(path);
  const tab = createTab(window.SBZRShared.getDictFileLabel(path));
  tab.sourcePath = path;
  tab.content = content;
  tab.savedContent = content;
  tab.title = window.SBZRShared.getDictFileLabel(path);
  resetTabHistory(tab);
  workspace.tabs.push(tab);
  workspace.activeTabId = tab.id;
  saveWorkspace();
  renderTabs();
  restoreTab(tab);
  syncSaveButton();
}

async function saveCurrentSourceTab() {
  const tab = getCurrentTab();
  if (!tab?.sourcePath) return;
  if (!isSourceTabDirty(tab)) {
    syncSaveButton();
    return;
  }

  persistCurrentTabState({ render: false });
  const localPath = window.SBZRShared?.getDictFileLabel?.(tab.sourcePath) || tab.sourcePath;
  setSaveButtonFeedback('is-saving', 'Saving...');

  try {
    const response = await chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, {
      action: 'save_dict',
      path: localPath,
      content: editor.value
    });
    if (!response?.ok) {
      throw new Error(response?.error || 'Native save failed');
    }
  } catch (error) {
    console.warn('SBZR: Native save unavailable, falling back to storage override.', error);
    try {
      await window.SBZRShared.savePackagedDictOverride(tab.sourcePath, editor.value);
    } catch (fallbackError) {
      console.error('SBZR: Fallback save failed.', fallbackError);
      setSaveButtonFeedback('is-error', 'Save failed', SAVE_ERROR_FEEDBACK_MS);
      return;
    }
  }

  tab.savedContent = editor.value;
  tab.title = getTabDisplayTitle(tab);
  saveWorkspace();
  renderTabs();
  setSaveButtonFeedback('is-saved', 'Saved', SAVE_SUCCESS_FEEDBACK_MS);
}

async function promptAndSaveFixedEntry(selectedText) {
  await window.SBZRShared.promptAndSaveFixedEntry(selectedText, {
    nativeHostName: NATIVE_HOST_NAME,
    afterSave: async ({ path, localPath, text }) => {
      syncSourceTabsWithTexts({
        [localPath || path]: text
      });
      await broadcastDictionaryReload();
    }
  });
}

function closeTab(tabId) {
  if (workspace.tabs.length === 1) return;
  const index = workspace.tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return;

  workspace.tabs.splice(index, 1);
  if (workspace.activeTabId === tabId) {
    const fallback = workspace.tabs[Math.max(0, index - 1)] || workspace.tabs[0];
    workspace.activeTabId = fallback.id;
  }

  saveWorkspace();
  renderTabs();
  restoreTab(getCurrentTab());
}

function renderTabs() {
  tabsRoot.textContent = '';

  for (const [index, tab] of workspace.tabs.entries()) {
    tab.title = getTabDisplayTitle(tab, index);
    const container = document.createElement('div');
    container.className = `tab ${tab.id === workspace.activeTabId ? 'is-active' : ''}${isSourceTabDirty(tab) ? ' is-dirty' : ''}`;
    container.setAttribute('role', 'tab');
    container.setAttribute('aria-selected', String(tab.id === workspace.activeTabId));
    container.tabIndex = 0;
    container.title = tab.title;

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tab-close';
    close.setAttribute('aria-label', `Close ${tab.title}`);
    close.textContent = '×';

    container.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      switchTab(tab.id);
    });

    container.addEventListener('auxclick', (event) => {
      if (event.button !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      closeTab(tab.id);
    });

    container.addEventListener('dblclick', () => {
      switchTab(tab.id);
    });

    container.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        switchTab(tab.id);
      }
    });

    close.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      closeTab(tab.id);
    });

    container.appendChild(title);
    container.appendChild(close);
    tabsRoot.appendChild(container);
  }

  syncSaveButton();
}

async function copyAllText() {
  if (!editor.value.trim()) return;

  try {
    await navigator.clipboard.writeText(editor.value);
  } catch {
    editor.select();
    document.execCommand('copy');
  }
}

function scheduleAutoCopy() {
  clearAutoCopyTimer();
  if (!workspace.autoCopyEnabled) return;
  if (!editor.value.trim()) return;
  autoCopyTimer = window.setTimeout(() => {
    autoCopyTimer = null;
    void copyAllText();
  }, AUTO_COPY_IDLE_DELAY);
}

function insertTabAtCursor() {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const value = editor.value;
  applyEditorValue(`${value.slice(0, start)}\t${value.slice(end)}`, start + 1);
}

function shouldIndentSelection() {
  const value = editor.value;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;

  if (start === end) return false;

  const selectedText = value.slice(start, end);
  if (selectedText.includes('\n')) {
    return true;
  }

  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEndIndex = value.indexOf('\n', start);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;

  return start === lineStart && end === lineEnd;
}

function outdentCurrentLine() {
  const value = editor.value;
  const start = editor.selectionStart;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const linePrefix = value.slice(lineStart);
  let removed = 0;

  if (linePrefix.startsWith('\t')) {
    removed = 1;
  } else if (linePrefix.startsWith('  ')) {
    removed = 2;
  } else if (linePrefix.startsWith(' ')) {
    removed = 1;
  }

  if (!removed) return;

  applyEditorValue(
    `${value.slice(0, lineStart)}${value.slice(lineStart + removed)}`,
    Math.max(lineStart, start - removed)
  );
}

function indentSelection(outdent = false) {
  const value = editor.value;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const selectedText = value.slice(lineStart, end);
  const lines = selectedText.split('\n');
  let totalDelta = 0;
  let firstLineDelta = 0;

  const updatedLines = lines.map((line, index) => {
    if (!outdent) {
      totalDelta += 1;
      if (index === 0) firstLineDelta = 1;
      return `\t${line}`;
    }

    let removed = 0;
    if (line.startsWith('\t')) {
      removed = 1;
    } else if (line.startsWith('  ')) {
      removed = 2;
    } else if (line.startsWith(' ')) {
      removed = 1;
    }

    totalDelta -= removed;
    if (index === 0) firstLineDelta = removed;
    return removed ? line.slice(removed) : line;
  });

  const replacement = updatedLines.join('\n');
  const nextValue = value.slice(0, lineStart) + replacement + value.slice(end);
  const nextStart = outdent
    ? Math.max(lineStart, start - firstLineDelta)
    : start + firstLineDelta;
  const nextEnd = Math.max(nextStart, end + totalDelta);

  applyEditorValue(nextValue, nextStart, nextEnd);
}

function syncSourceTabsWithTexts(dictTexts) {
  let activeTabUpdated = false;

  for (const tab of workspace.tabs) {
    if (!tab.sourcePath) continue;
    const localPath = window.SBZRShared?.getDictFileLabel?.(tab.sourcePath) || tab.sourcePath;
    if (!Object.prototype.hasOwnProperty.call(dictTexts, localPath)) continue;

    const nextText = `${dictTexts[localPath] || ''}`;
    tab.content = nextText;
    tab.savedContent = nextText;
    tab.selectionStart = 0;
    tab.selectionEnd = 0;
    tab.scrollTop = 0;
    tab.scrollLeft = 0;
    tab.title = getTabDisplayTitle(tab);
    resetTabHistory(tab);
    activeTabUpdated = activeTabUpdated || tab.id === workspace.activeTabId;
  }

  saveWorkspace();
  renderTabs();
  if (activeTabUpdated) {
    restoreTab(getCurrentTab());
  }
}

async function broadcastDictionaryReload() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((tab) => Number.isInteger(tab.id))
      .map((tab) => chrome.tabs.sendMessage(tab.id, { type: 'sbzr_reload_effective_dict' }))
  );
}

async function reloadDictionaries() {
  const dirtySourceTabs = workspace.tabs.filter((tab) => isSourceTabDirty(tab));
  if (dirtySourceTabs.length > 0) {
    const shouldReload = window.confirm('Reloading dictionaries will discard unsaved changes in open dictionary tabs. Continue?');
    if (!shouldReload) return;
  }

  setReloadButtonFeedback('is-loading', 'Reloading...');

  try {
    const dictTexts = {};
    const nextOverrides = {};

    for (const path of RELOADABLE_DICT_PATHS) {
      const localPath = window.SBZRShared?.getDictFileLabel?.(path) || path;
      const response = await chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, {
        action: 'read_dict',
        path: localPath
      });
      if (!response?.ok) {
        throw new Error(response?.error || `Native reload failed for ${localPath}`);
      }

      const content = `${response.content || ''}`;
      dictTexts[localPath] = content;
      nextOverrides[path] = content;
    }

    await chrome.storage.local.set({
      [window.SBZRShared.PACKAGED_DICT_OVERRIDES_STORAGE_KEY]: nextOverrides
    });

    syncSourceTabsWithTexts(dictTexts);
    await broadcastDictionaryReload();
    setReloadButtonFeedback('is-saved', 'Reloaded', RELOAD_SUCCESS_FEEDBACK_MS);
  } catch (error) {
    console.error('SBZR: Reload dictionaries failed.', error);
    setReloadButtonFeedback('is-error', 'Reload failed', RELOAD_ERROR_FEEDBACK_MS);
  }
}

editor.addEventListener('beforeinput', (event) => {
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
    event.preventDefault();
    return;
  }
  pendingHistorySnapshot = createEditorSnapshot();
});

editor.addEventListener('input', () => {
  if (pendingHistorySnapshot) {
    recordHistoryBeforeChange(pendingHistorySnapshot);
    pendingHistorySnapshot = null;
  }
  syncLineNumbers();
  syncWhitespaceOverlay();
  persistCurrentTabState();
  scheduleAutoCopy();
});

editor.addEventListener('scroll', () => {
  syncScroll();
  persistCurrentTabState({ render: false });
});

editor.addEventListener('click', () => {
  persistCurrentTabState({ render: false });
});
editor.addEventListener('keyup', () => {
  persistCurrentTabState({ render: false });
});
editor.addEventListener('focus', () => {
  persistCurrentTabState({ render: false });
});
editor.addEventListener('blur', () => {
  pendingHistorySnapshot = null;
  persistCurrentTabState({ render: false });
});
document.addEventListener('selectionchange', () => {
  if (document.activeElement === editor) {
    updateCurrentLineHighlight();
  }
});

editor.addEventListener('wheel', (event) => {
  if (!event.ctrlKey) return;

  event.preventDefault();
  const delta = event.deltaY < 0 ? FONT_SIZE.step : -FONT_SIZE.step;
  applyFontSize(getCurrentFontSize() + delta);
}, { passive: false });

newTabButton.addEventListener('click', () => {
  addTab();
});

openDictButton.addEventListener('click', () => {
  openDictDialog.showModal();
});

saveButton.addEventListener('click', () => {
  void saveCurrentSourceTab();
});

reloadDictsButton.addEventListener('click', () => {
  void reloadDictionaries();
});

autoCopyButton.addEventListener('click', () => {
  workspace.autoCopyEnabled = !workspace.autoCopyEnabled;
  saveWorkspace();
  syncAutoCopyButton();
  if (workspace.autoCopyEnabled) {
    scheduleAutoCopy();
  } else {
    clearAutoCopyTimer();
  }
});

showWhitespaceButton.addEventListener('click', () => {
  workspace.showWhitespaceEnabled = !workspace.showWhitespaceEnabled;
  saveWorkspace();
  syncWhitespaceButton();
});

tabsRoot.addEventListener('dblclick', (event) => {
  if (event.target !== tabsRoot) return;
  addTab();
});

shortcutsButton.addEventListener('click', () => {
  shortcutsDialog.showModal();
});

for (const path of EDITABLE_DICT_PATHS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dict-file-button';
  button.textContent = path;
  button.addEventListener('click', async () => {
    await openDictFile(path);
    openDictDialog.close();
  });
  dictFileList.appendChild(button);
}

editor.addEventListener('keydown', (event) => {
  const isPrimary = event.ctrlKey || event.metaKey;
  const lowerKey = event.key.toLowerCase();

  if (event.key === 'Tab') {
    event.preventDefault();
    pendingHistorySnapshot = null;
    if (shouldIndentSelection()) {
      indentSelection(event.shiftKey);
    } else if (event.shiftKey) {
      outdentCurrentLine();
    } else {
      insertTabAtCursor();
    }
    return;
  }

  if (!isPrimary) {
    if (event.altKey && /^[1-9]$/.test(event.key)) {
      const index = Number.parseInt(event.key, 10) - 1;
      const tab = workspace.tabs[index];
      if (tab) {
        event.preventDefault();
        switchTab(tab.id);
      }
    }
    return;
  }

  if (lowerKey === 'z') {
    event.preventDefault();
    pendingHistorySnapshot = null;
    if (event.shiftKey) {
      redoEditorChange();
    } else {
      undoEditorChange();
    }
    return;
  }

  if (lowerKey === 'y') {
    event.preventDefault();
    pendingHistorySnapshot = null;
    redoEditorChange();
    return;
  }

  if (event.shiftKey && lowerKey === 'c') {
    event.preventDefault();
    void copyAllText();
    return;
  }

  if (event.key === '/') {
    event.preventDefault();
    shortcutsDialog.showModal();
    return;
  }

  if (lowerKey === 't') {
    event.preventDefault();
    addTab();
    return;
  }

  if (lowerKey === 'w') {
    event.preventDefault();
    closeTab(workspace.activeTabId);
    return;
  }

  if (lowerKey === 's' && getCurrentTab()?.sourcePath) {
    event.preventDefault();
    void saveCurrentSourceTab();
    return;
  }

  if (event.key === '=' || event.key === '+') {
    event.preventDefault();
    applyFontSize(getCurrentFontSize() + FONT_SIZE.step);
    return;
  }

  if (event.key === '-') {
    event.preventDefault();
    applyFontSize(getCurrentFontSize() - FONT_SIZE.step);
    return;
  }

  if (event.key === '0') {
    event.preventDefault();
    applyFontSize(FONT_SIZE.default);
  }
});

window.addEventListener('resize', syncScroll);
window.addEventListener('resize', updateEditorTailSpace);
window.addEventListener('beforeunload', () => {
  if (workspaceSaveTimer) {
    window.clearTimeout(workspaceSaveTimer);
    workspaceSaveTimer = null;
  }
  persistCurrentTabState({ save: false, render: false });
  saveWorkspace();
});

if (chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'sbzr_add_selection_to_fixed_dict') {
      void promptAndSaveFixedEntry(message.text || '');
      return;
    }
    if (message?.type === 'sbzr_add_current_selection_to_fixed_dict') {
      void promptAndSaveFixedEntry(window.SBZRShared.getActiveSelectedText());
    }
  });
}

renderTabs();
syncReloadButton();
syncAutoCopyButton();
syncWhitespaceButton();
restoreTab(getCurrentTab());
updateEditorTailSpace();
updateCurrentLineHighlight();

if (window.SBZRShared?.installTextareaIME) {
  sbzrImeController = window.SBZRShared.installTextareaIME({ target: editor });
}
