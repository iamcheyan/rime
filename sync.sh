#!/bin/bash
# chmod +x 脚本名称，给于运行权限

bash ~/.dotfiles/config/rime/update.sh

echo "Rime detected, syncing..."
cd ~/.dotfiles/config/rime
rime_dict_manager -s
rime_deployer --build
echo "Rime sync completed"

PRIVATE_SYNC="$HOME/.dotfiles/private/scripts/utils/sync_windows.sh"
if [ -x "$PRIVATE_SYNC" ]; then
    bash "$PRIVATE_SYNC"
else
    echo "⚠️  Private sync script not found: $PRIVATE_SYNC"
fi
