export abstract class DOMArray<T> extends Array<T> {
    root: HTMLElement;

    constructor(root: HTMLElement, ...items: T[]) {
        super();
        Object.setPrototypeOf(this, DOMArray.prototype);
        this.root = root;
        if (items.length) this.splice2(0, 0, items);
    }

    splice2(start: number, count: number, elements?: T[], nodes?: HTMLElement[]): [T[], HTMLElement[]] {
        if (nodes !== undefined && nodes.length !== 0 && nodes.length !== elements.length)
            throw new Error('length mismatch');
        start = start < 0 ? this.length - start : start;
        start = Math.min(Math.max(start, 0), this.length);
        const end = Math.min(start + count, this.length);
        let s = start > 0 ? this.root.children[start - 1] : null;
        const n = nodes === undefined || nodes.length === 0;
        const delel = [];
        for (let i = end - 1; i >= start; i--) {
            delel.push(this.root.children[i] as HTMLElement);
            this.root.children[i].remove();
        }
        for (let i = 0; i < elements?.length || 0; i++) {
            const node = n ? this.createNode(elements[i]) : nodes[i];
            if (s === null)
                this.root.firstChild === null ? this.root.append(node) : this.root.firstChild.before(node);
            else s.after(node);
            s = node;
        }
        const del = this.splice(start, count, ...(elements || []));
        this.update();
        return [del, delel];
    }

    protected abstract createNode(element: T): HTMLElement;
    protected update() { }
}