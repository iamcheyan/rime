#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import platform
from pathlib import Path


DEFAULT_EXTENSION_ID = "lcfomhoeajhamclpdahlgjbadhhmpbhi"
HOST_NAME = "com.sbzr.filehost"


def to_windows_path(path: Path) -> str:
    return str(path).replace("/", "\\")


def write_env(native_host_dir: Path, extension_id: str) -> None:
    host_py = native_host_dir / "sbzr_native_host.py"
    host_cmd = native_host_dir / "sbzr_native_host.cmd"
    env_lines = [
        f"NATIVE_HOST_DIR={native_host_dir}",
        f"NATIVE_HOST_PY={host_py}",
        f"NATIVE_HOST_CMD={host_cmd}",
        f"EXTENSION_ID={extension_id}",
        f"HOST_NAME={HOST_NAME}",
        f"PLATFORM={platform.system()}",
    ]
    (native_host_dir / ".env").write_text("\n".join(env_lines) + "\n", encoding="utf-8")


def write_posix_manifest(native_host_dir: Path, extension_id: str) -> None:
    template_path = native_host_dir / "com.sbzr.filehost.json.template"
    manifest_path = native_host_dir / "com.sbzr.filehost.json"
    template = template_path.read_text(encoding="utf-8")
    rendered = (
        template
        .replace("__HOST_PATH__", str((native_host_dir / "sbzr_native_host.py").resolve()))
        .replace("__EXTENSION_ID__", extension_id)
    )
    manifest_path.write_text(rendered + ("" if rendered.endswith("\n") else "\n"), encoding="utf-8")


def write_windows_files(native_host_dir: Path, extension_id: str) -> None:
    manifest_path = native_host_dir / "com.sbzr.filehost.json"
    windows_manifest = {
        "name": HOST_NAME,
        "description": "SBZR local file host",
        "path": to_windows_path((native_host_dir / "sbzr_native_host.cmd").resolve()),
        "type": "stdio",
        "allowed_origins": [
            f"chrome-extension://{extension_id}/"
        ],
    }
    manifest_path.write_text(json.dumps(windows_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    reg_path = native_host_dir / "install_chrome_native_host.reg"
    manifest_reg_path = to_windows_path(manifest_path.resolve()).replace("\\", "\\\\")
    reg_text = (
        "Windows Registry Editor Version 5.00\n\n"
        f"[HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\{HOST_NAME}]\n"
        f"@=\"{manifest_reg_path}\"\n"
    )
    reg_path.write_text(reg_text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Native Messaging config files for the current platform.")
    parser.add_argument("--extension-id", default=DEFAULT_EXTENSION_ID, help="Chrome extension ID")
    args = parser.parse_args()

    native_host_dir = Path(__file__).resolve().parent
    write_env(native_host_dir, args.extension_id)

    system = platform.system()
    if system == "Windows":
        write_windows_files(native_host_dir, args.extension_id)
    elif system in {"Linux", "Darwin"}:
        write_posix_manifest(native_host_dir, args.extension_id)
    else:
        raise RuntimeError(f"Unsupported platform: {system}")

    print(f"Configured {HOST_NAME} for {system} in {native_host_dir}")


if __name__ == "__main__":
    main()
