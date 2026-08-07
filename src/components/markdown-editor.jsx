import { useEffect, useRef, useState } from 'react';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { Decoration, EditorView, keymap, placeholder as editorPlaceholder, ViewPlugin, WidgetType } from '@codemirror/view';
import { applyMarkdownLinePrefix, applyMarkdownWrap } from '../utils/markdown';

class ImageWidget extends WidgetType {
  constructor(source, alt) {
    super();
    this.source = source;
    this.alt = alt;
  }

  eq(other) {
    return other.source === this.source && other.alt === this.alt;
  }

  toDOM() {
    const image = document.createElement('img');
    image.src = this.source;
    image.alt = this.alt;
    image.className = 'cm-mk-image';
    image.loading = 'lazy';
    return image;
  }

  ignoreEvent() {
    return true;
  }
}

class BulletWidget extends WidgetType {
  toDOM() {
    const bullet = document.createElement('span');
    bullet.className = 'cm-mk-bullet';
    bullet.textContent = '•';
    return bullet;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(checked, markerPosition) {
    super();
    this.checked = checked;
    this.markerPosition = markerPosition;
  }

  eq(other) {
    return other.checked === this.checked && other.markerPosition === this.markerPosition;
  }

  toDOM(view) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.checked;
    checkbox.className = 'cm-mk-checkbox';
    checkbox.addEventListener('change', () => {
      view.dispatch({
        changes: { from: this.markerPosition, to: this.markerPosition + 1, insert: checkbox.checked ? 'x' : ' ' },
      });
    });
    return checkbox;
  }

  ignoreEvent() {
    return false;
  }
}

const addInlineDecorations = (ranges, line, activeLine) => {
  const text = line.text;
  const addMatches = (expression, callback) => {
    expression.lastIndex = 0;
    let match;
    while ((match = expression.exec(text))) callback(match);
  };

  addMatches(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (match) => {
    if (activeLine) return;
    ranges.push(
      Decoration.replace({ widget: new ImageWidget(match[2], match[1]) }).range(
        line.from + match.index,
        line.from + match.index + match[0].length,
      ),
    );
  });

  addMatches(/\*\*([^*\n]+)\*\*/g, (match) => {
    const from = line.from + match.index;
    ranges.push(Decoration.mark({ class: 'cm-mk-strong' }).range(from + 2, from + match[0].length - 2));
    if (!activeLine) {
      ranges.push(Decoration.replace({}).range(from, from + 2));
      ranges.push(Decoration.replace({}).range(from + match[0].length - 2, from + match[0].length));
    }
  });

  addMatches(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (match) => {
    const markerOffset = match[1].length;
    const from = line.from + match.index + markerOffset;
    ranges.push(Decoration.mark({ class: 'cm-mk-emphasis' }).range(from + 1, from + match[0].length - markerOffset - 1));
    if (!activeLine) {
      ranges.push(Decoration.replace({}).range(from, from + 1));
      ranges.push(Decoration.replace({}).range(from + match[0].length - markerOffset - 1, from + match[0].length - markerOffset));
    }
  });

  addMatches(/`([^`\n]+)`/g, (match) => {
    const from = line.from + match.index;
    ranges.push(Decoration.mark({ class: 'cm-mk-code' }).range(from + 1, from + match[0].length - 1));
    if (!activeLine) {
      ranges.push(Decoration.replace({}).range(from, from + 1));
      ranges.push(Decoration.replace({}).range(from + match[0].length - 1, from + match[0].length));
    }
  });

  addMatches(/(^|[^!])\[([^\]]+)\]\(([^)]+)\)/g, (match) => {
    const offset = match[1].length;
    const from = line.from + match.index + offset;
    const labelStart = from + 1;
    const labelEnd = labelStart + match[2].length;
    ranges.push(Decoration.mark({ class: 'cm-mk-link' }).range(labelStart, labelEnd));
    if (!activeLine) {
      ranges.push(Decoration.replace({}).range(from, labelStart));
      ranges.push(Decoration.replace({}).range(labelEnd, labelEnd + 2 + match[3].length + 1));
    }
  });
};

const buildLivePreviewDecorations = (view) => {
  const ranges = [];
  const activeLineNumber = view.state.doc.lineAt(view.state.selection.main.head).number;

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const activeLine = lineNumber === activeLineNumber;
    const heading = line.text.match(/^(#{1,6})\s+/);
    const quote = line.text.match(/^>\s+/);
    const checklist = line.text.match(/^(\s*)- \[([ xX])\] /);
    const bullet = line.text.match(/^(\s*)[-*+]\s+/);

    if (heading) {
      ranges.push(Decoration.line({ class: `cm-mk-heading-line cm-mk-heading-${heading[1].length}` }).range(line.from));
      if (!activeLine) {
        ranges.push(Decoration.replace({}).range(line.from, line.from + heading[0].length));
      }
    }

    if (quote) {
      ranges.push(Decoration.line({ class: 'cm-mk-quote-line' }).range(line.from));
      if (!activeLine) ranges.push(Decoration.replace({}).range(line.from, line.from + quote[0].length));
    }

    if (!activeLine && checklist) {
      const markerPosition = line.from + checklist[1].length + 3;
      ranges.push(
        Decoration.replace({ widget: new CheckboxWidget(checklist[2].toLowerCase() === 'x', markerPosition) }).range(
          line.from + checklist[1].length,
          line.from + checklist[0].length,
        ),
      );
    } else if (!activeLine && bullet) {
      ranges.push(
        Decoration.replace({ widget: new BulletWidget() }).range(
          line.from + bullet[1].length,
          line.from + bullet[0].length,
        ),
      );
    }

    addInlineDecorations(ranges, line, activeLine);
  }

  return Decoration.set(ranges, true);
};

const livePreview = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildLivePreviewDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildLivePreviewDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const ToolbarButton = ({ children, title, onClick }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className="h-8 min-w-8 border border-[#5A5853] px-2 text-xs font-semibold"
  >
    {children}
  </button>
);

export function MarkdownEditor({ value, zoom = 1, onChange, onZoomChange, onUploadImage }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onZoomChangeRef = useRef(onZoomChange);
  const onUploadImageRef = useRef(onUploadImage);
  const zoomRef = useRef(zoom);
  const [uploadingImages, setUploadingImages] = useState(0);

  useEffect(() => {
    onChangeRef.current = onChange;
    onZoomChangeRef.current = onZoomChange;
    onUploadImageRef.current = onUploadImage;
    zoomRef.current = zoom;
  }, [onChange, onUploadImage, onZoomChange, zoom]);

  useEffect(() => {
    if (!hostRef.current) return undefined;

    const uploadPastedImage = async (view, file) => {
      if (!onUploadImageRef.current) return;

      const imageName = file.name?.replace(/\.[^.]+$/, '') || 'imagem';
      const token = `![Enviando ${imageName}...](mk-upload:${crypto.randomUUID()})`;
      const selection = view.state.selection.main;
      view.dispatch({ changes: { from: selection.from, to: selection.to, insert: token } });
      setUploadingImages((current) => current + 1);

      try {
        const uploaded = await onUploadImageRef.current(file);
        const currentDocument = view.state.doc.toString();
        const tokenPosition = currentDocument.indexOf(token);
        if (tokenPosition >= 0) {
          view.dispatch({
            changes: {
              from: tokenPosition,
              to: tokenPosition + token.length,
              insert: `![${imageName}](${uploaded.url})`,
            },
          });
        }
      } catch (error) {
        const currentDocument = view.state.doc.toString();
        const tokenPosition = currentDocument.indexOf(token);
        if (tokenPosition >= 0) {
          view.dispatch({ changes: { from: tokenPosition, to: tokenPosition + token.length } });
        }
        window.alert(`Nao foi possivel colar a imagem no documento MK.\n\n${error?.message ?? ''}`.trim());
      } finally {
        setUploadingImages((current) => Math.max(0, current - 1));
      }
    };

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        editorPlaceholder('# Titulo\n\nEscreva em Markdown ou cole uma imagem...'),
        livePreview,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          paste(event, view) {
            const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith('image/'));
            const file = imageItem?.getAsFile();
            if (!file) return false;
            event.preventDefault();
            void uploadPastedImage(view, file);
            return true;
          },
          wheel(event) {
            if (!event.ctrlKey) return false;
            event.preventDefault();
            const nextZoom = event.deltaY < 0 ? zoomRef.current + 0.1 : zoomRef.current - 0.1;
            onZoomChangeRef.current(Math.min(2.4, Math.max(0.7, Number(nextZoom.toFixed(2)))));
            return true;
          },
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  const applyFormat = (formatter) => {
    const view = viewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    const result = formatter(view.state.doc.toString(), selection.from, selection.to);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: result.value },
      selection: { anchor: result.selectionStart, head: result.selectionEnd },
    });
    view.focus();
  };

  const wrap = (prefix, suffix = prefix, placeholder = 'texto') =>
    applyFormat((documentValue, start, end) =>
      applyMarkdownWrap(documentValue, start, end, prefix, suffix, placeholder),
    );

  const prefixLines = (prefix, placeholder = 'Item') =>
    applyFormat((documentValue, start, end) =>
      applyMarkdownLinePrefix(documentValue, start, end, prefix, placeholder),
    );

  return (
    <div className="mk-live-editor flex h-full min-h-0 w-full flex-col border border-[#5A5853]" style={{ '--mk-editor-zoom': zoom }}>
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#5A5853] bg-[#2D2C2B] p-2">
        <ToolbarButton title="Titulo principal" onClick={() => prefixLines('# ', 'Titulo')}>H</ToolbarButton>
        <ToolbarButton title="Negrito" onClick={() => wrap('**', '**', 'negrito')}>B</ToolbarButton>
        <ToolbarButton title="Italico" onClick={() => wrap('*', '*', 'italico')}><em>I</em></ToolbarButton>
        <ToolbarButton title="Lista" onClick={() => prefixLines('- ')}>•</ToolbarButton>
        <ToolbarButton title="Checklist" onClick={() => prefixLines('- [ ] ')}>☐</ToolbarButton>
        <ToolbarButton title="Citacao" onClick={() => prefixLines('> ', 'Citacao')}>“</ToolbarButton>
        <ToolbarButton title="Codigo" onClick={() => wrap('`', '`', 'codigo')}>&lt;/&gt;</ToolbarButton>
        <ToolbarButton title="Link" onClick={() => wrap('[', '](https://)', 'texto do link')}>↗</ToolbarButton>
        <span className="ml-auto whitespace-nowrap px-2 text-xs text-[#8C8A85]">
          {uploadingImages ? 'Enviando imagem...' : 'Live Preview'}
        </span>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}
