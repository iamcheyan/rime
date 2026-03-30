#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
合并 jichu.extra.encoded.yaml 到对应的词库文件
按照词条字数分类到 len1-len5 的词库中
"""

import re
from collections import defaultdict
from pathlib import Path


def read_yaml_dict(file_path):
    """读取 YAML 词典文件,返回头部和词条列表"""
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # 找到 "..." 标记,之前是头部,之后是词条
    header_lines = []
    entry_lines = []
    in_header = True
    
    for line in lines:
        if line.strip() == '...':
            header_lines.append(line)
            in_header = False
            continue
        
        if in_header:
            header_lines.append(line)
        else:
            # 跳过空行和注释
            if line.strip() and not line.strip().startswith('#'):
                entry_lines.append(line)
    
    return header_lines, entry_lines


def parse_entry(line):
    """解析词条行,返回 (词, 编码, 权重)"""
    parts = line.strip().split('\t')
    if len(parts) >= 2:
        word = parts[0]
        code = parts[1]
        weight = parts[2] if len(parts) >= 3 else '0'
        return word, code, weight
    return None, None, None


def get_word_length(word):
    """获取词的字符长度(中文字符数)"""
    return len(word)


def main():
    # 文件路径
    base_dir = Path('/home/tetsuya/Dotfiles/rime')
    source_file = base_dir / 'resource/待整合扩展词库/jichu.extra.encoded.yaml'
    
    target_files = {
        1: base_dir / 'dicts/sbzr.len1.dict.yaml',
        2: base_dir / 'dicts/sbzr.len2.dict.yaml',
        3: base_dir / 'dicts/sbzr.len3.dict.yaml',
        4: base_dir / 'dicts/sbzr.len4.dict.yaml',
        5: base_dir / 'dicts/sbzr.len5.dict.yaml',
    }
    
    # 读取源文件
    print(f"正在读取源文件: {source_file}")
    _, source_entries = read_yaml_dict(source_file)
    
    # 按字数分类源文件的词条
    entries_by_length = defaultdict(list)
    for line in source_entries:
        word, code, weight = parse_entry(line)
        if word and code:
            length = get_word_length(word)
            if 1 <= length <= 5:
                entries_by_length[length].append((word, code, weight))
            else:
                print(f"警告: 词条 '{word}' 长度为 {length},超出范围,已跳过")
    
    # 统计信息
    print("\n源文件词条统计:")
    for length in sorted(entries_by_length.keys()):
        print(f"  {length}字词: {len(entries_by_length[length])} 条")
    
    # 处理每个目标文件
    for length, target_file in target_files.items():
        if length not in entries_by_length:
            print(f"\n跳过 len{length}: 没有对应长度的词条")
            continue
        
        print(f"\n处理 len{length} 词库...")
        
        # 读取目标文件
        header, existing_entries = read_yaml_dict(target_file)
        
        # 解析现有词条,建立词-编码的集合用于去重
        existing_set = set()
        for line in existing_entries:
            word, code, weight = parse_entry(line)
            if word and code:
                existing_set.add((word, code))
        
        print(f"  现有词条: {len(existing_set)} 条")
        
        # 添加新词条(去重)
        new_entries = []
        duplicate_count = 0
        for word, code, weight in entries_by_length[length]:
            if (word, code) not in existing_set:
                new_entries.append(f"{word}\t{code}\t{weight}\n")
                existing_set.add((word, code))
            else:
                duplicate_count += 1
        
        print(f"  新增词条: {len(new_entries)} 条")
        print(f"  重复跳过: {duplicate_count} 条")
        
        # 写入目标文件
        if new_entries:
            with open(target_file, 'w', encoding='utf-8') as f:
                # 写入头部
                f.writelines(header)
                # 写入现有词条
                f.writelines(existing_entries)
                # 写入新词条
                f.writelines(new_entries)
            
            print(f"  ✓ 已更新文件: {target_file}")
        else:
            print(f"  - 无需更新(没有新词条)")
    
    print("\n完成!")


if __name__ == '__main__':
    main()
