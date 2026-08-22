# Script Markup App

A browser-based PDF cue-sheet editor for marking up theatre scripts, organising cues, adding Prompt/Showcall pages, and exporting a finished annotated PDF.

## Basic workflow

1. Select **Save / Load → Open PDF**.
2. Choose a cue tool and click the document to add cues.
3. Use **Options** to adjust cue appearance, Prompt/Showcall pages, dividers, and headers.
4. Save a `.cueproj` project for continued editing or export the completed PDF.

Loading a different PDF warns before replacing the current document and its cues. **Remove PDF** clears the current document and browser autosave.

## Cue editing

- SFX, Scene, and DCA cues use draggable margins and lines.
- Note, Warn, and Mark cues place text directly on a page.
- Fade and Block cues use two clicks to set their endpoints or opposite corners.
- Cues and their handles can be dragged without automatically selecting the cue.
- Cue names can be edited on the page or inline in the cue list.
- Options control cue colour, text size, line width, margin, and Block fill settings.
- Hidden cue types remain in the project but are omitted from the canvas and export.

## Prompt/Showcall pages

Enable **Prompt/Showcall Page** in Options to add a blank page to the left or right of every source PDF page. The source and Prompt/Showcall pages behave as one editing canvas, allowing cue lines and margins to cross the page boundary.

The selected side applies throughout the document. Switching sides moves calling-page cue content to the equivalent position while script-side line endpoints remain in place. Prompt/Showcall pages cannot be disabled while they contain cues. Disabling them resets the SFX, Scene, and DCA margins.

During PDF export, each Prompt/Showcall page is rendered as its own PDF page in sequence with the corresponding source page.

## Dividers and headers

- Vertical dividers and headers can be created on PDF or Prompt/Showcall pages.
- An item appears at the same position on every page of its type.
- Dividers have shared colour and line-width settings.
- Headers have shared colour and text-size settings; the default is black at size 25.
- Headers can be renamed inline in Options or by double-clicking them on the page.
- Unlocked items can be selected from the page or Options, dragged between page types, and removed with their × button or Delete/Backspace.
- **Lock dividers and headers** prevents moving, editing, and deleting them.
- **Reset dividers and headers** removes all of them after confirmation.
- Items outside the active canvas are retained while a Prompt/Showcall page is hidden, but are omitted when the project is saved or the PDF is exported.

## Saving and session recovery

- **Save Project** downloads a timestamped `.cueproj` file.
- **Save Project As** lets you choose a filename and location when supported by the browser.
- **Export PDF** creates the final annotated PDF.
- Successful save and export operations display confirmation messages.
- The active session is stored automatically in the browser and restored automatically after reloads and return visits.
- **Recover Autosave** manually reloads the browser-stored copy if needed.

## Keyboard and pointer shortcuts

| Input | Action |
| --- | --- |
| Esc | Cancel a pending cue, clear selection, and return to Pointer |
| Delete / Backspace | Remove the selected cue, divider, or header when unlocked |
| Ctrl/Cmd + Z | Undo the last cue action |
| Ctrl/Cmd + Shift + Z | Redo the last undone action |
| Ctrl/Cmd + Y | Redo on Windows-style keyboards |
| Double-click | Edit cue, Fade, Block, or header text |
| Drag | Move items or adjust visible handles |
| F / 7 | Select Fade |
| B / 8 | Select Block |

## Development

```sh
npm install
npm run dev
```

Create a production build with:

```sh
npm run build
```

The Docker image builds the Vite application and serves it with nginx. Replace the running container after rebuilding so it serves the new image rather than restarting an older container.
