const SBZRShared = window.SBZRShared;

const SITE_RULES_STORAGE_KEY = 'sbzr_site_rules';
const IME_DICT_PATHS_STORAGE_KEY = 'sbzr_ime_dict_paths';

const IME_DICT_TABLES = window.SBZR_DICTS?.TABLES || [];
const DEFAULT_IME_DICT_PATHS = IME_DICT_TABLES.map((table) => table.path);

let siteRules = [];
let currentPageEnabled = true;
let imeDictPaths = [...DEFAULT_IME_DICT_PATHS];
let activeTarget = null;
let activeController = null;

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
  for (const rule of siteRules) {
    try {
      if (new RegExp(rule.pattern).test(url)) {
        matchedRule = rule;
      }
    } catch {
      // Ignore invalid regex entries.
    }
  }
  return matchedRule;
}

function evaluateCurrentPageEnabled() {
  const matchedRule = getMatchedSiteRule();
  currentPageEnabled = matchedRule ? matchedRule.enabled !== false : true;
  if (!currentPageEnabled) {
    destroyActiveController();
  }
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

function isSupportedTarget(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tagName = el.tagName.toLowerCase();
  if (tagName === 'textarea') return true;
  if (tagName === 'input') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'search', 'tel', 'url', 'email', 'password'].includes(type);
  }
  return false;
}

function resolveEventTarget(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  for (const node of path) {
    if (isSupportedTarget(node)) return node;
  }

  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return isSupportedTarget(active) ? active : null;
}

function destroyActiveController() {
  if (activeController?.destroy) {
    activeController.destroy();
  }
  activeController = null;
  activeTarget = null;
}

function ensureControllerForTarget(target) {
  if (!SBZRShared?.installTextareaIME) return;
  if (!isSupportedTarget(target)) return;
  if (!currentPageEnabled) return;
  if (activeTarget === target && activeController) return;

  destroyActiveController();

  const { packagedPaths, affixSources } = buildImeDictConfig();
  activeTarget = target;
  activeController = SBZRShared.installTextareaIME({
    target,
    packagedPaths,
    affixSources,
    isSuppressed: () => (
      !currentPageEnabled ||
      activeTarget !== target ||
      document.activeElement !== target
    )
  });
}

async function hydrateSettings() {
  if (!chrome.storage?.local) return;
  const result = await chrome.storage.local.get([
    SITE_RULES_STORAGE_KEY,
    IME_DICT_PATHS_STORAGE_KEY
  ]);
  siteRules = normalizeSiteRules(result[SITE_RULES_STORAGE_KEY]);
  imeDictPaths = normalizeImeDictPaths(result[IME_DICT_PATHS_STORAGE_KEY]);
  evaluateCurrentPageEnabled();
}

document.addEventListener('focusin', (event) => {
  const target = resolveEventTarget(event);
  if (!target) return;
  ensureControllerForTarget(target);
}, true);

document.addEventListener('pointerdown', (event) => {
  const target = resolveEventTarget(event);
  if (!target) return;
  ensureControllerForTarget(target);
}, true);

document.addEventListener('focusout', () => {
  window.setTimeout(() => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    if (!isSupportedTarget(active) && activeController) {
      destroyActiveController();
    }
  }, 0);
}, true);

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    let shouldReevaluate = false;
    let shouldRebuildController = false;

    if (changes[SITE_RULES_STORAGE_KEY]) {
      siteRules = normalizeSiteRules(changes[SITE_RULES_STORAGE_KEY].newValue);
      shouldReevaluate = true;
    }

    if (changes[IME_DICT_PATHS_STORAGE_KEY]) {
      imeDictPaths = normalizeImeDictPaths(changes[IME_DICT_PATHS_STORAGE_KEY].newValue);
      shouldRebuildController = true;
    }

    if (shouldReevaluate) {
      evaluateCurrentPageEnabled();
      if (currentPageEnabled && isSupportedTarget(document.activeElement)) {
        ensureControllerForTarget(document.activeElement);
      }
    }

    if (shouldRebuildController && activeTarget && currentPageEnabled) {
      ensureControllerForTarget(activeTarget);
    }
  });
}

void hydrateSettings().then(() => {
  if (isSupportedTarget(document.activeElement)) {
    ensureControllerForTarget(document.activeElement);
  }
});
