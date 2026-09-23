import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'build/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Greasemonkey / Tampermonkey APIs used by the userscript.
        GM_addStyle: 'readonly',
        GM_getValue: 'readonly',
        GM_setValue: 'readonly',
        GM_deleteValue: 'readonly',
        GM_setClipboard: 'readonly',
        GM_registerMenuCommand: 'readonly',
        GM_unregisterMenuCommand: 'readonly',
        GM_info: 'readonly',
        // Injected by the build.
        __TC_VERSION__: 'readonly',
        __TC_CHANNEL__: 'readonly',
        __TC_BUILD__: 'readonly',
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['info', 'warn', 'error', 'debug'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
