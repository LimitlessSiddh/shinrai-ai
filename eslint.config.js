import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const ioModules = [
  'pg',
  'nats',
  'fastify',
  'aws-cdk-lib',
  '@aws-sdk/*',
  '@openai/*',
  'openai',
  'react',
  'next',
  'node:fs',
  'node:net',
  'node:http',
  'node:child_process',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/',
      '**/.next/',
      '**/out/',
      '**/cdk.out/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The domain is pure: no I/O, frameworks, SDKs or UI.
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ioModules.map((group) => ({
            group: [group],
            message: 'packages/domain must stay pure; use a port.',
          })),
        },
      ],
    },
  },
  {
    // Agent tools only see narrow ports; never a database, shell or HTTP client.
    files: ['packages/agent-tools/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [...ioModules, '@shinrai/adapters'].map((group) => ({
            group: [group],
            message: 'Agent tools must not reach privileged I/O.',
          })),
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
