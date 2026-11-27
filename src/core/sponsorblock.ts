import { BLOD } from "./bilibili-old";
import { switchVideo } from "./observer";
import { toast } from "./toast";
import { user } from "./user";
import { addCss, addElement } from "../utils/element";
import { poll } from "../utils/poll";
import { AV } from "../utils/av";
import { debug } from "../utils/debug";
import {
	BSB_CATEGORIES, BSBVoteType, bsbGetSegments, bsbSubmitSegments, bsbVote, bsbViewedVideoSponsorTime,
	bsbHashPrefix, bsbRequest
} from "../io/api-bsb";
import { SBSegmentBucket } from "../io/api-sponsorblock";
import {
	SBActionType, SBCategory, SBCategoryOption, SBHideType, SBSourceType, SBTime
} from "../io/api-sponsorblock";

/** 跳过判定缓冲，避免进度刚好压在片段起点时错过 */
const skipBuffer = 0.003;
/** 片段直达片尾时的回退缓冲 */
const endTimeSkipBuffer = 0.5;
/** 跳过提示停留时长 /s（自动跳过后的撤销提示） */
const noticeDelay = 2.5;
/** 手动跳过提示提前量 /s：在片段开始前多久弹出提示 */
const manualNoticeLead = 3;
/** 单次扫描最多查询多少个视频卡片（避免首页一次性请求过多） */
const maxCardQueryPerScan = 30;
/** 分类行为展示名 */
const optionLabels = ['禁用', '仅展示', '手动跳过', '自动跳过'];

/** 空降助手分类配置表 */
const categoryConfig = new Map<SBCategory, typeof BSB_CATEGORIES[number]>();
BSB_CATEGORIES.forEach(d => categoryConfig.set(d.name, d));

/** 分类标签 */
export function bsbCategoryLabel(category: SBCategory) {
	return categoryConfig.get(category)?.label ?? category;
}

/**
 * 广告类分类（只展示这几类的胶囊标识）  
 * 开场动画、结束画面、互动提醒等属于内容本身，不是广告，故不展示胶囊
 */
const AD_CATEGORIES: SBCategory[] = [
	<SBCategory>'sponsor',
	<SBCategory>'selfpromo',
	<SBCategory>'exclusive_access'
];
/** 该分类是否为广告类 */
export function bsbIsAdCategory(category: SBCategory) {
	return AD_CATEGORIES.indexOf(category) >= 0;
}
/** 胶囊内使用的短标签 */
const shortLabels = new Map<SBCategory, string>([
	[<SBCategory>'sponsor', '赞助'],
	[<SBCategory>'selfpromo', '自我推广'],
	[<SBCategory>'exclusive_access', '独家访问']
]);
/** 胶囊短标签（无短标签时回退到完整标签） */
export function bsbCategoryShortLabel(category: SBCategory) {
	return shortLabels.get(category) ?? bsbCategoryLabel(category);
}

/** 分类颜色 */
export function bsbCategoryColor(category: SBCategory) {
	return categoryConfig.get(category)?.color ?? '#00d400';
}

/** 读取用户设定的分类行为，缺省时使用内置默认值 */
function categoryOption(category: SBCategory): SBCategoryOption {
	const raw = user.userStatus?.bsb.category[category];
	return raw === undefined ? categoryConfig.get(category)?.option ?? SBCategoryOption.Disabled : raw;
}

/** 写入用户设定的分类行为 */
function setCategoryOption(category: SBCategory, option: SBCategoryOption) {
	user.userStatus!.bsb.category[category] = option;
}

/** 分类是否启用 */
function isCategoryEnabled(category: SBCategory) {
	return categoryOption(category) !== SBCategoryOption.Disabled;
}

/** 是否自动跳过 */
function shouldAutoSkip(segment: SBTime) {
	return categoryOption(segment.category) === SBCategoryOption.AutoSkip;
}

/** 是否参与跳过（而非仅展示） */
function shouldSkip(segment: SBTime) {
	return categoryOption(segment.category) !== SBCategoryOption.ShowOverlay;
}

/** 秒 -> 时间码 */
function timeCode(sec: number) {
	sec = Math.max(0, Math.round(sec));
	const h = Math.floor(sec / 3600);
	const m = Math.floor(sec % 3600 / 60);
	const s = sec % 60;
	return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
}

/** 生成随机 UUID（本地草稿使用，提交后由服务器下发正式 UUID） */
function generateUUID() {
	return Array.from(crypto.getRandomValues(new Uint32Array(36)), d => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[d % 62]).join('');
}

/**
 * 播放器抽象，统一【重构播放器】与原生旧版播放器。  
 * 注意方法名带 `get` 前缀：`window.player` 是对外门面（`BilibiliPlayer`），
 * 内部 `Player` 实例的 `currentTime()`/`duration()` 并不直接暴露。
 */
interface BSBPlayer {
	/** 当前进度 /s */
	getCurrentTime(): number;
	/** 视频时长 /s */
	getDuration(): number;
	/** 跳转 /s */
	seek(time: number): void;
}

/** 由跳过产生的 seek 记录，用于与用户 seek 区分 */
const skipSeeks = new WeakMap<HTMLVideoElement, { time: number }>();

/**
 * 记录一次由跳过产生的 seek。  
 * 【重构播放器】的 seek 是异步的：`player.seek()` 返回后可能过数百毫秒才真正改变 currentTime，  
 * 若此时标记已失效，`seeking` 事件会被误判为"用户手动拖动"，导致撤销弹窗刚出现就被关闭。  
 * 故标记保留较长时间，并以目标时间做兜底比对。
 */
function markSkipSeek(video: HTMLVideoElement, time: number) {
	const seek = { time };
	skipSeeks.set(video, seek);
	const clear = () => {
		if (skipSeeks.get(video) === seek) skipSeeks.delete(video);
	};
	video.addEventListener('seeked', clear, { once: true });
	// 兜底：某些情况下不会触发 seeked（如跳转到相同位置），超时后清理标记
	setTimeout(clear, 3000);
}

/**
 * 该 seek 是否由跳过产生。  
 * 以标记为准；若标记已过期，则比对跳转前后的时间差——  
 * 落在目标时间附近（±1.5s）即认为是插件自身的跳转。
 */
function isSkipSeek(video: HTMLVideoElement, from?: number) {
	const seek = skipSeeks.get(video);
	if (seek) {
		// 标记存在时进一步确认：跳转到目标时间附近才算
		if (typeof from === 'number' && Math.abs(video.currentTime - from) > 1.5 &&
			Math.abs(video.currentTime - seek.time) > 1.5) return false;
		return true;
	}
	// 标记已过期：若跳转前后时间几乎没变（±1.5s），多半是插件自身的跳过
	if (typeof from === 'number' && Math.abs(video.currentTime - from) <= 1.5) return true;
	return false;
}

/** 已绑定过事件的视频标签，避免重复绑定 */
const boundVideos = new WeakSet<HTMLVideoElement>();

/** 空降助手样式表 */
const BSB_CSS = `
.bsb-notice{position:absolute;right:10px;bottom:10px;display:flex;justify-content:flex-end;pointer-events:none;z-index:10021}
.bsb-notice-bpx{bottom:100px}
.bsb-notice-detached{position:fixed;right:10px;bottom:10px}
.bsb-notice-body{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:4px;background:rgba(0,0,0,.7);color:#fff;font-size:12px;line-height:1.4;pointer-events:auto;white-space:nowrap}
.bsb-notice-label{padding:1px 6px;border-radius:2px;color:#fff;font-weight:bold}
.bsb-notice-unskip{padding:2px 8px;border:0;border-radius:2px;background:#00a1d6;color:#fff;cursor:pointer;font-size:12px}
.bsb-notice-unskip:hover{background:#00b4e6}
.bsb-notice-close{padding:1px 6px;border:0;border-radius:2px;background:#555;color:#fff;cursor:pointer;font-size:12px;line-height:1}
.bsb-notice-close:hover{background:#777}
.bsb-full-badge{display:inline-flex;align-items:center;padding:1px 6px;border-radius:999px;font-size:11px;font-weight:bold;color:#fff;white-space:nowrap;line-height:1.4;vertical-align:middle;opacity:.85}.bsb-preview{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:hidden;border-radius:4px;z-index:0}
.bsb-preview-item{position:absolute;top:0;height:100%;opacity:.85;border-radius:1px;z-index:1}
.bsb-preview-poi{height:150%;top:-25%;opacity:1;border-radius:2px}
.bsb-preview-item::after{content:attr(data-category);position:absolute;bottom:100%;left:50%;transform:translateX(-50%);white-space:nowrap;padding:2px 6px;border-radius:3px;background:rgba(0,0,0,.85);color:#fff;font-size:10px;font-weight:500;opacity:0;pointer-events:none;transition:opacity .15s;z-index:10}
.bsb-preview-item:hover::after{opacity:1}
.bsb-preview-item[data-action-type="poi"]::after{content:"精彩时刻: " attr(data-category)}
.bsb-preview-item[data-action-type="mute"]::after{content:"静音: " attr(data-category)}
.bsb-preview-item[data-action-type="skip"]::after{content:"跳过: " attr(data-category)}
.bsb-preview-item[data-action-type="full"]::after{content:"全片: " attr(data-category)}
.bsb-recommend-badge{display:inline-flex!important;align-items:center!important;justify-content:center!important;box-sizing:content-box!important;width:auto!important;height:auto!important;min-width:0!important;max-width:none!important;max-height:none!important;margin:0!important;padding:1px 5px!important;border:0!important;border-radius:999px!important;font-size:10px!important;font-weight:600!important;font-family:sans-serif!important;line-height:1.4!important;color:#fff!important;background:#fb7299!important;white-space:nowrap!important;box-shadow:0 1px 3px rgba(0,0,0,.25)!important;cursor:help!important;pointer-events:auto!important;text-decoration:none!important;opacity:.75!important}
.bsb-recommend-badge:hover{opacity:1!important}
.bsb-list{max-height:220px;overflow:auto;text-align:left}
.bsb-list-row{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(0,0,0,.1);font-size:12px}
.bsb-list-label{padding:1px 6px;border-radius:2px;color:#fff;white-space:nowrap}
.bsb-list-time{font-family:monospace;white-space:nowrap}
.bsb-list-option{color:#999;white-space:nowrap}
.bsb-list-draft{padding:1px 4px;border-radius:2px;background:#f90;color:#fff;white-space:nowrap}
.bsb-list-vote{margin-left:auto;display:flex;gap:4px;white-space:nowrap}
.bsb-list-vote button{padding:1px 6px;border:0;border-radius:2px;background:#eee;cursor:pointer;font-size:12px}
.bsb-list-vote button:hover{background:#ddd}
.bsb-dialog{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,90vw);background:#fff;border-radius:6px;box-shadow:0 4px 24px rgba(0,0,0,.25);padding:16px;z-index:10022;color:#333;font-size:13px;line-height:1.5}
.bsb-dialog-title{font-size:15px;font-weight:bold;margin-bottom:10px;text-align:center}
.bsb-dialog-close{margin-top:12px;padding:4px 0;text-align:center;border-radius:4px;background:#00a1d6;color:#fff;cursor:pointer}
.bsb-dialog-close:hover{background:#00b4e6}
`;

/** 空降助手 */
class BilibiliSponsorBlock {
	/** 当前稿件 bvid */
	protected bvid = '';
	/** 当前分P cid */
	protected cid = '';
	/** 服务器片段 */
	protected segments: SBTime[] = [];
	/** 本地草稿（待提交），同样参与跳过 */
	protected submitting: SBTime[] = [];
	/** 调度代际，切换视频/取消调度时递增以作废旧闭包 */
	protected generation = 0;
	/** 待跳转定时器 */
	protected timer?: number;
	/** 跳过提示节点 */
	protected notice?: HTMLDivElement;
	/** 提示关闭定时器 */
	protected noticeTimer?: number;
	/** 已上报过的片段 UUID（去重） */
	protected counted = new Set<string>();
	/** 正在请求片段 */
	protected fetching = false;
	/** 用户主动撤销过自动跳过的片段 UUID */
	protected cancelled = new Set<string>();
	constructor() {
		switchVideo(() => this.reset());
	}
	/** 当前稿件是否可查询 */
	protected get available() {
		return !!user.userStatus?.bsb.enabled && !!this.bvid && !!this.cid;
	}
	/** 当前稿件缓存键 */
	protected get key() {
		return `${this.bvid}+${this.cid}`;
	}
	/** 稿件级缓存键，切P时不必重新请求 */
	protected get bvidKey() {
		return this.bvid;
	}
	/** 刷新当前稿件标识 */
	protected updateIdentity() {
		this.bvid = BLOD.bvid || '';
		if (!this.bvid && BLOD.aid) {
			try {
				this.bvid = AV.toBV(Number(BLOD.aid));
			} catch (e) {
				// aid 超出 BV 编码范围（理论上不会发生）：退化为不使用空降助手，
				// 不弹错误打扰用户——空降助手本就是可选增强功能。
				debug.debug('空降助手：aid 转 BV 失败，放弃本次查询', e);
				this.bvid = '';
			}
		}
		// 旧版播放器可能下发形如 `BV1xx411c7mD` 之外的短号，规范化一下
		this.bvid = this.bvid.replace(/^[bB][vV]/, 'BV');
		this.cid = BLOD.cid ? String(BLOD.cid) : '';
	}
	/** 重置当前稿件状态 */
	protected reset() {
		this.cancelSchedule();
		this.hideNotice();
		const prevBvid = this.bvidKey;
		this.updateIdentity();
		this.counted.clear();
		this.cancelled.clear();
		this.manualNoticed = '';
		this.manualSegment = undefined;
		// 稿件切换才丢弃草稿与旧数据，切P/刷新保留
		if (prevBvid !== this.bvidKey) {
			this.submitting = [];
			this.rawSegments = [];
			this.loadedBvid = '';
		}
		this.applySegments();
		if (!this.available) return;
		// 稿件级数据已缓存：切P只需本地过滤
		if (this.loadedBvid === this.bvidKey) {
			this.renderPreviewBar();
			this.segments.length && this.startSchedule();
			return;
		}
		this.lookup();
	}
	/** 已请求过片段的稿件，切P时复用原始数据 */
	protected loadedBvid = '';
	/** 稿件原始片段数据（未按 cid/分类过滤） */
	protected rawSegments: SBTime[] = [];
	/** 从原始数据中提取当前分P可用片段 */
	protected applySegments() {
		this.segments = this.rawSegments
			// 服务器返回的 cid 可能是字符串也可能是数字，统一按字符串比较
			.filter(d => String(d.cid) === String(this.cid) && isCategoryEnabled(<SBCategory>d.category))
			.filter(d => d.hidden === undefined || d.hidden === SBHideType.Visible)
			// 点踩过的片段本地隐藏（与服务器无关，切P回来仍然隐藏）
			.filter(d => !this.downvoted.has(d.UUID))
			.map(d => ({ ...d, source: SBSourceType.Server }))
			.sort((a, b) => a.segment[0] - b.segment[0]);
		this.updateFullVideoBadge();
	}
	/**
	 * 更新"全片"胶囊标记。  
	 * 服务器把整片标记下发为 `actionType: "full"` 且 `segment: [0, 0]`（起止时间无意义），  
	 * 故以 `actionType` 为准，同时兼容"起止覆盖整部时长"的普通片段。
	 */
	protected updateFullVideoBadge() {
		const duration = Number(this.player()?.getDuration()) || 0;
		const full = this.allSegments.find(d => {
			if (d.actionType === SBActionType.Full) return true;
			// 兼容：普通片段但起止覆盖整部视频
			return d.segment.length === 2 && duration > 1 &&
				d.segment[0] <= 0.5 && d.segment[1] >= duration - 1;
		});
		// 移除旧标记
		document.querySelectorAll('.bsb-full-badge').forEach(e => e.remove());
		// 只展示广告类分类（赞助/自我推广），开场动画等不展示
		if (!full || !bsbIsAdCategory(full.category)) return;
		// 旧版页面：稿件信息条 `.tm-info`（显示分区、发布时间等）
		const tmInfo = document.querySelector<HTMLElement>('.tm-info, .tminfo');
		// 新版页面：播放器信息区
		const bpxInfo = document.querySelector<HTMLElement>('.bpx-player-video-info');
		const badge = document.createElement('span');
		badge.className = 'bsb-full-badge';
		badge.style.backgroundColor = bsbCategoryColor(full.category);
		badge.textContent = bsbCategoryShortLabel(full.category);
		badge.title = '本视频被标记为整段内容（该分类覆盖全片）';
		if (tmInfo) {
			// 放在信息条内部最左侧（行内元素，不影响下方布局）
			badge.style.display = 'inline-block';
			badge.style.marginRight = '6px';
			badge.style.verticalAlign = 'middle';
			tmInfo.insertBefore(badge, tmInfo.firstChild);
		} else if (bpxInfo) {
			bpxInfo.insertBefore(badge, bpxInfo.firstChild);
		}
	}
	/** 被用户点踩的片段 UUID（本地隐藏） */
	protected downvoted = new Set<string>();
	/** 请求片段 */
	protected async lookup(ignoreCache = false) {
		if (this.fetching) return;
		if (!this.available) return;
		this.fetching = true;
		const bvidKey = this.bvidKey;
		try {
			const buckets = await bsbGetSegments(this.bvid, ignoreCache);
			if (this.bvidKey !== bvidKey) return; // 请求期间已切换稿件
			this.rawSegments = buckets.find(d => d.videoID === this.bvid)?.segments ?? [];
			this.loadedBvid = bvidKey;
			this.applySegments();
			debug('空降助手：获取片段', this.rawSegments.length, '当前分P', this.segments.length);
			this.renderPreviewBar();
			this.startSchedule();
		} catch (e) {
			debug.error('空降助手：获取片段出错', e);
		} finally {
			this.fetching = false;
		}
	}
	/**
	 * 批量查询多个 bvid 的片段  
	 * 返回 Map<bvid, SBTime[]>，value 为该稿件的片段列表（无片段则为空数组）
	 */
	async checkMultipleBvids(bvids: string[]): Promise<Map<string, SBTime[]>> {
		const result = new Map<string, SBTime[]>();
		if (!bvids.length) return result;
		// 按前缀分组
		const groups = new Map<string, string[]>();
		for (const bvid of bvids) {
			const prefix = await bsbHashPrefix(bvid);
			const arr = groups.get(prefix) ?? [];
			arr.push(bvid);
			groups.set(prefix, arr);
		}
		debug('空降助手：查询推荐视频', bvids.length, '个稿件', groups.size, '个分桶');
		// 限制并发地获取每个前缀的桶
		const entries = Array.from(groups.entries());
		const concurrency = 4;
		for (let i = 0; i < entries.length; i += concurrency) {
			await Promise.all(entries.slice(i, i + concurrency).map(async ([prefix, groupBvids]) => {
				try {
					const response = await bsbRequest<SBSegmentBucket[]>('GET', `/api/skipSegments/${prefix}`);
					const buckets = response.data ?? [];
					for (const bvid of groupBvids) {
						const bucket = buckets.find((d: SBSegmentBucket) => d.videoID === bvid);
						const segments = (bucket?.segments ?? []).filter((d: SBTime) =>
							d.actionType === SBActionType.Skip ||
							d.actionType === SBActionType.Poi ||
							d.actionType === SBActionType.Mute
						);
						result.set(bvid, segments);
					}
				} catch (e) {
					debug.error('空降助手：查询推荐视频出错', prefix, e);
					groupBvids.forEach(b => result.set(b, []));
				}
			}));
		}
		return result;
	}
	/** 取消调度 */
	protected cancelSchedule() {
		this.generation++;
		this.timer && clearTimeout(this.timer);
		this.timer = undefined;
	}
	/**
	 * 播放器实例。  
	 * 播放器初始化过程中 `window.player` 会先被赋成空对象（`window.player = {}`），  
	 * 此时尚未具备完整 API，必须判活，否则 `currentTime`/`duration` 调用会抛错。  
	 * 新版播放器（`.bpx-player-*`）没有暴露这套门面 API，此时退化为直接操作 `<video>`。
	 */
	protected player(): BSBPlayer | undefined {
		const player = (<any>window).player;
		if (player && typeof player.seek === 'function' &&
			typeof player.getCurrentTime === 'function' && typeof player.getDuration === 'function') return player;
		// 退化为直接操作视频标签
		const video = this.videoElement();
		if (!video) return;
		return {
			getCurrentTime: () => Number(video.currentTime) || 0,
			getDuration: () => Number(video.duration) || 0,
			seek: (time: number) => { video.currentTime = time; }
		};
	}
	/** 播放器视频标签，【重构播放器】与原生旧版播放器均在 `#bilibiliPlayer` 内 */
	protected videoElement(): HTMLVideoElement | undefined {
		// 依次在【重构播放器】容器、原生播放器容器、新版播放器容器中查找，
		// 避免同时存在多个播放器时选中错误的那个
		const candidates: HTMLVideoElement[] = [];
		for (const selector of ['#bilibiliPlayer video', '#bofqi video', '#bilibili-player video', '.bpx-player-video-area video']) {
			document.querySelectorAll<HTMLVideoElement>(selector).forEach(d => candidates.push(d));
		}
		if (!candidates.length) return undefined;
		// 播放器重建时会先把视频标签缓存到隐藏容器里，缓存标签尺寸为 0，
		// 取面积最大的（正在显示的那个）作为当前视频
		let best = candidates[0];
		let bestArea = 0;
		for (const video of candidates) {
			const area = video.clientWidth * video.clientHeight;
			if (area > bestArea) {
				bestArea = area;
				best = video;
			}
		}
		return best;
	}
	/**
	 * 提示挂载点：播放器的视频区域。  
	 * 【重构播放器】与上古播放器的视频区域为 `.bilibili-player-video-wrap`（`position:relative`），  
	 * 新版播放器为 `.bpx-player-video-area`，提示挂到此处才能与播放器对齐（跟随全屏、宽屏、迷你播放器等布局变化）。
	 */
	protected noticeHost(): HTMLElement | undefined {
		const video = this.videoElement();
		const host = video?.closest<HTMLElement>('.bilibili-player-video-wrap')
			?? video?.closest<HTMLElement>('.bpx-player-video-area')
			// 视频标签被播放器临时缓存到隐藏容器时，回退到播放器内的视频区域
			?? document.querySelector<HTMLElement>('#bilibiliPlayer .bilibili-player-video-wrap')
			?? document.querySelector<HTMLElement>('#bilibiliPlayer .bpx-player-video-area')
			?? document.querySelector<HTMLElement>('.bpx-player-video-area')
			?? video?.closest<HTMLElement>('#bilibiliPlayer');
		return host ?? undefined;
	}
	/**
	 * 参与调度的全部片段（服务器 + 本地草稿）。  
	 * 草稿按分P过滤：切P后其它分P的草稿不应参与当前视频的跳过。
	 */
	protected get allSegments() {
		return this.segments.concat(this.submitting.filter(d => String(d.cid) === String(this.cid)));
	}
	/** 参与跳过的片段：只处理 `skip` 行为，排除 poi/mute/full、零长度片段及用户已撤销的自动跳过片段 */
	protected get skippable() {
		return this.allSegments.filter(d =>
			d.segment.length === 2 && d.segment[0] !== d.segment[1] &&
			d.actionType === SBActionType.Skip &&
			shouldSkip(d) && !(shouldAutoSkip(d) && this.cancelled.has(d.UUID)));
	}
	/** 调度下一次跳过 */
	protected startSchedule() {
		this.cancelSchedule();
		const player = this.player();
		if (!player || !this.available) return;
		const generation = ++this.generation;
		const video = this.videoElement();
		if (!video) return;
		const current = Number(player.getCurrentTime()) || 0;
		const duration = Number(player.getDuration()) || 0;
		if (video.paused || (duration > 1 && current >= duration - 0.01)) return;
		const all = this.skippable;
		if (!all.length) return;

		// 已经过了手动提示的片段：撤掉提示，允许提示下一个片段
		if (this.manualSegment && current > this.manualSegment.segment[1]) {
			this.hideNotice();
			this.manualNoticed = '';
			this.manualSegment = undefined;
		}

		// 当前正处于某个片段内：立即跳过
		const inside = all.find(d => d.segment[0] - skipBuffer <= current && d.segment[1] > current);
		if (inside) {
			if (shouldAutoSkip(inside)) {
				this.skip(inside, inside.segment[1]);
			} else {
				// 手动跳过：弹出跳过按钮而不自动跳
				this.noticeManual(inside);
			}
			return;
		}
		// 寻找下一个待跳过片段（链式合并相邻的自动跳过片段）
		const next = this.nextSegment(current);
		if (!next) return;
		// 手动跳过的片段提前提示，让用户能在进入片段前操作
		const lead = shouldAutoSkip(next.segment) ? 0 : manualNoticeLead;
		const delay = Math.max(0, (next.start - lead - current) * 1000 / (video.playbackRate || 1));
		this.timer = setTimeout(() => {
			if (generation !== this.generation) return;
			const p = this.player();
			if (!p || !this.available) return;
			// 延时期间用户已手动跳转：按新进度重新调度
			if (Math.abs(p.getCurrentTime() - current) > 1) {
				this.startSchedule();
				return;
			}
			if (shouldAutoSkip(next.segment)) {
				this.skip(next.segment, next.end);
			} else {
				this.noticeManual(next.segment);
			}
		}, delay);
	}
	/** 合并相邻片段，返回下一个待跳过片段及其（合并后的）终止时间 */
	protected nextSegment(current: number) {
		const candidates = this.skippable
			.filter(d => d.segment[0] > current - skipBuffer)
			.sort((a, b) => a.segment[0] - b.segment[0]);
		if (!candidates.length) return;
		const segment = candidates[0];
		let end = segment.segment[1];
		// 只对自动跳过的片段做链式合并，手动跳过的片段单独处理
		if (shouldAutoSkip(segment)) {
			for (const d of candidates) {
				if (d === segment || !shouldAutoSkip(d)) continue;
				if (d.segment[0] - skipBuffer <= end && d.segment[1] > end) {
					end = d.segment[1];
				}
			}
		}
		return { segment, start: segment.segment[0], end };
	}
	/** 执行跳过 */
	protected skip(segment: SBTime, end: number) {
		const player = this.player();
		if (!player || !this.available) return;
		const duration = Number(player.getDuration()) || 0;
		// 片段直达片尾时留一点余量，避免触发播放结束逻辑
		const target = duration > 1 && Math.abs(end - duration) < endTimeSkipBuffer ? duration - 0.1 : end;
		const video = this.videoElement();
		video && markSkipSeek(video, target);
		player.seek(target);
		if (shouldAutoSkip(segment)) {
			this.countSkipped([segment]);
			this.noticeSkipped(segment);
		} else {
			this.hideNotice();
		}
		// 跳过会触发 seeking 事件，此处重新排一次调度（撤销弹窗不应被自身跳转关闭）
		this.startSchedule();
	}
	/** 统计并上报 */
	protected countSkipped(segments: SBTime[]) {
		for (const segment of segments) {
			if (this.counted.has(segment.UUID)) continue;
			this.counted.add(segment.UUID);
			if (segment.source === SBSourceType.Server) {
				bsbViewedVideoSponsorTime(segment.UUID);
			}
		}
	}
	/** 显示跳过提示 */
	protected noticeSkipped(segment: SBTime) {
		if (!user.userStatus!.bsb.notice) return;
		this.hideNotice();
		this.notice = this.createNotice(segment, `片段 ${timeCode(segment.segment[0])} ~ ${timeCode(segment.segment[1])}`, '撤销', () => {
			this.hideNotice();
			this.cancelSchedule();
			// 撤销后不再自动跳过该片段，否则会立刻跳回片段末尾
			this.cancelled.add(segment.UUID);
			this.player()?.seek(segment.segment[0] + 0.001);
			this.startSchedule();
		});
	}
	/** 手动跳过提示：只提供按钮，不自动跳 */
	protected noticeManual(segment: SBTime) {
		// timeupdate 约 4Hz 触发，同一片段只提示一次
		if (this.manualNoticed === segment.UUID) return;
		this.manualNoticed = segment.UUID;
		this.manualSegment = segment;
		this.hideNotice();
		// 提示常驻，直到用户操作或片段结束，避免错过
		this.notice = this.createNotice(segment, `片段 ${timeCode(segment.segment[0])} ~ ${timeCode(segment.segment[1])}`, '跳过', () => {
			this.hideNotice();
			this.manualNoticed = '';
			this.manualSegment = undefined;
			this.skip(segment, segment.segment[1]);
		}, true);
	}
	/** 已提示过的手动跳过片段 UUID */
	protected manualNoticed = '';
	/** 当前正在提示的手动跳过片段 */
	protected manualSegment?: SBTime;
	/**
	 * 创建跳过提示
	 * @param segment 片段
	 * @param text 提示文案
	 * @param button 按钮文字
	 * @param callback 按钮回调
	 */
	protected createNotice(segment: SBTime, text: string, button: string, callback: () => void, sticky = false) {
		// 提示挂到播放器的视频区域，与播放器对齐；找不到播放器时退化为页面右下角提示
		const host = this.noticeHost();
		const cls = host
			? `bsb-notice${host.classList.contains('bpx-player-video-area') ? ' bsb-notice-bpx' : ''}`
			: 'bsb-notice bsb-notice-detached';
		const notice = addElement('div', { class: cls }, host ?? document.body);
		notice.innerHTML = `<div class="bsb-notice-body">
			<span class="bsb-notice-label" style="background:${bsbCategoryColor(segment.category)}">${bsbCategoryLabel(segment.category)}</span>
			<span class="bsb-notice-text">${text}</span>
			<button class="bsb-notice-unskip" type="button">${button}</button>
			<button class="bsb-notice-close" type="button">✕</button>
		</div>`;
		notice.querySelector('.bsb-notice-unskip')?.addEventListener('click', callback);
		const closeBtn = notice.querySelector<HTMLButtonElement>('.bsb-notice-close');
		closeBtn?.addEventListener('click', () => {
			this.hideNotice();
			closeBtn?.blur();
		});
		this.positionNotice(notice, host);
		if (!sticky) this.noticeTimer = setTimeout(() => this.hideNotice(), noticeDelay * 1e3);
		return notice;
	}
	/**
	 * 定位提示：贴着**视频画面**的右下角，而不是容器边缘。  
	 * 播放器画面常有黑边（4:3 视频放在 16:9 容器里；重构播放器还会用 padding 模拟黑边），  
	 * 贴着容器边缘会让提示飘在黑边上，所以这里按视频元素的**内容盒**换算偏移。  
	 * 全屏时控制条浮在画面上方，需要把提示抬高到控制条之上。
	 */
	protected positionNotice(notice: HTMLElement, host?: HTMLElement) {
		if (!host) return;
		// 提示是绝对定位，需要挂载点为定位元素
		if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
		const video = this.videoElement();
		if (!video) return;
		const vRect = video.getBoundingClientRect();
		const hRect = host.getBoundingClientRect();
		if (!vRect.width || !hRect.width) return;
		// 重构播放器用 padding 模拟黑边，内容盒才是真正的画面区域
		const style = getComputedStyle(video);
		const padR = parseFloat(style.paddingRight) || 0;
		const padB = parseFloat(style.paddingBottom) || 0;
		const right = vRect.right - padR;
		const bottom = vRect.bottom - padB;
		// 画面右边缘与容器右边缘的差值（容器坐标，向右为正）
		const offsetRight = hRect.right - right + 10;
		// 画面下边缘与容器下边缘的差值
		let offsetBottom = hRect.bottom - bottom + 10;
		// 全屏时控制条浮在画面之上，提示需抬到控制条之上
		const control = this.controlBar();
		if (control) {
			const cRect = control.getBoundingClientRect();
			// 控制条与画面区域有重叠（浮在画面上）时，按控制条高度抬高提示
			if (cRect.top < bottom && cRect.height > 0) {
				offsetBottom += bottom - cRect.top;
			}
		}
		notice.style.right = `${Math.max(0, offsetRight)}px`;
		notice.style.bottom = `${Math.max(0, offsetBottom)}px`;
	}
	/** 播放器控制条（全屏时浮在画面上） */
	protected controlBar(): HTMLElement | undefined {
		return document.querySelector<HTMLElement>('.bilibili-player-video-control')
			?? document.querySelector<HTMLElement>('.bpx-player-control-bottom')
			?? undefined;
	}
	/** 隐藏跳过提示 */
	protected hideNotice() {
		this.noticeTimer && clearTimeout(this.noticeTimer);
		this.noticeTimer = undefined;
		this.notice?.remove();
		this.notice = undefined;
	}
	/** 进度条片段预览条 */
	protected previewBar?: HTMLDivElement;
	/** 预览条当前挂载的进度条节点，节点被替换时重新挂载 */
	protected previewHost?: Element;
	/** 渲染进度条预览条 */
	protected renderPreviewBar() {
		// 优先挂在进度条的滑轨上（`.bpui-slider-tracker`，即那条 6px 的进度线），
		// 找不到滑轨时退化为整个进度条容器
		const bar = document.querySelector('.bilibili-player-video-progress .bpui-slider-tracker')
			?? document.querySelector('.bilibili-player-video-progress-bar')
			?? document.querySelector('.bpx-player-progress .bpx-player-progress-schedule');
		// 进度条节点被播放器重建（切P/切清晰度）时重新挂载
		if (this.previewBar && this.previewHost !== bar) {
			this.previewBar.remove();
			this.previewBar = undefined;
			this.previewKey = '';
		}
		if (this.previewBar && this.previewBar.parentElement !== bar) {
			this.previewBar.remove();
			this.previewBar = undefined;
			this.previewKey = '';
		}
		if (!bar) {
			this.previewHost = undefined;
			return;
		}
		this.previewHost = bar;
		if (!this.available) {
			// 功能被禁用：撤掉已有预览条
			this.previewBar?.remove();
			this.previewBar = undefined;
			this.previewKey = '';
			return;
		}
		// 预览条展示所有非整片的片段（与 SponsorBlock 行为一致）：
		// 整片（full）片段会覆盖整条进度条，没有意义；精彩时刻（poi）以更高的标记展示
		const segments = this.allSegments.filter(d =>
			d.segment.length === 2 && d.segment[0] !== d.segment[1] &&
			d.actionType !== SBActionType.Full);
		if (!segments.length) {
			this.previewBar?.remove();
			this.previewBar = undefined;
			this.previewKey = '';
			return;
		}
		const duration = Number(this.player()?.getDuration()) || 0;
		if (!(duration > 1)) return;
		const cacheKey = this.previewCacheKey(duration);
		// 已挂载且数据/时长未变：无需重绘
		if (this.previewBar && this.previewKey === cacheKey) return;
		this.previewBar?.remove();
		const preview = addElement('div', { class: 'bsb-preview' }, <HTMLElement>bar);
		segments.forEach(d => {
			const left = d.segment[0] / duration * 100;
			const width = (d.segment[1] - d.segment[0]) / duration * 100;
			// 精彩时刻（poi）以更高的标记展示，便于识别
			const poi = d.actionType === SBActionType.Poi;
			const item = addElement('div', {
				class: `bsb-preview-item${poi ? ' bsb-preview-poi' : ''}`,
				style: `left:${left}%;width:${width}%;background:${bsbCategoryColor(d.category)}`
			}, preview);
			// 添加 data 属性供 hover tooltip 显示片段类型
			item.dataset.category = d.category;
			item.dataset.actionType = d.actionType;
			item.dataset.start = String(d.segment[0]);
			item.dataset.end = String(d.segment[1]);
		});
		this.previewBar = preview;
		this.previewKey = cacheKey;
	}
	/** 预览条缓存键，数据/时长未变时跳过重绘 */
	protected previewKey = '';
	protected previewCacheKey(duration: number) {
		return `${duration}|${this.allSegments.map(d => `${d.UUID},${d.segment[0]},${d.segment[1]},${d.category}`).join(';')}`;
	}
	/** 绑定播放器事件 */
	protected bindVideo() {
		const video = this.videoElement();
		if (!video || boundVideos.has(video)) return;
		boundVideos.add(video);
		// 用户主动 seek 时撤掉调度，由 play/timeupdate 按新进度重排
		let lastTime = video.currentTime;
		video.addEventListener('seeking', () => {
			const from = lastTime;
			lastTime = video.currentTime;
			if (!this.available) return;
			// 是插件自身触发的跳转（如自动跳过），不关闭提示
			if (!isSkipSeek(video, from)) {
				this.manualNoticed = '';
				this.manualSegment = undefined;
				this.hideNotice(); // 用户手动调整进度条，关闭跳过提示
				this.cancelSchedule();
			}
		});
		video.addEventListener('timeupdate', () => { lastTime = video.currentTime; });
		// 播放推进/恢复播放时重排（含用户 seek 后的第一次 timeupdate）
		const restart = () => {
			if (!this.available) return;
			if (video.paused) {
				this.cancelSchedule();
				return;
			}
			this.startSchedule();
		};
		video.addEventListener('timeupdate', restart);
		video.addEventListener('play', restart);
		video.addEventListener('durationchange', () => this.renderPreviewBar());
		// 播放器就绪时立即重排一次，避免错过首个片段
		restart();
	}
	/** 新建本地草稿 */
	protected createSegment() {
		const player = this.player();
		if (!player) return toast.warning('未找到播放器实例！请在播放页面使用。');
		const time = Math.round((Number(player.getCurrentTime()) + Number.EPSILON) * 1000) / 1000;
		if (this.creatingSegment) {
			// 第二次点击：确定上一段草稿的终点
			const seg = this.creatingSegment;
			seg.segment = [Math.min(seg.segment[0], time), Math.max(seg.segment[0], time)];
			this.creatingSegment = undefined;
		} else {
			// 第一次点击：新建草稿，等待第二次点击确定终点
			const seg: SBTime = {
				segment: [time, time],
				cid: this.cid,
				UUID: generateUUID(),
				category: <SBCategory>'sponsor',
				actionType: SBActionType.Skip,
				source: SBSourceType.Local
			};
			this.submitting.push(seg);
			this.creatingSegment = seg;
		}
		this.renderPreviewBar();
		this.startSchedule();
		toast.info('已标记片段', this.submitting.map(d => `${timeCode(d.segment[0])} ~ ${timeCode(d.segment[1])}`).join('<br>'));
	}
	/** 正在等待确定终点的草稿 */
	protected creatingSegment?: SBTime;
	/** 取消正在创建的草稿 */
	protected cancelCreating() {
		if (!this.creatingSegment) return;
		this.submitting = this.submitting.filter(d => d !== this.creatingSegment);
		this.creatingSegment = undefined;
		this.renderPreviewBar();
		this.startSchedule();
	}
	/** 清除所有草稿 */
	protected clearSubmitting() {
		this.submitting = [];
		this.creatingSegment = undefined;
		this.renderPreviewBar();
		this.startSchedule();
	}
	/** 提交草稿 */
	protected async submitSegments() {
		// 只提交当前分P、且已确定终点的草稿
		const drafts = this.submitting.filter(d => String(d.cid) === String(this.cid) && d.segment[0] !== d.segment[1]);
		if (!drafts.length) return toast.warning('没有待提交的片段！');
		if (!this.available) return toast.warning('无法获取稿件信息！');
		const duration = Number(this.player()?.getDuration()) || 0;
		const msg = toast.list('提交空降片段 >>>');
		try {
			const { segments, status } = await bsbSubmitSegments(this.bvid, this.cid, drafts.map(d => ({ ...d })), duration);
			if (status === 200 && segments.length) {
				// 用服务器返回的正式 UUID 替换本地草稿
				segments.forEach((d, i) => drafts[i] && (drafts[i].UUID = d.UUID));
				this.segments = this.segments.concat(segments.map(d => ({ ...d, source: SBSourceType.Server })))
					.sort((a, b) => a.segment[0] - b.segment[0]);
				msg.push('------ 提交成功 ------');
				msg.type = 'success';
				this.submitting = this.submitting.filter(d => !drafts.includes(d));
				this.creatingSegment = undefined;
				this.renderPreviewBar();
				this.startSchedule();
			} else {
				throw new Error(`HTTP ${status}`);
			}
		} catch (e) {
			msg.push('------ 提交失败 ------', e);
			msg.type = 'error';
		} finally {
			msg.delay = user.userStatus!.toast.delay;
		}
	}
	/** 投票 */
	protected async vote(segment: SBTime, type: BSBVoteType) {
		const status = await bsbVote(segment.UUID, type);
		if (status === 200) {
			toast.success(type === BSBVoteType.Up ? '已点赞该片段' : '已点踩该片段');
			// 记录自己的投票，用于在列表中标识
			if (type === BSBVoteType.Up) {
				this.upvoted.add(segment.UUID);
				this.downvoted.delete(segment.UUID);
			} else {
				this.downvoted.add(segment.UUID);
				this.upvoted.delete(segment.UUID);
			}
			this.saveVotes();
			// 点踩后本地隐藏该片段
			if (type === BSBVoteType.Down) {
				this.applySegments();
				this.renderPreviewBar();
				this.startSchedule();
			}
		} else if (status === 405) {
			// 重复投票
			toast.warning('你已经投过票了');
		} else {
			toast.error('投票失败！', `HTTP ${status}`);
		}
	}
	/** 自己点赞过的片段 UUID */
	protected upvoted = new Set<string>();
	/**
	 * 保存自己的投票记录
	 */
	protected saveVotes() {
		try {
			GM.setValue('bsbVotes', {
				up: Array.from(this.upvoted),
				down: Array.from(this.downvoted)
			});
		} catch (e) {
			debug.error('空降助手：保存投票记录失败', e);
		}
	}
	/**
	 * 读取自己保存的投票记录
	 */
	protected async loadVotes() {
		try {
			const raw = await GM.getValue<{ up?: string[]; down?: string[] }>('bsbVotes');
			if (raw) {
				(raw.up ?? []).forEach((d: string) => this.upvoted.add(d));
				(raw.down ?? []).forEach((d: string) => this.downvoted.add(d));
			}
		} catch (e) {
			debug.error('空降助手：读取投票记录失败', e);
		}
	}
	/**
	 * 查询片段是否已被自己投票
	 * @param segment 片段
	 * @returns 1 表示已点赞，-1 表示已点踩，0 表示未投票
	 */
	voteState(segment: SBTime): number {
		if (this.upvoted.has(segment.UUID)) return 1;
		if (this.downvoted.has(segment.UUID)) return -1;
		return 0;
	}
	/**
	 * 注入样式表。  
	 * 旧版页面在 `document_start` 阶段会整体重建 `<head>`，把先前插入的 `<style>` 冲掉，  
	 * 故这里保留节点引用，并在被移除后重新挂载（与 `Scrollbar` 的做法一致）。
	 */
	protected injectStyle() {
		if (!this.style) {
			this.style = document.createElement('style');
			this.style.setAttribute('type', 'text/css');
			this.style.setAttribute('id', 'bsb-notice');
			this.style.textContent = BSB_CSS;
		}
		if (!document.head) return;
		if (this.style.parentElement !== document.head) document.head.appendChild(this.style);
	}
	/** 样式节点 */
	protected style?: HTMLStyleElement;
	/** 加载：播放器就绪后开始工作 */
	load() {
		this.injectStyle();
		this.updateIdentity();
		// 读取历史投票记录（异步），读完后重新过滤片段
		this.loadVotes().then(() => {
			this.applySegments();
			this.renderPreviewBar();
		});
		// 开关切换时重新开始/停止工作
		user.bindChange('bsb', () => {
			if (user.userStatus!.bsb.enabled) {
				this.reset();
			} else {
				this.cancelSchedule();
				this.hideNotice();
				this.renderPreviewBar();
			}
			// 视频卡片标识开关可能已变化，立即重扫一次
			this.scanAndMarkRecommendations();
		});
		// 稿件就绪后立即尝试一次
		this.reset();
		// 视频标签可能在切P/切清晰度时被替换，首次出现时尽快绑定
		poll(() => this.videoElement(), () => this.bindVideo(), 300, 0);
		// 兜底轮询：
		// 1. 旧版页面会重建 `<head>`，把样式表冲掉，需重新挂载；
		// 2. switchVideo 依赖播放器 DOM 重建，个别路径（如嵌入式播放器）可能漏触发，
		//    轮询稿件标识变化，确保切P/切视频后能重新获取片段；
		// 3. 播放器就绪晚于 durationchange（`window.player` 先是空对象），
		//    此时拿不到时长画不出预览条，这里补一次重绘（有缓存键，不会重复绘制）；
		// 4. 播放器重建视频标签后需要重新绑定事件，否则切换分P后不再触发跳过调度。
		setInterval(() => {
			this.injectStyle();
			this.bindVideo();
			// 播放器尺寸变化（宽屏/全屏/窗口缩放）后重新定位提示
			if (this.notice) this.positionNotice(this.notice, this.noticeHost());
			if (!user.userStatus?.bsb.enabled) return;
			const prev = this.key;
			this.updateIdentity();
			if (prev !== this.key) {
				this.reset();
			} else {
				this.renderPreviewBar();
			}
		}, 1000);
		// 推荐视频/看过该视频的还喜欢 扫描器（每 5 秒运行一次，与播放器无关）
		this.startCardScanner();
	}
	/** 视频卡片扫描器是否已启动 */
	protected cardScannerStarted = false;
	/**
	 * 启动视频卡片扫描器。  
	 * 该功能与播放器无关（首页、频道页、搜索页等也需要），故独立于 `load()` 启动。
	 */
	startCardScanner() {
		if (this.cardScannerStarted) return;
		this.cardScannerStarted = true;
		this.injectStyle();
		setInterval(() => {
			// 旧版页面会重建 `<head>`，样式可能被冲掉，需重新挂载
			this.injectStyle();
			if (!user.userStatus?.bsb.enabled) return;
			this.scanAndMarkRecommendations();
		}, 3000);
		// 页面渲染完成后再扫一次，避免首帧没有卡片
		setTimeout(() => this.scanAndMarkRecommendations(), 1500);
	}
	/** 启动推荐视频扫描器 */
	protected startRecommendationScanner() {
		setInterval(() => {
			if (!user.userStatus?.bsb.enabled) return;
			this.scanAndMarkRecommendations();
		}, 5000);
	}	/**
	 * 扫描页面上的视频卡片（通用），标记有空降片段的视频
	 */
	protected async scanAndMarkRecommendations() {
		// 视频卡片标识开关关闭：清除已有标识并不再请求
		if (!user.userStatus?.bsb.cardBadge) {
			document.querySelectorAll('.bsb-recommend-badge').forEach(e => e.remove());
			this.videoHasSkip.clear();
			return;
		}
		// 收集页面上的所有视频卡片
		const videoCards = this.collectVideoCards();
		if (!videoCards.length) return;
		// 只查询尚未查询过的稿件，避免重复请求
		const pending = Array.from(new Set(videoCards.map(d => d.bvid)))
			.filter(d => !this.videoHasSkip.has(d))
			.slice(0, maxCardQueryPerScan);
		if (pending.length) {
			const results = await this.checkMultipleBvids(pending);
			results.forEach((v, k) => this.videoHasSkip.set(k, v));
		}
		// 注入标记：列表可能被播放器重绘，故每次都补一次（已存在则跳过）
		for (const d of videoCards) {
			const segments = this.videoHasSkip.get(d.bvid);
			if (!segments?.length) continue;
			this.injectRecommendationBadge(d.bvid, d.host, segments);
		}
	}
	/** 稿件的空降片段（查询结果缓存，避免重复请求） */
	protected videoHasSkip = new Map<string, SBTime[]>();
	/**
	 * 收集页面上的所有视频卡片（通用实现，不局限于某一类推荐位）  
	 * 凡是带封面的视频链接都纳入范围：首页推荐、播放器推荐、"看过该视频的还喜欢"、相关推荐、UP 主投稿等。  
	 * 只收集视口内的卡片，避免首页无限滚动时一次性请求过多。
	 */
	protected collectVideoCards(): { bvid: string; host: HTMLElement }[] {
		const cards: { bvid: string; host: HTMLElement }[] = [];
		const seen = new Set<Element>();
		const vh = window.innerHeight || 800;
		document.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"]').forEach(link => {
			const bvid = this.extractBvidFromCard(link);
			// 跳过当前稿件与无封面的纯文字链接
			if (!bvid || bvid === this.bvid) return;
			const img = link.querySelector('img');
			if (!img) return;
			const host = this.findBadgeHost(link, img);
			if (!host || seen.has(host)) return;
			// 只处理视口内（含上下各一屏）的卡片
			const rect = host.getBoundingClientRect();
			if (!rect.width || !rect.height) return;
			if (rect.top > vh * 2 || rect.bottom < -vh) return;
			seen.add(host);
			cards.push({ bvid, host });
		});
		return cards;
	}
	/**
	 * 查找用于承载角标的封面容器
	 * @param link 视频链接
	 * @param img 封面图片
	 */
	protected findBadgeHost(link: HTMLElement, img: HTMLImageElement): HTMLElement | undefined {
		// 常见的封面容器
		const pic = link.querySelector<HTMLElement>('.pic, .bili-video-card__image, .video-card__image, [class*="cover"], [class*="thumb"], [class*="pic"]');
		if (pic) return pic;
		// 播放器推荐位的封面
		const playerLeft = link.querySelector<HTMLElement>('.bilibili-player-recommend-left');
		if (playerLeft) return playerLeft;
		// 兜底：图片的父级
		return <HTMLElement>(img.parentElement ?? link);
	}
	/** 从视频卡片元素提取 bvid（旧版页面多用 av 号，需转换） */
	protected extractBvidFromCard(card: Element): string | null {
		// 优先从 a 标签 href 提取
		const link = card.querySelector<HTMLAnchorElement>('a[href*="/video/"]') ?? (<HTMLAnchorElement>card);
		const href = link?.getAttribute('href') ?? '';
		// BV 号
		const bvMatch = href.match(/\/video\/(BV[A-Za-z0-9]{10})/);
		if (bvMatch) return bvMatch[1];
		// av 号（旧版页面常见）
		const avMatch = href.match(/\/video\/av(\d+)/);
		if (avMatch) {
			try {
				return AV.toBV(Number(avMatch[1]));
			} catch { }
		}
		// 备选：data-bvid / data-aid 属性
		const bvidAttr = card.getAttribute('data-bvid');
		if (bvidAttr && /^BV[A-Za-z0-9]{10}$/.test(bvidAttr)) return bvidAttr;
		const aidAttr = card.getAttribute('data-aid');
		if (aidAttr && /^\d+$/.test(aidAttr)) {
			try {
				return AV.toBV(Number(aidAttr));
			} catch { }
		}
		return null;
	}
	/** 注入推荐视频标记（封面左上角的胶囊形 badge，显示广告类别） */
	protected injectRecommendationBadge(bvid: string, host: HTMLElement, segments: SBTime[]) {
		// 避免重复注入
		if (host.querySelector('.bsb-recommend-badge')) return;
		// 只展示广告类分类（赞助/自我推广）
		const first = segments.find(d => bsbIsAdCategory(d.category));
		if (!first) return;
		const label = bsbCategoryShortLabel(first.category);
		const color = bsbCategoryColor(first.category);
		// 使用自定义元素：页面样式表里不存在该标签的规则，不会被拉伸覆盖
		const badge = document.createElement('bsb-badge');
		badge.className = 'bsb-recommend-badge';
		badge.textContent = label;
		badge.title = `该视频有空降片段（${label}）`;
		badge.style.setProperty('background', color, 'important');
		badge.style.setProperty('opacity', '0.75', 'important');
		// 角标定位在封面左上角（内联 !important 以覆盖页面可能的定位样式）
		const st = badge.style;
		st.setProperty('position', 'absolute', 'important');
		st.setProperty('left', '4px', 'important');
		st.setProperty('top', '4px', 'important');
		st.setProperty('z-index', '10', 'important');
		host.style.setProperty('position', 'relative', 'important');
		host.appendChild(badge);
	}
	/** 供设置界面调用的操作集合 */
	get actions() {
		return {
			createSegment: () => this.createSegment(),
			cancelCreating: () => this.cancelCreating(),
			clearSubmitting: () => this.clearSubmitting(),
			submitSegments: () => this.submitSegments(),
			refresh: () => this.lookup(true),
			unskip: (segment: SBTime) => {
				this.cancelled.add(segment.UUID);
				this.cancelSchedule();
				this.player()?.seek(segment.segment[0] + 0.001);
				this.startSchedule();
			}
		};
	}
	/** 当前片段列表（服务器 + 本地草稿） */
	get segmentList() {
		return this.allSegments.sort((a, b) => a.segment[0] - b.segment[0]);
	}
	/**
	 * 设置分类行为
	 * @param category 分类
	 * @param option 行为值
	 */
	setCategoryOption(category: SBCategory, option: SBCategoryOption) {
		setCategoryOption(category, option);
	}
	/**
	 * 读取分类行为的展示文本
	 * @param category 分类
	 */
	categoryOptionLabel(category: SBCategory) {
		return optionLabels[categoryOption(category) + 1];
	}
	/** 分类设定变动后重新过滤片段并重排调度（不必重新请求服务器） */
	applyCategoryChange() {
		if (!this.available) return;
		this.applySegments();
		this.renderPreviewBar();
		this.startSchedule();
	}
	/**
	 * 对片段投票
	 * @param segment 片段
	 * @param type 投票类型
	 */
	voteSegment(segment: SBTime, type: BSBVoteType) {
		return this.vote(segment, type);
	}
	/**
	 * 读取分类的展示标签
	 * @param category 分类
	 */
	categoryLabel(category: SBCategory) {
		return bsbCategoryLabel(category);
	}
	/**
	 * 读取分类的展示颜色
	 * @param category 分类
	 */
	categoryColor(category: SBCategory) {
		return bsbCategoryColor(category);
	}
	/**
	 * 秒 -> 时间码
	 * @param sec 秒
	 */
	timeCode(sec: number) {
		return timeCode(sec);
	}
}

/** 空降助手组件 */
export const sponsorBlock = new BilibiliSponsorBlock();

export { BSBVoteType };
