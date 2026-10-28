export type CopyFeedbackState = 'idle' | 'copied' | 'error';

const DEFAULT_FEEDBACK_MS = 1900;

/** Shared clipboard state for actions that render their own button or menu. */
export class CopyFeedback {
	state = $state<CopyFeedbackState>('idle');
	activeKey = $state<string | null>(null);
	#duration: number;
	#timeout: ReturnType<typeof setTimeout> | undefined;

	constructor(duration = DEFAULT_FEEDBACK_MS) {
		this.#duration = duration;
	}

	reset = () => {
		clearTimeout(this.#timeout);
		this.state = 'idle';
		this.activeKey = null;
	};

	copy = async (value: string, key = 'default') => {
		clearTimeout(this.#timeout);
		this.activeKey = key;
		try {
			await navigator.clipboard.writeText(value);
			this.state = 'copied';
			return true;
		} catch {
			this.state = 'error';
			return false;
		} finally {
			this.#timeout = setTimeout(this.reset, this.#duration);
		}
	};

	dispose() {
		clearTimeout(this.#timeout);
	}
}

/** Creates copy feedback owned by the calling component; its reset timer stops when the component unmounts. */
export function useCopyFeedback(duration = DEFAULT_FEEDBACK_MS) {
	const feedback = new CopyFeedback(duration);
	$effect(() => () => feedback.dispose());
	return feedback;
}
