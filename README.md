# Script Markup App

A browser-based PDF cue-sheet editor for marking up theatre scripts, organising technical cues, building Prompt/Showcall pages, and exporting an annotated PDF.

## Documentation

The complete user guide is in [docs/README.md](docs/README.md). Useful starting points:

- [Getting started](docs/getting-started.md)
- [Cue types and cue-type options](docs/cue-types.md)
- [Creating, selecting, and editing cues](docs/editing-cues.md)
- [Custom cue types](docs/custom-cue-types.md)
- [Tools](docs/tools.md)
- [Projects, autosave, compatibility, and export](docs/projects-and-export.md)
- [Keyboard and pointer shortcuts](docs/shortcuts.md)
- [Troubleshooting](docs/troubleshooting.md)

## Core features

- Margin-based SFX, Scene, and DCA cues
- Notes, fades, blocks, and user-defined cue types
- Per-type settings and per-cue property overrides
- Multiple selection using marquee drag, Ctrl/Cmd-click, or Shift-click
- Bulk alignment, distribution, duplication, page movement, and property transfer
- Cue-type locking and visibility controls
- Prompt/Showcall pages, shared dividers, and headers
- Cue conversion and exact-text find and replace with previews
- Browser autosave, `.cueproj` project files, and annotated PDF export
- Backward-compatible migration of legacy Warn and Mark cues

## Quick start

1. Open **Save / Load** and select **Open PDF**.
2. Choose a cue tool and click the page to add a cue.
3. Open **Options** to configure cue types and page features.
4. Save a `.cueproj` file for continued editing.
5. Export the finished annotated PDF.

Opening a new PDF starts a fresh document with default cue settings and no custom cue types. Loading a `.cueproj` restores the settings saved in that project.

## Development

```sh
npm install
npm run dev
```

Run validation and create a production build with:

```sh
npm run lint
npm run build
```

The Docker image builds the Vite application and serves it with nginx. Rebuild and replace the running container when deploying a new image.

## Versioning

Application and project-schema versions are maintained in [`src/version.js`](src/version.js). The npm package version remains in `package.json` as package metadata.
