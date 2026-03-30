# SBZR Native Host for Linux

这个目录可以单独复制到 Linux 机器上使用。

包含：

- `configure_native_host.py`
- `sbzr_native_host.py`
- `sbzr_native_host.sh`
- `com.sbzr.filehost.json.template`

## 用法

1. 确认系统里有 `python3`
2. 运行：

```bash
python3 configure_native_host.py
```

3. 生成完成后，把 `com.sbzr.filehost.json` 安装到 Chrome Native Messaging 目录

Google Chrome:

```bash
mkdir -p ~/.config/google-chrome/NativeMessagingHosts
cp com.sbzr.filehost.json ~/.config/google-chrome/NativeMessagingHosts/
```

Chromium:

```bash
mkdir -p ~/.config/chromium/NativeMessagingHosts
cp com.sbzr.filehost.json ~/.config/chromium/NativeMessagingHosts/
```
