# SBZR Native Host for Windows

这个目录可以单独复制到 Windows 机器上使用。

包含：

- `configure_native_host.py`
- `sbzr_native_host.py`
- `sbzr_native_host.cmd`
- `com.sbzr.filehost.windows.json`
- `install_chrome_native_host.reg`

## 用法

1. 确认系统里有 `python`

```powershell
python --version
```

2. 运行：

```powershell
python configure_native_host.py
```

3. 脚本会按当前目录生成：

- `com.sbzr.filehost.json`
- `install_chrome_native_host.reg`
- `.env`

4. 双击导入：

```text
install_chrome_native_host.reg
```
