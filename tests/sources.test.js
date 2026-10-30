import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { eventsFrom } from '../wheelhouse/server/events.js';
import { parseQuota } from '../wheelhouse/server/headroom.js';
import plugin, { MAX_PRS, readWeather } from '../wheelhouse/server/index.js';
import { task } from './helpers.js';

const line = (o) => JSON.stringify({ v: 1, ...o });
const TASKS = [
	task({ id: 'zip', shortTitle: 'Export an album as a zip' }),
	task({ id: 'tour', shortTitle: 'Onboarding tour' })
];

describe('the latest events', () => {
	const ledger = [
		line({ ts: 1000, event: 'task.dispatched', task: 'zip', project: 'albums' }),
		line({
			ts: 1100,
			event: 'task.status',
			task: 'zip',
			state: 'working',
			text: ' setup done on fm/zip'
		}),
		line({
			ts: 1200,
			event: 'task.status',
			task: 'zip',
			state: 'blocked',
			text: ' needs /Users/me/x'
		}),
		line({ ts: 1250, event: 'task.status', task: 'zip', state: 'blocked', text: ' still blocked' }),
		'not json',
		line({ ts: 1300, event: 'task.pr_ready', task: 'zip', pr: 'https://github.com/a/b/pull/3' }),
		line({ ts: 1400, event: 'task.dispatched', task: 'someone-elses', project: 'other' }),
		line({ ts: 1500, event: 'task.merged', task: 'tour', via: 'pr', pr: 'javascript:alert(1)' }),
		line({ ts: 1600, event: 'task.cleaned_up', task: 'tour' })
	].join('\n');

	it('are newest first, in the panel’s own words, about this plugin’s tasks only', () => {
		assert.deepEqual(eventsFrom(ledger, TASKS, 10), [
			{
				at: '1970-01-01T00:25:00.000Z',
				title: 'Onboarding tour',
				text: 'landed',
				tone: 'good',
				href: '/tasks/tour'
			},
			{
				at: '1970-01-01T00:21:40.000Z',
				title: 'Export an album as a zip',
				text: 'pull request ready for review',
				tone: 'good',
				href: 'https://github.com/a/b/pull/3'
			},
			{
				at: '1970-01-01T00:20:50.000Z',
				title: 'Export an album as a zip',
				text: 'blocked',
				tone: 'warn',
				href: '/tasks/zip'
			},
			{
				at: '1970-01-01T00:16:40.000Z',
				title: 'Export an album as a zip',
				text: 'work started',
				tone: 'calm',
				href: '/tasks/zip'
			}
		]);
	});

	it('stop at the limit', () => {
		assert.equal(eventsFrom(ledger, TASKS, 2).length, 2);
	});

	it('merge a repeat only when it is about the same task', () => {
		const twins = [
			task({ id: 'a', shortTitle: 'Same name' }),
			task({ id: 'b', shortTitle: 'Same name' })
		];
		const text = [
			line({ ts: 1000, event: 'task.status', task: 'a', state: 'done' }),
			line({ ts: 1100, event: 'task.status', task: 'b', state: 'done' }),
			line({ ts: 1200, event: 'task.status', task: 'b', state: 'done' })
		].join('\n');
		assert.deepEqual(
			eventsFrom(text, twins, 10).map((e) => e.href),
			['/tasks/b', '/tasks/a']
		);
	});

	it('never carry the worker’s status text', () => {
		const all = JSON.stringify(eventsFrom(ledger, TASKS, 10));
		assert.ok(
			!all.includes('/Users') && !all.includes('still blocked') && !all.includes('setup done')
		);
	});
});

describe('Claude headroom', () => {
	it('reads the session and week windows from quota-axi', () => {
		const report = {
			providers: [
				{
					provider: 'claude',
					windows: [
						{ id: 'five_hour', percentRemaining: 93.4, resetsAt: '2026-10-30T21:30:00Z' },
						{ id: 'seven_day', percentRemaining: 74, resetsAt: 'soon' },
						{ id: 'model:fable', percentRemaining: 100 }
					]
				}
			]
		};
		assert.deepEqual(parseQuota(JSON.stringify(report)), {
			session: { left: 93, resetsAt: '2026-10-30T21:30:00Z' },
			week: { left: 74, resetsAt: null }
		});
	});
	it('is null when there is nothing to read', () => {
		assert.equal(parseQuota('nope'), null);
		assert.equal(
			parseQuota(JSON.stringify({ providers: [{ provider: 'claude', windows: [] }] })),
			null
		);
	});
});

/** A provider context whose commands answer from a table, recording what ran. */
function fakeCtx(tasks, answers, settings = {}) {
	const ran = [];
	return {
		ran,
		ctx: {
			project: null,
			task: null,
			projects: [],
			tasks,
			settings,
			signal: new AbortController().signal,
			readFile: async () => null,
			listDir: async () => null,
			changedFiles: async () => null,
			async exec(req) {
				ran.push(req);
				const answer = answers[req.argv[0]];
				return typeof answer === 'function'
					? answer(req)
					: (answer ?? { ok: false, reason: 'not found', stdout: '', stderr: '' });
			}
		}
	};
}

const QUOTA = JSON.stringify({
	providers: [
		{
			provider: 'claude',
			windows: [
				{ id: 'five_hour', percentRemaining: 40 },
				{ id: 'seven_day', percentRemaining: 70 }
			]
		}
	]
});

describe('the provider', () => {
	it('reads everything through the context, in the Firstmate home, and forecasts', async () => {
		const pr = 'https://github.com/acme/albums/pull/7';
		const tasks = [
			task({ id: 'zip', shortTitle: 'Export an album as a zip', pr: { url: pr, number: 7 } })
		];
		const { ctx, ran } = fakeCtx(tasks, {
			// quota-axi exits non-zero when a provider needs attention, and still prints its report.
			'quota-axi': { ok: false, reason: 'exit 2', stdout: QUOTA, stderr: '' },
			// gh exits non-zero while checks fail, and still prints them.
			gh: {
				ok: false,
				reason: 'exit 1',
				stdout: JSON.stringify([
					{ name: 'unit tests', bucket: 'fail', link: 'https://x/1' },
					{ name: 'lint', bucket: 'pass' }
				]),
				stderr: ''
			},
			tail: { ok: true, stdout: line({ ts: 1000, event: 'task.pr_ready', task: 'zip', pr }) }
		});
		const v = await readWeather(ctx);
		assert.equal(v.weather, 'squally');
		assert.equal(v.problems[0].detail, 'The “unit tests” check failed on its pull request.');
		assert.equal(v.events.length, 1);
		assert.deepEqual(v.notes, []);
		assert.ok(ran.every((r) => r.cwd === 'home'));
		assert.deepEqual(ran.find((r) => r.argv[0] === 'gh').argv, [
			'gh',
			'pr',
			'checks',
			pr,
			'--json',
			'name,bucket,link'
		]);
		assert.deepEqual(ran.find((r) => r.argv[0] === 'tail').argv, [
			'tail',
			'-n',
			'400',
			'state/fleet-ledger.jsonl'
		]);
	});

	it('says in plain words what it could not read, and still forecasts', async () => {
		const tasks = [task({ pr: { url: 'https://github.com/acme/docs/pull/1', number: 1 } })];
		const { ctx } = fakeCtx(tasks, {});
		const v = await readWeather(ctx);
		assert.equal(v.weather, 'clear');
		assert.deepEqual(v.notes, [
			'Claude’s limits couldn’t be read, so headroom is left out.',
			'GitHub didn’t answer for one pull request, so its checks are left out.',
			'Firstmate’s fleet ledger couldn’t be read, so there are no events.'
		]);
	});

	it('asks GitHub only about open pull requests, a bounded number of them, and not at all when told not to', async () => {
		const tasks = Array.from({ length: 12 }, (_, i) =>
			task({
				id: `t${i}`,
				pr: { url: `https://github.com/acme/x/pull/${i}`, number: i },
				status: i === 0 ? 'landed' : 'working'
			})
		);
		const ok = { ok: true, stdout: '[]' };
		const on = fakeCtx(tasks, { gh: ok, tail: { ok: true, stdout: '' } });
		await readWeather(on.ctx);
		const asked = on.ran.filter((r) => r.argv[0] === 'gh').map((r) => r.argv[3]);
		assert.equal(asked.length, MAX_PRS);
		assert.ok(!asked.includes('https://github.com/acme/x/pull/0'));

		const off = fakeCtx(tasks, { gh: ok, tail: { ok: true, stdout: '' } }, { githubChecks: false });
		await readWeather(off.ctx);
		assert.equal(off.ran.filter((r) => r.argv[0] === 'gh').length, 0);
	});

	it('still forecasts, with no events, when the context has no task list', async () => {
		const { ctx } = fakeCtx(undefined, {
			tail: { ok: true, stdout: line({ ts: 1000, event: 'task.dispatched', task: 'zip' }) }
		});
		const v = await readWeather(ctx);
		assert.equal(v.weather, 'clear');
		assert.deepEqual(v.events, []);
	});

	it('is the plugin’s one fleet provider, filling the header with its element', async () => {
		assert.equal(plugin.providers.length, 1);
		const [p] = plugin.providers;
		assert.equal(p.scope, 'fleet');
		assert.ok(p.timeoutMs <= 10_000);
		const { ctx } = fakeCtx([], { tail: { ok: true, stdout: '' } });
		const r = await p.fetch(ctx);
		assert.equal(r.available, true);
		assert.equal(r.value.schema, 'ship-weather.v1');
		assert.equal(r.observedAt, r.value.observedAt);
		// Plain JSON only.
		assert.deepEqual(JSON.parse(JSON.stringify(r.value)), r.value);
	});
});
