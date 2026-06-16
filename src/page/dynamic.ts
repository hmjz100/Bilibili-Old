import { user } from "../core/user";
import { jsonCheck } from "../io/api";
import { xhrHook } from "../utils/hook/xhr";

export class PageDynamic {
	constructor() {
		user.addCallback(status => {
			status.liveRecord || this.liveRecord();
		});
	}
	protected liveRecord() {
		xhrHook("api.bilibili.com/x/polymer/web-dynamic/v1/feed/all", undefined, r => {
			try {
				const feedAll = jsonCheck(r.response);
				feedAll.data.items = feedAll.data.items.filter((d: any) => d.modules?.module_dynamic?.major?.archive?.badge?.text != "直播回放");
				r.responseType === "json" ? r.response = feedAll : r.response = r.responseText = JSON.stringify(feedAll);
			} catch (e) { }
		}, false);
	}
}