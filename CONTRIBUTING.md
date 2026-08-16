# Contributing

Issues and pull requests are welcome.

## Licensing of contributions

grow-app is licensed under the **GNU Affero General Public License, version 3
or later** (see [LICENSE](LICENSE)).

The project is maintained under single-copyright ownership so that alternative
licensing terms remain available to the copyright holder. To keep that
possible, contributions require an explicit grant beyond the AGPL — a
sign-off alone is not sufficient, because code received under the AGPL cannot
later be offered to anyone under different terms.

**By submitting a pull request, patch, or any other contribution to this
repository, you agree to the following:**

1. You are the author of the contribution, or you have the right to submit it
   under these terms.
2. You grant Daniel Snider a perpetual, worldwide, non-exclusive, royalty-free,
   irrevocable license to reproduce, modify, distribute, sublicense, and
   otherwise exploit your contribution, **under the AGPL-3.0-or-later and under
   any other license terms**, including proprietary terms.
3. You retain copyright in your contribution. This is a license grant, not an
   assignment — you may continue to use your own work however you like.
4. Your contribution is provided as-is, without warranty of any kind.

Please add a `Signed-off-by:` line to your commits (`git commit -s`) to record
your agreement, per the
[Developer Certificate of Origin](https://developercertificate.org/).

If you would rather not grant those terms, open an issue describing the change
instead of a pull request — a described bug or design problem is genuinely
useful and carries no licensing question.

## Third-party code

Do not paste code from Stack Overflow, other repositories, or AI tools trained
to reproduce specific sources into this repository without checking its origin.
Stack Overflow answers are CC BY-SA, which is not compatible with this project's
licensing model, and vendored GPL code from elsewhere would permanently remove
the ability to offer alternative terms.

If a change genuinely needs third-party code, keep it in its own directory with
the upstream license file intact and note it in the README's third-party
section, rather than inlining it.

## New files

Every source file carries a two-line SPDX header:

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider
```

Svelte components use the HTML comment form:

```svelte
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Daniel Snider -->
```

Use your own name in the copyright line for files you author outright.

## Code conventions

See [AGENTS.md](AGENTS.md). Most importantly: this app is Svelte 5 runes mode
only — no `export let`, `$:`, `on:click`, or `<slot />`.

Formatting is Prettier's job. There are no git hooks — CI is where an
unformatted tree is caught, and that costs a full round trip. Run these before
opening a pull request:

```sh
pnpm format       # rewrites; CI runs pnpm format:check
pnpm check
pnpm test
```

A one-time Prettier reformat touched most of the tree, so `git blame` on an
untouched line would otherwise point at it rather than at the author.
`.git-blame-ignore-revs` lists it. GitHub's web blame honours that file with no
setup at all; to get the same locally, once per clone:

```sh
git config extensions.worktreeConfig true
git config --worktree blame.ignoreRevsFile .git-blame-ignore-revs
```

The `--worktree` form matters if you use `git worktree`: the checkouts share one
config, and a plain `blame.ignoreRevsFile` makes `git blame` fail outright in
every worktree whose checked-out commit predates the file.
