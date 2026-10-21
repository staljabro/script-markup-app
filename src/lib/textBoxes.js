export const TEXT_FORMATS = ["bold", "italic", "underline", "strike"];

export function textCharacters(cue) {
  const chars = (cue.textRuns || [{ text: cue.label || "" }]).flatMap((run) =>
    run.text.split("").map((text) => ({ ...run, text })));
  return chars;
}

export function packTextRuns(chars) {
  return chars.reduce((runs, char) => {
    const last = runs.at(-1);
    if (last && TEXT_FORMATS.every((key) => Boolean(last[key]) === Boolean(char[key]))) last.text += char.text;
    else runs.push({ ...char });
    return runs;
  }, []);
}

// Preserve formatting on either side of an insertion, replacement, or deletion.
export function editText(cue, label) {
  const old = cue.label || "";
  const chars = textCharacters(cue);
  let start = 0;
  while (start < old.length && start < label.length && old[start] === label[start]) start++;
  let end = old.length;
  let nextEnd = label.length;
  while (end > start && nextEnd > start && old[end - 1] === label[nextEnd - 1]) { end--; nextEnd--; }
  const inherited = chars[start - 1] || chars[start] || {};
  const inserted = label.slice(start, nextEnd).split("").map((text) => ({ ...inherited, text }));
  return { label, textRuns: packTextRuns([...chars.slice(0, start), ...inserted, ...chars.slice(end)]) };
}

// Layout is shared by the SVG preview and PDF export. Long words also wrap.
export function layoutTextBox(cue, size, measure) {
  const width = Math.max(1, cue.right - cue.left - 12);
  const chars = textCharacters(cue);
  const lines = [[]];
  let used = 0;
  for (const [index, char] of chars.entries()) {
    if (char.text === "\n") { lines.push([]); used = 0; continue; }
    if (char.text === "\r") continue;
    if (/\S/.test(char.text) && (index === 0 || /\s/.test(chars[index - 1].text))) {
      let wordWidth = 0;
      for (let end = index; end < chars.length && /\S/.test(chars[end].text); end++) {
        wordWidth += measure(chars[end].text, chars[end], size);
      }
      if (wordWidth <= width && used > 0 && used + wordWidth > width) { lines.push([]); used = 0; }
    }
    const advance = measure(char.text === "\t" ? "    " : char.text, char, size);
    if (used + advance > width && lines.at(-1).length) { lines.push([]); used = 0; }
    lines.at(-1).push({ ...char, text: char.text === "\t" ? "    " : char.text, x: used, width: advance });
    used += advance;
  }
  const visibleCount = Math.max(0, Math.floor((cue.bottom - cue.top - 12 - size) / (size * 1.25)) + 1);
  return { lines: lines.slice(0, visibleCount), overflow: lines.length > visibleCount };
}

let measureContext;
export function measureTextBox(text, format, size) {
  measureContext ||= document.createElement("canvas").getContext("2d");
  measureContext.font = `${format.italic ? "italic" : "normal"} ${format.bold ? "bold" : "normal"} ${size}px Arial`;
  return measureContext.measureText(text).width;
}
