import React, { useEffect, useRef, useState } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { usePdfRenderer } from "./hooks/usePdfRenderer";
import {
  addRecentProject,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  chooseExportPdfPath,
  choosePdfFile,
  chooseProjectFile,
  chooseSaveProjectPath,
  getRecentProjects,
  readProjectFile,
  writePdfFile,
  writeProjectFile,
} from "./lib/projectFiles";

const MARGIN_CUE_TYPES = ["SFX", "TM", "DCA"];
const FREE_CUE_TYPES = ["NOTE", "WARN", "MARK"];
const ALL_CUE_TYPES = [...MARGIN_CUE_TYPES, ...FREE_CUE_TYPES];

const isMarginCue = (type) => MARGIN_CUE_TYPES.includes(type);
const isFreeCue = (type) => FREE_CUE_TYPES.includes(type);
const hasLines = (type) => type === "SFX" || type === "TM";

export default function App() {
  const { pages, pdfBytes, loadPdf } = usePdfRenderer();

  const [cues, setCues] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [mode, setMode] = useState("SFX");

  const [currentProjectPath, setCurrentProjectPath] = useState(null);
  const [recentProjects, setRecentProjects] = useState([]);

  const suppressNextSvgClickRef = useRef(false);

  const [margins, setMargins] = useState({
    SFX: 150,
    TM: 100,
    DCA: 50,
  });

  const [colors, setColors] = useState({
    SFX: "#ff0000",
    TM: "#0000ff",
    DCA: "#008000",
    NOTE: "#8a2be2",
    WARN: "#ff9900",
    MARK: "#00a6a6",
  });

  const [styles, setStyles] = useState({
    SFX: { textSize: 10, lineWidth: 1.5 },
    TM: { textSize: 10, lineWidth: 1.5 },
    DCA: { textSize: 10, lineWidth: 1.5 },
    NOTE: { textSize: 10, lineWidth: 1.5 },
    WARN: { textSize: 10, lineWidth: 1.5 },
    MARK: { textSize: 10, lineWidth: 1.5 },
  });

  useEffect(() => {
    getRecentProjects()
      .then(setRecentProjects)
      .catch((err) => console.error("Could not load recent projects:", err));
  }, []);

  const pushUndo = (snapshot) => {
    setUndoStack((prev) =>
      [snapshot.map((cue) => ({ ...cue })), ...prev].slice(0, 10)
    );
  };

  const undoLastCueAction = () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;

      const [lastSnapshot, ...remaining] = prev;
      setCues(lastSnapshot);

      return remaining;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoLastCueAction();
        return;
      }

      const key = e.key.toLowerCase();

      if (key === "s" || key === "1") setMode("SFX");
      if (key === "t" || key === "2") setMode("TM");
      if (key === "d" || key === "3") setMode("DCA");
      if (key === "n" || key === "4") setMode("NOTE");
      if (key === "w" || key === "5") setMode("WARN");
      if (key === "m" || key === "6") setMode("MARK");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoStack]);

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
    };
  };

  const loadProjectData = async (project) => {
  if (!project.pdfBase64) {
    alert("Project file does not contain a PDF.");
    return;
  }

  const pdfBuffer = base64ToArrayBuffer(project.pdfBase64);
  const pdfBytes = new Uint8Array(pdfBuffer);

  const pdfFile = new File([pdfBytes], "project.pdf", {
    type: "application/pdf",
  });

  await loadPdf(pdfFile);

  setCues(project.cues || []);
  setUndoStack([]);
  setMargins(project.margins || margins);
  setColors((current) => ({ ...current, ...(project.colors || {}) }));
  setStyles((current) => ({ ...current, ...(project.styles || {}) }));
};

  const openPdfNative = async () => {
    const selected = await choosePdfFile();
    if (!selected) return;

    await loadPdf(selected.file);

    setCues([]);
    setUndoStack([]);
    setCurrentProjectPath(null);
  };

  
  const openProjectNative = async () => {
  try {
    const selected = await chooseProjectFile();
    if (!selected) return;

    console.log("Selected project:", selected.path);

    const project = JSON.parse(selected.contents);

    console.log("Project loaded:", {
      hasPdf: Boolean(project.pdfBase64),
      cueCount: project.cues?.length || 0,
    });

    await loadProjectData(project);

    setCurrentProjectPath(selected.path);

    const recent = await addRecentProject(selected.path);
    setRecentProjects(recent);
  } catch (err) {
    console.error("Open project failed:", err);
    alert(`Open project failed: ${String(err)}`);
  }
};

  const openRecentProject = async (projectPath) => {
    if (!projectPath) return;

    try {
      const contents = await readProjectFile(projectPath);
      const project = JSON.parse(contents);

      await loadProjectData(project);
      setCurrentProjectPath(projectPath);

      const recent = await addRecentProject(projectPath);
      setRecentProjects(recent);
    } catch (err) {
      console.error("Recent project load error:", err);
      alert("Could not load recent project.");
    }
  };

  const saveProjectAsNative = async () => {
    const project = createProjectData();

    if (!project) {
      alert("Load a PDF before saving a project.");
      return;
    }

    const savePath = await chooseSaveProjectPath();
    if (!savePath) return;

    await writeProjectFile(savePath, project);
    setCurrentProjectPath(savePath);

    const recent = await addRecentProject(savePath);
    setRecentProjects(recent);
  };

  const saveCurrentProjectNative = async () => {
    if (!currentProjectPath) {
      await saveProjectAsNative();
      return;
    }

    const project = createProjectData();

    if (!project) {
      alert("Load a PDF before saving a project.");
      return;
    }

    await writeProjectFile(currentProjectPath, project);

    const recent = await addRecentProject(currentProjectPath);
    setRecentProjects(recent);
  };

  const addCue = (pageIndex, x, y) => {
    const label = prompt(`Enter ${mode} Cue:`);
    if (!label) return;

    pushUndo(cues);

    setCues((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
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

    const newLabel = prompt("Edit Cue:", cue.label);
    if (!newLabel) return;

    pushUndo(cues);

    setCues((prev) =>
      prev.map((c) => (c.id === id ? { ...c, label: newLabel } : c))
    );
  };

  const startDragCue = (e, cueId) => {
    e.stopPropagation();
    e.preventDefault();

    const startSnapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    const startClientY = e.clientY;
    let didMove = false;

    const move = (ev) => {
      const delta = Math.abs(ev.clientY - startClientY);
      if (delta > 2) didMove = true;

      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const newY = (ev.clientY - rect.top) * scaleY;

      setCues((prev) =>
        prev.map((c) => (c.id === cueId ? { ...c, y: newY } : c))
      );
    };

    const up = () => {
      if (didMove) {
        pushUndo(startSnapshot);
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
      const newX = (ev.clientX - rect.left) * scaleX;
      const newY = (ev.clientY - rect.top) * scaleY;

      setCues((prev) =>
        prev.map((c) => (c.id === cueId ? { ...c, x: newX, y: newY } : c))
      );
    };

    const up = () => {
      if (didMove) {
        pushUndo(startSnapshot);
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

  const exportPDF = async () => {
    if (!pdfBytes) {
      alert("Load a PDF first");
      return;
    }

    try {
      const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBytes));
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      cues.forEach((cue) => {
        const page = pdfDoc.getPage(cue.page);
        const pageInfo = pages[cue.page];

        if (!pageInfo) return;

        const viewport = pageInfo.viewport;
        const cueStyle = styles[cue.type] || { textSize: 10, lineWidth: 1.5 };

        const hex = colors[cue.type] || "#000000";
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const color = rgb(r, g, b);

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

      const bytes = await pdfDoc.save();

      const exportPath = await chooseExportPdfPath();
      if (!exportPath) return;

      await writePdfFile(exportPath, bytes);
    } catch (err) {
      console.error("EXPORT ERROR:", err);
      alert("Export failed. Check console.");
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
  };

  const updateSelectedColor = (value) => {
    setColors((current) => ({
      ...current,
      [mode]: value,
    }));
  };

  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 16,
          padding: 12,
          alignItems: "center",
          background: "rgba(245, 245, 245, 0.96)",
          border: "1px solid #ccc",
          borderRadius: 8,
          boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
          backdropFilter: "blur(6px)",
        }}
      >
        <button onClick={openPdfNative}>Open PDF</button>
        <button onClick={openProjectNative}>Open Project</button>
        <button onClick={saveCurrentProjectNative}>Save</button>
        <button onClick={saveProjectAsNative}>Save As</button>
        <button onClick={exportPDF}>Export PDF</button>
        <button onClick={undoLastCueAction} disabled={undoStack.length === 0}>
          Undo
        </button>

        <label>
          Recent{" "}
          <select
            value=""
            onChange={(e) => openRecentProject(e.target.value)}
            disabled={recentProjects.length === 0}
          >
            <option value="">Open recent...</option>
            {recentProjects.map((projectPath) => (
              <option key={projectPath} value={projectPath}>
                {projectPath}
              </option>
            ))}
          </select>
        </label>

        <label>
          Cue Type{" "}
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {ALL_CUE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        {currentProjectPath && (
          <span style={{ fontSize: 12, opacity: 0.75 }}>
            Project: {currentProjectPath}
          </span>
        )}

        <span style={{ fontSize: 12, opacity: 0.75 }}>
          Hotkeys: S/1, T/2, D/3, N/4, W/5, M/6 · Undo: Ctrl/Cmd+Z · Edit:
          double-click cue
        </span>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            padding: 8,
            border: `2px solid ${colors[mode]}`,
            borderRadius: 8,
            background: "white",
          }}
        >
          <strong>{mode} Settings</strong>

          <label>
            Colour{" "}
            <input
              type="color"
              value={colors[mode]}
              onChange={(e) => updateSelectedColor(e.target.value)}
            />
          </label>

          {isMarginCue(mode) && (
            <label>
              Margin{" "}
              <input
                type="range"
                min="0"
                max="600"
                value={margins[mode]}
                onChange={(e) =>
                  setMargins((m) => ({
                    ...m,
                    [mode]: parseInt(e.target.value, 10),
                  }))
                }
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

          {hasLines(mode) && (
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

      {pages.map((p, pageIndex) => (
        <div
          key={pageIndex}
          style={{
            position: "relative",
            display: "inline-block",
            marginBottom: 20,
          }}
        >
          <div
            ref={(el) => {
              if (el && !el.hasChildNodes()) {
                p.canvas.style.display = "block";
                el.appendChild(p.canvas);

                const rect = p.canvas.getBoundingClientRect();

                el.parentElement.style.width = `${rect.width}px`;
                el.parentElement.style.height = `${rect.height}px`;
              }
            }}
          />

          <svg
            width={p.width}
            height={p.height}
            viewBox={`0 0 ${p.width} ${p.height}`}
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

              const scaleX = p.width / rect.width;
              const scaleY = p.height / rect.height;

              addCue(
                pageIndex,
                (e.clientX - rect.left) * scaleX,
                (e.clientY - rect.top) * scaleY
              );
            }}
          >
            {cues
              .filter((c) => c.page === pageIndex)
              .map((cue) => {
                const color = colors[cue.type];
                const cueStyle = styles[cue.type] || {
                  textSize: 10,
                  lineWidth: 1.5,
                };

                if (isFreeCue(cue.type)) {
                  return (
                    <text
                      key={cue.id}
                      x={cue.x}
                      y={cue.y}
                      fill={color}
                      fontWeight="bold"
                      fontSize={cueStyle.textSize}
                      style={{ cursor: "grab", userSelect: "none" }}
                      onClick={(e) => e.stopPropagation()}
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
                  <g key={cue.id} onClick={(e) => e.stopPropagation()}>
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
                          y1={cue.y + 10}
                          x2={marginX}
                          y2={cue.y + 10}
                          stroke={color}
                          strokeWidth={cueStyle.lineWidth}
                        />
                      </>
                    )}

                    <text
                      x={marginX + 5}
                      y={cue.y + 5}
                      fill={color}
                      fontWeight="bold"
                      fontSize={cueStyle.textSize}
                      style={{ cursor: "grab", userSelect: "none" }}
                      onMouseDown={(e) => startDragCue(e, cue.id)}
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
                      const newX = (ev.clientX - rect.left) * scaleX;

                      setMargins((m) => ({
                        ...m,
                        [type]: newX,
                      }));
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
          </svg>
        </div>
      ))}
    </div>
  );
}