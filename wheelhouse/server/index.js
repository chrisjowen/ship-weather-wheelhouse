import { eventsFrom, LEDGER_LINES } from './events.js';
import { parseQuota, QUOTA_ARGV } from './headroom.js';
import { readSettings } from './settings.js';
import { forecast } from './weather.js';
import { safeHref } from './words.js';

/**
 * Ship's weather: fleet health as weather in Wheelhouse's header, with the
 * problems, the reasons and the latest events behind it on a click.
 *
 * One fleet provider reads, through the read-only context only:
 *   - the fleet's tasks, as Wheelhouse hands them to plugins (status,
 *     validation run, passage checks, what waits on the captain)
 *   - Claude headroom, from `quota-axi` (as Wheelhouse's Headroom page does)
 *   - each open pull request's failing checks, from `gh pr checks`
 *   - the end of Firstmate's fleet ledger, for the latest events
 * It writes nothing, rings nothing and messages no one.
 *
 * @typedef {import('./weather.js').FailedCheck} FailedCheck
 */

/** At most this many pull requests are asked about their checks per read. */
export const MAX_PRS = 8;

/**
 * @param {any} ctx
 * @param {string[]} argv
 * @param {{ timeoutMs: number, maxBytes: number }} o
 */
async function run(ctx, argv, o) {
	try {
		return await ctx.exec({ argv, cwd: 'home', ...o });
	} catch (e) {
		return { ok: false, reason: String(e), stdout: '', stderr: '' };
	}
}

/**
 * @param {any} ctx
 * @returns {Promise<{ headroom: import('./headroom.js').Headroom | null, note: string | null }>}
 */
export async function readHeadroom(ctx) {
	const r = await run(ctx, QUOTA_ARGV, { timeoutMs: 6_000, maxBytes: 512 * 1024 });
	// quota-axi exits non-zero when a provider needs attention, but still prints its report.
	const headroom = r.stdout?.trim().startsWith('{') ? parseQuota(r.stdout) : null;
	return headroom
		? { headroom, note: null }
		: { headroom: null, note: 'Claude’s limits couldn’t be read, so headroom is left out.' };
}

/**
 * Failing checks on the open pull requests of tasks still under way.
 * @param {any} ctx
 * @param {any[]} tasks
 * @returns {Promise<{ checks: Map<string, FailedCheck[]>, note: string | null }>}
 */
export async function readPrChecks(ctx, tasks) {
	const urls = [
		...new Set(
			tasks
				.filter((t) => t.status !== 'landed' && !t.mergedAt)
				.map((t) => safeHref(t.pr?.url))
				.filter((u) => u && /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(u))
		)
	].slice(0, MAX_PRS);
	/** @type {Map<string, FailedCheck[]>} */
	const checks = new Map();
	let unread = 0;
	await Promise.all(
		urls.map(async (url) => {
			const r = await run(ctx, ['gh', 'pr', 'checks', url, '--json', 'name,bucket,link'], {
				timeoutMs: 6_000,
				maxBytes: 256 * 1024
			});
			// gh exits non-zero while checks fail or are pending, and still prints them.
			let list;
			try {
				list = JSON.parse(r.stdout || 'null');
			} catch {
				list = null;
			}
			if (!Array.isArray(list)) {
				unread++;
				return;
			}
			const failing = list
				.filter((c) => c?.bucket === 'fail' && typeof c.name === 'string')
				.map((c) => ({ name: c.name.slice(0, 80), link: safeHref(c.link) }));
			if (failing.length) checks.set(/** @type {string} */ (url), failing);
		})
	);
	return {
		checks,
		note: unread
			? `GitHub didn’t answer for ${unread === 1 ? 'one pull request' : `${unread} pull requests`}, so ${unread === 1 ? 'its' : 'their'} checks are left out.`
			: null
	};
}

/**
 * @param {any} ctx
 * @param {import('./events.js').TaskRef[]} tasks
 * @param {number} limit
 */
export async function readEvents(ctx, tasks, limit) {
	const r = await run(ctx, ['tail', '-n', String(LEDGER_LINES), 'state/fleet-ledger.jsonl'], {
		timeoutMs: 3_000,
		maxBytes: 2 * 1024 * 1024
	});
	if (!r.ok)
		return {
			events: [],
			note: 'Firstmate’s fleet ledger couldn’t be read, so there are no events.'
		};
	return { events: eventsFrom(r.stdout, tasks, limit), note: null };
}

/** @param {any} ctx */
export async function readWeather(ctx) {
	const settings = readSettings(ctx.settings);
	const tasks = Array.isArray(ctx.tasks) ? ctx.tasks : [];
	const [hr, gh, ev] = await Promise.all([
		readHeadroom(ctx),
		settings.githubChecks ? readPrChecks(ctx, tasks) : { checks: new Map(), note: null },
		readEvents(ctx, tasks, settings.events)
	]);
	return forecast({
		tasks,
		headroom: hr.headroom,
		prChecks: gh.checks,
		events: ev.events,
		notes: /** @type {string[]} */ ([hr.note, gh.note, ev.note].filter(Boolean)),
		settings,
		now: Date.now()
	});
}

export default {
	providers: [
		{
			id: 'weather',
			scope: 'fleet',
			ttlMs: 60_000,
			timeoutMs: 10_000,
			async fetch(/** @type {any} */ ctx) {
				const value = await readWeather(ctx);
				return { available: true, value, source: 'the fleet', observedAt: value.observedAt };
			}
		}
	],
	contributions: [
		{
			slot: 'header.indicator',
			id: 'weather',
			title: 'Ship’s weather',
			provider: 'weather',
			render: { element: 'ship-weather-indicator' }
		}
	]
};
