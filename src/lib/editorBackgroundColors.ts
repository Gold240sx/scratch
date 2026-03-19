export const editorBackgroundColors = [
  "#FFF3B2",
  "#F8D98A",
  "#D9FCD1",
  "#D2E8FD",
  "#E0CCFF",
  "#F8C6C7",
] as const;

export type EditorBackgroundColor = (typeof editorBackgroundColors)[number];

export function isEditorBackgroundColor(
  value: unknown,
): value is EditorBackgroundColor {
  return (
    typeof value === "string" &&
    editorBackgroundColors.includes(value as EditorBackgroundColor)
  );
}
