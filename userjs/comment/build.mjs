import manifest from './manifest.json' with { type: 'json' };
import esbuild from 'esbuild';
import { exec } from 'child_process';

console.log("Building UserScript (Comment)...");
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
console.log("Commit: ", commit);

// 写入版本号
manifest.version += `-${commit}`;

// 生成文件页眉
const banner = Object.entries(manifest).reduce((s, d) => {
	if (Array.isArray(d[1])) {
		d[1].forEach(e => {
			s += `// @${d[0].padEnd(13, " ")}${e}\n`
		});
	} else {
		s += `// @${d[0].padEnd(13, " ")}${d[1]}\n`;
	}
	return s;
}, `// ==UserScript==\n`) + '// ==/UserScript==\n\n(function () {\n';

// 生成文件页脚
const footer = '\n})();\n//@ sourceURL=bilibili-old.js`;\n';

esbuild.build({
	entryPoints: [
		'./src/comment.ts'
	],
	target: "es2015",
	bundle: true,
	format: 'esm',
	treeShaking: true,
	charset: 'utf8',
	outfile: 'userjs/comment/main.user.js',
	loader: {
		'.html': 'text',
		'.svg': 'text',
		".css": 'text'
	},
	define: {
		_Slug_: `'${commit}'`,
		_UserScript_: 'true',
	},
	banner: {
		js: banner
	},
	footer: {
		js: footer
	}
});