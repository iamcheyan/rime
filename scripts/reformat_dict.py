
import os

file_path = '/Users/tetsuya/Dotfiles/rime/resource/常用词库（墨染双拼）/小鹤音形冰凌词库.txt'
temp_path = file_path + '.tmp'

# Read and process
with open(file_path, 'r', encoding='utf-8') as f_in, open(temp_path, 'w', encoding='utf-8') as f_out:
    for line in f_in:
        line = line.strip()
        if not line:
            f_out.write('\n')
            continue
        
        parts = line.split('\t')
        if len(parts) == 3:
            # Original: Code, Word, Weight
            # Target: Word, Code, Weight
            code, word, weight = parts
            new_line = f"{word}\t{code}\t{weight}\n"
            f_out.write(new_line)
        else:
            # If format is unexpected, preserve it or print a warning? 
            # I will try to split by whitespace if tab fails, to be robust
            parts = line.split()
            if len(parts) == 3:
                 code, word, weight = parts
                 new_line = f"{word}\t{code}\t{weight}\n"
                 f_out.write(new_line)
            else:
                # write as is if we can't parse it, but maybe add a newline
                f_out.write(line + '\n')

# Replace file
os.replace(temp_path, file_path)
print("Done reformatting.")
