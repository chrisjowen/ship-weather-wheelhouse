import js from '@eslint/js';
import globals from 'globals';

export default [
	{ ignores: ['node_modules/'] },
	js.configs.recommended,
	{
		files: ['wheelhouse/server/**/*.js', 'tests/**/*.js', '*.js'],
		languageOptions: { globals: globals.node }
	},
	{
		// The UI and its tests run against a DOM (happy-dom in the tests).
		files: ['wheelhouse/ui/**/*.js', 'tests/ui.test.js'],
		languageOptions: { globals: globals.browser }
	}
];
