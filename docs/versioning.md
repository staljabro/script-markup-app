# Versioning and project compatibility

Version constants are maintained in [`src/version.js`](../src/version.js):

- `APP_VERSION` is shown in the interface and saved as `appVersion`.
- `PROJECT_SCHEMA_VERSION` is saved as `version` and identifies the `.cueproj` structure.

Change `APP_VERSION` for an application release. Change `PROJECT_SCHEMA_VERSION` only when project data requires an explicit migration or older builds must distinguish the new structure.

The private npm package version in `package.json` is package/build metadata. Keep it aligned with `APP_VERSION` for formal releases.

## Compatibility guidelines

1. Treat missing fields as older-project defaults.
2. Preserve unknown data where practical.
3. Migrate identifiers deterministically.
4. Never mutate the imported project object in place.
5. Keep rendering defaults independent from previously open projects.
6. Test loading a current project, a project without custom types, and a legacy project containing Warn or Mark cues.

## Release checklist

1. Update `src/version.js`.
2. Align `package.json` and `package-lock.json` when publishing a formal release.
3. Update documentation that changed.
4. Run `npm run lint` and `npm run build`.
5. Save and reopen a test `.cueproj`.
6. Export and inspect a representative PDF.

[Documentation index](README.md)
