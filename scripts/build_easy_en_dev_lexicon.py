#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_easy_en_dev_lexicon.py — 现代开发者、编程语言、Linux/Git、DevOps、网络/安全、AI/LLM、云计算专业词库构建脚本
生成/更新: sbzr.chrome.extension/dicts.en/easy_en.extra.dict.yaml
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET_FILE = ROOT / "sbzr.chrome.extension" / "dicts.en" / "easy_en.extra.dict.yaml"

DEV_WORDS = [
    # 1. Linux Commands & System Administration (Linux 核心命令与系统管理)
    "ssh", "sshd", "scp", "sftp", "rsync", "curl", "wget", "grep", "ripgrep", "rg",
    "sed", "awk", "find", "xargs", "tar", "gzip", "gunzip", "bzip2", "xz", "unzip", "zip", "7z", "zcat",
    "cat", "tac", "head", "tail", "less", "more", "tee", "touch", "mkdir", "rmdir", "rm", "cp", "mv", "ln",
    "chmod", "chown", "chgrp", "chsh", "sudo", "su", "whoami", "id", "uname", "uptime",
    "top", "htop", "btop", "glances", "ps", "kill", "pkill", "killall", "pgrep",
    "systemctl", "journalctl", "service", "crontab", "cron", "at", "watch", "nohup", "screen", "tmux", "zellij",
    "strace", "ltrace", "lsof", "fuser", "netstat", "ss", "ip", "ifconfig", "route", "iptables", "nftables", "ufw", "firewalld",
    "ping", "traceroute", "tracepath", "mtr", "dig", "nslookup", "host", "nc", "netcat", "ncat", "socat",
    "tcpdump", "wireshark", "tshark", "nmap", "iperf", "iperf3",
    "df", "du", "free", "vmstat", "iostat", "sar", "dmesg", "lsblk", "blkid", "fdisk", "gdisk", "parted", "mkfs",
    "mount", "umount", "sync", "dd", "badblocks", "smartctl",
    "env", "export", "alias", "unalias", "source", "history", "clear", "reset", "echo", "printf", "read", "exit",
    "reboot", "shutdown", "poweroff", "halt", "neofetch", "fastfetch", "tree", "jq", "yq", "fzf", "fd", "bat", "eza", "exa",
    "zoxide", "atuin", "starship", "chezmoi", "age", "agekeygen", "sops", "rclone", "restic", "borg",
    "dust", "duf", "procs", "bottom", "bandwhich", "gping", "hyperfine", "tokei",
    "zsh", "bash", "fish", "sh", "dash", "csh", "tcsh", "pwsh", "powershell",
    "neovim", "nvim", "vim", "emacs", "nano", "helix", "kakoune", "micro",
    "brew", "pacman", "apt", "aptget", "dnf", "yum", "zypper", "apk", "yay", "paru", "flatpak", "snap",
    "nix", "nixos", "nixpkgs", "nixdarwin", "homemanager", "flake", "flakes",
    "fcitx5", "fcitx", "ibus", "librime", "rime", "xkb", "keyd", "karabiner",
    "wayland", "x11", "xorg", "hyprland", "sway", "i3", "dwm", "gnome", "kde", "xfce",
    "kitty", "alacritty", "wezterm", "ghostty", "foot", "iterm", "iterm2", "warp",

    # 2. Git & Version Control (Git 版本控制与协作)
    "git", "github", "gitlab", "bitbucket", "gitea", "forgejo", "gh",
    "clone", "init", "add", "restore", "reset", "status", "diff", "commit", "commits",
    "branch", "branches", "checkout", "switch", "merge", "rebase", "cherrypick", "cherry-pick",
    "tag", "tags", "fetch", "pull", "push", "remote", "remotes", "submodule", "submodules",
    "worktree", "worktrees", "stash", "log", "show", "blame", "reflog", "bisect", "revert",
    "clean", "gc", "prune", "bundle", "archive", "patch", "formatpatch", "am", "apply",
    "shortlog", "describe", "sparsecheckout", "gitflow", "gitignore", "gitattributes", "gitmodules", "githooks",
    "precommit", "prepush", "fastforward", "squash", "fixup", "amend", "conflict", "conflicts",
    "HEAD", "head", "origin", "upstream", "main", "master", "develop", "feature", "hotfix", "release",
    "pullrequest", "pr", "mergerequest", "mr", "issue", "issues", "milestone", "milestones",

    # 3. Security, Cryptography & Authentication (安全、加密与身份认证)
    "ssh", "sshkeygen", "sshcopyid", "sshadd", "sshagent", "sshdconfig", "knownhosts", "authorizedkeys",
    "idrsa", "ided25519", "ed25519", "rsa", "ecdsa", "dsa", "pki", "tls", "ssl", "openssl",
    "certbot", "letsencrypt", "ca", "crt", "pem", "cer", "key", "csr", "x509",
    "sha256", "sha512", "sha1", "sha224", "sha384", "md5", "aes", "chacha20", "des", "3des",
    "gpg", "pgp", "gnupg", "keyring", "bitwarden", "1password", "keepass", "vault", "kms", "hsm", "yubikey",
    "totp", "hotp", "2fa", "mfa", "otp", "rbac", "abac", "pam", "sudoers", "selinux", "apparmor",
    "cve", "nvd", "zeroday", "exploit", "vulnerability", "pentest", "firewall",
    "vpn", "wireguard", "openvpn", "tailscale", "zerotier", "headscale", "cfssl", "stepca",
    "auth", "oauth", "oauth2", "oidc", "saml", "sso", "jwt", "uuid", "guid", "token", "tokens",
    "apikey", "secret", "secrets", "passphrase", "credential", "credentials",

    # 4. Networking & Web Protocols (计算机网络与通信协议)
    "http", "https", "http2", "http3", "quic", "websocket", "ws", "wss", "grpc", "protobuf",
    "rest", "restful", "graphql", "soap", "rpc", "jsonrpc", "webhook", "webhooks",
    "tcp", "udp", "sctp", "icmp", "arp", "rarp", "dhcp", "dns", "dnssec", "doh", "dot",
    "bgp", "ospf", "mpls", "vxlan", "vlan", "nat", "pat", "snat", "dnat", "cidr", "ipv4", "ipv6",
    "localhost", "loopback", "gateway", "proxy", "reverseproxy", "forwardproxy", "socks5", "socks4",
    "cors", "csp", "hsts", "sni", "mtls", "alpn", "socket", "sockets", "port", "ports",
    "ip", "mac", "uri", "url", "urn", "query", "payload", "header", "headers", "cookie", "cookies",
    "session", "sessions", "hostname", "domain", "subdomain",

    # 5. Programming Languages, Runtimes & Frameworks (编程语言、运行环境与核心框架)
    # Python ecosystem
    "python", "python3", "py", "pip", "pip3", "pipx", "venv", "pyenv", "pycache", "poetry", "pdm", "hatch",
    "conda", "miniconda", "anaconda", "ruff", "black", "flake8", "mypy", "pytest", "unittest",
    "pydantic", "django", "fastapi", "flask", "tornado", "aiohttp", "starlette",
    "numpy", "pandas", "scipy", "scikitlearn", "sklearn", "matplotlib", "seaborn", "polars",
    "pytorch", "torch", "torchvision", "torchaudio", "tensorflow", "keras", "jax", "flax",
    # JavaScript / TypeScript ecosystem
    "javascript", "typescript", "js", "ts", "mjs", "cjs", "jsx", "tsx",
    "nodejs", "node", "npm", "npx", "pnpm", "yarn", "bun", "deno",
    "vite", "vitest", "webpack", "rollup", "esbuild", "swc", "turbopack", "turborepo", "babel",
    "react", "reactdom", "nextjs", "next", "vue", "vuex", "pinia", "nuxt", "nuxtjs",
    "svelte", "sveltekit", "astro", "solidjs", "solid", "angular", "remix",
    "express", "koa", "fastify", "nestjs", "nest", "hono", "elysia", "trpc", "socketio",
    "tailwind", "tailwindcss", "unocss", "postcss", "sass", "scss", "less", "cssmodules",
    "styledcomponents", "emotion", "shadcn", "radixui", "headlessui", "chakraui", "materialui", "antdesign",
    "lucide", "heroicons", "fontawsome",
    "prettier", "eslint", "biome", "stylelint", "playwright", "cypress", "jest", "mocha", "chai", "puppeteer", "storybook",
    # Rust ecosystem
    "rust", "cargo", "rustc", "rustup", "clippy", "rustfmt", "tokio", "asyncstd", "serde", "axum", "actix", "actixweb",
    "rayon", "anyhow", "thiserror", "tracing", "clap", "reqwest", "hyper", "tonic", "diesel", "sqlx", "seaorm",
    # Go ecosystem
    "golang", "go", "goroutine", "goroutines", "channel", "channels", "gin", "fiber", "echo", "chi", "gorm", "cobra", "viper",
    # Systems, Native, Mobile & Others
    "cplusplus", "cpp", "clang", "clangd", "gcc", "gpp", "gdb", "lldb", "cmake", "ninja", "makefile", "make",
    "csharp", "dotnet", "nuget", "roslyn",
    "java", "jvm", "jdk", "jre", "maven", "gradle", "spring", "springboot", "quarkus", "micronaut",
    "kotlin", "scala", "clojure", "groovy",
    "elixir", "phoenix", "erlang", "beam", "haskell", "ocaml", "zig", "mojo", "lua", "luajit",
    "ruby", "rails", "gem", "bundler", "rake",
    "php", "composer", "laravel", "symfony",
    "swift", "swiftui", "cocoapods", "spm", "xcode",
    "dart", "flutter", "electron", "tauri", "wails",

    # 6. Databases, Caches & Storage (数据库、缓存与搜索引擎)
    "mysql", "mariadb", "postgres", "postgresql", "psql", "sqlite", "sqlite3", "duckdb", "clickhouse",
    "mongodb", "mongo", "mongod", "mongosh", "mongoose",
    "redis", "redissli", "valkey", "memcached", "dragonfly",
    "cassandra", "scylladb", "couchdb", "neo4j", "arangodb",
    "milvus", "qdrant", "weaviate", "chroma", "pinecone", "pgvector",
    "elasticsearch", "opensearch", "meilisearch", "typesense", "solr",
    "kafka", "rabbitmq", "nats", "pulsar", "zeromq", "celery", "bullmq", "sidekiq",
    "prisma", "drizzle", "typeorm", "sequelize", "sqlalchemy", "alembic", "liquibase", "flyway",

    # 7. DevOps, Cloud Native, Containers & CI/CD (DevOps、容器与云原生编排)
    "docker", "dockerfile", "dockercompose", "compose", "podman", "buildah", "skopeo", "containerd", "crio", "runc",
    "kubernetes", "k8s", "kubectl", "kubeadm", "kubelet", "kubeproxy", "k9s", "k3s", "k0s", "minikube", "kind",
    "helm", "helmfile", "kustomize", "argocd", "fluxcd", "tekton", "drone", "jenkins",
    "githubactions", "gitlabci", "circleci", "travisci", "buildkite",
    "terraform", "opentofu", "terragrunt", "pulumi", "ansible", "packer", "vagrant", "cloudinit",
    "promql", "prometheus", "grafana", "loki", "tempo", "victoriametrics", "thanos", "cortex",
    "jaeger", "opentelemetry", "otel", "fluentd", "fluentbit", "logstash", "datadog", "sentry", "newrelic", "dynatrace",
    "traefik", "nginx", "caddy", "envoy", "haproxy", "istio", "linkerd", "cilium",

    # 8. AWS Cloud Infrastructure & Services (AWS 云计算平台全家桶)
    "AWS", "aws", "awscli", "boto3", "awssdk", "amazon", "LocalStack", "localstack",
    "EC2", "ec2", "Lambda", "lambda", "ECS", "ecs", "EKS", "eks", "Fargate", "fargate",
    "ECR", "ecr", "Batch", "batch", "Lightsail", "lightsail", "AppRunner", "apprunner",
    "ElasticBeanstalk", "elasticbeanstalk", "Outposts", "outposts", "Wavelength", "wavelength",
    "AMI", "ami", "AMIs", "amis", "Graviton", "graviton", "Nitro", "nitro",
    "AutoScaling", "autoscaling", "autoscale", "LaunchTemplate", "launchtemplate", "LaunchConfig", "launchconfig",
    "SpotInstance", "spotinstance", "ReservedInstance", "reservedinstance", "OnDemand", "ondemand",
    "S3", "s3", "EBS", "ebs", "EFS", "efs", "FSx", "fsx", "Glacier", "glacier", "StorageGateway", "storagegateway",
    "Snowball", "snowball", "Snowmobile", "snowmobile", "AWSBackup", "awsbackup",
    "bucket", "buckets", "ObjectLock", "objectlock", "LifecycleRule", "lifecyclerule",
    "VPC", "vpc", "Subnet", "subnet", "Subnets", "subnets", "Route53", "route53",
    "CloudFront", "cloudfront", "APIGateway", "apigateway",
    "ALB", "alb", "NLB", "nlb", "ELB", "elb", "ELBv2", "elbv2", "TargetGroup", "targetgroup", "targetgroups",
    "DirectConnect", "directconnect", "TransitGateway", "transitgateway", "TGW", "tgw",
    "NATGateway", "natgateway", "InternetGateway", "internetgateway", "IGW", "igw", "EgressOnlyIGW",
    "PrivateLink", "privatelink", "VPCEndpoint", "vpcendpoint", "VPCEndpoints", "vpcendpoints", "VPCE", "vpce",
    "SecurityGroup", "securitygroup", "SecurityGroups", "securitygroups",
    "NACL", "nacl", "NACLs", "nacls", "VPCPeering", "vpcpeering", "RouteTable", "routetable", "routetables",
    "GlobalAccelerator", "globalaccelerator", "CloudMap", "cloudmap",
    "RDS", "rds", "Aurora", "aurora", "DynamoDB", "dynamodb", "ElastiCache", "elasticache",
    "DocumentDB", "documentdb", "Neptune", "neptune", "Timestream", "timestream", "Redshift", "redshift",
    "Keyspaces", "keyspaces", "MemoryDB", "memorydb", "DAX", "dax", "DMS", "dms",
    "Athena", "athena", "Glue", "glue", "EMR", "emr", "Kinesis", "kinesis", "Firehose", "firehose",
    "QuickSight", "quicksight", "LakeFormation", "lakeformation", "OpenSearch", "opensearch", "Elasticsearch", "elasticsearch",
    "MSK", "msk", "Kafka", "kafka", "AmazonMQ", "amazonmq", "AppSync", "appsync",
    "IAM", "iam", "STS", "sts", "Cognito", "cognito", "KMS", "kms", "SecretsManager", "secretsmanager",
    "GuardDuty", "guardduty", "Inspector", "inspector", "Macie", "macie", "SecurityHub", "securityhub",
    "WAF", "waf", "WAFv2", "wafv2", "Shield", "shield", "ACM", "acm", "CertificateManager", "certificatemanager",
    "IAMIdentityCenter", "SingleSignOn", "SSO", "sso", "Artifact", "artifact", "Signer", "signer",
    "ARN", "arn", "ARNs", "arns", "Principal", "principal", "AssumeRole", "assumerole", "assume_role",
    "IAMRole", "iamrole", "IAMPolicy", "iampolicy", "IAMUser", "iamuser", "IAMGroup", "iamgroup",
    "SCP", "scps", "ServiceControlPolicy", "PermissionBoundary", "permissionboundary", "SessionPolicy",
    "CloudWatch", "cloudwatch", "CloudTrail", "cloudtrail", "CloudFormation", "cloudformation", "CFn", "cfn",
    "CDK", "cdk", "AWSCDK", "awscdk", "SAM", "sam", "Serverless", "serverless",
    "Terraform", "terraform", "Terragrunt", "terragrunt", "HCL", "hcl",
    "AWSConfig", "awsconfig", "SystemsManager", "systemsmanager", "SSM", "ssm", "ParameterStore", "parameterstore", "SessionManager", "sessionmanager",
    "EventBridge", "eventbridge", "SNS", "sns", "SQS", "sqs", "StepFunctions", "stepfunctions", "SFN", "sfn",
    "XRay", "xray", "AppMesh", "appmesh", "ServiceCatalog", "servicecatalog", "ControlTower", "controltower", "Organizations", "organizations",
    "CostExplorer", "costexplorer", "Budgets", "budgets", "TrustedAdvisor", "trustedadvisor",
    "SageMaker", "sagemaker", "Bedrock", "bedrock", "QDeveloper", "qdeveloper", "CodeWhisperer", "codewhisperer",
    "Textract", "textract", "Rekognition", "rekognition", "Polly", "polly", "Transcribe", "transcribe",
    "Comprehend", "comprehend", "Translate", "translate", "Kendra", "kendra", "Titan", "titan",
    "CodeCommit", "codecommit", "CodeBuild", "codebuild", "CodeDeploy", "codedeploy", "CodePipeline", "codepipeline",
    "CodeArtifact", "codeartifact", "Amplify", "amplify", "AppConfig", "appconfig",
    "gcp", "gcloud", "bigquery", "gke", "cloudrun", "cloudstorage", "azure", "az", "aks", "cosmosdb",
    "cloudflare", "vercel", "netlify", "flyio", "render", "railway", "heroku",

    # 9. AI, LLM, Agentic & Machine Learning (人工智能、大模型与智能体工程)
    "openai", "anthropic", "deepmind", "gemini", "claude", "chatgpt", "copilot", "cursor", "windsurf",
    "antigravity", "agy", "codex", "qwen", "deepseek", "llama", "mistral", "gemma", "phi",
    "groq", "cerebras", "huggingface", "hf", "transformers", "diffusers", "accelerate", "deepspeed",
    "vllm", "sglang", "ollama", "tgi", "langchain", "llamaindex", "autogen", "crewai", "dspy",
    "instructor", "outlines", "onnx", "onnxruntime", "tensorrt", "openvino",
    "cuda", "cudnn", "nccl", "rocm", "triton", "flashattention", "flash-attention",
    "lora", "qlora", "dora", "peft", "bitsandbytes", "bnb", "gguf", "ggml", "awq", "gptq", "exl2",
    "rag", "rlhf", "rlaif", "dpo", "kto", "orpo", "sft", "cot", "tot",
    "agent", "agents", "subagent", "subagents", "agentic", "mcp", "modelcontextprotocol",
    "embedding", "embeddings", "vector", "vectors", "vectorstore", "token", "tokens", "tokenizer", "tokenizers",
    "tiktoken", "sentencepiece", "prompt", "prompts", "prompting", "finetune", "finetuning",
    "multimodal", "benchmark", "benchmarks", "eval", "evals", "dataset", "datasets",

    # 10. File Formats, Data Types & Variables (数据格式、常见变量名与编程关键字)
    "yaml", "yml", "json", "jsonl", "toml", "xml", "html", "css", "scss", "sass", "less",
    "wasm", "dylib", "so", "dll", "exe", "app", "dmg", "pkg", "deb", "rpm", "apk",
    "tar", "gz", "tgz", "zip", "rar", "7z", "iso", "bin", "md", "markdown", "sql", "sqlite", "db",
    "csv", "tsv", "parquet", "avro", "protobuf", "proto",
    "async", "await", "promise", "promises", "callback", "callbacks", "closure", "closures",
    "iterator", "iterators", "generator", "generators", "yield",
    "const", "let", "var", "def", "fn", "func", "function", "functions",
    "return", "throw", "catch", "try", "finally", "exception", "exceptions", "assert",
    "null", "nil", "undefined", "none", "true", "false",
    "bool", "boolean", "int", "integer", "float", "double", "str", "string", "strings",
    "char", "byte", "bytes", "array", "arrays", "list", "lists", "dict", "dicts", "dictionary",
    "map", "maps", "set", "sets", "tuple", "tuples", "struct", "structs", "class", "classes",
    "interface", "interfaces", "enum", "enums", "union", "unions", "pointer", "pointers", "ptr",
    "ref", "mutex", "rwlock", "semaphore", "channel", "channels", "worker", "workers",
    "args", "kwargs", "params", "param", "props", "prop", "configs", "config", "options", "option",
    "settings", "setting", "utils", "util", "helpers", "helper", "handlers", "handler",
    "controllers", "controller", "services", "service", "models", "model", "views", "view",
    "middlewares", "middleware", "schemas", "schema", "metadata", "timestamp", "timestamps",
    "regex", "regexp", "buffer", "buffers", "stream", "streams", "payload", "payloads",
    "logger", "logging", "debug", "info", "warn", "warning", "error", "errors", "fatal", "trace",
    "stdout", "stderr", "stdin", "status", "success", "failed", "pending", "running",
    "backend", "frontend", "fullstack", "devops", "agile", "scrum", "sprint",
    "roadmap", "backlog", "milestone", "refactor", "deprecated", "legacy", "migration", "migrations",
    "rollback", "deploy", "deployment", "deployments", "staging", "production", "prod", "dev",
    "test", "tests", "testing", "ci", "cd", "coverage", "lint", "linter", "formatter",
]


def build():
    lines = [
        "# Rime dictionary",
        "# encoding: utf-8",
        "#",
        "# User-maintained supplemental English vocabulary for easy_en.",
        "# AWS Cloud, Cloud Native, DevOps, AI, Linux, Git & Modern Developer Terms.",
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

    # 权重基准：核心开发与 AWS 专属词汇统一 3,000,000，保持高优先级
    for word in DEV_WORDS:
        word = word.strip()
        if not word:
            continue
        code = word.lower().replace("-", "").replace("_", "")
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

    # 按代码和文本排序
    for text, code, weight in sorted(entries, key=lambda x: (x[1], x[0])):
        lines.append(f"{text}\t{code}\t{weight}")

    TARGET_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"✓ Successfully generated {len(entries)} AWS & developer entries in {TARGET_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
