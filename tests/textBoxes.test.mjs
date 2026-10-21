import assert from "node:assert/strict";
import test from "node:test";
import { editText, layoutTextBox, packTextRuns, textCharacters } from "../src/lib/textBoxes.js";

test("editing preserves styles before and after inserted and deleted text", () => {
  const cue = { label: "Hello world", textRuns: [{ text: "Hello", bold: true }, { text: " world", italic: true }] };
  const inserted = editText(cue, "Hello brave world");
  assert.equal(inserted.textRuns.map((r) => r.text).join(""), inserted.label);
  assert.equal(textCharacters(inserted)[0].bold, true);
  assert.equal(textCharacters(inserted).at(-1).italic, true);
  const deleted = editText(inserted, "Hello world");
  assert.equal(deleted.label, cue.label);
  assert.equal(textCharacters(deleted).at(-1).italic, true);
});

test("formatting combinations survive packing and JSON project round trips", () => {
  const chars = [{ text: "A", bold: true, underline: true }, { text: "B", bold: true, underline: true }, { text: "C", italic: true, strike: true }];
  const runs = packTextRuns(chars);
  assert.equal(runs.length, 2);
  assert.deepEqual(textCharacters(JSON.parse(JSON.stringify({ textRuns: runs }))), chars);
});

test("multiline text wraps and reports overflow without losing stored content", () => {
  const cue = { left: 0, top: 0, right: 32, bottom: 50, label: "abcd\n\nef" };
  const layout = layoutTextBox(cue, 10, () => 10);
  assert.deepEqual(layout.lines.map((line) => line.map((c) => c.text).join("")), ["ab", "cd", ""]);
  assert.equal(layout.overflow, true);
  assert.equal(cue.label, "abcd\n\nef");
  const expanded = layoutTextBox({ ...cue, bottom: 100 }, 10, () => 10);
  assert.equal(expanded.overflow, false);
  assert.equal(expanded.lines.at(-1).map((c) => c.text).join(""), "ef");
});

test("empty and undersized boxes have safe layouts", () => {
  assert.equal(layoutTextBox({ left: 0, top: 0, right: 1, bottom: 1, label: "text" }, 16, () => 8).lines.length, 0);
  assert.deepEqual(editText({ label: "", textRuns: [] }, "first\nsecond").textRuns, [{ text: "first\nsecond" }]);
});

test("words wrap together when they fit on a line", () => {
  const layout = layoutTextBox({ left: 0, top: 0, right: 72, bottom: 100, label: "one two" }, 10, () => 10);
  assert.deepEqual(layout.lines.map((line) => line.map((c) => c.text).join("")), ["one ", "two"]);
});
