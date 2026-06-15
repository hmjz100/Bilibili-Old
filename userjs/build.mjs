import manifest from './manifest.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };
import fs from 'fs-extra';
import esbuild from 'esbuild';
import { exec } from 'child_process';

console.log("Building UserScript...");
console.log("Version: ", pkg.version);

/**
 * 获取项目的 `commit` 哈希值
 * @returns {Promise<string>} `commit` 哈希值
 */
function getProjectHash() {
	return new Promise((resolve, reject) => {
		exec(`git rev-parse HEAD`, { cwd: process.cwd() }, (e, d) => {
			e && reject(e);
			d && resolve(d.match(/[a-f0-9]{40}/)[0]);
		})
	})
}

const commit = await getProjectHash();
const playerCommit = (await fs.promises.readFile('./extension/player/video.js', 'utf-8')).match(/revision:"([a-f0-9]{7,40})"/)?.[1] || commit;

console.log("Commit: ", commit);
console.log("Commit (player): ", playerCommit);

// 写入版本号
manifest.version = `${pkg.version}-${commit}`;

// 生成文件页眉
const banner = Object.entries(manifest).reduce((s, d) => {
	if (Array.isArray(d[1])) {
		d[1].forEach(e => {
			s += `// @${d[0]}${e ? ' '.repeat(13 - d[0].length) + e : ''}\n`
		});
	} else {
		s += `// @${d[0]}${d[1] ? ' '.repeat(13 - d[0].length) + d[1] : ''}\n`;
	}
	return s;
}, `// ==UserScript==\n`) + '// ==/UserScript==\n\nconst MODULES = `\n';

// 生成文件页脚
const footer = '\n//@ sourceURL=bilibili-old.js`;\n\nnew Function("GM", MODULES)(GM);\n';

// 最终处理插件
const userscriptPlugin = {
	name: 'example',
	setup(build) {
		build.onEnd(result => {
			result.outputFiles.forEach(d => {
				fs.promises.writeFile(
					d.path,
					banner + d.text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$') + footer
				);
			})
		})
	},
};

// 打包用户脚本
esbuild.build({
	entryPoints: [
		'./src/index.ts'
	],
	target: "chrome76",
	bundle: true,
	format: 'iife',
	treeShaking: true,
	charset: 'utf8',
	loader: {
		'.html': 'text',
		'.svg': 'text',
		".css": 'text'
	},
	define: {
		_Slug_: `'${commit}'`, // 编译时生成的唯一标记
		_UserScript_: 'true', // 用户脚本标记
		_PlayerCommit_: `'${playerCommit}'`, // 播放器组件版本标记
	},
	plugins: [
		userscriptPlugin
	],
	write: false, // 禁用输出以进行后续处理
	inject: ['@jsc/userjs'], // 替换化境变量
	outfile: 'userjs/main.user.js'
})