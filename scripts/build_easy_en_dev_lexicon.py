#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_easy_en_dev_lexicon.py — 现代开发者、编程语言、Linux/Git、AI/LLM、AWS 云原生技术专属词库构建脚本
生成/更新: sbzr.chrome.extension/dicts.en/easy_en.extra.dict.yaml
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET_FILE = ROOT / "sbzr.chrome.extension" / "dicts.en" / "easy_en.extra.dict.yaml"

DEV_WORDS = [
    # 1. AWS Cloud & Cloud Native Infrastructure (AWS 云计算与云原生)
    "AWS", "aws", "awscli", "boto3", "awssdk", "amazon", "LocalStack", "localstack",
    # AWS Compute & Containers
    "EC2", "ec2", "Lambda", "lambda", "ECS", "ecs", "EKS", "eks", "Fargate", "fargate",
    "ECR", "ecr", "Batch", "batch", "Lightsail", "lightsail", "AppRunner", "apprunner",
    "ElasticBeanstalk", "elasticbeanstalk", "Outposts", "outposts", "Wavelength", "wavelength",
    "AMI", "ami", "AMIs", "amis", "Graviton", "graviton", "Nitro", "nitro",
    "AutoScaling", "autoscaling", "autoscale", "LaunchTemplate", "launchtemplate", "LaunchConfig", "launchconfig",
    "SpotInstance", "spotinstance", "ReservedInstance", "reservedinstance", "OnDemand", "ondemand",
    # AWS Storage
    "S3", "s3", "EBS", "ebs", "EFS", "efs", "FSx", "fsx", "Glacier", "glacier", "StorageGateway", "storagegateway",
    "Snowball", "snowball", "Snowmobile", "snowmobile", "AWSBackup", "awsbackup",
    "bucket", "buckets", "ObjectLock", "objectlock", "LifecycleRule", "lifecyclerule",
    # AWS Networking & Content Delivery
    "VPC", "vpc", "Subnet", "subnet", "Subnets", "subnets", "Route53", "route53",
    "CloudFront", "cloudfront", "APIGateway", "apigateway",
    "ALB", "alb", "NLB", "nlb", "ELB", "elb", "ELBv2", "elbv2", "TargetGroup", "targetgroup", "targetgroups",
    "DirectConnect", "directconnect", "TransitGateway", "transitgateway", "TGW", "tgw",
    "NATGateway", "natgateway", "InternetGateway", "internetgateway", "IGW", "igw", "EgressOnlyIGW",
    "PrivateLink", "privatelink", "VPCEndpoint", "vpcendpoint", "VPCEndpoints", "vpcendpoints", "VPCE", "vpce",
    "SecurityGroup", "securitygroup", "SecurityGroups", "securitygroups",
    "NACL", "nacl", "NACLs", "nacls", "VPCPeering", "vpcpeering", "RouteTable", "routetable", "routetables",
    "GlobalAccelerator", "globalaccelerator", "CloudMap", "cloudmap",
    # AWS Database, Cache & Analytics
    "RDS", "rds", "Aurora", "aurora", "DynamoDB", "dynamodb", "ElastiCache", "elasticache",
    "DocumentDB", "documentdb", "Neptune", "neptune", "Timestream", "timestream", "Redshift", "redshift",
    "Keyspaces", "keyspaces", "MemoryDB", "memorydb", "DAX", "dax", "DMS", "dms",
    "Athena", "athena", "Glue", "glue", "EMR", "emr", "Kinesis", "kinesis", "Firehose", "firehose",
    "QuickSight", "quicksight", "LakeFormation", "lakeformation", "OpenSearch", "opensearch", "Elasticsearch", "elasticsearch",
    "MSK", "msk", "Kafka", "kafka", "AmazonMQ", "amazonmq", "AppSync", "appsync",
    # AWS Security, Identity & Governance
    "IAM", "iam", "STS", "sts", "Cognito", "cognito", "KMS", "kms", "SecretsManager", "secretsmanager",
    "GuardDuty", "guardduty", "Inspector", "inspector", "Macie", "macie", "SecurityHub", "securityhub",
    "WAF", "waf", "WAFv2", "wafv2", "Shield", "shield", "ACM", "acm", "CertificateManager", "certificatemanager",
    "IAMIdentityCenter", "SingleSignOn", "SSO", "sso", "Artifact", "artifact", "Signer", "signer",
    "ARN", "arn", "ARNs", "arns", "Principal", "principal", "AssumeRole", "assumerole", "assume_role",
    "IAMRole", "iamrole", "IAMPolicy", "iampolicy", "IAMUser", "iamuser", "IAMGroup", "iamgroup",
    "SCP", "scps", "ServiceControlPolicy", "PermissionBoundary", "permissionboundary", "SessionPolicy",
    # AWS Management & Observability & IaC
    "CloudWatch", "cloudwatch", "CloudTrail", "cloudtrail", "CloudFormation", "cloudformation", "CFn", "cfn",
    "CDK", "cdk", "AWSCDK", "awscdk", "SAM", "sam", "Serverless", "serverless",
    "Terraform", "terraform", "Terragrunt", "terragrunt", "HCL", "hcl",
    "AWSConfig", "awsconfig", "SystemsManager", "systemsmanager", "SSM", "ssm", "ParameterStore", "parameterstore", "SessionManager", "sessionmanager",
    "EventBridge", "eventbridge", "SNS", "sns", "SQS", "sqs", "StepFunctions", "stepfunctions", "SFN", "sfn",
    "XRay", "xray", "AppMesh", "appmesh", "ServiceCatalog", "servicecatalog", "ControlTower", "controltower", "Organizations", "organizations",
    "CostExplorer", "costexplorer", "Budgets", "budgets", "TrustedAdvisor", "trustedadvisor",
    # AWS AI & ML
    "SageMaker", "sagemaker", "Bedrock", "bedrock", "QDeveloper", "qdeveloper", "CodeWhisperer", "codewhisperer",
    "Textract", "textract", "Rekognition", "rekognition", "Polly", "polly", "Transcribe", "transcribe",
    "Comprehend", "comprehend", "Translate", "translate", "Kendra", "kendra", "Titan", "titan",
    # AWS CI/CD & Developer Tools
    "CodeCommit", "codecommit", "CodeBuild", "codebuild", "CodeDeploy", "codedeploy", "CodePipeline", "codepipeline",
    "CodeArtifact", "codeartifact", "Amplify", "amplify", "AppConfig", "appconfig",
    # AWS Regions & Common Env Vars
    "us-east-1", "us-east-2", "us-west-1", "us-west-2",
    "ap-northeast-1", "ap-northeast-2", "ap-northeast-3", "ap-southeast-1", "ap-southeast-2",
    "eu-west-1", "eu-central-1", "sa-east-1",
    "aws_access_key_id", "aws_secret_access_key", "aws_session_token", "aws_region", "aws_profile",
    "AWS_REGION", "AWS_DEFAULT_REGION", "AWS_PROFILE",

    # 2. AI & LLM & Modern Tech
    "ChatGPT", "chatgpt", "OpenAI", "openai", "Anthropic", "anthropic", "Claude", "claude",
    "DeepMind", "deepmind", "Gemini", "gemini", "Antigravity", "antigravity", "Copilot", "copilot",
    "Cursor", "cursor", "Nova", "nova", "Gemma", "gemma", "Llama", "llama", "Mistral", "mistral",
    "Whisper", "whisper", "vLLM", "vllm", "Ollama", "ollama", "LangChain", "langchain", "LlamaIndex", "llamaindex",
    "prompt", "prompts", "prompting", "subagent", "subagents", "workflow", "workflows",
    "pipeline", "pipelines", "toolchain", "toolchains", "benchmark", "benchmarks", "token", "tokens",
    "tokenizer", "tokenizers", "tokenization", "embedding", "embeddings", "dataset", "datasets",
    "finetune", "finetuning", "lora", "qlora", "rag", "evals", "eval", "multimodal",

    # 3. Linux, Shell, Terminal, Chezmoi, Git & Dotfiles
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

    # 4. File Extensions & Data Formats
    "yaml", "yml", "json", "toml", "jsonl", "xml", "html", "css", "scss", "sass", "less",
    "wasm", "dylib", "so", "dll", "exe", "app", "dmg", "pkg", "deb", "rpm", "apk",
    "tar", "gz", "tgz", "zip", "rar", "7z", "iso", "bin", "md", "markdown", "sql", "sqlite", "db",

    # 5. Programming Languages & Runtimes
    "python", "python3", "py", "pip", "pip3", "venv", "pyenv", "pycache", "pytest", "mypy", "ruff", "uv",
    "pydantic", "django", "fastapi", "flask", "numpy", "pandas", "pytorch", "torch", "tensorflow",
    "javascript", "typescript", "ts", "js", "mjs", "cjs", "jsx", "tsx", "nodejs", "node",
    "npm", "pnpm", "yarn", "bun", "deno", "vite", "webpack", "rollup", "turbopack", "turborepo",
    "react", "vue", "svelte", "solid", "nextjs", "nuxt", "astro", "tailwind", "tailwindcss", "postcss",
    "prettier", "eslint", "biome",
    "rust", "cargo", "rustc", "rustup", "tokio", "serde", "axum", "actix",
    "golang", "go", "goroutine", "gin", "gorm", "cplusplus", "cpp", "clang", "gcc", "cmake", "ninja",
    "swift", "swiftui", "kotlin", "java", "jvm", "scala", "dart", "flutter", "electron", "tauri",

    # 6. Databases, Cloud & Infrastructure
    "mysql", "mariadb", "postgres", "postgresql", "sqlite", "sqlite3", "mongodb", "mongo",
    "redis", "memcached", "clickhouse", "prisma", "drizzle", "typeorm", "supabase", "firebase",
    "docker", "dockerfile", "docker-compose", "compose", "podman", "containerd",
    "k8s", "kubernetes", "kubectl", "k9s", "helm", "minikube", "kind",
    "nginx", "caddy", "apache", "traefik", "envoy", "cloudflare", "gcp", "azure",
    "vercel", "netlify", "flyio", "render", "railway", "heroku", "datadog", "sentry", "grafana", "prometheus",

    # 7. Common Programming Variables, Names, Arguments & Plurals
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

    # 8. Collaboration, SaaS & Dev Platforms
    "github", "gitlab", "bitbucket", "jira", "confluence", "notion", "slack", "discord",
    "telegram", "zoom", "linear", "figma", "sketch", "canva", "miro", "trello", "asana"
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
