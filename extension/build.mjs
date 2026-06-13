import fs from 'fs-extra';
import esbuild from 'esbuild';

console.log("Building Extension...");
console.log("Version: ", manifest.version);

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
const playerCommit = await fs.promises.readFile('./extension/player/video.js', 'utf-8')?.match?.(/revision:"([a-f0-9]{7,40})"/)?.[1] || commit;

console.log("Commit: ", commit);
console.log("Commit (player): ", playerCommit);

// 清空输出目录并复制资源
await fs.emptyDir('./dist');
fs.copy("./extension/_locales", "./dist/_locales");
fs.copy("./extension/images", "./dist/images");
fs.copy("./extension/player", "./dist/player");
fs.copy("./extension/rules", "./dist/rules");
fs.copy("./extension/manifest.json", "./dist/manifest.json");

// 打包后台脚本和内容脚本
esbuild.build({
	entryPoints: [
		'extension/background.ts',
		'extension/content.ts',
	],
	target: "chrome76",
	bundle: true,
	// sourcemap: true,
	minify: true,
	outdir: 'dist',
	outbase: "chrome",
	format: 'iife',
	treeShaking: true,
	charset: 'utf8',
	define: {
		_Slug_: `'${commit}'`, // 编译时生成的唯一标记
	}
});

// 打包MAIN脚本
esbuild.build({
	entryPoints: [
		'src/index.ts'
	],
	bundle: true,
	// sourcemap: true,
	minify: true,
	outdir: 'dist',
	outbase: "src",
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
		_UserScript_: 'false', // 用户脚本标记
		_PlayerCommit_: `'${playerCommit}'`, // 玩家脚本提交哈希值
	},
	inject: ['@jsc/extension'], // 替换化境变量
});