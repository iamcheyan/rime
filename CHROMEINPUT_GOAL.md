# Goal: chromeinput — Chrome 全拼输入法扩展（从 sbzr.chrome.extension 重构移植）

> 自包含任务书。执行代理无需任何聊天记录。
> 源码参照：`/home/tetsuya/development/rime-study/sbzr.chrome.extension`（只读，勿改）
> 目标仓库：新建 `~/development/chromeinput` → push 到 github.com/iamcheyan/chromeinput（**私有仓**，先 `gh repo create iamcheyan/chromeinput --private`）

## 一、这是什么（30 秒）

把现有的 Chrome 内嵌双拼输入法（sbzr.chrome.extension，商店名 Veikin）**重构移植**成独立仓库的新扩展：
- **编码从自然码变体双拼改为全拼**（用户拍板：全拼 + 精简基础词库，防浏览器卡顿）
- **代码重构**：原 content.js 1925 行上帝文件拆成模块
- **Nova Editor（词库编辑器）一起移植**（用户拍板）
- 保留：候选条 UI、用户词频（localStorage）、快捷词、站点开关、中英标点/全半角、notepad、词频闭环接口
- 不做：native host 双向同步可留接口但默认关闭；日语方案；双拼运行时切换（词库生成器支持双拼输出留给未来，本期只全拼）

## 二、词库策略（已定，勿改）

**全拼词库 = 朙月拼音（7 万条）+ sbzr 用户资产**，生成脚本自动完成：

1. 基础词库：`/tmp/luna.dict.yaml`（已验证：70732 条 = 单字 4.9 万 + 二字词 1.1 万 + 三字 3059 + 四字 6440 + 长词 ~880；仅 2337 条有权重列）。若 /tmp 已清理则重新下载：
   `https://raw.githubusercontent.com/rime/rime-luna-pinyin/master/luna_pinyin.dict.yaml`
   （⚠️ 分支是 **master** 不是 main，404 就是分支错了）
2. 用户资产从源仓拷贝并**反解为全拼**：`dicts/sbzr.userdb.dict.yaml`(8条)、`dicts/sbzr.shortcut.dict.yaml`(9条)、`dicts/zdy.dict.yaml`(14条)。反解规则（自然码变体，源仓 AGENTS.md §7）：
   声母 zh→z ch→c sh→s；韵母反向映射 iang/uang→d, ian→m, uan→r, ai→l, ei→z, ue/üe→t（完整表从 `resource/常用字双拼拼音.db`（sqlite）提取校验，源仓里有）。转换后**人工核对**每条（样本量小，<50 条）。
3. **运行时格式**：扩展加载 JSON（非 YAML）。构建脚本 `tools/build_dict.py`：
   - 解析朙月 YAML → `word, pinyin(空格分隔音节), weight` 列表
   - 权重：原有权重保留；无权重的单字给 50014 档基值、词组按字数给 1000 基值（对齐 sbzr 习惯）
   - 输出 `extension/dicts/base.json`（数组：`[word, "pin yin", weight]` 压缩格式）
   - userdb/shortcut/zdy → `extension/dicts/user.json`（同格式，权重 999999 置顶）
   - **体积预算：两个 JSON 合计 ≤ 2.5MB（gzip 前）**，超了就按权重截断词组
4. 词库冷启动后存 `chrome.storage.local`（沿用原扩展的 overrides 机制思路），二次打开秒载。

## 三、输入引擎（重构核心，全新实现）

全拼 ≠ 双拼查表。要求：

1. **索引**：按"拼音串去空格"建 trie 或 Map 前缀索引；支持**音节切分**（输入 `xi'an` 歧义可不管，但 `nihao` 必须能匹配 `ni hao` 词）。实现：预生成时把每词条的全拼串去空格存键（`nihao`），运行时用户 buffer 直接前缀匹配键 + 候选按「完全匹配 > 前缀匹配」排序。
2. **首字母简拼**：`nh` → 你好（简拼候选排全拼之后）。预生成简拼键（`nh`）。
3. **逐键上屏模型**（沿用原交互）：Backspace 删码、Esc 清空、数字/点击选词、空格首选、翻页（`-`/`=` 或左右）、候选最多 3 行×6 个可展开。
4. **用户词频**：选中即加权（沿用 userHistory 结构 `{code:[words]}`），localStorage 持久化；候选排序 `完全匹配>用户历史>权重>字数短优先`。
5. **中英/临时英文**：buffer 无匹配时按字母直通上屏（原版行为，验证保留）。Shift 切中英（若原版有则保留）。
6. **性能硬指标**：7 万词建索引 ≤ 800ms（冷启动一次性）；每次按键出候选 ≤ 5ms（中端手机 Chrome）。

## 四、模块化重构（对照源码）

原文件 → 新结构：
```
extension/
├── manifest.json          # MV3, 重写(权限最小化: storage, unlimitedStorage, tabs, contextMenus; nativeMessaging 移除)
├── content/               # content scripts(拆原 content.js 1925 行)
│   ├── main.js            # 装配, <200 行
│   ├── keyhandler.js      # 按键拦截/焦点管理
│   ├── engine.js          # 全拼引擎(§三)
│   ├── committer.js       # 上屏(input/contenteditable 双路径, 沿用原 commit() 逻辑)
│   ├── ui.js              # 候选条渲染/拖拽/标点/全半角按钮(沿用原 renderUI 行为)
│   └── siterules.js       # 站点开关
├── shared/
│   ├── storage.js         # 词库/历史/设置(原 sbzr-core.js 瘦身)
│   ├── dictload.js        # YAML→JSON 加载+索引构建
│   ├── toast.js           # showAppToast/showAppConfirm(零原生控件! 源仓铁律)
│   ├── highlighter.js     # 原样移植(虚拟滚动高亮)
│   └── vim-mode.js        # 原样移植
├── editor/                # Nova Editor(原 notepad/, 移植+微改: 词典路径适配新 dicts/)
├── popup/                 # 重写(站点管理/词库选择/字号/开关)
└── dicts/                 # base.json + user.json(构建产物, 入仓, ≤2.5MB)
tools/build_dict.py        # §二构建脚本
docs/REFACTOR_NOTES.md     # 移植对照表(原文件→新文件, 逐模块)
```

强制规范：
- **零依赖**（无 CDN/框架/字体下载；原 SarasaMonoSC 25MB 字体不移植，编辑器用系统等宽栈）
- **禁止 alert/confirm/prompt**（源仓铁律，用 toast.js）
- 纯 vanilla ES2020，IIFE 或 ES modules（content script 用 IIFE+构建期拼接或单文件加载顺序，自行决定，manifest 里声明清楚）
- 原代码逻辑优先：commit/拖拽/标点切换/编辑器交互等**行为照抄**，只重构不重设计；不确定的行为在 REFACTOR_NOTES.md 标"行为存疑"

## 五、验收（严格，全过才算完成）

**A. 功能（浏览器实测，chrome://extensions 加载未打包扩展）**
1. 安装零报错；任意网页输入框打 `nihao` → 候选"你好"空格上屏 ✓
2. `zhongguo` → 中国；`nh` 简拼也出"你好"（排全拼后）✓
3. 无匹配字母串直通上屏；Esc 清 buffer；Backspace 逐字删 ✓
4. 用户词频：选过一次的词升到首位（重开标签页仍在）✓
5. 中英标点切换/全半角切换按钮生效 ✓
6. 快捷词（Alt+Shift+A 添加选中文本）→ 立即可打出来 ✓
7. popup 站点开关：禁用域名单词直通不拦截 ✓
8. Nova Editor：打开词库文件 → 虚拟滚动流畅（1 万行文件拖动无卡顿）→ 编辑保存生效 → vim 模式 hjkl/dd/yy/p 可用 ✓
9. contenteditable（如 Gmail/Notion 页面）与 `<textarea>`/`<input>` 三种宿主上屏均正常 ✓

**B. 性能**
10. 冷启动（清缓存重载扩展）建索引 ≤800ms（console.time 打点截图）✓
11. 按键响应：连续快打 20 键候选条无肉眼卡顿；性能 API 实测单键 ≤5ms ✓
12. dicts 总体积 ≤2.5MB ✓

**C. 质量**
13. `grep -rE "\b(alert|confirm|prompt)\s*\("` extension/ 零命中 ✓
14. 全部 js `node --check` 通过；无 console.error 残留（正常流程）✓
15. console 零报错（全功能走查）✓
16. docs/REFACTOR_NOTES.md 完成：原→新文件对照 + §二词库转换记录（双拼→全拼反解每条对照表）+ 行为存疑清单 ✓

**D. 工程**
17. 私有仓 chromeinput 建好，分批中文 commit push（引擎/编辑器/词库/验收各一批）✓
18. 不改动 rime-study 源仓任何文件 ✓

## 六、参考（开工先读）
- 源仓 `AGENTS.md`（§2 Nova 架构/§5 词频闭环/§7 双拼映射表——反解全拼要用）
- 源仓 `content.js` 的 `commit()/renderUI()/updateCandidates()`、`shared/sbzr-core.js` 的存储模式
- 朙月词库字段结构（无权重列居多，见 §二处理）
