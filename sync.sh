#!/bin/bash
# chmod +x 脚本名称，给于运行权限

bash ~/.dotfiles/config/rime/update.sh

echo "检测到 rime，正在同步..."
cd ~/.dotfiles/config/rime
rime_dict_manager -s
rime_deployer --build
echo "rime 同步完成"

bash ~/.dotfiles/Scripts/sync_windows.sh
