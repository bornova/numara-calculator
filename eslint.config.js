import globals from 'globals'
import js from '@eslint/js'

export default [
  // Ignore build and dist directories
  { ignores: ['build', 'dist'] },
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
  // Use recommended ESLint configurations
  js.configs.recommended
]
