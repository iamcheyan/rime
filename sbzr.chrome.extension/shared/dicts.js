(function (global) {
  /**
   * 统一词库配置列表 (类似 Rime 的 import_tables 结构)
   * 
   * path: 相对扩展根目录的路径
   * prefix: (可选) 引导词，如 'u' 代表手动造词
   * reloadable: (可选) 是否允许在 Notepad 中通过 Native Host 保存/重载
   */
  const TABLES = [
    { path: 'dicts/mini.dict.yaml' },
    { path: 'dicts/sbzr.len1.full.dict.yaml' },
    { path: 'dicts/zdy.dict.yaml', prefix: 'u', reloadable: true }
  ];

  // 内部转换逻辑，保持跟原有 API 的兼容性，这样不需要改动其他代码
  const DICTS = {
    TABLES,
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
