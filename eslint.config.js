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
      'no-shadow': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'smart'],
      curly: ['error', 'multi-line'],
      complexity: ['error', 12],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['tests/**/*.js'],
    rules: { 'max-lines-per-function': 'off' },
  },
];
