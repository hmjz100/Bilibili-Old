import { objUrl } from "../utils/format/url";
import { SBCategory, SBCategoryConfig, SBCategoryOption, SBSegmentBucket, SBActionType, SBTime } from "./api-sponsorblock";

/** 空降助手（小电视空降助手）服务器 */
export const BSB_SERVERS = ['https://bsbsb.top', 'https://bsbsb.cc', 'http://103.236.70.57:9876'];

/** 空降助手分类表 */
export const BSB_CATEGORIES: SBCategoryConfig[] = [
	{ name: <SBCategory>'sponsor', label: '赞助/恰饭', color: '#00d400', option: SBCategoryOption.AutoSkip },
	{ name: <SBCategory>'selfpromo', label: '无偿/自我推广', color: '#ffff00', option: SBCategoryOption.ManualSkip },
	{ name: <SBCategory>'interaction', label: '三连/互动提醒', color: '#cc00ff', option: SBCategoryOption.ManualSkip },
	{ name: <SBCategory>'intro', label: '过场/开场动画', color: '#00ffff', option: SBCategoryOption.ManualSkip },
	{ name: <SBCategory>'outro', label: '鸣谢/结束画面', color: '#0202ed', option: SBCategoryOption.ManualSkip },
	{ name: <SBCategory>'preview', label: '回顾/概要', color: '#008fd6', option: SBCategoryOption.ShowOverlay },
	{ name: <SBCategory>'filler', label: '离题闲聊/玩笑', color: '#7300ff', option: SBCategoryOption.Disabled },
	{ name: <SBCategory>'music_offtopic', label: '音乐:非音乐部分', color: '#ff9900', option: SBCategoryOption.AutoSkip },
	{ name: <SBCategory>'padding', label: '填充内容/前黑/后黑', color: '#222222', option: SBCategoryOption.AutoSkip },
	{ name: <SBCategory>'exclusive_access', label: '独家访问/抢先体验', color: '#008a5c', option: SBCategoryOption.ShowOverlay },
	{ name: <SBCategory>'poi_highlight', label: '精彩时刻/重点', color: '#ff1684', option: SBCategoryOption.ManualSkip },
	{ name: <SBCategory>'jumpscare', label: '跳吓', color: '#e53935', option: SBCategoryOption.AutoSkip }
];

/** 空降助手 API 返回 */
export interface BSBResponse<T> {
	/** 数据，失败时为 `null` */
	data: T | null;
	/** HTTP 状态码，网络错误为 `-1` */
	status: number;
}

/**
 * SHA-256 十六进制摘要。  
 * 服务器按 **SHA-256(bvid) 的前 4 位** 分桶下发片段，摘要算法必须与服务器一致，  
 * 因此不能用其它非标准摘要兜底（否则永远拿不到属于本稿件的桶）。
 * @param value 待摘要文本
 */
async function sha256Hex(value: string): Promise<string> {
	const subtle = (<any>crypto)?.subtle;
	// WebCrypto 仅在安全上下文可用；不可用时回退到纯 JS 实现（结果与 WebCrypto 一致）
	if (subtle) {
		const buffer = await subtle.digest('SHA-256', new TextEncoder().encode(value));
		return Array.from(new Uint8Array(buffer)).map(d => d.toString(16).padStart(2, '0')).join('');
	}
	return sha256HexPure(value);
}

/** SHA-256 轮常量 */
const sha256K = [
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

/** 纯 JS 实现的 SHA-256（32 位字数组），用于无 WebCrypto 的环境 */
function sha256HexPure(value: string) {
	const bytes = new TextEncoder().encode(value);
	const bitLen = bytes.length * 8;
	// 末尾补 0x80，再补零至 56 字节对齐，最后写入 64 位长度
	const total = Math.ceil((bytes.length + 9) / 64) * 64;
	const buf = new Uint8Array(total);
	buf.set(bytes);
	buf[bytes.length] = 0x80;
	const view = new DataView(buf.buffer);
	// 长度按 64 位大端写入；文本长度远小于 2^32 字节，高 32 位恒为 0
	view.setUint32(total - 4, bitLen >>> 0, false);
	view.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false);
	const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
	const w = new Uint32Array(64);
	const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
	for (let off = 0; off < total; off += 64) {
		for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
		for (let i = 16; i < 64; i++) {
			const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
			const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
			w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
		}
		let [a, b, c, d, e, f, g, hh] = h;
		for (let i = 0; i < 64; i++) {
			const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
			const ch = (e & f) ^ (~e & g);
			const t1 = (hh + S1 + ch + sha256K[i] + w[i]) >>> 0;
			const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const t2 = (S0 + maj) >>> 0;
			hh = g; g = f; f = e;
			e = (d + t1) >>> 0;
			d = c; c = b; b = a;
			a = (t1 + t2) >>> 0;
		}
		h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
		h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
	}
	return h.map(d => d.toString(16).padStart(8, '0')).join('');
}

/**
 * 计算视频ID的哈希前缀（4 位十六进制），服务器以此分桶下发片段。  
 * 全程只发送前缀，不泄露完整哈希。
 */
export async function bsbHashPrefix(videoID: string) {
	return (await sha256Hex(videoID)).slice(0, 4);
}

/**
 * 向空降助手服务器发起请求，依次尝试主服务器及镜像。  
 * @param type 请求方法
 * @param endpoint 接口路径
 * @param data GET 时作为查询参数，其他方法作为 JSON 请求体
 * @param headers 附加请求头，用于忽略服务器缓存等场景
 */
export async function bsbRequest<T>(type: 'GET' | 'POST', endpoint: string, data?: Record<string, any>, headers?: Record<string, string>): Promise<BSBResponse<T>> {
	let notFound = false;
	for (const server of BSB_SERVERS) {
		try {
			const url = type === 'GET' ? objUrl(server + endpoint, <any>data ?? {}) : server + endpoint;
			const response = await fetch(url, {
				method: type,
				headers: { ...headers, ...(data && type !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
				body: data && type !== 'GET' ? JSON.stringify(data) : undefined
			});
			// 404：该服务器没有这个桶的数据，仍尝试其它服务器
			if (response.status === 404) {
				notFound = true;
				continue;
			}
			if (!response.ok) continue;
			return { data: <T>await response.json(), status: response.status };
		} catch {
			// 尝试下一个服务器
		}
	}
	return { data: null, status: notFound ? 404 : -1 };
}

/**
 * 获取稿件的空降片段
 * @param bvid 稿件 bvid
 * @param ignoreCache 跳过服务器缓存（仅追加请求头，**不能带查询参数**，服务器会拒绝未知参数）
 * @returns 片段数据桶列表，无数据时为空数组
 */
export async function bsbGetSegments(bvid: string, ignoreCache = false) {
	const prefix = await bsbHashPrefix(bvid);
	// 服务器对 /api/skipSegments/<prefix> 不接受任何查询参数，忽略缓存只能靠请求头
	const response = await bsbRequest<SBSegmentBucket[]>('GET', `/api/skipSegments/${prefix}`, undefined, ignoreCache ? {
		'X-SKIP-CACHE': '1',
		'cache-control': 'no-cache'
	} : undefined);
	return response.data ?? [];
}

/** 投票类型 */
export enum BSBVoteType {
	/** 踩 */
	Down = 0,
	/** 顶 */
	Up = 1
}

/**
 * 对片段投票
 * @param UUID 片段 UUID
 * @param type 0 踩 / 1 顶
 * @param category 分类投票时传入新的分类
 */
export async function bsbVote(UUID: string, type: BSBVoteType, category?: SBCategory) {
	const userID = await bsbUserID();
	const typeSection = category ? `&category=${encodeURIComponent(category)}` : `&type=${type}`;
	const { status } = await bsbRequest('POST', `/api/voteOnSponsorTime?UUID=${encodeURIComponent(UUID)}&userID=${encodeURIComponent(userID)}${typeSection}`);
	return status;
}

/**
 * 提交新片段
 * @param bvid 稿件 bvid
 * @param cid 分P cid
 * @param segments 待提交片段
 * @param videoDuration 视频时长
 * @returns 服务器返回的片段（带正式 UUID）
 */
export async function bsbSubmitSegments(bvid: string, cid: string, segments: SBTime[], videoDuration: number) {
	const { data, status } = await bsbRequest<SBTime[]>('POST', '/api/skipSegments', {
		videoID: bvid,
		cid,
		userID: await bsbUserID(),
		// 只提交服务器需要的字段，避免本地草稿的 UUID/来源等字段干扰服务器
		segments: segments.map(d => ({
			segment: [d.segment[0], d.segment[1]],
			category: d.category,
			actionType: d.actionType ?? 'skip',
			description: d.description ?? ''
		})),
		videoDuration
	});
	return { segments: data ?? [], status };
}

/** 记录一次完整跳过，用于服务器统计 */
export async function bsbViewedVideoSponsorTime(UUID: string) {
	await bsbRequest('POST', `/api/viewedVideoSponsorTime?UUID=${encodeURIComponent(UUID)}`);
}

/**
 * 匿名用户ID，首次访问时生成。  
 * 使用扩展存储（而非页面的 localStorage）保存，避免污染站点存储并保证跨页面一致。
 */
async function bsbUserID() {
	const key = 'bsbUserID';
	let userID: string | undefined;
	try {
		userID = await GM.getValue<string>(key);
	} catch {
		userID = undefined;
	}
	if (!userID) {
		userID = Array.from(crypto.getRandomValues(new Uint32Array(36)), d => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[d % 62]).join('');
		try {
			GM.setValue(key, userID);
		} catch {
			// 存储失败时仅本次会话有效，不影响投票
		}
	}
	return userID;
}
