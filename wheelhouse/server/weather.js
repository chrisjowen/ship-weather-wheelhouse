import { count, join, plain, safeHref, sentence, span, taskHref } from './words.js';

/**
 * Fleet health as weather. Everything here is pure: the provider gathers the
 * fleet's tasks, Claude headroom and pull request checks, and this turns them
 * into what the header pill and its drill-in show.
 *
 *   clear    nothing to look at
 *   fair     a decision or two waiting on the captain
 *   cloudy   something blocked, Claude getting low, or decisions piling up
 *   squally  a failing check, a failed step or task, or a worker not answering
 *   stormy   that many failures at once (`stormAt`), or Claude nearly out
 *
 * @typedef {'clear' | 'fair' | 'cloudy' | 'squally' | 'stormy'} Weather
 * @typedef {'ok' | 'warn' | 'bad' | 'calm'} Tone
 * @typedef {{ label: string, href: string }} Link
 * @typedef {{ kind: 'check' | 'step' | 'failed' | 'quiet' | 'blocked' | 'decision' | 'headroom', tone: 'bad' | 'warn', title: string, detail: string, links: Link[], failing?: number | null }} Problem
 *   `failing`, on a check problem: how many checks failed (null when only "some" is known)
 * @typedef {{ tone: Tone, text: string, note: string | null }} Reason
 * @typedef {import('./events.js').WeatherEvent} WeatherEvent
 * @typedef {import('./headroom.js').Headroom} Headroom
 * @typedef {import('./settings.js').DEFAULTS} Settings
 * @typedef {{ name: string, link: string | null }} FailedCheck
 *
 * @typedef {object} WeatherView
 * @property {'ship-weather.v1'} schema
 * @property {Weather} weather
 * @property {number} level 0 (clear) to 4 (stormy)
 * @property {string} word what the pill says
 * @property {string} summary one sentence: what the weather is made of
 * @property {number} count how many problems the drill-in lists
 * @property {Reason[]} reasons
 * @property {Problem[]} problems
 * @property {WeatherEvent[]} events newest first
 * @property {string[]} notes what could not be read, in plain words
 * @property {string} observedAt
 */

export const WEATHERS = /** @type {const} */ (['clear', 'fair', 'cloudy', 'squally', 'stormy']);

/** @type {Record<Weather, string>} */
export const WORDS = {
	clear: 'Clear',
	fair: 'Fair',
	cloudy: 'Clouding over',
	squally: 'Squalls',
	stormy: 'Storm'
};

/** Statuses that are over: nothing about them makes weather. */
const OVER = new Set(['landed']);
/** Statuses with no worker out yet, or no longer. */
const NO_WORKER = new Set(['landed', 'done', 'queued']);
/** Passage check outcomes that mean it failed. */
const CHECK_FAILED = new Set(['failure', 'failed', 'error', 'timed_out', 'mismatch']);

/**
 * @param {any} t a task as Wheelhouse hands it to plugins
 * @returns {{ id: string, title: string, status: string, pr: string | null }}
 */
function brief(t) {
	return {
		id: String(t.id),
		title: String(t.shortTitle || t.title || 'A task'),
		status: String(t.status ?? 'unknown'),
		pr: safeHref(t.pr?.url)
	};
}

/**
 * @param {ReturnType<typeof brief>} t
 * @param {boolean} [withPr]
 * @returns {Link[]}
 */
function linksFor(t, withPr = false) {
	/** @type {Link[]} */
	const links = [];
	if (withPr && t.pr) links.push({ label: 'Pull request', href: t.pr });
	links.push({ label: 'Open task', href: taskHref(t.id) });
	return links;
}

/** @param {string[]} names */
function quoted(names) {
	return join(names.map((n) => `“${n}”`));
}

/**
 * Everything wrong with one task, most serious first.
 * @param {any} raw
 * @param {Map<string, FailedCheck[]>} prChecks failing GitHub checks by pull request URL
 * @returns {Problem[]}
 */
export function problemsOf(raw, prChecks) {
	const t = brief(raw);
	if (OVER.has(t.status)) return [];
	/** @type {Problem[]} */
	const out = [];

	// Failing checks: the pull request's own, else what the validation run's CI monitor saw.
	const gh = t.pr ? (prChecks.get(t.pr) ?? []) : [];
	const names = [...new Set(gh.map((c) => c.name).filter(Boolean))];
	if (names.length) {
		out.push({
			kind: 'check',
			tone: 'bad',
			title: t.title,
			detail: `The ${quoted(names)} ${names.length === 1 ? 'check' : 'checks'} failed on its pull request.`,
			links: linksFor(t, true),
			failing: names.length
		});
	} else if (raw.pipeline?.ci === 'red') {
		out.push({
			kind: 'check',
			tone: 'bad',
			title: t.title,
			detail: 'Its pull request’s checks are failing.',
			links: linksFor(t, true),
			failing: null
		});
	}

	// Passage checks Wheelhouse ran for it (a deploy, a release) that came back failed.
	const passageChecks = Array.isArray(raw.passage?.checks) ? raw.passage.checks : [];
	const failedChecks = passageChecks.filter(
		(c) => c?.state === 'observed' && CHECK_FAILED.has(String(c.outcome))
	);
	for (const c of failedChecks) {
		const label = plain(c.label, 60) ?? 'A check';
		const link = safeHref(c.url);
		out.push({
			kind: 'check',
			tone: 'bad',
			title: t.title,
			detail: sentence(plain(c.summary) ?? `${label} failed`),
			links: [...(link ? [{ label: label, href: link }] : []), ...linksFor(t)],
			failing: 1
		});
	}

	// A failed step: of its validation run, or the passage step it is stuck on.
	const steps = Array.isArray(raw.pipeline?.steps) ? raw.pipeline.steps : [];
	const failedSteps = steps
		.filter((s) => s?.state === 'failed')
		.map((s) => plain(s.label, 40))
		.filter(Boolean);
	const passageStep = raw.passage?.steps?.[raw.passage?.current];
	if (failedSteps.length) {
		out.push({
			kind: 'step',
			tone: 'bad',
			title: t.title,
			detail: `The ${quoted(/** @type {string[]} */ (failedSteps))} ${failedSteps.length === 1 ? 'step' : 'steps'} of its validation run failed.`,
			links: linksFor(t, true)
		});
	} else if (raw.pipeline?.outcome === 'failed') {
		out.push({
			kind: 'step',
			tone: 'bad',
			title: t.title,
			detail: 'Its validation run failed.',
			links: linksFor(t, true)
		});
	} else if (passageStep?.failed && !failedChecks.length) {
		out.push({
			kind: 'step',
			tone: 'bad',
			title: t.title,
			detail: `${plain(passageStep.label, 40) ?? 'Its current step'} failed.`,
			links: linksFor(t, true)
		});
	}

	const said = plain(raw.summary);
	switch (t.status) {
		case 'failed':
			out.push({
				kind: 'failed',
				tone: 'bad',
				title: t.title,
				detail: said ? sentence(`It failed: ${said}`) : 'The work stopped with a failure.',
				links: linksFor(t, true)
			});
			break;
		case 'lost':
			out.push({
				kind: 'quiet',
				tone: 'bad',
				title: t.title,
				detail: 'Its worker isn’t answering.',
				links: linksFor(t)
			});
			break;
		case 'unknown':
			out.push({
				kind: 'quiet',
				tone: 'bad',
				title: t.title,
				detail: 'Wheelhouse can’t tell what its worker is doing.',
				links: linksFor(t)
			});
			break;
		case 'blocked':
			out.push({
				kind: 'blocked',
				tone: 'warn',
				title: t.title,
				detail: said ? sentence(`Blocked: ${said}`) : 'It’s blocked and waiting for help.',
				links: linksFor(t)
			});
			break;
	}

	if (raw.attention?.owner === 'captain' && raw.attention?.kind === 'decision') {
		const asked = plain(raw.attention.text);
		out.push({
			kind: 'decision',
			tone: 'warn',
			title: t.title,
			detail: asked ? sentence(`Waiting on you: ${asked}`) : 'Waiting on your decision.',
			links: linksFor(t)
		});
	}
	return out;
}

/**
 * @param {Headroom | null} h
 * @param {Settings} s
 * @param {number} now
 * @returns {{ level: 'ok' | 'low' | 'critical' | null, problem: Problem | null, reason: Reason }}
 */
export function headroomOf(h, s, now) {
	if (!h) {
		return {
			level: null,
			problem: null,
			reason: { tone: 'calm', text: 'Claude’s limits couldn’t be read', note: null }
		};
	}
	const windows = /** @type {const} */ ([
		['session', h.session],
		['week', h.week]
	])
		.filter(([, w]) => w)
		.map(([name, w]) => ({
			name,
			left: /** @type {any} */ (w).left,
			resetsAt: w?.resetsAt ?? null
		}));
	const tightest = windows.reduce((a, b) => (b.left < a.left ? b : a));
	const level =
		tightest.left <= s.headroomCritical
			? 'critical'
			: tightest.left <= s.headroomLow
				? 'low'
				: 'ok';
	const resets =
		tightest.resetsAt && Date.parse(tightest.resetsAt) > now
			? `resets in ${span(Date.parse(tightest.resetsAt) - now)}`
			: null;
	const parts = windows.map((w) => `${w.left}% of this ${w.name}`);
	const text = `Claude: ${join(parts)} left`;
	if (level === 'ok') return { level, problem: null, reason: { tone: 'ok', text, note: null } };
	return {
		level,
		problem: {
			kind: 'headroom',
			tone: level === 'critical' ? 'bad' : 'warn',
			title: 'Claude headroom',
			detail: sentence(
				`${tightest.left}% of this ${tightest.name} left${resets ? `; it ${resets}` : ''}`
			),
			links: [{ label: 'Headroom', href: '/headroom' }]
		},
		reason: { tone: level === 'critical' ? 'bad' : 'warn', text, note: resets }
	};
}

const TONE_ORDER = { bad: 0, warn: 1, ok: 2, calm: 3 };
const KIND_ORDER = { check: 0, step: 1, failed: 2, quiet: 3, headroom: 4, blocked: 5, decision: 6 };

/**
 * @param {object} input
 * @param {any[]} input.tasks the fleet's tasks, as Wheelhouse hands them to plugins
 * @param {Headroom | null} input.headroom
 * @param {Map<string, FailedCheck[]>} input.prChecks
 * @param {WeatherEvent[]} input.events
 * @param {string[]} input.notes
 * @param {Settings} input.settings
 * @param {number} input.now milliseconds
 * @returns {WeatherView}
 */
export function forecast({ tasks, headroom, prChecks, events, notes, settings, now }) {
	const perTask = tasks.map((t) => problemsOf(t, prChecks));
	const all = perTask.flat();
	const hr = headroomOf(headroom, settings, now);
	if (hr.problem) all.push(hr.problem);

	const of = (/** @type {Problem['kind'][]} */ ...kinds) =>
		all.filter((p) => kinds.includes(p.kind));
	const checks = of('check');
	const steps = of('step');
	const failed = of('failed');
	const quiet = of('quiet');
	const blocked = of('blocked');
	const decisions = of('decision');
	// How many checks failed in all; null when some pull request only says "some".
	const failingChecks = checks.some((p) => p.failing == null)
		? null
		: checks.reduce((n, p) => n + (p.failing ?? 0), 0);
	const badCount = checks.length + steps.length + failed.length + quiet.length;
	const out = tasks.filter((t) => !NO_WORKER.has(String(t.status))).length;

	/** @type {Weather} */
	let weather = 'clear';
	if (hr.level === 'critical' || badCount >= settings.stormAt) weather = 'stormy';
	else if (badCount > 0) weather = 'squally';
	else if (blocked.length || hr.level === 'low' || decisions.length >= settings.decisionsForCloud)
		weather = 'cloudy';
	else if (decisions.length) weather = 'fair';

	// The why: every signal the weather is read from, problems first.
	/** @type {Reason[]} */
	const reasons = [];
	const titles = (/** @type {Problem[]} */ ps) => [...new Set(ps.map((p) => p.title))];
	const onOne = (/** @type {Problem[]} */ ps) => {
		const ts = titles(ps);
		return ts.length === 1 ? `on ${ts[0]}` : `on ${count(ts.length, 'task')}`;
	};
	reasons.push(
		checks.length
			? {
					tone: 'bad',
					text: failingChecks === null ? 'Failing checks' : count(failingChecks, 'failing check'),
					note: onOne(checks)
				}
			: { tone: 'ok', text: 'No failing checks', note: null }
	);
	if (steps.length || failed.length) {
		const n = steps.length + failed.length;
		reasons.push({
			tone: 'bad',
			text: count(n, 'failed step or task', 'failed steps or tasks'),
			note: onOne([...steps, ...failed])
		});
	}
	reasons.push(
		quiet.length
			? { tone: 'bad', text: `${count(quiet.length, 'worker')} not answering`, note: onOne(quiet) }
			: out
				? {
						tone: 'ok',
						text:
							out === 1
								? 'The one worker out is answering'
								: `All ${out} workers out are answering`,
						note: null
					}
				: { tone: 'calm', text: 'No workers out', note: null }
	);
	reasons.push(
		blocked.length
			? { tone: 'warn', text: `${count(blocked.length, 'task')} blocked`, note: onOne(blocked) }
			: { tone: 'calm', text: 'Nothing blocked', note: null }
	);
	reasons.push(
		decisions.length
			? { tone: 'warn', text: `${count(decisions.length, 'decision')} waiting on you`, note: null }
			: { tone: 'calm', text: 'No decisions waiting on you', note: null }
	);
	reasons.push(hr.reason);
	reasons.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);

	const problems = all
		.map((p, i) => ({ p, i }))
		.sort(
			(a, b) =>
				(a.p.tone === b.p.tone ? 0 : a.p.tone === 'bad' ? -1 : 1) ||
				KIND_ORDER[a.p.kind] - KIND_ORDER[b.p.kind] ||
				a.i - b.i
		)
		.map(({ p }) => p);

	return {
		schema: 'ship-weather.v1',
		weather,
		level: WEATHERS.indexOf(weather),
		word: WORDS[weather],
		summary: summarise({
			checks,
			failingChecks,
			steps,
			failed,
			quiet,
			blocked,
			decisions,
			hr: hr.level,
			tasks: tasks.length,
			headroomKnown: hr.level !== null
		}),
		count: problems.length,
		reasons,
		problems,
		events,
		notes,
		observedAt: new Date(now).toISOString()
	};
}

/**
 * One sentence: the two most serious things, or why it is clear.
 * @param {{ checks: Problem[], failingChecks: number | null, steps: Problem[], failed: Problem[], quiet: Problem[], blocked: Problem[], decisions: Problem[], hr: 'ok' | 'low' | 'critical' | null, tasks: number, headroomKnown: boolean }} x
 */
function summarise(x) {
	/** @type {string[]} */
	const parts = [];
	const n = (/** @type {Problem[]} */ ps) => ps.length;
	if (x.hr === 'critical') parts.push('Claude is nearly out');
	if (n(x.checks))
		parts.push(
			x.failingChecks === 1
				? 'a check is failing'
				: x.failingChecks === null
					? 'checks are failing'
					: `${x.failingChecks} checks are failing`
		);
	if (n(x.steps)) parts.push(n(x.steps) === 1 ? 'a step failed' : `${n(x.steps)} steps failed`);
	if (n(x.failed)) parts.push(n(x.failed) === 1 ? 'a task failed' : `${n(x.failed)} tasks failed`);
	if (n(x.quiet))
		parts.push(
			n(x.quiet) === 1 ? 'a worker isn’t answering' : `${n(x.quiet)} workers aren’t answering`
		);
	if (n(x.blocked))
		parts.push(n(x.blocked) === 1 ? 'a task is blocked' : `${n(x.blocked)} tasks are blocked`);
	if (x.hr === 'low') parts.push('Claude is getting low');
	if (n(x.decisions))
		parts.push(
			n(x.decisions) === 1
				? 'a decision is waiting on you'
				: `${n(x.decisions)} decisions are waiting on you`
		);
	if (parts.length) {
		const shown = parts.slice(0, 2);
		const more = parts.length - shown.length;
		return sentence(join(shown) + (more ? `, with ${count(more, 'other thing')} to look at` : ''));
	}
	if (!x.tasks)
		return x.headroomKnown
			? 'Nothing under way, and plenty of Claude left.'
			: 'Nothing under way. Calm seas.';
	return x.headroomKnown
		? 'No failing checks, every worker answering, plenty of Claude left.'
		: 'No failing checks and every worker answering.';
}
