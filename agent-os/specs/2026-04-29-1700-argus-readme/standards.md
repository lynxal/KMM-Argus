# Standards for argus-readme

No engineering standards from `agent-os/standards/index.yml` apply to this
work. The change is documentation-only — a `README.md` rewrite plus
captured PNG assets and a one-shot Playwright capture script.

The `agent-os/standards/` directory covers analytics, architecture,
bluetooth-mesh, cloud, coroutines, domain-modeling, kmp, naming,
persistence, platform, provisioning, security, testing, ui-navigation,
validation, and workflow. None govern README structure or developer-facing
documentation.

The implicit "standard" the README must uphold is the project's own
debug-only distribution invariant, which is enforced by
`:sample-android:verifyReleaseHasNoArgus` in CI rather than by a written
standard. The README documents that invariant in §3.
