import pkg from '../package.json' with { type: 'json' };
import fs from 'fs-extra';
import esbuild from 'esbuild';
import { minify } from 'html-minifier-terser';
import CleanCSS from 'clean-css';
import { exec } from 'child_process';

console.log("Building Extension...");
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

// 清空输出目录并复制资源
await fs.emptyDir('./dist');
fs.copy("./extension/_locales", "./dist/_locales");
fs.copy("./extension/images", "./dist/images");
fs.copy("./extension/player", "./dist/player");
fs.copy("./extension/rules", "./dist/rules");

const manifest = (await fs.promises.readFile('./extension/manifest.json', 'utf-8')).replace(
	/"description": "(.*)",/,
	`"description": "$1",\n\t"version": "${pkg.version}",`
);
await fs.promises.writeFile('./dist/manifest.json', manifest);

const htmlMinifyPlugin = {
	name: 'html-minify',
	setup(build) {
		build.onLoad({ filter: /\.html$/ }, async (args) => {
			let content = await fs.promises.readFile(args.path, 'utf8');
			content = await minify(content, {
				collapseWhitespace: true,
				removeComments: true,
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

// 打包后台脚本和内容脚本
esbuild.build({
	entryPoints: [
		'./extension/background.ts',
		'./extension/content.ts',
	],
	target: "es2015",
	format: "iife",
	charset: "utf8",
	outdir: "dist",
	outbase: "extension",
	bundle: true,
	treeShaking: true,
	// sourcemap: true,
	minify: true,
	plugins: [
		htmlMinifyPlugin,
		cssMinifyPlugin
	],
	define: {
		_Slug_: `'${commit}'`,
	}
});

// 打包MAIN脚本
esbuild.build({
	entryPoints: [
		'./src/index.ts'
	],
	target: "es2015",
	format: "iife",
	charset: "utf8",
	outdir: "dist",
	outbase: "src",
	bundle: true,
	treeShaking: true,
	// sourcemap: true,
	minify: true,
	plugins: [
		htmlMinifyPlugin,
		cssMinifyPlugin
	],
	loader: {
		'.svg': 'text'
	},
	define: {
		_Slug_: `'${commit}'`,
		_UserScript_: 'false',
		_PlayerCommit_: `'${playerCommit}'`,
	},
	inject: ['@jsc/extension'], // 替换化境变量
});