# SBZR Native Host

`native_host/` 现在按平台拆分：

- `linux/`
- `mac/`
- `windows/`

每个目录都包含该平台部署所需的完整文件集合，可以单独复制出去使用。

## 目录说明

### `linux/`

包含：

- `configure_native_host.py`
- `sbzr_native_host.py`
- `sbzr_native_host.sh`
- `com.sbzr.filehost.json.template`
- `README.md`

### `mac/`

包含：

- `configure_native_host.py`
- `sbzr_native_host.py`
- `sbzr_native_host.sh`
- `com.sbzr.filehost.json.template`
- `README.md`

### `windows/`

包含：

- `configure_native_host.py`
- `sbzr_native_host.py`
- `sbzr_native_host.cmd`
- `com.sbzr.filehost.windows.json`
- `install_chrome_native_host.reg`
- `README.md`

## 说明

- 顶层目录只保留平台入口说明，不再直接作为分发包使用。
- 实际安装时，请进入对应平台目录运行 `configure_native_host.py`。
- 如果扩展 ID 变化，仍然用 `--extension-id` 传入即可。
