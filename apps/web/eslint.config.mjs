import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import _celebbasePlugin from '@celebbase/eslint-plugin-celebbase';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

// CJS→ESM interop: Node.js native ESM doesn't honour __esModule, so the
// default import may be the full module.exports. Unwrap .default if present.
const celebbasePlugin = _celebbasePlugin.default ?? _celebbasePlugin;

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    plugins: { celebbase: celebbasePlugin },
    files: [
      'src/app/api/users/**/*.ts',
      'src/app/api/meal-plans/**/*.ts',
      'src/app/api/ws-ticket/**/*.ts',
    ],
    rules: {
      'celebbase/protected-route-factory': 'error',
    },
  },
];

export default eslintConfig;
