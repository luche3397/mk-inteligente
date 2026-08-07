const findWordRange = (value, position) => {
  const isWordCharacter = (character) => character && !/\s/.test(character);
  let start = position;
  let end = position;

  while (start > 0 && isWordCharacter(value[start - 1])) start -= 1;
  while (end < value.length && isWordCharacter(value[end])) end += 1;

  return { start, end };
};

export const applyMarkdownWrap = (value, selectionStart, selectionEnd, prefix, suffix, placeholder) => {
  let start = selectionStart;
  let end = selectionEnd;

  if (start === end) {
    const wordRange = findWordRange(value, start);
    start = wordRange.start;
    end = wordRange.end;
  }

  const selected = value.slice(start, end);
  const before = value.slice(Math.max(0, start - prefix.length), start);
  const after = value.slice(end, end + suffix.length);

  if (selected && before === prefix && after === suffix) {
    return {
      value: `${value.slice(0, start - prefix.length)}${selected}${value.slice(end + suffix.length)}`,
      selectionStart: start - prefix.length,
      selectionEnd: end - prefix.length,
    };
  }

  if (selected.startsWith(prefix) && selected.endsWith(suffix)) {
    const content = selected.slice(prefix.length, selected.length - suffix.length);
    return {
      value: `${value.slice(0, start)}${content}${value.slice(end)}`,
      selectionStart: start,
      selectionEnd: start + content.length,
    };
  }

  const content = selected || placeholder;
  const replacement = `${prefix}${content}${suffix}`;
  return {
    value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
    selectionStart: start + prefix.length,
    selectionEnd: start + prefix.length + content.length,
  };
};

export const applyMarkdownLinePrefix = (value, selectionStart, selectionEnd, prefix, placeholder) => {
  const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const nextLineBreak = value.indexOf('\n', selectionEnd);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  const selectedLines = value.slice(lineStart, lineEnd) || placeholder;
  const lines = selectedLines.split('\n');
  const allPrefixed = lines.every((line) => line.startsWith(prefix));
  const isHeading = prefix.startsWith('#');
  const nextLines = lines.map((line) => {
    if (allPrefixed) return line.slice(prefix.length);
    return `${prefix}${isHeading ? line.replace(/^#{1,6}\s+/, '') : line}`;
  });
  const replacement = nextLines.join('\n');

  return {
    value: `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
    selectionStart: lineStart + (allPrefixed ? 0 : prefix.length),
    selectionEnd: lineStart + replacement.length,
  };
};

export const insertMarkdownAtSelection = (value, selectionStart, selectionEnd, markdown) => ({
  value: `${value.slice(0, selectionStart)}${markdown}${value.slice(selectionEnd)}`,
  selectionStart: selectionStart + markdown.length,
  selectionEnd: selectionStart + markdown.length,
});
