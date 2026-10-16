# Projects, autosave, compatibility, and export

## `.cueproj` projects

A project contains the source PDF, cues, custom cue types, type settings, custom properties, visibility and locking state, Prompt/Showcall configuration, dividers, headers, and document name.

Use **Save Project** for a timestamped download or **Save Project As** to choose a destination where supported.

## Autosave

The active session is stored automatically in the browser. The header reports the latest autosave time. **Recover Autosave** manually reloads the browser copy.

Autosave is tied to the browser profile and device. Download `.cueproj` backups for durable or transferable storage.

## Compatibility

Projects record both the application version and project-schema version. Older projects remain supported. Legacy Warn and Mark cues are loaded as custom Note types with their appearance retained.

Opening a PDF creates a fresh project and restores application defaults. Loading a `.cueproj` restores that project's settings.

## Export

**Export PDF** renders visible cues, type affixes, dividers, headers, and Prompt/Showcall pages. Hidden cue types and dashed UI-only handles are excluded. Keep the `.cueproj` as the editable source because an exported PDF cannot restore editor data.

[Documentation index](README.md)
