import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-empty-function': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/design-tokens/scripts/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['./packages/design-tokens/tsconfig.scripts.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // CHORE-MOBILE-001: apps/mobile (Expo / React Native) 도메인 가드
    // - @celebbase/service-core: Fastify/pg/jose 등 Node.js-only 서버 의존성 — RN 번들 불가
    // - @celebbase/ui-kit: react-dom + CSS Modules + window/document/localStorage — RN 미호환
    // 동료가 apps/mobile 작업 시 IDE 빨간 줄 + PR CI lint 단계에서 즉시 차단된다.
    // (2차 방어는 동료 M0 작업의 apps/mobile/metro.config.js resolveRequest throw — multi-session.md §1)
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@celebbase/service-core',
              message:
                'service-core는 Node.js 서버 전용입니다 (Fastify/pg/jose). React Native 번들에 포함하지 마세요.',
            },
            {
              name: '@celebbase/ui-kit',
              message:
                'ui-kit는 react-dom + CSS Modules 기반으로 RN 미호환입니다. apps/mobile/src/components 에 RN primitive로 새로 구현하세요.',
            },
          ],
          patterns: [
            {
              group: ['@celebbase/service-core/*', '@celebbase/ui-kit/*'],
              message:
                'service-core / ui-kit subpath import도 동일하게 금지됩니다.',
            },
          ],
        },
      ],
    },
  },
);
