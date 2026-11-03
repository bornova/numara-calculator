import globals from 'globals'
import js from '@eslint/js'

export default [
  // Ignore build and dist directories
  { ignores: ['build', 'dist'] },
  // Use recommended ESLint configurations
  js.configs.recommended,
  {
    languageOptions: {
      // Use the latest ECMAScript version
      ecmaVersion: 'latest',
      // Define global variables
      globals: { numara: 'readonly', ...globals.browser, ...globals.node },
      // Set the source type to module
      sourceType: 'module'
    }
  },
  {
    files: ['src/electron/**/*.cjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs'
    }
  },
  {
    files: ['src/sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker }
    }
  },
  {
    files: ['src/js/calc/calc.worker.js'],
    languageOptions: {
      globals: { ...globals.worker }
    }
  }
]
