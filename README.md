---
### 本次修改
1.修复原脚本删除的设置（如[toastr](https://github.com/CodeSeven/toastr)设置）</br>
2.全部修改包含：
  - 增加
    - Toastr浮动通知选项
    - “下载”设置项上的视频封面
  - 修改
    - 优先载入的视频编码类型改为AV1
    - 浮动通知时长为8秒（最小0秒，可自行修改代码来达到想要的要求）
    - 浮动通知延时为300毫秒（最小0毫秒，最大10000毫秒，可自行修改代码来达到想要的要求）
  - 显示隐藏下载设置
  - 默认设置项目
    - 打开选项
      - 开发者模式
      - 经典设置入口
      - 日志拦截
      - 评论区优先展示按时间排序
      - 还原评论中的超链接
      - 丰富顶栏动图
      - 统一换回旧版顶栏
      - UP主列表
      - 自动切换到弹幕列表
      - 移除未登录弹窗
      - 显示番剧分集数据
      - 只显示视频历史
      - 过滤主页广告
      - 修复播放器消息
        - 番剧推荐
        - 首页推荐
        - 实时热搜
      - 修复视频心跳
      - 恢复对于番剧出差和DM組的访问
      - 还原个人空间相簿链接
      - 显示账号注册时间
      - 修复失效视频信息
      - 分段进度条
      - 解除区域/平台限制
        - 解除限制
        - 泰区代理
      - 添加点赞功能
      - 跳过充电鸣谢
      - 保留番剧回目列表
      - av/BV
      - bangumi
      - 稍后再看
      - 嵌入
      - 主页
      - 排行榜
      - 番剧主页
      - 专栏
      - medialist
      - 搜索
      - 分区主页
      - 启用新版弹幕
      - 反查弹幕发送者
      - 添加互动弹幕
      - 禁止P2P上传
      - 禁止挂机检测
    - 关闭选项
      - 托管原生脚本
      - 禁用主页个性化推荐
      - 去除历史记录页面搜索框
      - flash播放器
      - 自动化操作
      - 合集
---
### 以下为原作者的README文档（[原Github链接](https://github.com/MotooriKashin/Bilibili-Old)/[原脚本链接](https://greasyfork.org/zh-CN/scripts/394296))
![Windows 11](https://img.shields.io/badge/Microsoft_Windows_11-pass-green.svg?longCache=true) ![Chrome 94](https://img.shields.io/badge/Google_Chrome_96-pass-green.svg?longCache=true) ![Firefox 89](https://img.shields.io/badge/Mozilla_Firefox_89-pass-green.svg?longCache=true) ![Tampermonkey 4.13](https://img.shields.io/badge/Tampermonkey_4.14-pass-green.svg?longCache=true)

[Tampermonkey](https://www.tampermonkey.net/)（chrome）脚本，恢复旧版B站网页样式，尤其是那个小电视播放器。  


---
### 功能实现
1. 使用[Wayback Machine](https://archive.org/web/)存档的B站当时的前端资源完全重写页面样式，包括：
   - [Bilibili主页](https://www.bilibili.com)。
   - 普通视频页面，俗称av页或BV页，例如[av2](https://www.bilibili.com/video/av2)。
   - 番剧、影视等专属页面，如[冰菓](https://www.bilibili.com/bangumi/play/ss3398/)。
   - 稍后再看页面，如果你使用“稍后再看”功能的话。
   - 视频合集页面，这种页面当时本不存在，脚本使用播单功能模拟了一下，例如[bilibili moe 2018 日本动画场应援](https://www.bilibili.com/medialist/play/ml182603655)对应曾经的播单号[pl769](https://www.bilibili.com/playlist/video/pl769)的，其他无法获取到播单号的页面则取前20个视频模拟成播单列表，需要滚动到列表底部才能动态加载更多。
   - 外链播放器或者说嵌入式播放器，本质是一个纯播放器页面，通常作为子页面嵌入在别的网页中，例如[拜年祭2021](https://www.bilibili.com/festival/2022bnj)专题页面。
   - [全站排行榜页面](https://www.bilibili.com/ranking)。
   - 专栏页面，或者说CV页面。
2. 为重写的页面配套的其他功能，详见脚本自带的设置界面。

---
### 关于设置
名义上这只是一个重写页面样式的脚本，但为了维护重写的页面，脚本提供了大量附属功能，这些功能或许不是人人都需要，所以脚本专门绘制了一个设置界面来管理所有功能的配置，用户可以根据自身需要来自定义每一项功能的启用与否，包括脚本的核心重写页面功能。  
这个设置界面的入口位于页面的右下角，安装本脚本后在B站页面完全载入的瞬间右下角会出现一个滚动的“齿轮”，鼠标点击该“齿轮”即可呼出设置界面。“齿轮”滚动几秒后自动隐藏以淡化自己的存在，只在鼠标移动到对应位置才会浮现，鼠标移开后再度消失。  
设置界面列出了所有功能设置项，点击滑块按钮即可选择该功能的启用与否，大部分设置都附带详细的浮窗说明介绍。  
设置中还可以选择切换设置入口，将滚动的“齿轮”换回经典贴边隐藏的方块，进一步淡化自己的存在感。
大部分设置的调整都需要刷新页面才会生效，脚本并不会主动去刷新，以免打断您正常使用的内容。

---
### 已知问题
**以下问题这里可能处于并将长期处于无法解决状态，请多担待！**
1. 部分情况下重写之前的网页会一闪而过，取决于脚本注入的速度。
2. 偶发各种页面形变，功能报错的情况，刷新页面可以缓解，最好是硬刷新，或者到设置“通用”中调整“页面重构模式”。
3. 反查出的弹幕发送者信息不一定可靠，因为可能存在哈希碰撞，真正的发送者B站从未提供给前端。
4. B站后来为播放器添加的各种功能，例如互动视频、全景视频、高能进度条等都未能支持。
5. B站后来升级的HDR、Dobby、8K等HEVC专属画质可能无法支持。
6. 旧版xml弹幕已获取不到90分钟后的弹幕池，所以如非必要请不要关闭“新版弹幕”功能。
7. **充电、B币支付等功能在可能已失去维护，请不要使用或者移步新版页面！**
8. 一些功能由于API的失效做不到完全还原，只能尽可能寻求替代方案。
9. 设置中“页面重构模式”选项可调整与部分扩展的兼容性，详情请参考设置项的浮动提示。

问题反馈推荐去[Github](https://github.com/MotooriKashin/Bilibili-Old)发issue，GreasyFork的邮件通知系统经常抽风，可能无法及时接收评论和反馈。

---
### B站更新摘记  
记录从旧版页面被抛弃以来B站的一些修改。
- 2019 年 12 月 09 日：av、Bangumi改版，万恶之源。
- 2019 年 12 月 24 日：稍后再看改版，使用稍后再看找回旧版播放器的方法失效。
- 2020 年 03 月 23 日：BV号全量推送，同时保留av号支持，但是不再自增。
- 2020 年 04 月 04 日：主页改版，那天正好是清明节。
- 2020 年 04 月 23 日：4K灰度测试，保留了AVC源，旧版播放器无缝兼容。
- 2020 年 04 月 28 日：播单被404，原生旧版页面灭绝。
- 2020 年 05 月 21 日：弹幕改版，启用protobuf，旧版xml弹幕无法获取90分钟后的弹幕池。
- 2020 年 07 月 13 日：稍后再看再改，统一成为合集页面的一种。
- 2020 年 07 月 29 日：播放器加载图改版，抖动的小电视消失，改为了“你感兴趣的视频都在B站”。
- 2020 年 08 月 25 日：番剧信息接口风控，旧版接口一一失效的开始。
- 2020 年 09 月 23 日：弹幕叠加层出现，互动弹幕、弹幕弹窗。
- 2020 年 10 月 14 日：排行榜改版，旧版排行榜强制重定向。
- 2020 年 10 月 27 日：评论区改版，右上角快速翻页区域消失。
- 2020 年 11 月 20 日：评论区改版，av/BV超链接直接转化为标题。
- 2020 年 12 月 03 日：mylist被404，远古合集数据消失。
- 2021 年 02 月 08 日：历史弹幕池改版，启用protobuf，部分高级弹幕、代码弹幕以及超过上限的历史弹幕消失。
- 2021 年 04 月 14 日：嵌入式播放器改版，旧版播放器外链接口不复存在。
- 2021 年 04 月 21 日：评论区改版，评论不再支持翻页。
- 2021 年 07 月 01 日：评论接口和谐，上古按“评论数”排序评论彻底失效，之后又恢复了，但页码总数已不正常。
- 2021 年 07 月 15 日：Bangumi播放器改版。
- 2021 年 08 月 02 日：HEVC软解支持，网页端播放HEVC源成为可能。
- 2021 年 09 月 28 日：杜比视界/杜比音效支持，只提供HEVC源。
- 2021 年 12 月 03 日：8K支持，只提供HEVC源。
- 2022 年 01 月 24 日：av1编码上线。
- 2022 年 02 月 16 日：评论接口和谐，无法再获取评论楼层数。

---
### 开发环境
> 
> 操作系统        Microsoft Windows 11 professional 10.0.22000.258  
> 浏览器          Google Chrome 96.0.4664.45 (正式版本) （64 位） (cohort: Stable)  
> 脚本管理器      Tampermonkey Beta 4.14.6148  
> 代码编辑器      Visual Studio Code 1.63.0  
> 编译器          Node.js v12.9.1  
>                TypeScript Version 4.5.2  
>

开发者文档参见本仓库[Wiki](https://github.com/MotooriKashin/Bilibili-Old/wiki/%E5%BC%80%E5%8F%91%E8%80%85%E6%96%87%E6%A1%A3)。

---
### 参考致谢
- [protobufjs](https://github.com/protobufjs/protobuf.js)
- [toastr](https://github.com/CodeSeven/toastr/)
- [Wayback Machine](https://archive.org/web/)
- [bilibiliOldPlayer](https://github.com/indefined/UserScripts)
- [BiliPlus](https://www.biliplus.com/)
- [Bilibilijj](https://www.jijidown.com/)
- [如何看待 2020 年 3 月 23 日哔哩哔哩将稿件的「av 号」变更为「BV 号」？ - mcfx的回答 - 知乎](https://www.zhihu.com/question/381784377/answer/1099438784)
- [Bilibili Evolved](https://github.com/the1812/Bilibili-Evolved)
- [Bilibili\_video\_download](https://github.com/Henryhaohao/Bilibili_video_download)
- [YouTube Links](https://greasyfork.org/zh-CN/scripts/5566)
- [js-md5](https://github.com/emn178/js-md5)
- [BiliBili_crc2mid](https://github.com/esterTion/BiliBili_crc2mid)
- [解除 B 站区域限制](https://greasyfork.org/scripts/25718)
- [用crc彩虹表反向B站弹幕“匿名”？我不想浪费内存，但是要和彩虹表一样快！](https://moepus.oicp.net/2016/11/27/crccrack/)

--- 
### 开源许可
[MIT License](https://opensource.org/licenses/MIT)
