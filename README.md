# Rime 输入法配置文件集合

**更新时间：2025年09月09日**  
**Rime版本：1.14.0**  
**配置文件路径：** `$HOME/.dotfiles/config/org.fcitx.Fcitx5/data/fcitx5/rime`

## 支持的输入法方案

### 主要输入法
- **声笔自然 (sbzr)**：基于声笔编码的中文输入法
- **日语罗马音 (jaroomaji)**：MS-IME风格的日语输入法

### 其他可用方案
- **朙月拼音 (luna_pinyin)**：Rime默认拼音输入法
- **地球拼音 (terra_pinyin)**：基于CC-CEDICT的拼音输入法
- **仓颉五代 (cangjie5)**：传统仓颉输入法
- **注音输入法 (bopomofo)**：台湾注音输入法
- **笔画输入法 (stroke)**：笔画反查输入法

## 平台支持

### Windows
- 存储路径：`%APPDATA%\Rime`
- 使用小狼毫 (Weasel) 输入法框架

### macOS  
- 存储路径：`~/Library/Rime`
- 使用鼠须管 (Squirrel) 输入法框架

### Linux
- **ibus-rime**：`~/.config/ibus/rime/`
- **fcitx5-rime**：`~/.local/share/fcitx5/rime/`
- **Flatpak fcitx5**：`$HOME/.dotfiles/config/org.fcitx.Fcitx5/data/fcitx5/rime`

## 输入法详细说明

### 声笔自然输入法 (sbzr)
基于声笔编码的中文输入法，支持：
- 声母编码：bpmfdtnlgkhjqxzcsrywv
- 笔画反查：使用元音键 aeiou 进行笔画反查
- 拼音反查：使用 a + 拼音进行反查
- 自定义词库：使用 u + 编码添加自定义词汇
- 词组/单字模式切换：F6键切换

### 日语罗马音输入法 (jaroomaji)
MS-IME风格的日语输入法，基于 [rime-jaroomaji](https://github.com/lazyfoxchan/rime-jaroomaji)

**基本功能：**
- **Shift键**：切换日语模式/英文字母模式
- **Shift + 罗马字输入**：强制输入片假名
- **L键**：输入长音符（ー）
- **X键**：输入小写平假名
- **输入过程中按Enter**：确认输入的平假名
- **输入过程中按Shift + Enter**：确认输入的英文字母
- **输入过程中使用方向键上下**：选择转换候选项
- **输入过程中按Space**：确认转换候选项

**用户词典管理：**
- 使用 `dict_tools/CreateUserDict.py` 生成用户词典文件
- 生成的词典文件为 `jaroomaji.user.dict.yaml`
- 详细使用方法请参考 `dict_tools/README.md`


## 快捷键

### 输入法切换
- **F4** 或 **Ctrl+`(~)** 或 **Ctrl+Shift+`(~)**：方案选单
- **Ctrl+J**：切换到日语输入法
- **Ctrl+K**：切换到声笔自然输入法

### 全局快捷键（所有输入法通用）

#### 模式切换
- **Shift+Space**：切换中英文模式
- **Ctrl+Shift+Space**：选择下一个候选项
- **Ctrl+Comma**：切换全角/半角
- **Ctrl+Period**：切换标点符号模式
- **Ctrl+Slash**：切换繁简体
- **Ctrl+Backslash**：切换扩展字符集

#### 候选操作
- **Ctrl+z** / **Ctrl+j** / **Ctrl+k**：选择下一个候选项（全局）
- **Tab**：下一个选项
- **Shift+Tab**：上一个选项
- **逗号(,)**：向上翻页（第一页时无效）
- **句号(.)**：向下翻页
- **减号(-)**：候选菜单上一页
- **等号(=)**：候选菜单下一页
- **方括号 [ ]**：翻页操作

#### Emacs风格编辑快捷键
- **Control+p**：向上移动
- **Control+n**：向下移动
- **Control+b**：向左移动
- **Control+f**：向右移动
- **Control+a**：移动到开头
- **Control+e**：移动到结尾
- **Control+d**：删除
- **Control+k**：删除到行尾
- **Control+h**：退格
- **Control+g**：取消输入
- **Control+bracketleft**：取消输入
- **Control+y**：向上翻页
- **Alt+v**：向上翻页
- **Control+v**：向下翻页

#### 确认操作
- **Return**：在菜单中回车特殊处理（发送Shift+Return）
- **Shift+Return**：在菜单中Shift+回车特殊处理（发送Return）
- **Shift+BackSpace**：清空/取消输入

### 声笔自然输入法特殊快捷键

#### 特殊功能
- **F6**：切换"词组/单字"模式
- **分号(;)**：声笔输入法特殊分词与标记
- **Shift+space**：声笔输入法特殊分词与标记
- **撇号(')**：声笔输入法特殊分词与标记
- **Shift+ISO_Left_Tab**：在分页时向上翻页，在菜单时连续向下翻页（30页）

### 日语罗马音输入法特殊快捷键

#### 日语特殊功能
- **Shift键**：切换日语模式/英文字母模式
- **Shift + 罗马字输入**：强制输入片假名
- **L键**：输入长音符（ー）
- **X键**：输入小写平假名
- **输入过程中按Enter**：确认输入的平假名
- **输入过程中按Shift + Enter**：确认输入的英文字母
- **输入过程中使用方向键上下**：选择转换候选项
- **输入过程中按Space**：确认转换候选项

## 自定义配置

### 界面设置
- **深色主题**：使用 `dark_temple` 配色方案
- **字体**：HanaMinA，字号22
- **水平排列**：候选词水平显示
- **内联预编辑**：在输入过程中将文字发送给应用程序

### 用户词典
- **声笔自定义词典**：`sbzdy.txt` - 使用 u + 编码添加自定义词汇
- **日语用户词典**：`jaroomaji.user.dict.yaml` - 使用 dict_tools 管理
- **词典格式**：词条 + Tab + 编码 + Tab + 权重

### 符号输入
- 使用 `/` 前缀输入特殊符号
- 支持数字编号和字母缩写两种方式
- 例如：`/1`、`/10`、`/alpha`、`/beta` 等

## 脚本和工具

### 更新脚本
- **update.sh**：更新日语输入法词典（已注释，需要手动启用）
- **sync.sh**：同步配置到其他平台
  ```bash
  # 使用方法
  chmod +x sync.sh
  ./sync.sh
  ```

### 词典工具
- **dict_tools/**：日语用户词典管理工具
- **CreateUserDict.py**：生成用户词典文件
- **README.md**：详细使用说明

### Lua扩展
- **lua/sbxlm/**：声笔自然输入法的Lua扩展
  - `ascii_composer.lua`：ASCII输入处理
  - `auto_length.lua`：自动长度调整
  - `key_binder.lua`：按键绑定
  - `selector.lua`：选择器
  - `utils/`：实用工具（计算器、日期时间、数字转换）

## 同步配置
同步配置存储在`installation.yaml`
每个设备都有单独的文件夹，在同步时，rime 会自动遍历同步路径下的所有目录进行整合。
同步路径：


### Windows
- **同步路径**：`C:\Users\tetsu\iCloudDrive\iCloud~dev~fuxiao~app~hamsterapp\RIME\Rime_Sync`
- **输入法框架**：小狼毫 (Weasel)
- **版本**：0.16.1

### macOS
- **同步路径**：`~/Library/Rime` 或 iCloud同步路径
- **输入法框架**：鼠须管 (Squirrel)
- **版本**：根据安装版本

### Linux
- **同步路径**：`$HOME/Dropbox/Rime_Sync`
- **输入法框架**：fcitx5-rime
- **版本**：5.1.11
- **当前配置**：Flatpak版本

### iOS
- **同步路径**：`/private/var/mobile/Library/MobileDocuments/com~apple~CloudDocs/Rime_sync`
- **输入法框架**：iRime

### 当前安装信息
```yaml
distribution_code_name: "fcitx-rime"
distribution_name: Rime
distribution_version: 5.1.11
install_time: "Sun Nov 24 17:05:56 2024"
installation_id: "82e956ca-2a56-4770-ae65-8bd51193fcde"
rime_version: 1.14.0
update_time: "Tue Sep  9 21:24:32 2025"
```

### 用户状态
```yaml
var:
  last_build_time: 1757436145
  previously_selected_schema: sbzr
  schema_access_time:
    jaroomaji: 1757437171
    sbzr: 1757437209
```

## 测试用词

### 声笔自然输入法测试
- `ceyj` → 澈言  
- `mdwh` → 美读文化  
- `qmuea` → 钱

只要能打出这些词汇，便说明声笔自然配置正确

### 日语输入法测试
- `nihongo` → 日本語
- `gakkou` → 学校
- `konnichiwa` → こんにちは
- `arigatou` → ありがとう

## 故障排除

### 常见问题
1. **输入法无法切换**：检查快捷键配置是否正确
2. **候选词不显示**：检查字体设置和界面配置
3. **用户词典不生效**：重新部署配置 `rime_deployer --build`
4. **同步失败**：检查网络连接和同步路径权限

### 重新部署
```bash
# 重新构建配置
rime_deployer --build

# 同步词典
rime_dict_manager -s

# 完整重新部署
rime_deployer --build ~/.dotfiles/config/org.fcitx.Fcitx5/data/fcitx5/rime
```

### 日志查看
- **Linux fcitx5**：`~/.local/share/fcitx5/log/`
- **Windows Weasel**：`%TEMP%\weasel.log`
- **macOS Squirrel**：`~/Library/Logs/Squirrel/`

## 文件结构说明

### 核心配置文件
- `default.custom.yaml`：全局自定义配置
- `key_bindings.yaml`：按键绑定配置
- `installation.yaml`：安装信息
- `user.yaml`：用户状态

### 输入法方案
- `sbzr.schema.yaml`：声笔自然输入法方案
- `jaroomaji.schema.yaml`：日语罗马音输入法方案
- `*.custom.yaml`：各方案的自定义配置

### 词典文件
- `*.dict.yaml`：词典数据文件
- `*.userdb/`：用户学习数据目录
- `build/`：编译后的配置文件

### 扩展功能
- `lua/`：Lua扩展脚本
- `dict_tools/`：词典管理工具
- `sync/`：同步数据目录
