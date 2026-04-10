const SITE_RULES_STORAGE_KEY = 'sbzr_site_rules';

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

let currentTabUrl = '';
let siteRules = [];
let candidateFontSize = 13;
const ADD_TO_FIXED_DICT_COMMAND = 'add-selection-to-fixed-dict';

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
    shortcutHintEl.textContent = 'Select text, then press this shortcut to add it to fixed.dict.yaml.';
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
  const result = await chrome.storage.local.get(['sbzr_enabled', 'sbzr_font_size', SITE_RULES_STORAGE_KEY]);
  globalEnabledInput.checked = result.sbzr_enabled !== false;
  candidateFontSize = clampCandidateFontSize(result.sbzr_font_size);
  siteRules = normalizeSiteRules(result[SITE_RULES_STORAGE_KEY]);
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
  renderStatus();
  renderRules();
}

init().catch((error) => {
  setMessage(error.message || String(error));
});
