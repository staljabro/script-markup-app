# Cue Inspector and custom properties

Open **Inspector** after selecting one or more cues.

## One selected cue

The Inspector shows the cue name and every property supported by its cue type. Editing a value creates a per-cue override automatically. Only values different from the cue type are stored.

Each overridden property has a reset button. When the final override is reset, **Custom cue properties** turns off automatically. Turning custom properties off retains saved override values so they can be enabled again later.

The cue list marks overridden cues with “Custom cue properties”. Its filter can show only these cues.

## Text boxes

Select **Text box** from the toolbar and click two opposite corners on the page. The Inspector opens automatically. Double-click an existing box or click its name in the cue list to reopen its editor.

Each text box has its own **Text box content** section, styled consistently with the other cue Inspector controls. Enter multiple lines in the text area; the preview below shows their formatting. Select text in the editor and use Bold, Italic, Underline, or Strikethrough. Ctrl/Cmd+B, Ctrl/Cmd+I, and Ctrl/Cmd+U also format the selection. Press an active formatting button again to remove that style from the selection; styles can be combined.

Text size applies to the whole box. **Text / line colour** sets the text and border colour. Border visibility and width, fill colour, fill visibility, and fill opacity can be set separately for each box through its Inspector properties. New boxes start without a visible border or fill. Formatting selected text is stored as box content, separately from the **Custom cue properties** appearance overrides.

Drag the box to move it or its corner handles to resize it. Text wraps within the box; a red ellipsis indicates that some text does not fit. Enlarge the box to reveal it. Only text that fits is included in PDF export. Formatting is saved with the project and included in PDF export.

## Multiple selected cues

Properties supported by every selected cue are shown together. Mixed values are identified. Changing a shared value applies it to every unlocked selected cue.

## Type-level reset

Each cue type in Options has a command to clear custom properties from every cue of that type. A warning is shown before the change.

[Documentation index](README.md)
