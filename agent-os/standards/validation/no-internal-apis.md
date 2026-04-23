# No Internal API Usage

Never use annotations, classes, or functions from `kotlin.internal.*` or any other internal/unstable API packages. These are implementation details of the Kotlin compiler and standard library — they are not part of the public API, may change or disappear without notice across Kotlin versions, and can cause build failures or runtime errors after upgrades.

## Prohibited Packages

- `kotlin.internal.*` (e.g., `@HidesMembers`, `@LowPriorityInOverloadResolution`, `@OnlyInputTypes`)
- `kotlin.jvm.internal.*`
- `kotlinx.coroutines.internal.*`
- `androidx.compose.runtime.internal.*`
- Any package containing `.internal.` in its path that is not explicitly documented as public API

## Rules

- Do not import from internal packages, even if the IDE autocompletes them
- Do not suppress warnings to allow internal API access (`@Suppress("INVISIBLE_MEMBER", "INVISIBLE_REFERENCE")`)
- If a public API does not exist for the desired behavior, implement it manually or find a supported library alternative
- Treat compiler warnings about internal API usage as errors — fix them immediately

## Common Pitfalls

| Internal API | Use Instead |
|---|---|
| `kotlin.internal.LowPriorityInOverloadResolution` | Rename overloads or use different parameter types |
| `kotlin.internal.HidesMembers` | Use explicit extension function scoping |
| `kotlin.internal.OnlyInputTypes` | Add explicit type checks at call site |
| `kotlin.jvm.internal.Ref` | Use wrapper data classes or `Array(1)` |
| `kotlinx.coroutines.internal.MainDispatcherLoader` | Use `Dispatchers.Main` through public API |

## Why

Internal APIs bypass the Kotlin binary compatibility guarantees. Code that depends on them may:
- Fail to compile after a Kotlin version bump
- Produce incorrect bytecode silently
- Break on specific platforms (especially Kotlin/Native and Kotlin/JS where internals differ)
