# References for argus-webui CI + self-hosted runners

## Similar implementations

### The only in-org precedent for `[self-hosted, android-build]`

- **Location:** `lynxal/canvas_control_mobile` — `.github/workflows/publishDev.yml`,
  `nightlyDev.yml`, `publishProd.yml`, `publishStage.yml`
- **Relevance:** the sole example of a Gradle/KMP/Android build on this runner label. It is what the
  `verify.yml` migration would have copied — the migration was declined (see the API notes at the
  bottom), so this is kept as the reference for whoever revisits it.
- **Key patterns it establishes:**
  - `actions/setup-java@v4` (zulu 17) still needed on self-hosted — the runner has no JDK on PATH;
    the tool cache handles it (`_work/_tool/Java_Zulu_jdk/17.0.20-8/x64` appears in its logs).
  - **`android-actions/setup-android@v3` is required.** This is the step `ubuntu-latest` makes
    unnecessary. Argus builds `:sample:assembleDebug`, so a move without it would fail.
  - `runs-on: [self-hosted,android-build]` — a bare two-element label list, no `linux`/`x64`
    qualifiers, matching how the runner is registered.
- **What NOT to borrow — the comments are stale.** Four of its workflows carry variants of *"The
  self-hosted runner has no git on PATH, so actions/checkout downloads a source tarball (no .git, no
  history)"*, and both `nightlyDev.yml` and `publishDev.yml` build whole `actions/github-script`
  blocks around that claim (reading the `last-dist-dev` tag through the refs API instead of `git`).
  Its 2026-08-20 run log (`32341234076`) shows `/usr/bin/git checkout --detach`,
  `git clean -ffdx`, `git fetch --depth=1` — an ordinary git checkout. Argus needs no such
  workaround. Second-order consequence worth keeping: because `git clean -ffdx` runs between jobs,
  the persistent workspace cannot hand a build stale `build/intermediates`.

### The other self-hosted migration in the org

- **Location:** `lynxal/canvas_hub_core_application` —
  `operational_memory/specs/2026-07-16-rpi-self-hosted-runner/spec.md`, plus `dev-ci.yml` /
  `prod-ci.yml`
- **Relevance:** the shape of a runner-migration spec, and the reminder that runner
  provisioning/registration/labeling is explicitly out of scope for the repo making the switch.
- **Key patterns:** a migration spec is a `runs-on` diff plus the steps that become unnecessary
  (there, `docker/setup-qemu-action`, because the Pi is natively arm64). Here the inverse — a step
  becomes *necessary* (`setup-android`).
- **Not applicable:** `[self-hosted, rpi, ARM64]` is a Raspberry Pi. Wrong architecture and wrong
  class of machine for a Gradle/Android build. Same for `canvas_firmware`'s
  `[self-hosted, linux, x64, firmware-build]`.

### The probes themselves

- **Location:** `scripts/probe-webui/` — `fake-device.js`, `follow-tail-probe.js`,
  `related-logs-probe.js`, `version-probe.js`, `README.md`
- **Relevance:** this is the thing being wired up, not a pattern being copied. All three probes
  already had the properties CI needs and none had to change.
- **Key properties that made Tier 2 cheap:**
  - `fake-device.js` serves the built `dist/` **same-origin** with `/api/info`, `/api/events` and
    `WS /ws` on an **ephemeral** loopback port (observed `127.0.0.1:58900`). Ephemeral means no
    fixed-port collision on a runner shared with other repos; same-origin means `app.ts` resolves
    the device to that server, so the real `mountApp` and the real `websocketSource` are under test
    with no test seam in shipped code.
  - `follow-tail-probe.js` and `related-logs-probe.js` already screenshot to `last-failure.png` and
    dump browser console on failure — which is what the `upload-artifact` step exists to collect.
    `version-probe.js` did **not**, and was given the same treatment as part of this work: its usual
    failure is a bare `waitForFunction` timeout, which says nothing about what the page rendered.
    `scripts/probe-webui/last-failure.png` is already gitignored (root `.gitignore:22`).
  - Assertions read the DOM structurally (`[data-detail-tabs]`, `[data-related-logs]`) rather than
    by Tailwind class, so a restyle cannot turn a real failure into a silent pass.
- **The recorded reason two probes stay out:** the README's *"there is no consumer app in CI to host
  the server"*. `ui-probe.js` and `ws-probe.js` need a real argus server on `:8787`. That note was
  kept, not deleted — it is the standing record for #17 Tier 3.

### The existing Argus workflows

- **Location:** `.github/workflows/verify.yml`, `verifyIos.yml`, `publishToMavenCentral.yml`
- **Relevance:** the house style `verify-webui.yml` matches.
- **Key patterns:** a comment above `on:` explaining why the triggers are shaped that way (
  `verify.yml` records that a `push: [main]` trigger used to double every PR); `permissions:
  contents: read`; an explicit `timeout-minutes`; actions pinned to a major tag.
- **Deliberately untouched:** all three. `verifyIos.yml` and `publishToMavenCentral.yml` need Xcode
  (`iosSimulatorArm64Test`, `:argus-ios:assembleArgus-iosReleaseXCFramework`,
  `swift package compute-checksum`) and there is no Apple self-hosted runner. `verify.yml` was
  reverted to `ubuntu-latest` once the runner turned out not to serve public repos.

## The bug found while shaping

- **Location:** `argus-webui/tailwind.config.ts:2`, `argus-webui/package.json` (`lint`, `tokens`,
  `build`), `argus-webui/.gitignore:7`
- **Relevance:** `lint` was `tsx scripts/lint-tokens.ts && tsc --noEmit`, but `tailwind.config.ts`
  imports `./src/design/tokens.json`, which `npm run tokens` generates and `.gitignore` excludes.
  On a clean checkout: `error TS2307: Cannot find module './src/design/tokens.json'`.
- **The fix reuses the existing pattern rather than adding one:** `build` was already
  `npm run tokens && tsc --noEmit && vite build`. `lint` now leads with the same `npm run tokens`.

## API notes for anyone re-checking the runner situation

The org runners API (`GET /orgs/lynxal/actions/runners`) needs `admin:org`, which a normal token does
not carry — it returns 403. What *is* readable without it:

- `GET /repos/lynxal/{repo}/actions/runners` → `total_count: 0` for `canvas_control_mobile`,
  `canvas_hub_core_application`, `canvas_firmware` and `KMM-Argus`. No repo-level runners anywhere,
  so every self-hosted runner in use is org-level.
- `GET /repos/{repo}/actions/runs/{id}/jobs` → per-job `runner_name`, `runner_group_name`,
  `runner_id`, `runner_group_id`, `labels`. This is how `Aveli-Gazan-Android` / runner `217` / group
  `default` (id `1`) was identified. On a job that never got dispatched these come back empty with
  `runner_id=0` and `steps=0`, which is the signature of "no accessible runner matched the labels" —
  distinct from a job that started and failed.
- `GET /repos/{repo}/actions/runs/{id}/logs` → the runner's absolute paths
  (`/home/github-runner/actions-runner-android/_work/...`), which is what established the box is
  Linux and running as a dedicated `github-runner` user. **404 while a run is queued** — there are no
  logs before dispatch, so a queued job offers nothing to read.
- `GET /repos/{repo}` → `visibility`. This is the field that actually explained the failure:
  `KMM-Argus` is `public` while every repo successfully using the runner is `private`, and runner
  groups do not allow public repositories by default.
- `GET /repos/{repo}/actions/permissions` → rules out a repo-level Actions restriction
  (`{"enabled":true,"allowed_actions":"all"}`).
- **403 without `admin:org`:** `/orgs/{org}/actions/runners`, `/orgs/{org}/actions/runners/{id}`,
  `/orgs/{org}/actions/runner-groups`, `/orgs/{org}/actions/runner-groups/{id}/repositories`. A
  `read:org` token is not enough. `gh auth refresh -h github.com -s admin:org` is the way in, for
  someone who is an org admin.
