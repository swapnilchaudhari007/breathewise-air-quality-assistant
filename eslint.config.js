export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', fetch: 'readonly',
        AbortController: 'readonly', URLSearchParams: 'readonly', FormData: 'readonly',
        matchMedia: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'error',
      'no-undef': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
    },
  },
];
