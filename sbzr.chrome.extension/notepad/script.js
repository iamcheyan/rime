const editor = document.getElementById('editor');
const lineNumbers = document.getElementById('line-numbers');
const openDictButton = document.getElementById('open-dict-button');
const autoCopyButton = document.getElementById('auto-copy-button');
const showWhitespaceButton = document.getElementById('show-whitespace-button');
const toggleHighlighterButton = document.getElementById('toggle-highlighter-button');
const settingsButton = document.getElementById('settings-button');
const settingsDialog = document.getElementById('settings-dialog');
const settingFeatureVim = document.getElementById('setting-feature-vim');
const settingFeatureHighlighter = document.getElementById('setting-feature-highlighter');
const settingFeatureWhitespace = document.getElementById('setting-feature-whitespace');
const settingFeatureIme = document.getElementById('setting-feature-ime');
const settingFeatureAutoCopy = document.getElementById('setting-feature-autocopy');
const settingFeatureFont = document.getElementById('setting-feature-font');
const saveButton = document.getElementById('save-button');
const tabsRoot = document.getElementById('tabs');
const newTabButton = document.getElementById('new-tab-button');
const vimModeButton = document.getElementById('vim-mode-button');
const imeStatusButton = document.getElementById('ime-status-button');
const shortcutsButton = document.getElementById('shortcuts-button');
const shortcutsDialog = document.getElementById('shortcuts-dialog');
const openDictDialog = document.getElementById('open-dict-dialog');
const dictFileList = document.getElementById('dict-file-list');
const whitespaceOverlay = document.getElementById('whitespace-overlay');

const STORAGE_KEY = 'local_notepad_workspace';
const IME_DICT_PATHS_STORAGE_KEY = 'sbzr_ime_dict_paths';
const GLOBAL_ENABLED_STORAGE_KEY = 'sbzr_enabled';
const WORKSPACE_SAVE_DELAY = 120;
const AUTO_COPY_IDLE_DELAY = 700;
const SAVE_SUCCESS_FEEDBACK_MS = 1400;
const SAVE_ERROR_FEEDBACK_MS = 2200;
const TAB_WIDTH = 4;
const HISTORY_LIMIT = 100;
const EDITABLE_DICT_PATHS = [
  ...(window.SBZR_DICTS?.RIME_PATHS || []),
  ...(window.SBZR_DICTS?.AFFIX_SOURCES || []).map((item) => item.path)
];
const IME_DICT_TABLES = window.SBZR_DICTS?.TABLES || [];
const DEFAULT_IME_DICT_PATHS = IME_DICT_TABLES.map((table) => table.path);
const NATIVE_HOST_NAME = 'com.sbzr.filehost';
const SBZR_CORE_SCRIPT_PATH = '../shared/sbzr-core.js';
const CONTENT_IME_SCRIPT_PATH = '../content.js';
const VIM_SCRIPT_PATH = '../shared/vim-mode.js';
const HIGHLIGHTER_SCRIPT_PATH = '../shared/highlighter.js';

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
let pendingHistorySnapshot = null;
let sbzrImeController = null;
let vimMode = null;
let highlighter = null;
const sharedScriptPromises = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function loadSharedScript(path, globalName) {
  if (window[globalName]) {
    return Promise.resolve(window[globalName]);
  }
  if (sharedScriptPromises.has(path)) {
    return sharedScriptPromises.get(path);
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = path;
    script.onload = () => {
      if (window[globalName]) {
        resolve(window[globalName]);
        return;
      }
      reject(new Error(`Loaded ${path} but ${globalName} is unavailable.`));
    };
    script.onerror = () => reject(new Error(`Failed to load ${path}`));
    document.body.appendChild(script);
  });
  sharedScriptPromises.set(path, promise);
  return promise;
}

async function ensureSBZRShared() {
  await loadSharedScript(SBZR_CORE_SCRIPT_PATH, 'SBZRShared');
  return window.SBZRShared;
}

async function ensureContentIME() {
  await ensureSBZRShared();
  if (!window.SBZRContentIME) {
    window.__SBZR_CONTENT_AUTO_INIT__ = false;
  }
  try {
    await loadSharedScript(CONTENT_IME_SCRIPT_PATH, 'SBZRContentIME');
  } finally {
    delete window.__SBZR_CONTENT_AUTO_INIT__;
  }
  return window.SBZRContentIME;
}

function getDictFileLabel(path) {
  return `${path || ''}`.split('/').pop() || 'dict';
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
    return getDictFileLabel(tab.sourcePath) || tab.sourcePath;
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
    showWhitespaceEnabled: input?.showWhitespaceEnabled === true,
    vimModeEnabled: input?.vimModeEnabled === true,
    highlighterEnabled: input?.highlighterEnabled !== false,
    featureVim: input?.featureVim !== false,
    featureHighlighter: input?.featureHighlighter !== false,
    featureWhitespace: input?.featureWhitespace !== false,
    featureIme: input?.featureIme !== false,
    featureAutoCopy: input?.featureAutoCopy !== false,
    featureFont: input?.featureFont !== false
  };
}

function normalizeImeDictPaths(paths) {
  const availablePaths = new Set(DEFAULT_IME_DICT_PATHS);
  const source = Array.isArray(paths) ? paths : DEFAULT_IME_DICT_PATHS;
  const normalized = source.filter((path, index) => (
    typeof path === 'string' &&
    availablePaths.has(path) &&
    source.indexOf(path) === index
  ));
  return normalized.length > 0 ? normalized : [...DEFAULT_IME_DICT_PATHS];
}

async function getStoredImeDictPaths() {
  const result = await chrome.storage.local.get([IME_DICT_PATHS_STORAGE_KEY]);
  const normalized = normalizeImeDictPaths(result[IME_DICT_PATHS_STORAGE_KEY]);
  const raw = Array.isArray(result[IME_DICT_PATHS_STORAGE_KEY]) ? result[IME_DICT_PATHS_STORAGE_KEY] : [];
  if (JSON.stringify(normalized) !== JSON.stringify(raw)) {
    await chrome.storage.local.set({ [IME_DICT_PATHS_STORAGE_KEY]: normalized });
  }
  return normalized;
}

function buildImeDictConfig(selectedPaths) {
  const selected = new Set(normalizeImeDictPaths(selectedPaths));
  const tables = IME_DICT_TABLES.filter((table) => selected.has(table.path));
  return {
    packagedPaths: tables.filter((table) => !table.prefix).map((table) => table.path),
    affixSources: tables
      .filter((table) => table.prefix)
      .map((table) => ({
        path: table.path,
        prefix: table.prefix,
        dictName: `sb${table.prefix || 'ext'}.extension`
      }))
  };
}

async function reinstallImeController() {
  if (workspace.featureIme === false) {
    if (sbzrImeController?.destroy) {
      sbzrImeController.destroy();
    }
    sbzrImeController = null;
    return;
  }

  const SBZRContentIME = await ensureContentIME();
  if (!SBZRContentIME?.installTextareaIME) return;
  if (sbzrImeController?.destroy) {
    sbzrImeController.destroy();
  }

  const selectedPaths = await getStoredImeDictPaths();
  const { packagedPaths, affixSources } = buildImeDictConfig(selectedPaths);
  sbzrImeController = SBZRContentIME.installTextareaIME({
    target: editor,
    packagedPaths,
    affixSources,
    isSuppressed: () => !!(
      (workspace.featureIme === false) ||
      (vimMode && vimMode.enabled && vimMode.mode === 'normal')
    )
  });
}

function ensureImeControllerIfNeeded() {
  if (workspace.featureIme === false || sbzrImeController) return;
  void reinstallImeController();
}

function destroyVimMode() {
  if (!vimMode) return;
  if (typeof vimMode.destroy === 'function') {
    vimMode.destroy();
  } else {
    vimMode.disable();
  }
  vimMode = null;
  vimModeButton.classList.remove('is-active', 'vim-normal');
  vimModeButton.title = 'VIM Mode';
}

function detectEditorLanguage(tab = getCurrentTab()) {
  const path = (tab?.sourcePath || '').toLowerCase();
  if (path.endsWith('.dict.yaml') || path.endsWith('.yaml')) return 'rime';
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'js';
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'ts';
  if (path.endsWith('.py')) return 'python';
  if (path.endsWith('.java')) return 'java';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  return 'text';
}

function destroyHighlighter() {
  if (highlighter?.destroy) {
    highlighter.destroy();
  }
  highlighter = null;
  whitespaceOverlay.classList.remove('is-visible');
  editor.classList.remove('is-whitespace-visible');
}

async function ensureVimMode() {
  if (!workspace.featureVim || workspace.vimModeEnabled !== true) return null;
  if (vimMode) {
    syncVimModeButton();
    return vimMode;
  }

  await loadSharedScript(VIM_SCRIPT_PATH, 'VimMode');
  if (!workspace.featureVim || workspace.vimModeEnabled !== true) return null;
  vimMode = new window.VimMode(editor, {
    onModeChange: (mode) => {
      if (!vimModeButton) return;
      vimModeButton.title = `VIM Mode: ${mode.toUpperCase()}${workspace.featureVim ? ' (Click to Disable)' : ''}`;
      if (mode === 'normal') {
        vimModeButton.classList.add('vim-normal');
      } else {
        vimModeButton.classList.remove('vim-normal');
      }
    }
  });
  syncVimModeButton();
  vimMode.updateUI();
  return vimMode;
}

async function ensureHighlighter() {
  if (!workspace.featureHighlighter || workspace.highlighterEnabled === false) return null;
  if (!highlighter) {
    await loadSharedScript(HIGHLIGHTER_SCRIPT_PATH, 'SharedHighlighter');
    if (!workspace.featureHighlighter || workspace.highlighterEnabled === false) return null;
    highlighter = new window.SharedHighlighter(editor, whitespaceOverlay, {
      tabWidth: TAB_WIDTH
    });
  }

  highlighter.enabled = true;
  highlighter.setWhitespace(workspace.showWhitespaceEnabled === true);
  highlighter.setLanguage(detectEditorLanguage());
  highlighter.render();
  return highlighter;
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
  
  if (highlighter) {
    highlighter.setWhitespace(enabled);
  }
  
  // If highlighter is disabled, whitespace symbols won't show anyway
  syncHighlighterButton();
}

function syncHighlighterButton() {
  const enabled = workspace.featureHighlighter !== false && workspace.highlighterEnabled !== false;
  toggleHighlighterButton.classList.toggle('is-active', enabled);
  toggleHighlighterButton.setAttribute('aria-pressed', String(enabled));
  
  if (highlighter) {
    highlighter.enabled = enabled;
    if (enabled) highlighter.render();
  }

  // If enabled: editor is transparent, overlay is visible
  // If disabled: editor is visible, overlay is hidden
  editor.classList.toggle('is-whitespace-visible', enabled);
  whitespaceOverlay.classList.toggle('is-visible', enabled);
  
  syncFeatureVisibility();
}

function syncFeatureVisibility() {
  const toggleVisibility = (selector, visible) => {
    document.querySelectorAll(selector).forEach(el => {
      el.classList.toggle('feature-module-hidden', !visible);
    });
  };

  toggleVisibility('.feature-module-vim', workspace.featureVim);
  toggleVisibility('.feature-module-highlighter', workspace.featureHighlighter);
  toggleVisibility('.feature-module-whitespace', workspace.featureWhitespace);
  toggleVisibility('.feature-module-ime', workspace.featureIme);
  toggleVisibility('.feature-module-autocopy', workspace.featureAutoCopy);

  // Apply font class on body
  document.body.classList.toggle('font-builtin-disabled', workspace.featureFont === false);

  // Reload and Sync buttons in settings are only visible if IME feature is ON
  // Global feature suppression
  if (!workspace.featureVim && workspace.vimModeEnabled) {
    workspace.vimModeEnabled = false;
    destroyVimMode();
  }
  if (!workspace.featureHighlighter && workspace.highlighterEnabled) {
    workspace.highlighterEnabled = false;
    destroyHighlighter();
  }
  if (!workspace.featureIme && sbzrImeController?.destroy) {
    sbzrImeController.destroy();
    sbzrImeController = null;
  }
  if (!workspace.featureAutoCopy && workspace.autoCopyEnabled) {
    workspace.autoCopyEnabled = false;
    clearAutoCopyTimer();
  }
}

function syncSettingsDialog() {
  if (settingFeatureVim) settingFeatureVim.checked = workspace.featureVim !== false;
  if (settingFeatureHighlighter) settingFeatureHighlighter.checked = workspace.featureHighlighter !== false;
  if (settingFeatureWhitespace) settingFeatureWhitespace.checked = workspace.featureWhitespace !== false;
  if (settingFeatureIme) settingFeatureIme.checked = workspace.featureIme !== false;
  if (settingFeatureAutoCopy) settingFeatureAutoCopy.checked = workspace.featureAutoCopy !== false;
  if (settingFeatureFont) settingFeatureFont.checked = workspace.featureFont !== false;
}

function syncVimModeButton() {
  if (!vimModeButton) return;
  const enabled = workspace.vimModeEnabled === true;
  vimModeButton.classList.toggle('is-active', enabled);
  if (vimMode && enabled) {
    vimMode.enable();
  } else if (vimMode) {
    vimMode.disable();
  }
}

async function syncImeStatusButton() {
  const result = await chrome.storage.local.get([GLOBAL_ENABLED_STORAGE_KEY]);
  const enabled = result[GLOBAL_ENABLED_STORAGE_KEY] !== false;
  imeStatusButton.classList.toggle('is-active', enabled);
  imeStatusButton.title = enabled ? 'Input Method Enabled (Press Shift to toggle)' : 'Input Method Disabled (Press Shift to toggle)';
  imeStatusButton.setAttribute('aria-label', enabled ? 'Disable Input Method' : 'Enable Input Method');
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
      ? `Save ${getDictFileLabel(currentTab.sourcePath) || currentTab.sourcePath}`
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

function syncLineNumbers() {
  const text = editor.value;
  const lineCount = Math.max(1, text.split('\n').length);
  let html = '';
  for (let i = 1; i <= lineCount; i++) {
    html += `<div>${i}</div>`;
  }
  lineNumbers.innerHTML = html;
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

  // Get the precise computed line height from font size and line height ratio
  const style = getComputedStyle(document.documentElement);
  const fontSize = parseFloat(style.getPropertyValue('--editor-font-size'));
  const lineHeightRatio = parseFloat(style.getPropertyValue('--editor-line-height')) || 1.6;
  const lineHeight = fontSize * lineHeightRatio;
  const paddingTop = parseFloat(style.getPropertyValue('--editor-pad-y'));

  const top = (logicalLineIndex * lineHeight) - editor.scrollTop + paddingTop;
  document.documentElement.style.setProperty('--current-line-top', `${top}px`);
}

function applyFontSize(size, persist = true) {
  const nextSize = clamp(size, FONT_SIZE.min, FONT_SIZE.max);
  document.documentElement.style.setProperty('--editor-font-size', `${nextSize}px`);
  updateEditorTailSpace();
  if (persist) persistCurrentTabState();
  if (highlighter) highlighter.render();
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
  
  // Only re-render tabs if the title ACTUALLY changes
  const nextTitle = getTabDisplayTitle(tab);
  if (tab.title !== nextTitle) {
    tab.title = nextTitle;
    if (render) renderTabs();
  }

  if (save) {
    scheduleWorkspaceSave();
  }
}

function updateStatusFileInfo() {
  const tab = getCurrentTab();
  const fileInfo = document.getElementById('file-info');
  if (fileInfo) {
    fileInfo.textContent = tab.sourcePath ? (getDictFileLabel(tab.sourcePath) || tab.sourcePath) : 'Untitled';
  }
}

function updateStatusCursorPos() {
  const cursorPosInfo = document.getElementById('cursor-pos');
  if (cursorPosInfo) {
    const text = editor.value;
    const p = editor.selectionStart;
    const lineIdx = text.slice(0, p).split('\n').length;
    const colIdx = p - text.lastIndexOf('\n', p - 1);
    cursorPosInfo.textContent = `${lineIdx}:${colIdx}`;
  }
}

function restoreTab(tab) {
  editor.value = tab.content;
  applyFontSize(tab.fontSize, false);
  syncLineNumbers();
  syncWhitespaceButton(); // This will handle highlighter state
  updateEditorTailSpace();
  updateStatusFileInfo();
  
  if (highlighter) {
    highlighter.setLanguage(detectEditorLanguage(tab));
  }

  if (vimMode) vimMode.updateUI();
  if (highlighter) highlighter.render();

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
    // Render again after scroll properties are applied by browser
    if (highlighter) highlighter.render();
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
  if (highlighter) highlighter.render();
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
  const SBZRShared = await ensureSBZRShared();

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

  const content = await SBZRShared.readPackagedDictText(path);
  const tab = createTab(getDictFileLabel(path));
  tab.sourcePath = path;
  tab.content = content;
  tab.savedContent = content;
  tab.title = getDictFileLabel(path);
  resetTabHistory(tab);
  workspace.tabs.push(tab);
  workspace.activeTabId = tab.id;
  saveWorkspace();
  renderTabs();
  restoreTab(tab);
  syncSaveButton();
}

async function saveCurrentSourceTab() {
  const SBZRShared = await ensureSBZRShared();
  const tab = getCurrentTab();
  if (!tab?.sourcePath) return;
  if (!isSourceTabDirty(tab)) {
    syncSaveButton();
    return;
  }

  persistCurrentTabState({ render: false });
  const localPath = getDictFileLabel(tab.sourcePath) || tab.sourcePath;
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
      await SBZRShared.savePackagedDictOverride(tab.sourcePath, editor.value);
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
  const SBZRShared = await ensureSBZRShared();
  await SBZRShared.promptAndSaveFixedEntry(selectedText, {
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
  const index = workspace.tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return;

  workspace.tabs.splice(index, 1);
  
  if (workspace.tabs.length === 0) {
    const tab = createTab('Note 1');
    workspace.tabs.push(tab);
    workspace.activeTabId = tab.id;
  } else if (workspace.activeTabId === tabId) {
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
    container.draggable = true;
    container.dataset.id = tab.id;

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
    const localPath = getDictFileLabel(tab.sourcePath) || tab.sourcePath;
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

editor.addEventListener('beforeinput', (event) => {
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
    event.preventDefault();
    return;
  }
  pendingHistorySnapshot = createEditorSnapshot();
});

let uiUpdatePending = false;

function scheduleUiUpdate() {
  if (uiUpdatePending) return;
  uiUpdatePending = true;
  requestAnimationFrame(() => {
    syncLineNumbers();
    updateCurrentLineHighlight();
    if (highlighter) highlighter.render();
    updateStatusCursorPos();
    uiUpdatePending = false;
  });
}

editor.addEventListener('input', () => {
  if (pendingHistorySnapshot) {
    recordHistoryBeforeChange(pendingHistorySnapshot);
    pendingHistorySnapshot = null;
  }
  
  scheduleUiUpdate();
  persistCurrentTabState({ render: false }); // Don't re-render tabs on every key
  scheduleAutoCopy();
});

editor.addEventListener('scroll', () => {
  syncScroll();
  scheduleUiUpdate();
  persistCurrentTabState({ save: false, render: false }); // Save scroll position but don't hit disk/DOM hard
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

vimModeButton.addEventListener('click', async () => {
  workspace.vimModeEnabled = !workspace.vimModeEnabled;
  saveWorkspace();
  if (workspace.vimModeEnabled && workspace.featureVim) {
    await ensureVimMode();
  } else {
    destroyVimMode();
  }
  syncVimModeButton();
});

openDictButton.addEventListener('click', () => {
  openDictDialog.showModal();
});

saveButton.addEventListener('click', () => {
  void saveCurrentSourceTab();
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

toggleHighlighterButton.addEventListener('click', async () => {
  workspace.highlighterEnabled = (workspace.highlighterEnabled !== false) ? false : true;
  saveWorkspace();
  if (workspace.highlighterEnabled && workspace.featureHighlighter) {
    await ensureHighlighter();
  } else {
    destroyHighlighter();
  }
  syncHighlighterButton();
});

settingsButton.addEventListener('click', () => {
  syncSettingsDialog();
  settingsDialog.showModal();
});

settingFeatureVim.addEventListener('change', async () => {
  workspace.featureVim = settingFeatureVim.checked;
  saveWorkspace();
  syncFeatureVisibility();
  if (workspace.featureVim && workspace.vimModeEnabled) {
    await ensureVimMode();
  } else if (!workspace.featureVim) {
    destroyVimMode();
  }
  syncVimModeButton();
});

settingFeatureHighlighter.addEventListener('change', async () => {
  workspace.featureHighlighter = settingFeatureHighlighter.checked;
  saveWorkspace();
  syncFeatureVisibility();
  if (workspace.featureHighlighter && workspace.highlighterEnabled !== false) {
    await ensureHighlighter();
  } else if (!workspace.featureHighlighter) {
    destroyHighlighter();
  }
  syncHighlighterButton();
});

settingFeatureWhitespace.addEventListener('change', () => {
  workspace.featureWhitespace = settingFeatureWhitespace.checked;
  saveWorkspace();
  syncFeatureVisibility();
  syncWhitespaceButton();
});

settingFeatureIme.addEventListener('change', () => {
  workspace.featureIme = settingFeatureIme.checked;
  saveWorkspace();
  syncFeatureVisibility();
  if (workspace.featureIme) {
    ensureImeControllerIfNeeded();
  } else if (sbzrImeController?.destroy) {
    sbzrImeController.destroy();
    sbzrImeController = null;
  }
  void syncImeStatusButton();
});

settingFeatureAutoCopy.addEventListener('change', () => {
  workspace.featureAutoCopy = settingFeatureAutoCopy.checked;
  saveWorkspace();
  syncFeatureVisibility();
  syncAutoCopyButton();
});

settingFeatureFont.addEventListener('change', () => {
  workspace.featureFont = settingFeatureFont.checked;
  saveWorkspace();
  syncFeatureVisibility();
});

tabsRoot.addEventListener('dblclick', (event) => {
  if (event.target !== tabsRoot) return;
  addTab();
});

imeStatusButton.addEventListener('click', async () => {
  const result = await chrome.storage.local.get([GLOBAL_ENABLED_STORAGE_KEY]);
  const currentlyEnabled = result[GLOBAL_ENABLED_STORAGE_KEY] !== false;
  await chrome.storage.local.set({ [GLOBAL_ENABLED_STORAGE_KEY]: !currentlyEnabled });
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
  // Ensure the current content is in the workspace object
  persistCurrentTabState({ save: false, render: false });
  // Force immediate write to localStorage
  saveWorkspace();
});

// Proactive periodic save every 30 seconds
setInterval(() => {
  persistCurrentTabState({ save: false, render: false });
  saveWorkspace();
}, 30000);

if (chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'sbzr_add_selection_to_fixed_dict') {
      void promptAndSaveFixedEntry(message.text || '');
      return;
    }
    if (message?.type === 'sbzr_add_current_selection_to_fixed_dict') {
      void ensureSBZRShared().then((SBZRShared) => {
        void promptAndSaveFixedEntry(SBZRShared.getActiveSelectedText());
      });
    }
  });
}

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes[GLOBAL_ENABLED_STORAGE_KEY]) {
        void syncImeStatusButton();
      }
      if (changes[IME_DICT_PATHS_STORAGE_KEY] && sbzrImeController) {
        void reinstallImeController();
      }
    }
  });
}

editor.addEventListener('focus', ensureImeControllerIfNeeded);
editor.addEventListener('pointerdown', ensureImeControllerIfNeeded);

renderTabs();
syncAutoCopyButton();
syncWhitespaceButton();
syncHighlighterButton();
void syncImeStatusButton();
syncVimModeButton();
restoreTab(getCurrentTab());
updateEditorTailSpace();
updateCurrentLineHighlight();

if (workspace.featureVim && workspace.vimModeEnabled) {
  void ensureVimMode();
}
if (workspace.featureHighlighter && workspace.highlighterEnabled !== false) {
  void ensureHighlighter().then(() => {
    restoreTab(getCurrentTab());
    syncHighlighterButton();
  });
}

let tabDraggingInstalled = false;

tabsRoot.addEventListener('pointerdown', () => {
  if (tabDraggingInstalled) return;
  void ensureSBZRShared().then((SBZRShared) => {
    if (tabDraggingInstalled || !SBZRShared?.installTabDragging) return;
    SBZRShared.installTabDragging(tabsRoot, {
      onOrderChange: (elements) => {
        const newTabs = [];
        for (const el of elements) {
          const tabId = el.dataset.id;
          const tab = workspace.tabs.find((t) => t.id === tabId);
          if (tab) newTabs.push(tab);
        }
        if (newTabs.length === workspace.tabs.length) {
          workspace.tabs = newTabs;
          saveWorkspace();
        }
      }
    });
    tabDraggingInstalled = true;
  });
}, { once: false });
