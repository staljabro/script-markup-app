# Troubleshooting

## I cannot move or edit a cue

Open that cue type in Options and check **Lock all cues of this type**. Locked cues can be selected but not changed. Also confirm that dividers and headers are not being mistaken for cues.

## A cue or cue type is missing

Check General cue-type visibility, the cue-list type filters, the search field, and the “Custom cues only” filter. Hidden cue types are also excluded from export.

## Prompt/Showcall pages cannot be disabled

Move or remove cues and dividers that occupy the calling surface first.

## Find & Replace reports zero cues

Matching is case-sensitive and literal. Confirm the selected cue type and include spaces or punctuation exactly. Prefixes and suffixes are not part of stored cue names.

## The exported PDF differs from the editor

Dashed 50%-opacity cue handles are intentionally UI-only. Hidden types are excluded. Confirm that the source and calling-page layout is correct before export.

## Work disappeared after opening another PDF

Opening a PDF starts a new project. Try **Recover Autosave** if the browser copy has not been replaced, otherwise open the latest downloaded `.cueproj`.

## Performance becomes slow

Close unused overlays, reduce zoom, narrow cue-list filters, and save/reload very large projects periodically. The cue-list search is deferred to keep typing responsive.

## Build problems

Run `npm install`, then `npm run lint` and `npm run build`. Vite may report an informational large-chunk advisory because PDF rendering libraries are bundled with the application.

[Documentation index](README.md)
