import htmlHistory from "../html/history.html";
import { Header } from "./header";
import { Page } from "./page";
import { user } from "../core/user";
import { objUrl } from "../utils/format/url";
import { urlCleaner } from "../core/url";
import { xhrHook } from "../utils/hook/xhr";

export class PageHistory extends Page {
	constructor() {
		super(htmlHistory);
		this.__INITIAL_STATE__();
		Header.primaryMenu();
        Header.banner();
		this.updateDom();
		user.addCallback(status => {
			status.history && this.archive();
		})
	}
	/** 纯视频历史记录 */
	protected archive() {
		xhrHook(["api.bilibili.com/x/web-interface/history/cursor", "business"], function (args) {
			let obj = new URL(args[1]), max = obj.searchParams.get("max") || "", view_at = obj.searchParams.get("view_at") || "";
			args[1] = objUrl("//api.bilibili.com/x/web-interface/history/cursor", { max: max, view_at: view_at, type: "archive", ps: "20" });
		}, undefined, false);
	}
	private __INITIAL_STATE__() {
		urlCleaner.updateLocation('https://www.bilibili.com/account/history');
	}
}