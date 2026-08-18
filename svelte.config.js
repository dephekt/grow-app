// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    typescript: {
      // Kit generates the include from src/, test/, tests/ and vite.config only, which left the
      // Playwright specs and their fixtures out of `pnpm check` entirely. Widened here rather
      // than by writing `include` into tsconfig.json, because that key replaces the generated
      // one wholesale instead of adding to it.
      config: (config) => ({
        ...config,
        include: [
          ...config.include,
          '../playwright.config.ts',
          '../e2e/**/*.js',
          '../e2e/**/*.ts',
          '../e2e/**/*.svelte'
        ]
      })
    }
  },
  compilerOptions: {
    runes: true
  }
};

export default config;
