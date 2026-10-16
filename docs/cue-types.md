# Cue types and type options

## Built-in cue types

- **SFX**: point cue with a horizontal cue line, vertical cue point, and margin-aligned text.
- **Scene**: point cue with the same layout controls as SFX.
- **DCA**: margin-aligned text cue.
- **Note**: free-position text cue.
- **Fade**: two-point line with an optional label.
- **Block**: rectangular area with optional line, fill, opacity, and label.

Warn and Mark are no longer built-in. When an older project contains them, they are migrated to custom Note types.

## Options

Open **Options**, search if necessary, then expand a cue type. Depending on the type, settings include:

- Colour and text size
- Line width
- Margin position
- Prefix and suffix
- Text position relative to the cue line
- Cue-line position relative to the vertical marker
- Placement before or after the alignment guide
- Vertical marker height
- Cue-line and cue-point visibility
- Block line, fill, fill colour, and opacity

Built-in settings have reset buttons that restore application defaults. Resetting a cue type does not overwrite per-cue custom properties.

## Visibility and locking

General Options contains a toggle for every cue type. A hidden type is removed from the toolbar, Options list, canvas, and export but remains in the project.

**Lock all cues of this type** prevents cues of that type from being moved, resized, edited, deleted, or changed through the Inspector. Locking is saved in the project.

## Prefixes and suffixes

SFX, Scene, DCA, and custom types can prepend or append exact text to every cue of that type. The underlying cue name remains unchanged. Affixes appear on the canvas, in the cue list and search, and in PDF exports.

[Documentation index](README.md)
