import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { applyMarkdownLinePrefix, applyMarkdownWrap, insertMarkdownAtSelection } from '../utils/markdown';

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
  const textareaRef = useRef(null);
  const valueRef = useRef(value);
  const [mode, setMode] = useState('split');
  const [uploadingImages, setUploadingImages] = useState(0);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const emitChange = (nextValue) => {
    valueRef.current = nextValue;
    onChange(nextValue);
  };

  const applySelectionResult = (result) => {
    const textarea = textareaRef.current;
    if (!textarea || !result) return;

    emitChange(result.value);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const wrap = (prefix, suffix = prefix, placeholder = 'texto') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    applySelectionResult(
      applyMarkdownWrap(valueRef.current, textarea.selectionStart, textarea.selectionEnd, prefix, suffix, placeholder),
    );
  };

  const prefixLines = (prefix, placeholder = 'Item') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    applySelectionResult(
      applyMarkdownLinePrefix(valueRef.current, textarea.selectionStart, textarea.selectionEnd, prefix, placeholder),
    );
  };

  const insertImage = async (file, selectionStart, selectionEnd) => {
    if (!onUploadImage) return;

    const imageName = file.name?.replace(/\.[^.]+$/, '') || 'imagem';
    const placeholder = `![Enviando ${imageName}...](mk-upload:${crypto.randomUUID()})`;
    const insertion = insertMarkdownAtSelection(valueRef.current, selectionStart, selectionEnd, placeholder);
    emitChange(insertion.value);
    setUploadingImages((current) => current + 1);

    try {
      const uploaded = await onUploadImage(file);
      emitChange(valueRef.current.replace(placeholder, `![${imageName}](${uploaded.url})`));
    } catch (error) {
      emitChange(valueRef.current.replace(placeholder, ''));
      window.alert(`Nao foi possivel colar a imagem no documento MK.\n\n${error?.message ?? ''}`.trim());
    } finally {
      setUploadingImages((current) => Math.max(0, current - 1));
    }
  };

  const handlePaste = (event) => {
    const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith('image/'));
    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    event.preventDefault();
    void insertImage(file, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
  };

  const handleWheel = (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const nextZoom = event.deltaY < 0 ? zoom + 0.1 : zoom - 0.1;
    onZoomChange(Math.min(2.4, Math.max(0.7, Number(nextZoom.toFixed(2)))));
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col border border-[#5A5853] bg-[#1F1E1D]" onWheel={handleWheel}>
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#5A5853] bg-[#2D2C2B] p-2">
        <ToolbarButton title="Titulo principal" onClick={() => prefixLines('# ', 'Titulo')}>H</ToolbarButton>
        <ToolbarButton title="Negrito" onClick={() => wrap('**', '**', 'negrito')}>B</ToolbarButton>
        <ToolbarButton title="Italico" onClick={() => wrap('*', '*', 'italico')}><em>I</em></ToolbarButton>
        <ToolbarButton title="Lista" onClick={() => prefixLines('- ')}>•</ToolbarButton>
        <ToolbarButton title="Checklist" onClick={() => prefixLines('- [ ] ')}>☐</ToolbarButton>
        <ToolbarButton title="Citacao" onClick={() => prefixLines('> ', 'Citacao')}>“</ToolbarButton>
        <ToolbarButton title="Codigo" onClick={() => wrap('`', '`', 'codigo')}>&lt;/&gt;</ToolbarButton>
        <ToolbarButton title="Link" onClick={() => wrap('[', '](https://)', 'texto do link')}>↗</ToolbarButton>
        {uploadingImages ? <span className="px-2 text-xs text-[#8C8A85]">Enviando imagem...</span> : null}

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
            onChange={(event) => emitChange(event.target.value)}
            onPaste={handlePaste}
            placeholder="# Titulo\n\nEscreva seu documento em Markdown ou cole uma imagem..."
            spellCheck
            className={`mk-editor-input h-full min-h-0 w-full resize-none overflow-auto px-5 py-5 font-mono outline-none ${mode === 'split' ? 'border-r border-[#5A5853]' : ''}`}
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
              <p>O documento MK esta vazio.</p>
            )}
          </article>
        ) : null}
      </div>
    </div>
  );
}
