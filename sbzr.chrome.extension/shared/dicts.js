(function (global) {
  /**
   * 统一词库配置列表 (类似 Rime 的 import_tables 结构)
   * 
   * path: 相对扩展根目录的路径
   * prefix: (可选) 引导词，如 'u' 代表手动造词
   * reloadable: (可选) 是否允许在 Notepad 中通过 Native Host 保存/重载
   */
  const TABLES = [
    { path: 'dicts/sbzr.single.dict.yaml', defaultEnabled: true },
    { path: 'dicts/base.dict.yaml', defaultEnabled: true },
    { path: 'dicts/sbzr.len1.full.dict.yaml', defaultEnabled: false },
    { path: 'dicts/zdy.dict.yaml', prefix: 'u', reloadable: true, defaultEnabled: false }
  ];
  const DEFAULT_TABLES = TABLES.filter((table) => table.defaultEnabled !== false);

  // 内部转换逻辑，保持跟原有 API 的兼容性，这样不需要改动其他代码
  const DICTS = {
    TABLES,
    DEFAULT_PATHS: DEFAULT_TABLES.map((table) => table.path),
    DEFAULT_RIME_PATHS: DEFAULT_TABLES.filter((table) => !table.prefix).map((table) => table.path),
    DEFAULT_AFFIX_SOURCES: DEFAULT_TABLES.filter((table) => table.prefix).map((table) => ({
      path: table.path,
      prefix: table.prefix,
      dictName: `sb${table.prefix || 'ext'}.extension`
    })),
    RIME_PATHS: TABLES.filter(t => !t.prefix).map(t => t.path),
    AFFIX_SOURCES: TABLES.filter(t => t.prefix).map(t => ({
      path: t.path,
      prefix: t.prefix,
      dictName: `sb${t.prefix || 'ext'}.extension`
    })),
    RELOADABLE_PATHS: TABLES.filter(t => t.reloadable).map(t => t.path)
  };

  global.SBZR_DICTS = DICTS;
})(typeof window !== 'undefined' ? window : globalThis);
