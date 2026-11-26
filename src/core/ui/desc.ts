import { CustomElementsInterface } from "../../utils/customelement";
import style from '../../css/desc.css';
import { addCss } from "../../utils/element";

/** 浮动窗口 */
export class Desc extends HTMLElement implements CustomElementsInterface {
    private _title: HTMLDivElement;
    private _content: HTMLDivElement;
    private show = true;
    private timer?: number;
    private _container: HTMLDivElement;
    private _parrent?: HTMLElement;
    constructor() {
        super();
        const root = this.attachShadow({ mode: "closed" });
        root.innerHTML = `<div class="container"><div class="title"></div><div class="content"></div></div>`;
        addCss(style, undefined, root);
        this._container = <HTMLDivElement>root.querySelector('.container');
        this._title = <HTMLDivElement>root.querySelector('.title');
        this._content = <HTMLDivElement>root.querySelector('.content');
        this.toggle(false);
    }
    /**
     * 更新浮窗
     * @param title 标题
     * @param content 内容
     * @param appendTo 父节点
     */
    value(title: string, content: string, appendTo: HTMLElement) {
        this._title.innerHTML = title;
        this._content.innerHTML = content;
        this._parrent = appendTo;
        appendTo.appendChild(this);
        appendTo.addEventListener('mouseover', () => {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                this.toggle(true);
            }, 300);
        });
        appendTo.addEventListener('mouseout', () => {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                this.toggle(false);
            }, 300);
        });
    }
    private toggle(show?: boolean) {
        this.show = show === undefined ? !this.show : show;
        this.style.display = this.show ? '' : 'none';
        if (this._parrent && this.show) {
            const rect = this._parrent.getBoundingClientRect();
            // 与设置项顶部对齐（保持平行），并防止超出视口下边缘
            const h = this._container.offsetHeight || 0;
            let top = rect.top;
            if (h && top + h > window.innerHeight - 8) {
                top = Math.max(8, window.innerHeight - h - 8);
            }
            this._container.style.top = top + 'px';
        }
    }
}
customElements.get(`desc-${_Slug_}`) || customElements.define(`desc-${_Slug_}`, Desc);