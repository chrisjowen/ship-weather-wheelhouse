import { safeHref, taskHref } from './words.js';

/**
 * The latest events, newest first, from Firstmate's fleet ledger
 * (state/fleet-ledger.jsonl in the Firstmate home): one JSON object per line,
 * each with `ts` (Unix seconds), `event` and `task`. Every event is told in
 * the panel's own words from its kind and the task's title; the worker's
 * status text is never shown.
 *
 * @typedef {{ at: string, title: string, text: string, tone: 'good' | 'bad' | 'warn' | 'calm', href: string }} WeatherEvent
 * @typedef {{ id: string, shortTitle?: string, title?: string }} TaskRef
 */

/** How many ledger lines are read from its end. */
export const LEDGER_LINES = 400;

/** @type {Record<string, { text: string, tone: WeatherEvent['tone'] }>} */
const STATUS = {
	blocked: { text: 'blocked', tone: 'warn' },
	'needs-decision': { text: 'needs a decision', tone: 'warn' },
	failed: { text: 'failed', tone: 'bad' },
	done: { text: 'finished', tone: 'good' },
	resolved: { text: 'back under way', tone: 'calm' }
};

/**
 * @param {Record<string, unknown>} e
 * @returns {{ text: string, tone: WeatherEvent['tone'], pr: string | null } | null}
 */
function describe(e) {
	const pr = safeHref(e.pr);
	switch (e.event) {
		case 'task.dispatched':
			return { text: 'work started', tone: 'calm', pr: null };
		case 'task.pr_ready':
			return { text: 'pull request ready for review', tone: 'good', pr };
		case 'task.merged':
			return { text: 'landed', tone: 'good', pr };
		case 'task.status': {
			const s = typeof e.state === 'string' ? STATUS[e.state] : undefined;
			return s ? { ...s, pr: null } : null;
		}
		default:
			return null;
	}
}

/**
 * @param {string} text the ledger's last lines
 * @param {TaskRef[]} tasks the tasks this plugin may show; events about any other are left out
 * @param {number} limit
 * @returns {WeatherEvent[]}
 */
export function eventsFrom(text, tasks, limit) {
	const byId = new Map(tasks.map((t) => [t.id, t]));
	/** @type {WeatherEvent[]} */
	const out = [];
	const lines = text.split('\n');
	for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
		const line = lines[i].trim();
		if (!line) continue;
		let e;
		try {
			e = JSON.parse(line);
		} catch {
			continue;
		}
		if (!e || typeof e !== 'object' || typeof e.ts !== 'number' || typeof e.task !== 'string')
			continue;
		const task = byId.get(e.task);
		if (!task) continue;
		const d = describe(e);
		if (!d) continue;
		const title = task.shortTitle || task.title || 'A task';
		const prev = out[out.length - 1];
		// The same thing said again about the same task (a repeated status line) is one event.
		if (prev && prev.title === title && prev.text === d.text) continue;
		out.push({
			at: new Date(e.ts * 1000).toISOString(),
			title,
			text: d.text,
			tone: d.tone,
			href: d.pr ?? taskHref(task.id)
		});
	}
	return out;
}
