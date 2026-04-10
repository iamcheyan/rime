# SBZR Native Host

这个目录是扩展分发时统一使用的 `Chrome Native Messaging + Python` 目录。

支持平台：

- Linux
- macOS
- Windows

作用：

- notepad 里的 `Save` 优先通过 Native Messaging 反写本地 `sbzr.chrome.extension/dicts/*.yaml`
- 如果 Native Host 不可用，扩展仍会回退到扩展存储覆盖层

## 文件

- `sbzr_native_host.py`
  通用 Python Native Messaging Host
- `configure_native_host.py`
  运行后按当前系统生成 `.env` 和对应配置文件
- `sbzr_native_host.cmd`
  Windows 启动包装脚本
- `com.sbzr.filehost.json.template`
  Linux/macOS 通用 manifest 模板
- `com.sbzr.filehost.windows.json`
  Windows manifest 示例
- `install_chrome_native_host.reg`
  Windows 用户级 Chrome 注册表导入文件

## 扩展 ID

当前目录里的 Windows 示例已经写入：

```text
lcfomhoeajhamclpdahlgjbadhhmpbhi
```

如果以后分发给别的扩展 ID，需要同步改 manifest 里的 `allowed_origins`。

## 安全限制

Python host 只允许写：

- `sbzr.chrome.extension/dicts/*.yaml`
- `sbzr.chrome.extension/dicts/*.yml`

它会拒绝：

- 目录外路径
- 非 yaml/yml 文件

## 推荐用法

无论 Linux、macOS 还是 Windows，建议把整个 `native_host` 目录复制到目标机器的最终位置后，再运行：

Linux/macOS:

```bash
python3 configure_native_host.py
```

Windows:

```powershell
python configure_native_host.py
```

脚本会：

- 生成 `.env`
- 按当前机器实际路径生成 `com.sbzr.filehost.json`
- Windows 下同时重写 `install_chrome_native_host.reg`

如果扩展 ID 变了，可以指定：

```bash
python3 configure_native_host.py --extension-id YOUR_EXTENSION_ID
```

或：

```powershell
python configure_native_host.py --extension-id YOUR_EXTENSION_ID
```

## .env 内容

脚本生成的 `.env` 会保存：

- `NATIVE_HOST_DIR`
- `NATIVE_HOST_PY`
- `NATIVE_HOST_CMD`
- `EXTENSION_ID`
- `HOST_NAME`
- `PLATFORM`

## Linux

1. 确认系统里有 `python3`
2. 给 host 可执行权限：

```bash
chmod +x /path/to/native_host/sbzr_native_host.py
```

3. 运行：

```bash
python3 configure_native_host.py
```

4. 安装到 Chrome Native Messaging 目录

Google Chrome:

```bash
mkdir -p ~/.config/google-chrome/NativeMessagingHosts
cp /path/to/native_host/com.sbzr.filehost.json \
  ~/.config/google-chrome/NativeMessagingHosts/
```

Chromium:

```bash
mkdir -p ~/.config/chromium/NativeMessagingHosts
cp /path/to/native_host/com.sbzr.filehost.json \
  ~/.config/chromium/NativeMessagingHosts/
```

## macOS

1. 确认系统里有 `python3`
2. 运行：

```bash
python3 configure_native_host.py
```

3. 安装到 Chrome Native Messaging 目录

Google Chrome:

```bash
mkdir -p ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts
cp /path/to/native_host/com.sbzr.filehost.json \
  ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
```

Chromium:

```bash
mkdir -p ~/Library/Application\ Support/Chromium/NativeMessagingHosts
cp /path/to/native_host/com.sbzr.filehost.json \
  ~/Library/Application\ Support/Chromium/NativeMessagingHosts/
```

## Windows

这套方案使用当前用户注册表 `HKCU`，不需要管理员权限。

1. 确认系统里有 `python`

```powershell
python --version
```

2. 把整个 `native_host` 目录复制到固定路径  
例如：

```text
C:\Users\你的用户名\sbzr\native_host
```

3. 在该目录里运行：

```powershell
python configure_native_host.py
```

这会自动按当前真实路径重写：

- `com.sbzr.filehost.json`
- `install_chrome_native_host.reg`
- `.env`

4. 双击导入：

```text
install_chrome_native_host.reg
```

它写入的是：

```text
HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.sbzr.filehost
```

## 排错

如果 `Save` 没有反写本地文件，通常是：

1. manifest 路径不对
2. manifest 里的 `allowed_origins` 和扩展 ID 不匹配
3. Windows `.reg` 路径不对
4. Python 不在 PATH 里
5. 扩展没重新加载

最简单的 Python 侧检查：

Linux/macOS:

```bash
python3 /path/to/native_host/sbzr_native_host.py
```

Windows:

```powershell
python "C:\你的路径\native_host\sbzr_native_host.py"
```
