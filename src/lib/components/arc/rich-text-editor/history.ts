import type { Offsets } from './dom';

export type EditKind = 'type' | 'command';
export type Snapshot = { html: string; selection: Offsets | null; kind: EditKind; at: number };
export type HistoryState = { canUndo: boolean; canRedo: boolean };

const MAX_SNAPSHOTS = 300;
/** Typing within this window joins the previous undo step. */
const MERGE_WINDOW_MS = 1000;

/** The editor's own undo stack of HTML snapshots with their selections. */
export class EditHistory {
	private stack: Snapshot[] = [];
	private index = -1;

	reset(initial: Snapshot) {
		this.stack = [initial];
		this.index = 0;
	}

	get state(): HistoryState {
		return { canUndo: this.index > 0, canRedo: this.index < this.stack.length - 1 };
	}

	/** Returns false when the snapshot only moved the selection. */
	push(snap: Snapshot, boundary: boolean) {
		const top = this.stack[this.index];
		if (top && top.html === snap.html) {
			top.selection = snap.selection;
			return false;
		}
		const mergesTyping =
			snap.kind === 'type' &&
			top?.kind === 'type' &&
			this.index > 0 &&
			snap.at - top.at < MERGE_WINDOW_MS;
		if (mergesTyping && !boundary) {
			this.stack[this.index] = { ...snap, at: top.at };
			return true;
		}
		this.stack = this.stack.slice(0, this.index + 1);
		this.stack.push(snap);
		if (this.stack.length > MAX_SNAPSHOTS) this.stack.shift();
		this.index = this.stack.length - 1;
		return true;
	}

	back(): Snapshot | null {
		if (this.index <= 0) return null;
		this.index -= 1;
		return this.stack[this.index];
	}

	forward(): Snapshot | null {
		if (this.index >= this.stack.length - 1) return null;
		this.index += 1;
		return this.stack[this.index];
	}
}
