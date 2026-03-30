(function (global) {
  const USER_HISTORY_STORAGE_KEY = 'sbzr_user_history';
  const GLOBAL_ENABLED_STORAGE_KEY = 'sbzr_enabled';
  const PUNCTUATION_MODE_STORAGE_KEY = 'sbzr_punctuation_mode';
  const WIDTH_MODE_STORAGE_KEY = 'sbzr_width_mode';
  const CUSTOM_DICT_STORAGE_KEY = 'sbzr_custom_dict';
  const USER_DICT_STORAGE_KEY = 'sbzr_user_dict';
  const PACKAGED_DICT_OVERRIDES_STORAGE_KEY = 'sbzr_packaged_dict_overrides';
  const FONT_SIZE_STORAGE_KEY = 'sbzr_font_size';
  const DEFAULT_RIME_USER_DICT_NAME = 'sbzr.user_dict';
  const FIXED_DICT_PATH = 'dicts/sbzr.shortcut.dict.yaml';
  const FIXED_DICT_NAME = 'sbzr.shortcut';
  const FIXED_DICT_BASE_WEIGHT = 2000;
  const DEFAULT_PACKAGED_RIME_DICT_PATHS = global.SBZR_DICTS?.RIME_PATHS || [
    FIXED_DICT_PATH,
    'dicts/sbzr.char2.dict.yaml',
    'dicts/sbzr.dict.yaml',
    'dicts/sbzr.len2.dict.yaml',
    'dicts/sbzr.txt'
  ];
  const DEFAULT_PACKAGED_AFFIX_DICT_SOURCES = global.SBZR_DICTS?.AFFIX_SOURCES || [
    { path: 'dicts/zdy.dict.yaml', prefix: 'u', dictName: 'sbzdy.extension' }
  ];
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

  function segmentSentence(input, codeIndex = {}, prefixCandidates = {}) {
    if (!input) return [];
    const n = input.length;
    const dp = new Array(n + 1).fill(null);
    const scores = new Array(n + 1).fill(-1);
    dp[0] = [];
    scores[0] = 0;

    for (let i = 0; i < n; i++) {
      if (dp[i] === null) continue;
      // Try word lengths from 1 up to 12 (to cover long phrases in dict)
      for (let len = 1; len <= Math.min(n - i, 12); len++) {
        const prefix = input.substring(i, i + len);
        const matches = codeIndex[prefix] || (len === 3 ? prefixCandidates[prefix] : null);
        if (matches && matches.length > 0) {
          const word = matches[0];
          // Scoring: favor longer matches and use dictionary order
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

  function getEditableDictPaths() {
    return [
      ...DEFAULT_PACKAGED_RIME_DICT_PATHS,
      ...DEFAULT_PACKAGED_AFFIX_DICT_SOURCES.map((item) => item.path)
    ];
  }

  function getDictFileLabel(path) {
    return `${path || ''}`.split('/').pop() || 'dict';
  }

  function normalizeUserHistoryEntry(entry) {
    if (Array.isArray(entry)) {
      return entry.filter((item) => typeof item === 'string' && item);
    }
    if (typeof entry === 'string' && entry) {
      return [entry];
    }
    return [];
  }

  function normalizeUserHistory(history) {
    if (!history || typeof history !== 'object' || Array.isArray(history)) {
      return {};
    }

    const normalized = {};
    Object.entries(history).forEach(([code, entry]) => {
      const words = normalizeUserHistoryEntry(entry);
      if (code && words.length > 0) {
        normalized[code] = words;
      }
    });
    return normalized;
  }

  async function getPackagedDictOverrides(storage = chrome.storage.local) {
    const result = await storage.get([PACKAGED_DICT_OVERRIDES_STORAGE_KEY]);
    return result[PACKAGED_DICT_OVERRIDES_STORAGE_KEY] || {};
  }

  async function readPackagedDictText(path, { runtime = chrome.runtime, storage = chrome.storage.local } = {}) {
    const overrides = await getPackagedDictOverrides(storage);
    if (Object.prototype.hasOwnProperty.call(overrides, path)) {
      return `${overrides[path] || ''}`;
    }

    const response = await fetch(runtime.getURL(path), { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: HTTP ${response.status}`);
    }
    return await response.text();
  }

  async function savePackagedDictOverride(path, text, storage = chrome.storage.local) {
    const overrides = await getPackagedDictOverrides(storage);
    const nextOverrides = {
      ...overrides,
      [path]: `${text || ''}`
    };
    await storage.set({ [PACKAGED_DICT_OVERRIDES_STORAGE_KEY]: nextOverrides });
    return nextOverrides[path];
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
    if (normalized.startsWith('# Rime table') || normalized.startsWith('#@/')) {
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

  function appendRimeDictEntries(text, codeMap, sequenceRef, addEntry = addCodeEntry) {
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
      addEntry(codeMap, code, word, weight, sequenceRef.value++);
    }
  }

  function buildCodeIndexFromTexts(texts) {
    const codeMap = new Map();
    const sequenceRef = { value: 0 };

    for (const text of texts) {
      if (!isMeaningfulDictText(text)) continue;
      if (detectDictFormat(text) === 'rime') {
        const isUserDb = text.startsWith('# Rime table') || text.startsWith('#@/');
        if (isUserDb) {
          const boostedAddEntry = (map, code, word, weight, seq) => {
            const w = parseInt(weight, 10);
            const boostedWeight = isNaN(w) ? 1000000 : w + 1000000;
            addCodeEntry(map, code, word, boostedWeight, seq);
          };
          appendRimeDictEntries(text, codeMap, sequenceRef, boostedAddEntry);
        } else {
          appendRimeDictEntries(text, codeMap, sequenceRef);
        }
      } else {
        appendLegacyDictEntries(text, codeMap, sequenceRef);
      }
    }

    const codeIndex = {};
    for (const [code, wordsMap] of codeMap.entries()) {
      const orderedWords = [...wordsMap.values()]
        .sort((a, b) => b.weight - a.weight || a.sequence - b.sequence || a.word.localeCompare(b.word, 'zh-Hans-CN'))
        .map((entry) => entry.word);
      if (orderedWords.length) {
        codeIndex[code] = orderedWords;
      }
    }
    return codeIndex;
  }

  function buildWeightedCodeMapFromTexts(texts) {
    const codeMap = new Map();
    const sequenceRef = { value: 0 };

    for (const text of texts) {
      if (!isMeaningfulDictText(text)) continue;
      if (detectDictFormat(text) === 'rime') {
        const isUserDb = text.startsWith('# Rime table') || text.startsWith('#@/');
        if (isUserDb) {
          const boostedAddEntry = (map, code, word, weight, seq) => {
            const w = parseInt(weight, 10);
            const boostedWeight = isNaN(w) ? 1000000 : w + 1000000;
            addCodeEntry(map, code, word, boostedWeight, seq);
          };
          appendRimeDictEntries(text, codeMap, sequenceRef, boostedAddEntry);
        } else {
          appendRimeDictEntries(text, codeMap, sequenceRef);
        }
      } else {
        appendLegacyDictEntries(text, codeMap, sequenceRef);
      }
    }

    return codeMap;
  }

  function buildRimeDictHeader(dictName = DEFAULT_RIME_USER_DICT_NAME) {
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

  function renderRimeDictText(codeMap, dictName = DEFAULT_RIME_USER_DICT_NAME) {
    const entryLines = [];
    const sortedCodes = [...codeMap.entries()].sort(([codeA], [codeB]) => codeA.localeCompare(codeB, 'en'));

    for (const [code, wordsMap] of sortedCodes) {
      const orderedEntries = [...wordsMap.values()]
        .sort((a, b) => b.weight - a.weight || a.sequence - b.sequence || a.word.localeCompare(b.word, 'zh-Hans-CN'));

      for (const entry of orderedEntries) {
        entryLines.push(`${entry.word}\t${code}\t${entry.weight}`);
      }
    }

    return `${buildRimeDictHeader(dictName)}\n${entryLines.join('\n')}${entryLines.length ? '\n' : ''}`;
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

  function ensureUIOverlayLayer(doc = global.document) {
    if (!doc?.body) return null;

    let layer = doc.getElementById('sbzr-ui-layer');
    if (!layer) {
      layer = doc.createElement('div');
      layer.id = 'sbzr-ui-layer';
      layer.className = 'sbzr-ui-layer';
      doc.body.appendChild(layer);
    }

    let toastStack = layer.querySelector('.sbzr-ui-toast-stack');
    if (!toastStack) {
      toastStack = doc.createElement('div');
      toastStack.className = 'sbzr-ui-toast-stack';
      layer.appendChild(toastStack);
    }

    return { layer, toastStack };
  }

  function getActiveSelectedText(doc = global.document) {
    if (!doc) return '';

    let active = doc.activeElement;
    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }

    if (
      active &&
      typeof active.value === 'string' &&
      typeof active.selectionStart === 'number' &&
      typeof active.selectionEnd === 'number' &&
      active.selectionStart !== active.selectionEnd
    ) {
      return active.value.slice(active.selectionStart, active.selectionEnd);
    }

    const selection = doc.getSelection?.();
    return selection ? selection.toString() : '';
  }

  function showAppToast(message, {
    document: doc = global.document,
    tone = 'info',
    duration = 2200
  } = {}) {
    const ui = ensureUIOverlayLayer(doc);
    if (!ui || !message) return null;

    const toast = doc.createElement('div');
    toast.className = `sbzr-ui-toast is-${tone}`;
    toast.textContent = `${message}`;
    ui.toastStack.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

    const removeToast = () => {
      toast.classList.remove('is-visible');
      global.setTimeout(() => {
        toast.remove();
      }, 180);
    };

    global.setTimeout(removeToast, duration);
    return removeToast;
  }

  function showAppConfirm(titleText, messageText, {
    document: doc = global.document
  } = {}) {
    const ui = ensureUIOverlayLayer(doc);
    if (!ui) return Promise.resolve(false);

    return new Promise((resolve) => {
      const overlay = doc.createElement('div');
      overlay.className = 'sbzr-ui-modal-backdrop';

      const panel = doc.createElement('div');
      panel.className = 'sbzr-ui-modal';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', titleText);

      const header = doc.createElement('div');
      header.className = 'sbzr-ui-modal-header';

      const title = doc.createElement('h2');
      title.textContent = titleText;

      const closeButton = doc.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'sbzr-ui-modal-close';
      closeButton.setAttribute('aria-label', 'Close');
      closeButton.textContent = '×';

      header.appendChild(title);
      header.appendChild(closeButton);

      const body = doc.createElement('div');
      body.className = 'sbzr-ui-modal-body';
      body.style.fontSize = '13px';
      body.style.lineHeight = '1.6';
      body.style.color = '#deddda';
      body.textContent = messageText;

      const footer = doc.createElement('div');
      footer.className = 'sbzr-ui-modal-footer';

      const cancelButton = doc.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'sbzr-ui-button is-secondary';
      cancelButton.textContent = 'Cancel';

      const confirmButton = doc.createElement('button');
      confirmButton.type = 'button';
      confirmButton.className = 'sbzr-ui-button is-primary';
      confirmButton.textContent = 'Confirm';

      footer.appendChild(cancelButton);
      footer.appendChild(confirmButton);

      panel.appendChild(header);
      panel.appendChild(body);
      panel.appendChild(footer);
      overlay.appendChild(panel);
      ui.layer.appendChild(overlay);

      const close = (value) => {
        doc.removeEventListener('keydown', onKeyDown, true);
        overlay.remove();
        resolve(value);
      };

      const onKeyDown = (event) => {
        if (!overlay.isConnected) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          close(false);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          close(true);
        }
      };

      closeButton.addEventListener('click', () => close(false));
      cancelButton.addEventListener('click', () => close(false));
      confirmButton.addEventListener('click', () => close(true));
      overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) close(false);
      });

      doc.addEventListener('keydown', onKeyDown, true);
      global.requestAnimationFrame(() => {
        confirmButton.focus();
      });
    });
  }

  function showCodeInputDialog(word, {
    document: doc = global.document
  } = {}) {
    const ui = ensureUIOverlayLayer(doc);
    if (!ui) return Promise.resolve(null);

    return new Promise((resolve) => {
      const overlay = doc.createElement('div');
      overlay.className = 'sbzr-ui-modal-backdrop';

      const panel = doc.createElement('div');
      panel.className = 'sbzr-ui-modal';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'Add to dictionary');

      const header = doc.createElement('div');
      header.className = 'sbzr-ui-modal-header';

      const title = doc.createElement('h2');
      title.textContent = 'Add To Fixed Dict';

      const closeButton = doc.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'sbzr-ui-modal-close';
      closeButton.setAttribute('aria-label', 'Close');
      closeButton.textContent = '×';

      header.appendChild(title);
      header.appendChild(closeButton);

      const body = doc.createElement('div');
      body.className = 'sbzr-ui-modal-body';

      const label = doc.createElement('label');
      label.className = 'sbzr-ui-field';

      const labelTitle = doc.createElement('span');
      labelTitle.className = 'sbzr-ui-field-label';
      labelTitle.textContent = 'Selected text';

      const selectionPreview = doc.createElement('div');
      selectionPreview.className = 'sbzr-ui-selection-preview';
      selectionPreview.textContent = `${word}`;

      const codeLabel = doc.createElement('span');
      codeLabel.className = 'sbzr-ui-field-label';
      codeLabel.textContent = 'Code';

      const input = doc.createElement('input');
      input.type = 'text';
      input.className = 'sbzr-ui-input';
      input.autocomplete = 'off';
      input.autocapitalize = 'off';
      input.spellcheck = false;
      input.placeholder = 'a-z';
      input.maxLength = 32;

      const hint = doc.createElement('div');
      hint.className = 'sbzr-ui-field-hint';
      hint.textContent = 'Only lowercase letters a-z are allowed.';

      const error = doc.createElement('div');
      error.className = 'sbzr-ui-field-error';
      error.setAttribute('aria-live', 'polite');

      label.appendChild(labelTitle);
      label.appendChild(selectionPreview);
      label.appendChild(codeLabel);
      label.appendChild(input);
      label.appendChild(hint);
      label.appendChild(error);

      body.appendChild(label);

      const footer = doc.createElement('div');
      footer.className = 'sbzr-ui-modal-footer';

      const cancelButton = doc.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'sbzr-ui-button is-secondary';
      cancelButton.textContent = 'Cancel';

      const submitButton = doc.createElement('button');
      submitButton.type = 'button';
      submitButton.className = 'sbzr-ui-button is-primary';
      submitButton.textContent = 'Add';

      footer.appendChild(cancelButton);
      footer.appendChild(submitButton);

      panel.appendChild(header);
      panel.appendChild(body);
      panel.appendChild(footer);
      overlay.appendChild(panel);
      ui.layer.appendChild(overlay);

      const close = (value) => {
        doc.removeEventListener('keydown', onKeyDown, true);
        overlay.remove();
        resolve(value);
      };

      const submit = () => {
        const value = input.value.trim().toLowerCase();
        if (!/^[a-z]+$/.test(value)) {
          error.textContent = 'Code must use lowercase letters a-z.';
          input.focus();
          input.select();
          return;
        }
        close(value);
      };

      const onKeyDown = (event) => {
        if (!overlay.isConnected) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          close(null);
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      };

      closeButton.addEventListener('click', () => close(null));
      cancelButton.addEventListener('click', () => close(null));
      submitButton.addEventListener('click', submit);
      overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) {
          close(null);
        }
      });
      input.addEventListener('input', () => {
        const normalized = input.value.toLowerCase().replace(/[^a-z]/g, '');
        if (normalized !== input.value) {
          input.value = normalized;
        }
        error.textContent = '';
      });

      doc.addEventListener('keydown', onKeyDown, true);
      global.requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    });
  }

  function getNextFixedWeight(codeMap, code) {
    const entries = codeMap.get(code);
    if (!entries || entries.size === 0) {
      return FIXED_DICT_BASE_WEIGHT;
    }

    let maxWeight = FIXED_DICT_BASE_WEIGHT - 1;
    for (const entry of entries.values()) {
      maxWeight = Math.max(
        maxWeight,
        Number.parseInt(`${entry?.weight ?? ''}`, 10) || FIXED_DICT_BASE_WEIGHT
      );
    }
    return maxWeight + 1;
  }

  async function persistFixedDictText(nextText, {
    runtime = chrome.runtime,
    storage = chrome.storage.local,
    nativeHostName = 'com.sbzr.filehost',
    logger = console
  } = {}) {
    try {
      const response = await runtime.sendNativeMessage(nativeHostName, {
        action: 'save_dict',
        path: getDictFileLabel(FIXED_DICT_PATH) || 'fixed.dict.yaml',
        content: nextText
      });
      if (!response?.ok) {
        throw new Error(response?.error || 'Native save failed');
      }
    } catch (error) {
      logger?.warn?.('SBZR: Native fixed dictionary save unavailable, falling back to storage override.', error);
    }

    await savePackagedDictOverride(FIXED_DICT_PATH, nextText, storage);
  }

  async function promptAndSaveFixedEntry(selectedText, {
    runtime = chrome.runtime,
    storage = chrome.storage.local,
    nativeHostName = 'com.sbzr.filehost',
    logger = console,
    afterSave,
    document: doc = global.document
  } = {}) {
    const word = `${selectedText || ''}`.trim();
    if (!word) {
      showAppToast('没有可添加的选中文本。', { document: doc, tone: 'warning' });
      return { ok: false, reason: 'empty_selection' };
    }

    const input = await showCodeInputDialog(word, { document: doc });
    if (input === null || input === undefined) {
      return { ok: false, reason: 'cancelled' };
    }

    const code = `${input}`.trim().toLowerCase();

    try {
      const sourceText = await readPackagedDictText(FIXED_DICT_PATH, { runtime, storage });
      const codeMap = buildWeightedCodeMapFromTexts([sourceText]);
      const wordsMap = codeMap.get(code);
      if (wordsMap?.has(word)) {
        showAppToast(`已存在：${word} -> ${code}`, { document: doc, tone: 'warning' });
        return { ok: false, reason: 'duplicate', word, code };
      }

      const weight = getNextFixedWeight(codeMap, code);
      addCodeEntry(codeMap, code, word, String(weight), -1);
      const nextText = renderRimeDictText(codeMap, FIXED_DICT_NAME);
      await persistFixedDictText(nextText, { runtime, storage, nativeHostName, logger });
      if (typeof afterSave === 'function') {
        await afterSave({
          path: FIXED_DICT_PATH,
          localPath: getDictFileLabel(FIXED_DICT_PATH) || FIXED_DICT_PATH,
          text: nextText,
          word,
          code,
          weight
        });
      }
      showAppToast(`已添加：${word} -> ${code} (${weight})`, { document: doc, tone: 'success' });
      return { ok: true, word, code, weight, text: nextText };
    } catch (error) {
      logger?.error?.('SBZR: Add fixed dictionary entry failed.', error);
      showAppToast(`添加失败：${error.message}`, { document: doc, tone: 'error', duration: 3200 });
      return { ok: false, reason: 'error', error };
    }
  }

  async function fetchPackagedRimeDictTexts({ runtime = chrome.runtime, paths = DEFAULT_PACKAGED_RIME_DICT_PATHS } = {}) {
    if (!runtime || !runtime.id) return [];

    const results = await Promise.all(
      paths.map(async (pathName) => {
        return await readPackagedDictText(pathName, { runtime });
      })
    );

    return results.filter(isMeaningfulDictText);
  }

  async function fetchPackagedAffixDictTexts({
    runtime = chrome.runtime,
    sources = DEFAULT_PACKAGED_AFFIX_DICT_SOURCES
  } = {}) {
    if (!runtime || !runtime.id) return [];

    const results = await Promise.all(
      sources.map(async ({ path, prefix, dictName }) => {
        const text = await readPackagedDictText(path, { runtime });
        if (!isMeaningfulDictText(text)) return '';

        const prefixedCodeMap = prefixCodeMap(buildWeightedCodeMapFromTexts([text]), prefix);
        return renderRimeDictText(prefixedCodeMap, dictName);
      })
    );

    return results.filter(isMeaningfulDictText);
  }

  function applyUserHistory(list, key, userHistory) {
    if (!key || list.length <= 1) return list;
    const preferredList = normalizeUserHistoryEntry(userHistory[key]);
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
function recordUserHistorySelection(code, word, userHistory, maxEntries = 5) {
  if (!code || !word) return userHistory;
  const existingList = normalizeUserHistoryEntry(userHistory[code]);

  return {
    ...userHistory,
    [code]: [word, ...existingList.filter((item) => item !== word)].slice(0, maxEntries)
  };
}

  async function syncUserHistoryToRime(userHistory, folderName = "sbzrExtension", codeIndex = {}) {
    const normalizedHistory = normalizeUserHistory(userHistory);
    if (Object.keys(normalizedHistory).length === 0) return { ok: false, error: "No history to sync" };
    
    // Generate Rime tabledb header
    const lines = [
      "# Rime table",
      "#@/db_name\tsbzr",
      "#@/db_type\ttabledb",
      "#@/rime_version\t1.15.0",
      `#@/tick\t${Math.floor(Date.now() / 1000)}`
    ];

    // Convert history to lines: word \t code \t weight
    for (const [code, words] of Object.entries(normalizedHistory)) {
      
      // For long phrases, try to segment the code with spaces to match Rime's export format
      let rimeCode = code;
      if (code.length > 4) {
        const parts = [];
        let tempCode = code;
        while (tempCode.length > 0) {
          if (tempCode.length >= 2) {
            parts.push(tempCode.substring(0, 2));
            tempCode = tempCode.substring(2);
          } else {
            parts.push(tempCode);
            tempCode = '';
          }
        }
        rimeCode = parts.join(' ');
      }

      words.forEach((word, index) => {
        const weight = 60000 - (index * 100);
        lines.push(`${word}\t${rimeCode}\t${Math.max(1, weight)}`);
      });
    }

    const content = lines.join("\n") + "\n";

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendNativeMessage("com.sbzr.filehost", {
          action: "sync_userdb",
          folder: folderName,
          content: content
        }, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: `Native messaging error: ${chrome.runtime.lastError.message}` });
          } else {
            resolve(res);
          }
        });
      });
      
      if (!response) {
        return { ok: false, error: "No response from native host. Is it installed correctly?" };
      }
      
      return response;
    } catch (e) {
      return { ok: false, error: `Sync execution failed: ${e.message}` };
    }
}


  function installTabDragging(container, {
    onOrderChange,
    tabSelector = '.tab',
    draggingClass = 'is-dragging',
    dragOverClass = 'drag-over'
  } = {}) {
    let draggedElement = null;

    function getMouseTab(event) {
      const el = event.target.closest(tabSelector);
      if (el && container.contains(el)) return el;
      return null;
    }

    function onDragStart(event) {
      const tab = getMouseTab(event);
      if (!tab) return;

      draggedElement = tab;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', ''); // Required for Firefox

      // Use a timeout to allow the drag image to be created before hiding the original
      requestAnimationFrame(() => {
        tab.classList.add(draggingClass);
      });
    }

    function onDragOver(event) {
      if (!draggedElement) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      const target = getMouseTab(event);
      if (target && target !== draggedElement) {
        const rect = target.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        if (event.clientX < midpoint) {
          container.insertBefore(draggedElement, target);
        } else {
          container.insertBefore(draggedElement, target.nextSibling);
        }
      }
    }

    function onDragEnd() {
      if (draggedElement) {
        draggedElement.classList.remove(draggingClass);
        draggedElement = null;
      }

      if (typeof onOrderChange === 'function') {
        const elements = Array.from(container.querySelectorAll(tabSelector));
        onOrderChange(elements);
      }
    }

    container.addEventListener('dragstart', onDragStart);
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('dragend', onDragEnd);

    return () => {
      container.removeEventListener('dragstart', onDragStart);
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('dragend', onDragEnd);
    };
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

  function processImeKeyDown(ctx, event) {
    if (event.ctrlKey || event.altKey || event.metaKey) return false;
    if (ctx.isActive && !ctx.isActive()) return false;

    const key = event.key;
    const lowerKey = key.toLowerCase();

    if (ctx.ensureDictLoaded && !ctx.hasLoadedDict()) {
      void ctx.ensureDictLoaded();
    }

    if (event.shiftKey && /^[A-Z]$/.test(key)) {
      ctx.commit(key, false);
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    if (/^[a-z]$/.test(lowerKey)) {
      ctx.startBuffer(ctx.getBuffer() + lowerKey);
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    if (/^[1-6]$/.test(key)) {
      if (ctx.isUIVisible()) {
        const relIndex = Number.parseInt(key, 10) - 1;
        const absIndex = ctx.getCurrentRowStartIndex() + relIndex;
        const cand = ctx.getCandidates()[absIndex];
        if (cand) {
          const word = typeof cand === 'string' ? cand : cand.word;
          const len = typeof cand === 'object' ? cand.codeLen : ctx.getBuffer().length;
          ctx.commit(word, len, true);
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
      }
      return false;
    }

    if (key === ' ') {
      if (ctx.isUIVisible()) {
        const batch = ctx.getCandidates();
        if (batch.length > 0) {
          const absIndex = ctx.getCurrentAbsoluteSelectedIndex();
          const cand = batch[absIndex];
          if (cand) {
            const word = typeof cand === 'string' ? cand : cand.word;
            const len = typeof cand === 'object' ? cand.codeLen : ctx.getBuffer().length;
            ctx.commit(word, len, true);
          }
        } else {
          ctx.commit(ctx.getBuffer(), ctx.getBuffer().length, false);
        }
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
      return false;
    }

    if (key === 'Backspace') {
      if (ctx.isUIVisible()) {
        ctx.setBuffer(ctx.getBuffer().slice(0, -1));
        if (ctx.getBuffer() === '') {
          ctx.hideUI();
        } else {
          ctx.resetPage();
          ctx.updateCandidates();
        }
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
      return false;
    }

    if (key === 'Escape') {
      if (ctx.isUIVisible()) {
        ctx.hideUI();
        ctx.setBuffer('');
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
      return false;
    }

    if (key === 'ArrowRight') {
      if (ctx.isUIVisible()) {
        const nextAbsIndex = ctx.getCurrentAbsoluteSelectedIndex() + 1;
        if (nextAbsIndex < ctx.getCandidates().length) {
          ctx.setSelectionByAbsoluteIndex(nextAbsIndex);
          ctx.renderUI();
        }
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
      return false;
    }

    if (key === 'ArrowLeft') {
      if (ctx.isUIVisible()) {
        const nextAbsIndex = ctx.getCurrentAbsoluteSelectedIndex() - 1;
        if (nextAbsIndex >= 0) {
          ctx.setSelectionByAbsoluteIndex(nextAbsIndex);
          ctx.renderUI();
        }
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
      return false;
    }

    if (['ArrowDown', ']', '=', '.', '>'].includes(key)) {
      if (ctx.isUIVisible()) {
        if (key === 'ArrowDown') {
          if (ctx.isCollapsed() && ctx.getCandidates().length > ctx.getPageSize()) {
            ctx.expandCandidateRows();
            ctx.renderUI();
          } else {
            const nextAbsIndex = ctx.getCurrentAbsoluteSelectedIndex() + ctx.getPageSize();
            if (nextAbsIndex < ctx.getCandidates().length) {
              ctx.setSelectionByAbsoluteIndex(nextAbsIndex);
              ctx.renderUI();
            }
          }
        } else if ((ctx.getPageIndex() + 1) * ctx.getPageSize() < ctx.getCandidates().length) {
          ctx.incrementPage();
          ctx.clampSelectedCandidateIndex();
          ctx.renderUI();
        }
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
      return false;
    }

    if (['ArrowUp', '[', '-', ',', '<'].includes(key)) {
      if (ctx.isUIVisible()) {
        if (key === 'ArrowUp') {
          const nextAbsIndex = ctx.getCurrentAbsoluteSelectedIndex() - ctx.getPageSize();
          if (!ctx.isCollapsed() && nextAbsIndex >= 0) {
            ctx.setSelectionByAbsoluteIndex(nextAbsIndex);
            ctx.renderUI();
          } else if (!ctx.isCollapsed()) {
            ctx.collapseCandidateRows();
            ctx.renderUI();
          }
        } else if (ctx.getPageIndex() > 0) {
          ctx.decrementPage();
          ctx.clampSelectedCandidateIndex();
          ctx.renderUI();
        }
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
      return false;
    }

    if (key === 'PageDown') {
      if (ctx.isUIVisible()) {
        const maxPage = Math.floor((ctx.getCandidates().length - 1) / ctx.getPageSize());
        if (ctx.getPageIndex() < maxPage) {
          ctx.setPageIndex(Math.min(maxPage, ctx.getPageIndex() + 3));
          ctx.renderUI();
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
      }
      return false;
    }

    if (key === 'PageUp') {
      if (ctx.isUIVisible()) {
        if (ctx.getPageIndex() > 0) {
          ctx.setPageIndex(Math.max(0, ctx.getPageIndex() - 3));
          ctx.renderUI();
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
      }
      return false;
    }

    if (key === 'Enter') {
      if (ctx.isUIVisible()) {
        ctx.commit(ctx.getBuffer(), false);
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
      return false;
    }

    if (key === 'Tab') {
      if (ctx.isUIVisible()) {
        if (event.shiftKey) {
          const nextAbsIndex = ctx.getCurrentAbsoluteSelectedIndex() - 1;
          if (nextAbsIndex >= 0) {
            ctx.setSelectionByAbsoluteIndex(nextAbsIndex);
          }
        } else {
          const nextAbsIndex = ctx.getCurrentAbsoluteSelectedIndex() + 1;
          if (nextAbsIndex < ctx.getCandidates().length) {
            ctx.setSelectionByAbsoluteIndex(nextAbsIndex);
          }
        }
        ctx.renderUI();
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
    }

    const mappedDirectChar = ctx.mapDirectInputChar(key);
    if (mappedDirectChar) {
      if (ctx.isUIVisible() && ctx.getBuffer()) {
        if (ctx.getCandidates().length > 0) {
          ctx.selectCandidate(ctx.getSelectedCandidateIndex());
        } else {
          ctx.commit(ctx.getBuffer(), false);
        }
      }
      ctx.commit(mappedDirectChar, false);
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    return false;
  }

  function installTextareaIME(options) {
    const {
      target,
      isSuppressed = () => false,
      runtime = chrome.runtime,
      storage = chrome.storage.local,
      pageSize = 6,
      defaultVisibleRows = 1,
      expandedVisibleRows = 3,
      packagedPaths = DEFAULT_PACKAGED_RIME_DICT_PATHS,
      affixSources = DEFAULT_PACKAGED_AFFIX_DICT_SOURCES
    } = options || {};
    if (!target) return null;

    const labels = ['1', '2', '3', '4', '5', '6'];
    let codes = {};
    let prefixSet = new Set();
    let prefixCandidates = {};
    let prefixCandidateSets = {};
    let buffer = '';
    let displayBuffer = '';
    let candidates = [];
    let baseCandidates = [];
    let pageIndex = 0;
    let selectedCandidateIndex = 0;
    let visibleCandidateRows = defaultVisibleRows;
    let userHistory = {};
    let extensionEnabled = true;
    let fontSize = 13;
    let punctuationMode = 'cn';
    let widthMode = 'half';
    let dictLoadPromise = null;
    let uiVisible = false;
    let shiftPressedOnly = false;
    let shiftToggleArmed = false;
    let manualPosition = null;
    let draggingUI = false;
    let dragOffset = { x: 0, y: 0 };

    const uiContainer = document.createElement('div');
    uiContainer.id = 'sbzr-notepad-ime-container';
    const shadow = uiContainer.attachShadow({ mode: 'open' });
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = runtime.getURL('style.css');
    shadow.appendChild(link);
    const uiRoot = document.createElement('div');
    uiRoot.id = 'sbzr-ime-root';
    shadow.appendChild(uiRoot);

    function updateUIMode() {
      uiRoot.style.fontSize = `${fontSize}px`;
      uiRoot.style.transform = '';
      uiRoot.style.transformOrigin = '';
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

    function getVisibleCandidateCount() {
      return pageSize * visibleCandidateRows;
    }

    function getVisibleStartIndex() {
      return pageIndex * pageSize;
    }

    function getCurrentAbsoluteSelectedIndex() {
      return getVisibleStartIndex() + selectedCandidateIndex;
    }

    function getCurrentRowStartIndex() {
      return getVisibleStartIndex() + (Math.floor(selectedCandidateIndex / pageSize) * pageSize);
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
        startIndex = Math.floor(clampedAbsIndex / pageSize) * pageSize;
      } else if (clampedAbsIndex >= startIndex + visibleCount) {
        startIndex = (Math.floor(clampedAbsIndex / pageSize) - visibleCandidateRows + 1) * pageSize;
      }

      startIndex = Math.max(0, startIndex);
      pageIndex = Math.floor(startIndex / pageSize);
      selectedCandidateIndex = clampedAbsIndex - startIndex;
    }

    function expandCandidateRows() {
      if (visibleCandidateRows === expandedVisibleRows) return;
      visibleCandidateRows = expandedVisibleRows;
      setSelectionByAbsoluteIndex(getCurrentAbsoluteSelectedIndex());
    }

    function collapseCandidateRows() {
      if (visibleCandidateRows === defaultVisibleRows) return;
      const currentAbsIndex = getCurrentAbsoluteSelectedIndex();
      visibleCandidateRows = defaultVisibleRows;
      setSelectionByAbsoluteIndex(currentAbsIndex);
    }

    function segmentSentenceInternal(input) {
      return segmentSentence(input, codes, prefixCandidates);
    }

    function updateCandidates() {
      const rawCandidates = [];
      const seenWords = new Set();

      function pushCandidate(candidate) {
        const word = candidate?.word;
        if (!word || seenWords.has(word)) return;
        seenWords.add(word);
        rawCandidates.push(candidate);
      }
      
      // 1. learned Long Phrases (Priority 1)
      const learned = normalizeUserHistoryEntry(userHistory[buffer]);
      learned.forEach(word => {
        pushCandidate({ word, codeLen: buffer.length, isHistory: true });
      });

      // 2. Optimal Sentence Prediction (Priority 2)
      if (buffer.length > 2) {
        const sentenceParts = segmentSentenceInternal(buffer);
        const sentence = sentenceParts.join('');
        if (sentence && sentence.length > 1) {
          pushCandidate({ word: sentence, codeLen: buffer.length, isSentence: true });
        }
      }

      // 3. Prefix Matching (Regular candidates)
      for (let len = Math.min(buffer.length, 4); len >= 1; len--) {
        const prefix = buffer.substring(0, len);
        const matches = codes[prefix];
        if (matches) {
          matches.forEach(word => {
            pushCandidate({ word, codeLen: len });
          });
        }
      }

      // 4. Completion Matching (Priority 4): Enable extension search when reaching 3 codes
      if (buffer.length === 3) {
        const completions = prefixCandidates[buffer];
        if (completions) {
          completions.forEach(word => {
            pushCandidate({ word, codeLen: buffer.length + 1, isCompletion: true });
          });
        }
      }

      candidates = rawCandidates;
      displayBuffer = buffer;
      renderUI();
    }

    let sessionCode = '';
    let sessionText = '';

    function startBuffer(newBuffer) {
      if (buffer === '') {
        sessionCode = '';
        sessionText = '';
      }
      buffer = newBuffer;
      pageIndex = 0;
      selectedCandidateIndex = 0;
      visibleCandidateRows = defaultVisibleRows;
      updateCandidates();
      if (buffer.length > 0) {
        showUI();
      } else {
        hideUI();
      }
    }

    function insertText(text, consumedLen = 0, isSelection = false) {
      if (consumedLen === 0) consumedLen = buffer.length;
      const start = target.selectionStart || 0;
      const end = target.selectionEnd || 0;
      const value = target.value || '';
      target.value = value.slice(0, start) + text + value.slice(end);
      target.selectionStart = target.selectionEnd = start + text.length;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      
      if (isSelection && buffer) {
        const consumedCodePart = buffer.substring(0, consumedLen);
        sessionCode += consumedCodePart;
        sessionText += text;
        
        // Correct order: code, word, history
        userHistory = recordUserHistorySelection(consumedCodePart, text, userHistory);
      }
      
      buffer = buffer.substring(consumedLen);
      if (buffer.length > 0) {
        updateCandidates();
      } else {
        // Learning logic: If a sentence was formed, save it as a whole
        if (sessionText.length > 1 && sessionCode.length > 2) {
          userHistory = recordUserHistorySelection(sessionCode, sessionText, userHistory);
        }
        storage.set({ [USER_HISTORY_STORAGE_KEY]: userHistory });

        buffer = '';
        sessionCode = '';
        sessionText = '';
        hideUI();
      }
    }

    function selectCandidate(relIndex) {
      const absIndex = getVisibleStartIndex() + relIndex;
      const cand = candidates[absIndex];
      if (cand) {
        insertText(cand.word, cand.codeLen, true);
      }
    }

    function selectCandidateByAbsoluteIndex(absIndex) {
      if (candidates[absIndex]) {
        insertText(candidates[absIndex], true);
      }
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

    function positionUI() {
      if (draggingUI) return;
      if (applyManualPosition()) return;

      const rect = target.getBoundingClientRect();
      let top = rect.bottom + 10;
      let left = rect.left;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (left + 320 > vw) left = vw - 340;
      if (top + 200 > vh) top = rect.top - 180;

      uiRoot.style.left = `${Math.max(10, left)}px`;
      uiRoot.style.top = `${Math.max(10, top)}px`;
    }

    function startDrag(event) {
      if (event.button !== 0) return;
      draggingUI = true;
      const rect = uiRoot.getBoundingClientRect();
      dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      manualPosition = { left: rect.left, top: rect.top };
      uiRoot.classList.add('dragging');
      event.preventDefault();
      event.stopPropagation();
      target.focus();
    }

    function onDragMove(event) {
      if (!draggingUI) return;
      manualPosition = {
        left: event.clientX - dragOffset.x,
        top: event.clientY - dragOffset.y
      };
      applyManualPosition();
      event.preventDefault();
    }

    function endDrag() {
      if (!draggingUI) return;
      draggingUI = false;
      uiRoot.classList.remove('dragging');
    }

    function showUI() {
      uiVisible = true;
      uiRoot.style.display = 'flex';
      positionUI();
    }

    function hideUI() {
      uiVisible = false;
      visibleCandidateRows = defaultVisibleRows;
      uiRoot.style.display = 'none';
    }

    function createButton(label, title, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ime-btn';
      button.textContent = label;
      button.title = title;
      button.setAttribute('aria-label', title);
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
      return button;
    }

    function renderUI() {
      if (!uiVisible && !buffer) return;
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

      const punctuationButton = createButton(
        punctuationMode === 'cn' ? '，。' : ',.',
        punctuationMode === 'cn' ? 'Chinese punctuation' : 'English punctuation',
        () => {
          punctuationMode = punctuationMode === 'cn' ? 'en' : 'cn';
          storage.set({ [PUNCTUATION_MODE_STORAGE_KEY]: punctuationMode });
          renderUI();
        }
      );
      if (punctuationMode === 'cn') punctuationButton.classList.add('is-active');
      headerActions.appendChild(punctuationButton);

      const widthButton = createButton(
        widthMode === 'full' ? '全' : '半',
        widthMode === 'full' ? 'Full width' : 'Half width',
        () => {
          widthMode = widthMode === 'full' ? 'half' : 'full';
          storage.set({ [WIDTH_MODE_STORAGE_KEY]: widthMode });
          renderUI();
        }
      );
      if (widthMode === 'full') widthButton.classList.add('is-active');
      headerActions.appendChild(widthButton);

      header.appendChild(headerActions);
      uiRoot.appendChild(header);

      const listDiv = document.createElement('div');
      listDiv.className = 'candidate-list';
      if (visibleCandidateRows > defaultVisibleRows) {
        listDiv.classList.add('expanded');
      }

      const visibleStartIndex = getVisibleStartIndex();
      const batch = candidates.slice(visibleStartIndex, visibleStartIndex + getVisibleCandidateCount());
      const activeRowIndex = Math.floor(selectedCandidateIndex / pageSize);

      batch.forEach((cand, index) => {
        const word = typeof cand === 'string' ? cand : cand.word;
        const candidateDiv = document.createElement('div');
        candidateDiv.className = `candidate ${index === selectedCandidateIndex ? 'active' : ''}`;
        if (cand.isSentence) candidateDiv.classList.add('is-sentence');
        if (cand.isCompletion) candidateDiv.classList.add('is-completion');

        const label = document.createElement('span');
        label.className = 'candidate-label';
        const candidateRowIndex = Math.floor(index / pageSize);
        const showRowLabels = visibleCandidateRows === defaultVisibleRows || candidateRowIndex === activeRowIndex;
        label.textContent = showRowLabels ? (labels[index % pageSize] || '') : '';
        if (!showRowLabels) {
          label.classList.add('is-hidden');
        }
        candidateDiv.appendChild(label);

        const text = document.createElement('span');
        text.className = 'candidate-text';
        text.textContent = word;
        candidateDiv.appendChild(text);

        candidateDiv.addEventListener('mousedown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          target.focus();
          selectCandidate(index);
        });

        listDiv.appendChild(candidateDiv);
      });

      uiRoot.appendChild(listDiv);
      positionUI();
    }

    async function loadEffectiveDict(baseDictText = '', force = false) {
      const storageResult = await storage.get([USER_DICT_STORAGE_KEY]);
      const storedUserText = storageResult[USER_DICT_STORAGE_KEY] || '';
      const baseTexts = isMeaningfulDictText(baseDictText)
        ? [baseDictText]
        : await fetchPackagedRimeDictTexts({ runtime, paths: packagedPaths });
      const userTextList = await fetchPackagedAffixDictTexts({ runtime, sources: affixSources });
      const codeIndex = buildCodeIndexFromTexts([...baseTexts, storedUserText, ...userTextList]);
      if (!Object.keys(codeIndex).length) return;
      applyCodeIndex(codeIndex);
      if (force && buffer) {
        updateCandidates();
      }
    }

    async function loadDict() {
      if (Object.keys(codes).length > 0) return;
      if (dictLoadPromise) {
        await dictLoadPromise;
        return;
      }
      dictLoadPromise = (async () => {
        const result = await storage.get([
          GLOBAL_ENABLED_STORAGE_KEY,
          CUSTOM_DICT_STORAGE_KEY,
          USER_HISTORY_STORAGE_KEY,
          PUNCTUATION_MODE_STORAGE_KEY,
          WIDTH_MODE_STORAGE_KEY,
          FONT_SIZE_STORAGE_KEY
        ]);
        extensionEnabled = result[GLOBAL_ENABLED_STORAGE_KEY] !== false;
        if (result[FONT_SIZE_STORAGE_KEY]) fontSize = result[FONT_SIZE_STORAGE_KEY];
        userHistory = normalizeUserHistory(result[USER_HISTORY_STORAGE_KEY]);
        punctuationMode = result[PUNCTUATION_MODE_STORAGE_KEY] === 'en' ? 'en' : 'cn';
        widthMode = result[WIDTH_MODE_STORAGE_KEY] === 'full' ? 'full' : 'half';
        updateUIMode();
        if (JSON.stringify(userHistory) !== JSON.stringify(result[USER_HISTORY_STORAGE_KEY] || {})) {
          await storage.set({ [USER_HISTORY_STORAGE_KEY]: userHistory });
        }
        await loadEffectiveDict(result[CUSTOM_DICT_STORAGE_KEY] || '', true);
      })();
      try {
        await dictLoadPromise;
      } finally {
        dictLoadPromise = null;
      }
    }

    async function onKeyDown(event) {
      if (typeof isSuppressed === 'function' && isSuppressed()) {
        return;
      }
      processImeKeyDown({
        isActive: () => extensionEnabled,
        hasLoadedDict: () => Object.keys(codes).length > 0,
        ensureDictLoaded: loadDict,
        mapDirectInputChar,
        commit: insertText,
        getBuffer: () => buffer,
        setBuffer: (value) => { buffer = value; },
        startBuffer,
        getCandidates: () => candidates,
        hasPrefix: (value) => prefixSet.has(value),
        hasCode: (value) => !!codes[value],
        isUIVisible: () => uiVisible,
        hideUI,
        updateCandidates,
        renderUI,
        selectCandidate,
        selectCandidateByAbsoluteIndex,
        getSelectedCandidateIndex: () => selectedCandidateIndex,
        getVisibleStartIndex,
        getCurrentRowStartIndex,
        getCurrentAbsoluteSelectedIndex,
        setSelectionByAbsoluteIndex,
        getPageSize: () => pageSize,
        getPageIndex: () => pageIndex,
        setPageIndex: (value) => { pageIndex = value; },
        incrementPage: () => { pageIndex += 1; },
        decrementPage: () => { pageIndex -= 1; },
        resetPage: () => { pageIndex = 0; },
        clampSelectedCandidateIndex: () => {
          selectedCandidateIndex = Math.min(selectedCandidateIndex, getVisibleCandidateCount() - 1);
        },
        isCollapsed: () => visibleCandidateRows === defaultVisibleRows,
        expandCandidateRows,
        collapseCandidateRows
      }, event);
    }

    function onFocus() {
      void loadDict();
      if (buffer) {
        showUI();
      }
    }

    function onBlur() {
      window.setTimeout(() => {
        if (draggingUI) return;
        if (document.activeElement !== target) {
          hideUI();
          buffer = '';
        }
      }, 0);
    }

    function onWindowMove() {
      if (uiVisible) {
        positionUI();
      }
    }

    function isTargetFocused() {
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) {
        active = active.shadowRoot.activeElement;
      }
      return active === target;
    }

    function onDocumentKeyDown(event) {
      if (!isTargetFocused()) return;
      if (event.key === 'Shift' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        shiftPressedOnly = true;
        shiftToggleArmed = true;
        return;
      }
      shiftPressedOnly = false;
      shiftToggleArmed = false;
    }

    function onDocumentKeyUp(event) {
      if (event.key !== 'Shift') return;
      if (!shiftToggleArmed || !shiftPressedOnly) {
        shiftPressedOnly = false;
        shiftToggleArmed = false;
        return;
      }
      shiftPressedOnly = false;
      shiftToggleArmed = false;
      extensionEnabled = !extensionEnabled;
      storage.set({ [GLOBAL_ENABLED_STORAGE_KEY]: extensionEnabled });
      if (!extensionEnabled) {
        hideUI();
        buffer = '';
      }
    }

    async function onStorageChanged(changes, areaName) {
      if (areaName !== 'local') return;
      if (changes[GLOBAL_ENABLED_STORAGE_KEY]) {
        extensionEnabled = changes[GLOBAL_ENABLED_STORAGE_KEY].newValue !== false;
        if (!extensionEnabled) {
          hideUI();
          buffer = '';
        }
      }
      if (changes[FONT_SIZE_STORAGE_KEY]) {
        fontSize = changes[FONT_SIZE_STORAGE_KEY].newValue;
        updateUIMode();
      }
      if (changes[USER_HISTORY_STORAGE_KEY]) {
        userHistory = normalizeUserHistory(changes[USER_HISTORY_STORAGE_KEY].newValue);
      }
      if (changes[PUNCTUATION_MODE_STORAGE_KEY]) {
        punctuationMode = changes[PUNCTUATION_MODE_STORAGE_KEY].newValue === 'en' ? 'en' : 'cn';
        if (uiVisible) renderUI();
      }
      if (changes[WIDTH_MODE_STORAGE_KEY]) {
        widthMode = changes[WIDTH_MODE_STORAGE_KEY].newValue === 'full' ? 'full' : 'half';
        if (uiVisible) renderUI();
      }
      if (changes[CUSTOM_DICT_STORAGE_KEY] || changes[USER_DICT_STORAGE_KEY] || changes[PACKAGED_DICT_OVERRIDES_STORAGE_KEY]) {
        codes = {};
        await loadDict();
        if (buffer) updateCandidates();
      }
    }

    document.body.appendChild(uiContainer);
    target.addEventListener('keydown', onKeyDown, true);
    target.addEventListener('focus', onFocus);
    target.addEventListener('blur', onBlur);
    document.addEventListener('keydown', onDocumentKeyDown, true);
    document.addEventListener('keyup', onDocumentKeyUp, true);
    document.addEventListener('mousemove', onDragMove, true);
    document.addEventListener('mouseup', endDrag, true);
    window.addEventListener('resize', onWindowMove);
    window.addEventListener('scroll', onWindowMove, true);
    if (chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(onStorageChanged);
    }
    void loadDict();

    return {
      destroy() {
        target.removeEventListener('keydown', onKeyDown, true);
        target.removeEventListener('focus', onFocus);
        target.removeEventListener('blur', onBlur);
        document.removeEventListener('keydown', onDocumentKeyDown, true);
        document.removeEventListener('keyup', onDocumentKeyUp, true);
        document.removeEventListener('mousemove', onDragMove, true);
        document.removeEventListener('mouseup', endDrag, true);
        window.removeEventListener('resize', onWindowMove);
        window.removeEventListener('scroll', onWindowMove, true);
        if (chrome.storage?.onChanged) {
          chrome.storage.onChanged.removeListener(onStorageChanged);
        }
        uiContainer.remove();
      }
    };
  }

  global.SBZRShared = {
    DEFAULT_PACKAGED_RIME_DICT_PATHS,
    DEFAULT_PACKAGED_AFFIX_DICT_SOURCES,
    DEFAULT_RIME_USER_DICT_NAME,
    FIXED_DICT_PATH,
    FIXED_DICT_NAME,
    FIXED_DICT_BASE_WEIGHT,
    GLOBAL_ENABLED_STORAGE_KEY,
    PACKAGED_DICT_OVERRIDES_STORAGE_KEY,
    USER_HISTORY_STORAGE_KEY,
    PUNCTUATION_MODE_STORAGE_KEY,
    WIDTH_MODE_STORAGE_KEY,
    getEditableDictPaths,
    getDictFileLabel,
    getPackagedDictOverrides,
    readPackagedDictText,
    savePackagedDictOverride,
    normalizeDictText,
    isMeaningfulDictText,
    segmentSentence,
    parseWeight,
    detectDictFormat,
    addCodeEntry,
    parseDictItems,
    parseDictLine,
    buildCodeIndexFromTexts,
    buildWeightedCodeMapFromTexts,
    buildRimeDictHeader,
    renderRimeDictText,
    getNextFixedWeight,
    persistFixedDictText,
    promptAndSaveFixedEntry,
    getActiveSelectedText,
    showAppToast,
    showAppConfirm,
    showCodeInputDialog,
    fetchPackagedRimeDictTexts,
    fetchPackagedAffixDictTexts,
    applyUserHistory,
    recordUserHistorySelection,
    syncUserHistoryToRime,
    installTabDragging,
    processImeKeyDown,
    installTextareaIME
  };
})(window);
