import { apiBiliplusPlayurl } from "../io/api-biliplus-playurl";
import { ApiGlobalOgvPlayurl } from "../io/api-global-ogv-playurl";
import { apiPlayurl, IPlayurlDash } from "../io/api-playurl";
import { fnval, fnval_pgc } from "../io/fnval";
import { uid } from "../utils/conf/uid";
import { objUrl, urlObj } from "../utils/format/url";
import { xhrHook, XMLHttpRequestOpenParams } from "../utils/hook/xhr";
import { BLOD } from "./bilibili-old";
import { networkMock } from "./network-mock";
import { toast, Toast } from "./toast";
import { user } from "./user";

export const UPOS = {
    "[阿里] ali": "upos-sz-mirrorali.bilivideo.com",
    "[阿里] alib": "upos-sz-mirroralib.bilivideo.com",
    "[阿里] alio1": "upos-sz-mirroralio1.bilivideo.com",
    "[腾讯] cos": "upos-sz-mirrorcos.bilivideo.com",
    "[腾讯] cosb": "upos-sz-mirrorcosb.bilivideo.com",
    "[腾讯] coso1": "upos-sz-mirrorcoso1.bilivideo.com",
    "[腾讯] bos": "upos-sz-mirrorbos.bilivideo.com",
    "[华为] hw": "upos-sz-mirrorhw.bilivideo.com",
    "[华为] hwb": "upos-sz-mirrorhwb.bilivideo.com",
    "[华为] hwo1": "upos-sz-mirrorhwo1.bilivideo.com",
    "[华为] 08c": "upos-sz-mirror08c.bilivideo.com",
    "[华为] 08h": "upos-sz-mirror08h.bilivideo.com",
    "[华为] 08ct": "upos-sz-mirror08ct.bilivideo.com",
    "[华为] tf_hw": "upos-tf-all-hw.bilivideo.com",
    "[腾讯] tf_tx": "upos-tf-all-tx.bilivideo.com",
    "[海外] akamai": "upos-hz-mirrorakam.akamaized.net",
    "[海外] hk_bcache": "cn-hk-eq-bcache-01.bilivideo.com",
    "[海外][阿里] aliov": "upos-sz-mirroraliov.bilivideo.com",
    "[海外][腾讯] cosov": "upos-sz-mirrorcosov.bilivideo.com",
    "[海外][华为] hwov": "upos-sz-mirrorhwov.bilivideo.com",
};
enum AREA {
    tw,
    hk,
    cn
}
class VideoLimit {
    /** 数据备份 */
    protected Backup: Record<string, any> = {};
    /** 通知组件 */
    protected toast?: Toast;
    /** 监听中 */
    protected listening = false;
    /** 播放数据备份 */
    __playinfo__: any;
    constructor() {
        // 处理非限制视频请求
        xhrHook('/playurl?', args => {
            const param = urlObj(args[1]);
            if (!uid && user.userStatus!.show1080p && user.userStatus!.accessKey.token) {
                param.appkey = "27eb53fc9058f8c3";
                param.access_key = user.userStatus!.accessKey.token; // 不登录高画质
            }
            if (param.fnval) {
                param.fnval = fnval;
                BLOD.pgc && (param.fnval = fnval_pgc);
            }; // 画质提升
            args[1] = objUrl(args[1], param);
            return !(BLOD.limit || BLOD.th)
        }, res => {
            try {
                const result = res.responseType === 'json' ? JSON.stringify(res.response) : res.responseText!;
                if (user.userStatus!.uposReplace.nor !== '不替换') {
                    const nstr = this.uposReplace(result, <'[阿里] ali'>user.userStatus!.uposReplace.nor);
                    toast.warning("已替换 UPOS 服务器，卡加载时请到设置中更换服务器或者禁用！", `CDN：${user.userStatus!.uposReplace.nor}`, `UPOS：${UPOS[<'[阿里] ali'>user.userStatus!.uposReplace.nor]}`);
                    if (res.responseType === 'json') {
                        res.response = JSON.parse(nstr);
                    } else {
                        res.response = res.responseText = nstr;
                    }
                }
            } catch (e) { }
        }, false);
    }
    /** 开始监听 */
    enable() {
        if (this.listening) return;
        // 处理限制视频请求
        const disable = xhrHook.async('/playurl?', args => {
            const obj = urlObj(args[1]);
            this.updateVaribale(obj);
            return Boolean(BLOD.limit || BLOD.th)
        }, async (args) => {
            const response = BLOD.th ? await this._th(args) : await this._gat(args);
            return { response, responseType: 'json', responseText: JSON.stringify(response) }
        }, false);
        this.disable = () => {
            disable();
            this.listening = false;
        }
        this.listening = true;
    }
    /** 处理泰区 */
    protected async _th(args: XMLHttpRequestOpenParams) {
        this.toast || (this.toast = toast.list());
        this.toast.data = ['泰区限制视频 >>>'];
        const obj = urlObj(args[1]);
        this.toast.push(`> aid：${BLOD.aid}`, `> cid：${BLOD.cid}`);
        obj.access_key = user.userStatus!.accessKey.token;
        if (!this.Backup[args[1]]) {
            try {
                networkMock();
                this.toast.push(`> 代理服务器：${user.userStatus!.videoLimit.th}`);
                this.Backup[args[1]] = { code: 0, message: "success", result: await this.th(obj) };
                this.toast.push('> 获取代理数据成功！');
                this.toast.type = 'success';
            } catch (e) {
                this.toast.push('> 代理出错！', <any>e);
                !obj.access_key && this.toast.push('> 代理服务器要求【账户授权】才能进一步操作！');
                this.toast.type = 'error';
                this.toast.delay = 4;
                return { code: -404, message: e, data: null };
            }
        }
        this.toast.delay = 4;
        delete this.toast;
        return this.__playinfo__ = this.Backup[args[1]];
    }
    /** 处理港澳台 */
    protected async _gat(args: XMLHttpRequestOpenParams) {
        this.toast || (this.toast = toast.list());
        this.toast.data = ['港澳台限制视频 >>>'];
        const obj = urlObj(args[1]);
        this.toast.push(`> aid：${BLOD.aid}`, `> cid：${BLOD.cid}`);
        obj.access_key = user.userStatus!.accessKey.token;
        if (!this.Backup[args[1]]) {
            try {
                if (user.userStatus!.videoLimit.server === '内置') {
                    obj.module = 'bangumi';
                    const upInfo = (<any>window).__INITIAL_STATE__?.upInfo;
                    if (upInfo) {
                        (upInfo.mid == 1988098633 || upInfo.mid == 2042149112) && (obj.module = 'movie');
                    }
                    this.toast.push(`> 代理服务器：内置`, `> 类型：${obj.module}`);
                    const res = await apiBiliplusPlayurl(<any>obj);
                    this.Backup[args[1]] = { code: 0, message: "success", result: res };
                } else {
                    // networkMock();
                    const res = await this.gat(obj);
                    this.Backup[args[1]] = { code: 0, message: "success", result: res };
                }
                if (user.userStatus!.uposReplace.gat !== "不替换") {
                    this.Backup[args[1]] = JSON.parse(this.uposReplace(JSON.stringify(this.Backup[args[1]]), <'[阿里] ali'>user.userStatus!.uposReplace.gat));
                    toast.warning("已替换 UPOS 服务器，卡加载时请到设置中更换服务器或者禁用！", `CDN：${user.userStatus!.uposReplace.gat}`, `UPOS：${UPOS[<'[阿里] ali'>user.userStatus!.uposReplace.gat]}`);
                };
                this.toast.push('> 获取代理数据成功！');
                this.toast.type = 'success';
            } catch (e) {
                this.toast.push('> 代理出错！', <any>e);
                !obj.access_key && this.toast.push('> 代理服务器要求【账户授权】才能进一步操作！');
                this.toast.type = 'error';
                this.toast.delay = 4;
                return { code: -404, message: e, data: null };
            }
        }
        this.toast.delay = 4;
        delete this.toast;
        return this.__playinfo__ = this.Backup[args[1]];
    }
    /** 停止监听 */
    disable() {
        this.listening = false;
    }
    /** 更新全局变量 */
    protected updateVaribale(obj: Record<string, string | number>) {
        obj.seasonId && (BLOD.ssid = <number>obj.seasonId);
        obj.episodeId && (BLOD.epid = <number>obj.episodeId);
        obj.ep_id && (BLOD.epid = <number>obj.ep_id);
        obj.aid && (BLOD.aid = Number(obj.aid)) && (BLOD.aid = <number>obj.aid);
        obj.avid && (BLOD.aid = Number(obj.avid)) && (BLOD.aid = <number>obj.avid);
        obj.cid && (BLOD.cid = Number(obj.cid)) && (BLOD.cid = <number>obj.cid);
    }
    /** 访问泰区代理 */
    protected async th(obj: Record<string, string | number>) {
        const d = await new ApiGlobalOgvPlayurl(<any>obj, user.userStatus!.videoLimit.th).toPlayurl();
        toast.warning("已替换 UPOS 服务器，卡加载时请到设置中更换服务器或者禁用！", `CDN：${user.userStatus!.uposReplace.th}`, `UPOS：${UPOS[<'[阿里] ali'>user.userStatus!.uposReplace.th]}`);
        return JSON.parse(this.uposReplace(JSON.stringify(d), <'[阿里] ali'>user.userStatus!.uposReplace.th));
    }
    /** 代理服务器序号 */
    protected area = 0;
    /** 访问港澳台代理 */
    protected async gat(obj: Record<string, string | number>): Promise<IPlayurlDash> {
        this.toast || (this.toast = toast.list());
        if (!user.userStatus!.videoLimit[<'tw'>AREA[this.area]]) throw new Error(`无有效代理服务器：${AREA[this.area]}`);
        const server = user.userStatus!.videoLimit[<'tw'>AREA[this.area]];
        obj.area = AREA[this.area];
        this.toast.push(`> 代理服务器：${server}`);
        try {
            // return await new ApiAppPgcPlayurl(<any>obj, server).getData();
            return <IPlayurlDash>await apiPlayurl(<any>obj, true, true, server);
        } catch (e) {
            this.toast.push('> 代理服务器返回异常！', e);
            if (this.toast) {
                this.toast.type = 'warning';
            }
            this.area++;
            if (this.area > 2)
                throw new Error('代理服务器不可用！');
            return await this.gat(obj);
        }
    }
    /** 用于过滤upos提示 */
    protected upos = false;
    /** 用于取消过滤upos提示 */
    protected timer?: number;
    /**
     * 替换upos服务器
     * @param str playurl或包含视频URL的字符串
     * @param uposName 替换的代理服务器名 keyof typeof {@link UPOS}
     */
    protected uposReplace(str: string, uposName: keyof typeof UPOS | "不替换") {
        if (uposName === "不替换") return str;
        this.upos = true;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.upos = false, 1e3);
        return str.replace(/:\\?\/\\?\/[^\/]+\\?\//g, () => `://${UPOS[uposName]}/`);
    }
}
/** 播放限制组件 */
export const videoLimit = new VideoLimit();
