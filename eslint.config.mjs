import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import importX from 'eslint-plugin-import-x';
import globals from 'globals';

const typeScriptFiles = ['**/*.{ts,mts}'];
const forTypeScript = (config) => ({ ...config, files: typeScriptFiles });

export default [
  { ignores: ['.vite/**', 'node_modules/**', 'out/**'] },
  { ...eslint.configs.recommended, files: typeScriptFiles },
  ...tseslint.configs['flat/recommended'].map(forTypeScript),
  { ...importX.flatConfigs.recommended, files: typeScriptFiles },
  { ...importX.flatConfigs.electron, files: typeScriptFiles },
  { ...importX.flatConfigs.typescript, files: typeScriptFiles },
  {
    files: typeScriptFiles,
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
