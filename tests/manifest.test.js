import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import plugin from '../wheelhouse/server/index.js';
import { DEFAULTS } from '../wheelhouse/server/settings.js';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('.wheelhouse-plugin/plugin.json', root), 'utf8'));
// A copy of the SDK's packages/plugin-sdk/plugin.schema.json, so the tests run offline.
const schema = JSON.parse(readFileSync(new URL('tests/fixtures/plugin.schema.json', root), 'utf8'));

describe('the manifest', () => {
	it('follows the Wheelhouse plugin schema', () => {
		const ajv = new Ajv2020({ allErrors: true, strict: false });
		const valid = ajv.validate(schema, manifest);
		assert.ok(valid, JSON.stringify(ajv.errors, null, 2));
	});

	it('is off until the captain turns it on', () => {
		assert.equal(manifest.wheelhouse.enabledByDefault, false);
		assert.equal(manifest.wheelhouse.enabledWhenFile, undefined);
		assert.equal(manifest.wheelhouse.enabledWhenHomeFile, undefined);
	});

	it('names entries that exist', () => {
		assert.ok(existsSync(new URL(manifest.wheelhouse.server, root)));
		assert.ok(existsSync(new URL(manifest.wheelhouse.ui, root)));
	});

	it('lists exactly what the server entry contributes', () => {
		assert.deepEqual(
			plugin.contributions.map((c) => ({ id: c.id, slot: c.slot })),
			manifest.wheelhouse.contributions
		);
		assert.deepEqual(manifest.wheelhouse.services, []);
		assert.equal(plugin.services, undefined);
	});

	it('draws the header with an element named after the plugin', () => {
		for (const c of plugin.contributions) {
			assert.ok(c.render.element.startsWith(`${manifest.name}-`));
			assert.ok(plugin.providers.some((p) => p.id === c.provider));
		}
	});

	it('declares every setting the server reads, with the same defaults', () => {
		const declared = Object.fromEntries(
			Object.entries(manifest.wheelhouse.settings).map(([k, v]) => [k, v.default])
		);
		assert.deepEqual(declared, { ...DEFAULTS });
	});

	it('agrees with package.json on the version', () => {
		const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
		assert.equal(manifest.version, pkg.version);
	});
});
