#!/bin/bash
# Rime jaroomaji 辞書更新スクリプト
# GitHub リポジトリから jaroomaji 関連辞書ファイルを更新

set -e

# 設定変数
RIME_DIR="$HOME/.dotfiles/config/org.fcitx.Fcitx5/data/fcitx5/rime"
GITHUB_REPO="https://github.com/lazyfoxchan/rime-jaroomaji"
USER_CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}"
TEMP_DIR="$USER_CACHE_DIR/rime-jaroomaji-update"
LOG_FILE="$RIME_DIR/update_jarooma.log"

# 更新が必要なファイルリスト
FILES_TO_UPDATE=(
    "jaroomaji.jmdict.dict.yaml"       # メイン辞書（JMdict から）
    "jaroomaji.kana_kigou.dict.yaml"   # かなと記号辞書
    "jaroomaji.mozc.dict.yaml"         # mozc 辞書（常用語/フレーズ）
    "jaroomaji.mozcemoji.dict.yaml"    # Emoji 辞書
    "jaroomaji.kanjidic2.dict.yaml"    # 漢字辞書（Kanjidic2）
    "jaroomaji.schema.yaml"            # 設定ファイル schema（入力法の動作を定義）
)

# ログ関数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ディレクトリの存在確認
check_directories() {
    if [ ! -d "$RIME_DIR" ]; then
        log "エラー: Rime 設定ディレクトリが存在しません: $RIME_DIR"
        exit 1
    fi
    
    if [ ! -d "$TEMP_DIR" ]; then
        mkdir -p "$TEMP_DIR"
        log "一時ディレクトリを作成: $TEMP_DIR"
    fi
}

# 最新ファイルのダウンロード
download_files() {
    log "GitHub から最新ファイルのダウンロードを開始..."
    
    # リポジトリのクローンまたは更新
    if [ -d "$TEMP_DIR/.git" ]; then
        cd "$TEMP_DIR"
        git pull origin master
        log "ローカルリポジトリを更新"
    else
        git clone "$GITHUB_REPO.git" "$TEMP_DIR"
        log "リポジトリをクローン: $TEMP_DIR"
    fi
    
    # ファイルを Rime ディレクトリにコピー
    for file in "${FILES_TO_UPDATE[@]}"; do
        if [ -f "$TEMP_DIR/$file" ]; then
            cp "$TEMP_DIR/$file" "$RIME_DIR/"
            log "ファイルを更新: $file"
        else
            log "警告: ファイルが存在しません: $file"
        fi
    done
}

# 一時ファイルのクリーンアップ
cleanup() {
    if [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
        log "一時ディレクトリをクリーンアップ"
    fi
}

# メイン関数
main() {
    log "jaroomaji 辞書の更新を開始..."
    
    check_directories
    download_files
    cleanup
    
    log "辞書更新完了！"
    log "=========================================="
}

# エラーハンドリング
trap cleanup EXIT

# メイン関数の実行
main "$@"
