import globals from 'globals'
import js from '@eslint/js'

export default [
  { ignores: ['build', 'dist'] },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { numara: 'readonly', ...globals.browser, ...globals.node },
      sourceType: 'module'
    }
  },
  js.configs.recommended
]
