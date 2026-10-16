# Tools

Open **Tools** from the main toolbar. Every tool resets its form when opened to prevent stale cue-type selections.

## Convert Cue Types

Choose a source and destination type. The preview lists affected cues before conversion. Conversion changes every cue of the source type, normalises its geometry for the destination type, and clears incompatible per-cue overrides.

Use **Download backup first** when working on an important project. Confirming the operation adds it to Undo history.

## Find & Replace

Choose one cue type, enter exact Find text, and optionally enter replacement text.

- Matching is literal and case-sensitive.
- Spaces and punctuation are significant.
- Every matching occurrence inside an affected cue is replaced.
- An empty replacement removes the matched text.
- The button and preview report how many cues will change.

Type-level prefixes and suffixes are not searched or modified because they are not part of the stored cue name.

## Manage Cue Types

Create, rename, reorder, assign icons to, or remove custom cue types. See [Custom cue types](custom-cue-types.md).

## Safety

Bulk tools show an application confirmation above the Tools window. The safest workflow is to download a project backup, review the preview, then apply the operation.

[Documentation index](README.md)
