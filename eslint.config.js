import globals from 'globals'
import js from '@eslint/js'

export default [
  // Ignore build, dist, and generated wiki directories
  { ignores: ['build', 'dist', 'wiki'] },
  // Use recommended ESLint configurations
  js.configs.recommended,
  {
    languageOptions: {
      // Use the latest ECMAScript version
      ecmaVersion: 'latest',
      // Set the source type to module
      sourceType: 'module'
    }
  },
  {
    files: ['src/js/**/*.js'],
    ignores: ['src/js/calc/calc.worker.js'],
    languageOptions: {
      globals: { numara: 'readonly', ...globals.browser }
    }
  },
  {
    files: ['src/js/calc/calc.worker.js'],
    languageOptions: {
      globals: { ...globals.worker }
    }
  },
  {
    files: ['src/sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker }
    }
  },
  {
    files: ['src/electron/**/*.js', 'build.js', 'eslint.config.js', 'src/misc/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: ['tests/e2e-runner.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },
  {
    files: ['src/electron/**/*.cjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs'
    }
  }
]
