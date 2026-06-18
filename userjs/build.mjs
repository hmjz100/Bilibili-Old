import manifest from './manifest.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };
import fs from 'fs-extra';
import esbuild from 'esbuild';
import { minify } from 'html-minifier-terser';
import CleanCSS from 'clean-css';
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

const htmlMinifyPlugin = {
	name: 'html-minify',
	setup(build) {
		build.onLoad({ filter: /\.html$/ }, async (args) => {
			let content = await fs.promises.readFile(args.path, 'utf8');
			content = await minify(content, {
				collapseWhitespace: true,
				removeComments: true,
				removeEmptyAttributes: true,
				minifyCSS: true
			});
			return { contents: content, loader: 'text' };
		});
	}
};

const cssMinifyPlugin = {
	name: 'css-minify',
	setup(build) {
		build.onLoad({ filter: /\.css$/ }, async (args) => {
			let content = await fs.promises.readFile(args.path, 'utf8');
			const result = new CleanCSS({ level: 2 }).minify(content);
			return { contents: result.styles, loader: 'text' };
		});
	}
};

// 打包用户脚本
esbuild.build({
	entryPoints: [
		'./src/index.ts'
	],
	target: "es2015",
	format: "iife",
	charset: "utf8",
	bundle: true,
	treeShaking: true,
	// sourcemap: true,
	minify: true,
	loader: {
		'.svg': 'text'
	},
	define: {
		_Slug_: `'${commit}'`,
		_UserScript_: 'true',
		_PlayerCommit_: `'${playerCommit}'`, // 播放器组件版本标记
	},
	plugins: [
		userscriptPlugin,
		htmlMinifyPlugin,
		cssMinifyPlugin
	],
	write: false, // 禁用输出以进行后续处理
	inject: ['@jsc/userjs'], // 替换化境变量
	outfile: 'userjs/main.user.js'
})