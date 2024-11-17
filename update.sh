#!/bin/bash
# chmod +x 脚本名称，给于运行权限

# 获取当前脚本所在目录的绝对路径
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检查 rime-jaroomaji 仓库是否存在
if [ ! -d "$script_dir/rime-jaroomaji" ]; then
    echo "rime-jaroomaji 目录不存在，正在创建并克隆仓库..."
    mkdir -p "$script_dir/rime-jaroomaji"
    git clone https://github.com/lazyfoxchan/rime-jaroomaji.git "$script_dir/rime-jaroomaji"
    if [ $? -eq 0 ]; then
        echo "rime-jaroomaji 仓库克隆成功"
    else
        echo "rime-jaroomaji 仓库克隆失败，请检查网络连接或仓库地址"
        exit 1
    fi
else
    # 检查 rime-jaroomaji 仓库是否有更新
    echo "正在检查 rime-jaroomaji 仓库是否有更新..."
    git -C "$script_dir/rime-jaroomaji" fetch origin
    local_commit=$(git -C "$script_dir/rime-jaroomaji" rev-parse HEAD)
    remote_commit=$(git -C "$script_dir/rime-jaroomaji" rev-parse @{u})

    if [ "$local_commit" != "$remote_commit" ]; then
        echo "检测到 rime-jaroomaji 仓库有更新，正在更新..."
        # 先查看远程分支
        remote_branches=$(git -C "$script_dir/rime-jaroomaji" branch -r)
        if echo "$remote_branches" | grep -q "origin/master"; then
            git -C "$script_dir/rime-jaroomaji" fetch origin
            git -C "$script_dir/rime-jaroomaji" reset --hard origin/master
            git -C "$script_dir/rime-jaroomaji" clean -fd
        elif echo "$remote_branches" | grep -q "origin/main"; then
            git -C "$script_dir/rime-jaroomaji" fetch origin
            git -C "$script_dir/rime-jaroomaji" reset --hard origin/main
            git -C "$script_dir/rime-jaroomaji" clean -fd
        else
            echo "无法确定远程主分支，请手动检查仓库状态"
            exit 1
        fi

        # 检查更新是否成功
        if [ $? -eq 0 ]; then
            echo "rime-jaroomaji 仓库更新成功"

            # 复制 rime-jaroomaji 文件到当前目录
            echo "正在复制 rime-jaroomaji 文件..."
            
            jaroomaji_dir="$script_dir/rime-jaroomaji"
            
            files_to_copy=(
                "dict_tools"
                "jaroomaji.*.yaml"
            )
            
            for item in "${files_to_copy[@]}"; do
                if [ "$item" = "dict_tools" ]; then
                    src="$jaroomaji_dir/$item"
                    dest="$script_dir/jaroomaji.dict.tools"
                    if [ -d "$src" ]; then
                        rm -rf "$dest"
                        cp -r "$src" "$dest"
                        echo "已更新文件夹: $src -> $dest"
                    else
                        echo "警告: $src 不是一个文件夹"
                    fi
                else
                    for file in "$jaroomaji_dir"/$item; do
                        filename=$(basename "$file")
                        cp -f "$file" "$script_dir/$filename"
                        echo "已更新文件: $file -> $script_dir/$filename"
                    done
                fi
            done
            
            echo "rime-jaroomaji 文件复制完成"
        else
            echo "rime-jaroomaji 仓库更新失败，请检查网络连接或仓库状态"
            exit 1
        fi
    else
        echo "rime-jaroomaji 仓库已是最新版本，无需更新"
    fi
fi
