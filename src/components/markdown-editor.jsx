import { useEffect, useRef, useState } from 'react';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, keymap, placeholder as editorPlaceholder, ViewPlugin, WidgetType } from '@codemirror/view';
import { applyMarkdownLinePrefix, applyMarkdownWrap } from '../utils/markdown';

const toggleHeadingFold = StateEffect.define({
  map: (position, changes) => changes.mapPos(position),
});

const foldedHeadings = StateField.define({
  create: () => [],
  update(positions, transaction) {
    let nextPositions = transaction.docChanged
      ? positions.map((position) => transaction.changes.mapPos(position))
      : positions;

    for (const effect of transaction.effects) {
      if (!effect.is(toggleHeadingFold)) continue;
      nextPositions = nextPositions.includes(effect.value)
        ? nextPositions.filter((position) => position !== effect.value)
        : [...nextPositions, effect.value];
    }

    return [...new Set(nextPositions)].sort((left, right) => left - right);
  },
});

class HeadingFoldWidget extends WidgetType {
  constructor(position, collapsed) {
    super();
    this.position = position;
    this.collapsed = collapsed;
  }

  eq(other) {
    return other.position === this.position && other.collapsed === this.collapsed;
  }

  toDOM(view) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-mk-fold-toggle';
    button.textContent = this.collapsed ? '>' : 'v';
    button.title = this.collapsed ? 'Expandir seção' : 'Recolher seção';
    button.setAttribute('aria-label', button.title);
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const headingLine = view.state.doc.lineAt(this.position);
      view.dispatch({
        effects: toggleHeadingFold.of(this.position),
        selection: { anchor: headingLine.to },
      });
      view.focus();
    });
    return button;
  }

  ignoreEvent() {
    return false;
  }
}

class InternalMentionWidget extends WidgetType {
  constructor(label, href, onOpenMentionRef) {
    super();
    this.label = label;
    this.href = href;
    this.onOpenMentionRef = onOpenMentionRef;
  }

  eq(other) {
    return other.label === this.label && other.href === this.href;
  }

  toDOM() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-mk-internal-mention';
    button.textContent = this.label;
    button.title = 'Abrir referência interna';
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => this.onOpenMentionRef.current?.(this.href));
    return button;
  }

  ignoreEvent() {
    return false;
  }
}

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

const addInlineDecorations = (ranges, line, activeLine, onOpenMentionRef) => {
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

  addMatches(/\[(@[^\]]+)\]\((workspace:\/\/(?:title|section|card)\/[^)]+)\)/g, (match) => {
    const from = line.from + match.index;
    const to = from + match[0].length;
    if (activeLine) {
      ranges.push(Decoration.mark({ class: 'cm-mk-internal-mention-source' }).range(from, to));
    } else {
      ranges.push(
        Decoration.replace({ widget: new InternalMentionWidget(match[1], match[2], onOpenMentionRef) }).range(from, to),
      );
    }
  });

  addMatches(/(^|[^!])\[([^\]]+)\]\(([^)]+)\)/g, (match) => {
    if (match[3].startsWith('workspace://')) return;
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

const buildLivePreviewDecorations = (view, onOpenMentionRef) => {
  const ranges = [];
  const activeLineNumber = view.state.doc.lineAt(view.state.selection.main.head).number;
  const collapsedPositions = new Set(view.state.field(foldedHeadings));
  const headings = [];

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const heading = line.text.match(/^(#{1,6})\s+/);
    if (heading) headings.push({ line, level: heading[1].length });
  }

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const activeLine = lineNumber === activeLineNumber;
    const heading = line.text.match(/^(#{1,6})\s+/);
    const quote = line.text.match(/^>\s+/);
    const checklist = line.text.match(/^(\s*)- \[([ xX])\] /);
    const bullet = line.text.match(/^(\s*)[-*+]\s+/);

    if (heading) {
      const collapsed = collapsedPositions.has(line.from);
      ranges.push(Decoration.line({ class: `cm-mk-heading-line cm-mk-heading-${heading[1].length}` }).range(line.from));
      ranges.push(
        Decoration.widget({ widget: new HeadingFoldWidget(line.from, collapsed), side: -1 }).range(line.from),
      );
      if (!activeLine) {
        ranges.push(Decoration.replace({}).range(line.from, line.from + heading[0].length));
      }

      if (collapsed) {
        const headingIndex = headings.findIndex((item) => item.line.from === line.from);
        const nextHeading = headings.slice(headingIndex + 1).find((item) => item.level <= heading[1].length);
        const lastHiddenLine = nextHeading ? nextHeading.line.number - 1 : view.state.doc.lines;
        for (let hiddenLineNumber = lineNumber + 1; hiddenLineNumber <= lastHiddenLine; hiddenLineNumber += 1) {
          ranges.push(Decoration.line({ class: 'cm-mk-folded-line' }).range(view.state.doc.line(hiddenLineNumber).from));
        }
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

    addInlineDecorations(ranges, line, activeLine, onOpenMentionRef);
  }

  return Decoration.set(ranges, true);
};

const createLivePreview = (onOpenMentionRef) => ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildLivePreviewDecorations(view, onOpenMentionRef);
    }

    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged || update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(toggleHeadingFold)))) {
        this.decorations = buildLivePreviewDecorations(update.view, onOpenMentionRef);
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

export function MarkdownEditor({ value, zoom = 1, mentionItems = [], onChange, onZoomChange, onUploadImage, onOpenMention }) {
  const containerRef = useRef(null);
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onZoomChangeRef = useRef(onZoomChange);
  const onUploadImageRef = useRef(onUploadImage);
  const onOpenMentionRef = useRef(onOpenMention);
  const mentionItemsRef = useRef(mentionItems);
  const mentionMenuRef = useRef(null);
  const zoomRef = useRef(zoom);
  const [uploadingImages, setUploadingImages] = useState(0);
  const [mentionMenu, setMentionMenu] = useState(null);

  useEffect(() => {
    onChangeRef.current = onChange;
    onZoomChangeRef.current = onZoomChange;
    onUploadImageRef.current = onUploadImage;
    onOpenMentionRef.current = onOpenMention;
    mentionItemsRef.current = mentionItems;
    zoomRef.current = zoom;
  }, [mentionItems, onChange, onOpenMention, onUploadImage, onZoomChange, zoom]);

  useEffect(() => {
    if (!hostRef.current) return undefined;

    const updateMentionMenu = (nextMenu) => {
      mentionMenuRef.current = nextMenu;
      setMentionMenu(nextMenu);
    };

    const insertMention = (view, item, menu = mentionMenuRef.current) => {
      if (!item || !menu) return;
      const token = `[@${item.label}](${item.href})`;
      view.dispatch({
        changes: { from: menu.from, to: menu.to, insert: token },
        selection: { anchor: menu.from + token.length },
      });
      updateMentionMenu(null);
      view.focus();
    };

    const refreshMentionMenu = (view) => {
      const selection = view.state.selection.main;
      if (!selection.empty) {
        updateMentionMenu(null);
        return;
      }
      const line = view.state.doc.lineAt(selection.head);
      const prefix = view.state.doc.sliceString(line.from, selection.head);
      const match = prefix.match(/(?:^|\s)@([\p{L}\p{N}_ -]*)$/u);
      if (!match) {
        updateMentionMenu(null);
        return;
      }
      const query = match[1].trim().toLocaleLowerCase('pt-BR');
      const items = mentionItemsRef.current
        .filter((item) => !query || item.label.toLocaleLowerCase('pt-BR').includes(query))
        .slice(0, 8);
      const coords = view.coordsAtPos(selection.head);
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!coords || !containerRect) {
        updateMentionMenu(null);
        return;
      }
      updateMentionMenu({
        from: line.from + prefix.lastIndexOf('@'),
        to: selection.head,
        items,
        selectedIndex: 0,
        left: Math.max(8, Math.min(coords.left - containerRect.left, containerRect.width - 280)),
        top: coords.bottom - containerRect.top + 6,
      });
    };

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
        foldedHeadings,
        createLivePreview(onOpenMentionRef),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) refreshMentionMenu(update.view);
        }),
        EditorView.domEventHandlers({
          keydown(event, view) {
            const menu = mentionMenuRef.current;
            if (!menu) return false;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const direction = event.key === 'ArrowDown' ? 1 : -1;
              const itemCount = Math.max(1, menu.items.length);
              updateMentionMenu({ ...menu, selectedIndex: (menu.selectedIndex + direction + itemCount) % itemCount });
              return true;
            }
            if (event.key === 'Enter' && menu.items.length) {
              event.preventDefault();
              insertMention(view, menu.items[menu.selectedIndex], menu);
              return true;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              updateMentionMenu(null);
              return true;
            }
            return false;
          },
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
      mentionMenuRef.current = null;
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
    <div ref={containerRef} className="mk-live-editor relative flex h-full min-h-0 w-full flex-col border border-[#5A5853]" style={{ '--mk-editor-zoom': zoom }}>
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
      {mentionMenu ? (
        <div
          role="listbox"
          aria-label="Menções internas"
          className="absolute z-50 w-72 overflow-hidden border border-[#5A5853] bg-[#2D2C2B] p-1"
          style={{ left: mentionMenu.left, top: mentionMenu.top }}
        >
          {mentionMenu.items.length ? mentionMenu.items.map((item, index) => (
            <button
              key={item.href}
              type="button"
              role="option"
              aria-selected={index === mentionMenu.selectedIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const view = viewRef.current;
                if (!view) return;
                const token = `[@${item.label}](${item.href})`;
                view.dispatch({
                  changes: { from: mentionMenu.from, to: mentionMenu.to, insert: token },
                  selection: { anchor: mentionMenu.from + token.length },
                });
                mentionMenuRef.current = null;
                setMentionMenu(null);
                view.focus();
              }}
              className="flex w-full items-center gap-2 border border-transparent px-2.5 py-2 text-left text-xs"
            >
              <span className="min-w-14 text-[9px] uppercase tracking-[0.12em] text-[#8C8A85]">{item.typeLabel}</span>
              <span className="truncate">{item.label}</span>
            </button>
          )) : <p className="px-2.5 py-2 text-xs text-[#8C8A85]">Nenhuma referência encontrada.</p>}
        </div>
      ) : null}
    </div>
  );
}
