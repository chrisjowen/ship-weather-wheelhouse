import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readSettings } from '../wheelhouse/server/settings.js';
import { forecast } from '../wheelhouse/server/weather.js';
import { plain } from '../wheelhouse/server/words.js';
import { input, ROOMY, task } from './helpers.js';

const PR = 'https://github.com/acme/docs/pull/12';
const decision = (id, text = 'Pagefind or Algolia DocSearch?') =>
	task({
		id,
		shortTitle: `Task ${id}`,
		status: 'needs-decision',
		attention: { kind: 'decision', owner: 'captain', text, url: null }
	});

describe('the weather', () => {
	it('is clear with nothing wrong', () => {
		const v = forecast(input({ tasks: [task()] }));
		assert.equal(v.weather, 'clear');
		assert.equal(v.word, 'Clear');
		assert.equal(v.level, 0);
		assert.equal(v.count, 0);
		assert.deepEqual(v.problems, []);
		assert.equal(v.summary, 'No failing checks, every worker answering, plenty of Claude left.');
		assert.ok(
			v.reasons.some((r) => r.text === 'The one worker out is answering' && r.tone === 'ok')
		);
		assert.ok(
			v.reasons.some((r) => r.text === 'Claude: 72% of this session and 64% of this week left')
		);
	});

	it('is clear and calm with nothing under way', () => {
		const v = forecast(input());
		assert.equal(v.weather, 'clear');
		assert.equal(v.summary, 'Nothing under way, and plenty of Claude left.');
		assert.ok(v.reasons.some((r) => r.text === 'No workers out' && r.tone === 'calm'));
	});

	it('is fair while a decision or two waits on the captain', () => {
		const v = forecast(input({ tasks: [decision('a')] }));
		assert.equal(v.weather, 'fair');
		assert.equal(v.summary, 'A decision is waiting on you.');
		assert.deepEqual(v.problems, [
			{
				kind: 'decision',
				tone: 'warn',
				title: 'Task a',
				detail: 'Waiting on you: Pagefind or Algolia DocSearch?',
				links: [{ label: 'Open task', href: '/tasks/a' }]
			}
		]);
	});

	it('clouds over when decisions pile up', () => {
		const v = forecast(input({ tasks: [decision('a'), decision('b'), decision('c')] }));
		assert.equal(v.weather, 'cloudy');
		assert.equal(v.word, 'Clouding over');
		assert.equal(v.summary, '3 decisions are waiting on you.');
	});

	it('clouds over when a task is blocked', () => {
		const v = forecast(
			input({
				tasks: [task({ status: 'blocked', summary: 'Needs a second checkout to compare themes' })]
			})
		);
		assert.equal(v.weather, 'cloudy');
		assert.equal(v.problems[0].detail, 'Blocked: Needs a second checkout to compare themes.');
		assert.ok(v.reasons.some((r) => r.text === '1 task blocked' && r.tone === 'warn'));
	});

	it('clouds over when Claude is getting low, and says when it resets', () => {
		const v = forecast(
			input({
				headroom: {
					session: { left: 22, resetsAt: '2026-10-30T18:50:00Z' },
					week: { left: 60, resetsAt: null }
				}
			})
		);
		assert.equal(v.weather, 'cloudy');
		assert.equal(v.summary, 'Claude is getting low.');
		assert.deepEqual(v.problems[0], {
			kind: 'headroom',
			tone: 'warn',
			title: 'Claude headroom',
			detail: '22% of this session left; it resets in 1 h 50 min.',
			links: [{ label: 'Headroom', href: '/headroom' }]
		});
	});

	it('brings squalls with a failing check, naming each check and linking the pull request', () => {
		const v = forecast(
			input({
				tasks: [task({ pr: { url: PR, number: 12 } }), decision('b')],
				prChecks: new Map([
					[
						PR,
						[
							{ name: 'unit tests', link: null },
							{ name: 'lint', link: null }
						]
					]
				])
			})
		);
		assert.equal(v.weather, 'squally');
		assert.equal(v.word, 'Squalls');
		assert.equal(v.summary, '2 checks are failing and a decision is waiting on you.');
		assert.deepEqual(v.reasons[0], {
			tone: 'bad',
			text: '2 failing checks',
			note: 'on Instant search for the docs'
		});
		assert.deepEqual(v.problems[0], {
			kind: 'check',
			tone: 'bad',
			title: 'Instant search for the docs',
			detail: 'The “unit tests” and “lint” checks failed on its pull request.',
			links: [
				{ label: 'Pull request', href: PR },
				{ label: 'Open task', href: '/tasks/search-docs' }
			],
			failing: 2
		});
		assert.equal(v.reasons[0].tone, 'bad');
	});

	it('falls back to the validation run’s CI when GitHub was not asked', () => {
		const v = forecast(
			input({ tasks: [task({ pr: { url: PR, number: 12 }, pipeline: { ci: 'red', steps: [] } })] })
		);
		assert.equal(v.weather, 'squally');
		assert.equal(v.problems[0].detail, 'Its pull request’s checks are failing.');
		assert.equal(v.summary, 'Checks are failing.');
		assert.equal(v.reasons[0].text, 'Failing checks');
	});

	it('brings squalls with a failed validation step', () => {
		const v = forecast(
			input({
				tasks: [
					task({
						pipeline: {
							ci: null,
							outcome: 'running',
							steps: [{ key: 'test', label: 'Tests', state: 'failed' }]
						}
					})
				]
			})
		);
		assert.equal(v.weather, 'squally');
		assert.equal(v.problems[0].detail, 'The “Tests” step of its validation run failed.');
	});

	it('brings squalls with a failed passage check, in its own words', () => {
		const v = forecast(
			input({
				tasks: [
					task({
						passage: {
							steps: [],
							current: 0,
							checks: [
								{
									id: 'deploy',
									label: 'Deploy',
									state: 'observed',
									outcome: 'failure',
									summary: 'The production deploy failed',
									url: 'https://ci.example/run/1'
								}
							]
						}
					})
				]
			})
		);
		assert.equal(v.weather, 'squally');
		assert.equal(v.problems[0].detail, 'The production deploy failed.');
		assert.deepEqual(v.problems[0].links[0], { label: 'Deploy', href: 'https://ci.example/run/1' });
	});

	it('brings squalls when a worker stops answering', () => {
		const v = forecast(
			input({ tasks: [task({ status: 'lost' }), task({ id: 'b', status: 'working' })] })
		);
		assert.equal(v.weather, 'squally');
		assert.equal(v.problems[0].detail, 'Its worker isn’t answering.');
		assert.ok(
			v.reasons.some(
				(r) => r.text === '1 worker not answering' && r.note === 'on Instant search for the docs'
			)
		);
	});

	it('is a storm when enough is failing at once', () => {
		const tasks = ['a', 'b', 'c'].map((id) => task({ id, shortTitle: id, status: 'failed' }));
		const v = forecast(input({ tasks }));
		assert.equal(v.weather, 'stormy');
		assert.equal(v.word, 'Storm');
		assert.equal(v.level, 4);
		assert.equal(v.summary, '3 tasks failed.');
	});

	it('is a storm when Claude is nearly out', () => {
		const v = forecast(
			input({ headroom: { session: { left: 6, resetsAt: null }, week: ROOMY.week } })
		);
		assert.equal(v.weather, 'stormy');
		assert.equal(v.problems[0].tone, 'bad');
		assert.equal(v.summary, 'Claude is nearly out.');
	});

	it('follows the captain’s thresholds', () => {
		const settings = readSettings({ stormAt: 1, headroomLow: 80, decisionsForCloud: 1 });
		assert.equal(
			forecast(input({ settings, tasks: [task({ status: 'lost' })] })).weather,
			'stormy'
		);
		assert.equal(forecast(input({ settings })).weather, 'cloudy');
		assert.equal(
			forecast(input({ settings, headroom: null, tasks: [decision('a')] })).weather,
			'cloudy'
		);
	});

	it('leaves landed work out of the weather', () => {
		const v = forecast(
			input({ tasks: [task({ status: 'landed', pipeline: { ci: 'red', steps: [] } })] })
		);
		assert.equal(v.weather, 'clear');
	});

	it('says so when headroom could not be read, rather than guessing', () => {
		const v = forecast(input({ headroom: null, tasks: [task()] }));
		assert.equal(v.weather, 'clear');
		assert.equal(v.summary, 'No failing checks and every worker answering.');
		assert.ok(v.reasons.some((r) => r.text === 'Claude’s limits couldn’t be read'));
	});

	it('lists the most serious problems first and mentions what else there is', () => {
		const v = forecast(
			input({
				tasks: [
					decision('a'),
					task({ id: 'b', shortTitle: 'b', status: 'blocked' }),
					task({ id: 'c', shortTitle: 'c', status: 'lost' })
				]
			})
		);
		assert.deepEqual(
			v.problems.map((p) => p.kind),
			['quiet', 'blocked', 'decision']
		);
		assert.equal(
			v.summary,
			'A worker isn’t answering and a task is blocked, with 1 other thing to look at.'
		);
	});

	it('never shows raw records in its words', () => {
		const v = forecast(
			input({
				tasks: [
					task({
						status: 'blocked',
						summary: 'blocked [at=1793379739]: see /Users/me/state/x.status'
					}),
					task({
						id: 'b',
						status: 'needs-decision',
						attention: {
							kind: 'decision',
							owner: 'captain',
							text: 'run fm-inbox.sh note key=abc',
							url: null
						}
					})
				]
			})
		);
		const words = v.problems.map((p) => p.detail).join(' ');
		assert.equal(words, 'It’s blocked and waiting for help. Waiting on your decision.');
	});
});

describe('plain words', () => {
	it('keeps plain sentences and drops URLs from them', () => {
		assert.equal(
			plain('Waiting for review on https://github.com/a/b/pull/1 today'),
			'Waiting for review on today'
		);
	});
	it('refuses paths, stamps, scripts, run ids and code', () => {
		for (const raw of [
			'see ~/x/y',
			'done [at=1]',
			'ran check.sh',
			'01J9ZQ7W1T3V8C5K2M4N6P8R0S',
			'use `x`',
			'mode=fast'
		])
			assert.equal(plain(raw), null, raw);
	});
	it('shortens long text', () => {
		assert.equal(plain('a'.repeat(200), 10), `${'a'.repeat(9)}…`);
	});
});

describe('settings', () => {
	it('fills in defaults and ignores what does not fit', () => {
		const s = readSettings({ headroomLow: 'high', stormAt: 0, events: 5, githubChecks: false });
		assert.equal(s.headroomLow, 25);
		assert.equal(s.stormAt, 3);
		assert.equal(s.events, 5);
		assert.equal(s.githubChecks, false);
	});
	it('keeps "nearly out" at or below "low"', () => {
		assert.equal(readSettings({ headroomLow: 15, headroomCritical: 30 }).headroomCritical, 15);
	});
});
