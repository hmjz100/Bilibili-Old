import { jsonCheck } from "../io/api";
import { xhrHook } from "../utils/hook/xhr";

export class PageMedia {
	constructor() {
		this.limit();
	}
	/** 解除限制 */
	protected limit() {
		xhrHook("user/status", undefined, res => {
			try {
				const userStatus = jsonCheck(res.response);
				userStatus.result.area_limit = 0;
				userStatus.result.ban_area_show = 0;
				res.responseType === "json" ? res.response = userStatus : res.response = res.responseText = JSON.stringify(userStatus);
			} catch (e) { }
		}, false);
	}
}