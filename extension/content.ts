import { dispatchCustomEvent } from "./utils/dispatchcustomevent";
import { executeScript } from "./utils/executescript";
import { insertCSS } from "./utils/insertcss";

/** 与 MAIN 世界的载荷约定的“桥已就绪”事件（键名须与 `extension/utils/message.ts` 一致） */
const READY = `__BLOD_READY_${_Slug_}__`;
/** 会话网络规则集id */
const SessionRules = new Set<number>();
/**
 * 幂等：同一个 `mutex` 只处理一次。
 * MAIN 载荷在收到 READY 后会重发它此前未被监听到的请求，其中可能包含本桥已经处理过的，
 * 因此必须按 `mutex` 去重。
 */
const handled = new Set<string>();

function handle(ev: Event) {
	if (!(ev instanceof CustomEvent)) {
		return;
	}
	const detail = ev.detail || {};
	const mutex: string = detail.mutex;
	if (!mutex || handled.has(mutex)) {
		return;
	}
	handled.add(mutex);
	switch (detail.data?.$type) {
		case 'fetch': {
			chrome.runtime.sendMessage({
				$type: 'fetch',
				data: detail.data
			}).then(data => {
				if (data.err) { throw data.err }
				dispatchCustomEvent(mutex, { data: data.data });
			}).catch(e => {
				dispatchCustomEvent(mutex, { data: e, reject: true })
			});
			break;
		}
		case 'getValue': {
			chrome.storage.local.get().then(d => {
				dispatchCustomEvent(mutex, { data: Reflect.has(d, detail.data.key) ? d[detail.data.key] : detail.data.def });
			}).catch(e => {
				// 必须应答，否则 MAIN 侧的 Promise 会永久悬挂
				dispatchCustomEvent(mutex, { data: e, reject: true });
			});
			break;
		}
		case 'setValue': {
			const obj: Record<string, string> = {};
			if (typeof detail.data.key === 'string') {
				obj[detail.data.key] = detail.data.value;
				chrome.storage.local.set(obj).catch(() => { });
			}
			break;
		}
		case 'deleteValue': {
			chrome.storage.local.remove(detail.data.key).catch(() => { });
			break;
		}
		case 'cookie': {
			chrome.runtime.sendMessage({
				$type: 'cookie',
				data: detail.data.url
			}).then(data => {
				if (data.err) { throw data.err }
				dispatchCustomEvent(mutex, { data: data.data })
			}).catch(e => {
				dispatchCustomEvent(mutex, { data: e, reject: true })
			});
			break;
		}
		case 'insertCSS': {
			try {
				const url = chrome.runtime.getURL(detail.data.file);
				if (chrome.runtime.getURL(detail.data.file)) {
					detail.data.urlonly || insertCSS(detail.data.file);
					dispatchCustomEvent(mutex, { data: url });
				} else {
					dispatchCustomEvent(mutex, { data: url, reject: true })
				}
			} catch (e) {
				dispatchCustomEvent(mutex, { data: e, reject: true })
			}
			break;
		}
		case 'executeScript': {
			try {
				const url = chrome.runtime.getURL(detail.data.file);
				if (chrome.runtime.getURL(detail.data.file)) {
					detail.data.urlonly || executeScript(detail.data.file);
					dispatchCustomEvent(mutex, { data: url });
				} else {
					dispatchCustomEvent(mutex, { data: url, reject: true })
				}
			} catch (e) {
				dispatchCustomEvent(mutex, { data: e, reject: true })
			}
			break;
		}
		case 'updateSessionRules': {
			chrome.runtime.sendMessage({
				$type: "updateSessionRules",
				data: detail.data.rules,
				tab: detail.data.tab ?? true
			})
				.then(data => dispatchCustomEvent(mutex, { data }))
				.catch(e => {
					dispatchCustomEvent(mutex, { data: e, reject: true });
				});
			// 记录规则ID
			(<chrome.declarativeNetRequest.Rule[]>detail.data.rules).forEach(d => {
				SessionRules.add(d.id);
			})
			break;
		}
		case 'removeSessionRules': {
			chrome.runtime.sendMessage({
				$type: "removeSessionRules",
				data: detail.data.ids
			}).catch(() => { });
			// 移除规则id
			(<number[]>detail.data.ids).forEach(d => {
				SessionRules.delete(d)
			})
			break;
		}
		default:
			break;
	}
}

// ① 先注册监听器（必须先于任何其他动作，否则早到的请求会丢失）
window.addEventListener(_Slug_, handle);

// ② 通知 MAIN 载荷“桥已就绪”：它会同步重发此前未被监听到的请求
window.dispatchEvent(new CustomEvent(READY));

// ③ 重发只可能发生在 ② 的同步过程中，此后不会再重复投递，释放去重表
handled.clear();

window.addEventListener("beforeunload", () => {
	const arr = Array.from(SessionRules);
	// DOM更新时清空已应用规则
	chrome.runtime.sendMessage({
		$type: "removeSessionRules",
		data: arr
	}).catch(() => { });
});

self.documentPictureInPicture?.addEventListener('enter', e => {
	if (documentPictureInPicture.window) {
		const url = chrome.runtime.getURL('/player/video.css');
		const link = document.createElement('link');

		link.rel = 'stylesheet';
		link.href = url;
		documentPictureInPicture.window.document.head?.appendChild(link);
	}
});
