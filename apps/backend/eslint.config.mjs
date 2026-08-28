// ESLint 9 flat config. Replaces the previous .eslintrc.js.
//
// WHY THIS EXISTS: apps/portal-web declares eslint ^9 and apps/backend declared
// eslint ^8, so the workspace hoisted eslint 9 to the repo root and nested
// eslint 8 under apps/backend. @typescript-eslint/eslint-plugin (also hoisted)
// then resolved the ROOT eslint 9 for its base rules while the nested eslint 8
// actually ran the lint, and every run died with:
//
//   TypeError: Error while loading rule '@typescript-eslint/no-unused-expressions':
//   Cannot read properties of undefined (reading 'allowShortCircuit')
//
// Both workspaces are now on eslint 9, so one hoisted copy serves the repo and
// the plugin and the linter agree on the base-rule schema. Keep the two
// workspaces on the same eslint major or this breaks again.
//
// Rule set is intentionally the same as the old .eslintrc.js: typescript-eslint
// recommended + prettier, with the same relaxations. One rule from the old file
// is gone: '@typescript-eslint/interface-name-prefix', which was removed from
// typescript-eslint years ago (v3) and would now be an unknown-rule error
// rather than the silent no-op it had become.

import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'eslint.config.mjs'],
  },
  ...tsPlugin.configs['flat/recommended'],
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: 'tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  prettierRecommended,
];
