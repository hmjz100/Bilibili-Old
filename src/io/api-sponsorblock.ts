/** 空降助手（SponsorBlock）数据模型 */

/** 片段行为类型 */
export enum SBActionType {
	/** 跳过 */
	Skip = 'skip',
	/** 静音 */
	Mute = 'mute',
	/** 全片（整片都属于该分类） */
	Full = 'full',
	/** 精彩时刻（poi，仅手动跳过） */
	Poi = 'poi'
}

/** 片段分类 */
export type SBCategory = string & { __sbCategoryBrand: unknown };

/** 片段来源 */
export enum SBSourceType {
	/** 服务器 */
	Server = 0,
	/** 本地草稿 */
	Local = 1
}

/** 片段隐藏状态，`undefined` 表示正常显示 */
export enum SBHideType {
	Visible = 0,
	/** 被踩 */
	Downvoted = 1,
	/** 时长过短 */
	MinimumDuration = 2,
	/** 被隐藏 */
	Hidden = 3
}

/** 空降片段，时间单位为秒 */
export interface SBTime {
	/** `[start, end]` */
	segment: [number, number];
	/** 分P cid，服务器以字符串下发 */
	cid: string;
	/** 片段唯一标识 */
	UUID: string;
	/** 分类锁定，`1` 为锁定 */
	locked?: number;
	/** 分类 */
	category: SBCategory;
	/** 行为类型 */
	actionType: SBActionType;
	/** 隐藏状态，缺省为正常显示 */
	hidden?: SBHideType;
	/** 来源 */
	source: SBSourceType;
	/** 视频时长，仅用于分P迁移匹配 */
	videoDuration?: number;
	/** 片段描述（服务器可能下发） */
	description?: string;
	/** 服务器记录的票数，仅用于展示 */
	votes?: number;
}

/** 服务器返回的一批片段数据 */
export interface SBSegmentBucket {
	/** 稿件 bvid */
	videoID: string;
	/** 片段列表 */
	segments: SBTime[];
}

/** 空降助手分类配置 */
export interface SBCategoryConfig {
	/** 分类键名 */
	name: SBCategory;
	/** 分类标签 */
	label: string;
	/** 展示用颜色 */
	color: string;
	/** 默认行为 */
	option: SBCategoryOption;
}

/** 分类行为选项 */
export enum SBCategoryOption {
	/** 禁用 */
	Disabled = -1,
	/** 仅展示 */
	ShowOverlay = 0,
	/** 手动跳过 */
	ManualSkip = 1,
	/** 自动跳过 */
	AutoSkip = 2
}
