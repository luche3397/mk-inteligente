import { useEffect, useRef } from 'react';

export function NoteEditor({ value, zoom = 1, onChange, onZoomChange }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(textarea.scrollHeight, textarea.parentElement?.clientHeight ?? 0)}px`;
  }, [value]);

  const handleWheel = (event) => {
    if (!event.ctrlKey) return;

    event.preventDefault();

    const nextZoom = event.deltaY < 0 ? zoom + 0.1 : zoom - 0.1;
    const clampedZoom = Math.min(2.4, Math.max(0.7, Number(nextZoom.toFixed(2))));
    onZoomChange(clampedZoom);
  };

  return (
    <div
      onWheel={handleWheel}
      className="h-full w-full overflow-auto rounded-[24px] border border-[#2a2f3a] bg-[#11141a]"
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Escreva suas anotacoes aqui..."
        className="block min-h-full w-full resize-none bg-transparent px-6 py-6 text-[#e4e4e7] outline-none placeholder:text-[#6b7280]"
        style={{
          fontSize: `${16 * zoom}px`,
          lineHeight: 1.7,
        }}
      />
    </div>
  );
}
