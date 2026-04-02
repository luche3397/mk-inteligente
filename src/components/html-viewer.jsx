import { useEffect, useRef } from 'react';
import { attachExpandButton } from '../utils/expand-overlay';

export function HtmlViewer({ htmlContent, src, expandable = false, mode = 'html' }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!expandable || !containerRef.current) {
      return undefined;
    }

    return attachExpandButton(containerRef.current, () => {
      if (mode === 'text') {
        return {
          type: 'text',
          textContent: htmlContent,
        };
      }

      return {
        type: 'html',
        htmlContent,
        src,
      };
    });
  }, [expandable, htmlContent, mode, src]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {mode === 'text' ? (
        <div className="h-full w-full overflow-auto rounded-2xl border border-white/10 bg-[#0f1115] p-6 text-sm leading-7 text-[#e4e4e7]">
          <pre className="whitespace-pre-wrap break-words font-mono">{htmlContent}</pre>
        </div>
      ) : (
        <iframe
          title="HTML Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
          src={src}
          srcDoc={src ? undefined : htmlContent}
          className="h-full w-full rounded-2xl border border-white/10 bg-white"
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      )}
    </div>
  );
}
