/**
 * The plugin's settings, from the captain's plugins file (ctx.settings), with
 * the manifest's defaults filled in. Wheelhouse hands the file's values over
 * as they are, so anything missing, of the wrong type or out of range falls
 * back to its default here.
 */

export const DEFAULTS = Object.freeze({
	headroomLow: 25,
	headroomCritical: 10,
	stormAt: 3,
	decisionsForCloud: 3,
	githubChecks: true,
	events: 12
});

const LIMITS = {
	headroomLow: [0, 100],
	headroomCritical: [0, 100],
	stormAt: [1, 50],
	decisionsForCloud: [1, 50],
	events: [1, 50]
};

/**
 * @param {Record<string, unknown> | null | undefined} raw
 * @returns {typeof DEFAULTS}
 */
export function readSettings(raw) {
	const s = raw && typeof raw === 'object' ? raw : {};
	/** @type {Record<string, number | boolean>} */
	const out = { ...DEFAULTS };
	for (const [key, [min, max]] of Object.entries(LIMITS)) {
		const v = s[key];
		if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) out[key] = v;
	}
	if (typeof s.githubChecks === 'boolean') out.githubChecks = s.githubChecks;
	// "Very low" can never sit above "low".
	if (out.headroomCritical > out.headroomLow) out.headroomCritical = out.headroomLow;
	return /** @type {typeof DEFAULTS} */ (out);
}
