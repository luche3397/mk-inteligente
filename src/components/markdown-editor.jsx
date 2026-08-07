import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ToolbarButton = ({ children, title, onClick }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className="h-8 min-w-8 border border-[#5A5853] px-2 text-xs font-semibold"
  >
    {children}
  </button>
);

export function MarkdownEditor({ value, zoom = 1, onChange, onZoomChange }) {
  const textareaRef = useRef(null);
  const [mode, setMode] = useState('edit');

  const updateSelection = (builder) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const result = builder({ selected, start, end });
    onChange(`${value.slice(0, start)}${result.text}${value.slice(end)}`);

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + result.selectionStart, start + result.selectionEnd);
    });
  };

  const wrap = (prefix, suffix = prefix, placeholder = 'texto') =>
    updateSelection(({ selected }) => {
      const content = selected || placeholder;
      return {
        text: `${prefix}${content}${suffix}`,
        selectionStart: prefix.length,
        selectionEnd: prefix.length + content.length,
      };
    });

  const prefixLines = (prefix, placeholder = 'Item') =>
    updateSelection(({ selected }) => {
      const content = selected || placeholder;
      const text = content.split('\n').map((line) => `${prefix}${line}`).join('\n');
      return { text, selectionStart: prefix.length, selectionEnd: text.length };
    });

  const handleWheel = (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const nextZoom = event.deltaY < 0 ? zoom + 0.1 : zoom - 0.1;
    onZoomChange(Math.min(2.4, Math.max(0.7, Number(nextZoom.toFixed(2)))));
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col border border-[#5A5853] bg-[#1F1E1D]" onWheel={handleWheel}>
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#5A5853] bg-[#2D2C2B] p-2">
        <ToolbarButton title="Título" onClick={() => prefixLines('## ', 'Título')}>H</ToolbarButton>
        <ToolbarButton title="Negrito" onClick={() => wrap('**', '**', 'negrito')}>B</ToolbarButton>
        <ToolbarButton title="Itálico" onClick={() => wrap('_', '_', 'itálico')}><em>I</em></ToolbarButton>
        <ToolbarButton title="Lista" onClick={() => prefixLines('- ')}>•</ToolbarButton>
        <ToolbarButton title="Checklist" onClick={() => prefixLines('- [ ] ')}>☐</ToolbarButton>
        <ToolbarButton title="Citação" onClick={() => prefixLines('> ', 'Citação')}>“</ToolbarButton>
        <ToolbarButton title="Código" onClick={() => wrap('`', '`', 'código')}>&lt;/&gt;</ToolbarButton>
        <ToolbarButton title="Link" onClick={() => wrap('[', '](https://)', 'texto do link')}>↗</ToolbarButton>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button type="button" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')} className="h-8 border border-[#5A5853] px-3 text-xs">Editar</button>
          <button type="button" aria-pressed={mode === 'split'} onClick={() => setMode('split')} className="hidden h-8 border border-[#5A5853] px-3 text-xs sm:block">Dividir</button>
          <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')} className="h-8 border border-[#5A5853] px-3 text-xs">Visualizar</button>
        </div>
      </div>

      <div className={`min-h-0 flex-1 ${mode === 'split' ? 'grid sm:grid-cols-2' : 'block'}`}>
        {mode !== 'preview' ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="# Título\n\nEscreva seu documento em Markdown..."
            spellCheck
            className={`h-full min-h-0 w-full resize-none overflow-auto bg-[#1F1E1D] px-5 py-5 font-mono outline-none ${mode === 'split' ? 'border-r border-[#5A5853]' : ''}`}
            style={{ fontSize: `${15 * zoom}px`, lineHeight: 1.7, overflowAnchor: 'none' }}
          />
        ) : null}

        {mode !== 'edit' ? (
          <article className="mk-preview h-full min-h-0 overflow-auto bg-[#1F1E1D] px-6 py-5" style={{ fontSize: `${16 * zoom}px` }}>
            {value.trim() ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
                }}
              >
                {value}
              </ReactMarkdown>
            ) : (
              <p>O documento MK está vazio.</p>
            )}
          </article>
        ) : null}
      </div>
    </div>
  );
}
