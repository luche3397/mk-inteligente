import { useEffect, useRef, useState } from 'react';
import { attachExpandButton } from '../utils/expand-overlay';

export function HtmlViewer({ htmlContent, src, expandable = false, mode = 'html' }) {
  const containerRef = useRef(null);
  const [resolvedPdfSrc, setResolvedPdfSrc] = useState('');

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

      if (mode === 'pdf') {
        return {
          type: 'pdf',
          src: resolvedPdfSrc || src,
        };
      }

      return {
        type: 'html',
        htmlContent,
        src,
      };
    });
  }, [expandable, htmlContent, mode, resolvedPdfSrc, src]);

  useEffect(() => {
    if (mode !== 'pdf' || !src) {
      setResolvedPdfSrc('');
      return undefined;
    }

    let isActive = true;
    let objectUrl = '';

    const resolvePdfSrc = async () => {
      if (src.startsWith('blob:')) {
        if (isActive) {
          setResolvedPdfSrc(src);
        }
        return;
      }

      if (src.startsWith('data:')) {
        const response = await fetch(src);
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (isActive) {
          setResolvedPdfSrc(objectUrl);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
        return;
      }

      if (isActive) {
        setResolvedPdfSrc(src);
      }
    };

    void resolvePdfSrc();

    return () => {
      isActive = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [mode, src]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {mode === 'text' ? (
        <div className="h-full w-full overflow-auto rounded-2xl border border-white/10 bg-[#0f1115] p-6 text-sm leading-7 text-[#e4e4e7]">
          <pre className="whitespace-pre-wrap break-words font-mono">{htmlContent}</pre>
        </div>
      ) : mode === 'pdf' ? (
        <iframe
          title="PDF Preview"
          src={resolvedPdfSrc || src}
          className="h-full w-full rounded-2xl border border-white/10 bg-white"
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
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
