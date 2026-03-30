(function (global) {
  const USER_HISTORY_STORAGE_KEY = 'sbzr_user_history';
  const GLOBAL_ENABLED_STORAGE_KEY = 'sbzr_enabled';
  const PUNCTUATION_MODE_STORAGE_KEY = 'sbzr_punctuation_mode';
  const WIDTH_MODE_STORAGE_KEY = 'sbzr_width_mode';
  const PACKAGED_DICT_OVERRIDES_STORAGE_KEY = 'sbzr_packaged_dict_overrides';
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
    syncUserHistoryToRime,
    installTabDragging
  };
})(window);
