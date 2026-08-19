import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Allow intentionally unused params/vars when prefixed with "_"
      // (uniform permission-check signatures, ignored tuple slots…).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Modules that intentionally mix component and non-component exports
    // (shadcn variants, context + hook pairs, widget/helper collections).
    // The rule only affects HMR granularity: editing these files triggers
    // a full reload instead of a fast refresh, which is acceptable here.
    files: [
      'src/components/ui/**',
      'src/features/shared/widgets.tsx',
      'src/features/shared/DocPreview.tsx',
      'src/features/shared/SessionContext.tsx',
      'src/features/jury/gradingWidgets.tsx',
      'src/layout/BackgroundFX.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
