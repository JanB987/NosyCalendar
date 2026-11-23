import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import json from '@eslint/json';

// Target the reported scanner rules across every production source file, using actual TS types.
export default [
  { ignores: ['node_modules/**', 'dist/**', '.test-build/**', 'tests/**'] },
  {
    files: ['src/**/*.ts'],
    plugins: { '@typescript-eslint': tseslint.plugin, obsidianmd },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname }
    },
    rules: {
      'obsidianmd/prefer-create-el': 'error',
      'obsidianmd/no-global-this': 'error',
      'obsidianmd/prefer-active-doc': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error'
    }
  },
  {
    files: ['manifest.json'],
    plugins: { json, obsidianmd },
    language: 'json/json',
    rules: { 'obsidianmd/validate-manifest': 'error' }
  }
];
