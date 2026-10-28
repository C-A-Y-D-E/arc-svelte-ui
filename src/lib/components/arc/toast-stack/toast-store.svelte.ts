import { getContext, setContext } from 'svelte';

export type ToastType = 'success' | 'info' | 'warning' | 'error' | 'loading';

export interface ToastAction {
	label: string;
	/** Runs the action. The toast closes afterwards unless the handler updates it, so an Undo can morph the toast into its result. */
	onClick: (id: string) => void;
}

export interface ToastOptions {
	/** Reuse an id to update a toast in place instead of stacking a new one. */
	id?: string;
	type?: ToastType;
	title: string;
	description?: string;
	action?: ToastAction;
	/** Milliseconds before the toast closes itself. Defaults by type; loading toasts wait for an update. Pass Infinity to keep it until closed. */
	duration?: number;
}

export type ToastPatch = Partial<Omit<ToastOptions, 'id'>>;

export interface ToastStackApi {
	/** Shows a toast and returns its id. */
	toast: (options: ToastOptions) => string;
	/** Morphs a toast in place: icon, copy, and height animate to the new content and its timer restarts. Pass `action: undefined` to remove the action. */
	update: (id: string, patch: ToastPatch) => void;
	/** Dismisses one toast, or every toast when called without an id. */
	dismiss: (id?: string) => void;
}

export type ToastRecord = {
	id: string;
	type: ToastType;
	title: string;
	description?: string;
	action?: ToastAction;
	duration: number;
	seq: number;
	version: number;
};

/** Warnings and errors stay this much longer than the base lifetime. */
const URGENT_LIFETIME_FACTOR = 1.6;

function durationFor(type: ToastType, base: number) {
	if (type === 'loading') return Infinity;
	return type === 'warning' || type === 'error' ? base * URGENT_LIFETIME_FACTOR : base;
}

export class ToastStore implements ToastStackApi {
	toasts = $state.raw<ToastRecord[]>([]);
	#seq = 0;
	#base: number;
	#limit: number;

	constructor(base: number, limit: number) {
		this.#base = base;
		this.#limit = limit;
	}

	update = (id: string, patch: ToastPatch) => {
		const found = this.toasts.find((item) => item.id === id);
		if (!found) return;
		const type = patch.type ?? found.type;
		const record: ToastRecord = {
			...found,
			...patch,
			type,
			duration: patch.duration ?? durationFor(type, this.#base),
			version: found.version + 1
		};
		this.toasts = this.toasts.map((item) => (item.id === id ? record : item));
	};

	toast = ({ id, ...options }: ToastOptions) => {
		if (id && this.toasts.some((item) => item.id === id)) {
			this.update(id, options);
			return id;
		}
		const type = options.type ?? 'info';
		this.#seq += 1;
		const record: ToastRecord = {
			...options,
			id: id ?? `toast-${this.#seq}`,
			type,
			duration: options.duration ?? durationFor(type, this.#base),
			seq: this.#seq,
			version: 0
		};
		this.toasts = [record, ...this.toasts].slice(0, this.#limit);
		return record.id;
	};

	dismiss = (id?: string) => {
		if (id === undefined) {
			if (this.toasts.length) this.toasts = [];
			return;
		}
		if (this.toasts.some((item) => item.id === id))
			this.toasts = this.toasts.filter((item) => item.id !== id);
	};

	runAction = (id: string) => {
		const found = this.toasts.find((item) => item.id === id);
		if (!found?.action) return;
		found.action.onClick(id);
		if (this.toasts.find((item) => item.id === id)?.version === found.version) this.dismiss(id);
	};

	find(id: string) {
		return this.toasts.find((item) => item.id === id);
	}
}

const STORE_KEY = Symbol('arc-toast-stack');

/** Scopes a toast queue to the calling component's subtree. */
export function provideToastStore(base: number, limit: number) {
	return setContext(STORE_KEY, new ToastStore(base, limit));
}

export function getToastStore() {
	const store = getContext<ToastStore | undefined>(STORE_KEY);
	if (!store) throw new Error('Render toast stack consumers inside <ToastStackProvider>.');
	return store;
}

/** Shows, updates, and dismisses toasts from anywhere inside the provider. `count` is how many toasts are queued. */
export function useToastStack(): ToastStackApi & { readonly count: number } {
	const store = getToastStore();
	return {
		toast: store.toast,
		update: store.update,
		dismiss: store.dismiss,
		get count() {
			return store.toasts.length;
		}
	};
}
