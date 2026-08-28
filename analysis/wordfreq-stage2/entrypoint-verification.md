# 阶段 2 入口修改后验证

## 产物

- 覆盖层：`sbzr.chrome.extension/dicts/sbzr.common-frequency.dict.yaml`
- SHA256：`eae45711bb8315b2f147064b5ee4f83aa0ede7dfaeca7f28ce734ceafef3cb2e`
- 1022 条唯一 `text+code`，权重范围 2001～2998；16/16 个常用词探针可找到。
- `这个` 3 编码、`可以` 2 编码、`没有` 3 编码、`中国` 2 编码均保留。

## 入口变更

- `sbzr.dict.yaml` 在 `sbzr.shortcut` 后导入 `sbzr.chrome.extension/dicts/sbzr.common-frequency`。
- Chrome `shared/dicts.js` 将 `dicts/sbzr.common-frequency.dict.yaml` 加入 `defaultEnabled: true` 的 TABLES。
- 入口变更前 SHA256 已由 `sbzr.common-frequency.rollback.json` 固化；变更后 SHA256 见 `entrypoint-verification.json`。

## 验证

- `python3 -m py_compile scripts/generate_common_frequency.py`：通过。
- `node --check sbzr.chrome.extension/shared/dicts.js`：通过；Node 运行时默认路径无缺失文件。
- 隔离临时目录执行 `rime_deployer --compile sbzr.schema.yaml`：通过；`sbzr.table.bin` 与 `sbzr.schema.yaml` 均为非空产物。未使用仓库 `rebuild`，未修改本机 Rime 用户目录。
- base、extended.common、canonical DB、banned words 输入文件保持基线哈希；未读取私人 userdb、LevelDb 或动态频率文件。

## 回滚

阶段提交后执行 `git revert <stage2-commit>`，会同时移除入口接入和覆盖层；不恢复任何私人运行时数据。
