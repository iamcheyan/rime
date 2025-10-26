#!/bin/bash
# Rime jaroomaji 词库更新脚本
# 从 GitHub 仓库更新 jaroomaji 相关词库文件

set -e

# 配置变量
RIME_DIR="$HOME/.dotfiles/config/org.fcitx.Fcitx5/data/fcitx5/rime"
GITHUB_REPO="https://github.com/lazyfoxchan/rime-jaroomaji"
USER_CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}"
TEMP_DIR="$USER_CACHE_DIR/rime-jaroomaji-update"
LOG_FILE="$RIME_DIR/update_jarooma.log"

# 需要更新的文件列表
FILES_TO_UPDATE=(
    "jaroomaji.jmdict.dict.yaml"       # 主词库（来自 JMdict）
    "jaroomaji.kana_kigou.dict.yaml"   # かな与符号词库
    "jaroomaji.mozc.dict.yaml"         # mozc 词库（常用词/短语）
    "jaroomaji.mozcemoji.dict.yaml"    # Emoji 词库
    "jaroomaji.kanjidic2.dict.yaml"    # 漢字字典（Kanjidic2）
    "jaroomaji.schema.yaml"            # 配置文件 schema（定义输入法行为）
)

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 检查目录是否存在
check_directories() {
    if [ ! -d "$RIME_DIR" ]; then
        log "错误: Rime 配置目录不存在: $RIME_DIR"
        exit 1
    fi
    
    if [ ! -d "$TEMP_DIR" ]; then
        mkdir -p "$TEMP_DIR"
        log "创建临时目录: $TEMP_DIR"
    fi
}

# 下载最新文件
download_files() {
    log "开始从 GitHub 下载最新文件..."
    
    # 克隆或更新仓库
    if [ -d "$TEMP_DIR/.git" ]; then
        cd "$TEMP_DIR"
        git pull origin master
        log "更新本地仓库"
    else
        git clone "$GITHUB_REPO.git" "$TEMP_DIR"
        log "克隆仓库到: $TEMP_DIR"
    fi
    
    # 复制文件到 Rime 目录
    for file in "${FILES_TO_UPDATE[@]}"; do
        if [ -f "$TEMP_DIR/$file" ]; then
            cp "$TEMP_DIR/$file" "$RIME_DIR/"
            log "更新文件: $file"
        else
            log "警告: 文件不存在: $file"
        fi
    done
}

# 清理临时文件
cleanup() {
    if [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
        log "清理临时目录"
    fi
}

# 主函数
main() {
    log "开始更新 jaroomaji 词库..."
    
    check_directories
    download_files
    cleanup
    
    log "词库更新完成！"
    log "=========================================="
}

# 错误处理
trap cleanup EXIT

# 运行主函数
main "$@"
