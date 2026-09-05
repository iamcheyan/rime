#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_easy_en_dev_lexicon.py — 现代开发者、编程语言、Linux/Git、AI/LLM 及常用复数技术词库构建
生成/更新: sbzr.chrome.extension/dicts.en/easy_en.extra.dict.yaml
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET_FILE = ROOT / "sbzr.chrome.extension" / "dicts.en" / "easy_en.extra.dict.yaml"

DEV_WORDS = [
    # 1. AI & LLM & Modern Tech
    "ChatGPT", "chatgpt", "OpenAI", "openai", "Anthropic", "anthropic", "Claude", "claude",
    "DeepMind", "deepmind", "Gemini", "gemini", "Antigravity", "antigravity", "Copilot", "copilot",
    "Cursor", "cursor", "Nova", "nova", "Gemma", "gemma", "Llama", "llama", "Mistral", "mistral",
    "Whisper", "whisper", "vLLM", "vllm", "Ollama", "ollama", "LangChain", "langchain", "LlamaIndex", "llamaindex",
    "prompt", "prompts", "prompting", "subagent", "subagents", "workflow", "workflows",
    "pipeline", "pipelines", "toolchain", "toolchains", "benchmark", "benchmarks", "token", "tokens",
    "tokenizer", "tokenizers", "tokenization", "embedding", "embeddings", "dataset", "datasets",
    "finetune", "finetuning", "lora", "qlora", "rag", "evals", "eval", "multimodal",

    # 2. Linux, Shell, Terminal, Chezmoi, Git & Dotfiles
    "dotfiles", "dotfile", "chezmoi", "githooks", "worktree", "submodule", "submodules",
    "commit", "commits", "rebase", "cherry-pick", "cherrypick", "checkout", "stash", "fetch",
    "origin", "upstream", "branch", "branches", "HEAD", "head",
    "sudo", "chmod", "chown", "chgrp", "systemctl", "journalctl", "grep", "ripgrep", "rg",
    "zsh", "bash", "fish", "tmux", "neovim", "nvim", "vim", "emacs", "nano",
    "brew", "pacman", "apt", "dnf", "yay", "flatpak", "snap", "nix", "nixos",
    "fcitx5", "librime", "rime", "wayland", "x11", "xorg", "hyprland", "sway", "i3",
    "kitty", "alacritty", "wezterm", "iterm", "iterm2", "warp", "ghostty",
    "ssh", "sshd", "rsync", "curl", "wget", "htop", "btop", "top", "neofetch", "fastfetch", "pkill", "killall",
    "ls", "ll", "la", "pwd", "cd", "mkdir", "rmdir", "touch", "cp", "mv", "rm",

    # 3. File Extensions & Data Formats
    "yaml", "yml", "json", "toml", "jsonl", "xml", "html", "css", "scss", "sass", "less",
    "wasm", "dylib", "so", "dll", "exe", "app", "dmg", "pkg", "deb", "rpm", "apk",
    "tar", "gz", "tgz", "zip", "rar", "7z", "iso", "bin", "md", "markdown", "sql", "sqlite", "db",

    # 4. Programming Languages & Runtimes
    "python", "python3", "py", "pip", "pip3", "venv", "pyenv", "pycache", "pytest", "mypy", "ruff", "uv",
    "pydantic", "django", "fastapi", "flask", "numpy", "pandas", "pytorch", "torch", "tensorflow",
    "javascript", "typescript", "ts", "js", "mjs", "cjs", "jsx", "tsx", "nodejs", "node",
    "npm", "pnpm", "yarn", "bun", "deno", "vite", "webpack", "rollup", "turbopack", "turborepo",
    "react", "vue", "svelte", "solid", "nextjs", "nuxt", "astro", "tailwind", "tailwindcss", "postcss",
    "prettier", "eslint", "biome",
    "rust", "cargo", "rustc", "rustup", "tokio", "serde", "axum", "actix",
    "golang", "go", "goroutine", "gin", "gorm", "cplusplus", "cpp", "clang", "gcc", "cmake", "ninja",
    "swift", "swiftui", "kotlin", "java", "jvm", "scala", "dart", "flutter", "electron", "tauri",

    # 5. Databases, Cloud & Infrastructure
    "mysql", "mariadb", "postgres", "postgresql", "sqlite", "sqlite3", "mongodb", "mongo",
    "redis", "memcached", "clickhouse", "prisma", "drizzle", "typeorm", "supabase", "firebase",
    "docker", "dockerfile", "docker-compose", "compose", "podman", "containerd",
    "k8s", "kubernetes", "kubectl", "k9s", "helm", "minikube", "kind",
    "nginx", "caddy", "apache", "traefik", "envoy", "cloudflare", "aws", "gcp", "azure",
    "vercel", "netlify", "flyio", "render", "railway", "heroku", "datadog", "sentry", "grafana", "prometheus",

    # 6. Common Programming Variables, Names, Arguments & Plurals
    "args", "kwargs", "params", "param", "props", "prop", "configs", "config", "options", "option",
    "settings", "setting", "utils", "util", "helpers", "helper", "handlers", "handler",
    "controllers", "controller", "services", "service", "models", "model", "views", "view",
    "middlewares", "middleware", "schemas", "schema", "interfaces", "interface", "types", "type",
    "enums", "enum", "constants", "const", "variables", "vars", "functions", "funcs", "func",
    "methods", "method", "classes", "class", "modules", "module", "packages", "package",
    "dependencies", "deps", "devdeps", "scripts", "script", "commands", "command", "cmd",
    "cli", "sdk", "api", "apis", "endpoint", "endpoints", "payload", "payloads",
    "headers", "header", "cookies", "cookie", "sessions", "session", "auth", "oauth",
    "token", "tokens", "jwt", "uuid", "guid", "regex", "regexes", "regexp",
    "metadata", "timestamp", "timestamps", "boolean", "bool", "integer", "int", "float", "double",
    "string", "strings", "str", "array", "arrays", "list", "lists", "dict", "dicts", "map", "maps",
    "set", "sets", "tuple", "tuples", "struct", "structs", "union", "unions", "pointer", "pointers", "ptr",
    "null", "nil", "undefined", "none", "true", "false",
    "async", "await", "promise", "promises", "callback", "callbacks", "closure", "closures",
    "iterator", "iterators", "generator", "generators", "yield",
    "import", "export", "default", "return", "throw", "catch", "try", "finally",
    "exception", "exceptions", "error", "errors", "warning", "warnings", "info", "debug", "trace",
    "log", "logs", "logger", "logging", "stdout", "stderr", "stdin",
    "buffer", "buffers", "stream", "streams", "socket", "sockets", "client", "clients", "server", "servers",
    "backend", "frontend", "fullstack", "devops", "agile", "scrum", "sprint", "standup",
    "retrospective", "roadmap", "backlog", "milestone", "milestones",
    "release", "releases", "hotfix", "bugfix", "feature", "features", "refactor",
    "deprecated", "legacy", "migration", "migrations", "rollback",
    "deploy", "deployment", "deployments", "staging", "production", "prod", "dev",
    "test", "tests", "testing", "ci", "cd", "coverage", "lint", "linter", "formatter",

    # 7. Collaboration, SaaS & Dev Platforms
    "github", "gitlab", "bitbucket", "jira", "confluence", "notion", "slack", "discord",
    "telegram", "zoom", "linear", "figma", "sketch", "canva", "miro", "trello", "asana"
]


def build():
    lines = [
        "# Rime dictionary",
        "# encoding: utf-8",
        "#",
        "# User-maintained supplemental English vocabulary for easy_en.",
        "# Modern Tech, AI, Linux, Git, Frameworks, and Developer Terms.",
        "#",
        "---",
        "name: sbzr.chrome.extension/dicts.en/easy_en.extra",
        'version: "2026-09-05"',
        "sort: by_weight",
        "use_preset_vocabulary: false",
        "columns:",
        "  - text",
        "  - code",
        "  - weight",
        "...",
        "",
    ]

    seen = set()
    entries = []

    # 权重基准：核心开发词统一 3,000,000，保持高优先级
    for word in DEV_WORDS:
        word = word.strip()
        if not word:
            continue
        code = word.lower()
        key = (word, code)
        if key not in seen:
            seen.add(key)
            entries.append((word, code, 3000000))

        # 同时确保全小写版本也存在
        lower_word = word.lower()
        lower_key = (lower_word, code)
        if lower_key not in seen:
            seen.add(lower_key)
            entries.append((lower_word, code, 2800000))

    # 按文本排序以保持整洁
    for text, code, weight in sorted(entries, key=lambda x: (x[1], x[0])):
        lines.append(f"{text}\t{code}\t{weight}")

    TARGET_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"✓ Successfully generated {len(entries)} modern developer entries in {TARGET_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
