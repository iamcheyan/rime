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
	方案選單 F4 Ctrl+`(~)
	Ctrl+Shift+J 日本语
	Ctrl+Shift+K 声笔自然

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
