import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { LineCapStyle, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  mdiAlertCircleOutline,
  mdiArrowULeftTop,
  mdiBackupRestore,
  mdiBellOutline,
  mdiBookOpenPageVariantOutline,
  mdiBookmarkOutline,
  mdiBorderNoneVariant,
  mdiBullhornOutline,
  mdiCameraOutline,
  mdiCheckCircleOutline,
  mdiClockOutline,
  mdiCogOutline,
  mdiCommentTextOutline,
  mdiCursorDefault,
  mdiContentSaveEditOutline,
  mdiContentSaveOutline,
  mdiDeleteOutline,
  mdiFileExportOutline,
  mdiFilePdfBox,
  mdiFindReplace,
  mdiFolderOpenOutline,
  mdiEye,
  mdiFlagOutline,
  mdiFlashOutline,
  mdiFormatListBulletedSquare,
  mdiHeartOutline,
  mdiLightbulbOutline,
  mdiMapMarkerOutline,
  mdiMarker,
  mdiMicrophone,
  mdiMicrophoneOff,
  mdiMinusBoxOutline,
  mdiNoteTextOutline,
  mdiMusicNote,
  mdiPaletteOutline,
  mdiPencil,
  mdiPinOutline,
  mdiPlayCircleOutline,
  mdiPlusBoxOutline,
  mdiRadio,
  mdiScriptTextOutline,
  mdiSineWave,
  mdiStarOutline,
  mdiStopCircleOutline,
  mdiTagOutline,
  mdiTrendingUp,
  mdiTuneVertical,
  mdiVolumeHigh,
} from "@mdi/js";
import { usePdfRenderer } from "./hooks/usePdfRenderer";
import { APP_VERSION, PROJECT_SCHEMA_VERSION } from "./version";
import TextBoxEditor from "./components/TextBoxEditor";
import { editText, layoutTextBox, measureTextBox } from "./lib/textBoxes";
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  clearAutosaveProject,
  choosePdfFile,
  chooseProjectFile,
  readAutosaveProject,
  writeAutosaveProject,
  writePdfFileAs,
  writeProjectFile,
  writeProjectFileAs,
} from "./lib/projectFiles";

const MARGIN_CUE_TYPES = ["SFX", "TM", "DCA"];
const FREE_CUE_TYPES = ["NOTE"];
const LINE_CUE_TYPES = ["FADE"];
const AREA_CUE_TYPES = ["BLOCK", "TEXTBOX"];
const ALL_CUE_TYPES = [...MARGIN_CUE_TYPES, ...LINE_CUE_TYPES, ...AREA_CUE_TYPES, ...FREE_CUE_TYPES];

const getCueBaseType = (type) => {
  if (type?.startsWith("CUSTOM_POINT_")) return "SFX";
  if (type?.startsWith("CUSTOM_NOTE_")) return "NOTE";
  if (type?.startsWith("CUSTOM_BLOCK_")) return "BLOCK";
  return type;
};

const isMarginCue = (type) => MARGIN_CUE_TYPES.includes(getCueBaseType(type));
const isFreeCue = (type) => FREE_CUE_TYPES.includes(getCueBaseType(type));
const isBlockCue = (type) => ["BLOCK", "TEXTBOX"].includes(getCueBaseType(type));
const isPointCue = (type) => ["SFX", "TM"].includes(getCueBaseType(type));
const hasLines = (type) => isPointCue(type) || type === "FADE";
const getCueTypeName = (type) => (type === "TM" ? "Scene" : type === "TEXTBOX" ? "Text box" : type);
const getCueTypeOptionLabel = (type) =>
  type === "TM" ? "SCENE" : type === "TEXTBOX" ? "TEXT BOX" : type;
const FADE_TEXT_PADDING = 14;
const DEFAULT_CUE_MARKER_HEIGHT = 20;
const CUE_TEXT_GAP = 5;
const roundLineWidth = (value) => Math.round(Number(value) * 10) / 10;
const formatLineWidth = (value) => roundLineWidth(value).toFixed(1);
const DEFAULT_MARGINS = { SFX: 150, TM: 100, DCA: 50 };
const DEFAULT_COLORS = {
  POINTER: "#5b6474", SFX: "#cc00cc", TM: "#0000ff", DCA: "#ff0000",
  FADE: "#008000", BLOCK: "#c9c9c9", NOTE: "#8a2be2", TEXTBOX: "#000000",
};
const DEFAULT_STYLES = {
  POINTER: { textSize: 20, lineWidth: 1.5 },
  SFX: { textSize: 20, lineWidth: 1.5, textPosition: "above", cueLinePosition: "below", cueSide: "after", markerHeight: 20, viewCueLine: true, viewCuePoint: true, prefix: "", suffix: "" },
  TM: { textSize: 20, lineWidth: 1.5, textPosition: "above", cueLinePosition: "below", cueSide: "after", markerHeight: 20, viewCueLine: true, viewCuePoint: true, prefix: "", suffix: "" },
  DCA: { textSize: 20, lineWidth: 1.5, prefix: "", suffix: "" }, FADE: { textSize: 20, lineWidth: 1.5 },
  BLOCK: { textSize: 20, lineWidth: 1.5 }, NOTE: { textSize: 20, lineWidth: 1.5 }, TEXTBOX: { textSize: 16, lineWidth: 1.5 },
};
const DEFAULT_BLOCK_APPEARANCE = { fillColor: "#ffffff", fillOpacity: 0.25, lineEnabled: true, fillEnabled: true };
const COLOR_PALETTE = [
  "#000000", "#374151", "#6b7280", "#ffffff", "#7f1d1d",
  "#dc2626", "#f97316", "#facc15", "#15803d", "#22c55e",
  "#0f766e", "#06b6d4", "#2563eb", "#0000ff", "#7c3aed",
  "#8a2be2", "#cc00cc", "#ec4899", "#c9c9c9", "#92400e",
];
const getMarginCueLayout = (cue, marginX, cueStyle) => {
  const linePosition = cueStyle.cueLinePosition || "below";
  const textPosition = cueStyle.textPosition || "above";
  const cueSide = cueStyle.cueSide || "after";
  const markerHalfHeight = (cueStyle.markerHeight || DEFAULT_CUE_MARKER_HEIGHT) / 2;
  const lineY = cue.y + (linePosition === "above" ? -markerHalfHeight : markerHalfHeight);

  return {
    lineY,
    markerHalfHeight,
    textX: marginX + (cueSide === "before" ? -CUE_TEXT_GAP : CUE_TEXT_GAP),
    textY: lineY + (textPosition === "above" ? -CUE_TEXT_GAP : cueStyle.textSize + CUE_TEXT_GAP),
    textAnchor: cueSide === "before" ? "end" : "start",
  };
};
const isUnitPosition = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
let fallbackIdSequence = 0;
const createId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  fallbackIdSequence += 1;
  return `${Date.now().toString(36)}-${fallbackIdSequence.toString(36)}-${Math.random().toString(36).slice(2)}`;
};
const getFadeTextPosition = (cue, textSize) => ({
  x: cue.x,
  y: cue.y2 < cue.y
    ? cue.y - FADE_TEXT_PADDING
    : cue.y + textSize + FADE_TEXT_PADDING,
});

const getSafeProjectName = (name) =>
  (name.trim() || "Untitled").replace(/[<>:"/\\|?*]+/g, "-");

const getTimestamp = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
};

const TOOL_BUTTONS = [
  { type: "POINTER", label: "Pointer", icon: mdiCursorDefault },
  { type: "SFX", label: "SFX", icon: mdiSineWave },
  { type: "TM", label: "Scene", icon: mdiFormatListBulletedSquare },
  { type: "DCA", label: "DCA", icon: mdiTuneVertical },
  { type: "NOTE", label: "Note", icon: mdiNoteTextOutline },
  { type: "FADE", label: "Fade", icon: mdiTrendingUp },
  { type: "BLOCK", label: "Block", icon: mdiBorderNoneVariant },
  { type: "TEXTBOX", label: "Text box", icon: mdiCommentTextOutline },
];

const CUSTOM_CUE_ICONS = [
  ["wave", "Wave", mdiSineWave], ["microphone", "Microphone", mdiMicrophone], ["microphone-off", "Microphone off", mdiMicrophoneOff],
  ["note", "Note", mdiNoteTextOutline], ["alert", "Alert", mdiAlertCircleOutline],
  ["marker", "Marker", mdiMarker], ["bell", "Bell", mdiBellOutline], ["book", "Book", mdiBookOpenPageVariantOutline],
  ["bookmark", "Bookmark", mdiBookmarkOutline], ["bullhorn", "Bullhorn", mdiBullhornOutline], ["camera", "Camera", mdiCameraOutline],
  ["check", "Check", mdiCheckCircleOutline], ["clock", "Clock", mdiClockOutline], ["cog", "Cog", mdiCogOutline],
  ["comment", "Comment", mdiCommentTextOutline], ["flag", "Flag", mdiFlagOutline], ["flash", "Flash", mdiFlashOutline],
  ["heart", "Heart", mdiHeartOutline], ["lightbulb", "Lightbulb", mdiLightbulbOutline],
  ["location", "Location", mdiMapMarkerOutline], ["music", "Music", mdiMusicNote],
  ["palette", "Palette", mdiPaletteOutline], ["pin", "Pin", mdiPinOutline], ["play", "Play", mdiPlayCircleOutline],
  ["radio", "Radio", mdiRadio], ["script", "Script", mdiScriptTextOutline], ["star", "Star", mdiStarOutline],
  ["stop", "Stop", mdiStopCircleOutline], ["tag", "Tag", mdiTagOutline], ["volume", "Volume", mdiVolumeHigh],
];
const CUSTOM_CUE_ICON_PATHS = Object.fromEntries(CUSTOM_CUE_ICONS.map(([id, , path]) => [id, path]));
const getDefaultCustomCueIcon = (kind) => kind === "POINT" ? "wave" : kind === "BLOCK" ? "stop" : "note";

function MaterialIcon({ path }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>;
}
function PaletteColorInput({ value, disabled = false, onCommit }) {
  const detailsRef = useRef(null);
  const hexInputRef = useRef(null);
  const applyColor = (nextColor) => {
    const normalized = nextColor.startsWith("#") ? nextColor : `#${nextColor}`;
    if (!/^#[0-9a-f]{6}$/i.test(normalized)) return;
    onCommit(normalized.toLowerCase());
    if (detailsRef.current) detailsRef.current.open = false;
  };
  return (
    <details ref={detailsRef} className={`palette-color-picker${disabled ? " is-disabled" : ""}`}>
      <summary aria-label="Choose colour" aria-disabled={disabled} onClick={(event) => { if (disabled) event.preventDefault(); }}>
        <span style={{ background: value }} />
      </summary>
      <div className="palette-color-popover">
        <div className="palette-color-grid">
          {COLOR_PALETTE.map((color) => <button key={color} type="button" aria-label={color} title={color} className={color.toLowerCase() === value.toLowerCase() ? "is-selected" : ""} style={{ background: color }} onClick={() => applyColor(color)} />)}
        </div>
        <div className="palette-hex-entry">
          <input ref={hexInputRef} key={value} defaultValue={value} aria-label="Hex colour" maxLength={7} onKeyDown={(event) => { if (event.key === "Enter") applyColor(event.currentTarget.value); }} />
          <button type="button" onClick={() => applyColor(hexInputRef.current?.value || "")}>Apply</button>
        </div>
      </div>
    </details>
  );
}

function ToolbarIcon({ name }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (name === "save") return <svg {...common}><path d="M4 4h12l4 4v12H4z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>;
  if (name === "undo") return <svg {...common}><path d="M9 7 4 12l5 5"/><path d="M5 12h8a7 7 0 0 1 7 7"/></svg>;
  if (name === "redo") return <svg {...common}><path d="m15 7 5 5-5 5"/><path d="M19 12h-8a7 7 0 0 0-7 7"/></svg>;
  if (name === "stack") return <svg {...common}><rect x="5" y="3" width="14" height="7" rx="1"/><rect x="5" y="14" width="14" height="7" rx="1"/></svg>;
  if (name === "columns") return <svg {...common}><rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/></svg>;
  if (name === "options") return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="8" cy="18" r="2" fill="currentColor"/></svg>;
  if (name === "tools") return <svg {...common}><path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L4 17l3 3 8.3-8.3a4 4 0 0 0 5-5L18 9l-2.4-2.4 2.3-2.3a4 4 0 0 0-3.2 2z"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01"/></svg>;
}

export default function App() {
  const { pages, pdfBytes, loadPdf, clearPdf } = usePdfRenderer();

  const [cues, setCues] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [mode, setMode] = useState("POINTER");

  const [currentProjectPath, setCurrentProjectPath] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [lastAutosave, setLastAutosave] = useState(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [showCueFilters, setShowCueFilters] = useState(false);
  const [selectedCueId, setSelectedCueIdState] = useState(null);
  const [selectedCueIds, setSelectedCueIds] = useState([]);
  const [editingCueId, setEditingCueId] = useState(null);
  const [cueNameDraft, setCueNameDraft] = useState("");
  const [fadeStart, setFadeStart] = useState(null);
  const [blockStart, setBlockStart] = useState(null);
  const [selectionBox, setSelectionBox] = useState(null);

  const [showCueList, setShowCueList] = useState(true);
  const [showInspector, setShowInspector] = useState(false);
  const [pageLayout, setPageLayout] = useState("single");
  const [notesPageSide, setNotesPageSide] = useState("off");
  const [callingPageSide, setCallingPageSide] = useState("left");
  const [dividers, setDividers] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [dividersLocked, setDividersLocked] = useState(false);
  const [selectedDividerId, setSelectedDividerId] = useState(null);
  const [selectedHeaderId, setSelectedHeaderId] = useState(null);
  const [editingHeaderId, setEditingHeaderId] = useState(null);
  const [headerTextDraft, setHeaderTextDraft] = useState("");
  const [dividerAppearance, setDividerAppearance] = useState({
    color: "#000000",
    lineWidth: 1.5,
  });
  const [headerAppearance, setHeaderAppearance] = useState({
    color: "#000000",
    textSize: 25,
  });
  const [displayScale, setDisplayScale] = useState(1);
  const [documentName, setDocumentName] = useState("Untitled");
  const [documentNameDraft, setDocumentNameDraft] = useState("Untitled");
  const [isEditingDocumentName, setIsEditingDocumentName] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [activeToolsView, setActiveToolsView] = useState(null);
  const [fileActionInProgress, setFileActionInProgress] = useState(null);
  const [showOptionsDrawer, setShowOptionsDrawer] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [expandedCueType, setExpandedCueType] = useState(null);
  const [showGeneralOptions, setShowGeneralOptions] = useState(false);
  const [optionsSearch, setOptionsSearch] = useState("");
  const [lockedCueTypes, setLockedCueTypes] = useState({});
  const [currentPage, setCurrentPage] = useState(0);
  const [hasCopiedCueProperties, setHasCopiedCueProperties] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(() => Number(localStorage.getItem("scriptMarkupDrawerWidth")) || 390);
  const [cueListWidth, setCueListWidth] = useState(() => Number(localStorage.getItem("scriptMarkupCueListWidth")) || 300);
  const [appDialog, setAppDialog] = useState(null);
  const [toast, setToast] = useState(null);

  const [cueTypeFilters, setCueTypeFilters] = useState(() =>
    Object.fromEntries(
      ALL_CUE_TYPES.map((type) => [type, true])
    )
  );
  const [showCustomCuesOnly, setShowCustomCuesOnly] = useState(false);
  const [customCueTypes, setCustomCueTypes] = useState([]);
  const [customCueTypeName, setCustomCueTypeName] = useState("");
  const [customCueTypeKind, setCustomCueTypeKind] = useState("POINT");
  const [customCueTypeIcon, setCustomCueTypeIcon] = useState("wave");
  const [customCueTypePrefix, setCustomCueTypePrefix] = useState("");
  const [customCueTypeSuffix, setCustomCueTypeSuffix] = useState("");
  const [convertFromType, setConvertFromType] = useState("");
  const [convertToType, setConvertToType] = useState("");
  const [findReplaceType, setFindReplaceType] = useState("");
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [hiddenCueTypes, setHiddenCueTypes] = useState(() =>
    Object.fromEntries(ALL_CUE_TYPES.map((type) => [type, false]))
  );

  const suppressNextSvgClickRef = useRef(false);
  const cueRefs = useRef({});
  const dirtyRef = useRef(false);
  const autosaveStateRef = useRef(null);
  const restoreAttemptedRef = useRef(false);
  const loadProjectDataRef = useRef(null);
  const toolToolbarRef = useRef(null);
  const editorMainRef = useRef(null);
  const copiedCuePropertiesRef = useRef(null);
  const draggedCustomTypeIdRef = useRef(null);
  const cueSelectionAnchorRef = useRef(null);
  const dialogResolveRef = useRef(null);

  const showToast = (message, tone = "info") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3500);
  };

  const requestAppDialog = (options) => new Promise((resolve) => {
    dialogResolveRef.current = resolve;
    setAppDialog({ value: "", confirmLabel: "Continue", ...options });
  });

  const closeAppDialog = (result) => {
    const resolve = dialogResolveRef.current;
    dialogResolveRef.current = null;
    setAppDialog(null);
    resolve?.(result);
  };

  useEffect(() => {
    const toolbar = toolToolbarRef.current;
    if (!toolbar) return undefined;

    const updateToolbarHeight = () => {
      document.documentElement.style.setProperty("--tool-toolbar-height", `${toolbar.offsetHeight}px`);
    };
    const observer = new ResizeObserver(updateToolbarHeight);
    observer.observe(toolbar);
    updateToolbarHeight();

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--tool-toolbar-height");
    };
  }, []);

  useEffect(() => {
    const editor = editorMainRef.current;
    if (!editor) return undefined;
    const handleZoomWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      setDisplayScale((current) => Math.min(2, Math.max(0.5, Math.round((current + direction * 0.05) * 20) / 20)));
    };
    editor.addEventListener("wheel", handleZoomWheel, { passive: false });
    return () => editor.removeEventListener("wheel", handleZoomWheel);
  }, []);

  const [margins, setMargins] = useState({ ...DEFAULT_MARGINS });

  const [colors, setColors] = useState({ ...DEFAULT_COLORS });

  const [styles, setStyles] = useState(() => Object.fromEntries(Object.entries(DEFAULT_STYLES).map(([type, style]) => [type, { ...style }])));

  const [blockAppearance, setBlockAppearance] = useState({ ...DEFAULT_BLOCK_APPEARANCE });

  const setSelectedCueId = (cueId) => {
    setSelectedCueIdState(cueId);
    setSelectedCueIds(cueId ? [cueId] : []);
  };

  const availableCueTypes = [...ALL_CUE_TYPES, ...customCueTypes.map((definition) => definition.id)];
  const cueToolButtons = [
    TOOL_BUTTONS[0],
    ...TOOL_BUTTONS.slice(1),
    ...customCueTypes.map((definition) => ({
      type: definition.id,
      label: definition.name,
      icon: CUSTOM_CUE_ICON_PATHS[definition.icon] || CUSTOM_CUE_ICON_PATHS[getDefaultCustomCueIcon(definition.kind)],
    })),
  ];
  const getCustomCueDefinition = (type) => customCueTypes.find((definition) => definition.id === type);
  const getDisplayCueTypeName = (type) => getCustomCueDefinition(type)?.name || getCueTypeName(type);
  const getDisplayCueTypeLabel = (type) => getCustomCueDefinition(type)?.name || getCueTypeOptionLabel(type);
  const getCueDisplayText = (cue) => {
    const definition = getCustomCueDefinition(cue.type);
    const affixes = definition || styles[cue.type] || {};
    return `${affixes.prefix || ""}${cue.label}${affixes.suffix || ""}`;
  };

  const getTypeProperties = (type) => ({
    color: colors[type] || colors[getCueBaseType(type)] || "#000000",
    margin: margins[type] ?? margins[getCueBaseType(type)],
    style: { ...(styles[type] || styles[getCueBaseType(type)] || { textSize: 20, lineWidth: 1.5 }) },
    blockAppearance: { ...(getCustomCueDefinition(type)?.blockAppearance || blockAppearance) },
  });

  const compactCueProperties = useCallback((type, properties = {}) => {
    const defaults = {
      color: colors[type] || colors[getCueBaseType(type)] || "#000000",
      margin: margins[type] ?? margins[getCueBaseType(type)],
      style: { ...(styles[type] || styles[getCueBaseType(type)] || { textSize: 20, lineWidth: 1.5 }) },
      blockAppearance: { ...(customCueTypes.find((definition) => definition.id === type)?.blockAppearance || blockAppearance) },
    };
    const compact = {};
    for (const key of ["color", "margin"]) {
      if (key in properties && !Object.is(properties[key], defaults[key])) compact[key] = properties[key];
    }
    for (const section of ["style", "blockAppearance"]) {
      const overrides = Object.fromEntries(Object.entries(properties[section] || {})
        .filter(([key, value]) => !Object.is(value, defaults[section][key])));
      if (Object.keys(overrides).length) compact[section] = overrides;
    }
    return compact;
  }, [blockAppearance, colors, customCueTypes, margins, styles]);

  const getCueProperties = (cue) => {
    const defaults = getTypeProperties(cue.type);
    if (!cue.customPropertiesEnabled || !cue.customProperties) return defaults;
    return {
      ...defaults,
      ...cue.customProperties,
      style: { ...defaults.style, ...(cue.customProperties.style || {}) },
      blockAppearance: { ...defaults.blockAppearance, ...(cue.customProperties.blockAppearance || {}) },
    };
  };

  const setCuePropertyOverride = (cueId, section, key, value) => {
    setCues((current) => current.map((cue) => {
      if (cue.id !== cueId) return cue;
      if (lockedCueTypes[cue.type]) return cue;
      const defaults = getTypeProperties(cue.type);
      const defaultValue = section ? defaults[section][key] : defaults[key];
      const customProperties = compactCueProperties(cue.type, cue.customProperties);

      if (section) {
        const sectionOverrides = { ...(customProperties[section] || {}) };
        if (Object.is(value, defaultValue)) delete sectionOverrides[key];
        else sectionOverrides[key] = value;
        if (Object.keys(sectionOverrides).length) customProperties[section] = sectionOverrides;
        else delete customProperties[section];
      } else if (Object.is(value, defaultValue)) {
        delete customProperties[key];
      } else {
        customProperties[key] = value;
      }

      const hasOverrides = Object.keys(customProperties).length > 0;
      return {
        ...cue,
        customPropertiesEnabled: hasOverrides,
        customProperties: hasOverrides ? customProperties : undefined,
      };
    }));
    markDirty();
  };

  const markDirty = () => setIsDirty(true);

  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  const createProjectData = () => {
    if (!pdfBytes) return null;

    return {
      app: "cue-pdf-annotator",
      appVersion: APP_VERSION,
      version: PROJECT_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      pdfBase64: arrayBufferToBase64(pdfBytes),
      cues: cues.map((cue) => ({
        ...cue,
        customProperties: compactCueProperties(cue.type, cue.customProperties),
      })),
      margins,
      colors,
      styles,
      blockAppearance,
      documentName,
      hiddenCueTypes,
      lockedCueTypes,
      customCueTypes,
      notesPageSide,
      callingPageSide,
      dividers: dividers.filter((divider) => isUnitPosition(divider.position)),
      headers: headers.filter((header) => isUnitPosition(header.x) && isUnitPosition(header.y)),
      dividersLocked,
      dividerAppearance,
      headerAppearance,
      combinedNotesCanvas: true,
    };
  };

  const loadProjectData = async (project) => {
    if (!project.pdfBase64) {
      showToast("Project file does not contain a PDF.", "error");
      return;
    }

    const pdfBuffer = base64ToArrayBuffer(project.pdfBase64);
    const pdfBytesForFile = new Uint8Array(pdfBuffer);

    const pdfFile = new File([pdfBytesForFile], "project.pdf", {
      type: "application/pdf",
    });

    await loadPdf(pdfFile);

    const legacyCueTypes = [
      { oldType: "WARN", id: "CUSTOM_NOTE_LEGACY_WARN", name: "Warn", icon: "alert" },
      { oldType: "MARK", id: "CUSTOM_NOTE_LEGACY_MARK", name: "Mark", icon: "marker" },
    ].filter(({ oldType }) => (project.cues || []).some((cue) => cue.type === oldType));
    const migratedCustomCueTypes = [...(project.customCueTypes || [])];
    legacyCueTypes.forEach(({ oldType, id, name, icon }) => {
      if (!migratedCustomCueTypes.some((definition) => definition.id === id)) {
        migratedCustomCueTypes.push({ id, name, kind: "NOTE", icon, legacyType: oldType });
      }
    });
    const legacyTypeMap = Object.fromEntries(legacyCueTypes.map(({ oldType, id }) => [oldType, id]));
    const migratedCues = (project.cues || []).map((cue) => legacyTypeMap[cue.type] ? { ...cue, type: legacyTypeMap[cue.type] } : cue);
    const migratedColors = { ...(project.colors || {}) };
    const migratedStyles = { ...(project.styles || {}) };
    const migratedHiddenCueTypes = { ...(project.hiddenCueTypes || {}) };
    legacyCueTypes.forEach(({ oldType, id }) => {
      migratedColors[id] = migratedColors[oldType] || (oldType === "WARN" ? "#ff8c00" : "#00a6a6");
      migratedStyles[id] = { ...(migratedStyles[oldType] || { textSize: 20, lineWidth: 1.5 }) };
      migratedHiddenCueTypes[id] = Boolean(migratedHiddenCueTypes[oldType]);
      delete migratedHiddenCueTypes[oldType];
    });

    setCues(migratedCues);
    setUndoStack([]);
    setRedoStack([]);
    setDocumentName(project.documentName || "Untitled");
    setMargins(project.margins || margins);
    setColors((current) => ({ ...current, ...migratedColors }));
    setStyles((current) => ({ ...current, ...migratedStyles }));
    setBlockAppearance((current) => ({
      ...current,
      ...(project.blockAppearance || {}),
    }));
    setHiddenCueTypes((current) => ({
      ...current,
      ...migratedHiddenCueTypes,
    }));
    setLockedCueTypes(project.lockedCueTypes || {});
    setCustomCueTypes(migratedCustomCueTypes.map((definition) => ({
      ...definition,
      icon: definition.icon || getDefaultCustomCueIcon(definition.kind),
    })));
    setCueTypeFilters((current) => ({
      ...current,
      ...Object.fromEntries(migratedCustomCueTypes.map((definition) => [definition.id, true])),
    }));
    setNotesPageSide(project.notesPageSide || "off");
    setCallingPageSide(project.notesPageSide && project.notesPageSide !== "off"
      ? project.notesPageSide
      : (project.callingPageSide || "left"));
    setDividers((project.dividers || []).map((divider) => ({ surface: "calling", ...divider })));
    setHeaders(project.headers || []);
    setDividersLocked(Boolean(project.dividersLocked));
    setSelectedDividerId(null);
    setSelectedHeaderId(null);
    setDividerAppearance((current) => ({
      ...current,
      ...(project.dividerAppearance || {}),
    }));
    setHeaderAppearance((current) => ({
      ...current,
      ...(project.headerAppearance || {}),
    }));
    setSelectedCueId(null);
    setFadeStart(null);
    setBlockStart(null);
    setIsDirty(false);
  };
  useEffect(() => {
    loadProjectDataRef.current = loadProjectData;
  });

  useEffect(() => {
    if (!pages.length || !cues.some((cue) => cue.surface)) return;
    const migration = setTimeout(() => {
      setCues((current) => current.map((cue) => {
        if (!cue.surface) return cue;
        const pageWidth = pages[cue.page]?.width || 0;
        const offset = cue.surface === "notes"
          ? (notesPageSide === "left" ? -pageWidth : pageWidth)
          : 0;
        const shifted = { ...cue };
        for (const key of ["x", "x2", "left", "right"]) {
          if (typeof shifted[key] === "number") shifted[key] += offset;
        }
        delete shifted.surface;
        return shifted;
      }));
    }, 0);
    return () => clearTimeout(migration);
  }, [pages, cues, notesPageSide]);

  /* eslint-disable react-hooks/exhaustive-deps -- keyboard commands intentionally close over the latest editor state */
  const createHistorySnapshot = (cueSnapshot = cues) => ({
    cues: cueSnapshot.map((cue) => structuredClone(cue)),
    margins: structuredClone(margins), colors: structuredClone(colors), styles: structuredClone(styles),
    blockAppearance: structuredClone(blockAppearance), customCueTypes: structuredClone(customCueTypes),
    hiddenCueTypes: structuredClone(hiddenCueTypes), lockedCueTypes: structuredClone(lockedCueTypes),
    notesPageSide, callingPageSide, dividers: structuredClone(dividers), headers: structuredClone(headers),
    dividersLocked, dividerAppearance: structuredClone(dividerAppearance), headerAppearance: structuredClone(headerAppearance),
  });

  const restoreHistorySnapshot = (snapshot) => {
    setCues(snapshot.cues); setMargins(snapshot.margins); setColors(snapshot.colors); setStyles(snapshot.styles);
    setBlockAppearance(snapshot.blockAppearance); setCustomCueTypes(snapshot.customCueTypes);
    setHiddenCueTypes(snapshot.hiddenCueTypes); setLockedCueTypes(snapshot.lockedCueTypes || {});
    setNotesPageSide(snapshot.notesPageSide); setCallingPageSide(snapshot.callingPageSide);
    setDividers(snapshot.dividers); setHeaders(snapshot.headers); setDividersLocked(snapshot.dividersLocked);
    setDividerAppearance(snapshot.dividerAppearance); setHeaderAppearance(snapshot.headerAppearance);
  };

  const pushUndo = (snapshot = cues) => {
    setRedoStack([]);
    setUndoStack((prev) =>
      [createHistorySnapshot(Array.isArray(snapshot) ? snapshot : cues), ...prev].slice(0, 30)
    );
  };

  const redoLastCueAction = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const [nextSnapshot, ...remaining] = prev;
      setUndoStack((undo) => [createHistorySnapshot(), ...undo].slice(0, 30));
      restoreHistorySnapshot(nextSnapshot);
      markDirty();
      return remaining;
    });
  };

  const undoLastCueAction = () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;

      const [lastSnapshot, ...remaining] = prev;
      setRedoStack((redo) => [createHistorySnapshot(), ...redo].slice(0, 30));
      restoreHistorySnapshot(lastSnapshot);
      markDirty();

      return remaining;
    });
  };

  const saveProjectAsNative = async () => {
    const project = createProjectData();

    if (!project) {
      showToast("Load a PDF before saving a project.", "error");
      return false;
    }

    const suggestedName = `${getSafeProjectName(documentName)}.cueproj`;
    const savedName = await writeProjectFileAs(project, suggestedName);
    if (!savedName) return false;
    setCurrentProjectPath(savedName);
    setIsDirty(false);
    showToast(`Project saved successfully as "${savedName}".`, "success");

    return true;
  };

  const saveCurrentProjectNative = async () => {
    const project = createProjectData();

    if (!project) {
      showToast("Load a PDF before saving a project.", "error");
      return false;
    }

    const fileName = `${getSafeProjectName(documentName)}_${getTimestamp()}.cueproj`;
    await writeProjectFile(fileName, project);
    setCurrentProjectPath(fileName);

    setIsDirty(false);
    showToast(`Project saved successfully as "${fileName}".`, "success");

    return true;
  };

  useEffect(() => {
    autosaveStateRef.current = {
      pdfBytes,
      cues,
      margins,
      colors,
      styles,
      blockAppearance,
      hiddenCueTypes,
      lockedCueTypes,
      customCueTypes,
      documentName,
      notesPageSide,
      callingPageSide,
      dividers,
      headers,
      dividersLocked,
      dividerAppearance,
      headerAppearance,
    };
  }, [pdfBytes, cues, margins, colors, styles, blockAppearance, hiddenCueTypes, lockedCueTypes, customCueTypes, documentName, notesPageSide, callingPageSide, dividers, headers, dividersLocked, dividerAppearance, headerAppearance]);

  useEffect(() => {
    const saveSession = async () => {
      const latest = autosaveStateRef.current;
      if (!latest?.pdfBytes) return;

      try {
        const project = {
          app: "cue-pdf-annotator",
          appVersion: APP_VERSION,
          version: PROJECT_SCHEMA_VERSION,
          savedAt: new Date().toISOString(),
          pdfBase64: arrayBufferToBase64(latest.pdfBytes),
          cues: latest.cues.map((cue) => ({
            ...cue,
            customProperties: compactCueProperties(cue.type, cue.customProperties),
          })),
          margins: latest.margins,
          colors: latest.colors,
          styles: latest.styles,
          blockAppearance: latest.blockAppearance,
          hiddenCueTypes: latest.hiddenCueTypes,
          lockedCueTypes: latest.lockedCueTypes,
          customCueTypes: latest.customCueTypes,
          documentName: latest.documentName,
          notesPageSide: latest.notesPageSide,
          callingPageSide: latest.callingPageSide,
          dividers: latest.dividers.filter((divider) => isUnitPosition(divider.position)),
          headers: latest.headers.filter((header) => isUnitPosition(header.x) && isUnitPosition(header.y)),
          dividersLocked: latest.dividersLocked,
          dividerAppearance: latest.dividerAppearance,
          headerAppearance: latest.headerAppearance,
          combinedNotesCanvas: true,
        };

        const path = await writeAutosaveProject(project);
        setLastAutosave(new Date().toLocaleTimeString());
        console.log("Autosaved:", path);
      } catch (err) {
        console.error("Autosave failed:", err);
      }
    };

    const timer = setTimeout(saveSession, 2000);
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") saveSession();
    };
    document.addEventListener("visibilitychange", saveWhenHidden);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [pdfBytes, cues, margins, colors, styles, blockAppearance, hiddenCueTypes, lockedCueTypes, customCueTypes, documentName, notesPageSide, callingPageSide, dividers, headers, dividersLocked, dividerAppearance, headerAppearance, compactCueProperties]);

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;

    const restorePreviousSession = async () => {
      try {
        const { project } = await readAutosaveProject();
        await loadProjectDataRef.current(project);
        setCurrentProjectPath(null);
        setIsDirty(true);
        setLastAutosave(project.savedAt
          ? new Date(project.savedAt).toLocaleTimeString()
          : "Recovered");
      } catch (err) {
        if (err?.message !== "No autosave exists") {
          console.error("Session restore failed:", err);
        }
      }
    };

    restorePreviousSession();
  }, []);

  const duplicateSelectedCues = () => {
    const selected = cues.filter((cue) => selectedCueIds.includes(cue.id) && !lockedCueTypes[cue.type]);
    if (!selected.length) return;
    pushUndo(cues);
    const duplicates = selected.map((cue) => {
      const copy = { ...cue, id: createId() };
      for (const key of ["x", "x2", "left", "right"]) if (typeof copy[key] === "number") copy[key] += 12;
      for (const key of ["y", "y2", "top", "bottom"]) if (typeof copy[key] === "number") copy[key] += 12;
      return copy;
    });
    setCues((current) => [...current, ...duplicates]);
    setSelectedCueIds(duplicates.map((cue) => cue.id));
    setSelectedCueIdState(duplicates[0]?.id || null);
    markDirty();
  };

  const nudgeSelectedCues = (dx, dy) => {
    const selectedIds = new Set(selectedCueIds);
    if (![...selectedIds].some((id) => { const cue = cues.find((item) => item.id === id); return cue && !lockedCueTypes[cue.type]; })) return;
    pushUndo(cues);
    setCues((current) => current.map((cue) => {
      if (!selectedIds.has(cue.id) || lockedCueTypes[cue.type]) return cue;
      const moved = { ...cue };
      for (const key of ["x", "x2", "left", "right"]) if (typeof moved[key] === "number") moved[key] += dx;
      for (const key of ["y", "y2", "top", "bottom"]) if (typeof moved[key] === "number") moved[key] += dy;
      return moved;
    }));
    markDirty();
  };

  const moveSelectedCuesToPage = (page) => {
    const selectedIds = new Set(selectedCueIds);
    if (!selectedIds.size) return;
    pushUndo(cues);
    setCues((current) => current.map((cue) => selectedIds.has(cue.id) && !lockedCueTypes[cue.type] ? { ...cue, page } : cue));
    markDirty();
  };

  const alignSelectedCues = (axis) => {
    const selected = cues.filter((cue) => selectedCueIds.includes(cue.id) && !lockedCueTypes[cue.type]);
    if (selected.length < 2) return;
    const coordinate = axis === "x" ? (selected[0].left ?? selected[0].x) : (selected[0].top ?? selected[0].y);
    pushUndo(cues);
    const ids = new Set(selected.map((cue) => cue.id));
    setCues((current) => current.map((cue) => {
      if (!ids.has(cue.id)) return cue;
      const anchor = axis === "x" ? (cue.left ?? cue.x) : (cue.top ?? cue.y);
      const delta = coordinate - anchor;
      const moved = { ...cue };
      const keys = axis === "x" ? ["x", "x2", "left", "right"] : ["y", "y2", "top", "bottom"];
      keys.forEach((key) => { if (typeof moved[key] === "number") moved[key] += delta; });
      return moved;
    }));
    markDirty();
  };

  const distributeSelectedCues = () => {
    const selected = cues.filter((cue) => selectedCueIds.includes(cue.id) && !lockedCueTypes[cue.type])
      .sort((a, b) => (a.top ?? a.y) - (b.top ?? b.y));
    if (selected.length < 3) return;
    const first = selected[0].top ?? selected[0].y;
    const last = selected[selected.length - 1].top ?? selected[selected.length - 1].y;
    const targets = new Map(selected.map((cue, index) => [cue.id, first + ((last - first) * index) / (selected.length - 1)]));
    pushUndo(cues);
    setCues((current) => current.map((cue) => {
      if (!targets.has(cue.id)) return cue;
      const anchor = cue.top ?? cue.y;
      const delta = targets.get(cue.id) - anchor;
      const moved = { ...cue };
      for (const key of ["y", "y2", "top", "bottom"]) if (typeof moved[key] === "number") moved[key] += delta;
      return moved;
    }));
    markDirty();
  };

  const resetSelectedCueProperties = () => {
    if (!selectedCueIds.length) return;
    pushUndo(cues);
    const ids = new Set(selectedCueIds);
    setCues((current) => current.map((cue) => ids.has(cue.id) && !lockedCueTypes[cue.type] ? { ...cue, customProperties: undefined, customPropertiesEnabled: false } : cue));
    markDirty();
  };

  const copySelectedCueProperties = () => {
    const cue = cues.find((item) => item.id === selectedCueIds[0]);
    if (cue) {
      copiedCuePropertiesRef.current = getCueProperties(cue);
      setHasCopiedCueProperties(true);
    }
  };

  const pasteSelectedCueProperties = () => {
    const copied = copiedCuePropertiesRef.current;
    if (!copied || !selectedCueIds.length) return;
    pushUndo(cues);
    const selectedIds = new Set(selectedCueIds);
    setCues((current) => current.map((cue) => {
      if (!selectedIds.has(cue.id) || lockedCueTypes[cue.type]) return cue;
      const compact = compactCueProperties(cue.type, copied);
      return { ...cue, customProperties: Object.keys(compact).length ? compact : undefined, customPropertiesEnabled: Object.keys(compact).length > 0 };
    }));
    markDirty();
  };

  const goToPage = (page) => {
    const nextPage = Math.max(0, Math.min(pages.length - 1, Number(page) || 0));
    setCurrentPage(nextPage);
    document.getElementById(`pdf-page-${nextPage}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const fitPageToViewport = (fitMode) => {
    const page = pages[currentPage];
    const editor = editorMainRef.current;
    if (!page || !editor) return;
    const availableWidth = editor.clientWidth - 70;
    const availableHeight = editor.clientHeight - 70;
    const pageWidth = page.width * (notesPageSide === "off" ? 1 : 2);
    const nextScale = fitMode === "width" ? availableWidth / pageWidth : Math.min(availableWidth / pageWidth, availableHeight / page.height);
    setDisplayScale(Math.min(2, Math.max(0.5, Math.round(nextScale * 20) / 20)));
  };

  const startPanelResize = (event, side, setter, storageKey) => {
    event.preventDefault();
    const move = (moveEvent) => {
      const width = side === "right" ? window.innerWidth - moveEvent.clientX : moveEvent.clientX;
      const bounded = Math.max(260, Math.min(620, width));
      setter(bounded);
      localStorage.setItem(storageKey, String(bounded));
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (editingCueId || editingHeaderId || isEditingDocumentName) return;
        e.preventDefault();
        if (appDialog) return closeAppDialog(appDialog.type === "prompt" ? null : false);
        if (showHelp) return setShowHelp(false);
        if (showFileMenu) return setShowFileMenu(false);
        if (showTools && activeToolsView) return setActiveToolsView(null);
        if (showTools) return setShowTools(false);
        if (showOptionsDrawer) return setShowOptionsDrawer(false);
        if (showInspector) return setShowInspector(false);
        setSelectedCueId(null);
        setSelectedDividerId(null);
        setSelectedHeaderId(null);
        setFadeStart(null);
        setBlockStart(null);
        setMode("POINTER");
        return;
      }
      const tag = e.target.tagName.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveCurrentProjectNative();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelectedCues();
        return;
      }

      if (selectedCueIds.length && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const amount = e.altKey ? 0.25 : e.shiftKey ? 10 : 1;
        nudgeSelectedCues(e.key === "ArrowLeft" ? -amount : e.key === "ArrowRight" ? amount : 0, e.key === "ArrowUp" ? -amount : e.key === "ArrowDown" ? amount : 0);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.shiftKey) {
        e.preventDefault();
        redoLastCueAction();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redoLastCueAction();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoLastCueAction();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedHeaderId && !dividersLocked) {
        e.preventDefault();
        setHeaders((current) => current.filter((header) => header.id !== selectedHeaderId));
        setSelectedHeaderId(null);
        markDirty();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedDividerId && !dividersLocked) {
        e.preventDefault();
        setDividers((current) => current.filter((divider) => divider.id !== selectedDividerId));
        setSelectedDividerId(null);
        setSelectedHeaderId(null);
        markDirty();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedCueId) {
        e.preventDefault();

        pushUndo(cues);
        markDirty();

        const selectedIds = new Set(selectedCueIds.length ? selectedCueIds : [selectedCueId]);
        setCues((prev) => prev.filter((cue) => !selectedIds.has(cue.id) || lockedCueTypes[cue.type]));
        setSelectedCueId(null);
        setSelectedDividerId(null);
        setSelectedHeaderId(null);
        return;
      }

      const key = e.key.toLowerCase();

      if (["s", "t", "d", "n", "f", "b", "1", "2", "3", "4", "5", "6"].includes(key)) {
        setFadeStart(null);
        setBlockStart(null);
      }

      const shortcutType = {
        s: "SFX", 1: "SFX", t: "TM", 2: "TM", d: "DCA", 3: "DCA",
        n: "NOTE", 4: "NOTE", f: "FADE", 5: "FADE", b: "BLOCK", 6: "BLOCK",
      }[key];
      if (shortcutType && !hiddenCueTypes[shortcutType]) setMode(shortcutType);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeToolsView, appDialog, cues, dividersLocked, duplicateSelectedCues, editingCueId, editingHeaderId, hiddenCueTypes, isEditingDocumentName, lockedCueTypes, nudgeSelectedCues, pushUndo, redoLastCueAction, redoStack, saveCurrentProjectNative, selectedCueId, selectedCueIds, selectedDividerId, selectedHeaderId, showFileMenu, showHelp, showInspector, showOptionsDrawer, showTools, undoLastCueAction, undoStack]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    const warnBeforeUnload = (event) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  const openPdfNative = async () => {
    if (pdfBytes) {
      const message = isDirty
        ? "You have unsaved changes. Loading a new PDF will replace the current PDF and remove its cues. Have you saved your changes?"
        : "Loading a new PDF will replace the current PDF and remove its cues. Do you want to continue?";
      if (!await requestAppDialog({ type: "confirm", title: "Open a new PDF?", message, confirmLabel: "Open PDF", danger: true })) return false;
    }
    const selected = await choosePdfFile();
    if (!selected) return false;

    await loadPdf(selected.file);

    setCues([]);
    setMargins({ ...DEFAULT_MARGINS });
    setColors({ ...DEFAULT_COLORS });
    setStyles(Object.fromEntries(Object.entries(DEFAULT_STYLES).map(([type, style]) => [type, { ...style }])));
    setBlockAppearance({ ...DEFAULT_BLOCK_APPEARANCE });
    setCustomCueTypes([]);
    setHiddenCueTypes(Object.fromEntries(ALL_CUE_TYPES.map((type) => [type, false])));
    setLockedCueTypes({});
    setCueTypeFilters(Object.fromEntries(ALL_CUE_TYPES.map((type) => [type, true])));
    setShowCustomCuesOnly(false);
    setMode("POINTER");
    setExpandedCueType(null);
    setShowGeneralOptions(false);
    setDividers([]);
    setHeaders([]);
    setDividersLocked(false);
    setSelectedDividerId(null);
    setSelectedHeaderId(null);
    setUndoStack([]);
    setRedoStack([]);
    setDocumentName(selected.file.name.replace(/\.pdf$/i, "") || "Untitled");
    setCurrentProjectPath(null);
    setSelectedCueId(null);
    setFadeStart(null);
    setBlockStart(null);
    setIsDirty(false);
    return true;
  };

  const removePdf = async () => {
    if (!pdfBytes) return false;
    if (isDirty && !await requestAppDialog({ type: "confirm", title: "Remove PDF?", message: "Remove this PDF and discard its unsaved cues?", confirmLabel: "Remove PDF", danger: true })) return false;

    clearPdf();
    setCues([]);
    setDividers([]);
    setHeaders([]);
    setDividersLocked(false);
    setSelectedDividerId(null);
    setSelectedHeaderId(null);
    setUndoStack([]);
    setRedoStack([]);
    setDocumentName("Untitled");
    setCurrentProjectPath(null);
    setSelectedCueId(null);
    setFadeStart(null);
    setBlockStart(null);
    setIsDirty(false);
    await clearAutosaveProject();
    setLastAutosave(null);
    return true;
  };

  const openProjectNative = async () => {
    try {
      const selected = await chooseProjectFile();
      if (!selected) return false;

      const project = JSON.parse(selected.contents);

      await loadProjectData(project);
      setCurrentProjectPath(selected.path);
      if (!project.documentName) {
        setDocumentName(selected.path.replace(/\.cueproj$/i, "") || "Untitled");
      }
      return true;

    } catch (err) {
      console.error("Open project failed:", err);
      showToast(`Open project failed: ${String(err)}`, "error");
      return false;
    }
  };

  const recoverAutosave = async () => {
    try {
      const { project } = await readAutosaveProject();
      await loadProjectData(project);
      setCurrentProjectPath(null);
      setIsDirty(true);
      showToast("Autosave recovered. Save this project to keep it.", "success");
      return true;
    } catch (err) {
      console.error("Autosave recovery failed:", err);
      showToast("No autosave could be recovered.", "error");
      return false;
    }
  };

  const addCue = async (pageIndex, x, y) => {
    if (mode === "POINTER") {
      setSelectedCueId(null);
      setSelectedDividerId(null);
      setSelectedHeaderId(null);
      setFadeStart(null);
      setBlockStart(null);
      return;
    }
    if (lockedCueTypes[mode]) return;
    setSelectedDividerId(null);
    setSelectedHeaderId(null);

    if (mode === "FADE") {
      if (!fadeStart || fadeStart.page !== pageIndex) {
        setFadeStart({ page: pageIndex, x, y });
        return;
      }

      const start = fadeStart;
      setFadeStart(null);

      pushUndo(cues);
      markDirty();
      setCues((prev) => [
        ...prev,
        {
          id: createId(),
          page: pageIndex,
          x: start.x,
          y: start.y,
          x2: x,
          y2: y,
          type: "FADE",
          label: "",
        },
      ]);
      return;
    }

    if (isBlockCue(mode)) {
      if (!blockStart || blockStart.page !== pageIndex) {
        setBlockStart({ page: pageIndex, x, y });
        return;
      }

      const start = blockStart;
      setBlockStart(null);
      const id = createId();
      const isTextBox = mode === "TEXTBOX";

      pushUndo(cues);
      markDirty();
      setCues((prev) => [
        ...prev,
        {
          id,
          page: pageIndex,
          left: Math.min(start.x, x),
          top: Math.min(start.y, y),
          right: Math.max(Math.max(start.x, x), Math.min(start.x, x) + (isTextBox ? 60 : 0)),
          bottom: Math.max(Math.max(start.y, y), Math.min(start.y, y) + (isTextBox ? 40 : 0)),
          x: Math.min(start.x, x),
          y: Math.min(start.y, y),
          type: mode,
          label: "",
          ...(isTextBox ? { textRuns: [], customPropertiesEnabled: true, customProperties: { blockAppearance: { lineEnabled: false, fillEnabled: false } } } : {}),
        },
      ]);
      if (isTextBox) {
        setSelectedCueId(id);
        setShowInspector(true);
        setMode("POINTER");
      }
      return;
    }

    const label = await requestAppDialog({ type: "prompt", title: `Add ${getDisplayCueTypeName(mode)} cue`, message: "Enter the cue text.", confirmLabel: "Add cue" });
    if (!label) return;

    pushUndo(cues);
    markDirty();
    setSelectedDividerId(null);

    setCues((prev) => [
      ...prev,
      {
        id: createId(),
        page: pageIndex,
        x,
        y,
        type: mode,
        label,
      },
    ]);
  };

  const updateCue = async (id) => {
    const cue = cues.find((c) => c.id === id);
    if (!cue || lockedCueTypes[cue.type]) return;
    if (cue.type === "TEXTBOX") {
      setSelectedCueId(id);
      setShowInspector(true);
      return;
    }
    setSelectedCueId(null);

    const newLabel = await requestAppDialog({ type: "prompt", title: "Edit cue", message: "Update the cue text.", value: cue.label, confirmLabel: "Save" });
    if (newLabel === null) return;
    if (!newLabel && cue.type !== "FADE" && !isBlockCue(cue.type)) return;

    pushUndo(cues);
    markDirty();

    setCues((prev) =>
      prev.map((c) => (c.id === id ? { ...c, label: newLabel } : c))
    );
  };

  const getCueSurfacePoint = (clientX, clientY, fallbackSvg) => {
    const targetSvg = document.elementsFromPoint(clientX, clientY)
      .find((element) => element.matches?.("svg[data-cue-page-index]")) || fallbackSvg;
    if (!targetSvg) return null;

    const rect = targetSvg.getBoundingClientRect();
    const scaleX = targetSvg.viewBox.baseVal.width / rect.width;
    const scaleY = targetSvg.viewBox.baseVal.height / rect.height;
    const coordinateOffset = Number(targetSvg.dataset.coordinateOffset || 0);
    return {
      page: Number(targetSvg.dataset.cuePageIndex),
      x: (clientX - rect.left) * scaleX - coordinateOffset,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDragCueLine = (e, cueId) => {
    e.stopPropagation();
    e.preventDefault();
    if (lockedCueTypes[cues.find((cue) => cue.id === cueId)?.type]) return;

    const startSnapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let didMove = false;

    const move = (ev) => {
      const deltaX = Math.abs(ev.clientX - startClientX);
      const deltaY = Math.abs(ev.clientY - startClientY);
      if (deltaX > 2 || deltaY > 2) didMove = true;

      const point = getCueSurfacePoint(ev.clientX, ev.clientY, svg);
      if (!point) return;

      setCues((prev) =>
        prev.map((c) =>
          c.id === cueId ? { ...c, page: point.page, x: point.x, y: point.y } : c
        )
      );
    };

    const up = () => {
      if (didMove) {
        pushUndo(startSnapshot);
        markDirty();

        suppressNextSvgClickRef.current = true;
        setTimeout(() => {
          suppressNextSvgClickRef.current = false;
        }, 0);
      }

      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startDragFreeCue = (e, cueId) => {
    e.stopPropagation();
    e.preventDefault();
    if (lockedCueTypes[cues.find((cue) => cue.id === cueId)?.type]) return;

    const startSnapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let didMove = false;

    const move = (ev) => {
      const deltaX = Math.abs(ev.clientX - startClientX);
      const deltaY = Math.abs(ev.clientY - startClientY);
      if (deltaX > 2 || deltaY > 2) didMove = true;

      const point = getCueSurfacePoint(ev.clientX, ev.clientY, svg);
      if (!point) return;

      setCues((prev) =>
        prev.map((c) => (c.id === cueId ? { ...c, page: point.page, x: point.x, y: point.y } : c))
      );
    };

    const up = () => {
      if (didMove) {
        pushUndo(startSnapshot);
        markDirty();

        suppressNextSvgClickRef.current = true;
        setTimeout(() => {
          suppressNextSvgClickRef.current = false;
        }, 0);
      }

      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startDragDcaCue = (e, cueId) => {
    e.stopPropagation();
    e.preventDefault();
    if (lockedCueTypes[cues.find((cue) => cue.id === cueId)?.type]) return;

    const startSnapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const startClientY = e.clientY;
    let didMove = false;

    const move = (ev) => {
      if (Math.abs(ev.clientY - startClientY) > 2) didMove = true;

      const point = getCueSurfacePoint(ev.clientX, ev.clientY, svg);
      if (!point) return;
      const targetHeight = pages[point.page]?.height || svg.viewBox.baseVal.height;
      const newY = Math.max(0, Math.min(targetHeight, point.y));

      setCues((prev) =>
        prev.map((cue) => cue.id === cueId ? { ...cue, page: point.page, y: newY } : cue)
      );
    };

    const up = () => {
      if (didMove) {
        pushUndo(startSnapshot);
        markDirty();
        suppressNextSvgClickRef.current = true;
        setTimeout(() => {
          suppressNextSvgClickRef.current = false;
        }, 0);
      }

      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startDragFade = (e, cueId) => {
    e.stopPropagation();
    e.preventDefault();
    if (lockedCueTypes[cues.find((cue) => cue.id === cueId)?.type]) return;

    const original = cues.find((cue) => cue.id === cueId);
    if (!original) return;
    const startSnapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const startPoint = getCueSurfacePoint(e.clientX, e.clientY, svg);
    if (!startPoint) return;
    const grabOffsetX = startPoint.x - original.x;
    const grabOffsetY = startPoint.y - original.y;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let didMove = false;

    const move = (event) => {
      const point = getCueSurfacePoint(event.clientX, event.clientY, svg);
      if (!point) return;
      const nextX = point.x - grabOffsetX;
      const nextY = point.y - grabOffsetY;
      const dx = nextX - original.x;
      const dy = nextY - original.y;
      if (Math.abs(event.clientX - startClientX) > 2 || Math.abs(event.clientY - startClientY) > 2) didMove = true;

      setCues((current) => current.map((cue) =>
        cue.id === cueId
          ? {
              ...cue,
              page: point.page,
              x: original.x + dx,
              y: original.y + dy,
              x2: original.x2 + dx,
              y2: original.y2 + dy,
            }
          : cue
      ));
    };

    const up = () => {
      if (didMove) {
        pushUndo(startSnapshot);
        markDirty();
        suppressNextSvgClickRef.current = true;
        setTimeout(() => { suppressNextSvgClickRef.current = false; }, 0);
      }
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startDragFadeHandle = (e, cueId, endpoint) => {
    if (lockedCueTypes[cues.find((cue) => cue.id === cueId)?.type]) return;
    e.stopPropagation();
    e.preventDefault();

    const startSnapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    let didMove = false;

    const move = (event) => {
      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const coordinateOffset = Number(svg.dataset.coordinateOffset || 0);
      const nextX = (event.clientX - rect.left) * scaleX - coordinateOffset;
      const nextY = (event.clientY - rect.top) * scaleY;
      didMove = true;

      setCues((current) => current.map((cue) => {
        if (cue.id !== cueId) return cue;
        return endpoint === "start"
          ? { ...cue, x: nextX, y: nextY }
          : { ...cue, x2: nextX, y2: nextY };
      }));
    };

    const up = () => {
      if (didMove) {
        pushUndo(startSnapshot);
        markDirty();
        suppressNextSvgClickRef.current = true;
        setTimeout(() => { suppressNextSvgClickRef.current = false; }, 0);
      }
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startDragBlock = (e, cueId) => {
    if (lockedCueTypes[cues.find((cue) => cue.id === cueId)?.type]) return;
    e.stopPropagation();
    e.preventDefault();
    const original = cues.find((cue) => cue.id === cueId);
    if (!original) return;
    const snapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const startPoint = getCueSurfacePoint(e.clientX, e.clientY, svg);
    if (!startPoint) return;
    const grabOffsetX = startPoint.x - original.left;
    const grabOffsetY = startPoint.y - original.top;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const move = (event) => {
      const point = getCueSurfacePoint(event.clientX, event.clientY, svg);
      if (!point) return;
      const nextLeft = point.x - grabOffsetX;
      const nextTop = point.y - grabOffsetY;
      const dx = nextLeft - original.left;
      const dy = nextTop - original.top;
      if (Math.abs(event.clientX - startX) > 2 || Math.abs(event.clientY - startY) > 2) moved = true;
      setCues((current) => current.map((cue) => cue.id === cueId ? {
        ...cue,
        page: point.page,
        left: original.left + dx,
        right: original.right + dx,
        top: original.top + dy,
        bottom: original.bottom + dy,
        x: original.left + dx,
        y: original.top + dy,
      } : cue));
    };
    const up = () => {
      if (moved) {
        pushUndo(snapshot);
        markDirty();
        suppressNextSvgClickRef.current = true;
        setTimeout(() => { suppressNextSvgClickRef.current = false; }, 0);
      }
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startDragBlockCorner = (e, cueId, corner) => {
    if (lockedCueTypes[cues.find((cue) => cue.id === cueId)?.type]) return;
    e.stopPropagation();
    e.preventDefault();
    const snapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    let moved = false;
    const move = (event) => {
      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const coordinateOffset = Number(svg.dataset.coordinateOffset || 0);
      const nextX = (event.clientX - rect.left) * scaleX - coordinateOffset;
      const nextY = (event.clientY - rect.top) * scaleY;
      moved = true;
      setCues((current) => current.map((cue) => {
        if (cue.id !== cueId) return cue;
        const next = { ...cue };
        if (corner.includes("w")) next.left = Math.min(nextX, cue.right - 4);
        if (corner.includes("e")) next.right = Math.max(nextX, cue.left + 4);
        if (corner.includes("n")) next.top = Math.min(nextY, cue.bottom - 4);
        if (corner.includes("s")) next.bottom = Math.max(nextY, cue.top + 4);
        next.x = next.left;
        next.y = next.top;
        return next;
      }));
    };
    const up = () => {
      if (moved) {
        pushUndo(snapshot);
        markDirty();
        suppressNextSvgClickRef.current = true;
        setTimeout(() => { suppressNextSvgClickRef.current = false; }, 0);
      }
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const exportPDF = async () => {
    if (!pdfBytes) {
      showToast("Load a PDF first.", "error");
      return false;
    }

    try {
      const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBytes));
      if (notesPageSide !== "off") {
        for (let pageIndex = pdfDoc.getPageCount() - 1; pageIndex >= 0; pageIndex -= 1) {
          const { width, height } = pdfDoc.getPage(pageIndex).getSize();
          const insertAt = notesPageSide === "left" ? pageIndex : pageIndex + 1;
          pdfDoc.insertPage(insertAt, [width, height]);
        }
      }
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const textBoxFonts = await Promise.all([
        StandardFonts.Helvetica, StandardFonts.HelveticaBold,
        StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique,
      ].map((name) => pdfDoc.embedFont(name)));
      const textBoxFont = (format) => textBoxFonts[(format.bold ? 1 : 0) + (format.italic ? 2 : 0)];

      cues.forEach((cue) => {
        if (hiddenCueTypes[cue.type]) return;
        const pageInfo = pages[cue.page];

        if (!pageInfo) return;

        const documentPageIndex = notesPageSide === "off"
          ? cue.page
          : cue.page * 2 + (notesPageSide === "left" ? 1 : 0);
        const targets = [{ pageIndex: documentPageIndex, xOffset: 0 }];
        if (notesPageSide !== "off") {
          targets.push({
            pageIndex: cue.page * 2 + (notesPageSide === "left" ? 0 : 1),
            xOffset: notesPageSide === "left" ? pageInfo.width : -pageInfo.width,
          });
        }

        targets.forEach(({ pageIndex: targetPageIndex, xOffset }) => {
        const page = pdfDoc.getPage(targetPageIndex);
        const baseViewport = pageInfo.viewport;
        const viewport = {
          convertToPdfPoint: (x, y) => baseViewport.convertToPdfPoint(x + xOffset, y),
        };
        const cueProperties = getCueProperties(cue);
        const cueStyle = cueProperties.style;
        const cueText = getCueDisplayText(cue);

        const hex = cueProperties.color;
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const color = rgb(r, g, b);

        if (isBlockCue(cue.type)) {
          const [pdfLeft, pdfBottom] = viewport.convertToPdfPoint(cue.left, cue.bottom);
          const [pdfRight, pdfTop] = viewport.convertToPdfPoint(cue.right, cue.top);
          const [labelX, labelY] = viewport.convertToPdfPoint(cue.left, cue.top - 6);
          const cueBlockAppearance = cueProperties.blockAppearance;
          const fillHex = cueBlockAppearance.fillColor;
          const fillColor = rgb(
            parseInt(fillHex.slice(1, 3), 16) / 255,
            parseInt(fillHex.slice(3, 5), 16) / 255,
            parseInt(fillHex.slice(5, 7), 16) / 255
          );
          const rectangleOptions = {
            x: Math.min(pdfLeft, pdfRight),
            y: Math.min(pdfBottom, pdfTop),
            width: Math.abs(pdfRight - pdfLeft),
            height: Math.abs(pdfTop - pdfBottom),
          };
          if (cueBlockAppearance.fillEnabled) {
            rectangleOptions.color = fillColor;
            rectangleOptions.opacity = cueBlockAppearance.fillOpacity;
          }
          if (cueBlockAppearance.lineEnabled) {
            rectangleOptions.borderColor = color;
            const [widthStart] = viewport.convertToPdfPoint(0, 0);
            const [widthEnd] = viewport.convertToPdfPoint(cueStyle.lineWidth, 0);
            rectangleOptions.borderWidth = Math.abs(widthEnd - widthStart);
          }
          if (cueBlockAppearance.fillEnabled || cueBlockAppearance.lineEnabled) {
            page.drawRectangle(rectangleOptions);
          }
          if (cue.type === "TEXTBOX") {
            const [originX] = viewport.convertToPdfPoint(0, 0);
            const [unitX] = viewport.convertToPdfPoint(1, 0);
            const scale = Math.abs(unitX - originX);
            const layout = layoutTextBox(cue, cueStyle.textSize, measureTextBox);
            layout.lines.forEach((line, row) => line.forEach((char) => {
              const [x, y] = viewport.convertToPdfPoint(cue.left + 6 + char.x, cue.top + 6 + cueStyle.textSize + row * cueStyle.textSize * 1.25);
              page.drawText(char.text, { x, y, size: cueStyle.textSize * scale, font: textBoxFont(char), color });
              for (const offset of [char.underline ? -0.12 : null, char.strike ? 0.3 : null]) {
                if (offset === null) continue;
                const lineY = y + cueStyle.textSize * scale * offset;
                page.drawLine({ start: { x, y: lineY }, end: { x: x + char.width * scale, y: lineY }, color, thickness: Math.max(0.5, cueStyle.textSize * scale / 16) });
              }
            }));
            return;
          }
          page.drawText(cueText, {
            x: labelX,
            y: labelY,
            size: cueStyle.textSize,
            font,
            color,
          });
          return;
        }

        if (cue.type === "FADE") {
          const [startX, startY] = viewport.convertToPdfPoint(cue.x, cue.y);
          const [endX, endY] = viewport.convertToPdfPoint(cue.x2, cue.y2);
          const fadeText = getFadeTextPosition(cue, cueStyle.textSize);
          const [textCenterX, textY] = viewport.convertToPdfPoint(fadeText.x, fadeText.y);
          const textWidth = font.widthOfTextAtSize(cueText, cueStyle.textSize);
          const [lineWidthStartX] = viewport.convertToPdfPoint(0, 0);
          const [lineWidthEndX] = viewport.convertToPdfPoint(cueStyle.lineWidth, 0);

          page.drawLine({
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            color,
            thickness: Math.abs(lineWidthEndX - lineWidthStartX),
            lineCap: LineCapStyle.Projecting,
          });
          page.drawText(cueText, {
            x: textCenterX - textWidth / 2,
            y: textY,
            size: cueStyle.textSize,
            font,
            color,
          });
          return;
        }

        if (isFreeCue(cue.type)) {
          const [textX, textY] = viewport.convertToPdfPoint(cue.x, cue.y);

          page.drawText(cueText, {
            x: textX,
            y: textY,
            size: cueStyle.textSize,
            font,
            color,
          });

          return;
        }

        const marginX = cueProperties.margin;
        const marginCueLayout = getMarginCueLayout(cue, marginX, cueStyle);
        const lineHeight = marginCueLayout.markerHalfHeight;

        const [vTopX, vTopY] = viewport.convertToPdfPoint(
          cue.x,
          cue.y - lineHeight
        );

        const [vBottomX, vBottomY] = viewport.convertToPdfPoint(
          cue.x,
          cue.y + lineHeight
        );

        const [hStartX, hStartY] = viewport.convertToPdfPoint(
          cue.x,
          marginCueLayout.lineY
        );

        const [hEndX, hEndY] = viewport.convertToPdfPoint(
          marginX,
          marginCueLayout.lineY
        );

        const [textAnchorX, textY] = viewport.convertToPdfPoint(
          marginCueLayout.textX,
          marginCueLayout.textY
        );
        const textWidth = font.widthOfTextAtSize(cueText, cueStyle.textSize);
        const textX = marginCueLayout.textAnchor === "end" ? textAnchorX - textWidth : textAnchorX;

        const [lineWidthStartX] = viewport.convertToPdfPoint(0, 0);
        const [lineWidthEndX] = viewport.convertToPdfPoint(
          cueStyle.lineWidth,
          0
        );
        const pdfLineWidth = Math.abs(lineWidthEndX - lineWidthStartX);

        if (hasLines(cue.type)) {
          const cueLineVisible = cueStyle.viewCueLine !== false;
          const cuePointVisible = cueLineVisible && cueStyle.viewCuePoint !== false;
          if (cuePointVisible) {
            page.drawLine({
              start: { x: vTopX, y: vTopY },
              end: { x: vBottomX, y: vBottomY },
              color,
              thickness: pdfLineWidth,
              lineCap: LineCapStyle.Projecting,
            });
          }

          if (cueLineVisible) {
            page.drawLine({
              start: { x: hStartX, y: hStartY },
              end: { x: hEndX, y: hEndY },
              color,
              thickness: pdfLineWidth,
              lineCap: LineCapStyle.Projecting,
            });
          }
        }

        page.drawText(cueText, {
          x: textX,
          y: textY,
          size: cueStyle.textSize,
          font,
          color,
        });
        });
      });

      if (dividers.length > 0 || headers.length > 0) {
        pages.forEach((pageInfo, sourcePageIndex) => {
          const callingPageIndex = sourcePageIndex * 2
            + (notesPageSide === "left" ? 0 : 1);
          const pdfPageIndex = notesPageSide === "off"
            ? sourcePageIndex
            : sourcePageIndex * 2 + (notesPageSide === "left" ? 1 : 0);
          const [widthStart] = pageInfo.viewport.convertToPdfPoint(0, 0);
          const [widthEnd] = pageInfo.viewport.convertToPdfPoint(dividerAppearance.lineWidth, 0);
          const hex = dividerAppearance.color;
          const dividerColor = rgb(
            parseInt(hex.slice(1, 3), 16) / 255,
            parseInt(hex.slice(3, 5), 16) / 255,
            parseInt(hex.slice(5, 7), 16) / 255
          );

          dividers
            .filter((divider) => isUnitPosition(divider.position)
              && (divider.surface === "pdf" || notesPageSide !== "off"))
            .forEach((divider) => {
            const targetPage = pdfDoc.getPage(divider.surface === "pdf" ? pdfPageIndex : callingPageIndex);
            const x = divider.position * pageInfo.width;
            const [topX, topY] = pageInfo.viewport.convertToPdfPoint(x, 0);
            const [bottomX, bottomY] = pageInfo.viewport.convertToPdfPoint(x, pageInfo.height);
            targetPage.drawLine({
              start: { x: topX, y: topY },
              end: { x: bottomX, y: bottomY },
              color: dividerColor,
              thickness: Math.abs(widthEnd - widthStart),
            });
          });

          const headerHex = headerAppearance.color;
          const headerColor = rgb(
            parseInt(headerHex.slice(1, 3), 16) / 255,
            parseInt(headerHex.slice(3, 5), 16) / 255,
            parseInt(headerHex.slice(5, 7), 16) / 255
          );
          headers
            .filter((header) => isUnitPosition(header.x) && isUnitPosition(header.y)
              && (header.surface === "pdf" || notesPageSide !== "off"))
            .forEach((header) => {
              const targetPage = pdfDoc.getPage(header.surface === "pdf" ? pdfPageIndex : callingPageIndex);
              const [textX, textY] = pageInfo.viewport.convertToPdfPoint(
                header.x * pageInfo.width,
                header.y * pageInfo.height
              );
              const textWidth = font.widthOfTextAtSize(header.text, headerAppearance.textSize);
              targetPage.drawText(header.text, {
                x: textX - textWidth / 2,
                y: textY - headerAppearance.textSize / 2,
                size: headerAppearance.textSize,
                font,
                color: headerColor,
              });
            });
        });
      }

      const bytes = await pdfDoc.save();

      const savedName = await writePdfFileAs(
        bytes,
        `${getSafeProjectName(documentName)}.pdf`
      );
      if (!savedName) return false;
      showToast(`PDF exported successfully as "${savedName}".`, "success");
      return true;
    } catch (err) {
      console.error("EXPORT ERROR:", err);
      showToast("Export failed. Check the console.", "error");
      return false;
    }
  };

  const updateSelectedStyle = (property, value) => {
    setStyles((current) => ({
      ...current,
      [mode]: {
        ...current[mode],
        [property]: value,
      },
    }));
    markDirty();
  };

  const updateSelectedColor = (value) => {
    setColors((current) => ({
      ...current,
      [mode]: value,
    }));
    markDirty();
  };

  const updateCueSelection = (cueId, additive) => {
    setSelectedDividerId(null);
    setSelectedHeaderId(null);
    if (!additive) {
      setSelectedCueId(cueId);
      cueSelectionAnchorRef.current = cueId;
      return;
    }
    setSelectedCueIds((current) => {
      const next = current.includes(cueId) ? current.filter((id) => id !== cueId) : [...current, cueId];
      setSelectedCueIdState(next.at(-1) || null);
      cueSelectionAnchorRef.current = cueId;
      return next;
    });
  };

  const selectCueListRange = (cueId, preserveExisting = false) => {
    const anchorId = cueSelectionAnchorRef.current || selectedCueId;
    const anchorIndex = filteredCues.findIndex((cue) => cue.id === anchorId);
    const targetIndex = filteredCues.findIndex((cue) => cue.id === cueId);
    if (anchorIndex < 0 || targetIndex < 0) {
      updateCueSelection(cueId, preserveExisting);
      return;
    }
    const [start, end] = [anchorIndex, targetIndex].sort((a, b) => a - b);
    const rangeIds = filteredCues.slice(start, end + 1).map((cue) => cue.id);
    setSelectedCueIds((current) => preserveExisting ? [...new Set([...current, ...rangeIds])] : rangeIds);
    setSelectedCueIdState(cueId);
  };

  const jumpToCue = (cue, event) => {
    setCurrentPage(cue.page);
    setSelectedDividerId(null);
    setSelectedHeaderId(null);
    if (event?.shiftKey) selectCueListRange(cue.id, Boolean(event.ctrlKey || event.metaKey));
    else updateCueSelection(cue.id, Boolean(event?.ctrlKey || event?.metaKey));
    cueRefs.current[cue.id]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const selectCueFromClick = (e, cueId) => {
    e.stopPropagation();
    if (suppressNextSvgClickRef.current) {
      suppressNextSvgClickRef.current = false;
      return;
    }
    updateCueSelection(cueId, e.ctrlKey || e.metaKey);
  };

  const getCueSelectionBounds = (cue) => {
    if (isBlockCue(cue.type)) return { left: cue.left, right: cue.right, top: cue.top, bottom: cue.bottom };
    if (cue.type === "FADE") return { left: Math.min(cue.x, cue.x2), right: Math.max(cue.x, cue.x2), top: Math.min(cue.y, cue.y2), bottom: Math.max(cue.y, cue.y2) };
    if (isMarginCue(cue.type)) {
      const properties = getCueProperties(cue);
      const halfHeight = (properties.style.markerHeight || DEFAULT_CUE_MARKER_HEIGHT) / 2;
      return { left: Math.min(cue.x, properties.margin), right: Math.max(cue.x, properties.margin), top: cue.y - halfHeight, bottom: cue.y + halfHeight + properties.style.textSize };
    }
    const textWidth = Math.max(18, getCueDisplayText(cue).length * (getCueProperties(cue).style.textSize * 0.6));
    return { left: cue.x, right: cue.x + textWidth, top: cue.y - getCueProperties(cue).style.textSize, bottom: cue.y + 4 };
  };

  const startMarqueeSelection = (event, pageIndex, documentOffset) => {
    if (mode !== "POINTER" || event.target !== event.currentTarget || event.button !== 0) return;
    event.preventDefault();
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const toPoint = (clientX, clientY) => ({
      x: (clientX - rect.left) * (svg.viewBox.baseVal.width / rect.width) - documentOffset,
      y: (clientY - rect.top) * (svg.viewBox.baseVal.height / rect.height),
    });
    const start = toPoint(event.clientX, event.clientY);
    const preserveExisting = event.ctrlKey || event.metaKey || event.shiftKey;
    let moved = false;
    setSelectionBox({ page: pageIndex, x1: start.x, y1: start.y, x2: start.x, y2: start.y });
    const move = (moveEvent) => {
      const point = toPoint(moveEvent.clientX, moveEvent.clientY);
      moved = moved || Math.abs(point.x - start.x) > 3 || Math.abs(point.y - start.y) > 3;
      setSelectionBox({ page: pageIndex, x1: start.x, y1: start.y, x2: point.x, y2: point.y });
    };
    const up = (upEvent) => {
      const end = toPoint(upEvent.clientX, upEvent.clientY);
      setSelectionBox(null);
      if (moved) {
        const box = { left: Math.min(start.x, end.x), right: Math.max(start.x, end.x), top: Math.min(start.y, end.y), bottom: Math.max(start.y, end.y) };
        const marqueeIds = cues.filter((cue) => cue.page === pageIndex && !hiddenCueTypes[cue.type]).filter((cue) => {
          const bounds = getCueSelectionBounds(cue);
          return bounds.right >= box.left && bounds.left <= box.right && bounds.bottom >= box.top && bounds.top <= box.bottom;
        }).map((cue) => cue.id);
        setSelectedCueIds((current) => preserveExisting ? [...new Set([...current, ...marqueeIds])] : marqueeIds);
        setSelectedCueIdState(marqueeIds.at(-1) || (preserveExisting ? selectedCueId : null));
        if (marqueeIds.length) cueSelectionAnchorRef.current = marqueeIds.at(-1);
        suppressNextSvgClickRef.current = true;
      } else if (!preserveExisting) {
        setSelectedCueId(null);
      }
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const filteredCues = cues
    .filter((cue) => {
      if (cueTypeFilters[cue.type] === false) return false;
      if (showCustomCuesOnly && !cue.customPropertiesEnabled) return false;

      const q = deferredSearch.toLowerCase();

      return (
        getCueDisplayText(cue).toLowerCase().includes(q) ||
        cue.type.toLowerCase().includes(q) ||
        getDisplayCueTypeName(cue.type).toLowerCase().includes(q) ||
        getDisplayCueTypeLabel(cue.type).toLowerCase().includes(q) ||
        String(cue.page + 1).includes(q)
      );
    })
    .sort((a, b) => {
      if (a.page !== b.page) {
        return a.page - b.page;
      }

      if (Math.abs(a.y - b.y) > 1) {
        return a.y - b.y;
      }

      return a.x - b.x;
    });

  const toggleCueTypeFilter = (type) => {
    setCueTypeFilters((current) => ({
      ...current,
      [type]: !current[type],
    }));
  };

  const showAllCueTypes = () => {
    setCueTypeFilters(
      Object.fromEntries(
        availableCueTypes.map((type) => [type, true])
      )
    );
  };

  const hideAllCueTypes = () => {
    setCueTypeFilters(
      Object.fromEntries(
        availableCueTypes.map((type) => [type, false])
      )
    );
  };

  const renderCueTypeOptions = (type) => {
    const customDefinition = getCustomCueDefinition(type);
    const typeBlockAppearance = customDefinition?.blockAppearance || blockAppearance;
    const typeAffixes = customDefinition || styles[type] || {};
    const appDefaultStyle = DEFAULT_STYLES[type];
    const isBuiltInType = ALL_CUE_TYPES.includes(type);
    const typeResetButton = (propertyName, onReset, isAtDefault) => isBuiltInType ? (
      <button type="button" className="inspector-property-reset" title={isAtDefault ? `${propertyName} already matches the app default` : `Reset ${propertyName} to app default`} aria-label={`Reset ${propertyName} to app default`} disabled={isAtDefault} onClick={onReset}>
        <MaterialIcon path={mdiArrowULeftTop} />
      </button>
    ) : null;
    const updateTypeBlockAppearance = (updates) => {
      pushUndo();
      const definition = getCustomCueDefinition(type);
      if (definition) {
        setCustomCueTypes((current) => current.map((item) => item.id === type
          ? { ...item, blockAppearance: { ...item.blockAppearance, ...updates } }
          : item));
      } else {
        setBlockAppearance((current) => ({ ...current, ...updates }));
      }
      markDirty();
    };
    const updateTypeAffix = (property, value) => {
      pushUndo();
      if (customDefinition) {
        setCustomCueTypes((current) => current.map((item) => item.id === type ? { ...item, [property]: value } : item));
      } else {
        setStyles((current) => ({ ...current, [type]: { ...current[type], [property]: value } }));
      }
      markDirty();
    };
    return (
    <div className="accordion-options" style={{ "--cue-color": colors[type] }}>
      <label><span>Lock all {getDisplayCueTypeName(type)} cues</span><input type="checkbox" checked={Boolean(lockedCueTypes[type])} onChange={(event) => { pushUndo(); setLockedCueTypes((current) => ({ ...current, [type]: event.target.checked })); markDirty(); }} /></label>
      {type === "FADE" && <p>{fadeStart ? "Click the fade end point" : "Click the fade start point"}</p>}
      {isBlockCue(type) && <p>{blockStart ? "Click the opposite corner" : "Click the first corner"}</p>}

      {(customDefinition || MARGIN_CUE_TYPES.includes(type)) && <>
        <label>Text prefix <span className="cue-option-control"><input className="cue-affix-input" type="text" value={typeAffixes.prefix || ""} placeholder="None" onChange={(event) => updateTypeAffix("prefix", event.target.value)} />{typeResetButton("text prefix", () => updateTypeAffix("prefix", ""), !typeAffixes.prefix)}</span></label>
        <label>Text suffix <span className="cue-option-control"><input className="cue-affix-input" type="text" value={typeAffixes.suffix || ""} placeholder="None" onChange={(event) => updateTypeAffix("suffix", event.target.value)} />{typeResetButton("text suffix", () => updateTypeAffix("suffix", ""), !typeAffixes.suffix)}</span></label>
      </>}

      {!isBlockCue(type) && (
        <label>
          Colour
          <span className="cue-option-control"><PaletteColorInput
            value={colors[type]}
            onCommit={(value) => {
              setColors((current) => ({ ...current, [type]: value }));
              markDirty();
            }}
          />{typeResetButton("colour", () => { setColors((current) => ({ ...current, [type]: DEFAULT_COLORS[type] })); markDirty(); }, colors[type] === DEFAULT_COLORS[type])}</span>
        </label>
      )}

      {isBlockCue(type) && (
        <>
          <label>Line <span className="cue-option-control"><PaletteColorInput value={colors[type]} disabled={!typeBlockAppearance.lineEnabled} onCommit={(value) => { setColors((current) => ({ ...current, [type]: value })); markDirty(); }} />{typeResetButton("line colour", () => { setColors((current) => ({ ...current, [type]: DEFAULT_COLORS[type] })); markDirty(); }, colors[type] === DEFAULT_COLORS[type])}</span></label>
          <label><span>No line</span><span className="cue-option-control"><input type="checkbox" checked={!typeBlockAppearance.lineEnabled} onChange={(e) => updateTypeBlockAppearance({ lineEnabled: !e.target.checked })} />{typeResetButton("line visibility", () => updateTypeBlockAppearance({ lineEnabled: DEFAULT_BLOCK_APPEARANCE.lineEnabled }), typeBlockAppearance.lineEnabled === DEFAULT_BLOCK_APPEARANCE.lineEnabled)}</span></label>
          <label>Fill <span className="cue-option-control"><PaletteColorInput value={typeBlockAppearance.fillColor} disabled={!typeBlockAppearance.fillEnabled} onCommit={(value) => updateTypeBlockAppearance({ fillColor: value })} />{typeResetButton("fill colour", () => updateTypeBlockAppearance({ fillColor: DEFAULT_BLOCK_APPEARANCE.fillColor }), typeBlockAppearance.fillColor === DEFAULT_BLOCK_APPEARANCE.fillColor)}</span></label>
          <label><span>No fill</span><span className="cue-option-control"><input type="checkbox" checked={!typeBlockAppearance.fillEnabled} onChange={(e) => updateTypeBlockAppearance({ fillEnabled: !e.target.checked })} />{typeResetButton("fill visibility", () => updateTypeBlockAppearance({ fillEnabled: DEFAULT_BLOCK_APPEARANCE.fillEnabled }), typeBlockAppearance.fillEnabled === DEFAULT_BLOCK_APPEARANCE.fillEnabled)}</span></label>
          <label>
            Fill opacity
            <span className="cue-option-control"><span className="option-slider"><input type="range" min="0" max="1" step="0.05" value={typeBlockAppearance.fillOpacity} disabled={!typeBlockAppearance.fillEnabled} onChange={(e) => updateTypeBlockAppearance({ fillOpacity: parseFloat(e.target.value) })} />{Math.round(typeBlockAppearance.fillOpacity * 100)}%</span>{typeResetButton("fill opacity", () => updateTypeBlockAppearance({ fillOpacity: DEFAULT_BLOCK_APPEARANCE.fillOpacity }), typeBlockAppearance.fillOpacity === DEFAULT_BLOCK_APPEARANCE.fillOpacity)}</span>
          </label>
        </>
      )}

      {isMarginCue(type) && (
        <label>
          Margin
          <span className="cue-option-control"><span className="option-slider"><input type="range" min="0" max="600" value={margins[type]} onChange={(e) => { setMargins((current) => ({ ...current, [type]: parseInt(e.target.value, 10) })); markDirty(); }} />{Math.round(margins[type])}</span>{typeResetButton("margin", () => { setMargins((current) => ({ ...current, [type]: DEFAULT_MARGINS[type] })); markDirty(); }, margins[type] === DEFAULT_MARGINS[type])}</span>
        </label>
      )}

      {isPointCue(type) && (
        <>
          <label>
            <span>View Cue Line</span>
            <span className="cue-option-control"><input type="checkbox" checked={styles[type].viewCueLine !== false} onChange={(e) => { setStyles((current) => ({ ...current, [type]: { ...current[type], viewCueLine: e.target.checked } })); markDirty(); }} />{typeResetButton("cue line visibility", () => { setStyles((current) => ({ ...current, [type]: { ...current[type], viewCueLine: appDefaultStyle.viewCueLine } })); markDirty(); }, styles[type].viewCueLine === appDefaultStyle?.viewCueLine)}</span>
          </label>
          <label className={styles[type].viewCueLine === false ? "is-disabled" : ""}>
            <span>View Cue Point</span>
            <span className="cue-option-control"><input type="checkbox" checked={styles[type].viewCuePoint !== false} disabled={styles[type].viewCueLine === false} onChange={(e) => { setStyles((current) => ({ ...current, [type]: { ...current[type], viewCuePoint: e.target.checked } })); markDirty(); }} />{typeResetButton("cue point visibility", () => { setStyles((current) => ({ ...current, [type]: { ...current[type], viewCuePoint: appDefaultStyle.viewCuePoint } })); markDirty(); }, styles[type].viewCuePoint === appDefaultStyle?.viewCuePoint)}</span>
          </label>
          <label>
            Text position
            <span className="cue-option-control"><select value={styles[type].textPosition || "above"} onChange={(e) => { setStyles((current) => ({ ...current, [type]: { ...current[type], textPosition: e.target.value } })); markDirty(); }}>
              <option value="above">Above cue line</option>
              <option value="below">Below cue line</option>
            </select>{typeResetButton("text position", () => { setStyles((current) => ({ ...current, [type]: { ...current[type], textPosition: appDefaultStyle.textPosition } })); markDirty(); }, styles[type].textPosition === appDefaultStyle?.textPosition)}</span>
          </label>
          <label>
            Cue line position
            <span className="cue-option-control"><select value={styles[type].cueLinePosition || "below"} onChange={(e) => { setStyles((current) => ({ ...current, [type]: { ...current[type], cueLinePosition: e.target.value } })); markDirty(); }}>
              <option value="above">Above vertical cue line</option>
              <option value="below">Below vertical cue line</option>
            </select>{typeResetButton("cue line position", () => { setStyles((current) => ({ ...current, [type]: { ...current[type], cueLinePosition: appDefaultStyle.cueLinePosition } })); markDirty(); }, styles[type].cueLinePosition === appDefaultStyle?.cueLinePosition)}</span>
          </label>
          <label>
            Cue position
            <span className="cue-option-control"><select value={styles[type].cueSide || "after"} onChange={(e) => { setStyles((current) => ({ ...current, [type]: { ...current[type], cueSide: e.target.value } })); markDirty(); }}>
              <option value="before">Before alignment guide</option>
              <option value="after">After alignment guide</option>
            </select>{typeResetButton("cue position", () => { setStyles((current) => ({ ...current, [type]: { ...current[type], cueSide: appDefaultStyle.cueSide } })); markDirty(); }, styles[type].cueSide === appDefaultStyle?.cueSide)}</span>
          </label>
          <label>
            Vertical marker height
            <span className="cue-option-control"><span className="option-slider"><input type="range" min="4" max="100" step="2" value={styles[type].markerHeight || DEFAULT_CUE_MARKER_HEIGHT} onChange={(e) => { setStyles((current) => ({ ...current, [type]: { ...current[type], markerHeight: parseFloat(e.target.value) } })); markDirty(); }} />{styles[type].markerHeight || DEFAULT_CUE_MARKER_HEIGHT}</span>{typeResetButton("vertical marker height", () => { setStyles((current) => ({ ...current, [type]: { ...current[type], markerHeight: appDefaultStyle.markerHeight } })); markDirty(); }, styles[type].markerHeight === appDefaultStyle?.markerHeight)}</span>
          </label>
        </>
      )}

      <label>
        Text size
        <span className="cue-option-control"><span className="option-slider"><input type="range" min="6" max="28" step="1" value={styles[type].textSize} onChange={(e) => { setStyles((current) => ({ ...current, [type]: { ...current[type], textSize: parseFloat(e.target.value) } })); markDirty(); }} />{styles[type].textSize}</span>{typeResetButton("text size", () => { setStyles((current) => ({ ...current, [type]: { ...current[type], textSize: appDefaultStyle.textSize } })); markDirty(); }, styles[type].textSize === appDefaultStyle?.textSize)}</span>
      </label>

      {(hasLines(type) || isBlockCue(type)) && (
        <label>
          Line width
          <span className="cue-option-control"><span className="option-slider"><input type="range" min="0.5" max="8" step="0.5" value={styles[type].lineWidth} onChange={(e) => { setStyles((current) => ({ ...current, [type]: { ...current[type], lineWidth: roundLineWidth(e.target.value) } })); markDirty(); }} /><output>{formatLineWidth(styles[type].lineWidth)}</output></span>{typeResetButton("line width", () => { setStyles((current) => ({ ...current, [type]: { ...current[type], lineWidth: appDefaultStyle.lineWidth } })); markDirty(); }, styles[type].lineWidth === appDefaultStyle?.lineWidth)}</span>
        </label>
      )}
      <button
        type="button"
        className="reset-cue-properties-button"
        onClick={async () => {
          if (!await requestAppDialog({ type: "confirm", title: `Reset ${getDisplayCueTypeName(type)} cues?`, message: `Reset every ${getDisplayCueTypeName(type)} cue to the cue type properties? This will clear their saved custom properties.`, confirmLabel: "Reset cues", danger: true })) return;
          setCues((current) => current.map((cue) => cue.type === type
            ? { ...cue, customPropertiesEnabled: false, customProperties: undefined }
            : cue));
          markDirty();
        }}
      >
        Reset all {getDisplayCueTypeName(type)} cues to type properties
      </button>
    </div>
    );
  };

  const renderInspectorProperties = (cue) => {
    const properties = getCueProperties(cue);
    const typeProperties = getTypeProperties(cue.type);
    const cueStyle = properties.style;
    const cueBlockAppearance = properties.blockAppearance;
    const updateRoot = (key, value) => setCuePropertyOverride(cue.id, null, key, value);
    const updateStyle = (key, value) => setCuePropertyOverride(cue.id, "style", key, value);
    const updateBlock = (key, value) => setCuePropertyOverride(cue.id, "blockAppearance", key, value);
    const resetButton = (propertyName, onReset, isAtTypeValue) => (
      <button type="button" className="inspector-property-reset" title={isAtTypeValue ? `${propertyName} already matches the cue type value` : `Reset ${propertyName} to cue type value`} aria-label={`Reset ${propertyName} to cue type value`} disabled={isAtTypeValue} onClick={onReset}>
        <MaterialIcon path={mdiArrowULeftTop} />
      </button>
    );

    return (
      <fieldset className="inspector-properties" disabled={Boolean(lockedCueTypes[cue.type])}>
        {!isBlockCue(cue.type) ? (
          <label><span>Colour</span><PaletteColorInput value={properties.color} onCommit={(value) => updateRoot("color", value)} />{resetButton("colour", () => updateRoot("color", typeProperties.color), properties.color === typeProperties.color)}</label>
        ) : (
          <>
            <label><span>{cue.type === "TEXTBOX" ? "Text / line colour" : "Line"}</span><PaletteColorInput value={properties.color} disabled={cue.type !== "TEXTBOX" && !cueBlockAppearance.lineEnabled} onCommit={(value) => updateRoot("color", value)} />{resetButton("line colour", () => updateRoot("color", typeProperties.color), properties.color === typeProperties.color)}</label>
            <label><span>No line</span><input type="checkbox" checked={!cueBlockAppearance.lineEnabled} onChange={(e) => updateBlock("lineEnabled", !e.target.checked)} />{resetButton("line visibility", () => updateBlock("lineEnabled", typeProperties.blockAppearance.lineEnabled), cueBlockAppearance.lineEnabled === typeProperties.blockAppearance.lineEnabled)}</label>
            <label><span>Fill</span><PaletteColorInput value={cueBlockAppearance.fillColor} disabled={!cueBlockAppearance.fillEnabled} onCommit={(value) => updateBlock("fillColor", value)} />{resetButton("fill colour", () => updateBlock("fillColor", typeProperties.blockAppearance.fillColor), cueBlockAppearance.fillColor === typeProperties.blockAppearance.fillColor)}</label>
            <label><span>No fill</span><input type="checkbox" checked={!cueBlockAppearance.fillEnabled} onChange={(e) => updateBlock("fillEnabled", !e.target.checked)} />{resetButton("fill visibility", () => updateBlock("fillEnabled", typeProperties.blockAppearance.fillEnabled), cueBlockAppearance.fillEnabled === typeProperties.blockAppearance.fillEnabled)}</label>
            <label><span>Fill opacity</span><span className="option-slider"><input type="range" min="0" max="1" step="0.05" value={cueBlockAppearance.fillOpacity} disabled={!cueBlockAppearance.fillEnabled} onChange={(e) => updateBlock("fillOpacity", parseFloat(e.target.value))} />{Math.round(cueBlockAppearance.fillOpacity * 100)}%</span>{resetButton("fill opacity", () => updateBlock("fillOpacity", typeProperties.blockAppearance.fillOpacity), cueBlockAppearance.fillOpacity === typeProperties.blockAppearance.fillOpacity)}</label>
          </>
        )}
        {isMarginCue(cue.type) && (
          <label><span>Margin</span><span className="option-slider"><input type="range" min="0" max="600" value={properties.margin} onChange={(e) => updateRoot("margin", parseInt(e.target.value, 10))} />{Math.round(properties.margin)}</span>{resetButton("margin", () => updateRoot("margin", typeProperties.margin), properties.margin === typeProperties.margin)}</label>
        )}
        {isPointCue(cue.type) && (
          <>
            <label><span>View Cue Line</span><input type="checkbox" checked={cueStyle.viewCueLine !== false} onChange={(e) => updateStyle("viewCueLine", e.target.checked)} />{resetButton("cue line visibility", () => updateStyle("viewCueLine", typeProperties.style.viewCueLine !== false), (cueStyle.viewCueLine !== false) === (typeProperties.style.viewCueLine !== false))}</label>
            <label className={cueStyle.viewCueLine === false ? "is-disabled" : ""}><span>View Cue Point</span><input type="checkbox" checked={cueStyle.viewCuePoint !== false} disabled={cueStyle.viewCueLine === false} onChange={(e) => updateStyle("viewCuePoint", e.target.checked)} />{resetButton("cue point visibility", () => updateStyle("viewCuePoint", typeProperties.style.viewCuePoint !== false), (cueStyle.viewCuePoint !== false) === (typeProperties.style.viewCuePoint !== false))}</label>
            <label><span>Text position</span><select value={cueStyle.textPosition || "above"} onChange={(e) => updateStyle("textPosition", e.target.value)}><option value="above">Above cue line</option><option value="below">Below cue line</option></select>{resetButton("text position", () => updateStyle("textPosition", typeProperties.style.textPosition || "above"), (cueStyle.textPosition || "above") === (typeProperties.style.textPosition || "above"))}</label>
            <label><span>Cue line position</span><select value={cueStyle.cueLinePosition || "below"} onChange={(e) => updateStyle("cueLinePosition", e.target.value)}><option value="above">Above vertical cue line</option><option value="below">Below vertical cue line</option></select>{resetButton("cue line position", () => updateStyle("cueLinePosition", typeProperties.style.cueLinePosition || "below"), (cueStyle.cueLinePosition || "below") === (typeProperties.style.cueLinePosition || "below"))}</label>
            <label><span>Cue position</span><select value={cueStyle.cueSide || "after"} onChange={(e) => updateStyle("cueSide", e.target.value)}><option value="before">Before alignment guide</option><option value="after">After alignment guide</option></select>{resetButton("cue position", () => updateStyle("cueSide", typeProperties.style.cueSide || "after"), (cueStyle.cueSide || "after") === (typeProperties.style.cueSide || "after"))}</label>
            <label><span>Vertical marker height</span><span className="option-slider"><input type="range" min="4" max="100" step="2" value={cueStyle.markerHeight || DEFAULT_CUE_MARKER_HEIGHT} onChange={(e) => updateStyle("markerHeight", parseFloat(e.target.value))} />{cueStyle.markerHeight || DEFAULT_CUE_MARKER_HEIGHT}</span>{resetButton("vertical marker height", () => updateStyle("markerHeight", typeProperties.style.markerHeight || DEFAULT_CUE_MARKER_HEIGHT), (cueStyle.markerHeight || DEFAULT_CUE_MARKER_HEIGHT) === (typeProperties.style.markerHeight || DEFAULT_CUE_MARKER_HEIGHT))}</label>
          </>
        )}
        <label><span>Text size</span><span className="option-slider"><input type="range" min="6" max="28" step="1" value={cueStyle.textSize} onChange={(e) => updateStyle("textSize", parseFloat(e.target.value))} />{cueStyle.textSize}</span>{resetButton("text size", () => updateStyle("textSize", typeProperties.style.textSize), cueStyle.textSize === typeProperties.style.textSize)}</label>
        {(hasLines(cue.type) || isBlockCue(cue.type)) && (
          <label><span>Line width</span><span className="option-slider"><input type="range" min="0.5" max="8" step="0.5" value={cueStyle.lineWidth} onChange={(e) => updateStyle("lineWidth", roundLineWidth(e.target.value))} /><output>{formatLineWidth(cueStyle.lineWidth)}</output></span>{resetButton("line width", () => updateStyle("lineWidth", typeProperties.style.lineWidth), cueStyle.lineWidth === typeProperties.style.lineWidth)}</label>
        )}
      </fieldset>
    );
  };

  const renderMultiCueProperties = (selectedCues) => {
    const properties = selectedCues.map(getCueProperties);
    const allSame = (getter) => selectedCues.every((cue, index) => index === 0 || Object.is(getter(cue, properties[index]), getter(selectedCues[0], properties[0])));
    const applyOverride = (section, key, value) => {
      const selectedIds = new Set(selectedCues.map((cue) => cue.id));
      setCues((current) => current.map((cue) => {
        if (!selectedIds.has(cue.id) || lockedCueTypes[cue.type]) return cue;
        const defaults = getTypeProperties(cue.type);
        const defaultValue = section ? defaults[section][key] : defaults[key];
        const customProperties = compactCueProperties(cue.type, cue.customProperties);
        if (section) {
          const sectionOverrides = { ...(customProperties[section] || {}) };
          if (Object.is(value, defaultValue)) delete sectionOverrides[key];
          else sectionOverrides[key] = value;
          if (Object.keys(sectionOverrides).length) customProperties[section] = sectionOverrides;
          else delete customProperties[section];
        } else if (Object.is(value, defaultValue)) delete customProperties[key];
        else customProperties[key] = value;
        const hasOverrides = Object.keys(customProperties).length > 0;
        return {
          ...cue,
          customPropertiesEnabled: hasOverrides,
          customProperties: hasOverrides ? customProperties : undefined,
        };
      }));
      markDirty();
    };
    const allMarginCues = selectedCues.every((cue) => isMarginCue(cue.type));
    const allLineCues = selectedCues.every((cue) => hasLines(cue.type) || isBlockCue(cue.type));
    const allPointCues = selectedCues.every((cue) => isPointCue(cue.type));
    const allBlockCues = selectedCues.every((cue) => isBlockCue(cue.type));
    const colorMixed = !allSame((_cue, cueProperties) => cueProperties.color);
    const textSizeMixed = !allSame((_cue, cueProperties) => cueProperties.style.textSize);
    const lineWidthMixed = allLineCues && !allSame((_cue, cueProperties) => cueProperties.style.lineWidth);
    const marginMixed = allMarginCues && !allSame((_cue, cueProperties) => cueProperties.margin);

    return (
      <fieldset className="inspector-properties multi-cue-properties">
        <label><span>Colour{colorMixed ? " (Mixed)" : ""}</span><PaletteColorInput value={properties[0].color} onCommit={(value) => applyOverride(null, "color", value)} /><span /></label>
        <label><span>Text size{textSizeMixed ? " (Mixed)" : ""}</span><span className="option-slider"><input type="range" min="6" max="28" step="1" value={properties[0].style.textSize} onChange={(event) => applyOverride("style", "textSize", parseFloat(event.target.value))} />{properties[0].style.textSize}</span><span /></label>
        {allMarginCues && <label><span>Margin{marginMixed ? " (Mixed)" : ""}</span><span className="option-slider"><input type="range" min="0" max="600" value={properties[0].margin} onChange={(event) => applyOverride(null, "margin", parseInt(event.target.value, 10))} />{Math.round(properties[0].margin)}</span><span /></label>}
        {allPointCues && <>
          <label><span>View Cue Line{!allSame((_cue, cueProperties) => cueProperties.style.viewCueLine !== false) ? " (Mixed)" : ""}</span><input type="checkbox" checked={properties[0].style.viewCueLine !== false} onChange={(event) => applyOverride("style", "viewCueLine", event.target.checked)} /><span /></label>
          <label><span>View Cue Point{!allSame((_cue, cueProperties) => cueProperties.style.viewCuePoint !== false) ? " (Mixed)" : ""}</span><input type="checkbox" checked={properties[0].style.viewCuePoint !== false} onChange={(event) => applyOverride("style", "viewCuePoint", event.target.checked)} /><span /></label>
          <label><span>Text position{!allSame((_cue, cueProperties) => cueProperties.style.textPosition || "above") ? " (Mixed)" : ""}</span><select value={properties[0].style.textPosition || "above"} onChange={(event) => applyOverride("style", "textPosition", event.target.value)}><option value="above">Above cue line</option><option value="below">Below cue line</option></select><span /></label>
          <label><span>Cue line position{!allSame((_cue, cueProperties) => cueProperties.style.cueLinePosition || "below") ? " (Mixed)" : ""}</span><select value={properties[0].style.cueLinePosition || "below"} onChange={(event) => applyOverride("style", "cueLinePosition", event.target.value)}><option value="above">Above marker</option><option value="below">Below marker</option></select><span /></label>
          <label><span>Cue position{!allSame((_cue, cueProperties) => cueProperties.style.cueSide || "after") ? " (Mixed)" : ""}</span><select value={properties[0].style.cueSide || "after"} onChange={(event) => applyOverride("style", "cueSide", event.target.value)}><option value="before">Before guide</option><option value="after">After guide</option></select><span /></label>
          <label><span>Marker height{!allSame((_cue, cueProperties) => cueProperties.style.markerHeight || DEFAULT_CUE_MARKER_HEIGHT) ? " (Mixed)" : ""}</span><span className="option-slider"><input type="range" min="4" max="100" step="2" value={properties[0].style.markerHeight || DEFAULT_CUE_MARKER_HEIGHT} onChange={(event) => applyOverride("style", "markerHeight", parseFloat(event.target.value))} />{properties[0].style.markerHeight || DEFAULT_CUE_MARKER_HEIGHT}</span><span /></label>
        </>}
        {allBlockCues && <>
          <label><span>Fill colour{!allSame((_cue, cueProperties) => cueProperties.blockAppearance.fillColor) ? " (Mixed)" : ""}</span><PaletteColorInput value={properties[0].blockAppearance.fillColor} onCommit={(value) => applyOverride("blockAppearance", "fillColor", value)} /><span /></label>
          <label><span>Fill enabled{!allSame((_cue, cueProperties) => cueProperties.blockAppearance.fillEnabled) ? " (Mixed)" : ""}</span><input type="checkbox" checked={properties[0].blockAppearance.fillEnabled} onChange={(event) => applyOverride("blockAppearance", "fillEnabled", event.target.checked)} /><span /></label>
        </>}
        {allLineCues && <label><span>Line width{lineWidthMixed ? " (Mixed)" : ""}</span><span className="option-slider"><input type="range" min="0.5" max="8" step="0.5" value={properties[0].style.lineWidth} onChange={(event) => applyOverride("style", "lineWidth", roundLineWidth(event.target.value))} /><output>{formatLineWidth(properties[0].style.lineWidth)}</output></span><span /></label>}
      </fieldset>
    );
  };

  const beginEditingDocumentName = () => {
    setDocumentNameDraft(documentName);
    setIsEditingDocumentName(true);
  };

  const commitDocumentName = () => {
    const nextName = documentNameDraft.trim() || "Untitled";
    if (nextName !== documentName) {
      setDocumentName(nextName);
      markDirty();
    }
    setIsEditingDocumentName(false);
  };

  const beginEditingCueName = (cue) => {
    if (cue.type === "TEXTBOX") {
      setSelectedCueId(cue.id);
      setShowInspector(true);
      return;
    }
    setCueNameDraft(cue.label);
    setEditingCueId(cue.id);
  };

  const commitCueName = (cue) => {
    const nextName = cueNameDraft.trim() || cue.label;
    if (nextName !== cue.label) {
      pushUndo(cues);
      setCues((current) => current.map((item) =>
        item.id === cue.id ? { ...item, label: nextName } : item
      ));
      markDirty();
    }
    setEditingCueId(null);
  };

  const runFileAction = async (actionName, action) => {
    if (fileActionInProgress) return;
    setFileActionInProgress(actionName);
    try {
      const completed = await action();
      if (completed) setShowFileMenu(false);
    } catch (err) {
      console.error(`${actionName} failed:`, err);
      showToast(`${actionName} failed. Check the console for details.`, "error");
    } finally {
      setFileActionInProgress(null);
    }
  };

  const isOnCallingPage = (x, width, side = notesPageSide) =>
    side === "left" ? x < 0 : side === "right" ? x > width : false;

  const callingPageHasCues = notesPageSide !== "off" && cues.some((cue) => {
    const width = pages[cue.page]?.width;
    if (!width) return false;
    const cueCoordinates = [cue.x, cue.x2, cue.left, cue.right]
      .filter((value) => typeof value === "number");
    if (cueCoordinates.some((x) => isOnCallingPage(x, width))) return true;
    return isMarginCue(cue.type) && isOnCallingPage(getCueProperties(cue).margin, width);
  });
  const callingPageHasContent = callingPageHasCues;

  const addDivider = () => {
    pushUndo();
    const dividerId = createId();
    setDividers((current) => [
      ...current,
      {
        id: dividerId,
        surface: notesPageSide === "off" ? "pdf" : "calling",
        position: 0.5,
      },
    ]);
    if (!dividersLocked) {
      setSelectedCueId(null);
      setSelectedHeaderId(null);
      setSelectedDividerId(dividerId);
    }
    markDirty();
  };

  const addHeader = () => {
    pushUndo();
    const headerId = createId();
    setHeaders((current) => [
      ...current,
      {
        id: headerId,
        surface: notesPageSide === "off" ? "pdf" : "calling",
        x: 0.5,
        y: 0.08,
        text: "Header",
      },
    ]);
    if (!dividersLocked) {
      setSelectedCueId(null);
      setSelectedDividerId(null);
      setSelectedHeaderId(headerId);
    }
    markDirty();
  };

  const removeHeader = (headerId) => {
    if (dividersLocked) return;
    pushUndo();
    setHeaders((current) => current.filter((header) => header.id !== headerId));
    setSelectedHeaderId((current) => current === headerId ? null : current);
    markDirty();
  };

  const beginEditingHeader = (header) => {
    if (dividersLocked) return;
    setSelectedCueId(null);
    setSelectedDividerId(null);
    setSelectedHeaderId(header.id);
    setHeaderTextDraft(header.text);
    setEditingHeaderId(header.id);
  };

  const editHeaderWithPrompt = async (header) => {
    if (dividersLocked) return;
    const nextText = await requestAppDialog({ type: "prompt", title: "Edit header", message: "Update the header text.", value: header.text, confirmLabel: "Save" });
    if (nextText === null || !nextText.trim()) return;
    setHeaders((current) => current.map((item) =>
      item.id === header.id ? { ...item, text: nextText.trim() } : item
    ));
    markDirty();
  };

  const commitHeaderText = (header) => {
    const nextText = headerTextDraft.trim() || header.text;
    if (nextText !== header.text) {
      setHeaders((current) => current.map((item) =>
        item.id === header.id ? { ...item, text: nextText } : item
      ));
      markDirty();
    }
    setEditingHeaderId(null);
  };

  const resetDividersAndHeaders = async () => {
    if (dividersLocked) return;
    if (!await requestAppDialog({ type: "confirm", title: "Remove dividers and headers?", message: "Remove all dividers and headers? This can be restored with Undo.", confirmLabel: "Remove all", danger: true })) return;
    pushUndo();
    setDividers([]);
    setHeaders([]);
    setSelectedDividerId(null);
    setSelectedHeaderId(null);
    setEditingHeaderId(null);
    markDirty();
  };

  const removeDivider = (dividerId) => {
    if (dividersLocked) return;
    pushUndo();
    setDividers((current) => current.filter((divider) => divider.id !== dividerId));
    setSelectedDividerId((current) => current === dividerId ? null : current);
    markDirty();
  };

  const moveCallingPageTo = (nextSide) => {
    if (notesPageSide === "off" || notesPageSide === nextSide) {
      setCallingPageSide(nextSide);
      return;
    }

    setCues((current) => current.map((cue) => {
      const width = pages[cue.page]?.width || 0;
      const shifted = { ...cue };
      const delta = notesPageSide === "left" ? width * 2 : -width * 2;
      for (const key of ["x", "x2", "left", "right"]) {
        if (typeof shifted[key] === "number" && isOnCallingPage(shifted[key], width)) {
          shifted[key] += delta;
        }
      }
      if (typeof shifted.customProperties?.margin === "number" && isOnCallingPage(shifted.customProperties.margin, width)) {
        shifted.customProperties = {
          ...shifted.customProperties,
          margin: shifted.customProperties.margin + delta,
        };
      }
      if (isBlockCue(shifted.type) && shifted.left > shifted.right) {
        [shifted.left, shifted.right] = [shifted.right, shifted.left];
        shifted.x = shifted.left;
      }
      return shifted;
    }));

    const referenceWidth = pages[0]?.width || 0;
    const delta = notesPageSide === "left" ? referenceWidth * 2 : -referenceWidth * 2;
    setMargins((current) => Object.fromEntries(
      Object.entries(current).map(([type, x]) => [
        type,
        isOnCallingPage(x, referenceWidth) ? x + delta : x,
      ])
    ));
    setNotesPageSide(nextSide);
    setCallingPageSide(nextSide);
    setSelectedCueId(null);
    setFadeStart(null);
    setBlockStart(null);
    markDirty();
  };

  const setCallingPageEnabled = (enabled) => {
    if (!enabled && callingPageHasContent) {
      showToast("The Prompt/Showcall Page cannot be disabled while it contains cues or dividers. Move or remove them first.", "error");
      return;
    }
    if (!enabled) {
      setMargins((current) => ({
        ...current,
        SFX: 150,
        TM: 100,
        DCA: 50,
      }));
    }
    setNotesPageSide(enabled ? callingPageSide : "off");
    setSelectedCueId(null);
    setFadeStart(null);
    setBlockStart(null);
    markDirty();
  };

  const addCustomCueType = () => {
    const name = customCueTypeName.trim();
    if (!name) return;
    pushUndo();
    const id = `CUSTOM_${customCueTypeKind}_${createId()}`;
    const baseType = customCueTypeKind === "POINT" ? "SFX" : customCueTypeKind === "BLOCK" ? "BLOCK" : "NOTE";
    const definition = {
      id,
      name,
      kind: customCueTypeKind,
      icon: customCueTypeIcon,
      prefix: customCueTypePrefix,
      suffix: customCueTypeSuffix,
      ...(customCueTypeKind === "BLOCK" ? { blockAppearance: { ...blockAppearance } } : {}),
    };
    setCustomCueTypes((current) => [...current, definition]);
    setColors((current) => ({ ...current, [id]: current[baseType] }));
    setStyles((current) => ({ ...current, [id]: { ...current[baseType] } }));
    if (customCueTypeKind === "POINT") setMargins((current) => ({ ...current, [id]: 75 }));
    setHiddenCueTypes((current) => ({ ...current, [id]: false }));
    setCueTypeFilters((current) => ({ ...current, [id]: true }));
    setCustomCueTypeName("");
    setCustomCueTypeIcon(getDefaultCustomCueIcon(customCueTypeKind));
    setCustomCueTypePrefix("");
    setCustomCueTypeSuffix("");
    markDirty();
  };

  const removeCustomCueType = async (definition) => {
    const cueCount = cues.filter((cue) => cue.type === definition.id).length;
    const cueMessage = cueCount === 1 ? "1 cue" : `${cueCount} cues`;
    if (!await requestAppDialog({ type: "confirm", title: `Remove ${definition.name}?`, message: `${cueMessage} of this type will be deleted. This can be restored with Undo.`, confirmLabel: "Remove cue type", danger: true })) return;
    pushUndo();
    const withoutType = (current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== definition.id));
    setCues((current) => current.filter((cue) => cue.type !== definition.id));
    setCustomCueTypes((current) => current.filter((item) => item.id !== definition.id));
    setColors(withoutType);
    setStyles(withoutType);
    setMargins(withoutType);
    setHiddenCueTypes(withoutType);
    setCueTypeFilters(withoutType);
    if (mode === definition.id) setMode("POINTER");
    if (expandedCueType === definition.id) setExpandedCueType(null);
    if (selectedCue?.type === definition.id) setSelectedCueId(null);
    markDirty();
  };

  const convertCueType = async () => {
    if (!convertFromType || !convertToType || convertFromType === convertToType) return;
    const affected = cues.filter((cue) => cue.type === convertFromType);
    if (!affected.length) return;
    if (!await requestAppDialog({ type: "confirm", title: "Convert cue types?", message: `Convert ${affected.length} ${getDisplayCueTypeName(convertFromType)} cue${affected.length === 1 ? "" : "s"} to ${getDisplayCueTypeName(convertToType)}? Per-cue custom properties will be cleared.`, confirmLabel: "Convert cues", danger: true })) return;
    pushUndo(cues);
    setCues((current) => current.map((cue) => {
      if (cue.type !== convertFromType) return cue;
      const next = { ...cue, type: convertToType, customPropertiesEnabled: false, customProperties: undefined };
      if (convertToType === "TEXTBOX") next.textRuns = [{ text: cue.label }];
      else delete next.textRuns;
      const anchorX = cue.left ?? cue.x ?? 0;
      const anchorY = cue.top ?? cue.y ?? 0;
      if (isBlockCue(convertToType)) {
        next.left = anchorX;
        next.top = anchorY;
        next.right = cue.right ?? anchorX + 120;
        next.bottom = cue.bottom ?? anchorY + 60;
        next.x = next.left;
        next.y = next.top;
        delete next.x2;
        delete next.y2;
      } else {
        next.x = anchorX;
        next.y = anchorY;
        delete next.left;
        delete next.top;
        delete next.right;
        delete next.bottom;
        if (convertToType === "FADE") {
          next.x2 = cue.x2 ?? anchorX + 100;
          next.y2 = cue.y2 ?? anchorY;
        } else {
          delete next.x2;
          delete next.y2;
        }
      }
      return next;
    }));
    setSelectedCueId(null);
    markDirty();
  };

  const findReplaceMatches = findReplaceType && findText
    ? cues.filter((cue) => cue.type === findReplaceType && cue.label.includes(findText))
    : [];

  const replaceCueText = async () => {
    if (!findReplaceType || !findText || !findReplaceMatches.length) return;
    const action = replaceText
      ? `replace “${findText}” with “${replaceText}”`
      : `remove “${findText}”`;
    if (!await requestAppDialog({ type: "confirm", title: "Apply find and replace?", message: `This will ${action} in ${findReplaceMatches.length} cue${findReplaceMatches.length === 1 ? "" : "s"}. This can change a large amount of data. The safest option is to download a saved copy first.`, confirmLabel: "Apply changes", danger: true })) return;
    pushUndo(cues);
    setCues((current) => current.map((cue) => cue.type === findReplaceType && cue.label.includes(findText)
      ? { ...cue, ...(cue.type === "TEXTBOX" ? editText(cue, cue.label.split(findText).join(replaceText)) : { label: cue.label.split(findText).join(replaceText) }) }
      : cue));
    markDirty();
  };

  const openToolsView = (view) => {
    if (view === "convert") {
      setConvertFromType("");
      setConvertToType("");
    } else if (view === "find-replace") {
      setFindReplaceType("");
      setFindText("");
      setReplaceText("");
    } else if (view === "manage") {
      setCustomCueTypeName("");
      setCustomCueTypeKind("POINT");
      setCustomCueTypeIcon(getDefaultCustomCueIcon("POINT"));
      setCustomCueTypePrefix("");
      setCustomCueTypeSuffix("");
    }
    setActiveToolsView(view);
  };

  const selectedCues = cues.filter((cue) => selectedCueIds.includes(cue.id));
  const selectedCue = selectedCues.length === 1 ? selectedCues[0] : null;

  return (
    <div className="app-shell">
      <main ref={editorMainRef} className="editor-main">
        <div className="app-toolbar">
          <div className="topbar-identity">
            <strong>SCRIPT MARKUP APP</strong>
            <small>PDF cue sheet annotator · v{APP_VERSION}</small>
          </div>
          <div className="document-name-area">
            {isEditingDocumentName ? (
              <input
                className="document-name-editor"
                aria-label="Document name"
                value={documentNameDraft}
                autoFocus
                style={{ width: `${Math.max(8, documentNameDraft.length + 1)}ch` }}
                onChange={(e) => setDocumentNameDraft(e.target.value)}
                onBlur={commitDocumentName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitDocumentName();
                }}
              />
            ) : (
              <button className="document-name-display" onClick={beginEditingDocumentName} title="Rename document">
                <span>{documentName}</span>
                <MaterialIcon path={mdiPencil} />
              </button>
            )}
            <span className={`save-state ${isDirty ? "is-dirty" : ""}`}>{isDirty ? "Unsaved changes" : lastAutosave ? `Autosaved ${lastAutosave}` : "Saved"}</span>
          </div>
          <button className="toolbar-primary" onClick={() => setShowFileMenu(true)}><ToolbarIcon name="save" />Save / Load</button>
          <button onClick={undoLastCueAction} disabled={undoStack.length === 0}><ToolbarIcon name="undo" />Undo</button>
          <button onClick={redoLastCueAction} disabled={redoStack.length === 0}><ToolbarIcon name="redo" />Redo</button>
          <button
            className={`toolbar-options ${showOptionsDrawer ? "is-active" : ""}`}
            onClick={() => setShowOptionsDrawer((open) => {
              const nextOpen = !open;
              if (nextOpen) {
                setShowInspector(false);
                setShowGeneralOptions(false);
                setExpandedCueType(null);
              }
              return nextOpen;
            })}
            aria-expanded={showOptionsDrawer}
          >
            <ToolbarIcon name="options" />Options
          </button>
          <button className="toolbar-tools" onClick={() => { setActiveToolsView(null); setShowTools(true); }}><ToolbarIcon name="tools" />Tools</button>
          <button className="toolbar-help" onClick={() => setShowHelp(true)} aria-label="Help" title="Help"><ToolbarIcon name="help" /></button>
        </div>

        <nav ref={toolToolbarRef} className="tool-toolbar" aria-label="Cue tools">
          <div className="tool-toolbar-group cue-tool-group">
            <button
              className={showCueList ? "is-active" : ""}
              onClick={() => setShowCueList((visible) => !visible)}
              aria-pressed={showCueList}
              title={showCueList ? "Hide cue list" : "Show cue list"}
            >
              <MaterialIcon path={mdiEye} />
              <span>View Cues</span>
            </button>
            <span className="cue-toolbar-divider" aria-hidden="true" />
            {cueToolButtons.filter((tool) => tool.type === "POINTER" || !hiddenCueTypes[tool.type]).map((tool) => (
              <button
                key={tool.type}
                className={mode === tool.type ? "is-active" : ""}
                onClick={() => {
                  setFadeStart(null);
                  setBlockStart(null);
                  setMode(tool.type);
                }}
                title={tool.label}
                aria-label={tool.label}
                aria-pressed={mode === tool.type}
              >
                <MaterialIcon path={tool.icon} />
                <span>{tool.label}</span>
              </button>
            ))}
          </div>
          <div className="tool-toolbar-group view-tool-group">
            <div className="page-navigation" aria-label="Page navigation">
              <button type="button" disabled={!pages.length || currentPage === 0} onClick={() => goToPage(currentPage - 1)} aria-label="Previous page">‹</button>
              <label>Page <input type="number" min="1" max={Math.max(1, pages.length)} value={pages.length ? currentPage + 1 : 0} disabled={!pages.length} onChange={(event) => goToPage(Number(event.target.value) - 1)} /> / {pages.length}</label>
              <button type="button" disabled={!pages.length || currentPage >= pages.length - 1} onClick={() => goToPage(currentPage + 1)} aria-label="Next page">›</button>
              <button type="button" disabled={!pages.length} onClick={() => fitPageToViewport("width")}>Fit width</button>
              <button type="button" disabled={!pages.length} onClick={() => fitPageToViewport("page")}>Fit page</button>
              <button type="button" disabled={!pages.length} onClick={() => setDisplayScale(1)}>100%</button>
            </div>
            <button
              className={`tool-layout-button ${pageLayout === "single" ? "is-active" : ""}`}
              onClick={() => setPageLayout("single")}
              aria-label="Pages in line"
              title="Pages in line"
              aria-pressed={pageLayout === "single"}
            >
              <ToolbarIcon name="stack" />
            </button>
            <button
              className={`tool-layout-button ${pageLayout === "spread" ? "is-active" : ""}`}
              onClick={() => setPageLayout("spread")}
              aria-label="Pages side by side"
              title="Pages side by side"
              aria-pressed={pageLayout === "spread"}
            >
              <ToolbarIcon name="columns" />
            </button>
            <label className="display-scale-control">
              <span>Scale</span>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={displayScale}
                onChange={(e) => setDisplayScale(parseFloat(e.target.value))}
              />
              <output>{Math.round(displayScale * 100)}%</output>
            </label>
            <button
              className={showInspector ? "is-active" : ""}
              onClick={() => setShowInspector((open) => {
                const nextOpen = !open;
                if (nextOpen) setShowOptionsDrawer(false);
                return nextOpen;
              })}
              aria-expanded={showInspector}
              title={showInspector ? "Hide inspector" : "Show inspector"}
            >
              <MaterialIcon path={mdiPencil} />
              <span>Inspector</span>
            </button>
          </div>
        </nav>

        <div className={`options-drawer ${showOptionsDrawer || showInspector ? "is-open" : ""}`} style={{ width: drawerWidth }}>
          <div className="panel-resize-handle panel-resize-handle--left" onMouseDown={(event) => startPanelResize(event, "right", setDrawerWidth, "scriptMarkupDrawerWidth")} />
          {showInspector ? (
            <>
              <div className="inspector-header">
                <h3>Cue Inspector</h3>
                <button type="button" onClick={() => setShowInspector(false)} aria-label="Close inspector">X</button>
              </div>
              {selectedCues.length > 1 && (
                <div className="inspector-content">
                  <div className="multi-cue-heading">{selectedCues.length} cues selected</div>
                  {renderMultiCueProperties(selectedCues)}
                </div>
              )}
              {selectedCue && (
                <div className="inspector-content">
                  {selectedCue.type === "TEXTBOX" ? (
                    <TextBoxEditor key={selectedCue.id} cue={selectedCue} disabled={Boolean(lockedCueTypes[selectedCue.type])} onChange={(updates) => {
                      if (lockedCueTypes[selectedCue.type]) return;
                      pushUndo(cues);
                      setCues((current) => current.map((cue) => cue.id === selectedCue.id ? { ...cue, ...updates } : cue));
                      markDirty();
                    }} />
                  ) : (
                  <label className="inspector-name-field">
                    <span>Cue name</span>
                    <input
                      type="text"
                      value={selectedCue.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        setCues((current) => current.map((cue) => cue.id === selectedCue.id ? { ...cue, label } : cue));
                        markDirty();
                      }}
                    />
                  </label>
                  )}
                  <label className="custom-properties-toggle">
                    <span>Custom cue properties</span>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedCue.customPropertiesEnabled)}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setCues((current) => current.map((cue) => {
                          if (cue.id !== selectedCue.id) return cue;
                          return {
                            ...cue,
                            customPropertiesEnabled: enabled,
                            customProperties: compactCueProperties(cue.type, cue.customProperties),
                          };
                        }));
                        markDirty();
                      }}
                    />
                  </label>
                  {renderInspectorProperties(selectedCue)}
                </div>
              )}
            </>
          ) : (
          <>
          <div className="drawer-header">
            <h2>Tool Options</h2>
            <button onClick={() => setShowOptionsDrawer(false)} aria-label="Close options">×</button>
          </div>
          <input className="options-search" type="search" placeholder="Search cue types and settings…" value={optionsSearch} onChange={(event) => setOptionsSearch(event.target.value)} />
          <section className="cue-option-section general-options-section" style={{ "--cue-color": "#374151" }}>
            <button
              className={`cue-option-trigger ${showGeneralOptions ? "is-expanded" : ""}`}
              onClick={() => {
                const nextExpanded = !showGeneralOptions;
                setShowGeneralOptions(nextExpanded);
                setExpandedCueType(null);
              }}
              aria-expanded={showGeneralOptions}
            >
              <span className="cue-option-icon"><MaterialIcon path={mdiTuneVertical} /></span>
              <span className="cue-option-name"><strong>GENERAL</strong></span>
              <span className="cue-option-chevron">
                <MaterialIcon path={showGeneralOptions ? mdiMinusBoxOutline : mdiPlusBoxOutline} />
              </span>
            </button>
            {showGeneralOptions && <div className="general-options">
            <div className="general-options-group cue-type-toggles">
              <strong>Cue types</strong>
              {cueToolButtons.filter((tool) => tool.type !== "POINTER").map((tool) => (
                <label key={tool.type}>
                  <span>{tool.label}</span>
                  <input
                    type="checkbox"
                    checked={!hiddenCueTypes[tool.type]}
                    onChange={(e) => {
                      const hidden = !e.target.checked;
                      setHiddenCueTypes((current) => ({ ...current, [tool.type]: hidden }));
                      if (hidden && mode === tool.type) setMode("POINTER");
                      if (hidden && expandedCueType === tool.type) setExpandedCueType(null);
                      setSelectedCueId(null);
                      markDirty();
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="general-options-group calling-page-options">
            <strong>Prompt/Showcall page</strong>
            <label className={!pdfBytes || (notesPageSide !== "off" && callingPageHasContent) ? "is-disabled" : ""}>
              <span>Enable prompt/showcall page</span>
              <input
                type="checkbox"
                checked={notesPageSide !== "off"}
                disabled={!pdfBytes || (notesPageSide !== "off" && callingPageHasContent)}
                onChange={(e) => setCallingPageEnabled(e.target.checked)}
              />
            </label>
            <label className={notesPageSide === "off" ? "is-disabled" : ""}>
              <span>Prompt/showcall page side</span>
              <select
                value={callingPageSide}
                disabled={notesPageSide === "off"}
                onChange={(e) => moveCallingPageTo(e.target.value)}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
            {callingPageHasContent && (
              <small>Move or remove prompt/showcall-page cues before disabling this page.</small>
            )}
            </div>
            <div className="general-options-group decoration-options">
              <strong>Dividers and headers</strong>
              <label>
                <span>Lock dividers and headers</span>
                <input
                  type="checkbox"
                  checked={dividersLocked}
                  onChange={(e) => {
                    setDividersLocked(e.target.checked);
                    if (e.target.checked) {
                      setSelectedDividerId(null);
                      setSelectedHeaderId(null);
                      setEditingHeaderId(null);
                    }
                    markDirty();
                  }}
                />
              </label>

              <div className="decoration-group">
                <div className="divider-options-heading">
                  <strong>Dividers</strong>
                  <button type="button" disabled={!pdfBytes} onClick={addDivider}>Add divider</button>
                </div>
                <label><span>Colour</span><PaletteColorInput value={dividerAppearance.color} onCommit={(value) => { setDividerAppearance((current) => ({ ...current, color: value })); markDirty(); }} /></label>
                <label>
                  <span>Line width</span>
                  <span className="divider-width-control">
                    <input type="range" min="0.5" max="8" step="0.5" value={dividerAppearance.lineWidth} onChange={(e) => { setDividerAppearance((current) => ({ ...current, lineWidth: roundLineWidth(e.target.value) })); markDirty(); }} />
                    <output>{formatLineWidth(dividerAppearance.lineWidth)}</output>
                  </span>
                </label>
                {dividers.map((divider, index) => (
                  <div className={`divider-list-item${selectedDividerId === divider.id ? " is-selected" : ""}`} key={divider.id} role={dividersLocked ? undefined : "button"} tabIndex={dividersLocked ? undefined : 0} onClick={() => { if (dividersLocked) return; setSelectedCueId(null); setSelectedHeaderId(null); setSelectedDividerId(divider.id); }}>
                    <span>Divider {index + 1} <small>({divider.surface === "pdf" ? "PDF" : "Prompt/Showcall"})</small></span>
                    <button type="button" aria-label={`Remove Divider ${index + 1}`} disabled={dividersLocked} onClick={(e) => { e.stopPropagation(); removeDivider(divider.id); }}>×</button>
                  </div>
                ))}
              </div>

              <div className="decoration-group">
                <div className="divider-options-heading">
                  <strong>Headers</strong>
                  <button type="button" disabled={!pdfBytes} onClick={addHeader}>Add header</button>
                </div>
                <label><span>Colour</span><PaletteColorInput value={headerAppearance.color} onCommit={(value) => { setHeaderAppearance((current) => ({ ...current, color: value })); markDirty(); }} /></label>
                <label>
                  <span>Text size</span>
                  <span className="divider-width-control">
                    <input type="range" min="8" max="72" step="1" value={headerAppearance.textSize} onChange={(e) => { setHeaderAppearance((current) => ({ ...current, textSize: parseFloat(e.target.value) })); markDirty(); }} />
                    <output>{headerAppearance.textSize}</output>
                  </span>
                </label>
                {headers.map((header, index) => (
                  <div className={`divider-list-item${selectedHeaderId === header.id ? " is-selected" : ""}`} key={header.id} role={dividersLocked ? undefined : "button"} tabIndex={dividersLocked ? undefined : 0} onClick={() => { if (dividersLocked) return; setSelectedCueId(null); setSelectedDividerId(null); setSelectedHeaderId(header.id); }}>
                    {editingHeaderId === header.id ? (
                      <input className="header-name-editor" autoFocus value={headerTextDraft} onClick={(e) => e.stopPropagation()} onChange={(e) => setHeaderTextDraft(e.target.value)} onBlur={() => commitHeaderText(header)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commitHeaderText(header); if (e.key === "Escape") setEditingHeaderId(null); }} />
                    ) : (
                      <button type="button" className="header-name-display" disabled={dividersLocked} onClick={(e) => { e.stopPropagation(); beginEditingHeader(header); }}>{header.text}</button>
                    )}
                    <small>{header.surface === "pdf" ? "PDF" : "Prompt/Showcall"}</small>
                    <button type="button" aria-label={`Remove header ${index + 1}`} disabled={dividersLocked} onClick={(e) => { e.stopPropagation(); removeHeader(header.id); }}>×</button>
                  </div>
                ))}
              </div>

              <button type="button" className="reset-decorations-button" disabled={dividersLocked || (dividers.length === 0 && headers.length === 0)} onClick={resetDividersAndHeaders}>Reset dividers and headers</button>
            </div>
            </div>}
          </section>
          <div className="cue-options-accordion">
            {cueToolButtons.filter((tool) => tool.type !== "POINTER" && !hiddenCueTypes[tool.type] && (!optionsSearch || `${tool.label} colour margin prefix suffix text line fill opacity marker lock`.toLowerCase().includes(optionsSearch.toLowerCase()))).map(({ type, icon }) => {
              const isExpanded = expandedCueType === type;
              return (
                <section className="cue-option-section" key={type} style={{ "--cue-color": colors[type] }}>
                  <button
                    className={`cue-option-trigger ${isExpanded ? "is-expanded" : ""}`}
                    onClick={() => {
                      setExpandedCueType(isExpanded ? null : type);
                      setShowGeneralOptions(false);
                    }}
                    aria-expanded={isExpanded}
                  >
                    <span className="cue-option-icon"><MaterialIcon path={icon} /></span>
                    <span className="cue-option-name">
                      <strong>{getDisplayCueTypeLabel(type)} CUES</strong>
                      {hiddenCueTypes[type] && <span className="hidden-status">(Hidden)</span>}
                    </span>
                    <span className="cue-option-chevron">
                      <MaterialIcon path={isExpanded ? mdiMinusBoxOutline : mdiPlusBoxOutline} />
                    </span>
                  </button>
                  {isExpanded && renderCueTypeOptions(type)}
                </section>
              );
            })}
          </div>
          <div className="app-brand">
            <span className="app-brand-mark">SM</span>
            <span>Script Markup</span>
          </div>
          <button onClick={openPdfNative}>Open PDF</button>
          <button onClick={removePdf} disabled={!pdfBytes}>Remove PDF</button>
          <button onClick={openProjectNative}>Open Project</button>
          <button onClick={saveCurrentProjectNative}>Save</button>
          <button onClick={saveProjectAsNative}>Save As</button>
          <button onClick={exportPDF}>Export PDF</button>
          <button onClick={recoverAutosave}>Recover Autosave</button>
          <button
            onClick={undoLastCueAction}
            disabled={undoStack.length === 0}
          >
            Undo
          </button>

          <button
            onClick={() => setShowCueList((v) => !v)}
          >
            {showCueList ? "Hide Cue List" : "Show Cue List"}
          </button>

          <button onClick={() => setPageLayout((layout) =>
            layout === "single" ? "spread" : "single"
          )}>
            {pageLayout === "single" ? "Pages Side by Side" : "Pages Stacked"}
          </button>

          <label>
            Cue Type{" "}
            <select
              value={mode}
              onChange={(e) => {
                setFadeStart(null);
                setBlockStart(null);
                setMode(e.target.value);
              }}
            >
              {availableCueTypes.map((type) => (
                <option key={type} value={type}>
                  {getDisplayCueTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>

          <span style={{ fontSize: 12, opacity: 0.75 }}>
            {currentProjectPath || "Untitled"}
            {isDirty ? " *" : ""}
            {lastAutosave ? ` · Autosaved ${lastAutosave}` : ""}
          </span>

          <div className="cue-settings" style={{ "--cue-color": colors[mode] }}>
            <strong>{getDisplayCueTypeName(mode)} Settings</strong>

            {mode === "FADE" && (
              <span style={{ fontSize: 12 }}>
                {fadeStart ? "Click the fade end point" : "Click the fade start point"}
              </span>
            )}

            {isBlockCue(mode) && (
              <span style={{ fontSize: 12 }}>
                {blockStart ? "Click the opposite corner" : "Click the first corner"}
              </span>
            )}

            {!isBlockCue(mode) && <label>
              Colour{" "}
              <input
                type="color"
                value={colors[mode]}
                onChange={(e) => updateSelectedColor(e.target.value)}
              />
            </label>}

            {isBlockCue(mode) && (
              <>
                <label>
                  Line{" "}
                  <input
                    type="color"
                    value={colors.BLOCK}
                    disabled={!blockAppearance.lineEnabled}
                    onChange={(e) => updateSelectedColor(e.target.value)}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={!blockAppearance.lineEnabled}
                    onChange={(e) => {
                      setBlockAppearance((current) => ({ ...current, lineEnabled: !e.target.checked }));
                      markDirty();
                    }}
                  /> No line
                </label>
                <label>
                  Fill{" "}
                  <input
                    type="color"
                    value={blockAppearance.fillColor}
                    disabled={!blockAppearance.fillEnabled}
                    onChange={(e) => {
                      setBlockAppearance((current) => ({ ...current, fillColor: e.target.value }));
                      markDirty();
                    }}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={!blockAppearance.fillEnabled}
                    onChange={(e) => {
                      setBlockAppearance((current) => ({ ...current, fillEnabled: !e.target.checked }));
                      markDirty();
                    }}
                  /> No fill
                </label>
                <label>
                  Fill opacity{" "}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={blockAppearance.fillOpacity}
                    disabled={!blockAppearance.fillEnabled}
                    onChange={(e) => {
                      setBlockAppearance((current) => ({
                        ...current,
                        fillOpacity: parseFloat(e.target.value),
                      }));
                      markDirty();
                    }}
                  />
                  {Math.round(blockAppearance.fillOpacity * 100)}%
                </label>
              </>
            )}

            {isMarginCue(mode) && (
              <label>
                Margin{" "}
                <input
                  type="range"
                  min="0"
                  max="600"
                  value={margins[mode]}
                  onChange={(e) => {
                    setMargins((m) => ({
                      ...m,
                      [mode]: parseInt(e.target.value, 10),
                    }));
                    markDirty();
                  }}
                />
                <span style={{ minWidth: 32, display: "inline-block" }}>
                  {Math.round(margins[mode])}
                </span>
              </label>
            )}

            <label>
              Text Size{" "}
              <input
                type="range"
                min="6"
                max="28"
                step="1"
                value={styles[mode].textSize}
                onChange={(e) =>
                  updateSelectedStyle("textSize", parseFloat(e.target.value))
                }
              />
              <span style={{ minWidth: 24, display: "inline-block" }}>
                {styles[mode].textSize}
              </span>
            </label>

            {(hasLines(mode) || isBlockCue(mode)) && (
              <label>
                Line Width{" "}
                <input
                  type="range"
                  min="0.5"
                  max="8"
                  step="0.5"
                  value={styles[mode].lineWidth}
                  onChange={(e) =>
                    updateSelectedStyle("lineWidth", roundLineWidth(e.target.value))
                  }
                />
                <span style={{ minWidth: 24, display: "inline-block" }}>
                  {formatLineWidth(styles[mode].lineWidth)}
                </span>
              </label>
            )}
          </div>
          </>
          )}
        </div>

        {toast && <div className={`app-toast app-toast--${toast.tone}`} role="status">{toast.message}</div>}

        {appDialog && <div className="modal-backdrop app-dialog-backdrop" onMouseDown={() => closeAppDialog(appDialog.type === "prompt" ? null : false)}>
          <form className="app-modal app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" onSubmit={(event) => { event.preventDefault(); closeAppDialog(appDialog.type === "prompt" ? appDialog.value : true); }} onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="app-dialog-title">{appDialog.title}</h2>
            {appDialog.message && <p>{appDialog.message}</p>}
            {appDialog.type === "prompt" && <input autoFocus value={appDialog.value} onChange={(event) => setAppDialog((current) => ({ ...current, value: event.target.value }))} />}
            <div className="app-dialog-actions"><button type="button" onClick={() => closeAppDialog(appDialog.type === "prompt" ? null : false)}>Cancel</button><button type="submit" className={appDialog.danger ? "is-danger" : ""}>{appDialog.confirmLabel}</button></div>
          </form>
        </div>}

        {showTools && (
          <div className="modal-backdrop" onMouseDown={() => { setShowTools(false); setActiveToolsView(null); }}>
            <section className="app-modal save-load-modal tools-modal" onMouseDown={(event) => event.stopPropagation()}>
              <div className="save-load-heading">
                <div>
                  <span className="modal-eyebrow">TOOLS</span>
                  <h2>{activeToolsView === "convert" ? "Convert Cue Types" : activeToolsView === "manage" ? "Manage Cue Types" : activeToolsView === "find-replace" ? "Find & Replace" : "Tools"}</h2>
                  <p>{activeToolsView === "convert" ? "Convert every cue of one type into another type." : activeToolsView === "manage" ? "Create, rename, style, or remove custom cue types." : activeToolsView === "find-replace" ? "Replace exact text within one cue type." : "Choose a tool to work with this showfile."}</p>
                </div>
                <button className="modal-close" onClick={() => { setShowTools(false); setActiveToolsView(null); }} aria-label="Close">×</button>
              </div>
              {activeToolsView === null && (
                <div className="tools-launcher">
                  <button type="button" onClick={() => openToolsView("convert")}><ToolbarIcon name="tools" /><span><strong>Convert Cue Types</strong><small>Change all cues of one type into another</small></span></button>
                  <button type="button" onClick={() => openToolsView("manage")}><MaterialIcon path={mdiCogOutline} /><span><strong>Manage Cue Types</strong><small>Add, rename, choose icons, or remove custom types</small></span></button>
                  <button type="button" onClick={() => openToolsView("find-replace")}><MaterialIcon path={mdiFindReplace} /><span><strong>Find &amp; Replace</strong><small>Replace exact text within one cue type</small></span></button>
                </div>
              )}
              {activeToolsView === "convert" && (
                <div className="tools-modal-content cue-type-converter">
                  <button type="button" className="tools-back" onClick={() => setActiveToolsView(null)}>← All tools</button>
                  <label><span>From</span><select value={convertFromType} onChange={(event) => setConvertFromType(event.target.value)}><option value="">Select type</option>{availableCueTypes.map((type) => <option key={type} value={type}>{getDisplayCueTypeLabel(type)}</option>)}</select></label>
                  <label><span>To</span><select value={convertToType} onChange={(event) => setConvertToType(event.target.value)}><option value="">Select type</option>{availableCueTypes.map((type) => <option key={type} value={type}>{getDisplayCueTypeLabel(type)}</option>)}</select></label>
                  {convertFromType && <div className="bulk-preview"><strong>Preview</strong>{cues.filter((cue) => cue.type === convertFromType).slice(0, 10).map((cue) => <div key={cue.id}><span>{getCueDisplayText(cue)}</span><span>→ {getDisplayCueTypeLabel(convertToType || cue.type)}</span></div>)}</div>}
                  <button type="button" className="secondary-action" onClick={saveCurrentProjectNative} disabled={!pdfBytes}>Download backup first</button>
                  <button type="button" disabled={!convertFromType || !convertToType || convertFromType === convertToType || !cues.some((cue) => cue.type === convertFromType)} onClick={convertCueType}>
                    Convert {convertFromType ? cues.filter((cue) => cue.type === convertFromType).length : 0} cues
                  </button>
                </div>
              )}
              {activeToolsView === "find-replace" && (
                <div className="tools-modal-content find-replace-tool">
                  <button type="button" className="tools-back" onClick={() => setActiveToolsView(null)}>← All tools</button>
                  <label><span>Cue type</span><select value={findReplaceType} onChange={(event) => setFindReplaceType(event.target.value)}><option value="">Select type</option>{availableCueTypes.map((type) => <option key={type} value={type}>{getDisplayCueTypeLabel(type)}</option>)}</select></label>
                  <label><span>Find</span><input type="text" value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="Exact text, including spaces and punctuation" /></label>
                  <label><span>Replace</span><input type="text" value={replaceText} onChange={(event) => setReplaceText(event.target.value)} placeholder="Leave blank to remove the found text" /></label>
                  <p className="literal-match-note">Matching is case-sensitive and literal. Spaces and punctuation are included exactly as entered.</p>
                  {findReplaceMatches.length > 0 && <div className="bulk-preview"><strong>Preview</strong>{findReplaceMatches.slice(0, 10).map((cue) => <div key={cue.id}><span>{cue.label}</span><span>→ {cue.label.split(findText).join(replaceText)}</span></div>)}</div>}
                  <button type="button" className="secondary-action" onClick={saveCurrentProjectNative} disabled={!pdfBytes}>Download backup first</button>
                  <button type="button" disabled={!findReplaceType || !findText || !findReplaceMatches.length} onClick={replaceCueText}>
                    {replaceText
                      ? `Replace “${findText}” with “${replaceText}” in ${findReplaceMatches.length} cue${findReplaceMatches.length === 1 ? "" : "s"}`
                      : `Remove “${findText}” from ${findReplaceMatches.length} cue${findReplaceMatches.length === 1 ? "" : "s"}`}
                  </button>
                </div>
              )}
              {activeToolsView === "manage" && (
                <div className="tools-modal-content manage-cue-types">
                  <button type="button" className="tools-back" onClick={() => setActiveToolsView(null)}>← All tools</button>
                  <div className="custom-cue-type-builder">
                    <strong>Add custom cue type</strong>
                    <input type="text" placeholder="Cue type name" value={customCueTypeName} onChange={(event) => setCustomCueTypeName(event.target.value)} />
                    <select value={customCueTypeKind} onChange={(event) => { const kind = event.target.value; setCustomCueTypeKind(kind); setCustomCueTypeIcon(getDefaultCustomCueIcon(kind)); }}>
                      <option value="POINT">Cue Point Type</option><option value="NOTE">Note Type</option><option value="BLOCK">Block Type</option>
                    </select>
                    <div className="custom-cue-affixes">
                      <label><span>Text prefix</span><input type="text" placeholder="Optional" value={customCueTypePrefix} onChange={(event) => setCustomCueTypePrefix(event.target.value)} /></label>
                      <label><span>Text suffix</span><input type="text" placeholder="Optional" value={customCueTypeSuffix} onChange={(event) => setCustomCueTypeSuffix(event.target.value)} /></label>
                    </div>
                    <span className="icon-picker-label">Toolbar icon</span>
                    <div className="custom-icon-picker">
                      {CUSTOM_CUE_ICONS.map(([id, label, path]) => <button key={id} type="button" className={customCueTypeIcon === id ? "is-selected" : ""} title={label} aria-label={label} aria-pressed={customCueTypeIcon === id} onClick={() => setCustomCueTypeIcon(id)}><MaterialIcon path={path} /></button>)}
                    </div>
                    <button type="button" disabled={!customCueTypeName.trim()} onClick={addCustomCueType}>Add cue type</button>
                  </div>
                  {customCueTypes.length > 0 && <div className="custom-cue-type-list">
                    <strong>Custom cue types</strong>
                    {customCueTypes.map((definition) => <div className="custom-cue-type-row" key={definition.id} draggable onDragStart={() => { draggedCustomTypeIdRef.current = definition.id; }} onDragOver={(event) => event.preventDefault()} onDrop={() => {
                      const draggedId = draggedCustomTypeIdRef.current;
                      if (!draggedId || draggedId === definition.id) return;
                      setCustomCueTypes((current) => {
                        const next = [...current];
                        const from = next.findIndex((item) => item.id === draggedId);
                        const to = next.findIndex((item) => item.id === definition.id);
                        const [moved] = next.splice(from, 1);
                        next.splice(to, 0, moved);
                        return next;
                      });
                      draggedCustomTypeIdRef.current = null;
                      markDirty();
                    }}>
                      <MaterialIcon path={CUSTOM_CUE_ICON_PATHS[definition.icon] || CUSTOM_CUE_ICON_PATHS[getDefaultCustomCueIcon(definition.kind)]} />
                      <span>{definition.kind === "POINT" ? "Cue Point" : definition.kind === "BLOCK" ? "Block" : "Note"}</span>
                      <input type="text" value={definition.name} onChange={(event) => { const name = event.target.value; setCustomCueTypes((current) => current.map((item) => item.id === definition.id ? { ...item, name } : item)); markDirty(); }} />
                      <select aria-label={`${definition.name} icon`} value={definition.icon || getDefaultCustomCueIcon(definition.kind)} onChange={(event) => { const icon = event.target.value; setCustomCueTypes((current) => current.map((item) => item.id === definition.id ? { ...item, icon } : item)); markDirty(); }}>{CUSTOM_CUE_ICONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                      <button type="button" className="remove-custom-cue-type" onClick={() => removeCustomCueType(definition)}>Remove</button>
                    </div>)}
                  </div>}
                </div>
              )}
            </section>
          </div>
        )}

        {showFileMenu && (
          <div className="modal-backdrop" onMouseDown={() => setShowFileMenu(false)}>
            <section className="app-modal save-load-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="save-load-heading">
                <div>
                  <span className="modal-eyebrow">DOCUMENT CONTROL</span>
                  <h2>Save &amp; Load</h2>
                  <p>Open source files, manage your project, or produce a finished PDF.</p>
                </div>
                <button className="modal-close" onClick={() => setShowFileMenu(false)} aria-label="Close">×</button>
              </div>

              <div className="save-load-status">
                <strong>{documentName || "Untitled"}</strong>
                <span className={isDirty ? "is-unsaved" : ""}>{isDirty ? "Unsaved changes" : "Up to date"}</span>
                {lastAutosave && <span>Autosaved {lastAutosave}</span>}
              </div>

              <div className="file-action-group">
                <h3>Document</h3>
                <div className="file-actions">
                  <button onClick={() => runFileAction("Open PDF", openPdfNative)} disabled={Boolean(fileActionInProgress)}><MaterialIcon path={mdiFilePdfBox} /><span><strong>Open PDF</strong><small>Start with a PDF document</small></span></button>
                  <button onClick={() => runFileAction("Remove PDF", removePdf)} disabled={!pdfBytes || Boolean(fileActionInProgress)} className="is-danger"><MaterialIcon path={mdiDeleteOutline} /><span><strong>Remove PDF</strong><small>Clear the current document</small></span></button>
                </div>
              </div>

              <div className="file-action-group">
                <h3>Project</h3>
                <div className="file-actions">
                  <button onClick={() => runFileAction("Load Project", openProjectNative)} disabled={Boolean(fileActionInProgress)}><MaterialIcon path={mdiFolderOpenOutline} /><span><strong>Load Project</strong><small>Open a saved .cueproj file</small></span></button>
                  <button onClick={() => runFileAction("Save Project", saveCurrentProjectNative)} disabled={Boolean(fileActionInProgress)}><MaterialIcon path={mdiContentSaveOutline} /><span><strong>Save Project</strong><small>Download a timestamped copy</small></span></button>
                  <button onClick={() => runFileAction("Save Project As", saveProjectAsNative)} disabled={Boolean(fileActionInProgress)}><MaterialIcon path={mdiContentSaveEditOutline} /><span><strong>Save Project As</strong><small>Choose a name and save location</small></span></button>
                  <button onClick={() => runFileAction("Recover Autosave", recoverAutosave)} disabled={Boolean(fileActionInProgress)}><MaterialIcon path={mdiBackupRestore} /><span><strong>Recover Autosave</strong><small>Restore browser-stored work</small></span></button>
                </div>
              </div>

              <div className="file-action-group">
                <h3>Output</h3>
                <div className="file-actions file-actions--single">
                  <button className="is-primary" onClick={() => runFileAction("Export PDF", exportPDF)} disabled={!pdfBytes || Boolean(fileActionInProgress)}><MaterialIcon path={mdiFileExportOutline} /><span><strong>Export PDF</strong><small>Create the final annotated PDF</small></span></button>
                </div>
              </div>
            </section>
          </div>
        )}

        {showHelp && (
          <div className="modal-backdrop" onMouseDown={() => setShowHelp(false)}>
            <section className="app-modal help-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="help-heading">
                <div>
                  <span className="modal-eyebrow">SCRIPT MARKUP APP</span>
                  <h2>Help &amp; Guide</h2>
                  <p>Version {APP_VERSION} · Mark up, organise, save, and export PDF cue sheets.</p>
                </div>
                <button className="modal-close" onClick={() => setShowHelp(false)} aria-label="Close">×</button>
              </div>

              <div className="help-content">
                <div className="help-card-grid">
                  <article className="help-card">
                    <h3>Getting started</h3>
                    <ol>
                      <li>Open <strong>Save / Load</strong> and select a source PDF.</li>
                      <li>Choose a tool from the toolbar beneath the header.</li>
                      <li>Click the document to create cues, then adjust their appearance in <strong>Options</strong>.</li>
                      <li>Save a project for later editing or export a finished PDF.</li>
                    </ol>
                  </article>

                  <article className="help-card">
                    <h3>Creating cues</h3>
                    <ul>
                      <li><strong>SFX, Scene, and DCA</strong> create margin-based annotations.</li>
                      <li><strong>Note</strong> and custom Note types place text directly on the page.</li>
                      <li><strong>Text box</strong> adds resizable multiline text with formatting for individual selections.</li>
                      <li>Select <strong>Pointer</strong> when you want to work without adding cues.</li>
                      <li>Drag cues and their handles without changing the current selection.</li>
                      <li>Rename a cue by double-clicking it on the page or editing its name in the cue list. For Text boxes, either action opens the Inspector content editor.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>Selecting &amp; bulk editing</h3>
                    <ul>
                      <li>With Pointer active, drag across empty page space to marquee-select cues.</li>
                      <li>Ctrl/Cmd-click toggles cues; Shift-click in the cue list selects a visible range.</li>
                      <li>The cue-list selection panel can duplicate, align, distribute, move, reset, or transfer properties.</li>
                      <li>Lock every cue of a type from its Options accordion when a completed cue layer should not change.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>Custom types &amp; Tools</h3>
                    <ul>
                      <li>Use <strong>Tools → Manage Cue Types</strong> to create Cue Point, Note, or Block types with custom names and icons.</li>
                      <li>Custom types support their own appearance, prefix, suffix, visibility, ordering, and lock state.</li>
                      <li>Convert Cue Types and Find &amp; Replace show previews and offer a backup action before bulk changes.</li>
                      <li>Bulk text matching is literal and case-sensitive, including spaces and punctuation.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>Fade &amp; Block</h3>
                    <ul>
                      <li><strong>Fade</strong> uses two clicks to create a line between two points.</li>
                      <li><strong>Block</strong> uses two clicks to define opposite rectangle corners.</li>
                      <li>Drag either cue to move it. Use its round handles to reshape it.</li>
                      <li>Double-click the fade line or block body to add an optional label.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>Text boxes &amp; Inspector</h3>
                    <ul>
                      <li>Select <strong>Text box</strong> and click two opposite corners. Its Inspector opens automatically and the tool returns to Pointer.</li>
                      <li>Enter multiple lines in <strong>Text box content</strong>. Select text and use Bold, Italic, Underline, or Strikethrough; the preview below shows the formatting.</li>
                      <li>Ctrl/Cmd+B, Ctrl/Cmd+I, and Ctrl/Cmd+U toggle formatting on selected text in the editor. Styles can be combined.</li>
                      <li>Each box has its own text size, text / line colour, border, fill, and opacity controls. New boxes have no visible border or fill.</li>
                      <li>Drag a box to move it or its corner handles to resize it. A red ellipsis indicates overflow; enlarge the box to reveal more text.</li>
                      <li>Projects and autosave retain all text and formatting. PDF export includes formatted text that fits inside the box.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>Prompt/Showcall pages</h3>
                    <ul>
                      <li>Open <strong>Prompt/Showcall Page</strong> in Options to enable a blank page beside every PDF page.</li>
                      <li>Choose a consistent left or right position for the whole document.</li>
                      <li>The PDF and Prompt/Showcall page form one editing canvas, so cue lines and margins can cross the page divider.</li>
                      <li>Switching sides preserves relative cue positions; line endpoints on the script remain in place.</li>
                      <li>A Prompt/Showcall page containing cues cannot be disabled until those cues are moved or removed.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>Dividers &amp; headers</h3>
                    <ul>
                      <li>Add shared vertical dividers or headers from <strong>Dividers and Headers</strong> in Options.</li>
                      <li>Items created on a PDF or Prompt/Showcall page appear in the same position on every page of that type.</li>
                      <li>Drag an unlocked item between the PDF and Prompt/Showcall sides. Dividers have colour and line-width controls; headers have colour and text-size controls.</li>
                      <li>Select an item on the page or in Options. Edit header text there or by double-clicking the header on the page.</li>
                      <li>Locking prevents moving, editing, or deleting both dividers and headers. <strong>Reset</strong> removes them all after confirmation.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>View &amp; visibility</h3>
                    <ul>
                      <li>Switch between stacked and side-by-side page layouts in the tool strip.</li>
                      <li>Use Scale, Ctrl/Cmd-scroll, Fit Width, Fit Page, or 100% without changing export geometry.</li>
                      <li>Toggle the cue list from the button beside the scale control.</li>
                      <li>Hidden cue types remain saved but do not appear on pages or PDF exports.</li>
                      <li>Only one Options accordion can be open at a time.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>Options &amp; cue list</h3>
                    <ul>
                      <li>Expand any tool row to change its colour, text size, line width, or margin.</li>
                      <li>Block and Text box additionally support fill colour, opacity, no fill, and no line.</li>
                      <li>Search cues by name, type, or page from the cue list.</li>
                      <li>Search Options by cue type or setting name.</li>
                      <li>The Filter accordion controls which cue types appear in the list.</li>
                      <li>Drag the cue list or drawer edge to resize it; the browser remembers the width.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>Save, load &amp; export</h3>
                    <ul>
                      <li><strong>Save Project</strong> downloads a timestamped project copy.</li>
                      <li><strong>Save Project As</strong> lets you choose its filename and location.</li>
                      <li>Successful save and export actions display a confirmation.</li>
                      <li><strong>Export PDF</strong> creates an annotated PDF using visible cues and outputs each Prompt/Showcall page as a separate page beside its source page in sequence.</li>
                      <li>Items dragged outside their page area are omitted from saved projects and PDF exports.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>Sessions &amp; replacing files</h3>
                    <ul>
                      <li>Your current PDF, cues, page setup, dividers, headers, and appearance settings are stored automatically in this browser.</li>
                      <li>The previous session is restored automatically after a browser reload or return visit—no restore prompt is required.</li>
                      <li><strong>Recover Autosave</strong> can manually reload the browser-stored copy if needed.</li>
                      <li>Opening another PDF warns that it replaces the current PDF and cues. Remove PDF clears the document and its autosave.</li>
                    </ul>
                  </article>
                </div>

                <article className="shortcut-card">
                  <h3>Keyboard &amp; pointer shortcuts</h3>
                  <div className="shortcut-grid">
                    <kbd>Esc</kbd><span>Cancel a pending cue, clear selection, and return to Pointer.</span>
                    <kbd>Delete / Backspace</kbd><span>Remove the selected cue, divider, or header when it is not locked.</span>
                    <kbd>Ctrl/Cmd + Z</kbd><span>Undo the last cue action.</span>
                    <kbd>Ctrl/Cmd + Shift + Z</kbd><span>Redo the last undone action.</span>
                    <kbd>Ctrl/Cmd + Y</kbd><span>Redo on Windows-style keyboards.</span>
                    <kbd>Ctrl/Cmd + S</kbd><span>Download a timestamped project copy.</span>
                    <kbd>Ctrl/Cmd + D</kbd><span>Duplicate selected unlocked cues.</span>
                    <kbd>Arrow keys</kbd><span>Nudge selected cues; use Shift for 10 units or Alt/Option for 0.25 units.</span>
                    <kbd>Ctrl/Cmd-click</kbd><span>Toggle cues in a multiple selection.</span>
                    <kbd>Shift-click</kbd><span>Select a visible range in the cue list.</span>
                    <kbd>Pointer drag</kbd><span>Marquee-select visible cues intersecting the selection box.</span>
                    <kbd>Double-click</kbd><span>Edit a cue, fade, block, or header label, or open the Text box Inspector.</span>
                    <kbd>Ctrl/Cmd + B / I / U</kbd><span>Toggle bold, italic, or underline on selected text in the Text box editor.</span>
                    <kbd>Drag</kbd><span>Move cues, dividers, and headers, or adjust visible handles.</span>
                    <kbd>F / 5</kbd><span>Select Fade. Use B / 6 to select Block.</span>
                  </div>
                </article>

                <p className="help-docs-link">Full documentation: <a href="https://github.com/staljabro/script-markup-app/tree/main/docs" target="_blank" rel="noreferrer">GitHub documentation handbook</a></p>
              </div>
            </section>
          </div>
        )}

        <div className={`pdf-pages pdf-pages--${pageLayout}`}>
        {pages.map((p, pageIndex) => {
          const documentOffset = notesPageSide === "left" ? p.width : 0;
          const combinedWidth = notesPageSide === "off" ? p.width : p.width * 2;
          return (
          <div
            key={pageIndex}
            id={`pdf-page-${pageIndex}`}
            className={`pdf-page${notesPageSide !== "off" ? " pdf-page--combined" : ""}`}
            style={{
              width: `${combinedWidth * displayScale}px`,
              height: `${p.height * displayScale}px`,
            }}
          >
            {notesPageSide !== "off" && (
              <div
                className="pdf-notes-surface"
                style={{
                  position: "absolute",
                  left: `${(notesPageSide === "left" ? 0 : p.width) * displayScale}px`,
                  width: `${p.width * displayScale}px`,
                  height: "100%",
                }}
              />
            )}
            <div
              ref={(el) => {
                if (!el) return;
                p.canvas.style.display = "block";
                p.canvas.style.width = "100%";
                p.canvas.style.height = "100%";
                if (el.firstChild !== p.canvas) el.replaceChildren(p.canvas);
              }}
              style={{
                position: "absolute",
                left: `${documentOffset * displayScale}px`,
                width: `${p.width * displayScale}px`,
                height: "100%",
              }}
            />

            <svg
              data-cue-page-index={pageIndex}
              data-coordinate-offset={documentOffset}
              width={combinedWidth}
              height={p.height}
              viewBox={`0 0 ${combinedWidth} ${p.height}`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "all",
              }}
              onMouseDown={(event) => startMarqueeSelection(event, pageIndex, documentOffset)}
              onClick={(e) => {
                if (suppressNextSvgClickRef.current) {
                  suppressNextSvgClickRef.current = false;
                  return;
                }

                if (e.target !== e.currentTarget) return;

                const rect = e.currentTarget.getBoundingClientRect();
                const scaleX = combinedWidth / rect.width;
                const scaleY = p.height / rect.height;

                addCue(
                  pageIndex,
                  (e.clientX - rect.left) * scaleX - documentOffset,
                  (e.clientY - rect.top) * scaleY
                );
              }}
            >
              <g transform={`translate(${documentOffset} 0)`}>
              {selectionBox?.page === pageIndex && <rect
                className="cue-selection-marquee"
                x={Math.min(selectionBox.x1, selectionBox.x2)}
                y={Math.min(selectionBox.y1, selectionBox.y2)}
                width={Math.abs(selectionBox.x2 - selectionBox.x1)}
                height={Math.abs(selectionBox.y2 - selectionBox.y1)}
                pointerEvents="none"
              />}
              {dividers.filter((divider) => divider.surface === "pdf" || notesPageSide !== "off").map((divider) => {
                const dividerX = divider.surface === "pdf"
                  ? divider.position * p.width
                  : notesPageSide === "left"
                    ? (divider.position - 1) * p.width
                    : (1 + divider.position) * p.width;
                return (
                  <g
                    key={divider.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dividersLocked || suppressNextSvgClickRef.current) return;
                      setSelectedCueId(null);
                      setSelectedHeaderId(null);
                      setSelectedDividerId(divider.id);
                    }}
                  >
                    {selectedDividerId === divider.id && !dividersLocked && (
                      <line
                        x1={dividerX}
                        y1={0}
                        x2={dividerX}
                        y2={p.height}
                        stroke="#facc15"
                        strokeWidth={dividerAppearance.lineWidth + 4}
                        pointerEvents="none"
                      />
                    )}
                    <line
                      x1={dividerX}
                      y1={0}
                      x2={dividerX}
                      y2={p.height}
                      stroke={dividerAppearance.color}
                      strokeWidth={dividerAppearance.lineWidth}
                    />
                    <line
                      x1={dividerX}
                      y1={0}
                      x2={dividerX}
                      y2={p.height}
                      stroke="transparent"
                      strokeWidth={14}
                      style={{ cursor: dividersLocked ? "default" : "ew-resize" }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (dividersLocked) return;
                        e.preventDefault();
                        const svg = e.currentTarget.ownerSVGElement;
                        const rect = svg.getBoundingClientRect();
                        let moved = false;

                        const move = (event) => {
                          moved = true;
                          const displayX = (event.clientX - rect.left)
                            * (svg.viewBox.baseVal.width / rect.width);
                          const onPdfPage = displayX >= documentOffset
                            && displayX <= documentOffset + p.width;
                          const surface = onPdfPage || notesPageSide === "off" ? "pdf" : "calling";
                          const localX = surface === "pdf"
                            ? displayX - documentOffset
                            : notesPageSide === "left" ? displayX : displayX - p.width;
                          const position = Math.max(0, Math.min(1, localX / p.width));
                          setDividers((current) => current.map((item) =>
                            item.id === divider.id ? { ...item, surface, position } : item
                          ));
                        };

                        const up = () => {
                          if (moved) markDirty();
                          suppressNextSvgClickRef.current = moved;
                          setTimeout(() => { suppressNextSvgClickRef.current = false; }, 0);
                          window.removeEventListener("mousemove", move);
                          window.removeEventListener("mouseup", up);
                        };

                        window.addEventListener("mousemove", move);
                        window.addEventListener("mouseup", up);
                      }}
                    />
                  </g>
                );
              })}
              {headers.filter((header) => header.surface === "pdf" || notesPageSide !== "off").map((header) => {
                const headerX = header.surface === "pdf"
                  ? header.x * p.width
                  : notesPageSide === "left"
                    ? (header.x - 1) * p.width
                    : (1 + header.x) * p.width;
                const headerY = header.y * p.height;
                return (
                  <text
                    key={header.id}
                    x={headerX}
                    y={headerY}
                    fill={headerAppearance.color}
                    fontSize={headerAppearance.textSize}
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    stroke={selectedHeaderId === header.id && !dividersLocked ? "#facc15" : "none"}
                    strokeWidth={selectedHeaderId === header.id && !dividersLocked ? 3 : 0}
                    paintOrder="stroke"
                    style={{ cursor: dividersLocked ? "default" : "move", userSelect: "none" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dividersLocked || suppressNextSvgClickRef.current) return;
                      setSelectedCueId(null);
                      setSelectedDividerId(null);
                      setSelectedHeaderId(header.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      editHeaderWithPrompt(header);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (dividersLocked) return;
                      e.preventDefault();
                      const svg = e.currentTarget.ownerSVGElement;
                      const rect = svg.getBoundingClientRect();
                      let moved = false;

                      const move = (event) => {
                        moved = true;
                        const displayX = (event.clientX - rect.left) * (svg.viewBox.baseVal.width / rect.width);
                        const displayY = (event.clientY - rect.top) * (svg.viewBox.baseVal.height / rect.height);
                        const onPdfPage = displayX >= documentOffset && displayX <= documentOffset + p.width;
                        const surface = onPdfPage || notesPageSide === "off" ? "pdf" : "calling";
                        const localX = surface === "pdf"
                          ? displayX - documentOffset
                          : notesPageSide === "left" ? displayX : displayX - p.width;
                        const x = Math.max(0, Math.min(1, localX / p.width));
                        const y = Math.max(0.02, Math.min(1, displayY / p.height));
                        setHeaders((current) => current.map((item) =>
                          item.id === header.id ? { ...item, surface, x, y } : item
                        ));
                      };

                      const up = () => {
                        if (moved) markDirty();
                        suppressNextSvgClickRef.current = moved;
                        setTimeout(() => { suppressNextSvgClickRef.current = false; }, 0);
                        window.removeEventListener("mousemove", move);
                        window.removeEventListener("mouseup", up);
                      };
                      window.addEventListener("mousemove", move);
                      window.addEventListener("mouseup", up);
                    }}
                  >{header.text}</text>
                );
              })}
              {cues
                .filter((c) => c.page === pageIndex && !hiddenCueTypes[c.type])
                .map((cue) => {
                  const cueProperties = getCueProperties(cue);
                  const color = cueProperties.color;
                  const cueStyle = cueProperties.style;

                  if (isBlockCue(cue.type)) {
                    const width = cue.right - cue.left;
                    const height = cue.bottom - cue.top;
                    const corners = [
                      ["nw", cue.left, cue.top],
                      ["ne", cue.right, cue.top],
                      ["sw", cue.left, cue.bottom],
                      ["se", cue.right, cue.bottom],
                    ];
                    return (
                      <g
                        key={cue.id}
                        ref={(el) => { cueRefs.current[cue.id] = el; }}
                        onClick={(e) => selectCueFromClick(e, cue.id)}
                      >
                        <rect
                          x={cue.left}
                          y={cue.top}
                          width={width}
                          height={height}
                          fill={cueProperties.blockAppearance.fillEnabled ? cueProperties.blockAppearance.fillColor : "none"}
                          fillOpacity={cueProperties.blockAppearance.fillOpacity}
                          stroke={cueProperties.blockAppearance.lineEnabled ? color : "none"}
                          strokeWidth={cueStyle.lineWidth}
                        />
                        {selectedCueIds.includes(cue.id) && (
                          <rect
                            x={cue.left - 2}
                            y={cue.top - 2}
                            width={width + 4}
                            height={height + 4}
                            fill="none"
                            stroke="#facc15"
                            strokeWidth={2}
                            strokeDasharray="5 4"
                            pointerEvents="none"
                          />
                        )}
                        <rect
                          x={cue.left}
                          y={cue.top}
                          width={width}
                          height={height}
                          fill="transparent"
                          stroke="transparent"
                          strokeWidth={12}
                          style={{ cursor: "move" }}
                          onMouseDown={(e) => startDragBlock(e, cue.id)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            updateCue(cue.id);
                          }}
                        />
                        {cue.type === "TEXTBOX" ? (
                          <g pointerEvents="none" fill={color} fontFamily="Arial" fontSize={cueStyle.textSize}>
                            {layoutTextBox(cue, cueStyle.textSize, measureTextBox).lines.map((line, row) => (
                              <text key={row} xmlSpace="preserve" y={cue.top + 6 + cueStyle.textSize + row * cueStyle.textSize * 1.25}>
                                {line.map((char, i) => <tspan key={i} x={cue.left + 6 + char.x} fontWeight={char.bold ? "bold" : "normal"} fontStyle={char.italic ? "italic" : "normal"} textDecoration={[char.underline && "underline", char.strike && "line-through"].filter(Boolean).join(" ") || undefined}>{char.text}</tspan>)}
                              </text>
                            ))}
                            {layoutTextBox(cue, cueStyle.textSize, measureTextBox).overflow && <text x={cue.right - 16} y={cue.bottom - 2} fill="#dc2626" fontSize={12}>…</text>}
                          </g>
                        ) : <text
                          x={cue.left}
                          y={cue.top - 6}
                          fill={color}
                          fontWeight="bold"
                          fontSize={cueStyle.textSize}
                          style={{ cursor: "move", userSelect: "none" }}
                          onMouseDown={(e) => startDragBlock(e, cue.id)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            updateCue(cue.id);
                          }}
                        >
                          {getCueDisplayText(cue)}
                        </text>}
                        {corners.map(([corner, x, y]) => (
                          <circle
                            key={corner}
                            cx={x}
                            cy={y}
                            r={6}
                            fill="white"
                            stroke={color}
                            strokeWidth={2}
                            style={{ cursor: `${corner}-resize` }}
                            onMouseDown={(e) => startDragBlockCorner(e, cue.id, corner)}
                          />
                        ))}
                      </g>
                    );
                  }

                  if (cue.type === "FADE") {
                    const fadeText = getFadeTextPosition(cue, cueStyle.textSize);
                    return (
                      <g
                        key={cue.id}
                        ref={(el) => { cueRefs.current[cue.id] = el; }}
                        onClick={(e) => selectCueFromClick(e, cue.id)}
                      >
                        <line
                          x1={cue.x}
                          y1={cue.y}
                          x2={cue.x2}
                          y2={cue.y2}
                          stroke={selectedCueIds.includes(cue.id) ? "yellow" : color}
                          strokeWidth={selectedCueIds.includes(cue.id) ? cueStyle.lineWidth + 4 : cueStyle.lineWidth}
                          strokeLinecap="square"
                        />
                        {selectedCueIds.includes(cue.id) && (
                          <line
                            x1={cue.x}
                            y1={cue.y}
                            x2={cue.x2}
                            y2={cue.y2}
                            stroke={color}
                            strokeWidth={cueStyle.lineWidth}
                            strokeLinecap="square"
                          />
                        )}
                        <line
                          x1={cue.x}
                          y1={cue.y}
                          x2={cue.x2}
                          y2={cue.y2}
                          stroke="transparent"
                          strokeWidth={12}
                          style={{ cursor: "move" }}
                          onMouseDown={(e) => startDragFade(e, cue.id)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            updateCue(cue.id);
                          }}
                        />
                        <text
                          x={fadeText.x}
                          y={fadeText.y}
                          fill={color}
                          fontWeight="bold"
                          fontSize={cueStyle.textSize}
                          textAnchor="middle"
                          style={{ cursor: "move", userSelect: "none" }}
                          onMouseDown={(e) => startDragFade(e, cue.id)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            updateCue(cue.id);
                          }}
                        >
                          {getCueDisplayText(cue)}
                        </text>
                        {selectedCueIds.includes(cue.id) && (
                          <>
                            <circle
                              cx={cue.x}
                              cy={cue.y}
                              r={6}
                              fill="white"
                              stroke={color}
                              strokeWidth={2}
                              style={{ cursor: "grab" }}
                              onMouseDown={(e) => startDragFadeHandle(e, cue.id, "start")}
                            />
                            <circle
                              cx={cue.x2}
                              cy={cue.y2}
                              r={6}
                              fill="white"
                              stroke={color}
                              strokeWidth={2}
                              style={{ cursor: "grab" }}
                              onMouseDown={(e) => startDragFadeHandle(e, cue.id, "end")}
                            />
                          </>
                        )}
                      </g>
                    );
                  }

                  if (isFreeCue(cue.type)) {
                    return (
                      <text
                        key={cue.id}
                        ref={(el) => {
                          cueRefs.current[cue.id] = el;
                        }}
                        x={cue.x}
                        y={cue.y}
                        fill={color}
                        fontWeight="bold"
                        fontSize={cueStyle.textSize}
                        stroke={selectedCueIds.includes(cue.id) ? "yellow" : "none"}
                        strokeWidth={selectedCueIds.includes(cue.id) ? 3 : 0}
                        style={{ cursor: "grab", userSelect: "none" }}
                        onClick={(e) => selectCueFromClick(e, cue.id)}
                        onMouseDown={(e) => startDragFreeCue(e, cue.id)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          updateCue(cue.id);
                        }}
                      >
                        {getCueDisplayText(cue)}
                      </text>
                    );
                  }

                  const marginX = cueProperties.margin;
                  const marginCueLayout = getMarginCueLayout(cue, marginX, cueStyle);

                  return (
                    <g
                      key={cue.id}
                      ref={(el) => {
                        cueRefs.current[cue.id] = el;
                      }}
                      onClick={(e) => selectCueFromClick(e, cue.id)}
                    >
                      {hasLines(cue.type) && (
                        <>
                          <line
                            x1={cue.x}
                            y1={cue.y - marginCueLayout.markerHalfHeight}
                            x2={cue.x}
                            y2={cue.y + marginCueLayout.markerHalfHeight}
                            stroke={color}
                            strokeWidth={cueStyle.lineWidth}
                            strokeLinecap="square"
                            opacity={cueStyle.viewCueLine !== false && cueStyle.viewCuePoint !== false ? 1 : 0.5}
                            strokeDasharray={cueStyle.viewCueLine !== false && cueStyle.viewCuePoint !== false ? undefined : "5 5"}
                          />

                          <line
                            x1={cue.x}
                            y1={cue.y - marginCueLayout.markerHalfHeight}
                            x2={cue.x}
                            y2={cue.y + marginCueLayout.markerHalfHeight}
                            stroke="transparent"
                            strokeWidth={12}
                            style={{ cursor: "move" }}
                            onMouseDown={(e) => startDragCueLine(e, cue.id)}
                          />

                          <line
                            x1={cue.x}
                            y1={marginCueLayout.lineY}
                            x2={marginX}
                            y2={marginCueLayout.lineY}
                            stroke={color}
                            strokeWidth={cueStyle.lineWidth}
                            strokeLinecap="square"
                            opacity={cueStyle.viewCueLine !== false ? 1 : 0.5}
                            strokeDasharray={cueStyle.viewCueLine !== false ? undefined : "5 5"}
                          />
                        </>
                      )}

                      {selectedCueIds.includes(cue.id) && (
                        <rect
                          x={marginCueLayout.textAnchor === "end" ? marginX - 85 : marginX}
                          y={marginCueLayout.textY - cueStyle.textSize}
                          width={80}
                          height={cueStyle.textSize + 8}
                          fill="yellow"
                          opacity="0.25"
                        />
                      )}

                      <text
                        x={marginCueLayout.textX}
                        y={marginCueLayout.textY}
                        textAnchor={marginCueLayout.textAnchor}
                        fill={color}
                        fontWeight="bold"
                        fontSize={cueStyle.textSize}
                        style={{
                          cursor: cue.type === "DCA" ? "ns-resize" : "move",
                          userSelect: "none",
                        }}
                        onMouseDown={cue.type === "DCA"
                          ? (e) => startDragDcaCue(e, cue.id)
                          : (e) => startDragCueLine(e, cue.id)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          updateCue(cue.id);
                        }}
                      >
                        {getCueDisplayText(cue)}
                      </text>
                    </g>
                  );
                })}

              {mode === "FADE" && fadeStart?.page === pageIndex && (
                <circle
                  cx={fadeStart.x}
                  cy={fadeStart.y}
                  r={6}
                  fill={colors.FADE}
                  stroke="white"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              )}

              {isBlockCue(mode) && blockStart?.page === pageIndex && (
                <circle
                  cx={blockStart.x}
                  cy={blockStart.y}
                  r={6}
                  fill={colors.BLOCK}
                  stroke="white"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              )}

              {Object.keys(margins).map((type) => (
                <g key={type} onClick={(e) => e.stopPropagation()}>
                  <line
                    x1={margins[type]}
                    y1={0}
                    x2={margins[type]}
                    y2={p.height}
                    stroke={colors[type]}
                    strokeDasharray="5"
                    strokeWidth={type === mode ? 2 : 1}
                    opacity={type === mode ? 1 : 0.55}
                  />

                  <rect
                    x={margins[type] - 6}
                    y={0}
                    width={12}
                    height={p.height}
                    fill="transparent"
                    style={{ cursor: lockedCueTypes[type] ? "default" : "ew-resize" }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (lockedCueTypes[type]) return;

                      const svg = e.currentTarget.ownerSVGElement;
                      const rect = svg.getBoundingClientRect();

                      const move = (ev) => {
                        const scaleX = svg.viewBox.baseVal.width / rect.width;
                        const coordinateOffset = Number(svg.dataset.coordinateOffset || 0);
                        const newX = (ev.clientX - rect.left) * scaleX - coordinateOffset;

                        setMargins((m) => ({
                          ...m,
                          [type]: newX,
                        }));
                        markDirty();
                      };

                      const up = () => {
                        suppressNextSvgClickRef.current = true;
                        setTimeout(() => {
                          suppressNextSvgClickRef.current = false;
                        }, 0);

                        window.removeEventListener("mousemove", move);
                        window.removeEventListener("mouseup", up);
                      };

                      window.addEventListener("mousemove", move);
                      window.addEventListener("mouseup", up);
                    }}
                  />
                </g>
              ))}
              </g>
              <line
                x1={p.width}
                y1={0}
                x2={p.width}
                y2={p.height}
                stroke="#7b8794"
                strokeWidth={notesPageSide === "off" ? 0 : 1.5}
                pointerEvents="none"
              />
            </svg>
          </div>
          );
        })}
        </div>
      </main>

      {showCueList && (
        <aside className="cue-list-panel" style={{ width: cueListWidth }}>
          <div className="panel-resize-handle panel-resize-handle--right" onMouseDown={(event) => startPanelResize(event, "left", setCueListWidth, "scriptMarkupCueListWidth")} />
          <h3 style={{ marginTop: 0 }}>Cue List</h3>

          {selectedCueIds.length > 0 && <div className="selection-actions">
            <strong>{selectedCueIds.length} selected</strong>
            <button type="button" onClick={duplicateSelectedCues}>Duplicate</button>
            <button type="button" onClick={copySelectedCueProperties}>Copy properties</button>
            <button type="button" disabled={!hasCopiedCueProperties} onClick={pasteSelectedCueProperties}>Paste properties</button>
            <button type="button" onClick={resetSelectedCueProperties}>Reset properties</button>
            <button type="button" disabled={selectedCueIds.length < 2} onClick={() => alignSelectedCues("x")}>Align X</button>
            <button type="button" disabled={selectedCueIds.length < 2} onClick={() => alignSelectedCues("y")}>Align Y</button>
            <button type="button" disabled={selectedCueIds.length < 3} onClick={distributeSelectedCues}>Distribute Y</button>
            <label>Move to page <select value="" onChange={(event) => { if (event.target.value !== "") moveSelectedCuesToPage(Number(event.target.value)); }}><option value="">Choose…</option>{pages.map((_, index) => <option key={index} value={index}>{index + 1}</option>)}</select></label>
          </div>}

          <input
            className="cue-search"
            placeholder="Search cues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button
            className={`cue-filter-trigger ${showCueFilters ? "is-expanded" : ""}`}
            onClick={() => setShowCueFilters((visible) => !visible)}
            aria-expanded={showCueFilters}
          >
            <span>Filters</span>
            <span className="cue-filter-summary">
              {availableCueTypes.filter((type) => cueTypeFilters[type] !== false).length}/{availableCueTypes.length}
            </span>
            <span className="cue-filter-chevron">
              <MaterialIcon path={showCueFilters ? mdiMinusBoxOutline : mdiPlusBoxOutline} />
            </span>
          </button>

          {showCueFilters && (
          <div className="cue-filter-card">
            <div
              style={{
                marginBottom: 6,
                fontWeight: "bold",
                fontSize: 12,
              }}
            >
              Cue Types
            </div>

            {availableCueTypes.map((type) => (
              <label
                key={type}
                style={{
                  display: "block",
                  fontSize: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={cueTypeFilters[type]}
                  onChange={() =>
                    toggleCueTypeFilter(type)
                  }
                />{" "}
                <span
                  style={{
                    color: colors[type],
                    fontWeight: "bold",
                  }}
                >
                  {getDisplayCueTypeLabel(type)}
                </span>
                {hiddenCueTypes[type] && <span className="hidden-status">(Hidden)</span>}
              </label>
            ))}

            <label className="custom-cues-filter">
              <input type="checkbox" checked={showCustomCuesOnly} onChange={(e) => setShowCustomCuesOnly(e.target.checked)} />{" "}
              <span>Custom cues only</span>
            </label>

            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 4,
              }}
            >
              <button
                style={{ flex: 1 }}
                onClick={showAllCueTypes}
              >
                All
              </button>

              <button
                style={{ flex: 1 }}
                onClick={hideAllCueTypes}
              >
                None
              </button>
            </div>
          </div>
          )}

          <div
            style={{
              marginBottom: 8,
              fontSize: 12,
              opacity: 0.75,
            }}
          >
            Showing {filteredCues.length} of {cues.length}
          </div>

          {filteredCues.length === 0 && <div className="cue-list-empty">{cues.length ? "No cues match the current search and filters." : "No cues yet. Choose a cue tool and click a page to add one."}</div>}

          {filteredCues.map((cue) => (
            <div
              key={cue.id}
              onClick={(event) => jumpToCue(cue, event)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") jumpToCue(cue);
              }}
              role="button"
              tabIndex={0}
              className={`cue-list-item${selectedCueIds.includes(cue.id) ? " is-selected" : ""}${hiddenCueTypes[cue.type] ? " is-hidden" : ""}`}
              style={{
                "--cue-color": getCueProperties(cue).color,
              }}
            >
              <strong
                style={{
                  color: getCueProperties(cue).color,
                }}
              >
                {getDisplayCueTypeLabel(cue.type)}
              </strong>{" "}
              {editingCueId === cue.id ? (
                <input
                  className="cue-name-editor"
                  aria-label={`Rename ${getDisplayCueTypeName(cue.type)} cue`}
                  value={cueNameDraft}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setCueNameDraft(e.target.value)}
                  onBlur={() => commitCueName(cue)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") commitCueName(cue);
                    if (e.key === "Escape") setEditingCueId(null);
                  }}
                />
              ) : (
                <button
                  className="cue-name-display"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey || e.ctrlKey || e.metaKey) jumpToCue(cue, e);
                    else beginEditingCueName(cue);
                  }}
                  title="Rename cue"
                >
                  <span>{getCueDisplayText(cue)}</span>
                </button>
              )}

              <button
                type="button"
                className="cue-inspector-button"
                aria-label={`Inspect ${cue.label}`}
                title="Open cue inspector"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCueId(cue.id);
                  setShowOptionsDrawer(false);
                  setShowInspector(true);
                }}
              >
                <MaterialIcon path={mdiPencil} />
              </button>

              <br />

              <small>
                Page {cue.page + 1}{(() => {
                  const anchorX = cue.left ?? cue.x;
                  const width = pages[cue.page]?.width;
                  const marginX = isMarginCue(cue.type) ? getCueProperties(cue).margin : null;
                  const hasCallingContent = width && (
                    anchorX < 0 || anchorX > width
                    || (typeof marginX === "number" && (marginX < 0 || marginX > width))
                  );
                  return hasCallingContent ? " · Prompt/Showcall" : "";
                })()}{cue.customPropertiesEnabled ? " - Custom cue properties" : ""}
              </small>
            </div>
          ))}
        </aside>
      )}

    </div>
  );
}
