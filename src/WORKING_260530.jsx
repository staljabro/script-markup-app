import React, { useEffect, useState } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { usePdfRenderer } from "./hooks/usePdfRenderer";

export default function App() {
  const { pages, pdfBytes, loadPdf } = usePdfRenderer();

  const [cues, setCues] = useState([]);
  const [mode, setMode] = useState("SFX");

  const [margins, setMargins] = useState({
    SFX: 150,
    TM: 100,
    DCA: 50,
  });

  const [colors, setColors] = useState({
    SFX: "#ff0000",
    TM: "#0000ff",
    DCA: "#008000",
  });

  const [styles, setStyles] = useState({
    SFX: { textSize: 10, lineWidth: 1.5 },
    TM: { textSize: 10, lineWidth: 1.5 },
    DCA: { textSize: 10, lineWidth: 1.5 },
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;

      const key = e.key.toLowerCase();

      if (key === "s" || key === "1") setMode("SFX");
      if (key === "t" || key === "2") setMode("TM");
      if (key === "d" || key === "3") setMode("DCA");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    loadPdf(file);
  };

  const addCue = (pageIndex, x, y) => {
    const label = prompt(`Enter ${mode} Cue:`);
    if (!label) return;

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

    setCues((prev) =>
      prev.map((c) => (c.id === id ? { ...c, label: newLabel } : c))
    );
  };

  const startDragCue = (e, cueId) => {
    e.stopPropagation();

    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();

    const move = (ev) => {
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const newY = (ev.clientY - rect.top) * scaleY;

      setCues((prev) =>
        prev.map((c) => (c.id === cueId ? { ...c, y: newY } : c))
      );
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const saveOverlay = () => {
    const blob = new Blob(
      [JSON.stringify({ cues, margins, colors, styles }, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "overlay.json";
    a.click();

    URL.revokeObjectURL(url);
  };

  const loadOverlay = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);

        setCues(data.cues || []);
        setMargins(data.margins || margins);
        setColors(data.colors || colors);
        setStyles(data.styles || styles);
      } catch (err) {
        console.error("Overlay load error:", err);
        alert("Could not load overlay JSON.");
      }
    };

    reader.readAsText(file);
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
        const cueStyle = styles[cue.type];

        const hex = colors[cue.type];
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const color = rgb(r, g, b);

        const marginX = margins[cue.type];
        const textOffsetX = 5;
        const textOffsetY = 5;
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
          marginX + textOffsetX,
          cue.y + textOffsetY
        );

        const [lineWidthStartX] = viewport.convertToPdfPoint(0, 0);
        const [lineWidthEndX] = viewport.convertToPdfPoint(cueStyle.lineWidth, 0);
        const pdfLineWidth = Math.abs(lineWidthEndX - lineWidthStartX);

        if (cue.type !== "DCA") {
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
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "annotated.pdf";
      a.click();

      URL.revokeObjectURL(url);
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
        <label>
          Load PDF{" "}
          <input type="file" accept="application/pdf" onChange={handleFile} />
        </label>

        <label>
          Load Overlay{" "}
          <input
            type="file"
            accept="application/json"
            onChange={loadOverlay}
          />
        </label>

        <button onClick={saveOverlay}>Save Overlay</button>
        <button onClick={exportPDF}>Export PDF</button>

        <label>
          Cue Type{" "}
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="SFX">SFX</option>
            <option value="TM">TM</option>
            <option value="DCA">DCA</option>
          </select>
        </label>

        <span style={{ fontSize: 12, opacity: 0.75 }}>
          Hotkeys: S/1 = SFX, T/2 = TM, D/3 = DCA
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

          {mode !== "DCA" && (
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
                const marginX = margins[cue.type];
                const color = colors[cue.type];
                const cueStyle = styles[cue.type];

                return (
                  <g key={cue.id}>
                    {cue.type !== "DCA" && (
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
              <g key={type}>
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
