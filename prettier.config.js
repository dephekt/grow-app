// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** @type {import('prettier').Config} */
export default {
  plugins: ['prettier-plugin-svelte'],

  // Every import in the tree is already single-quoted.
  singleQuote: true,

  // The tree has none, and Prettier's "all" default would add them to 48 more files.
  trailingComma: 'none',

  // Comments were written to a 100 budget and Prettier cannot rewrap them.
  printWidth: 100,

  // Pinned: a future flip to "collapse" would silently un-expand every expanded object literal.
  objectWrap: 'preserve',

  // Pinned: "ignore" would let Prettier add or remove a rendered space in inline elements.
  htmlWhitespaceSensitivity: 'css',

  // Pinned: a no-op on this tree today, and it keeps the plugin from ever reordering top-level blocks.
  svelteSortOrder: 'none'
};
