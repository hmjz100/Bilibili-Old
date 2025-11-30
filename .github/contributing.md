# 代码贡献指南
本项目本是为了还原 2019 年 12 月 09 日 [哔哩哔哩弹幕网](https://www.bilibili.com/) 弃用的旧版播放器。  
逐渐发展变为了还原页面还原 2019 年 12 月 09 日前的 [哔哩哔哩弹幕网](https://www.bilibili.com/) 样貌。  
原是一个小小的用户脚本，后添加了浏览器扩展支持。

~~**使用最新的开发工具，追随最新的前端标准，使用最新的语言特性。** 业余项目，无须束手束脚。~~  
有些时候，还是得收敛些，不然步子迈大了，容易卡着挡（

---

### 开发环境
- [Visual Studio Code](https://code.visualstudio.com)
- [Node.js](https://nodejs.org)
- [Microsoft Edge](https://www.microsoft.com/edge/)
- [Google Chrome](https://www.google.com/chrome/)

---

### TypeScript
- ~~既已 [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/manifest/)，何妨 ESNext，任何最新特性放开手用就是。~~
- 推荐 [modules](https://www.typescriptlang.org/docs/handbook/modules.html) 而不是 [namespace](https://www.typescriptlang.org/docs/handbook/namespaces.html) 来组织代码。
- 全栈 TypeScript 化。

---

### 目录结构
```
├─src                      主模块
├─dist                     浏览器扩展构建结果目录
├─extension                浏览器扩展模块
└─userjs                   用户脚本模块
```

---

### 开发
VSCode 里的 TypeScript 项目，使用 ESBuild 编译打包为对应浏览器和用户脚本。  
项目使用 NPM 本地模块的方式进行了拆分，通常只需要修改 src 目录下的主模块即可。  
简要流程为：

- 在 Github 复刻本项目
- 使用 Github Desktop 克隆复刻的项目到本地
- 使用 VSCode 打开，并打开一个包含 Git 的命令行
- 更新 NPM 依赖（推荐 `cmpm i`）
- 开发吧！
- VSCode 里运行对应的任务生成浏览器扩展或用户脚本。（详见对应子条目）
- 测试。（详见对应子条目）
- Commit！
- 向 dev 发起合并的拉取请求

#### 浏览器扩展

扩展模块位于 `extension` 目录。
主要是负责准备主模块的基础依赖及引导，实际业务本体还是位于 `src` 目录。

扩展模块代码分为三部分：
- 后台脚本 `background.ts`  
运行于扩展后台的 server-worker，负责处理主模块的提权请求。
- 内容脚本 `content.ts`。  
运行与页面独立的上下文，负责引导主模块，并担任主模块与后台脚本通信的中间人。
3. 主模块脚本 `main.ts`。  
运行于页面上下文。实际业务本体。 
4. `player` 目录下是另一个项目 [Bilibili-Old-Player (bilibiliplayer)](https://github.com/hmjz100/Bilibili-Old-Player) 生成的播放器脚本。

测试：VSCode 内运行扩展对应的编译任务（已设为默认任务）会将未打包的扩展程序释放到 `dist` 目录，使用浏览器开发者模式的`加载已解压的扩展程序`加载该目录就可以进行测试。

注意：设计 `background.ts` 和 `content.ts` 的修改需要移除然后重新`加载已解压的扩展程序`才会生效。

#### 用户脚本
用户脚本模块位于 `userjs` 目录。
运行于脚本管理器提供的上下文，但基本不处理任何业务。
主要是负责引导主模块，实际业务本体还是位于 `src` 目录。

测试：VSCode 里运行用户脚本对应的编译任务会将 `main.user.js` 生成到 `userjs` 目录下，使用 `Tampermonkey` 等脚本管理器加载即可测试。

提交：请尽量不要将 `*.user.js` 放进提交里，除非确信此次修改要直接推送给用户。

#### 主模块
主模块位于 `src` 目录，负责实际业务。

注意：主模块使用的 `GM` 特权 API 的代码时需要判定是扩展还是用户脚本，分别编写二者的兼容代码。  
通过全局变量 `_UserScript_` 判定，为真时说明处于用户脚本环境。  
`GM` 的接口的会说明提示哪种环境中不可用，切换为可用的接口接口。