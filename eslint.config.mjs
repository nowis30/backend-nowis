import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },
    plugins: {
      import: importPlugin
    },
    rules: {
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always'
        }
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none'
        }
      ],
      '@typescript-eslint/no-empty-object-type': 'off'
    }
  },
  {
    files: ['src/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.jest
      }
    }
  }
);
