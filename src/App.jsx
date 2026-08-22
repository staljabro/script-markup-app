import { useEffect, useRef, useState } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  mdiAlertCircleOutline,
  mdiBackupRestore,
  mdiBorderNoneVariant,
  mdiCursorDefault,
  mdiContentSaveEditOutline,
  mdiContentSaveOutline,
  mdiDeleteOutline,
  mdiFileExportOutline,
  mdiFilePdfBox,
  mdiFolderOpenOutline,
  mdiEye,
  mdiFormatListBulletedSquare,
  mdiFormatPageSplit,
  mdiMarker,
  mdiMinusBoxOutline,
  mdiNoteTextOutline,
  mdiPageNextOutline,
  mdiPencil,
  mdiPlusBoxOutline,
  mdiSineWave,
  mdiTrendingUp,
  mdiTuneVertical,
} from "@mdi/js";
import { usePdfRenderer } from "./hooks/usePdfRenderer";
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
const FREE_CUE_TYPES = ["NOTE", "WARN", "MARK"];
const LINE_CUE_TYPES = ["FADE"];
const AREA_CUE_TYPES = ["BLOCK"];
const ALL_CUE_TYPES = [...MARGIN_CUE_TYPES, ...LINE_CUE_TYPES, ...AREA_CUE_TYPES, ...FREE_CUE_TYPES];

const isMarginCue = (type) => MARGIN_CUE_TYPES.includes(type);
const isFreeCue = (type) => FREE_CUE_TYPES.includes(type);
const hasLines = (type) => type === "SFX" || type === "TM" || type === "FADE";
const getCueTypeName = (type) => (type === "TM" ? "Scene" : type);
const getCueTypeOptionLabel = (type) =>
  type === "TM" ? "SCENE" : type;
const getCueTypeAbbreviation = (type) => (type === "TM" ? "SCENE" : type);
const FADE_TEXT_PADDING = 14;
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
  { type: "WARN", label: "Warn", icon: mdiAlertCircleOutline },
  { type: "MARK", label: "Mark", icon: mdiMarker },
  { type: "FADE", label: "Fade", icon: mdiTrendingUp },
  { type: "BLOCK", label: "Block", icon: mdiBorderNoneVariant },
];

function MaterialIcon({ path }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>;
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
  const [showCueFilters, setShowCueFilters] = useState(false);
  const [selectedCueId, setSelectedCueId] = useState(null);
  const [editingCueId, setEditingCueId] = useState(null);
  const [cueNameDraft, setCueNameDraft] = useState("");
  const [fadeStart, setFadeStart] = useState(null);
  const [blockStart, setBlockStart] = useState(null);

  const [showCueList, setShowCueList] = useState(true);
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
  const [fileActionInProgress, setFileActionInProgress] = useState(null);
  const [showOptionsDrawer, setShowOptionsDrawer] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [expandedCueType, setExpandedCueType] = useState("SFX");
  const [showCallingPageOptions, setShowCallingPageOptions] = useState(false);
  const [showDecorationOptions, setShowDecorationOptions] = useState(false);

  const [cueTypeFilters, setCueTypeFilters] = useState(() =>
    Object.fromEntries(
      ALL_CUE_TYPES.map((type) => [type, true])
    )
  );
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

  const [margins, setMargins] = useState({
    SFX: 150,
    TM: 100,
    DCA: 50,
  });

  const [colors, setColors] = useState({
    POINTER: "#5b6474",
    SFX: "#cc00cc",
    TM: "#0000ff",
    DCA: "#ff0000",
    FADE: "#008000",
    BLOCK: "#c9c9c9",
    NOTE: "#8a2be2",
    WARN: "#ff8c00",
    MARK: "#00a6a6",
  });

  const [styles, setStyles] = useState({
    POINTER: { textSize: 20, lineWidth: 1.5 },
    SFX: { textSize: 20, lineWidth: 1.5 },
    TM: { textSize: 20, lineWidth: 1.5 },
    DCA: { textSize: 20, lineWidth: 1.5 },
    FADE: { textSize: 20, lineWidth: 1.5 },
    BLOCK: { textSize: 20, lineWidth: 1.5 },
    NOTE: { textSize: 20, lineWidth: 1.5 },
    WARN: { textSize: 20, lineWidth: 1.5 },
    MARK: { textSize: 20, lineWidth: 1.5 },
  });

  const [blockAppearance, setBlockAppearance] = useState({
    fillColor: "#ffffff",
    fillOpacity: 0.25,
    lineEnabled: true,
    fillEnabled: true,
  });

  const markDirty = () => setIsDirty(true);

  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  const createProjectData = () => {
    if (!pdfBytes) return null;

    return {
      app: "cue-pdf-annotator",
      version: 1,
      savedAt: new Date().toISOString(),
      pdfBase64: arrayBufferToBase64(pdfBytes),
      cues,
      margins,
      colors,
      styles,
      blockAppearance,
      documentName,
      hiddenCueTypes,
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
      alert("Project file does not contain a PDF.");
      return;
    }

    const pdfBuffer = base64ToArrayBuffer(project.pdfBase64);
    const pdfBytesForFile = new Uint8Array(pdfBuffer);

    const pdfFile = new File([pdfBytesForFile], "project.pdf", {
      type: "application/pdf",
    });

    await loadPdf(pdfFile);

    setCues(project.cues || []);
    setUndoStack([]);
    setRedoStack([]);
    setDocumentName(project.documentName || "Untitled");
    setMargins(project.margins || margins);
    setColors((current) => ({ ...current, ...(project.colors || {}) }));
    setStyles((current) => ({ ...current, ...(project.styles || {}) }));
    setBlockAppearance((current) => ({
      ...current,
      ...(project.blockAppearance || {}),
    }));
    setHiddenCueTypes((current) => ({
      ...current,
      ...(project.hiddenCueTypes || {}),
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

  const pushUndo = (snapshot) => {
    setRedoStack([]);
    setUndoStack((prev) =>
      [snapshot.map((cue) => ({ ...cue })), ...prev].slice(0, 10)
    );
  };

  const redoLastCueAction = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const [nextSnapshot, ...remaining] = prev;
      setUndoStack((undo) => [cues.map((cue) => ({ ...cue })), ...undo].slice(0, 10));
      setCues(nextSnapshot);
      markDirty();
      return remaining;
    });
  };

  const undoLastCueAction = () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;

      const [lastSnapshot, ...remaining] = prev;
      setRedoStack((redo) => [cues.map((cue) => ({ ...cue })), ...redo].slice(0, 10));
      setCues(lastSnapshot);
      markDirty();

      return remaining;
    });
  };

  const saveProjectAsNative = async () => {
    const project = createProjectData();

    if (!project) {
      alert("Load a PDF before saving a project.");
      return false;
    }

    const suggestedName = `${getSafeProjectName(documentName)}.cueproj`;
    const savedName = await writeProjectFileAs(project, suggestedName);
    if (!savedName) return false;
    setCurrentProjectPath(savedName);
    setIsDirty(false);
    alert(`Project saved successfully as "${savedName}".`);

    return true;
  };

  const saveCurrentProjectNative = async () => {
    const project = createProjectData();

    if (!project) {
      alert("Load a PDF before saving a project.");
      return false;
    }

    const fileName = `${getSafeProjectName(documentName)}_${getTimestamp()}.cueproj`;
    await writeProjectFile(fileName, project);
    setCurrentProjectPath(fileName);

    setIsDirty(false);
    alert(`Project saved successfully as "${fileName}".`);

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
      documentName,
      notesPageSide,
      callingPageSide,
      dividers,
      headers,
      dividersLocked,
      dividerAppearance,
      headerAppearance,
    };
  }, [pdfBytes, cues, margins, colors, styles, blockAppearance, hiddenCueTypes, documentName, notesPageSide, callingPageSide, dividers, headers, dividersLocked, dividerAppearance, headerAppearance]);

  useEffect(() => {
    const saveSession = async () => {
      const latest = autosaveStateRef.current;
      if (!latest?.pdfBytes) return;

      try {
        const project = {
          app: "cue-pdf-annotator",
          version: 1,
          savedAt: new Date().toISOString(),
          pdfBase64: arrayBufferToBase64(latest.pdfBytes),
          cues: latest.cues,
          margins: latest.margins,
          colors: latest.colors,
          styles: latest.styles,
          blockAppearance: latest.blockAppearance,
          hiddenCueTypes: latest.hiddenCueTypes,
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
  }, [pdfBytes, cues, margins, colors, styles, blockAppearance, hiddenCueTypes, documentName, notesPageSide, callingPageSide, dividers, headers, dividersLocked, dividerAppearance, headerAppearance]);

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

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;

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

        setCues((prev) => prev.filter((cue) => cue.id !== selectedCueId));
        setSelectedCueId(null);
        setSelectedDividerId(null);
        setSelectedHeaderId(null);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedCueId(null);
        setSelectedDividerId(null);
        setSelectedHeaderId(null);
        setFadeStart(null);
        setBlockStart(null);
        setMode("POINTER");
        return;
      }

      const key = e.key.toLowerCase();

      if (["s", "t", "d", "n", "w", "m", "f", "b", "1", "2", "3", "4", "5", "6", "7", "8"].includes(key)) {
        setFadeStart(null);
        setBlockStart(null);
      }

      if (key === "s" || key === "1") setMode("SFX");
      if (key === "t" || key === "2") setMode("TM");
      if (key === "d" || key === "3") setMode("DCA");
      if (key === "n" || key === "4") setMode("NOTE");
      if (key === "w" || key === "5") setMode("WARN");
      if (key === "m" || key === "6") setMode("MARK");
      if (key === "f" || key === "7") setMode("FADE");
      if (key === "b" || key === "8") setMode("BLOCK");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoStack, redoStack, cues, selectedCueId, selectedDividerId, selectedHeaderId, dividersLocked]);

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
      if (!window.confirm(message)) return false;
    }
    const selected = await choosePdfFile();
    if (!selected) return false;

    await loadPdf(selected.file);

    setCues([]);
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
    if (isDirty && !window.confirm("Remove this PDF and discard its unsaved cues?")) return false;

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
      alert(`Open project failed: ${String(err)}`);
      return false;
    }
  };

  const recoverAutosave = async () => {
    try {
      const { project } = await readAutosaveProject();
      await loadProjectData(project);
      setCurrentProjectPath(null);
      setIsDirty(true);
      alert("Autosave recovered. Save this project to keep it.");
      return true;
    } catch (err) {
      console.error("Autosave recovery failed:", err);
      alert("No autosave could be recovered.");
      return false;
    }
  };

  const addCue = (pageIndex, x, y) => {
    if (mode === "POINTER") {
      setSelectedCueId(null);
      setSelectedDividerId(null);
      setSelectedHeaderId(null);
      setFadeStart(null);
      setBlockStart(null);
      return;
    }
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

    if (mode === "BLOCK") {
      if (!blockStart || blockStart.page !== pageIndex) {
        setBlockStart({ page: pageIndex, x, y });
        return;
      }

      const start = blockStart;
      setBlockStart(null);

      pushUndo(cues);
      markDirty();
      setCues((prev) => [
        ...prev,
        {
          id: createId(),
          page: pageIndex,
          left: Math.min(start.x, x),
          top: Math.min(start.y, y),
          right: Math.max(start.x, x),
          bottom: Math.max(start.y, y),
          x: Math.min(start.x, x),
          y: Math.min(start.y, y),
          type: "BLOCK",
          label: "",
        },
      ]);
      return;
    }

    const label = prompt(`Enter ${getCueTypeName(mode)} Cue:`);
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

  const updateCue = (id) => {
    const cue = cues.find((c) => c.id === id);
    if (!cue) return;
    setSelectedCueId(null);

    const newLabel = prompt("Edit Cue:", cue.label);
    if (newLabel === null) return;
    if (!newLabel && cue.type !== "FADE" && cue.type !== "BLOCK") return;

    pushUndo(cues);
    markDirty();

    setCues((prev) =>
      prev.map((c) => (c.id === id ? { ...c, label: newLabel } : c))
    );
  };

  const startDragCueLine = (e, cueId) => {
    e.stopPropagation();
    e.preventDefault();

    const startSnapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let didMove = false;

    const move = (ev) => {
      const deltaX = Math.abs(ev.clientX - startClientX);
      const deltaY = Math.abs(ev.clientY - startClientY);
      if (deltaX > 2 || deltaY > 2) didMove = true;

      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const coordinateOffset = Number(svg.dataset.coordinateOffset || 0);
      const newX = (ev.clientX - rect.left) * scaleX - coordinateOffset;
      const newY = (ev.clientY - rect.top) * scaleY;

      setCues((prev) =>
        prev.map((c) =>
          c.id === cueId ? { ...c, x: newX, y: newY } : c
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

    const startSnapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let didMove = false;

    const move = (ev) => {
      const deltaX = Math.abs(ev.clientX - startClientX);
      const deltaY = Math.abs(ev.clientY - startClientY);
      if (deltaX > 2 || deltaY > 2) didMove = true;

      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const coordinateOffset = Number(svg.dataset.coordinateOffset || 0);
      const newX = (ev.clientX - rect.left) * scaleX - coordinateOffset;
      const newY = (ev.clientY - rect.top) * scaleY;

      setCues((prev) =>
        prev.map((c) => (c.id === cueId ? { ...c, x: newX, y: newY } : c))
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

    const startSnapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    const startClientY = e.clientY;
    let didMove = false;

    const move = (ev) => {
      if (Math.abs(ev.clientY - startClientY) > 2) didMove = true;

      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const newY = Math.max(
        0,
        Math.min(svg.viewBox.baseVal.height, (ev.clientY - rect.top) * scaleY)
      );

      setCues((prev) =>
        prev.map((cue) => cue.id === cueId ? { ...cue, y: newY } : cue)
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

    const original = cues.find((cue) => cue.id === cueId);
    if (!original) return;
    const startSnapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    const scaleX = svg.viewBox.baseVal.width / rect.width;
    const scaleY = svg.viewBox.baseVal.height / rect.height;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let didMove = false;

    const move = (event) => {
      const dx = (event.clientX - startClientX) * scaleX;
      const dy = (event.clientY - startClientY) * scaleY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didMove = true;

      setCues((current) => current.map((cue) =>
        cue.id === cueId
          ? {
              ...cue,
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
    e.stopPropagation();
    e.preventDefault();
    const original = cues.find((cue) => cue.id === cueId);
    if (!original) return;
    const snapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    const scaleX = svg.viewBox.baseVal.width / rect.width;
    const scaleY = svg.viewBox.baseVal.height / rect.height;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const move = (event) => {
      const dx = (event.clientX - startX) * scaleX;
      const dy = (event.clientY - startY) * scaleY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      setCues((current) => current.map((cue) => cue.id === cueId ? {
        ...cue,
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
      alert("Load a PDF first");
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
        const cueStyle = styles[cue.type] || { textSize: 10, lineWidth: 1.5 };

        const hex = colors[cue.type] || "#000000";
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const color = rgb(r, g, b);

        if (cue.type === "BLOCK") {
          const [pdfLeft, pdfBottom] = viewport.convertToPdfPoint(cue.left, cue.bottom);
          const [pdfRight, pdfTop] = viewport.convertToPdfPoint(cue.right, cue.top);
          const [labelX, labelY] = viewport.convertToPdfPoint(cue.left, cue.top - 6);
          const fillHex = blockAppearance.fillColor;
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
          if (blockAppearance.fillEnabled) {
            rectangleOptions.color = fillColor;
            rectangleOptions.opacity = blockAppearance.fillOpacity;
          }
          if (blockAppearance.lineEnabled) {
            rectangleOptions.borderColor = color;
            const [widthStart] = viewport.convertToPdfPoint(0, 0);
            const [widthEnd] = viewport.convertToPdfPoint(cueStyle.lineWidth, 0);
            rectangleOptions.borderWidth = Math.abs(widthEnd - widthStart);
          }
          if (blockAppearance.fillEnabled || blockAppearance.lineEnabled) {
            page.drawRectangle(rectangleOptions);
          }
          page.drawText(cue.label, {
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
          const textWidth = font.widthOfTextAtSize(cue.label, cueStyle.textSize);
          const [lineWidthStartX] = viewport.convertToPdfPoint(0, 0);
          const [lineWidthEndX] = viewport.convertToPdfPoint(cueStyle.lineWidth, 0);

          page.drawLine({
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            color,
            thickness: Math.abs(lineWidthEndX - lineWidthStartX),
          });
          page.drawText(cue.label, {
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

          page.drawText(cue.label, {
            x: textX,
            y: textY,
            size: cueStyle.textSize,
            font,
            color,
          });

          return;
        }

        const marginX = margins[cue.type];
        const lineHeight = 10;

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
          cue.y + lineHeight
        );

        const [hEndX, hEndY] = viewport.convertToPdfPoint(
          marginX,
          cue.y + lineHeight
        );

        const [textX, textY] = viewport.convertToPdfPoint(
          marginX + 5,
          cue.y + 5
        );

        const [lineWidthStartX] = viewport.convertToPdfPoint(0, 0);
        const [lineWidthEndX] = viewport.convertToPdfPoint(
          cueStyle.lineWidth,
          0
        );
        const pdfLineWidth = Math.abs(lineWidthEndX - lineWidthStartX);

        if (hasLines(cue.type)) {
          page.drawLine({
            start: { x: vTopX, y: vTopY },
            end: { x: vBottomX, y: vBottomY },
            color,
            thickness: pdfLineWidth,
          });

          page.drawLine({
            start: { x: hStartX, y: hStartY },
            end: { x: hEndX, y: hEndY },
            color,
            thickness: pdfLineWidth,
          });
        }

        page.drawText(cue.label, {
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
      alert(`PDF exported successfully as "${savedName}".`);
      return true;
    } catch (err) {
      console.error("EXPORT ERROR:", err);
      alert("Export failed. Check console.");
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

  const jumpToCue = (cue) => {
    setSelectedDividerId(null);
    setSelectedHeaderId(null);
    setSelectedCueId(cue.id);
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
    setSelectedDividerId(null);
    setSelectedHeaderId(null);
    setSelectedCueId(cueId);
  };

  const filteredCues = cues
    .filter((cue) => {
      if (!cueTypeFilters[cue.type]) return false;

      const q = search.toLowerCase();

      return (
        cue.label.toLowerCase().includes(q) ||
        cue.type.toLowerCase().includes(q) ||
        getCueTypeName(cue.type).toLowerCase().includes(q) ||
        getCueTypeAbbreviation(cue.type).toLowerCase().includes(q) ||
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
        ALL_CUE_TYPES.map((type) => [type, true])
      )
    );
  };

  const hideAllCueTypes = () => {
    setCueTypeFilters(
      Object.fromEntries(
        ALL_CUE_TYPES.map((type) => [type, false])
      )
    );
  };

  const renderCueTypeOptions = (type) => (
    <div className="accordion-options" style={{ "--cue-color": colors[type] }}>
      <label className="hide-cue-type-option">
        <span>Hide this cue type</span>
        <input
          type="checkbox"
          checked={hiddenCueTypes[type]}
          onChange={(e) => {
            setHiddenCueTypes((current) => ({ ...current, [type]: e.target.checked }));
            setSelectedCueId(null);
            if (e.target.checked && mode === type) setMode("POINTER");
            markDirty();
          }}
        />
      </label>
      {type === "FADE" && <p>{fadeStart ? "Click the fade end point" : "Click the fade start point"}</p>}
      {type === "BLOCK" && <p>{blockStart ? "Click the opposite corner" : "Click the first corner"}</p>}

      {type !== "BLOCK" && (
        <label>
          Colour
          <input
            type="color"
            value={colors[type]}
            onChange={(e) => {
              setColors((current) => ({ ...current, [type]: e.target.value }));
              markDirty();
            }}
          />
        </label>
      )}

      {type === "BLOCK" && (
        <>
          <label>Line <input type="color" value={colors.BLOCK} disabled={!blockAppearance.lineEnabled} onChange={(e) => { setColors((current) => ({ ...current, BLOCK: e.target.value })); markDirty(); }} /></label>
          <label><span>No line</span><input type="checkbox" checked={!blockAppearance.lineEnabled} onChange={(e) => { setBlockAppearance((current) => ({ ...current, lineEnabled: !e.target.checked })); markDirty(); }} /></label>
          <label>Fill <input type="color" value={blockAppearance.fillColor} disabled={!blockAppearance.fillEnabled} onChange={(e) => { setBlockAppearance((current) => ({ ...current, fillColor: e.target.value })); markDirty(); }} /></label>
          <label><span>No fill</span><input type="checkbox" checked={!blockAppearance.fillEnabled} onChange={(e) => { setBlockAppearance((current) => ({ ...current, fillEnabled: !e.target.checked })); markDirty(); }} /></label>
          <label>
            Fill opacity
            <span className="option-slider"><input type="range" min="0" max="1" step="0.05" value={blockAppearance.fillOpacity} disabled={!blockAppearance.fillEnabled} onChange={(e) => { setBlockAppearance((current) => ({ ...current, fillOpacity: parseFloat(e.target.value) })); markDirty(); }} />{Math.round(blockAppearance.fillOpacity * 100)}%</span>
          </label>
        </>
      )}

      {isMarginCue(type) && (
        <label>
          Margin
          <span className="option-slider"><input type="range" min="0" max="600" value={margins[type]} onChange={(e) => { setMargins((current) => ({ ...current, [type]: parseInt(e.target.value, 10) })); markDirty(); }} />{Math.round(margins[type])}</span>
        </label>
      )}

      <label>
        Text size
        <span className="option-slider"><input type="range" min="6" max="28" step="1" value={styles[type].textSize} onChange={(e) => { setStyles((current) => ({ ...current, [type]: { ...current[type], textSize: parseFloat(e.target.value) } })); markDirty(); }} />{styles[type].textSize}</span>
      </label>

      {(hasLines(type) || type === "BLOCK") && (
        <label>
          Line width
          <span className="option-slider"><input type="range" min="0.5" max="8" step="0.5" value={styles[type].lineWidth} onChange={(e) => { setStyles((current) => ({ ...current, [type]: { ...current[type], lineWidth: parseFloat(e.target.value) } })); markDirty(); }} />{styles[type].lineWidth}</span>
        </label>
      )}
    </div>
  );

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
      alert(`${actionName} failed. Check the console for details.`);
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
    return isMarginCue(cue.type) && isOnCallingPage(margins[cue.type], width);
  });
  const callingPageHasContent = callingPageHasCues;

  const addDivider = () => {
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

  const editHeaderWithPrompt = (header) => {
    if (dividersLocked) return;
    const nextText = window.prompt("Edit header:", header.text);
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

  const resetDividersAndHeaders = () => {
    if (dividersLocked) return;
    if (!window.confirm("Remove all dividers and headers? This cannot be undone.")) return;
    setDividers([]);
    setHeaders([]);
    setSelectedDividerId(null);
    setSelectedHeaderId(null);
    setEditingHeaderId(null);
    markDirty();
  };

  const removeDivider = (dividerId) => {
    if (dividersLocked) return;
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
      if (shifted.type === "BLOCK" && shifted.left > shifted.right) {
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
      alert("The Prompt/Showcall Page cannot be disabled while it contains cues or dividers. Move or remove them first.");
      return;
    }
    if (!enabled) {
      setMargins({
        SFX: 150,
        TM: 100,
        DCA: 50,
      });
    }
    setNotesPageSide(enabled ? callingPageSide : "off");
    setSelectedCueId(null);
    setFadeStart(null);
    setBlockStart(null);
    markDirty();
  };

  return (
    <div className="app-shell">
      <main className="editor-main">
        <div className="app-toolbar">
          <div className="topbar-identity">
            <strong>SCRIPT MARKUP APP</strong>
            <small>PDF cue sheet annotator</small>
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
          </div>
          <button className="toolbar-primary" onClick={() => setShowFileMenu(true)}><ToolbarIcon name="save" />Save / Load</button>
          <button onClick={undoLastCueAction} disabled={undoStack.length === 0}><ToolbarIcon name="undo" />Undo</button>
          <button onClick={redoLastCueAction} disabled={redoStack.length === 0}><ToolbarIcon name="redo" />Redo</button>
          <button
            className={`toolbar-options ${showOptionsDrawer ? "is-active" : ""}`}
            onClick={() => setShowOptionsDrawer((open) => !open)}
            aria-expanded={showOptionsDrawer}
          >
            <ToolbarIcon name="options" />Options
          </button>
          <button className="toolbar-help" onClick={() => setShowHelp(true)} aria-label="Help" title="Help"><ToolbarIcon name="help" /></button>
        </div>

        <nav ref={toolToolbarRef} className="tool-toolbar" aria-label="Cue tools">
          <div className="tool-toolbar-group cue-tool-group">
            {TOOL_BUTTONS.map((tool) => (
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
                max="1.5"
                step="0.05"
                value={displayScale}
                onChange={(e) => setDisplayScale(parseFloat(e.target.value))}
              />
              <output>{Math.round(displayScale * 100)}%</output>
            </label>
            <button
              className={showCueList ? "is-active" : ""}
              onClick={() => setShowCueList((visible) => !visible)}
              aria-pressed={showCueList}
              title={showCueList ? "Hide cue list" : "Show cue list"}
            >
              <MaterialIcon path={mdiEye} />
              <span>Cue List</span>
            </button>
          </div>
        </nav>

        <div className={`options-drawer ${showOptionsDrawer ? "is-open" : ""}`}>
          <div className="drawer-header">
            <h2>Tool Options</h2>
            <button onClick={() => setShowOptionsDrawer(false)} aria-label="Close options">×</button>
          </div>
          <section className="cue-option-section calling-page-section" style={{ "--cue-color": "#374151" }}>
            <button
              className={`cue-option-trigger ${showCallingPageOptions ? "is-expanded" : ""}`}
              onClick={() => {
                const nextExpanded = !showCallingPageOptions;
                setShowCallingPageOptions(nextExpanded);
                setShowDecorationOptions(false);
                setExpandedCueType(null);
              }}
              aria-expanded={showCallingPageOptions}
            >
              <span className="cue-option-icon"><MaterialIcon path={mdiPageNextOutline} /></span>
              <span className="cue-option-name"><strong>PROMPT/SHOWCALL PAGE</strong></span>
              <span className="cue-option-chevron">
                <MaterialIcon path={showCallingPageOptions ? mdiMinusBoxOutline : mdiPlusBoxOutline} />
              </span>
            </button>
            {showCallingPageOptions && <div className="calling-page-options">
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
            </div>}
          </section>
          <section className="cue-option-section decoration-section" style={{ "--cue-color": "#111827" }}>
            <button
              className={`cue-option-trigger ${showDecorationOptions ? "is-expanded" : ""}`}
              onClick={() => {
                const nextExpanded = !showDecorationOptions;
                setShowDecorationOptions(nextExpanded);
                setShowCallingPageOptions(false);
                setExpandedCueType(null);
              }}
              aria-expanded={showDecorationOptions}
            >
              <span className="cue-option-icon"><MaterialIcon path={mdiFormatPageSplit} /></span>
              <span className="cue-option-name"><strong>DIVIDERS AND HEADERS</strong></span>
              <span className="cue-option-chevron">
                <MaterialIcon path={showDecorationOptions ? mdiMinusBoxOutline : mdiPlusBoxOutline} />
              </span>
            </button>
            {showDecorationOptions && <div className="decoration-options">
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
                <label><span>Colour</span><input type="color" value={dividerAppearance.color} onChange={(e) => { setDividerAppearance((current) => ({ ...current, color: e.target.value })); markDirty(); }} /></label>
                <label>
                  <span>Line width</span>
                  <span className="divider-width-control">
                    <input type="range" min="0.5" max="8" step="0.5" value={dividerAppearance.lineWidth} onChange={(e) => { setDividerAppearance((current) => ({ ...current, lineWidth: parseFloat(e.target.value) })); markDirty(); }} />
                    <output>{dividerAppearance.lineWidth}</output>
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
                <label><span>Colour</span><input type="color" value={headerAppearance.color} onChange={(e) => { setHeaderAppearance((current) => ({ ...current, color: e.target.value })); markDirty(); }} /></label>
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
            </div>}
          </section>
          <div className="cue-options-accordion">
            {TOOL_BUTTONS.filter((tool) => tool.type !== "POINTER").map(({ type, icon }) => {
              const isExpanded = expandedCueType === type;
              return (
                <section className="cue-option-section" key={type} style={{ "--cue-color": colors[type] }}>
                  <button
                    className={`cue-option-trigger ${isExpanded ? "is-expanded" : ""}`}
                    onClick={() => {
                      setExpandedCueType(isExpanded ? null : type);
                      setShowCallingPageOptions(false);
                      setShowDecorationOptions(false);
                    }}
                    aria-expanded={isExpanded}
                  >
                    <span className="cue-option-icon"><MaterialIcon path={icon} /></span>
                    <span className="cue-option-name">
                      <strong>{getCueTypeOptionLabel(type)} CUES</strong>
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
              {ALL_CUE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {getCueTypeOptionLabel(type)}
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
            <strong>{getCueTypeName(mode)} Settings</strong>

            {mode === "FADE" && (
              <span style={{ fontSize: 12 }}>
                {fadeStart ? "Click the fade end point" : "Click the fade start point"}
              </span>
            )}

            {mode === "BLOCK" && (
              <span style={{ fontSize: 12 }}>
                {blockStart ? "Click the opposite corner" : "Click the first corner"}
              </span>
            )}

            {mode !== "BLOCK" && <label>
              Colour{" "}
              <input
                type="color"
                value={colors[mode]}
                onChange={(e) => updateSelectedColor(e.target.value)}
              />
            </label>}

            {mode === "BLOCK" && (
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

            {(hasLines(mode) || mode === "BLOCK") && (
              <label>
                Line Width{" "}
                <input
                  type="range"
                  min="0.5"
                  max="8"
                  step="0.5"
                  value={styles[mode].lineWidth}
                  onChange={(e) =>
                    updateSelectedStyle("lineWidth", parseFloat(e.target.value))
                  }
                />
                <span style={{ minWidth: 24, display: "inline-block" }}>
                  {styles[mode].lineWidth}
                </span>
              </label>
            )}
          </div>
        </div>

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
                  <p>Mark up, organise, save, and export your PDF cue sheets.</p>
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
                      <li><strong>Note, Warn, and Mark</strong> place text directly on the page.</li>
                      <li>Select <strong>Pointer</strong> when you want to work without adding cues.</li>
                      <li>Drag cues and their handles without changing the current selection.</li>
                      <li>Rename a cue by double-clicking it on the page or editing its name in the cue list.</li>
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
                      <li>Use <strong>Scale</strong> to resize pages without changing export geometry.</li>
                      <li>Toggle the cue list from the button beside the scale control.</li>
                      <li>Hidden cue types remain saved but do not appear on pages or PDF exports.</li>
                      <li>Only one Options accordion can be open at a time.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>Options &amp; cue list</h3>
                    <ul>
                      <li>Expand any tool row to change its colour, text size, line width, or margin.</li>
                      <li>BLOCK additionally supports fill colour, opacity, no fill, and no line.</li>
                      <li>Search cues by name, type, or page from the cue list.</li>
                      <li>The Filter accordion controls which cue types appear in the list.</li>
                      <li>Click a cue-list name to edit it inline; moving or editing a cue does not automatically select it.</li>
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
                    <kbd>Double-click</kbd><span>Edit a cue, fade, block, or header label.</span>
                    <kbd>Drag</kbd><span>Move cues, dividers, and headers, or adjust visible handles.</span>
                    <kbd>F / 7</kbd><span>Select Fade. Use B / 8 to select Block.</span>
                  </div>
                </article>
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
                  const color = colors[cue.type];
                  const cueStyle = styles[cue.type] || {
                    textSize: 10,
                    lineWidth: 1.5,
                  };

                  if (cue.type === "BLOCK") {
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
                          fill={blockAppearance.fillEnabled ? blockAppearance.fillColor : "none"}
                          fillOpacity={blockAppearance.fillOpacity}
                          stroke={blockAppearance.lineEnabled ? color : "none"}
                          strokeWidth={cueStyle.lineWidth}
                        />
                        {selectedCueId === cue.id && (
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
                        <text
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
                          {cue.label}
                        </text>
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
                          stroke={selectedCueId === cue.id ? "yellow" : color}
                          strokeWidth={selectedCueId === cue.id ? cueStyle.lineWidth + 4 : cueStyle.lineWidth}
                        />
                        {selectedCueId === cue.id && (
                          <line
                            x1={cue.x}
                            y1={cue.y}
                            x2={cue.x2}
                            y2={cue.y2}
                            stroke={color}
                            strokeWidth={cueStyle.lineWidth}
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
                          {cue.label}
                        </text>
                        {selectedCueId === cue.id && (
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
                        stroke={selectedCueId === cue.id ? "yellow" : "none"}
                        strokeWidth={selectedCueId === cue.id ? 3 : 0}
                        style={{ cursor: "grab", userSelect: "none" }}
                        onClick={(e) => selectCueFromClick(e, cue.id)}
                        onMouseDown={(e) => startDragFreeCue(e, cue.id)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          updateCue(cue.id);
                        }}
                      >
                        {cue.label}
                      </text>
                    );
                  }

                  const marginX = margins[cue.type];

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
                            y1={cue.y - 10}
                            x2={cue.x}
                            y2={cue.y + 10}
                            stroke={color}
                            strokeWidth={cueStyle.lineWidth}
                          />

                          <line
                            x1={cue.x}
                            y1={cue.y - 10}
                            x2={cue.x}
                            y2={cue.y + 10}
                            stroke="transparent"
                            strokeWidth={12}
                            style={{ cursor: "move" }}
                            onMouseDown={(e) => startDragCueLine(e, cue.id)}
                          />

                          <line
                            x1={cue.x}
                            y1={cue.y + 10}
                            x2={marginX}
                            y2={cue.y + 10}
                            stroke={color}
                            strokeWidth={cueStyle.lineWidth}
                          />
                        </>
                      )}

                      {selectedCueId === cue.id && (
                        <rect
                          x={marginX}
                          y={cue.y - cueStyle.textSize}
                          width={80}
                          height={cueStyle.textSize + 8}
                          fill="yellow"
                          opacity="0.25"
                        />
                      )}

                      <text
                        x={marginX + 5}
                        y={cue.y + 5}
                        fill={color}
                        fontWeight="bold"
                        fontSize={cueStyle.textSize}
                        style={{
                          cursor: cue.type === "DCA" ? "ns-resize" : "text",
                          userSelect: "none",
                        }}
                        onMouseDown={cue.type === "DCA"
                          ? (e) => startDragDcaCue(e, cue.id)
                          : undefined}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          updateCue(cue.id);
                        }}
                      >
                        {cue.label}
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

              {mode === "BLOCK" && blockStart?.page === pageIndex && (
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
                    style={{ cursor: "ew-resize" }}
                    onMouseDown={(e) => {
                      e.stopPropagation();

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
        <aside className="cue-list-panel">
          <h3 style={{ marginTop: 0 }}>Cue List</h3>

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
              {Object.values(cueTypeFilters).filter(Boolean).length}/{ALL_CUE_TYPES.length}
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

            {ALL_CUE_TYPES.map((type) => (
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
                  {getCueTypeOptionLabel(type)}
                </span>
                {hiddenCueTypes[type] && <span className="hidden-status">(Hidden)</span>}
              </label>
            ))}

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

          {filteredCues.map((cue) => (
            <div
              key={cue.id}
              onClick={() => jumpToCue(cue)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") jumpToCue(cue);
              }}
              role="button"
              tabIndex={0}
              className={`cue-list-item${selectedCueId === cue.id ? " is-selected" : ""}${hiddenCueTypes[cue.type] ? " is-hidden" : ""}`}
              style={{
                "--cue-color": colors[cue.type],
              }}
            >
              <strong
                style={{
                  color: colors[cue.type],
                }}
              >
                {getCueTypeAbbreviation(cue.type)}
              </strong>{" "}
              {editingCueId === cue.id ? (
                <input
                  className="cue-name-editor"
                  aria-label={`Rename ${getCueTypeName(cue.type)} cue`}
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
                    beginEditingCueName(cue);
                  }}
                  title="Rename cue"
                >
                  <span>{cue.label}</span>
                  <MaterialIcon path={mdiPencil} />
                </button>
              )}

              <br />

              <small>
                Page {cue.page + 1}{(() => {
                  const anchorX = cue.left ?? cue.x;
                  const width = pages[cue.page]?.width;
                  const marginX = isMarginCue(cue.type) ? margins[cue.type] : null;
                  const hasCallingContent = width && (
                    anchorX < 0 || anchorX > width
                    || (typeof marginX === "number" && (marginX < 0 || marginX > width))
                  );
                  return hasCallingContent ? " · Prompt/Showcall" : "";
                })()}
              </small>
            </div>
          ))}
        </aside>
      )}

    </div>
  );
}
