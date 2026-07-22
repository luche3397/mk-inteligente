import { useLayoutEffect, useRef } from 'react';

export function NoteEditor({ value, zoom = 1, onChange, onZoomChange }) {
  const containerRef = useRef(null);
  const textareaRef = useRef(null);
  const scrollPositionRef = useRef({ inner: 0, outer: 0 });
  const restoreFrameRef = useRef(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const textarea = textareaRef.current;
    if (!container || !textarea) return undefined;

    const outerContainer = container.parentElement;
    const desiredInnerScroll = scrollPositionRef.current.inner;
    const desiredOuterScroll = scrollPositionRef.current.outer;

    textarea.style.height = '0px';
    textarea.style.height = `${Math.max(textarea.scrollHeight, textarea.parentElement?.clientHeight ?? 0)}px`;
    container.scrollTop = desiredInnerScroll;
    if (outerContainer) outerContainer.scrollTop = desiredOuterScroll;

    restoreFrameRef.current = window.requestAnimationFrame(() => {
      container.scrollTop = desiredInnerScroll;
      if (outerContainer) outerContainer.scrollTop = desiredOuterScroll;
    });

    return () => {
      if (restoreFrameRef.current) {
        window.cancelAnimationFrame(restoreFrameRef.current);
        restoreFrameRef.current = null;
      }
    };
  }, [value, zoom]);

  const rememberScrollPosition = () => {
    const container = containerRef.current;
    if (!container) return;

    scrollPositionRef.current = {
      inner: container.scrollTop,
      outer: container.parentElement?.scrollTop ?? 0,
    };
  };

  const handleWheel = (event) => {
    if (!event.ctrlKey) return;

    event.preventDefault();

    const nextZoom = event.deltaY < 0 ? zoom + 0.1 : zoom - 0.1;
    const clampedZoom = Math.min(2.4, Math.max(0.7, Number(nextZoom.toFixed(2))));
    onZoomChange(clampedZoom);
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onScroll={rememberScrollPosition}
      className="h-full w-full overflow-auto rounded-[24px] border border-[#2a2f3a] bg-[#11141a]"
      style={{ overflowAnchor: 'none' }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          rememberScrollPosition();
          onChange(event.target.value);
        }}
        placeholder="Escreva suas anotacoes aqui..."
        className="block min-h-full w-full resize-none bg-transparent px-6 py-6 text-[#e4e4e7] outline-none placeholder:text-[#6b7280]"
        style={{
          fontSize: `${16 * zoom}px`,
          lineHeight: 1.7,
          overflowAnchor: 'none',
        }}
      />
    </div>
  );
}
