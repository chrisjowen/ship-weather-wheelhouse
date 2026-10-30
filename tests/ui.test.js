import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Window } from 'happy-dom';

import { forecast } from '../wheelhouse/server/weather.js';
import { input, task } from './helpers.js';

const window = new Window({ url: 'http://127.0.0.1:4310/' });
const GLOBALS = [
	'window',
	'document',
	'HTMLElement',
	'customElements',
	'Event',
	'KeyboardEvent',
	'MouseEvent'
];
const saved = {};

before(async () => {
	for (const k of GLOBALS) {
		saved[k] = globalThis[k];
		globalThis[k] = k === 'window' ? window : window[k];
	}
	await import('../wheelhouse/ui/index.js');
});
after(async () => {
	document.body.replaceChildren();
	await window.happyDOM.close();
	for (const k of GLOBALS) globalThis[k] = saved[k];
});

const PR = 'https://github.com/acme/albums/pull/7';
function squally() {
	const v = forecast(
		input({
			tasks: [
				task({ id: 'zip', shortTitle: 'Export an album as a zip', pr: { url: PR, number: 7 } }),
				task({ id: 'notes', shortTitle: 'Release notes page', status: 'lost' }),
				task({ id: 'theme', shortTitle: 'Dark mode', status: 'blocked' }),
				task({
					id: 'search',
					shortTitle: 'Instant search',
					status: 'needs-decision',
					attention: { kind: 'decision', owner: 'captain', text: 'Pagefind or Algolia?', url: null }
				})
			],
			prChecks: new Map([[PR, [{ name: 'unit tests', link: null }]]]),
			events: Array.from({ length: 6 }, (_, i) => ({
				at: new Date(Date.now() - (i + 1) * 5 * 60_000).toISOString(),
				title: `Task ${i}`,
				text: 'landed',
				tone: 'good',
				href: `/tasks/t${i}`
			})),
			now: Date.now()
		})
	);
	return v;
}

/** @returns {any} */
function mount(data) {
	const el = document.createElement('ship-weather-indicator');
	el.host = { pluginId: 'ship-weather', service: async () => null, launch: async () => null };
	el.entry = {
		key: 'k',
		slot: 'header.indicator',
		pluginId: 'ship-weather',
		contributionId: 'weather',
		title: 'Ship’s weather',
		projectId: null
	};
	el.data = data;
	document.body.append(el);
	return el;
}
const $ = (el, sel) => el.shadowRoot.querySelector(sel);
const $$ = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];

describe('<ship-weather-indicator>', () => {
	beforeEach(() => document.body.replaceChildren());

	it('shows the weather in a word, with how many things to look at', () => {
		const el = mount(squally());
		const pill = $(el, '.pill');
		assert.equal(pill.querySelector('.word').textContent, 'Squalls');
		assert.equal(pill.querySelector('.n').textContent, '4');
		assert.equal(pill.dataset.wx, 'squally');
		assert.equal(pill.getAttribute('aria-expanded'), 'false');
		assert.equal(
			pill.getAttribute('aria-label'),
			'Ship’s weather: Squalls, 4 to look at. Show why.'
		);
	});

	it('shows nothing when it has nothing it can draw', () => {
		const el = mount({ schema: 'something-else' });
		assert.equal(el.hidden, true);
		el.data = null;
		assert.equal(el.hidden, true);
		el.data = squally();
		assert.equal(el.hidden, false);
	});

	it('opens a drill-in with the forecast, the why, what’s wrong and the ship’s log', () => {
		const el = mount(squally());
		$(el, '.pill').click();
		assert.equal(el.open, true);
		assert.ok($(el, '.pop').classList.contains('open'));
		assert.equal($(el, '.pill').getAttribute('aria-expanded'), 'true');
		assert.equal($(el, '.baro h2').textContent, 'Squalls');
		assert.equal(
			$(el, '.baro p').textContent,
			'A check is failing and a worker isn’t answering, with 2 other things to look at.'
		);
		const heads = $$(el, '.sec h3').map((h) => h.textContent);
		assert.deepEqual(heads, ['Why', 'What’s wrong4', 'Ship’s log']);
		assert.equal($$(el, '.why li')[0].textContent, '1 failing checkon Export an album as a zip');
	});

	it('lists each problem in plain words with links to the task and pull request', () => {
		const el = mount(squally());
		$(el, '.pill').click();
		const first = $$(el, '.probs li')[0];
		assert.equal(first.querySelector('.t').textContent, 'Export an album as a zip');
		assert.equal(
			first.querySelector('.d').textContent,
			'The “unit tests” check failed on its pull request.'
		);
		const links = [...first.querySelectorAll('a')].map((a) => [
			a.textContent,
			a.getAttribute('href'),
			a.getAttribute('target')
		]);
		assert.deepEqual(links, [
			['Pull request →', PR, '_blank'],
			['Open task →', '/tasks/zip', null]
		]);
	});

	it('shows the first few problems and events, and the rest on asking', () => {
		const el = mount(squally());
		$(el, '.pill').click();
		assert.equal($$(el, '.probs li').length, 3);
		assert.equal($$(el, '.log li').length, 4);
		const more = $$(el, '.more');
		assert.deepEqual(
			more.map((b) => b.textContent),
			['Show 1 more', 'Show 2 earlier']
		);
		more[0].click();
		assert.equal($$(el, '.probs li').length, 4);
		$(el, '[data-more=events]').click();
		assert.equal($$(el, '.log li').length, 6);
		assert.equal($$(el, '.more').length, 0);
	});

	it('tells event times in words, newest first', () => {
		const el = mount(squally());
		$(el, '.pill').click();
		const rows = $$(el, '.log li');
		assert.equal(rows[0].querySelector('a').textContent, 'Task 0');
		assert.equal(rows[0].querySelector('.what').textContent, ' — landed');
		assert.equal(rows[0].querySelector('time').textContent, '5 min ago');
	});

	it('closes on Escape, giving focus back to the pill, and on a click elsewhere', () => {
		const el = mount(squally());
		$(el, '.pill').click();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		assert.equal(el.open, false);
		assert.equal(el.shadowRoot.activeElement, $(el, '.pill'));

		$(el, '.pill').click();
		assert.equal(el.open, true);
		document.body.click();
		assert.equal(el.open, false);
	});

	it('stays open, in place, when new data arrives', () => {
		const el = mount(squally());
		$(el, '.pill').click();
		el.data = forecast(input({ now: Date.now() }));
		assert.equal(el.open, true);
		assert.equal($(el, '.baro h2').textContent, 'Clear');
		assert.equal($(el, '.empty').textContent, 'Nothing wrong. Fair winds.');
	});

	it('keeps plugin text as text and drops links it cannot trust', () => {
		const v = squally();
		v.problems[0].title = '<img src=x onerror=alert(1)>';
		v.problems[0].links = [{ label: 'Bad', href: 'javascript:alert(1)' }];
		const el = mount(v);
		$(el, '.pill').click();
		const first = $$(el, '.probs li')[0];
		assert.equal(first.querySelector('.t').textContent, '<img src=x onerror=alert(1)>');
		assert.equal(first.querySelectorAll('img').length, 0);
		assert.equal(first.querySelectorAll('a').length, 0);
	});

	it('says what it could not read, and when it last read', () => {
		const v = squally();
		v.notes = ['Claude’s limits couldn’t be read, so headroom is left out.'];
		const el = mount(v);
		$(el, '.pill').click();
		assert.equal(
			$(el, '.notes').textContent,
			'Claude’s limits couldn’t be read, so headroom is left out.'
		);
		assert.equal($(el, '.foot span').textContent, 'Read just now');
		assert.equal($(el, '.foot a').getAttribute('href'), '/settings/plugins/ship-weather');
	});
});
