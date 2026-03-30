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
let sessionCode = '';
let sessionText = '';

const USER_HISTORY_BEGIN_MARKER = '# sbzr-user-history-begin';
const USER_HISTORY_END_MARKER = '# sbzr-user-history-end';
const PACKAGED_RIME_DICT_PATHS = SBZRShared.DEFAULT_PACKAGED_RIME_DICT_PATHS;
const PACKAGED_AFFIX_DICT_SOURCES = SBZRShared.DEFAULT_PACKAGED_AFFIX_DICT_SOURCES;
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
        console.log('SBZR: Punctuation mode save failed.');
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
        console.log('SBZR: Width mode save failed.');
    }
    if (uiVisible) renderUI();
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
        } catch (e) {}
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

// Sync state
try {
    if (chrome.storage && chrome.storage.local) {
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

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.sbzr_enabled) {
                extensionEnabled = changes.sbzr_enabled.newValue;
                if (!extensionEnabled && uiVisible) { hideUI(); buffer = ''; }
            }
            if (changes.sbzr_user_history) { userHistory = changes.sbzr_user_history.newValue || {}; }
            if (changes.sbzr_custom_dict || changes.sbzr_user_dict || changes[SBZRShared.PACKAGED_DICT_OVERRIDES_STORAGE_KEY]) {
                void reloadEffectiveDictFromStorage();
            }
        });
    }
} catch (e) {}

const labels = ['1', '2', '3', '4', '5', '6'];
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

function showToast(text, duration = 1000) {
    if (modeToastTimer) clearTimeout(modeToastTimer);
    modeToast.textContent = text;
    modeToast.style.display = 'block';
    modeToast.style.opacity = '1';
    modeToastTimer = setTimeout(() => {
        modeToast.style.opacity = '0';
        setTimeout(() => { modeToast.style.display = 'none'; }, 300);
    }, duration);
}

function createImeButton(content, title, onClick, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ime-btn${className ? ` ${className}` : ''}`;
    if (title) { button.title = title; button.setAttribute('aria-label', title); }
    if (typeof content === 'string') { button.textContent = content; }
    else if (content instanceof Node) { button.appendChild(content); }
    button.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    button.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); void onClick(e); });
    return button;
}

function segmentSentence(input) {
    if (!input) return [];
    const n = input.length;
    const dp = new Array(n + 1).fill(null);
    const scores = new Array(n + 1).fill(-1);
    dp[0] = [];
    scores[0] = 0;

    for (let i = 0; i < n; i++) {
        if (dp[i] === null) continue;
        for (let len = 1; len <= Math.min(n - i, 12); len++) {
            const prefix = input.substring(i, i + len);
            const matches = codes[prefix] || (len === 3 ? prefixCandidates[prefix] : null);
            if (matches && matches.length > 0) {
                const word = matches[0];
                const currentScore = scores[i] + (len * len); 
                if (currentScore > scores[i + len]) {
                    scores[i + len] = currentScore;
                    dp[i + len] = [...dp[i], word];
                }
            }
        }
    }
    return dp[n] || [];
}

function updateCandidates() {
    let rawCandidates = [];
    
    // 1. History (Highest priority)
    const history = userHistory[buffer] || [];
    history.forEach(word => {
        rawCandidates.push({ word, codeLen: buffer.length, isHistory: true });
    });

    // 2. Sentence prediction
    if (buffer.length > 2) {
        const parts = segmentSentence(buffer);
        const sentence = parts.join('');
        if (sentence && sentence.length > 1 && !rawCandidates.some(c => c.word === sentence)) {
            rawCandidates.push({ word: sentence, codeLen: buffer.length, isSentence: true });
        }
    }

    // 3. Normal dictionary prefix matching
    for (let len = Math.min(buffer.length, 4); len >= 1; len--) {
        const prefix = buffer.substring(0, len);
        const matches = codes[prefix];
        if (matches) {
            matches.forEach(word => {
                if (!rawCandidates.some(c => c.word === word)) {
                    rawCandidates.push({ word, codeLen: len });
                }
            });
        }
    }

    candidates = rawCandidates;
    displayBuffer = buffer;
    renderUI();
}

function startBuffer(newBuffer) {
    if (buffer === '') { sessionCode = ''; sessionText = ''; }
    buffer = newBuffer;
    pageIndex = 0;
    selectedCandidateIndex = 0;
    visibleCandidateRows = DEFAULT_VISIBLE_CANDIDATE_ROWS;
    updateCandidates();
    if (buffer.length > 0) { showUI(); } else { hideUI(); }
}

function selectCandidate(relIndex) {
    const absIndex = getVisibleStartIndex() + relIndex;
    const cand = candidates[absIndex];
    if (cand) { commit(cand.word, cand.codeLen, true); }
}

function commit(text, consumedLen = 0, isSelection = false) {
    if (!focusedElement) return;
    if (consumedLen === 0) consumedLen = buffer.length;

    if (isSelection && buffer && buffer.length > 0) {
        const consumedCodePart = buffer.substring(0, consumedLen);
        sessionCode += consumedCodePart;
        sessionText += text;
        recordUserHistorySelection(consumedCodePart, text);
    }

    const insert = (t) => {
        if (focusedElement.isContentEditable) {
            focusedElement.focus();
            const execOk = document.execCommand && document.execCommand('insertText', false, t);
            if (!execOk) {
                const sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(document.createTextNode(t));
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
                focusedElement.dispatchEvent(new InputEvent('input', { bubbles: true, data: t, inputType: 'insertText' }));
            }
        } else {
            const start = focusedElement.selectionStart || 0;
            const end = focusedElement.selectionEnd || 0;
            const val = focusedElement.value || '';
            focusedElement.value = val.slice(0, start) + t + val.slice(end);
            focusedElement.selectionStart = focusedElement.selectionEnd = start + t.length;
            focusedElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

    insert(text);

    buffer = buffer.substring(consumedLen);
    if (buffer.length > 0) {
        updateCandidates();
    } else {
        if (sessionText.length > 1 && sessionCode.length > 2) {
            recordUserHistorySelection(sessionCode, sessionText);
        }
        chrome.storage.local.set({ sbzr_user_history: userHistory });
        buffer = ''; sessionCode = ''; sessionText = '';
        visibleCandidateRows = DEFAULT_VISIBLE_CANDIDATE_ROWS;
        hideUI();
    }
}

function showUI() { uiVisible = true; uiRoot.style.display = 'flex'; positionUI(); }
function hideUI() { uiVisible = false; visibleCandidateRows = DEFAULT_VISIBLE_CANDIDATE_ROWS; uiRoot.style.display = 'none'; }

function positionUI() {
    if (!focusedElement) return;
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
    try { if (chrome.runtime?.id) chrome.storage.local.set({ sbzr_ui_pos: manualPosition }); } catch (e) {}
}

function startDrag(e) {
    if (e.button !== 0) return;
    draggingUI = true;
    const rect = uiRoot.getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    manualPosition = { left: rect.left, top: rect.top };
    uiRoot.classList.add('dragging');
    e.preventDefault(); e.stopPropagation();
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

document.addEventListener('mousemove', onDragMove, true);
document.addEventListener('mouseup', endDrag, true);

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
    headerActions.appendChild(createImeButton(punctuationMode === 'cn' ? '，。' : ',.', '', () => togglePunctuationMode()));
    headerActions.appendChild(createImeButton(widthMode === 'full' ? '全' : '半', '', () => toggleWidthMode()));
    headerActions.appendChild(createImeButton('⚙', 'Site Settings', () => renderSiteSettingsPanel()));
    header.appendChild(headerActions);
    uiRoot.appendChild(header);

    const listDiv = document.createElement('div');
    listDiv.className = 'candidate-list';
    if (visibleCandidateRows > DEFAULT_VISIBLE_CANDIDATE_ROWS) listDiv.classList.add('expanded');

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
            const word = typeof c === 'string' ? c : c.word;
            const cDiv = document.createElement('div');
            cDiv.className = `candidate ${i === selectedCandidateIndex ? 'active' : ''}`;
            if (c.isSentence) cDiv.classList.add('is-sentence');
            if (c.isHistory) cDiv.classList.add('is-history');
            
            const lSpan = document.createElement('span');
            lSpan.className = 'candidate-label';
            const candidateRowIndex = Math.floor(i / PAGE_SIZE);
            const showRowLabels = visibleCandidateRows === DEFAULT_VISIBLE_CANDIDATE_ROWS || candidateRowIndex === activeRowIndex;
            lSpan.textContent = showRowLabels ? (labels[i % PAGE_SIZE] || '') : '';
            cDiv.appendChild(lSpan);

            const tSpan = document.createElement('span');
            tSpan.className = 'candidate-text';
            tSpan.textContent = word;
            cDiv.appendChild(tSpan);

            cDiv.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); selectCandidate(i); });
            listDiv.appendChild(cDiv);
        });
    }
    uiRoot.appendChild(listDiv);
    positionUI();
}

function updateUIMode() {
    uiRoot.style.fontSize = `${fontSize}px`;
}

async function loadEffectiveDict(baseDictText = '', force = false) {
    const storageResult = await chrome.storage.local.get(['sbzr_user_dict']);
    const storedUserText = storageResult.sbzr_user_dict || '';
    const baseTexts = isMeaningfulDictText(baseDictText) ? [baseDictText] : await fetchPackagedRimeDictTexts();
    const userText = await getOptionalUserDictText();
    const codeIndex = buildCodeIndexFromTexts([...baseTexts, storedUserText, userText]);
    applyCodeIndex(codeIndex);
}

async function reloadEffectiveDictFromStorage() {
    const result = await chrome.storage.local.get(['sbzr_custom_dict']);
    await loadEffectiveDict(result.sbzr_custom_dict || '', true);
}

function resolveActiveElement(e) {
    let el = document.activeElement;
    if (el?.shadowRoot?.activeElement) {
        el = el.shadowRoot.activeElement;
    }
    return el;
}

function isInput(el) {
    if (!el) return false;
    const tagName = el.tagName.toLowerCase();
    if (tagName === 'input') {
        const type = el.type.toLowerCase();
        return ['text', 'search', 'tel', 'url', 'email', 'password'].includes(type);
    }
    return tagName === 'textarea' || el.isContentEditable;
}

function injectUI() {
    if (!document.body || document.getElementById('sbzr-ime-container')) return;
    document.body.appendChild(uiContainer);
}

function toggleMode() {
    extensionEnabled = !extensionEnabled;
    chrome.storage.local.set({ sbzr_enabled: extensionEnabled });
    showToast(extensionEnabled ? '声笔自然：开启' : '声笔自然：关闭');
    if (!extensionEnabled) hideUI();
}

function renderSiteSettingsPanel() {
    const existing = shadow.querySelector('.site-settings-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.className = 'site-settings-panel';
    
    const header = document.createElement('div');
    header.className = 'site-settings-header';
    header.textContent = 'Site Settings';
    const closeBtn = createImeButton('×', 'Close settings', () => {
        panel.remove();
        siteSettingsOpen = false;
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const quickActions = document.createElement('div');
    quickActions.className = 'quick-actions';
    quickActions.appendChild(createImeButton('Disable Here', 'Disable on current site', async () => {
        await upsertSiteRule(`^${escapeRegexLiteral(location.origin)}`, false);
        showToast('Disabled On This Site');
    }));
    quickActions.appendChild(createImeButton('Sync to Rime', 'Export history to Rime sync folder', async () => {
        // Need dictionary context for proper segmentation during sync
        const baseTexts = await SBZRShared.fetchPackagedRimeDictTexts();
        const storageResult = await chrome.storage.local.get(['sbzr_user_dict']);
        const storedUserText = storageResult.sbzr_user_dict || '';
        const codeIndex = SBZRShared.buildWeightedCodeMapFromTexts([...baseTexts, storedUserText]);
        
        const res = await SBZRShared.syncUserHistoryToRime(userHistory, "sbzrExtension", codeIndex);
        if (res.ok) {
            showToast('History Synced to Rime', 2000);
        } else {
            showToast(`Sync Failed: ${res.error || 'Unknown error'}`, 5000);
        }
    }));
    panel.appendChild(quickActions);

    const form = document.createElement('div');
    form.className = 'site-settings-form';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Regex pattern (e.g. ^https://github.com)';
    const addBtn = createImeButton('Add Rule', 'Add new site rule', async () => {
        if (input.value.trim()) {
            await upsertSiteRule(input.value.trim(), true);
            input.value = '';
            renderSiteSettingsPanel();
        }
    });
    form.appendChild(input);
    form.appendChild(addBtn);
    panel.appendChild(form);

    const list = document.createElement('div');
    list.className = 'site-settings-list';
    siteRules.forEach((rule, index) => {
        const row = document.createElement('div');
        row.className = 'site-rule-row';
        
        const info = document.createElement('div');
        info.className = 'rule-info';
        const name = document.createElement('div');
        name.className = 'rule-pattern';
        name.textContent = rule.pattern;
        const status = document.createElement('div');
        status.className = `rule-status ${rule.enabled ? 'is-enabled' : 'is-disabled'}`;
        status.textContent = rule.enabled ? 'Enabled' : 'Disabled';
        info.appendChild(name);
        info.appendChild(status);
        
        const actions = document.createElement('div');
        actions.className = 'rule-actions';
        actions.appendChild(createImeButton(rule.enabled ? 'Disable' : 'Enable', 'Toggle rule', async () => {
            const next = [...siteRules];
            next[index].enabled = !next[index].enabled;
            await saveSiteRules(next);
            renderSiteSettingsPanel();
        }));
        actions.appendChild(createImeButton('Delete', 'Remove rule', async () => {
            await removeSiteRuleAt(index);
            renderSiteSettingsPanel();
        }));
        
        row.appendChild(info);
        row.appendChild(actions);
        list.appendChild(row);
    });
    panel.appendChild(list);

    shadow.appendChild(panel);
    siteSettingsOpen = true;
}

function init() {
    injectUI();
}

document.addEventListener('keydown', (e) => {
    let activeEl = resolveActiveElement(e);
    if (!isInput(activeEl)) return;
    focusedElement = activeEl;
    if (!isImeActive()) return;
    const key = e.key;
    const lowerKey = key.toLowerCase();
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const mapped = mapDirectInputChar(key);
    if (mapped) {
        if (uiVisible && buffer) {
            if (candidates.length > 0) { const first = candidates[0]; commit(first.word, first.codeLen, true); }
            else { commit(buffer, buffer.length, false); }
        }
        commit(mapped, 0, false);
        e.preventDefault(); e.stopPropagation();
        return;
    }

    if (e.shiftKey && /^[A-Z]$/.test(key)) { commit(key, 0, false); e.preventDefault(); e.stopPropagation(); }
    else if (/^[a-z]$/.test(lowerKey)) { startBuffer(buffer + lowerKey); e.preventDefault(); e.stopPropagation(); }
    else if (/^[1-6]$/.test(key) && uiVisible) {
        const relIndex = parseInt(key, 10) - 1;
        const absIndex = getCurrentRowStartIndex() + relIndex;
        const cand = candidates[absIndex];
        if (cand) { commit(cand.word, cand.codeLen, true); e.preventDefault(); e.stopPropagation(); }
    }
    else if (key === ' ') {
        if (uiVisible) {
            if (candidates.length > 0) {
                const absIndex = getCurrentAbsoluteSelectedIndex();
                const cand = candidates[absIndex];
                if (cand) {
                    commit(cand.word, cand.codeLen, true);
                }
            } else {
                commit(buffer, buffer.length, false);
            }
            e.preventDefault();
            e.stopPropagation();
        }
    }
    else if (key === 'Backspace' && uiVisible) {
        buffer = buffer.slice(0, -1);
        if (buffer === '') hideUI(); else { pageIndex = 0; updateCandidates(); }
        e.preventDefault(); e.stopPropagation();
    }
    else if (key === 'Enter' && uiVisible) { commit(buffer, buffer.length, false); e.preventDefault(); e.stopPropagation(); }
    else if (key === 'Escape' && uiVisible) { hideUI(); buffer = ''; e.preventDefault(); e.stopPropagation(); }
    else if (key === 'Tab' && uiVisible) {
        const next = getCurrentAbsoluteSelectedIndex() + (e.shiftKey ? -1 : 1);
        if (next >= 0 && next < candidates.length) setSelectionByAbsoluteIndex(next);
        renderUI(); e.preventDefault(); e.stopPropagation();
    }
}, true);

let shiftPressedOnly = false;
document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') { if (shiftPressedOnly) toggleMode(); shiftPressedOnly = false; }
}, true);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') shiftPressedOnly = true; else shiftPressedOnly = false;
}, true);

init();
