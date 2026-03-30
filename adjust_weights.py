#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
调整 sbzr.len1.dict.yaml 的权重，使候选按编码第3/4位的 aeuio 顺序排列
"""

import sys

# 权重偏移量：让 a 的权重最大，o 的权重最小
# Rime 按权重从大到小排序，所以 a 要加最多
WEIGHT_OFFSET = {
    'a': 1000000,
    'e': 800000,
    'u': 600000,
    'i': 400000,
    'o': 200000
}

def process_dict_file(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    in_data_section = False
    processed_lines = []
    count = 0
    
    for line in lines:
        # 检查是否进入数据区
        if line.strip() == '...':
            in_data_section = True
            processed_lines.append(line)
            continue
        
        # 如果不在数据区，直接保留
        if not in_data_section:
            processed_lines.append(line)
            continue
        
        # 解析数据行：字\t编码\t权重
        parts = line.rstrip('\n').split('\t')
        if len(parts) >= 3:
            char, code, weight = parts[0], parts[1], parts[2]
            
            try:
                weight_int = int(weight)
                code_len = len(code)
                
                # 根据编码长度决定检查哪一位
                # 4位编码：检查第3位和第4位
                if code_len >= 3:
                    third_char = code[2]  # 第3位（索引2）
                    
                    if third_char in WEIGHT_OFFSET:
                        # 加上偏移量
                        new_weight = weight_int + WEIGHT_OFFSET[third_char]
                        processed_lines.append(f"{char}\t{code}\t{new_weight}\n")
                        count += 1
                    else:
                        processed_lines.append(line)
                else:
                    processed_lines.append(line)
            except ValueError:
                # 权重不是数字，保持原样
                processed_lines.append(line)
        else:
            # 格式不对，保持原样
            processed_lines.append(line)
    
    # 写入输出文件
    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(processed_lines)
    
    print(f"处理完成！共调整了 {count} 个条目的权重")
    print(f"输出文件：{output_file}")

if __name__ == '__main__':
    input_file = '/home/tetsuya/Dotfiles/rime/dicts/sbzr.len1.dict.yaml'
    output_file = '/home/tetsuya/Dotfiles/rime/dicts/sbzr.len1.dict.yaml.new'
    
    print(f"正在处理：{input_file}")
    process_dict_file(input_file, output_file)
    print("\n请检查新文件，确认无误后执行：")
    print(f"mv {output_file} {input_file}")
