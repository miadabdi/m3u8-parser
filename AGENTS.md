# AGENTS.md

Guidance for AI coding agents (and humans) working in this repo.

## What this repo is

A fork of [videojs/m3u8-parser](https://github.com/videojs/m3u8-parser), published as
`@miadabdi/m3u8-parser`. The fork's **only intentional addition is the writer** — the
ability to stringify a parsed manifest back to m3u8 text:

- `src/writer.js` — the whole writer (fork-only file)
- `import Writer from './writer'` + the `stringify()` method in `src/parser.js` — the only two fork touches to upstream files
- `test/writer.test.js` — round-trip tests

Everything else must stay upstream-verbatim.

## The fork contract (most important rule)

**If fork code and upstream code behave identically, keep upstream's and delete the
fork's copy.** Carrying fork-side reformats, dead code, or duplicate handlers makes
every future upstream merge conflict-prone.

After any upstream merge, verify:

```sh
git diff upstream/main -- src/
# must show ONLY: src/writer.js (new file), the Writer import, the stringify() method
```

Anything else fork-side with identical behavior gets reset:

```sh
git checkout upstream/main -- src/parser.js src/parse-stream.js src/line-stream.js src/index.js
# then re-apply the Writer import + stringify() method in parser.js
```

History lesson: a 2024 upstream merge left ~70 lines of commented-out dead code, a
stale TODO, a duplicated `independent-segments` handler, and a prettier re-indent of
the whole tag switch in parser.js. The 2026-09 cleanup removed all of it.

## Upstream sync

```sh
git remote add upstream https://github.com/videojs/m3u8-parser  # once
git fetch upstream
git merge upstream/main --no-edit
```

Conflict resolution pattern (from the 7.2.0 merge):

- `package.json` — keep `name: @miadabdi/m3u8-parser` and the `lodash` dependency
  (the writer uses `lodash/isEqual`); take upstream's dependency bumps
- `package-lock.json` — never hand-merge: `git checkout --theirs package-lock.json`
  then `npm install` to regenerate
- `README.md` — the TOC is doctoc-generated; merge to match the body headings
- `src/parser.js` — keep upstream's handlers verbatim (single-quote style), port only
  genuinely new ones; the lint's `no-dupe-keys` catches duplicated handlers

**Versioning:** track upstream minor + a patch offset for merge fixes
(upstream 7.2.0 → fork 7.2.1); fork-only features bump the minor (7.3.0, 7.4.0).

## Lint and formatting

`vjsstandard` — **single quotes, no trailing commas, no prettier/double-quote style.**
The pre-commit hook (husky + lint-staged) runs `vjsstandard --fix` on staged `.js`
and `doctoc --notitle` on README. Commits failing lint are usually fixed by the hook
itself; fix remaining errors by hand. The ~29 warnings (missing JSDoc, TODO/FIXME
comments) are pre-existing in writer.js and upstream's own files — do not chase them.

## Tests

```sh
npm test            # lint + build-test + karma (Chrome headless + Firefox) + node
npm run test:node   # qunit on test/dist/bundle.js (after npm run build-test)
```

- Fixtures: `test/fixtures/integration/*.m3u8` + expected output `*.js`, loaded via
  the rollup data-files plugin (`import testDataManifests from 'data-files!manifests'`)
- Writer tests use the round-trip pattern: parse → `stringify()` → re-parse →
  `assert.deepEqual(lane(reparsed), lane(directParse))`. Helpers `parse()` and
  `roundTrip()` live in `test/writer.test.js`. Reuse them; prefer existing fixtures
  over new inline manifests when one covers the path.
- **Casing gotcha:** stream-inf and i-frame-stream-inf attributes keep UPPERCASE keys
  (`manifest.playlists[0].attributes.BANDWIDTH`); mediaGroups use camelCase
  (`.uri`, `.instreamId`). The expected fixtures are the source of truth.
- `npm run build-test` **wipes `./dist`** (clean step) — run `npm run build-prod`
  separately if you need the cjs bundle for smoke tests.
- Writer coverage should stay ~96% lines / 93% branches; the only uncovered lines
  should be defensive `return ''` fallbacks.

## Writer internals (how to extend)

- `tagsInOrder` in writer.js controls which manifest keys are emitted and in what
  order; `stringifyTag` dispatches per key; `handle*` helpers per tag family. Add a
  tag = add a key to `tagsInOrder` + a branch (or handler) — a branch without the
  `tagsInOrder` entry is dead code (that's how ALLOW-CACHE went unemitted for years).
- Attribute emission has **no global text passes**: booleans are formatted at each
  value site with `formatValue()` (true→YES / false→NO) and attribute lists are
  built with `join(',')`. Never reintroduce a whole-output `string.replace()` —
  it mangles values that legitimately contain `true`/`false`/:,`.
- Manifest keys are camelCased by the parser (`startDate`, `serverUri`); emit with
  `toAttributeName(key)` to invert (`START-DATE`, `SERVER-URI`).
- `EXT-X-DATERANGE` values: `startDate`/`endDate` are **Date objects** in the
  manifest — emit `toISOString()`; durations are numbers; `endOnNext` is boolean.
- `EXT-X-I-FRAME-STREAM-INF` carries its URI as an attribute (no uri line), unlike
  `EXT-X-STREAM-INF` which puts the uri on the next line.
- Emission order assumptions live in `tagsInOrder`: DEFINE before segments
  (substitution), i-frame playlists and content steering with the master-playlist
  tags, dateRanges just before segments.

## Known limitations (deliberate, documented in README)

- Widevine key stringifying is not supported; `METHOD=NONE` transitions are.
- Low-latency tags ARE stringified (since 7.5.0): `SERVER-CONTROL`, `PART-INF`,
  `PART`, `PRELOAD-HINT`, `SKIP`, `RENDITION-REPORT`, and trailing
  `preloadSegment` parts/hints. `SERVER-CONTROL` output includes parser-computed
  `holdBack`/`partHoldBack` defaults — emission order (serverControl/partInf before
  targetDuration, in `tagsInOrder`) keeps the re-parse recomputation identical.

## Publishing

The npm account enforces 2FA — classic tokens get `403`. Publishing needs a granular
access token with 2FA-bypass (read+write on `@miadabdi/m3u8-parser`):

```sh
printf '//registry.npmjs.org/:_authToken=%s\n' "$TOKEN" > .npmrc
npm publish --access public
rm -f .npmrc   # immediately — never commit the token
npm view @miadabdi/m3u8-parser version   # verify (registry lags a few seconds)
```

`prepublishOnly` runs `build-prod` + `vjsverify`; tests are not part of publish —
run `npm test` first. Commit style: conventional commits (`feat(writer): …`,
`fix(parser): …`).
