/**
 * Claude headroom from `quota-axi --provider claude --json`, the same report
 * Wheelhouse's own Headroom page reads: how much of this session's and this
 * week's allowance is left, and when each resets.
 *
 * @typedef {{ left: number, resetsAt: string | null }} Allowance
 * @typedef {{ session: Allowance | null, week: Allowance | null }} Headroom
 */

/** The command, never asking for Keychain access or refreshing credentials. */
export const QUOTA_ARGV = [
	'quota-axi',
	'--provider',
	'claude',
	'--json',
	'--no-credential-refresh',
	'--max-age',
	'2m'
];

/**
 * @param {string} stdout
 * @returns {Headroom | null} null when the report has no Claude allowance in it
 */
export function parseQuota(stdout) {
	let report;
	try {
		report = JSON.parse(stdout);
	} catch {
		return null;
	}
	const claude = Array.isArray(report?.providers)
		? report.providers.find((p) => p?.provider === 'claude')
		: null;
	const windows = Array.isArray(claude?.windows) ? claude.windows : [];
	/** @param {string} id */
	const pick = (id) => {
		const w = windows.find((x) => x?.id === id);
		if (!w || typeof w.percentRemaining !== 'number' || !Number.isFinite(w.percentRemaining))
			return null;
		const left = Math.max(0, Math.min(100, Math.round(w.percentRemaining)));
		const resetsAt =
			typeof w.resetsAt === 'string' && !Number.isNaN(Date.parse(w.resetsAt)) ? w.resetsAt : null;
		return { left, resetsAt };
	};
	const session = pick('five_hour');
	const week = pick('seven_day');
	return session || week ? { session, week } : null;
}
