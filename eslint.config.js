import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended,
  { ignores: ['dist', 'v1', 'node_modules', 'test-results', 'playwright-report'] });
