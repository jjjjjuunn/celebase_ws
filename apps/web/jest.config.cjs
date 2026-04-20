/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: [],
  moduleNameMapper: {
    '^server-only$': '<rootDir>/src/__mocks__/server-only.ts',
    '^@celebbase/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
    '^(\\.\\.?/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
        useESM: false,
      },
    ],
  },
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/app/api/_lib/**/*.ts', '!src/app/api/_lib/__tests__/**'],
};

module.exports = config;
