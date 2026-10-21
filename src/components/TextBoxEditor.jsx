import { useRef, useState } from "react";
import { editText, packTextRuns, textCharacters, TEXT_FORMATS } from "../lib/textBoxes";

export default function TextBoxEditor({ cue, disabled, onChange }) {
  const input = useRef(null);
  const [selection, setSelection] = useState([0, 0]);
  const chars = textCharacters(cue);
  const selected = chars.slice(...selection);
  const formatSelection = (format) => {
    if (!selected.length || disabled) return;
    const enabled = !selected.every((char) => char[format]);
    const next = chars.map((char, i) => i >= selection[0] && i < selection[1] ? { ...char, [format]: enabled } : char);
    onChange({ textRuns: packTextRuns(next) });
    input.current.focus();
    input.current.setSelectionRange(...selection);
  };
  return <fieldset className="text-box-editor" disabled={disabled}>
    <legend>Text box content</legend>
    <div className="text-format-toolbar" role="toolbar" aria-label="Format selected text">
      {TEXT_FORMATS.map((format, i) => <button key={format} type="button" title={format === "strike" ? "Strikethrough" : format} aria-label={format === "strike" ? "Strikethrough" : format} aria-pressed={selected.length > 0 && selected.every((char) => char[format])} disabled={!selected.length} onMouseDown={(event) => event.preventDefault()} onClick={() => formatSelection(format)}>{[<b key="b">B</b>, <i key="i">I</i>, <u key="u">U</u>, <s key="s">S</s>][i]}</button>)}
    </div>
    <textarea ref={input} aria-label="Text box text" value={cue.label} rows={7}
      onSelect={(event) => setSelection([event.currentTarget.selectionStart, event.currentTarget.selectionEnd])}
      onChange={(event) => onChange(editText(cue, event.target.value))}
      onKeyDown={(event) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        const format = { b: "bold", i: "italic", u: "underline" }[event.key.toLowerCase()];
        if (format) { event.preventDefault(); formatSelection(format); }
      }} />
    <small>Select text above, then choose its formatting. Resize the box to show more text.</small>
    <div className="text-box-format-preview" aria-label="Formatted text preview">
      {(cue.textRuns || [{ text: cue.label }]).map((run, i) => <span key={i} style={{ fontWeight: run.bold ? "bold" : "normal", fontStyle: run.italic ? "italic" : "normal", textDecoration: [run.underline && "underline", run.strike && "line-through"].filter(Boolean).join(" ") || undefined }}>{run.text}</span>)}
    </div>
  </fieldset>;
}
