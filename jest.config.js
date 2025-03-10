module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        useESM: true,
        isolatedModules: true,
        allowJs: true,
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(matrix-js-sdk)/)'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: './coverage',
  setupFiles: ['dotenv/config'],
  setupFilesAfterEnv: ['<rootDir>/test/jest-setup.ts'],
};
