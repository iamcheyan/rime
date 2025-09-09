# 声笔自然&日语罗马音输入法配置文件2025年09月09日

`$HOME/.dotfiles/config/rime`

Windows Mac Linux 三端配置文件通用  
Mac 下存储在`~/.Library/Rime`  
Linux ibus 下存储在`~/.config/ibus/rime/`  
Linux fcitx5 下存储在`~/.local/share/fcitx5/rime/`  
Linux Flatpak  fcitx5 下存储在`$HOME/.dotfiles/config/org.fcitx.Fcitx5/data/fcitx5/rime`

## MS-IME风格的罗马字输入方案

https://github.com/lazyfoxchan/rime-jaroomaji

	Shift键：切换日语模式/英文字母模式
	Shift + 罗马字输入：强制输入片假名
	输入过程中按Enter：确认输入的平假名
	输入过程中按Shift + Enter：确认输入的英文字母
	输入过程中使用方向键上下：选择转换候选项
	输入过程中按Space：确认转换候选项
	L键：输入长音符（可通过X键输入小写平假名）
	
	如果要向用户词典中添加单词，可以使用 dict_tools/CreateUserDict.py 来生成用户词典文件。
	生成的词典文件为 jaroomaji.user.dict.yaml。
	
	有关运行的详细信息，请参考 dict_tools/README.md。


## 快捷键

### 输入法切换
- **F4** 或 **Ctrl+`(~)**：方案选单
- **Ctrl+J**：切换到日语输入法
- **Ctrl+K**：切换到声笔自然输入法

### 声笔自然输入法快捷键

#### 候选选择
- **Ctrl+z** / **Ctrl+j** / **Ctrl+k**：选择下一个候选项（全局）
- **Tab**：下一个选项
- **Shift+Tab**：上一个选项
- **Control+Shift+n**：向上移动
- **Control+Shift+m**：向下移动

#### 翻页操作
- **逗号(,)**：向上翻页（第一页时无效）
- **句号(.)**：向下翻页
- **减号(-)**：候选菜单上一页
- **等号(=)**：候选菜单下一页
- **Shift+ISO_Left_Tab**：在分页时向上翻页，在菜单时连续向下翻页（30页）

#### 编辑操作
- **Shift+BackSpace**：清空/取消输入
- **Return**：在菜单中回车特殊处理
- **Shift+Return**：在菜单中Shift+回车特殊处理
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

#### 特殊功能
- **F6**：切换"词组/单字"模式
- **分号(;)**：声笔输入法特殊分词与标记
- **Shift+space**：声笔输入法特殊分词与标记
- **撇号(')**：声笔输入法特殊分词与标记

### 日语罗马音输入法快捷键

#### 候选选择
- **Ctrl+z** / **Ctrl+j** / **Ctrl+k**：选择下一个候选项（全局）
- **Tab**：下一个选项
- **Shift+Tab**：上一个选项
- **Control+Shift+n**：向上移动
- **Control+Shift+m**：向下移动

#### 翻页操作
- **逗号(,)**：向上翻页（第一页时无效）
- **句号(.)**：向下翻页
- **减号(-)**：候选菜单上一页/直接输入减号
- **等号(=)**：候选菜单下一页

#### 确认操作
- **Return**：在菜单中回车特殊处理
- **Shift+Return**：在菜单中Shift+回车特殊处理

#### 日语特殊功能
- **Shift键**：切换日语模式/英文字母模式
- **Shift + 罗马字输入**：强制输入片假名
- **L键**：输入长音符（ー）
- **X键**：输入小写平假名
- **输入过程中按Enter**：确认输入的平假名
- **输入过程中按Shift + Enter**：确认输入的英文字母
- **输入过程中使用方向键上下**：选择转换候选项
- **输入过程中按Space**：确认转换候选项

## 同步
同步配置存储在`installation.yaml`
每个设备都有单独的文件夹，在同步时，rime 会自动遍历同步路径下的所有目录进行整合。
同步路径：


### Windows
	C:\Users\tetsu\iCloudDrive\iCloud~dev~fuxiao~app~hamsterapp\RIME\Rime_Sync

### iOS
	/private/var/mobile/Library/MobileDocuments/com~apple~CloudDocs/Rime_sync	

### Linux
	$HOME/Dropbox/Rime_Sync

`installation.yaml`文件内容，每个平台具有单独的此文件：

	distribution_code_name: Weasel
	distribution_name: Weasel
	distribution_version: 0.16.1
	install_time: "Sat Oct  5 16:59:30 2024"
	rime_version: 1.11.2
	installation_id: "Win"
	sync_dir: 'C:\Users\tetsu\iCloudDrive\iCloud~dev~fuxiao~app~hamsterapp\RIME\Rime_Sync'

### Linux
```bash
distribution_code_name: "fcitx-rime"
distribution_name: Rime
distribution_version: 5.0.15
install_time: "Thu Sep 12 15:56:01 2024"
rime_version: 1.8.5
installation_id: Linux
sync_dir: "/home/tetsuya/Dropbox/Rime_Sync"
update_time: "Tue Sep 24 19:05:19 2024"
```

## 测试用词
    ceyj 澈言  
    mdwh 美读文化  
    qmuea 钱

只要能打出这些词汇，便说明配置正确

## 日本語
	nihongo	日本語
	gakkou 学校
