import { DEFAULTS } from '../wheelhouse/server/settings.js';

export const NOW = Date.parse('2026-10-30T17:00:00Z');

/**
 * A task as Wheelhouse hands it to plugins, with only what a test changes.
 * @param {Record<string, any>} over
 */
export function task(over = {}) {
	return {
		id: 'search-docs',
		title: 'docs: Instant search for the docs',
		shortTitle: 'Instant search for the docs',
		projectId: 'docs',
		kind: 'ship',
		status: 'working',
		statusLabel: 'Working',
		summary: null,
		pipeline: null,
		attention: null,
		passage: { steps: [], current: 0, checks: [] },
		pr: null,
		since: null,
		completedOn: null,
		mergedAt: null,
		...over
	};
}

/** Plenty of Claude left. */
export const ROOMY = {
	session: { left: 72, resetsAt: '2026-10-30T19:00:00Z' },
	week: { left: 64, resetsAt: '2026-11-04T22:00:00Z' }
};

/** @param {Record<string, any>} over */
export function input(over = {}) {
	return {
		tasks: [],
		headroom: ROOMY,
		prChecks: new Map(),
		events: [],
		notes: [],
		settings: { ...DEFAULTS },
		now: NOW,
		...over
	};
}
