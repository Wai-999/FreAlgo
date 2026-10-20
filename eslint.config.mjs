import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      // External links must never leak opener/referrer to publishers.
      'react/jsx-no-target-blank': [
        'error',
        { allowReferrer: false, enforceDynamicLinks: 'always' },
      ],
    },
  },
  {
    files: ['scripts/**', 'prisma/seed.ts', 'tests/**', 'workers/**'],
    rules: { 'no-console': 'off' },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    'generated/**',
    'next-env.d.ts',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'public/**',
  ]),
]);
