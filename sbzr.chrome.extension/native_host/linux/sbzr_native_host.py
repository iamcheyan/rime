#!/usr/bin/env python3
import json
import struct
import sys
import traceback
from pathlib import Path

# Use a more permissive log location for debugging
LOG_FILE = Path("/tmp/sbzr_native_host.log")

def log(msg):
    try:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(f"{msg}\n")
    except:
        pass

try:
    HOST_NAME = "com.sbzr.filehost"
    NATIVE_HOST_DIR = Path(__file__).resolve().parent
    EXTENSION_ROOT = next(
        (parent for parent in [NATIVE_HOST_DIR, *NATIVE_HOST_DIR.parents] if (parent / "dicts").is_dir()),
        None
    )
    if EXTENSION_ROOT is None:
        raise FileNotFoundError(f"Failed to locate extension root from {NATIVE_HOST_DIR}")
    DICT_ROOT = (EXTENSION_ROOT / "dicts").resolve()
    SYNC_ROOT = (EXTENSION_ROOT.parent / "sync").resolve()
except Exception as e:
    log(f"Initialization error: {traceback.format_exc()}")
    sys.exit(1)


def read_message():
    try:
        raw_length = sys.stdin.buffer.read(4)
        if not raw_length:
            return None
        if len(raw_length) != 4:
            log(f"Error: Invalid message length prefix length: {len(raw_length)}")
            return None
        message_length = struct.unpack("<I", raw_length)[0]
        payload = sys.stdin.buffer.read(message_length)
        if len(payload) != message_length:
            log(f"Error: Incomplete message payload. Expected {message_length}, got {len(payload)}")
            return None
        return json.loads(payload.decode("utf-8"))
    except Exception as e:
        log(f"Error reading message: {traceback.format_exc()}")
        return None


def write_message(data):
    try:
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        sys.stdout.buffer.write(struct.pack("<I", len(payload)))
        sys.stdout.buffer.write(payload)
        sys.stdout.buffer.flush()
    except Exception as e:
        log(f"Error writing message: {traceback.format_exc()}")


def resolve_dict_path(relative_path):
    if not relative_path:
        raise ValueError("Missing path")
    
    target = (DICT_ROOT / relative_path).resolve()
    # Security check: must be inside DICT_ROOT
    if not str(target).startswith(str(DICT_ROOT)):
        raise ValueError(f"Path is outside dict root: {target} vs {DICT_ROOT}")
    if target.suffix not in {".yaml", ".yml", ".txt"}:
        raise ValueError("Only YAML and TXT files are allowed")
    return target


def handle_message(message):
    action = message.get("action")
    log(f"Handling action: {action}")
    
    if action == "sync_userdb":
        # Target: project_root/sync/sbzrExtension/sbzr.txt
        folder_name = message.get("folder", "sbzrExtension")
        target_dir = SYNC_ROOT / folder_name
        target_dir.mkdir(parents=True, exist_ok=True)
        
        target_file = target_dir / "sbzr.txt"
        content = message.get("content", "")
        target_file.write_text(content, encoding="utf-8")
        log(f"Synced UserDB to: {target_file}")
        return {"ok": True, "path": str(target_file)}

    if action == "save_dict":
        target = resolve_dict_path(message.get("path", ""))
        content = message.get("content", "")
        target.write_text(content, encoding="utf-8")
        log(f"Saved dict: {target}")
        return {
            "ok": True,
            "mode": "native",
            "path": target.name
        }

    if action == "list_dicts":
        if not DICT_ROOT.exists():
            log(f"Error: DICT_ROOT does not exist: {DICT_ROOT}")
            return {"ok": False, "error": "Dictionary directory not found"}
        items = sorted(path.name for path in DICT_ROOT.glob("*.yaml"))
        log(f"Listed {len(items)} dicts")
        return {
            "ok": True,
            "files": items
        }

    if action == "read_dict":
        target = resolve_dict_path(message.get("path", ""))
        log(f"Reading dict: {target}")
        return {
            "ok": True,
            "path": target.name,
            "content": target.read_text(encoding="utf-8")
        }

    if action == "read_dicts":
        if not DICT_ROOT.exists():
            log(f"Error: DICT_ROOT does not exist: {DICT_ROOT}")
            return {"ok": False, "error": "Dictionary directory not found"}
        items = {}
        for path in sorted(DICT_ROOT.glob("*.yaml")):
            items[path.name] = path.read_text(encoding="utf-8")
        log(f"Read {len(items)} dicts content")
        return {
            "ok": True,
            "files": items
        }

    raise ValueError(f"Unsupported action: {action}")


def main():
    log("Native host started")
    while True:
        message = read_message()
        if message is None:
            log("Native host received empty message or EOF, exiting")
            break
        try:
            result = handle_message(message)
        except Exception as exc:
            log(f"Exception handling message: {traceback.format_exc()}")
            result = {
                "ok": False,
                "error": str(exc)
            }
        write_message(result)
    log("Native host stopped normally")


if __name__ == "__main__":
    main()
