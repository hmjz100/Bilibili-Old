/**
 * 桥就绪事件：由 ISOLATED 世界的桥在注册好监听器之后派发。
 * 键名与 `_Slug_` 绑定，避免新旧版本脚本互相污染。
 */
const READY = `__BLOD_READY_${_Slug_}__`;

/**
 * 尚未收到应答的请求（含 `setValue` 这类无需应答的）。
 *
 * MAIN world 与 ISOLATED world 是两个独立的 JS realm：DOM 事件跨世界可见，
 * 但 `window` 上的普通属性（expando）**不共享**，所以待发队列只能留在本世界，
 * 待收到桥的 READY 之后**重发**——此时桥已注册好监听器，必然有人接收。
 * （已实测：桥侧读 MAIN 侧 `window.__xxx` 恒为 `undefined`。）
 */
const pending = new Map<string, any>();
/** 桥就绪后不再需要记账（桥一定在监听），避免 `setValue` 这类无应答请求把队列撑爆 */
let bridgeReady = false;
/** 兜底上限：万一桥始终没有就绪（或 READY 事件被错过），也不会无限增长 */
const PENDING_LIMIT = 256;

window.addEventListener(READY, () => {
	bridgeReady = true;
	if (!pending.size) {
		return;
	}
	// 复制一份再派发：派发过程中应答可能同步回来并改动 pending
	const items = Array.from(pending);
	pending.clear();
	for (const [mutex, data] of items) {
		window.dispatchEvent(new CustomEvent(_Slug_, { detail: { mutex, data } }));
	}
});

/**
 * 发送数据到到拓展
 * @param data 要发送的数据，必须是JSON-serializable的
 * @param resolve 数据返回的回调
 * @param reject 出错时的回调
 */
export function postMessage(data: any, resolve?: Function, reject: Function = () => { }) {
	const mutex = Math.random().toString(36).substring(2);
	if (resolve && typeof resolve === "function") {
		window.addEventListener(mutex, (ev) => {
			if (ev instanceof CustomEvent) {
				// 收到应答即可确认桥是活的（覆盖“READY 事件被错过”的情况）
				bridgeReady = true;
				pending.delete(mutex);
				ev.detail.reject ? reject(ev.detail.data) : resolve(ev.detail.data);
				ev.stopImmediatePropagation();
			}
		}, { once: true });
	}
	// 先记账再派发：桥若尚未就绪，这次事件会丢失，但请求已记录，桥就绪后会被重发
	if (!bridgeReady && pending.size < PENDING_LIMIT) {
		pending.set(mutex, data);
	}
	window.dispatchEvent(new CustomEvent(_Slug_, { detail: { mutex, data } }));
}
