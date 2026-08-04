import eslint from '@eslint/js';
import nxPlugin from '@nx/eslint-plugin';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

const moduleBoundaryRule = [
  'error',
  {
    enforceBuildableLibDependency: true,
    allow: [],
    depConstraints: [
      {
        sourceTag: 'type:app',
        onlyDependOnLibsWithTags: ['type:util', 'type:contracts', 'type:ui', 'scope:shared'],
      },
      {
        sourceTag: 'type:service',
        onlyDependOnLibsWithTags: ['type:util', 'type:contracts', 'scope:shared'],
      },
      {
        sourceTag: 'type:contracts',
        onlyDependOnLibsWithTags: ['type:contracts', 'scope:shared'],
      },
      {
        sourceTag: 'scope:identity',
        notDependOnLibsWithTags: ['scope:authorization'],
      },
      {
        sourceTag: 'scope:authorization',
        notDependOnLibsWithTags: ['scope:identity'],
      },
      {
        sourceTag: '*',
        onlyDependOnLibsWithTags: ['*'],
      },
    ],
  },
];

export function createV2Config() {
  return tseslint.config(
    eslint.configs.recommended,
    {
      files: ['**/*.{js,mjs,cjs}'],
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        globals: {
          process: 'readonly',
          console: 'readonly',
          module: 'readonly',
          require: 'readonly',
          __dirname: 'readonly',
          __filename: 'readonly',
          Buffer: 'readonly',
          URL: 'readonly',
        },
      },
    },
    {
      files: ['**/*.{ts,tsx}'],
      extends: [...tseslint.configs.recommendedTypeChecked],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: process.cwd(),
        },
      },
      plugins: {
        import: importPlugin,
        '@nx': nxPlugin,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unsafe-assignment': 'error',
        '@typescript-eslint/no-unsafe-argument': 'error',
        '@typescript-eslint/no-unsafe-member-access': 'error',
        '@typescript-eslint/no-unsafe-call': 'error',
        '@typescript-eslint/no-unsafe-return': 'error',
        'import/no-cycle': 'error',
        'import/no-duplicates': 'error',
        '@nx/enforce-module-boundaries': moduleBoundaryRule,
      },
    },
    prettier,
  );
}
