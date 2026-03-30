let codes = {};
let prefixSet = new Set();
let prefixCandidates = {};
let prefixCandidateSets = {};
const SBZRShared = window.SBZRShared;
let buffer = '';
let displayBuffer = '';
let candidates = [];
let baseCandidates = [];
let focusedElement = null;
let pageIndex = 0;
const PAGE_SIZE = 6;
const DEFAULT_VISIBLE_CANDIDATE_ROWS = 1;
const EXPANDED_VISIBLE_CANDIDATE_ROWS = 3;
let uiVisible = false;
let extensionEnabled = true;
let selectedCandidateIndex = 0;
let visibleCandidateRows = DEFAULT_VISIBLE_CANDIDATE_ROWS;
let modeToastTimer = null;
let fontSize = 13;
let userHistory = {}; // Store { code: [selectedWord1, selectedWord2, ...] }
const CUSTOM_ENTRY_WEIGHT = 999999999;
let dictLoadPromise = null;
let siteRules = [];
let siteSettingsOpen = false;
let currentPageEnabled = true;
let punctuationMode = 'cn';
let widthMode = 'half';
let manualPosition = null;
let draggingUI = false;
let dragOffset = { x: 0, y: 0 };
let notepadVisible = false;
let notepadTextarea = null;
let notepadHasFocus = false;
let notepadCard = null;
let notepadPos = null;
let notepadDragging = false;
let notepadDragOffset = { x: 0, y: 0 };
const USER_HISTORY_BEGIN_MARKER = '# sbzr-user-history-begin';
const USER_HISTORY_END_MARKER = '# sbzr-user-history-end';
const PACKAGED_RIME_DICT_PATHS = window.SBZR_DICTS?.RIME_PATHS || [
    'dicts/sbzr.shortcut.dict.yaml',
    'dicts/sbzr.len1.dict.yaml',
    'dicts/sbzr.len1.full.dict.yaml',
    'dicts/sbzr.len2.dict.yaml',
    'dicts/sbzr.userdb.dict.yaml',
    'dicts/sbzr.userdb.full.dict.yaml'
];
const PACKAGED_AFFIX_DICT_SOURCES = window.SBZR_DICTS?.AFFIX_SOURCES || [
    { path: 'dicts/zdy.dict.yaml', prefix: 'u', dictName: 'sbzdy.extension' }
];
const CONTENT_AUTO_INIT = window.__SBZR_CONTENT_AUTO_INIT__ !== false;
const RIME_USER_DICT_NAME = 'sbzr.user_dict';
const SITE_RULES_STORAGE_KEY = 'sbzr_site_rules';
const PUNCTUATION_MODE_STORAGE_KEY = 'sbzr_punctuation_mode';
const WIDTH_MODE_STORAGE_KEY = 'sbzr_width_mode';
const CN_PUNCTUATION_MAP = {
    ',': '，',
    '.': '。',
    '?': '？',
    '!': '！',
    ':': '：',
    ';': '；',
    '(': '（',
    ')': '）',
    '[': '【',
    ']': '】',
    '<': '《',
    '>': '》',
    '"': '“',
    "'": '‘',
    '\\': '、'
};
let runtimePackagedRimeDictPaths = [...PACKAGED_RIME_DICT_PATHS];
let runtimePackagedAffixDictSources = [...PACKAGED_AFFIX_DICT_SOURCES];
let runtimeMode = 'detached';
let managedTarget = null;
let suppressionCheck = null;
let listenersInstalled = false;
let storageSyncInstalled = false;
let messageListenerInstalled = false;

function attachShadowStyles(shadowRoot) {
    if (!chrome.runtime?.id) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('style.css');
    shadowRoot.appendChild(link);
}

function isPrintableAsciiKey(key) {
    return typeof key === 'string' && key.length === 1 && key.charCodeAt(0) >= 0x20 && key.charCodeAt(0) <= 0x7e;
}

function toFullWidthChar(char) {
    if (char === ' ') return '\u3000';
    const code = char.charCodeAt(0);
    if (code < 0x21 || code > 0x7e) return char;
    return String.fromCharCode(code + 0xfee0);
}

function mapDirectInputChar(key) {
    if (!isPrintableAsciiKey(key)) return '';
    if (/^[a-z]$/.test(key)) return '';
    if (punctuationMode === 'cn' && CN_PUNCTUATION_MAP[key]) {
        return CN_PUNCTUATION_MAP[key];
    }
    if (widthMode === 'full') {
        return toFullWidthChar(key);
    }
    return '';
}

function togglePunctuationMode() {
    punctuationMode = punctuationMode === 'cn' ? 'en' : 'cn';
    try {
        if (chrome.runtime && chrome.runtime.id) {
            chrome.storage.local.set({ [PUNCTUATION_MODE_STORAGE_KEY]: punctuationMode });
        }
    } catch (e) {
        console.log('SBZR: Punctuation mode save failed (context invalidated).');
    }
    if (uiVisible) renderUI();
}

function toggleWidthMode() {
    widthMode = widthMode === 'full' ? 'half' : 'full';
    try {
        if (chrome.runtime && chrome.runtime.id) {
            chrome.storage.local.set({ [WIDTH_MODE_STORAGE_KEY]: widthMode });
        }
    } catch (e) {
        console.log('SBZR: Width mode save failed (context invalidated).');
    }
    if (uiVisible) renderUI();
}

function applyUserHistory(list, key) {
    if (!key || list.length <= 1) return list;
    const preferredList = Array.isArray(userHistory[key])
        ? userHistory[key]
        : (userHistory[key] ? [userHistory[key]] : []);
    if (preferredList.length === 0) return list;

    const historyWords = [];
    const historySet = new Set();
    for (const word of preferredList) {
        if (!word || historySet.has(word)) continue;
        if (!list.includes(word)) continue;
        historySet.add(word);
        historyWords.push(word);
    }

    if (historyWords.length === 0) return list;
    const remaining = list.filter((word) => !historySet.has(word));
    return [...historyWords, ...remaining];
}

function recordUserHistorySelection(code, word, maxEntries = 12) {
    if (!code || !word) return;
    const existingList = Array.isArray(userHistory[code])
        ? userHistory[code]
        : (userHistory[code] ? [userHistory[code]] : []);
    const nextList = [word, ...existingList.filter((item) => item !== word)].slice(0, maxEntries);
    userHistory[code] = nextList;
}

function getVisibleCandidateCount() {
    return PAGE_SIZE * visibleCandidateRows;
}

function getVisibleStartIndex() {
    return pageIndex * PAGE_SIZE;
}

function getCurrentAbsoluteSelectedIndex() {
    return getVisibleStartIndex() + selectedCandidateIndex;
}

function getCurrentRowStartIndex() {
    return getVisibleStartIndex() + (Math.floor(selectedCandidateIndex / PAGE_SIZE) * PAGE_SIZE);
}

function setSelectionByAbsoluteIndex(absIndex) {
    if (candidates.length === 0) {
        pageIndex = 0;
        selectedCandidateIndex = 0;
        return;
    }

    const clampedAbsIndex = Math.max(0, Math.min(absIndex, candidates.length - 1));
    const visibleCount = getVisibleCandidateCount();
    let startIndex = getVisibleStartIndex();

    if (clampedAbsIndex < startIndex) {
        startIndex = Math.floor(clampedAbsIndex / PAGE_SIZE) * PAGE_SIZE;
    } else if (clampedAbsIndex >= startIndex + visibleCount) {
        startIndex = (Math.floor(clampedAbsIndex / PAGE_SIZE) - visibleCandidateRows + 1) * PAGE_SIZE;
    }

    startIndex = Math.max(0, startIndex);
    pageIndex = Math.floor(startIndex / PAGE_SIZE);
    selectedCandidateIndex = clampedAbsIndex - startIndex;
}

function expandCandidateRows() {
    if (visibleCandidateRows === EXPANDED_VISIBLE_CANDIDATE_ROWS) return;
    visibleCandidateRows = EXPANDED_VISIBLE_CANDIDATE_ROWS;
    setSelectionByAbsoluteIndex(getCurrentAbsoluteSelectedIndex());
}

function collapseCandidateRows() {
    if (visibleCandidateRows === DEFAULT_VISIBLE_CANDIDATE_ROWS) return;
    const currentAbsIndex = getCurrentAbsoluteSelectedIndex();
    visibleCandidateRows = DEFAULT_VISIBLE_CANDIDATE_ROWS;
    setSelectionByAbsoluteIndex(currentAbsIndex);
}

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

function getMatchedSiteRule(url = location.href) {
    let matchedRule = null;
    let matchedIndex = -1;
    for (let i = 0; i < siteRules.length; i++) {
        const rule = siteRules[i];
        try {
            if (new RegExp(rule.pattern).test(url)) {
                matchedRule = rule;
                matchedIndex = i;
            }
        } catch (e) {
            // Ignore invalid regex rules in matching, surface them only in the settings UI.
        }
    }
    return { rule: matchedRule, index: matchedIndex };
}

function evaluateCurrentPageEnabled() {
    const matched = getMatchedSiteRule();
    currentPageEnabled = matched.rule ? matched.rule.enabled !== false : true;
    if (!currentPageEnabled && uiVisible) {
        hideUI();
        buffer = '';
    }
}

function isImeActive() {
    return extensionEnabled && currentPageEnabled;
}

async function saveSiteRules(nextRules) {
    siteRules = normalizeSiteRules(nextRules);
    evaluateCurrentPageEnabled();
    await chrome.storage.local.set({ [SITE_RULES_STORAGE_KEY]: siteRules });
    if (uiVisible) renderUI();
}

async function upsertSiteRule(pattern, enabled) {
    const nextRules = [...siteRules, { pattern, enabled }];
    await saveSiteRules(nextRules);
}

async function removeSiteRuleAt(index) {
    if (index < 0 || index >= siteRules.length) return;
    const nextRules = siteRules.filter((_, i) => i !== index);
    await saveSiteRules(nextRules);
}

function getCandidateLengthPriority(text) {
    const length = Array.from(text || '').length;
    if (length === 1) return 0;
    if (length === 2) return 1;
    if (length === 3) return 2;
    return 3;
}

function prioritizeByWordLength(list) {
    return list
        .map((word, index) => ({ word, index }))
        .sort((a, b) => {
            const priorityDiff = getCandidateLengthPriority(a.word) - getCandidateLengthPriority(b.word);
            if (priorityDiff !== 0) return priorityDiff;
            return a.index - b.index;
        })
        .map((item) => item.word);
}

let lastLocalDictText = null;

function handleStorageChanged(changes) {
    if (changes.sbzr_enabled) {
        extensionEnabled = changes.sbzr_enabled.newValue !== false;
        if (!extensionEnabled && uiVisible) {
            hideUI();
            buffer = '';
        }
    }
    if (changes[SITE_RULES_STORAGE_KEY]) {
        siteRules = normalizeSiteRules(changes[SITE_RULES_STORAGE_KEY].newValue);
        evaluateCurrentPageEnabled();
        if (uiVisible) renderUI();
    }
    if (changes[PUNCTUATION_MODE_STORAGE_KEY]) {
        punctuationMode = changes[PUNCTUATION_MODE_STORAGE_KEY].newValue === 'en' ? 'en' : 'cn';
        if (uiVisible) renderUI();
    }
    if (changes[WIDTH_MODE_STORAGE_KEY]) {
        widthMode = changes[WIDTH_MODE_STORAGE_KEY].newValue === 'full' ? 'full' : 'half';
        if (uiVisible) renderUI();
    }
    if (changes.sbzr_font_size) {
        fontSize = changes.sbzr_font_size.newValue;
        updateUIMode();
    }
    if (changes.sbzr_user_history) {
        userHistory = changes.sbzr_user_history.newValue || {};
    }
    if (changes.sbzr_ui_pos) {
        manualPosition = changes.sbzr_ui_pos.newValue || null;
    }
    if (changes.sbzr_custom_dict || changes.sbzr_user_dict || changes[SBZRShared.PACKAGED_DICT_OVERRIDES_STORAGE_KEY]) {
        void reloadEffectiveDictFromStorage();
    }
}

function installStorageSync() {
    if (storageSyncInstalled) return;
    try {
        if (!chrome.storage || !chrome.storage.local) return;
        chrome.storage.local.get(['sbzr_enabled', 'sbzr_font_size', 'sbzr_custom_dict', 'sbzr_user_history', 'sbzr_ui_pos', SITE_RULES_STORAGE_KEY, PUNCTUATION_MODE_STORAGE_KEY, WIDTH_MODE_STORAGE_KEY, SBZRShared.PACKAGED_DICT_OVERRIDES_STORAGE_KEY], (result) => {
            extensionEnabled = result.sbzr_enabled !== false;
            if (result.sbzr_font_size) fontSize = result.sbzr_font_size;
            if (result.sbzr_user_history) userHistory = result.sbzr_user_history;
            if (result.sbzr_ui_pos) manualPosition = result.sbzr_ui_pos;
            siteRules = normalizeSiteRules(result[SITE_RULES_STORAGE_KEY]);
            if (result[PUNCTUATION_MODE_STORAGE_KEY] === 'en') punctuationMode = 'en';
            if (result[WIDTH_MODE_STORAGE_KEY] === 'full') widthMode = 'full';
            evaluateCurrentPageEnabled();
            updateUIMode();
            void loadEffectiveDict(result.sbzr_custom_dict || '', true);
        });
        chrome.storage.onChanged.addListener(handleStorageChanged);
        storageSyncInstalled = true;
    } catch (e) {
        console.log('SBZR: Initial storage sync failed (context invalidated).');
    }
}

function uninstallStorageSync() {
    if (!storageSyncInstalled) return;
    try {
        if (chrome.storage?.onChanged) {
            chrome.storage.onChanged.removeListener(handleStorageChanged);
        }
    } catch (e) {
        // Ignore invalidated extension context during teardown.
    }
    storageSyncInstalled = false;
}

// Candidates are labeled and selected by 1-6 on the current page.
const labels = ['1', '2', '3', '4', '5', '6'];

// Create UI
const uiContainer = document.createElement('div');
uiContainer.id = 'sbzr-ime-container';
const shadow = uiContainer.attachShadow({ mode: 'open' });
attachShadowStyles(shadow);
const uiRoot = document.createElement('div');
uiRoot.id = 'sbzr-ime-root';
shadow.appendChild(uiRoot);

const modeToast = document.createElement('div');
modeToast.id = 'sbzr-mode-toast';
shadow.appendChild(modeToast);

function showToast(text) {
    if (modeToastTimer) clearTimeout(modeToastTimer);
    modeToast.textContent = text;
    modeToast.style.display = 'block';
    modeToast.style.opacity = '1';
    modeToastTimer = setTimeout(() => {
        modeToast.style.opacity = '0';
        setTimeout(() => { modeToast.style.display = 'none'; }, 300);
    }, 1000);
}

function createImeButton(content, title, onClick, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ime-btn${className ? ` ${className}` : ''}`;
    if (title) {
        button.title = title;
        button.setAttribute('aria-label', title);
    }
    if (typeof content === 'string') {
        button.textContent = content;
    } else if (content instanceof Node) {
        button.appendChild(content);
    }
    button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void onClick(e);
    });
    return button;
}

function openExtensionNotepad() {
    if (!chrome.runtime?.id) return;
    window.open(chrome.runtime.getURL('notepad/index.html'), '_blank', 'noopener,noreferrer');
}

function renderSiteSettingsPanel() {
    const panel = document.createElement('div');
    panel.className = 'site-settings';

    const currentUrl = document.createElement('div');
    currentUrl.className = 'site-settings-url';
    currentUrl.textContent = location.href;
    panel.appendChild(currentUrl);

    const matched = getMatchedSiteRule();
    const status = document.createElement('div');
    status.className = 'site-settings-status';
    status.textContent = matched.rule
        ? `Current rule: ${matched.rule.enabled ? 'Enabled' : 'Disabled'} / ${matched.rule.pattern}`
        : `Current rule: default enabled`;
    panel.appendChild(status);

    const quickActions = document.createElement('div');
    quickActions.className = 'site-settings-actions';
    quickActions.appendChild(createImeButton('Enable Here', 'Enable on current site', async () => {
        await upsertSiteRule(`^${escapeRegexLiteral(location.origin)}`, true);
        showToast('Enabled On This Site');
    }));
    quickActions.appendChild(createImeButton('Disable Here', 'Disable on current site', async () => {
        await upsertSiteRule(`^${escapeRegexLiteral(location.origin)}`, false);
        showToast('Disabled On This Site');
    }));
    panel.appendChild(quickActions);

    const form = document.createElement('div');
    form.className = 'site-settings-form';

    const input = document.createElement('input');
    input.className = 'site-settings-input';
    input.type = 'text';
    input.placeholder = '^https://example\\.com/';
    form.appendChild(input);

    const enabledBtn = createImeButton('Save Enabled', 'Save regex as enabled rule', async () => {
        const pattern = input.value.trim();
        if (!pattern) return;
        try {
            new RegExp(pattern);
        } catch (e) {
            showToast('Invalid Regex');
            return;
        }
        await upsertSiteRule(pattern, true);
        showToast('Rule Saved');
    });

    const disabledBtn = createImeButton('Save Disabled', 'Save regex as disabled rule', async () => {
        const pattern = input.value.trim();
        if (!pattern) return;
        try {
            new RegExp(pattern);
        } catch (e) {
            showToast('Invalid Regex');
            return;
        }
        await upsertSiteRule(pattern, false);
        showToast('Rule Saved');
    });

    form.appendChild(enabledBtn);
    form.appendChild(disabledBtn);
    panel.appendChild(form);

    const list = document.createElement('div');
    list.className = 'site-settings-list';
    siteRules.forEach((rule, index) => {
        const row = document.createElement('div');
        row.className = 'site-settings-rule';

        const text = document.createElement('div');
        text.className = 'site-settings-rule-text';
        text.textContent = `${rule.enabled ? 'ALLOW' : 'BLOCK'}  ${rule.pattern}`;
        row.appendChild(text);

        row.appendChild(createImeButton('×', 'Remove rule', async () => {
            await removeSiteRuleAt(index);
            showToast('Rule Removed');
        }));

        list.appendChild(row);
    });
    panel.appendChild(list);

    return panel;
}

function toggleMode() {
    extensionEnabled = !extensionEnabled;
    try {
        if (chrome.runtime && chrome.runtime.id) {
            chrome.storage.local.set({ sbzr_enabled: extensionEnabled });
        }
    } catch (e) {
        console.log('SBZR: Extension context invalidated, state not saved.');
    }
    if (!extensionEnabled && uiVisible) {
        hideUI();
        buffer = '';
    }
}

function updateUIMode() {
    uiRoot.style.fontSize = `${fontSize}px`;
    uiRoot.style.transform = '';
    uiRoot.style.transformOrigin = '';
}

function enableIme() {
    if (extensionEnabled) return;
    extensionEnabled = true;
    try {
        if (chrome.runtime && chrome.runtime.id) {
            chrome.storage.local.set({ sbzr_enabled: true });
        }
    } catch (e) {
        console.log('SBZR: Extension context invalidated, state not saved.');
    }
}

async function copyNotepadText() {
    if (!notepadTextarea) return;
    const text = notepadTextarea.value || '';
    try {
        await navigator.clipboard.writeText(text);
    } catch (e) {
        fallbackCopyNotepad(text);
    }
}

function fallbackCopyNotepad() {
    if (!notepadTextarea) return;
    const prevStart = notepadTextarea.selectionStart;
    const prevEnd = notepadTextarea.selectionEnd;
    const prevScroll = notepadTextarea.scrollTop;
    notepadTextarea.focus();
    notepadTextarea.select();
    try {
        document.execCommand('copy');
    } catch (e) {
        // Ignore if copy fails.
    }
    notepadTextarea.setSelectionRange(prevStart, prevEnd);
    notepadTextarea.scrollTop = prevScroll;
}

function showNotepad() {
    injectNotepad();
    const container = document.getElementById('sbzr-notepad-container');
    if (!container) return;
    const root = container.shadowRoot?.getElementById('sbzr-notepad');
    if (!root) return;
    root.style.display = 'flex';
    notepadVisible = true;
    if (notepadCard) {
        if (notepadPos) {
            notepadCard.style.left = `${notepadPos.x}px`;
            notepadCard.style.top = `${notepadPos.y}px`;
            notepadCard.style.transform = 'none';
        } else {
            notepadCard.style.left = '50%';
            notepadCard.style.top = '50%';
            notepadCard.style.transform = 'translate(-50%, -50%)';
        }
    }
    setTimeout(() => {
        notepadTextarea?.focus();
    }, 0);
}

function hideNotepad() {
    const container = document.getElementById('sbzr-notepad-container');
    if (!container) return;
    const root = container.shadowRoot?.getElementById('sbzr-notepad');
    if (!root) return;
    root.style.display = 'none';
    notepadVisible = false;
}

function toggleNotepad() {
    if (notepadVisible) {
        hideNotepad();
    } else {
        showNotepad();
    }
}

function handleRuntimeMessage(msg) {
    if (msg && msg.type === 'sbzr_toggle_notepad') {
        toggleNotepad();
        return;
    }
    if (msg && msg.type === 'sbzr_add_selected_to_dict') {
        void promptAndSaveCustomEntry(msg.text || '');
        return;
    }
    if (msg && msg.type === 'sbzr_add_selection_to_fixed_dict') {
        void SBZRShared.promptAndSaveFixedEntry(msg.text || '');
        return;
    }
    if (msg && msg.type === 'sbzr_add_current_selection_to_fixed_dict') {
        void SBZRShared.promptAndSaveFixedEntry(SBZRShared.getActiveSelectedText());
        return;
    }
    if (msg && msg.type === 'sbzr_reload_effective_dict') {
        void reloadEffectiveDictFromStorage();
    }
}

function installRuntimeMessageListener() {
    if (messageListenerInstalled) return;
    try {
        if (!chrome.runtime || !chrome.runtime.onMessage) return;
        chrome.runtime.onMessage.addListener(handleRuntimeMessage);
        messageListenerInstalled = true;
    } catch (e) {
        console.log('SBZR: Notepad message listener failed (context invalidated).');
    }
}

function uninstallRuntimeMessageListener() {
    if (!messageListenerInstalled) return;
    try {
        if (chrome.runtime?.onMessage) {
            chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
        }
    } catch (e) {
        // Ignore invalidated extension context during teardown.
    }
    messageListenerInstalled = false;
}

function injectUI() {
    if (!document.body) {
        setTimeout(injectUI, 100);
        return;
    }
    if (window.innerWidth < 100 || window.innerHeight < 100) return;
    if (!document.getElementById('sbzr-ime-container')) {
        document.body.appendChild(uiContainer);
        console.log('SBZR: UI Injected');
    }
}

function injectNotepad() {
    if (!document.body) {
        setTimeout(injectNotepad, 100);
        return;
    }
    if (document.getElementById('sbzr-notepad-container')) return;

    const container = document.createElement('div');
    container.id = 'sbzr-notepad-container';
    const npShadow = container.attachShadow({ mode: 'open' });
    attachShadowStyles(npShadow);

    const root = document.createElement('div');
    root.id = 'sbzr-notepad';

    const card = document.createElement('div');
    card.className = 'notepad-card';

    const header = document.createElement('div');
    header.className = 'notepad-header';

    const title = document.createElement('div');
    title.className = 'notepad-title';
    title.textContent = 'Notepad (Esc to copy & close)';

    const actions = document.createElement('div');
    actions.className = 'notepad-actions';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'notepad-btn';
    clearBtn.title = 'Clear';
    clearBtn.textContent = 'C';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'notepad-btn';
    closeBtn.title = 'Close';
    closeBtn.textContent = 'X';

    actions.appendChild(clearBtn);
    actions.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(actions);

    const textarea = document.createElement('textarea');
    textarea.className = 'notepad-input';
    textarea.setAttribute('placeholder', 'Type here...');

    textarea.addEventListener('keydown', async (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            await copyNotepadText();
            hideNotepad();
        }
    });
    textarea.addEventListener('focus', () => {
        notepadHasFocus = true;
        focusedElement = textarea;
    });
    textarea.addEventListener('blur', () => {
        notepadHasFocus = false;
    });

    clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        textarea.value = '';
        textarea.focus();
    });
    closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        hideNotepad();
    });

    card.appendChild(header);
    card.appendChild(textarea);
    root.appendChild(card);
    npShadow.appendChild(root);

    document.body.appendChild(container);
    notepadTextarea = textarea;
    notepadCard = card;

    const onDragMove = (e) => {
        if (!notepadDragging || !notepadCard) return;
        const rect = notepadCard.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);
        let nextLeft = e.clientX - notepadDragOffset.x;
        let nextTop = e.clientY - notepadDragOffset.y;
        if (nextLeft < 0) nextLeft = 0;
        if (nextTop < 0) nextTop = 0;
        if (nextLeft > maxLeft) nextLeft = maxLeft;
        if (nextTop > maxTop) nextTop = maxTop;
        notepadCard.style.left = `${nextLeft}px`;
        notepadCard.style.top = `${nextTop}px`;
        notepadCard.style.transform = 'none';
        notepadPos = { x: nextLeft, y: nextTop };
    };

    const onDragEnd = () => {
        if (!notepadDragging) return;
        notepadDragging = false;
    };

    header.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        if (!notepadCard) return;
        const rect = notepadCard.getBoundingClientRect();
        notepadCard.style.left = `${rect.left}px`;
        notepadCard.style.top = `${rect.top}px`;
        notepadCard.style.transform = 'none';
        notepadDragging = true;
        notepadDragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    });

    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
}

async function loadDict() {
    try {
        if (!chrome.runtime || !chrome.runtime.id) return;

        // Check if we already have it from storage (initialized in global sync)
        if (Object.keys(codes).length > 0) return;
        if (dictLoadPromise) {
            await dictLoadPromise;
            return;
        }

        dictLoadPromise = (async () => {
            const result = await chrome.storage.local.get(['sbzr_custom_dict']);
            await loadEffectiveDict(result.sbzr_custom_dict || '', true);
        })();
        await dictLoadPromise;
    } catch (e) {
        console.error('SBZR: Dictionary load failed', e);
    } finally {
        dictLoadPromise = null;
    }
}

async function loadLocalDict(force = false) {
    try {
        const texts = await fetchPackagedRimeDictTexts();
        const codeIndex = buildCodeIndexFromTexts(texts);
        const signature = JSON.stringify(codeIndex);
        if (!Object.keys(codeIndex).length) {
            console.warn('SBZR: No packaged Rime dictionary entries found');
            return;
        }
        if (!force && signature === lastLocalDictText) return;
        lastLocalDictText = signature;
        applyCodeIndex(codeIndex);
        console.log('SBZR: Dictionary ready (from packaged Rime dictionaries)', Object.keys(codes).length, 'entries');
    } catch (e) {
        console.error('SBZR: Local dictionary load failed', e);
    }
}

function normalizeDictText(text) {
    const normalized = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

function isMeaningfulDictText(text) {
    return !!(text && text.trim().length > 0);
}

function parseWeight(weight, fallback = 10) {
    const parsed = Number.parseInt(`${weight ?? ''}`, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function detectDictFormat(text) {
    const normalized = normalizeDictText(text);
    if (/(^|\n)\s*columns:\s*(\n|$)/.test(normalized) || /(^|\n)\s*\.\.\.\s*(\n|$)/.test(normalized)) {
        return 'rime';
    }

    const lines = normalized.split('\n');
    for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (trimmed === '---' || trimmed === '...') return 'rime';
        if (rawLine.includes('\t')) return 'rime';
        if (parseDictLine(rawLine)) return 'legacy';
    }

    return 'legacy';
}

function addCodeEntry(codeMap, code, word, weight, sequence) {
    const normalizedCode = (code || '').trim().toLowerCase();
    const normalizedWord = (word || '').trim();
    if (!normalizedCode || !normalizedWord) return;

    let wordsMap = codeMap.get(normalizedCode);
    if (!wordsMap) {
        wordsMap = new Map();
        codeMap.set(normalizedCode, wordsMap);
    }

    const normalizedWeight = parseWeight(weight);
    const existing = wordsMap.get(normalizedWord);
    if (!existing) {
        wordsMap.set(normalizedWord, {
            word: normalizedWord,
            weight: normalizedWeight,
            sequence
        });
        return;
    }

    if (normalizedWeight > existing.weight) {
        existing.weight = normalizedWeight;
    }
    if (sequence < existing.sequence) {
        existing.sequence = sequence;
    }
}

function appendLegacyDictEntries(text, codeMap, sequenceRef) {
    const lines = normalizeDictText(text).split('\n');
    for (const rawLine of lines) {
        const parsedLine = parseDictLine(rawLine);
        if (!parsedLine) continue;
        for (const item of parsedLine.items) {
            addCodeEntry(codeMap, parsedLine.code, item.word, item.weight || '10', sequenceRef.value++);
        }
    }
}

function appendRimeDictEntries(text, codeMap, sequenceRef) {
    const normalized = normalizeDictText(text);
    const hasHeader = /(^|\n)\s*\.\.\.\s*(\n|$)/.test(normalized);
    let inDataSection = !hasHeader;

    for (const rawLine of normalized.split('\n')) {
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (trimmed === '---') {
            inDataSection = !hasHeader;
            continue;
        }
        if (trimmed === '...') {
            inDataSection = true;
            continue;
        }
        if (!inDataSection) continue;

        const columns = rawLine.includes('\t')
            ? rawLine.split('\t').map((part) => part.trim()).filter(Boolean)
            : trimmed.split(/\s+/).filter(Boolean);
        if (columns.length < 2) continue;

        const [word, code, weight = '10'] = columns;
        if (!word || !code) continue;
        addCodeEntry(codeMap, code, word, weight, sequenceRef.value++);
    }
}

function buildCodeIndexFromTexts(texts) {
    return SBZRShared.buildCodeIndexFromTexts(texts);
}

function buildWeightedCodeMapFromTexts(texts) {
    return SBZRShared.buildWeightedCodeMapFromTexts(texts);
}

function applyCodeIndex(codeIndex) {
    codes = {};
    prefixSet = new Set();
    prefixCandidates = {};
    prefixCandidateSets = {};

    for (const [code, words] of Object.entries(codeIndex)) {
        if (!Array.isArray(words) || words.length === 0) continue;
        codes[code] = words;

        for (let len = 1; len < code.length; len++) {
            prefixSet.add(code.substring(0, len));
        }

        if (code.length > 3) {
            const prefix3 = code.substring(0, 3);
            if (!prefixCandidates[prefix3]) {
                prefixCandidates[prefix3] = [];
                prefixCandidateSets[prefix3] = new Set();
            }
            const set = prefixCandidateSets[prefix3];
            const list = prefixCandidates[prefix3];
            for (const word of words) {
                if (!set.has(word)) {
                    set.add(word);
                    list.push(word);
                }
            }
        }
    }
}

async function fetchPackagedRimeDictTexts() {
    return SBZRShared.fetchPackagedRimeDictTexts({
        runtime: chrome.runtime,
        paths: runtimePackagedRimeDictPaths
    });
}

function prefixCodeMap(codeMap, prefix) {
    const prefixedMap = new Map();
    for (const [code, wordsMap] of codeMap.entries()) {
        const nextCode = `${prefix}${code}`;
        for (const entry of wordsMap.values()) {
            addCodeEntry(prefixedMap, nextCode, entry.word, entry.weight, entry.sequence);
        }
    }
    return prefixedMap;
}

async function fetchPackagedAffixDictTexts() {
    return SBZRShared.fetchPackagedAffixDictTexts({
        runtime: chrome.runtime,
        sources: runtimePackagedAffixDictSources
    });
}

function decodeUserHistoryWord(value) {
    return value
        .replace(/\\\\/g, '\0')
        .replace(/\\t/g, '\t')
        .replace(/\\n/g, '\n')
        .replace(/\0/g, '\\');
}

function extractUserHistoryFromText(text) {
    const history = {};
    if (!text) return history;

    const lines = normalizeDictText(text).split('\n');
    let inBlock = false;

    for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (trimmed === USER_HISTORY_BEGIN_MARKER) {
            inBlock = true;
            continue;
        }
        if (trimmed === USER_HISTORY_END_MARKER) {
            inBlock = false;
            continue;
        }
        if (!inBlock) continue;
        if (!trimmed.startsWith('#')) continue;

        const body = trimmed.slice(1).trim();
        if (!body || body.startsWith('Restores adaptive')) continue;

        const tabIdx = body.indexOf('\t');
        if (tabIdx === -1) continue;

        const code = body.slice(0, tabIdx).trim().toLowerCase();
        const word = decodeUserHistoryWord(body.slice(tabIdx + 1));
        if (!/^[a-z]+$/.test(code) || !word) continue;
        const existing = Array.isArray(history[code])
            ? history[code]
            : (history[code] ? [history[code]] : []);
        history[code] = [...existing, word];
    }

    return history;
}

async function syncImportedUserHistory(userText) {
    const importedHistory = extractUserHistoryFromText(userText);
    if (Object.keys(importedHistory).length === 0) return;

    const result = await chrome.storage.local.get(['sbzr_user_history']);
    const currentHistory = result.sbzr_user_history || {};
    let changed = false;
    const nextHistory = { ...currentHistory };

    for (const [code, words] of Object.entries(importedHistory)) {
        const currentWords = Array.isArray(nextHistory[code])
            ? nextHistory[code]
            : (nextHistory[code] ? [nextHistory[code]] : []);
        const merged = [...new Set([...(Array.isArray(words) ? words : [words]), ...currentWords])];
        if (JSON.stringify(currentWords) === JSON.stringify(merged)) continue;
        nextHistory[code] = merged;
        changed = true;
    }

    if (!changed) return;
    userHistory = nextHistory;
    await chrome.storage.local.set({ sbzr_user_history: nextHistory });
}

function parseDictItems(rest) {
    const items = [];
    const regex = /"((?:\\.|[^"\\])*)"(?:\:(\d+))?|(\S+)/g;
    let match;

    while ((match = regex.exec(rest)) !== null) {
        if (match[1] !== undefined) {
            const word = match[1]
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\');
            items.push({
                word,
                weight: match[2] || '10'
            });
            continue;
        }

        const token = match[3];
        const colonIdx = token.lastIndexOf(':');
        if (colonIdx !== -1) {
            items.push({
                word: token.substring(0, colonIdx),
                weight: token.substring(colonIdx + 1) || '10'
            });
        } else {
            items.push({
                word: token,
                weight: '10'
            });
        }
    }

    return items.filter((item) => item.word);
}

function parseDictLine(rawLine) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---')) {
        return null;
    }

    const firstSpaceIdx = trimmed.search(/\s/);
    if (firstSpaceIdx === -1) {
        return null;
    }

    const code = trimmed.slice(0, firstSpaceIdx);
    const rest = trimmed.slice(firstSpaceIdx).trim();
    if (!code || !rest) {
        return null;
    }

    return {
        code,
        items: parseDictItems(rest)
    };
}

function formatDictItem(word, weight) {
    if (/\s/.test(word) || word.includes('"')) {
        const escaped = word.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `"${escaped}":${weight}`;
    }
    return `${word}:${weight}`;
}

function buildRimeDictHeader(dictName = RIME_USER_DICT_NAME) {
    return [
        '# Rime dictionary',
        '# encoding: utf-8',
        '',
        '---',
        `name: ${dictName}`,
        'version: "1.0"',
        'sort: by_weight',
        'use_preset_vocabulary: false',
        'columns:',
        '  - text',
        '  - code',
        '  - weight',
        '...'
    ].join('\n');
}

function renderRimeDictText(codeMap, dictName = RIME_USER_DICT_NAME) {
    return SBZRShared.renderRimeDictText(codeMap, dictName);
}

async function getCurrentDictText() {
    const result = await chrome.storage.local.get(['sbzr_custom_dict']);
    if (result.sbzr_custom_dict) {
        return result.sbzr_custom_dict;
    }

    const texts = await fetchPackagedRimeDictTexts();
    return texts.join('\n');
}


function upsertEntryInDictText(sourceText, code, word, weight = CUSTOM_ENTRY_WEIGHT) {
    const codeMap = buildWeightedCodeMapFromTexts([sourceText]);
    addCodeEntry(codeMap, code, word, weight, -1);
    return renderRimeDictText(codeMap);
}

async function getOptionalUserDictText() {
    const affixTexts = await fetchPackagedAffixDictTexts();
    return affixTexts.join('\n');
}

async function loadEffectiveDict(baseDictText = '', force = false) {
    const storageResult = await chrome.storage.local.get(['sbzr_user_dict']);
    const storedUserText = storageResult.sbzr_user_dict || '';
    const baseTexts = isMeaningfulDictText(baseDictText)
        ? [baseDictText]
        : await fetchPackagedRimeDictTexts();
    const userText = await getOptionalUserDictText();
    await syncImportedUserHistory(userText);
    const codeIndex = buildCodeIndexFromTexts([...baseTexts, storedUserText, userText]);
    const signature = JSON.stringify(codeIndex);
    if (!Object.keys(codeIndex).length) {
        console.warn('SBZR: Effective dictionary is empty');
        return;
    }
    if (!force && signature === lastLocalDictText) return;
    lastLocalDictText = signature;
    applyCodeIndex(codeIndex);
    console.log(
        'SBZR: Dictionary ready',
        Object.keys(codes).length,
        'entries',
        storedUserText || userText ? '(with user dictionaries)' : '(base only)'
    );
}

async function reloadEffectiveDictFromStorage() {
    try {
        const result = await chrome.storage.local.get(['sbzr_custom_dict']);
        await loadEffectiveDict(result.sbzr_custom_dict || '', true);
    } catch (err) {
        console.error('SBZR: Failed to reload effective dictionary', err);
    }
}

async function promptAndSaveCustomEntry(selectedText) {
    const word = (selectedText || '').trim();
    if (!word) {
        SBZRShared.showAppToast('没有可添加的选中文本。', { tone: 'warning' });
        return;
    }

    const input = await SBZRShared.showCodeInputDialog(word);
    if (input === null) return;

    const code = input.trim().toLowerCase();

    try {
        const result = await chrome.storage.local.get(['sbzr_user_dict']);
        const nextText = upsertEntryInDictText(result.sbzr_user_dict || '', code, word);
        await chrome.storage.local.set({
            sbzr_user_dict: nextText
        });
        SBZRShared.showAppToast(`已添加到 SBZR 词库：${word} -> ${code}`, { tone: 'success' });
    } catch (err) {
        console.error('SBZR: Add custom entry failed', err);
        SBZRShared.showAppToast(`添加失败：${err.message}`, { tone: 'error', duration: 3200 });
    }
}

function parseYamlDict(text) {
    applyCodeIndex(buildCodeIndexFromTexts([text]));
}

function init() {
    injectUI();
}

function isInput(el) {
    if (!el) return false;
    if (managedTarget) return el === managedTarget;
    if (notepadTextarea && el === notepadTextarea) return true;
    const isStandard = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
    const isRoleTextbox = el.getAttribute('role') === 'textbox';
    const isAriaEditable = el.getAttribute('aria-multiline') === 'true' || el.classList.contains('docs-textextras-normal');
    // For many sites, inputs might not have obvious roles but are part of a specific class
    return isStandard || isRoleTextbox || isAriaEditable;
}

function resolveActiveElement(e) {
    if (managedTarget) {
        const path = typeof e?.composedPath === 'function' ? e.composedPath() : [];
        if (path.includes(managedTarget)) return managedTarget;
        if (document.activeElement === managedTarget) return managedTarget;
    }

    let activeEl = document.activeElement;
    if (activeEl && activeEl.shadowRoot && activeEl.shadowRoot.activeElement) {
        activeEl = activeEl.shadowRoot.activeElement;
    }

    const path = typeof e?.composedPath === 'function' ? e.composedPath() : [];
    for (const node of path) {
        if (node instanceof HTMLElement && isInput(node)) {
            return node;
        }
    }

    if (notepadTextarea) {
        if (notepadHasFocus) return notepadTextarea;
        if (path.includes(notepadTextarea)) return notepadTextarea;
    }

    return activeEl;
}

function isManagedTargetFocused() {
    if (!managedTarget) return false;
    return document.activeElement === managedTarget;
}

function isImeSuppressed() {
    return !!(suppressionCheck && suppressionCheck());
}

function handleDocumentKeyDown(e) {
    let activeEl = resolveActiveElement(e);

    if (runtimeMode === 'page' && e.key === 'f' && e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        if (notepadVisible) {
            hideNotepad();
        } else {
            showNotepad();
            enableIme();
        }
        return;
    }

    // Shift key toggle
    if (e.key === 'Shift' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        return;
    }

    if (!isInput(activeEl)) {
        if (uiVisible) {
            hideUI();
            buffer = '';
        }
        return;
    }
    focusedElement = activeEl;

    if (!isImeActive() || isImeSuppressed()) return;

    if (!codes || Object.keys(codes).length === 0) {
        void loadDict();
        return;
    }

    const key = e.key;
    const lowerKey = key.toLowerCase();

    // Prevent intercepting if Ctrl/Alt/Meta is pressed
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const mappedDirectChar = mapDirectInputChar(key);
    if (mappedDirectChar) {
        if (uiVisible && buffer) {
            if (candidates.length > 0) {
                selectCandidate(selectedCandidateIndex);
            } else {
                commit(buffer, false);
            }
        }
        commit(mappedDirectChar, false);
        e.preventDefault();
        e.stopPropagation();
        return;
    }

    if (e.shiftKey && /^[A-Z]$/.test(key)) {
        commit(key, false);
        e.preventDefault();
        e.stopPropagation();
    } else if (/^[a-z]$/.test(lowerKey)) {
        // Auto-commit rule (3-char unique match)
        if (buffer.length === 3) {
            if (candidates.length === 1 && !prefixSet.has(buffer)) {
                commit(candidates[0], true);
                startBuffer(lowerKey);
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }

        // Auto-commit rule (4-char logic)
        if (buffer.length === 4) {
            const nextKey = buffer + lowerKey;
            const nextExists = !!codes[nextKey] || prefixSet.has(nextKey);
            // If the 5th char doesn't form a valid extension, commit 1st and start new
            if (!nextExists && candidates.length > 0) {
                commit(candidates[0], true);
                startBuffer(lowerKey);
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }

        startBuffer(buffer + lowerKey);
        e.preventDefault();
        e.stopPropagation();
    } else if (/^[1-6]$/.test(key)) {
        if (uiVisible) {
            const relIndex = parseInt(key, 10) - 1;
            const absIndex = getCurrentRowStartIndex() + relIndex;
            if (candidates.length > absIndex) {
                selectCandidateByAbsoluteIndex(absIndex);
                e.preventDefault();
                e.stopPropagation();
            }
        }
    } else if (key === ' ') {
        if (uiVisible) {
            if (candidates.length > 0) {
                selectCandidate(selectedCandidateIndex);
            } else {
                commit(buffer, false);
            }
            e.preventDefault();
            e.stopPropagation();
        }
    } else if (key === 'Backspace') {
        if (uiVisible) {
            buffer = buffer.slice(0, -1);
            if (buffer === '') {
                hideUI();
            } else {
                pageIndex = 0;
                updateCandidates();
            }
            e.preventDefault();
            e.stopPropagation();
        }
    } else if (key === 'Escape') {
        if (uiVisible) {
            hideUI();
            buffer = '';
            e.preventDefault();
            e.stopPropagation();
        }
    } else if (key === 'ArrowRight') {
        if (uiVisible) {
            const nextAbsIndex = getCurrentAbsoluteSelectedIndex() + 1;
            if (nextAbsIndex < candidates.length) {
                setSelectionByAbsoluteIndex(nextAbsIndex);
                renderUI();
            }
            e.preventDefault();
            e.stopPropagation();
        }
    } else if (key === 'ArrowLeft') {
        if (uiVisible) {
            const nextAbsIndex = getCurrentAbsoluteSelectedIndex() - 1;
            if (nextAbsIndex >= 0) {
                setSelectionByAbsoluteIndex(nextAbsIndex);
                renderUI();
            }
            e.preventDefault();
            e.stopPropagation();
        }
    } else if (['ArrowDown', ']', '=', '.', '>'].includes(key)) {
        if (uiVisible) {
            e.preventDefault();
            e.stopPropagation();
            if (key === 'ArrowDown') {
                if (visibleCandidateRows === DEFAULT_VISIBLE_CANDIDATE_ROWS && candidates.length > PAGE_SIZE) {
                    expandCandidateRows();
                    renderUI();
                } else {
                    const nextAbsIndex = getCurrentAbsoluteSelectedIndex() + PAGE_SIZE;
                    if (nextAbsIndex < candidates.length) {
                        setSelectionByAbsoluteIndex(nextAbsIndex);
                        renderUI();
                    }
                }
            } else if ((pageIndex + 1) * PAGE_SIZE < candidates.length) {
                pageIndex++;
                selectedCandidateIndex = Math.min(selectedCandidateIndex, getVisibleCandidateCount() - 1);
                renderUI();
            }
        }
    } else if (['ArrowUp', '[', '-', ',', '<'].includes(key)) {
        if (uiVisible) {
            e.preventDefault();
            e.stopPropagation();
            if (key === 'ArrowUp') {
                const nextAbsIndex = getCurrentAbsoluteSelectedIndex() - PAGE_SIZE;
                if (visibleCandidateRows > DEFAULT_VISIBLE_CANDIDATE_ROWS && nextAbsIndex >= 0) {
                    setSelectionByAbsoluteIndex(nextAbsIndex);
                    renderUI();
                } else if (visibleCandidateRows > DEFAULT_VISIBLE_CANDIDATE_ROWS) {
                    collapseCandidateRows();
                    renderUI();
                }
            } else if (pageIndex > 0) {
                pageIndex--;
                selectedCandidateIndex = Math.min(selectedCandidateIndex, getVisibleCandidateCount() - 1);
                renderUI();
            }
        }
    } else if (key === 'PageDown') {
        if (uiVisible) {
            const maxPage = Math.floor((candidates.length - 1) / PAGE_SIZE);
            if (pageIndex < maxPage) {
                pageIndex = Math.min(maxPage, pageIndex + 3);
                renderUI();
                e.preventDefault();
                e.stopPropagation();
            }
        }
    } else if (key === 'PageUp') {
        if (uiVisible) {
            if (pageIndex > 0) {
                pageIndex = Math.max(0, pageIndex - 3);
                renderUI();
                e.preventDefault();
                e.stopPropagation();
            }
        }
    } else if (key === 'Enter') {
        if (uiVisible) {
            commit(buffer, false);
            e.preventDefault();
            e.stopPropagation();
        }
    } else if (key === 'Tab') {
        if (uiVisible) {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) {
                const nextAbsIndex = getCurrentAbsoluteSelectedIndex() - 1;
                if (nextAbsIndex >= 0) {
                    setSelectionByAbsoluteIndex(nextAbsIndex);
                }
            } else {
                const nextAbsIndex = getCurrentAbsoluteSelectedIndex() + 1;
                if (nextAbsIndex < candidates.length) {
                    setSelectionByAbsoluteIndex(nextAbsIndex);
                }
            }
            renderUI();
        }
    }
}

let shiftPressedOnly = false;
function handleDocumentKeyUp(e) {
    if (managedTarget && !isManagedTargetFocused()) {
        shiftPressedOnly = false;
        return;
    }
    if (e.key === 'Shift') {
        if (shiftPressedOnly) {
            toggleMode();
        }
        shiftPressedOnly = false;
    }
}

function handleShiftTrackingKeyDown(e) {
    if (managedTarget && !isManagedTargetFocused()) {
        shiftPressedOnly = false;
        return;
    }
    if (e.key === 'Shift') {
        shiftPressedOnly = true;
    } else {
        shiftPressedOnly = false;
    }
}

function startBuffer(newBuffer) {
    buffer = newBuffer;
    pageIndex = 0;
    selectedCandidateIndex = 0;
    visibleCandidateRows = DEFAULT_VISIBLE_CANDIDATE_ROWS;
    updateCandidates();
    if (buffer.length > 0) {
        showUI();
    } else {
        hideUI();
    }
}

function updateCandidates() {
    let raw = codes[buffer];
    baseCandidates = raw ? [...raw] : [];

    if (baseCandidates.length === 0 && buffer.length === 3 && prefixCandidates[buffer]) {
        baseCandidates = [...prefixCandidates[buffer]];
    }

    candidates = [...baseCandidates];
    displayBuffer = buffer;
    candidates = prioritizeByWordLength(candidates);
    candidates = applyUserHistory(candidates, buffer);

    renderUI();
}

function selectCandidate(relIndex) {
    const absIndex = getVisibleStartIndex() + relIndex;
    if (candidates[absIndex]) {
        commit(candidates[absIndex], true);
    }
}

function selectCandidateByAbsoluteIndex(absIndex) {
    if (candidates[absIndex]) {
        commit(candidates[absIndex], true);
    }
}

function commit(text, isSelection = false) {
    if (!focusedElement) return;

    // Save history if it was a selection from candidates
    if (isSelection && buffer && buffer.length > 0) {
        recordUserHistorySelection(buffer, text);
        // Persist to storage
        chrome.storage.local.set({ sbzr_user_history: userHistory });
    }

    if (focusedElement.isContentEditable) {
        focusedElement.focus();
        const execOk = document.execCommand && document.execCommand('insertText', false, text);
        if (!execOk) {
            const sel = window.getSelection();
            if (sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
            focusedElement.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
        }
    } else {
        const start = focusedElement.selectionStart || 0;
        const end = focusedElement.selectionEnd || 0;
        const val = focusedElement.value || '';
        focusedElement.value = val.slice(0, start) + text + val.slice(end);
        focusedElement.selectionStart = focusedElement.selectionEnd = start + text.length;
        focusedElement.dispatchEvent(new Event('input', { bubbles: true }));
        focusedElement.dispatchEvent(new Event('change', { bubbles: true }));
    }

    buffer = '';
    visibleCandidateRows = DEFAULT_VISIBLE_CANDIDATE_ROWS;
    hideUI();
}

function showUI() {
    uiVisible = true;
    uiRoot.style.display = 'flex';
    positionUI();
}

function hideUI() {
    uiVisible = false;
    visibleCandidateRows = DEFAULT_VISIBLE_CANDIDATE_ROWS;
    uiRoot.style.display = 'none';
}

function positionUI() {
    if (!focusedElement) {
        uiRoot.style.left = '16px';
        uiRoot.style.top = '16px';
        return;
    }
    if (draggingUI) return;
    if (applyManualPosition()) return;
    const rect = focusedElement.getBoundingClientRect();

    let top = rect.bottom + 10;
    let left = rect.left;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (left + 320 > vw) left = vw - 340;
    if (top + 200 > vh) top = rect.top - 180;

    uiRoot.style.left = `${Math.max(10, left)}px`;
    uiRoot.style.top = `${Math.max(10, top)}px`;
}

function applyManualPosition() {
    if (!manualPosition) return false;
    const rect = uiRoot.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxLeft = Math.max(10, vw - rect.width - 10);
    const maxTop = Math.max(10, vh - rect.height - 10);
    const left = Math.min(Math.max(10, manualPosition.left), maxLeft);
    const top = Math.min(Math.max(10, manualPosition.top), maxTop);
    uiRoot.style.left = `${left}px`;
    uiRoot.style.top = `${top}px`;
    return true;
}

function saveManualPosition() {
    if (!manualPosition) return;
    try {
        if (chrome.runtime && chrome.runtime.id) {
            chrome.storage.local.set({ sbzr_ui_pos: manualPosition });
        }
    } catch (e) {
        console.log('SBZR: Manual position save failed (context invalidated).');
    }
}

function startDrag(e) {
    if (e.button !== 0) return;
    draggingUI = true;
    const rect = uiRoot.getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    manualPosition = { left: rect.left, top: rect.top };
    uiRoot.classList.add('dragging');
    e.preventDefault();
    e.stopPropagation();
}

function onDragMove(e) {
    if (!draggingUI) return;
    manualPosition = { left: e.clientX - dragOffset.x, top: e.clientY - dragOffset.y };
    applyManualPosition();
    e.preventDefault();
}

function endDrag() {
    if (!draggingUI) return;
    draggingUI = false;
    uiRoot.classList.remove('dragging');
    saveManualPosition();
}

function installRuntimeListeners() {
    if (listenersInstalled) return;
    document.addEventListener('keydown', handleDocumentKeyDown, true);
    document.addEventListener('keyup', handleDocumentKeyUp, true);
    document.addEventListener('keydown', handleShiftTrackingKeyDown, true);
    document.addEventListener('mousemove', onDragMove, true);
    document.addEventListener('mouseup', endDrag, true);
    listenersInstalled = true;
}

function uninstallRuntimeListeners() {
    if (!listenersInstalled) return;
    document.removeEventListener('keydown', handleDocumentKeyDown, true);
    document.removeEventListener('keyup', handleDocumentKeyUp, true);
    document.removeEventListener('keydown', handleShiftTrackingKeyDown, true);
    document.removeEventListener('mousemove', onDragMove, true);
    document.removeEventListener('mouseup', endDrag, true);
    listenersInstalled = false;
}

function applyRuntimeConfig(options = {}) {
    runtimePackagedRimeDictPaths = Array.isArray(options.packagedPaths) && options.packagedPaths.length > 0
        ? [...options.packagedPaths]
        : [...PACKAGED_RIME_DICT_PATHS];
    runtimePackagedAffixDictSources = Array.isArray(options.affixSources)
        ? options.affixSources.map((item) => ({ ...item }))
        : [...PACKAGED_AFFIX_DICT_SOURCES];
    suppressionCheck = typeof options.isSuppressed === 'function' ? options.isSuppressed : null;
}

function resetRuntimeState() {
    buffer = '';
    displayBuffer = '';
    candidates = [];
    baseCandidates = [];
    pageIndex = 0;
    selectedCandidateIndex = 0;
    visibleCandidateRows = DEFAULT_VISIBLE_CANDIDATE_ROWS;
    focusedElement = null;
    hideUI();
}

function installPageIme() {
    runtimeMode = 'page';
    managedTarget = null;
    applyRuntimeConfig();
    installStorageSync();
    installRuntimeMessageListener();
    installRuntimeListeners();
    init();
}

function installTextareaIME(options = {}) {
    if (!options.target) {
        throw new Error('installTextareaIME requires a target.');
    }
    runtimeMode = 'target';
    managedTarget = options.target;
    applyRuntimeConfig(options);
    installStorageSync();
    installRuntimeListeners();
    injectUI();
    void loadDict();
    return {
        destroy() {
            resetRuntimeState();
            uninstallRuntimeListeners();
            uninstallStorageSync();
            managedTarget = null;
            suppressionCheck = null;
            runtimeMode = 'detached';
        }
    };
}

function renderUI() {
    uiRoot.textContent = '';

    const header = document.createElement('div');
    header.className = 'ime-header';
    header.addEventListener('mousedown', startDrag);
    const hint = document.createElement('div');
    hint.className = 'ime-hint';
    hint.textContent = displayBuffer || buffer;
    header.appendChild(hint);

    const headerActions = document.createElement('div');
    headerActions.className = 'ime-header-actions';

    const punctuationButton = createImeButton(
        punctuationMode === 'cn' ? '，。' : ',.',
        punctuationMode === 'cn' ? 'Chinese punctuation' : 'English punctuation',
        async () => {
            togglePunctuationMode();
        }
    );
    if (punctuationMode === 'cn') {
        punctuationButton.classList.add('is-active');
    }
    headerActions.appendChild(punctuationButton);

    const widthButton = createImeButton(
        widthMode === 'full' ? '全' : '半',
        widthMode === 'full' ? 'Full width' : 'Half width',
        async () => {
            toggleWidthMode();
        }
    );
    if (widthMode === 'full') {
        widthButton.classList.add('is-active');
    }
    headerActions.appendChild(widthButton);

    header.appendChild(headerActions);
    uiRoot.appendChild(header);

    const listDiv = document.createElement('div');
    listDiv.className = 'candidate-list';
    if (visibleCandidateRows > DEFAULT_VISIBLE_CANDIDATE_ROWS) {
        listDiv.classList.add('expanded');
    }

    const visibleStartIndex = getVisibleStartIndex();
    const batch = candidates.slice(visibleStartIndex, visibleStartIndex + getVisibleCandidateCount());
    const activeRowIndex = Math.floor(selectedCandidateIndex / PAGE_SIZE);

    if (batch.length === 0 && buffer.length > 0) {
        const dot = document.createElement('div');
        dot.textContent = '...';
        dot.style.color = '#7a7a7a';
        listDiv.appendChild(dot);
    } else {
        batch.forEach((c, i) => {
            const cDiv = document.createElement('div');
            cDiv.className = `candidate ${i === selectedCandidateIndex ? 'active' : ''}`;
            const lSpan = document.createElement('span');
            lSpan.className = 'candidate-label';
            const candidateRowIndex = Math.floor(i / PAGE_SIZE);
            const showRowLabels = visibleCandidateRows === DEFAULT_VISIBLE_CANDIDATE_ROWS || candidateRowIndex === activeRowIndex;
            lSpan.textContent = showRowLabels ? (labels[i % PAGE_SIZE] || '') : '';
            if (!showRowLabels) {
                lSpan.classList.add('is-hidden');
            }
            cDiv.appendChild(lSpan);

            const tSpan = document.createElement('span');
            tSpan.className = 'candidate-text';
            tSpan.textContent = c;
            cDiv.appendChild(tSpan);

            cDiv.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectCandidate(i);
            });
            listDiv.appendChild(cDiv);
        });
    }
    uiRoot.appendChild(listDiv);

    positionUI();
}

window.SBZRContentIME = {
    installTextareaIME
};

if (CONTENT_AUTO_INIT) {
    installPageIme();
}
