# Custom Modifier Patterns

## Implementation Style

Prefer `DrawModifierNode` + `ModifierNodeElement` for new modifiers. Simple extension functions
(v1 style) are acceptable in `ui_components` but not for new code in `ui_components_v2`.

```kotlin
// Preferred: Node-based modifier
private class ShadowNode(...) : DrawModifierNode, Modifier.Node() {
    override fun ContentDrawScope.draw() { /* ... */ }
}

private data class ShadowElement(...) : ModifierNodeElement<ShadowNode>() {
    override fun create() = ShadowNode(...)
    override fun update(node: ShadowNode) { /* ... */ }
}

fun Modifier.dropShadow(...): Modifier = this then ShadowElement(...)
```

## @Composable vs Pure Modifiers

Use `@Composable` modifier when accessing theme tokens (colors, typography, shapes).
Use pure modifiers when all values are passed as parameters.

```kotlin
// @Composable — reads from theme
@Stable
@Composable
fun Modifier.combinedShadow(shape: Shape, isUnreachable: Boolean = false): Modifier =
    this.innerShadow(color = LocalColors.current.spotlight, ...)
        .dropShadow(color = LocalColors.current.shadow, ...)

// Pure — all values passed in
fun Modifier.dropShadow(shape: Shape, color: Color, offsetX: Dp, ...): Modifier
```

Mark `@Composable` modifiers with `@Stable` annotation.

## Shadow System

Two base primitives, two convenience composables:

| Modifier | Type | Purpose |
|----------|------|---------|
| `dropShadow()` | Pure | External shadow with blur/spread |
| `innerShadow()` | Pure | Internal shadow using BlendMode.DstOut |
| `combinedShadow()` | @Composable | Inner + drop shadow, theme-aware |
| `canvasCardShadows()` | @Composable | Standard card shadow preset |

## Nested Scroll Consumption

Prevent parent scroll interference in nested scrollable layouts:

```kotlin
fun Modifier.disableParentNestedVerticalScroll(disabled: Boolean = true) =
    if (disabled) this.nestedScroll(VerticalParentScrollConsumer) else this
```

The `VerticalParentScrollConsumer` consumes all available post-scroll and post-fling velocity,
preventing parent containers from intercepting child scroll events.
