/** Small helpers for the plain words the panel shows. */

/**
 * "1 check" / "3 checks".
 * @param {number} n
 * @param {string} one
 * @param {string} [many]
 */
export function count(n, one, many = `${one}s`) {
	return `${n} ${n === 1 ? one : many}`;
}

/**
 * A span of time in words: "40 min", "1 h 50 min", "3 days".
 * @param {number} ms
 */
export function span(ms) {
	const min = Math.max(1, Math.round(ms / 60_000));
	if (min < 60) return `${min} min`;
	const h = Math.floor(min / 60);
	const m = min % 60;
	if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
	const d = Math.round(h / 24);
	return count(d, 'day');
}

// What makes a line read like a record rather than words: a file path, a
// status stamp, a script name, a run id, code quoting or a key=value pair.
const RAW = [
	/(^|[\s("'])(~|\.{1,2})?\/[\w.@-]+\/[\w./@-]*/,
	/\[(at|key)=/,
	/\b[\w-]+\.(sh|mjs|js|ts|py|json|jsonl|md|msg)\b/,
	/\b[0-9A-HJKMNP-TV-Z]{26}\b/,
	/`/,
	/\b[a-z_]+=\S/
];

/**
 * Text from Wheelhouse's task summaries, kept only when it already reads as
 * plain words; null otherwise, so the caller uses its own sentence instead.
 * URLs are dropped first, since the panel links to them separately.
 * @param {unknown} text
 * @param {number} [max]
 */
export function plain(text, max = 160) {
	if (typeof text !== 'string') return null;
	const t = text
		.replace(/https?:\/\/\S+/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!t || RAW.some((re) => re.test(t))) return null;
	return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** @param {string} s */
export function sentence(s) {
	const t = s.trim();
	if (!t) return t;
	const c = t[0].toUpperCase() + t.slice(1);
	return /[.!?…]$/.test(c) ? c : `${c}.`;
}

/**
 * "a and b", "a, b and c".
 * @param {string[]} parts
 */
export function join(parts) {
	if (parts.length <= 1) return parts.join('');
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Only http(s) URLs and same-origin paths, as Wheelhouse's own blocks keep.
 * @param {unknown} href
 */
export function safeHref(href) {
	if (typeof href !== 'string') return null;
	if (/^https?:\/\//i.test(href)) return href;
	if (href.startsWith('/') && !href.startsWith('//')) return href;
	return null;
}

/** @param {string} id */
export function taskHref(id) {
	return `/tasks/${encodeURIComponent(id)}`;
}
