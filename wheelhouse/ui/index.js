/**
 * <ship-weather-indicator>: the header pill (a small barometer and the
 * weather in a word) and, on a click, its drill-in: the forecast on a brass
 * barometer, why the weather is what it is, what's wrong, and the ship's log
 * of latest events. Wheelhouse sets `host`, `entry` and `data` (the
 * provider's ship-weather.v1 view); a new `data` re-renders in place.
 *
 * Plugin text is always set with textContent; only the fixed icons below are
 * markup. Links keep to http(s) and same-origin paths.
 */

const SETTINGS_HREF = '/settings/plugins/ship-weather';
const WEATHERS = ['clear', 'fair', 'cloudy', 'squally', 'stormy'];
const SHOW_PROBLEMS = 3;
const SHOW_EVENTS = 4;

const SVG = 'http://www.w3.org/2000/svg';

/** Fixed icons, lucide-style strokes (ISC). */
const ICONS = {
	check: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
	step: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
	failed: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
	quiet:
		'<path d="m19 5 3-3"/><path d="m2 22 3-3"/><path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"/><path d="M7.5 13.5 10 11"/><path d="M10.5 16.5 13 14"/><path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"/>',
	blocked:
		'<path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.31 2a2 2 0 0 1 1.42.59l4.68 4.68A2 2 0 0 1 22 8.69v6.62a2 2 0 0 1-.59 1.42l-4.68 4.68a2 2 0 0 1-1.42.59H8.69a2 2 0 0 1-1.42-.59l-4.68-4.68A2 2 0 0 1 2 15.31V8.69a2 2 0 0 1 .59-1.42l4.68-4.68A2 2 0 0 1 8.69 2z"/>',
	decision:
		'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
	headroom: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>'
};

const CSS = `
:host { display: inline-flex; position: relative; font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif); }
* { box-sizing: border-box; scrollbar-width: none; }
*::-webkit-scrollbar { display: none; }
[data-wx=clear] { --tone: var(--success, #2e6a4f); }
[data-wx=fair] { --tone: var(--sea, #23607f); }
[data-wx=cloudy] { --tone: var(--muted-foreground, #585448); }
[data-wx=squally] { --tone: var(--warning, #7a5a12); }
[data-wx=stormy] { --tone: var(--danger, #b0381a); }
[data-wx] {
	--tone-b: color-mix(in srgb, var(--tone) 38%, transparent);
	--tone-bg: color-mix(in srgb, var(--tone) 8%, transparent);
	--tone-bg2: color-mix(in srgb, var(--tone) 15%, transparent);
}
button { font: inherit; color: inherit; }
a { color: var(--sea, #23607f); text-decoration: none; }
a:hover { text-decoration: underline; }
a:focus-visible, button:focus-visible { outline: 2px solid var(--ring, #23607f); outline-offset: 2px; border-radius: 4px; }

.pill {
	display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 11px 0 4px;
	border-radius: 999px; border: 1px solid var(--tone-b); background: var(--tone-bg); color: var(--tone);
	cursor: pointer; font-size: 12px; font-weight: 500; white-space: nowrap;
	transition: background-color .2s, border-color .2s;
}
.pill:hover { background: var(--tone-bg2); }
.pill:focus-visible { border-radius: 999px; }
.pill .word { font-family: var(--font-display, Georgia, serif); font-size: 14px; letter-spacing: .01em; }
.pill .sep { opacity: .45; }
.pill .n { font-variant-numeric: tabular-nums; }
.dial { width: 20px; height: 20px; flex: none; }

.pop {
	position: fixed; z-index: 60; width: 400px; max-width: calc(100vw - 32px);
	display: flex; flex-direction: column;
	background: var(--popover, #fffdf7); color: var(--popover-foreground, var(--foreground, #14213d));
	border: 1px solid var(--border, #d6cdb8); border-radius: 8px;
	box-shadow: 0 14px 40px -12px rgb(20 33 61 / .28), 0 2px 0 -1px var(--brass, #a88734);
	font-size: 14px; line-height: 1.45; text-align: left; white-space: normal;
	opacity: 0; transform: translateY(-4px) scale(.98); transform-origin: top right;
	visibility: hidden; pointer-events: none;
	transition: opacity .16s ease-out, transform .16s ease-out, visibility 0s linear .16s;
}
.pop.open { opacity: 1; transform: none; visibility: visible; pointer-events: auto; transition: opacity .16s ease-out, transform .16s ease-out; }
.pop:focus { outline: none; }
.scroll { overflow-y: auto; min-height: 0; flex: 1 1 auto; }

.baro {
	display: flex; gap: 16px; align-items: center; padding: 16px 18px;
	border-bottom: 1px solid var(--border, #d6cdb8);
	background: radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--brass, #a88734) 10%, transparent), transparent 60%);
}
.baro > div { min-width: 0; }
.gauge { width: 118px; height: 72px; flex: none; }
.baro h2 { margin: 0; font-family: var(--font-display, Georgia, serif); font-weight: 500; font-size: 22px; line-height: 1.15; color: var(--tone); }
.baro p { margin: 3px 0 0; color: var(--muted-foreground, #585448); }

.sec { padding: 12px 18px 6px; }
.sec h3 {
	margin: 0 0 6px; display: flex; justify-content: space-between;
	font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted-foreground, #585448);
}
.sec h3 .c { font-weight: 500; letter-spacing: 0; text-transform: none; font-variant-numeric: tabular-nums; }
ul { list-style: none; margin: 0; padding: 0; }

.why li { display: grid; grid-template-columns: 7px minmax(0, 1fr); gap: 0 9px; padding: 4px 0; align-items: baseline; }
.pip { width: 7px; height: 7px; border-radius: 99px; flex: none; transform: translateY(-1px); background: var(--hair, #cfc4ab); }
.pip.ok { background: var(--success, #2e6a4f); }
.pip.warn { background: var(--amber, #c98a12); }
.pip.bad { background: var(--danger, #b0381a); }
.why .note { grid-column: 2; color: var(--muted-foreground, #585448); font-size: 12px; overflow-wrap: anywhere; }

.probs li { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 2px 9px; padding: 7px 0; border-top: 1px solid var(--border, #d6cdb8); }
.probs li:first-child { border-top: 0; }
.probs svg { width: 16px; height: 16px; margin-top: 2px; }
.probs .bad { color: var(--danger, #b0381a); }
.probs .warn { color: var(--warning, #7a5a12); }
.probs .t { font-weight: 500; overflow-wrap: anywhere; }
.probs .d { grid-column: 2; color: var(--muted-foreground, #585448); overflow-wrap: anywhere; }
.probs .l { grid-column: 2; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12.5px; margin-top: 2px; }

.log li { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; gap: 10px; padding: 5px 0; align-items: baseline; }
.log li::before {
	content: ""; width: 7px; height: 7px; border-radius: 99px; transform: translate(3px, -1px);
	border: 1.5px solid var(--hair, #cfc4ab); background: var(--popover, #fffdf7);
}
.log li.good::before { border-color: var(--success, #2e6a4f); }
.log li.warn::before { border-color: var(--amber, #c98a12); }
.log li.bad::before { border-color: var(--danger, #b0381a); background: var(--danger, #b0381a); }
.log a { color: inherit; overflow-wrap: anywhere; }
.log .what { color: var(--muted-foreground, #585448); }
.log time { color: var(--muted-foreground, #585448); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }

.more { background: none; border: 0; color: var(--sea, #23607f); cursor: pointer; padding: 4px 0 8px; font-size: 12.5px; }
.empty { color: var(--muted-foreground, #585448); padding: 2px 0 8px; font-style: italic; font-family: var(--font-display, Georgia, serif); font-size: 15px; }
.notes { padding: 0 18px 8px; color: var(--muted-foreground, #585448); font-size: 12px; }
.notes p { margin: 2px 0; }
.foot {
	display: flex; justify-content: space-between; gap: 12px; padding: 9px 18px;
	border-top: 1px solid var(--border, #d6cdb8); border-radius: 0 0 8px 8px;
	background: var(--panel, #fbf8f0); color: var(--muted-foreground, #585448); font-size: 12px;
}
.foot a { color: inherit; }
@media (prefers-reduced-motion: reduce) {
	.pop, .pop.open, .pill, .needle { transition: none !important; }
}
@media (prefers-reduced-motion: no-preference) {
	.needle { transition: transform .5s cubic-bezier(.3, 1.4, .5, 1); }
}
`;

/**
 * @param {string} tag
 * @param {Record<string, string>} [attrs]
 * @param {(Node | string | null | false)[]} [kids]
 */
function h(tag, attrs = {}, kids = []) {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
	for (const k of kids) if (k) el.append(k);
	return el;
}

/**
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @param {Element[]} [kids]
 */
function s(tag, attrs = {}, kids = []) {
	const el = document.createElementNS(SVG, tag);
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
	for (const k of kids) el.append(k);
	return el;
}

/** @param {keyof typeof ICONS} name */
function icon(name) {
	const el = s('svg', {
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		'stroke-width': 2,
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
		'aria-hidden': 'true'
	});
	el.innerHTML = ICONS[name] ?? ICONS.check;
	return el;
}

/** The pill's small barometer: the needle from -70° (clear) to +70° (stormy). */
function dial(level) {
	const a = -70 + level * 35;
	return s('svg', { class: 'dial', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
		s('circle', {
			cx: 12,
			cy: 12,
			r: 10,
			fill: 'var(--card, #fffdf7)',
			stroke: 'currentColor',
			'stroke-width': 1.4
		}),
		s('path', {
			d: 'M5.5 15.5A7.5 7.5 0 0 1 18.5 15.5',
			fill: 'none',
			stroke: 'currentColor',
			'stroke-opacity': 0.35,
			'stroke-width': 1.4,
			'stroke-dasharray': '1 2.2'
		}),
		s('g', { class: 'needle', style: `transform: rotate(${a}deg); transform-origin: 12px 13px` }, [
			s('path', {
				d: 'M12 13V5.5',
				stroke: 'currentColor',
				'stroke-width': 1.6,
				'stroke-linecap': 'round'
			})
		]),
		s('circle', { cx: 12, cy: 13, r: 1.4, fill: 'currentColor' })
	]);
}

/** The drill-in's brass barometer, marked Fair, Change and Stormy as an old one is. */
function gauge(level) {
	const a = -80 + level * 40;
	const marks = [
		['FAIR', -80],
		['CHANGE', 0],
		['STORMY', 80]
	].map(([label, deg]) => {
		const r = ((Number(deg) - 90) * Math.PI) / 180;
		const t = s('text', {
			x: (59 + Math.cos(r) * 48).toFixed(1),
			y: (69 + Math.sin(r) * 48).toFixed(1),
			'font-size': 7.5,
			'text-anchor': 'middle',
			fill: 'var(--muted-foreground, #585448)',
			'font-family': 'var(--font-sans, sans-serif)',
			'letter-spacing': 0.4
		});
		t.textContent = String(label);
		return t;
	});
	return s('svg', { class: 'gauge', viewBox: '-8 -4 134 80', 'aria-hidden': 'true' }, [
		s('path', {
			d: 'M14 66A45 45 0 0 1 104 66',
			fill: 'none',
			stroke: 'var(--hair, #cfc4ab)',
			'stroke-width': 1
		}),
		s('path', {
			d: 'M22 66A37 37 0 0 1 96 66',
			fill: 'none',
			stroke: 'var(--brass, #a88734)',
			'stroke-width': 1.2,
			'stroke-dasharray': '1 3.4'
		}),
		...marks,
		s('g', { class: 'needle', style: `transform: rotate(${a}deg); transform-origin: 59px 66px` }, [
			s('path', {
				d: 'M59 66V30',
				stroke: 'var(--tone)',
				'stroke-width': 2,
				'stroke-linecap': 'round'
			})
		]),
		s('circle', { cx: 59, cy: 66, r: 3.2, fill: 'var(--tone)' })
	]);
}

/** @param {unknown} href */
export function safeHref(href) {
	if (typeof href !== 'string') return null;
	if (/^https?:\/\//i.test(href)) return href;
	if (href.startsWith('/') && !href.startsWith('//')) return href;
	return null;
}

/**
 * "just now", "4 min ago", "2 h ago", "yesterday", "3 days ago".
 * @param {string} iso
 * @param {number} now
 */
export function ago(iso, now) {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return '';
	const sec = Math.max(0, (now - t) / 1000);
	if (sec < 45) return 'just now';
	const min = Math.round(sec / 60);
	if (min < 60) return `${min} min ago`;
	const hr = Math.round(min / 60);
	if (hr < 24) return `${hr} h ago`;
	const d = Math.round(hr / 24);
	return d === 1 ? 'yesterday' : `${d} days ago`;
}

/**
 * A view this element can draw, or null.
 * @param {any} v
 */
export function isView(v) {
	return (
		!!v &&
		typeof v === 'object' &&
		v.schema === 'ship-weather.v1' &&
		WEATHERS.includes(v.weather) &&
		Array.isArray(v.reasons) &&
		Array.isArray(v.problems) &&
		Array.isArray(v.events)
	);
}

/** @param {string} label @param {unknown} href */
function link(label, href) {
	const safe = safeHref(href);
	if (!safe) return null;
	const a = h('a', { href: safe }, [label]);
	if (/^https?:/i.test(safe)) {
		a.target = '_blank';
		a.rel = 'noopener noreferrer';
	}
	return a;
}

export class ShipWeatherIndicator extends HTMLElement {
	/** @type {any} */
	#data = null;
	/** @type {any} */
	#entry = null;
	/** @type {any} */
	#host = null;
	#open = false;
	#allProblems = false;
	#allEvents = false;
	/** @type {number | null} */
	#tick = null;

	constructor() {
		super();
		const root = this.attachShadow({ mode: 'open' });
		const style = document.createElement('style');
		style.textContent = CSS;
		this.pill = h('button', {
			class: 'pill',
			type: 'button',
			'aria-haspopup': 'dialog',
			'aria-expanded': 'false'
		});
		this.pop = h('div', {
			class: 'pop',
			role: 'dialog',
			'aria-label': 'Ship’s weather',
			tabindex: '-1'
		});
		root.append(style, this.pill, this.pop);
		this.pill.addEventListener('click', (e) => {
			e.stopPropagation();
			this.toggle();
		});
		this.pop.addEventListener('click', (e) => {
			const b = /** @type {HTMLElement} */ (e.target)?.closest?.('[data-more]');
			if (!b) return;
			if (b.getAttribute('data-more') === 'problems') this.#allProblems = true;
			else this.#allEvents = true;
			this.#renderPop();
			this.pop.focus();
		});
		this.onDocClick = (/** @type {Event} */ e) => {
			if (this.#open && !e.composedPath().includes(this)) this.close(false);
		};
		this.onKey = (/** @type {KeyboardEvent} */ e) => {
			if (this.#open && e.key === 'Escape') {
				e.preventDefault();
				this.close(true);
			}
		};
		this.onReflow = () => this.#place();
	}

	set host(v) {
		this.#host = v;
	}
	get host() {
		return this.#host;
	}
	set entry(v) {
		this.#entry = v;
	}
	get entry() {
		return this.#entry;
	}
	set data(v) {
		this.#data = v;
		this.render();
	}
	get data() {
		return this.#data;
	}

	get open() {
		return this.#open;
	}

	/** The page this element is in, and its window. */
	get #page() {
		const doc = this.ownerDocument;
		return { doc, win: doc.defaultView };
	}

	connectedCallback() {
		const { doc, win } = this.#page;
		doc.addEventListener('click', this.onDocClick);
		doc.addEventListener('keydown', this.onKey);
		win?.addEventListener('resize', this.onReflow);
		win?.addEventListener('scroll', this.onReflow, true);
		this.render();
	}

	disconnectedCallback() {
		const { doc, win } = this.#page;
		doc.removeEventListener('click', this.onDocClick);
		doc.removeEventListener('keydown', this.onKey);
		win?.removeEventListener('resize', this.onReflow);
		win?.removeEventListener('scroll', this.onReflow, true);
		this.#stopTick();
	}

	toggle() {
		if (this.#open) this.close(false);
		else this.show();
	}

	show() {
		if (!isView(this.#data)) return;
		this.#open = true;
		this.#allProblems = false;
		this.#allEvents = false;
		this.render();
		this.pop.focus();
		// Times in the log keep up while the panel is open.
		this.#stopTick();
		this.#tick = this.#page.win?.setInterval(() => this.#renderPop(), 30_000) ?? null;
	}

	/** @param {boolean} refocus */
	close(refocus) {
		this.#open = false;
		this.#stopTick();
		this.render();
		if (refocus) this.pill.focus();
	}

	#stopTick() {
		if (this.#tick) this.#page.win?.clearInterval(this.#tick);
		this.#tick = null;
	}

	render() {
		const v = this.#data;
		if (!isView(v)) {
			this.hidden = true;
			this.pill.replaceChildren();
			this.pop.replaceChildren();
			this.#open = false;
			this.pop.classList.remove('open');
			return;
		}
		this.hidden = false;
		const level = Math.max(0, WEATHERS.indexOf(v.weather));
		const n = Number.isFinite(v.count) ? v.count : v.problems.length;
		this.pill.dataset.wx = v.weather;
		this.pop.dataset.wx = v.weather;
		this.pill.setAttribute('aria-expanded', String(this.#open));
		this.pill.setAttribute(
			'aria-label',
			`Ship’s weather: ${v.word}${n ? `, ${n} to look at` : ''}. Show why.`
		);
		this.pill.replaceChildren(
			dial(level),
			h('span', { class: 'word' }, [String(v.word)]),
			...(n
				? [
						h('span', { class: 'sep', 'aria-hidden': 'true' }, ['·']),
						h('span', { class: 'n' }, [String(n)])
					]
				: [])
		);
		this.#renderPop();
		this.pop.classList.toggle('open', this.#open);
		if (this.#open) this.#place();
	}

	#renderPop() {
		const v = this.#data;
		if (!isView(v)) return;
		const now = Date.now();
		const level = Math.max(0, WEATHERS.indexOf(v.weather));
		const hadFocus =
			this.shadowRoot?.activeElement && this.pop.contains(this.shadowRoot.activeElement);

		const head = h('div', { class: 'baro' }, [
			gauge(level),
			h('div', {}, [h('h2', {}, [String(v.word)]), h('p', {}, [String(v.summary ?? '')])])
		]);

		const why = h(
			'ul',
			{ class: 'why' },
			v.reasons.map((r) =>
				h('li', {}, [
					h('span', {
						class: `pip ${['ok', 'warn', 'bad'].includes(r.tone) ? r.tone : 'calm'}`,
						'aria-hidden': 'true'
					}),
					h('span', {}, [String(r.text ?? '')]),
					r.note ? h('span', { class: 'note' }, [String(r.note)]) : null
				])
			)
		);

		const probs = this.#allProblems ? v.problems : v.problems.slice(0, SHOW_PROBLEMS);
		const wrong = v.problems.length
			? h(
					'ul',
					{ class: 'probs' },
					probs.map((p) => {
						const tone = p.tone === 'bad' ? 'bad' : 'warn';
						const links = (Array.isArray(p.links) ? p.links : [])
							.map((l) => link(`${l.label} →`, l.href))
							.filter(Boolean);
						return h('li', {}, [
							h('span', { class: tone }, [icon(p.kind)]),
							h('span', { class: 't' }, [String(p.title ?? '')]),
							h('span', { class: 'd' }, [String(p.detail ?? '')]),
							links.length ? h('span', { class: 'l' }, links) : null
						]);
					})
				)
			: h('div', { class: 'empty' }, ['Nothing wrong. Fair winds.']);
		const moreProblems =
			v.problems.length > SHOW_PROBLEMS && !this.#allProblems
				? h('button', { class: 'more', type: 'button', 'data-more': 'problems' }, [
						`Show ${v.problems.length - SHOW_PROBLEMS} more`
					])
				: null;

		const evs = this.#allEvents ? v.events : v.events.slice(0, SHOW_EVENTS);
		const log = v.events.length
			? h(
					'ul',
					{ class: 'log' },
					evs.map((e) => {
						const tone = ['good', 'warn', 'bad'].includes(e.tone) ? e.tone : 'calm';
						const title =
							link(String(e.title ?? ''), e.href) ?? h('span', {}, [String(e.title ?? '')]);
						return h('li', { class: tone }, [
							h('span', {}, [title, h('span', { class: 'what' }, [` — ${String(e.text ?? '')}`])]),
							h('time', { datetime: String(e.at ?? '') }, [ago(String(e.at ?? ''), now)])
						]);
					})
				)
			: h('div', { class: 'empty' }, ['No events yet.']);
		const moreEvents =
			v.events.length > SHOW_EVENTS && !this.#allEvents
				? h('button', { class: 'more', type: 'button', 'data-more': 'events' }, [
						`Show ${v.events.length - SHOW_EVENTS} earlier`
					])
				: null;

		const notes =
			Array.isArray(v.notes) && v.notes.length
				? h(
						'div',
						{ class: 'notes' },
						v.notes.map((t) => h('p', {}, [String(t)]))
					)
				: null;

		const read = ago(String(v.observedAt ?? ''), now);
		const foot = h('div', { class: 'foot' }, [
			h('span', {}, [read ? `Read ${read}` : '']),
			link('Thresholds in Settings → Plugins', SETTINGS_HREF)
		]);

		const section = (
			/** @type {string} */ title,
			/** @type {string | null} */ c,
			/** @type {(Node | null)[]} */ body
		) =>
			h('section', { class: 'sec' }, [
				h('h3', {}, [h('span', {}, [title]), c ? h('span', { class: 'c' }, [c]) : null]),
				...body
			]);

		this.pop.replaceChildren(
			h('div', { class: 'scroll' }, [
				head,
				section('Why', null, [why]),
				section('What’s wrong', v.problems.length ? String(v.problems.length) : null, [
					wrong,
					moreProblems
				]),
				section('Ship’s log', null, [log, moreEvents]),
				notes
			]),
			foot
		);
		if (hadFocus) this.pop.focus();
	}

	/** Under the pill, right-aligned with it, kept inside the window. */
	#place() {
		if (!this.#open) return;
		const r = this.pill.getBoundingClientRect();
		const win = this.#page.win;
		const vw = win?.innerWidth ?? 1024;
		const vh = win?.innerHeight ?? 768;
		const width = Math.min(400, vw - 32);
		const left = Math.max(16, Math.min(r.right - width, vw - 16 - width));
		const top = r.bottom + 8;
		this.pop.style.left = `${left}px`;
		this.pop.style.top = `${top}px`;
		this.pop.style.maxHeight = `${Math.max(200, vh - top - 16)}px`;
	}
}

if (!customElements.get('ship-weather-indicator')) {
	customElements.define('ship-weather-indicator', ShipWeatherIndicator);
}
