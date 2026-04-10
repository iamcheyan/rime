#!/usr/bin/env python3
import os
import sys

# 动态获取脚本所在目录，确保在任何地方运行都能定位到词典
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# 词典目录相对于脚本的位置是 ../sbzr.chrome.extension/dicts
DICTS_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "sbzr.chrome.extension", "dicts"))

# 权重设置
CHAR_WEIGHT = 50000    # 单字基础权重
PHRASE_WEIGHT = 1000   # 词组基础权重

def reweight_line(line):
    stripped = line.strip()
    if not stripped or line.startswith('#'):
        return line
    if line.startswith('---') or line.startswith('...') or line.startswith('name:') or line.startswith('version:'):
        return line

    parts = line.split('\t')
    if len(parts) < 2:
        return line
    
    text = parts[0]
    code = parts[1].strip()
    
    original_weight = 0
    if len(parts) >= 3:
        try:
            original_weight = int(parts[2].strip())
        except ValueError:
            pass

    word_len = len(text)
    if word_len == 1:
        new_weight = CHAR_WEIGHT + (original_weight % 1000)
    else:
        new_weight = PHRASE_WEIGHT + (original_weight % 1000)
    
    return f"{text}\t{code}\t{new_weight}\n"

def process_file(file_path):
    print(f"正在处理: {file_path}")
    lines = []
    is_body = False
    
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('...'):
                is_body = True
                lines.append(line)
                continue
            if is_body:
                lines.append(reweight_line(line))
            else:
                lines.append(line)
                
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)

def main():
    if not os.path.exists(DICTS_DIR):
        print(f"错误: 找不到词典目录 {DICTS_DIR}")
        return

    print(f"词典根目录: {DICTS_DIR}")
    for root, dirs, files in os.walk(DICTS_DIR):
        for file in files:
            if file.endswith('.dict.yaml'):
                process_file(os.path.join(root, file))
    
    print("\n✓ 权重调整完成。请在 Rime 中重新部署配置。")

if __name__ == "__main__":
    main()
