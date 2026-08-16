import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'supabase/functions']),

  // Browser: the Vite app.
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // Node: the build config. Not browser code, so it fails on `process` under
  // the browser globals. The Edge Function is Deno and TypeScript and is
  // checked with `deno check`, not with this.
  {
    files: ['vite.config.js', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // Express identifies an error handler by arity, so the fourth argument
      // has to stay even when it is unused.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
])
