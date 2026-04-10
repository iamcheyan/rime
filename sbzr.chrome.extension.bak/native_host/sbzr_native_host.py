#!/usr/bin/env python3
import json
import struct
import sys
from pathlib import Path


HOST_NAME = "com.sbzr.filehost"
REPO_ROOT = Path(__file__).resolve().parents[2]
DICT_ROOT = (REPO_ROOT / "sbzr.chrome.extension" / "dicts").resolve()


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    if len(raw_length) != 4:
        raise RuntimeError("Invalid native message length prefix")
    message_length = struct.unpack("<I", raw_length)[0]
    payload = sys.stdin.buffer.read(message_length)
    if len(payload) != message_length:
        raise RuntimeError("Incomplete native message payload")
    return json.loads(payload.decode("utf-8"))


def write_message(data):
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(payload)))
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def resolve_dict_path(relative_path):
    if not relative_path:
        raise ValueError("Missing path")
    target = (DICT_ROOT / relative_path).resolve()
    if target.parent != DICT_ROOT:
        raise ValueError("Path is outside dict root")
    if target.suffix not in {".yaml", ".yml"}:
        raise ValueError("Only YAML files are allowed")
    return target


def handle_message(message):
    action = message.get("action")
    if action == "save_dict":
        target = resolve_dict_path(message.get("path", ""))
        target.write_text(message.get("content", ""), encoding="utf-8")
        return {
            "ok": True,
            "mode": "native",
            "path": target.name
        }

    if action == "list_dicts":
        items = sorted(path.name for path in DICT_ROOT.glob("*.yaml"))
        return {
            "ok": True,
            "files": items
        }

    if action == "read_dict":
        target = resolve_dict_path(message.get("path", ""))
        return {
            "ok": True,
            "path": target.name,
            "content": target.read_text(encoding="utf-8")
        }

    if action == "read_dicts":
        items = {}
        for path in sorted(DICT_ROOT.glob("*.yaml")):
            items[path.name] = path.read_text(encoding="utf-8")
        return {
            "ok": True,
            "files": items
        }

    raise ValueError(f"Unsupported action: {action}")


def main():
    while True:
        message = read_message()
        if message is None:
            break
        try:
            result = handle_message(message)
        except Exception as exc:  # pragma: no cover
            result = {
                "ok": False,
                "error": str(exc)
            }
        write_message(result)


if __name__ == "__main__":
    main()
