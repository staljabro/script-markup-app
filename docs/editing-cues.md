# Creating, selecting, and editing cues

## Create cues

Select a tool and click the page. SFX, Scene, DCA, Note, and custom cue types request text immediately. Fade and Block use two clicks to define their geometry; their label can be added later.

**Text box** also uses two clicks to define opposite corners. Its Inspector opens automatically and the tool returns to Pointer. Enter text in **Text box content**, using Enter for new lines. Select part of the text to apply bold, italic, underline, or strikethrough. A formatted preview appears below the editor. See [Text box Inspector controls](cue-inspector.md#text-boxes).

## Select cues

- Click a cue to select it.
- Ctrl/Cmd-click toggles individual cues.
- With Pointer active, drag across empty page space to select every visible cue intersecting the marquee.
- Hold Ctrl/Cmd or Shift while marquee-selecting to preserve the existing selection.
- In the cue list, Shift-click selects the visible range from the selection anchor.
- Ctrl/Cmd + Shift-click adds that range to the selection.

Filters affect which cues participate in cue-list range selection. Hidden cue types are not selected by a canvas marquee.

## Move and reshape

Drag cues to move them. Fade endpoints and Block or Text box corners have dedicated handles. Cues can be dragged from one page to another. Arrow keys nudge selected cues by 1 unit; Shift uses 10 units and Alt/Option uses 0.25 units.

## Multiple-selection actions

The cue-list selection panel provides:

- Duplicate
- Copy and paste properties
- Reset custom properties
- Align X or Y
- Distribute vertically
- Move to another page

Ctrl/Cmd + D duplicates selected unlocked cues while preserving their relative positions.

## Rename and delete

Click a cue name in the cue list to rename it. Modifier-click selects instead. Double-click a cue on the canvas to edit its label. Delete or Backspace removes selected unlocked cues.

For Text boxes, clicking the cue name or double-clicking the box opens the Inspector content editor instead of a single-line rename field.

[Documentation index](README.md)
