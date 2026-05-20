import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.codex-screenshots/**',
      '.edge-capture-profile/**',
      '.next/**',
      '.tmp-atlaskit-tokens/**',
      'node_modules/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    rules: {
      'prefer-const': 'error',
      'no-console': 'warn',
    },
  },
];

export default config;
