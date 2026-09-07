# Argus 1.0.1 — release notes

Paste as the GitHub Release body for tag `1.0.1`. The publish workflow appends the XCFramework
asset URL and its SHA-256 underneath, so leave room at the end.

---

Lifecycle fixes, a resizable waterfall, and the CI gate the Web UI never had.

## Install

```kotlin
dependencies {
    debugImplementation("com.lynxal.argus:argus-android:1.0.1")
}
```

Full integration guide in the [README](https://github.com/lynxal/KMM-Argus/blob/main/README.md).
Argus is **debug-only** — see §3 for why, and `verifyReleaseHasNoArgus` for the gate that
enforces it.

## What changed since 1.0.0

**One live Argus server per process.** Nothing tracked the running server, so `start()` twice
bound a second port — merely wasteful with `port = 0`, but with a pinned port the second call
reported `startupError`, which reads as a bug rather than "already running". A caller that
dropped its handle without stopping also left the server and its `SupervisorJob` running
unreachable. `start()` now returns the live handle, so a repeated start from app
re-initialisation is a no-op and a lost reference is recoverable. The new call's configuration
is ignored and says so in the log — a loud "config ignored" beats silently capturing into a
dead bus. A handle that *failed* to bind is replaced rather than reused, because handing it
back would strand Argus permanently.

**Callbacks arriving after `stop()` are ignored.** `ArgusHandle.stop()` documents that `url`
and `startupError` are `null` afterwards, and a late bind broke it: `onStarted()` is
non-suspending, so `scope.cancel()` could not preempt it, and `stop()` drains the engine
before it reaches the cancel. A bind landing in that window republished `url` on a stopped
handle — a debug UI would show a live link to a server being torn down. `onFailed` had the
same hole. Fixed on both platforms.

**The waterfall's list pane resizes.** It was a fixed 320 px, so long paths clipped with no way
to widen them. It now has a splitter that remembers its width across reloads, keyboard resize,
and a narrow mode that drops the engine chip and shrinks the redirect pill to its glyph rather
than letting a cell escape the row.

**Expanded JSON nodes stay open.** A new event arriving collapsed the whole response tree,
which made a live stream unusable for reading a body.

**The app shell holds to the window.** It used `min-height`, so a long JSON body stretched the
detail pane to several times the window height and scrolled the whole document — carrying the
top bar and filter bar off screen. The inner panes now scroll, which is what they were always
meant to do.

**`Verify (Web UI)` runs in CI.** The Web UI had no automated gate at all. Five headless
probes now drive the real built bundle in Chromium on every PR that touches `argus-webui/`.

### Fixes

- The 1.0.0 publish itself failed at `androidReleaseSourcesJar`: `withType<Jar>()` matched
  `bundling.Jar` while KGP's sources jars are the `jvm.tasks.Jar` supertype, so
  `generateBuildKonfig` was never wired to them.
- `npm ci` failed on macOS runners — the lockfile recorded 4 of rollup's 25 platform binaries.
  This also blocked 1.0.0's own publish job.

### Docs

- README §9.3 said every `Argus.start()` creates a fresh server with a fresh event bus. That
  stopped being true with the one-live-server change; the start-on-demand guide is rewritten
  around what actually happens.
- README §8's detail-tab lists and view shortcuts were stale — the tabs are
  `Headers · Request · Response · Timing · Related Logs · Raw` for HTTP, and `w` cycles the
  views (there is no `1`/`2`/`3`).
- `docs/ui/*.png` were exports of the design canvas and predated the splitter. They are now
  generated from the built Web UI by `scripts/probe-webui/docs-shots.js`.
- The release checklist in `AGENTS.md` now says out loud that a green publish workflow leaves
  the deployment awaiting a manual **Publish** in the Central Portal.

## Modules

| Module | Coordinates |
|---|---|
| `argus-core` | `com.lynxal.argus:argus-core:1.0.1` |
| `argus-server-core` | `com.lynxal.argus:argus-server-core:1.0.1` |
| `argus-webui-bundle` | `com.lynxal.argus:argus-webui-bundle:1.0.1` |
| `argus-android` | `com.lynxal.argus:argus-android:1.0.1` |
| `argus-ios` | `com.lynxal.argus:argus-ios:1.0.1` |
| `argus-okhttp` | `com.lynxal.argus:argus-okhttp:1.0.1` |
| `argus-urlconnection` | `com.lynxal.argus:argus-urlconnection:1.0.1` |
