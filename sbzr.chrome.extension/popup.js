const SITE_RULES_STORAGE_KEY = 'sbzr_site_rules';
const IME_DICT_PATHS_STORAGE_KEY = 'sbzr_ime_dict_paths';
const NATIVE_HOST_NAME = 'com.sbzr.filehost';

const globalEnabledInput = document.getElementById('global-enabled');
const currentUrlEl = document.getElementById('current-url');
const currentStatusEl = document.getElementById('current-status');
const regexInput = document.getElementById('regex-input');
const messageEl = document.getElementById('message');
const rulesListEl = document.getElementById('rules-list');
const openNotepadButton = document.getElementById('open-notepad');
const openShortcutsButton = document.getElementById('open-shortcuts');
const candidateFontSizeInput = document.getElementById('candidate-font-size');
const candidateFontSizeValueEl = document.getElementById('candidate-font-size-value');
const addFixedDictShortcutEl = document.getElementById('add-fixed-dict-shortcut');
const shortcutHintEl = document.getElementById('shortcut-hint');
const imeDictListEl = document.getElementById('ime-dict-list');
const reloadDictsButton = document.getElementById('reload-dicts');
const syncToRimeButton = document.getElementById('sync-to-rime');

let currentTabUrl = '';
let siteRules = [];
let candidateFontSize = 13;
let imeDictPaths = [];
const ADD_TO_FIXED_DICT_COMMAND = 'add-selection-to-fixed-dict';
const IME_DICT_TABLES = window.SBZR_DICTS?.TABLES || [];
const DEFAULT_IME_DICT_PATHS = window.SBZR_DICTS?.DEFAULT_PATHS || IME_DICT_TABLES.map((table) => table.path);
const RELOADABLE_DICT_PATHS = window.SBZR_DICTS?.RELOADABLE_PATHS || [];

function escapeRegexLiteral(text) {
  return `${text || ''}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSiteRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules
    .map((rule) => ({
      pattern: `${rule?.pattern || ''}`.trim(),
      enabled: rule?.enabled !== false
    }))
    .filter((rule) => rule.pattern);
}

function getMatchedSiteRule(url) {
  let matchedRule = null;
  for (const rule of siteRules) {
    try {
      if (new RegExp(rule.pattern).test(url)) {
        matchedRule = rule;
      }
    } catch {
      // Ignore invalid regex during matching.
    }
  }
  return matchedRule;
}

function setMessage(text) {
  messageEl.textContent = text || '';
}

function clampCandidateFontSize(value) {
  const parsed = Number.parseInt(`${value ?? ''}`, 10);
  if (!Number.isFinite(parsed)) return 13;
  return Math.min(28, Math.max(12, parsed));
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

function describeImeDict(path) {
  switch (path) {
    case 'dicts/sbzr.single.dict.yaml':
      return 'Single-code single-character table.';
    case 'dicts/sbzr.len1.dict.yaml':
      return 'Single-character base table.';
    case 'dicts/sbzr.len1.full.dict.yaml':
      return 'Single-character full-code table.';
    case 'dicts/sbzr.len2.dict.yaml':
      return 'Two-character phrase table.';
    case 'dicts/sbzr.shortcut.dict.yaml':
      return 'Fast-added shortcuts from Nova Editor.';
    case 'dicts/sbzr.userdb.dict.yaml':
      return 'Main userdb phrase table.';
    case 'dicts/sbzr.userdb.full.dict.yaml':
      return 'Full-code derived userdb table.';
    case 'dicts/zdy.dict.yaml':
      return 'Shared custom dictionary for Nova and Rime.';
    default:
      return 'Packaged IME dictionary.';
  }
}

function renderImeDictOptions() {
  if (!imeDictListEl) return;

  const selected = new Set(normalizeImeDictPaths(imeDictPaths));
  imeDictListEl.textContent = '';

  IME_DICT_TABLES.forEach((table) => {
    const option = document.createElement('label');
    option.className = 'ime-dict-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selected.has(table.path);
    checkbox.dataset.path = table.path;

    const label = document.createElement('div');
    label.className = 'ime-dict-option-label';

    const title = document.createElement('strong');
    title.textContent = window.SBZRShared?.getDictFileLabel?.(table.path) || table.path;

    const path = document.createElement('code');
    path.textContent = table.path;

    const description = document.createElement('small');
    description.textContent = describeImeDict(table.path);

    label.appendChild(title);
    label.appendChild(path);
    label.appendChild(description);

    option.appendChild(checkbox);
    option.appendChild(label);
    imeDictListEl.appendChild(option);
  });
}

function buildImeDictConfig(selectedPaths = imeDictPaths) {
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

function setActionButtonState(button, state, text) {
  if (!button) return;
  button.classList.remove('is-loading', 'is-success', 'is-error');
  if (state) {
    button.classList.add(state);
  }
  button.disabled = state === 'is-loading';
  if (text) {
    button.textContent = text;
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

function renderCandidateFontSize() {
  candidateFontSizeInput.value = String(candidateFontSize);
  candidateFontSizeValueEl.textContent = `${candidateFontSize}px`;
}

async function readCommands() {
  if (!chrome.commands?.getAll) {
    addFixedDictShortcutEl.textContent = 'Unavailable';
    shortcutHintEl.textContent = 'This Chrome build does not expose shortcut info.';
    shortcutHintEl.classList.add('is-warning');
    return;
  }

  const commands = await chrome.commands.getAll();
  const command = commands.find((item) => item.name === ADD_TO_FIXED_DICT_COMMAND);
  const shortcut = command?.shortcut?.trim();

  if (shortcut) {
    addFixedDictShortcutEl.textContent = shortcut;
    shortcutHintEl.textContent = 'Select text, then press this shortcut to add it to sbzr.shortcut.dict.yaml.';
    shortcutHintEl.classList.remove('is-warning');
    return;
  }

  addFixedDictShortcutEl.textContent = 'Not Set';
  shortcutHintEl.textContent = 'Set it in Chrome shortcuts first, otherwise the command will not fire.';
  shortcutHintEl.classList.add('is-warning');
}

async function readCurrentTabUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabUrl = tabs[0]?.url || '';
  currentUrlEl.textContent = currentTabUrl || 'Unavailable';
}

async function readStorage() {
  const result = await chrome.storage.local.get([
    'sbzr_enabled',
    'sbzr_font_size',
    SITE_RULES_STORAGE_KEY,
    IME_DICT_PATHS_STORAGE_KEY
  ]);
  globalEnabledInput.checked = result.sbzr_enabled !== false;
  candidateFontSize = clampCandidateFontSize(result.sbzr_font_size);
  siteRules = normalizeSiteRules(result[SITE_RULES_STORAGE_KEY]);
  imeDictPaths = normalizeImeDictPaths(result[IME_DICT_PATHS_STORAGE_KEY]);
  const rawPaths = Array.isArray(result[IME_DICT_PATHS_STORAGE_KEY]) ? result[IME_DICT_PATHS_STORAGE_KEY] : [];
  if (JSON.stringify(imeDictPaths) !== JSON.stringify(rawPaths)) {
    await chrome.storage.local.set({ [IME_DICT_PATHS_STORAGE_KEY]: imeDictPaths });
  }
}

function renderStatus() {
  const matched = getMatchedSiteRule(currentTabUrl);
  currentStatusEl.textContent = matched
    ? `Current page: ${matched.enabled ? 'enabled' : 'disabled'} by ${matched.pattern}`
    : 'Current page: enabled by default';
}

function renderRules() {
  rulesListEl.textContent = '';
  if (siteRules.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No saved rules.';
    rulesListEl.appendChild(empty);
    return;
  }

  siteRules.forEach((rule, index) => {
    const item = document.createElement('div');
    item.className = 'rule-item';

    const header = document.createElement('div');
    header.className = 'rule-header';

    const state = document.createElement('div');
    state.className = `rule-state ${rule.enabled ? 'allow' : 'block'}`;
    state.textContent = rule.enabled ? 'ALLOW' : 'BLOCK';
    header.appendChild(state);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', async () => {
      siteRules = siteRules.filter((_, i) => i !== index);
      await chrome.storage.local.set({ [SITE_RULES_STORAGE_KEY]: siteRules });
      renderStatus();
      renderRules();
      setMessage('Rule removed.');
    });
    header.appendChild(removeBtn);

    const pattern = document.createElement('div');
    pattern.className = 'rule-pattern';
    pattern.textContent = rule.pattern;

    item.appendChild(header);
    item.appendChild(pattern);
    rulesListEl.appendChild(item);
  });
}

async function saveRule(pattern, enabled) {
  const normalized = `${pattern || ''}`.trim();
  if (!normalized) {
    setMessage('Regex is empty.');
    return;
  }
  try {
    new RegExp(normalized);
  } catch {
    setMessage('Invalid regex.');
    return;
  }
  siteRules = [...siteRules, { pattern: normalized, enabled }];
  await chrome.storage.local.set({ [SITE_RULES_STORAGE_KEY]: siteRules });
  regexInput.value = '';
  renderStatus();
  renderRules();
  setMessage('Rule saved.');
}

document.getElementById('enable-here').addEventListener('click', async () => {
  const url = new URL(currentTabUrl);
  await saveRule(`^${escapeRegexLiteral(url.origin)}`, true);
});

document.getElementById('disable-here').addEventListener('click', async () => {
  const url = new URL(currentTabUrl);
  await saveRule(`^${escapeRegexLiteral(url.origin)}`, false);
});

document.getElementById('save-enabled').addEventListener('click', async () => {
  await saveRule(regexInput.value, true);
});

document.getElementById('save-disabled').addEventListener('click', async () => {
  await saveRule(regexInput.value, false);
});

globalEnabledInput.addEventListener('change', async () => {
  await chrome.storage.local.set({ sbzr_enabled: globalEnabledInput.checked });
  setMessage(globalEnabledInput.checked ? 'Globally enabled.' : 'Globally disabled.');
});

candidateFontSizeInput.addEventListener('input', async () => {
  candidateFontSize = clampCandidateFontSize(candidateFontSizeInput.value);
  renderCandidateFontSize();
  await chrome.storage.local.set({ sbzr_font_size: candidateFontSize });
  setMessage(`Candidate font size set to ${candidateFontSize}px.`);
});

if (imeDictListEl) {
  imeDictListEl.addEventListener('change', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;

    const path = target.dataset.path || '';
    const nextPaths = new Set(normalizeImeDictPaths(imeDictPaths));
    if (target.checked) {
      nextPaths.add(path);
    } else {
      nextPaths.delete(path);
    }

    if (nextPaths.size === 0) {
      target.checked = true;
      setMessage('At least one dictionary must remain enabled.');
      return;
    }

    imeDictPaths = normalizeImeDictPaths([...nextPaths]);
    await chrome.storage.local.set({ [IME_DICT_PATHS_STORAGE_KEY]: imeDictPaths });
    renderImeDictOptions();
    setMessage('Loaded dictionaries updated.');
  });
}

reloadDictsButton.addEventListener('click', async () => {
  const originalText = reloadDictsButton.textContent;
  setActionButtonState(reloadDictsButton, 'is-loading', 'Reloading...');

  try {
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
      nextOverrides[path] = `${response.content || ''}`;
    }

    await chrome.storage.local.set({
      [window.SBZRShared.PACKAGED_DICT_OVERRIDES_STORAGE_KEY]: nextOverrides
    });
    await broadcastDictionaryReload();
    setActionButtonState(reloadDictsButton, 'is-success', 'Reloaded');
    setMessage('Reloaded packaged dictionaries from disk.');
  } catch (error) {
    setActionButtonState(reloadDictsButton, 'is-error', 'Reload Failed');
    setMessage(`Reload failed: ${error.message || error}`);
  } finally {
    window.setTimeout(() => {
      setActionButtonState(reloadDictsButton, '', originalText);
    }, 1800);
  }
});

syncToRimeButton.addEventListener('click', async () => {
  const originalText = syncToRimeButton.textContent;
  setActionButtonState(syncToRimeButton, 'is-loading', 'Syncing...');

  try {
    const result = await chrome.storage.local.get(['sbzr_user_history', 'sbzr_user_dict']);
    const userHistory = result.sbzr_user_history || {};
    const storedUserText = result.sbzr_user_dict || '';
    const { packagedPaths, affixSources } = buildImeDictConfig();
    const baseTexts = await window.SBZRShared.fetchPackagedRimeDictTexts({ paths: packagedPaths });
    const affixTexts = await window.SBZRShared.fetchPackagedAffixDictTexts({ sources: affixSources });
    const codeIndex = window.SBZRShared.buildWeightedCodeMapFromTexts([...baseTexts, storedUserText, ...affixTexts]);
    const res = await window.SBZRShared.syncUserHistoryToRime(userHistory, 'sbzrExtension', codeIndex);

    if (!res?.ok) {
      throw new Error(res?.error || 'Unknown error');
    }

    setActionButtonState(syncToRimeButton, 'is-success', 'Synced');
    setMessage('History synced to Rime.');
  } catch (error) {
    setActionButtonState(syncToRimeButton, 'is-error', 'Sync Failed');
    setMessage(`Sync failed: ${error.message || error}`);
  } finally {
    window.setTimeout(() => {
      setActionButtonState(syncToRimeButton, '', originalText);
    }, 1800);
  }
});

openNotepadButton.addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('notepad/index.html') });
  window.close();
});

openShortcutsButton.addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    window.close();
  } catch (error) {
    setMessage(`Open shortcuts failed: ${error.message || error}`);
  }
});

async function init() {
  await readCurrentTabUrl();
  await readStorage();
  await readCommands();
  renderCandidateFontSize();
  renderImeDictOptions();
  renderStatus();
  renderRules();
}

init().catch((error) => {
  setMessage(error.message || String(error));
});
