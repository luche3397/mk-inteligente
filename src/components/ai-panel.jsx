import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseAnonKey } from '../supabaseClient';
import { buildAiRequestPayload } from '../utils/ai-request';

const PANEL_WIDTH_KEY = 'workspaceAiPanelWidth';
const PANEL_DEFAULT_WIDTH = 360;
const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 600;
const MAX_IMAGES = 2;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const MAX_MESSAGE_LENGTH = 12_000;

const clampPanelWidth = (value) => Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, value));

const getInitialPanelWidth = () => {
  if (typeof window === 'undefined') return PANEL_DEFAULT_WIDTH;
  const stored = Number(window.localStorage.getItem(PANEL_WIDTH_KEY));
  return Number.isFinite(stored) && stored > 0 ? clampPanelWidth(stored) : PANEL_DEFAULT_WIDTH;
};

const readBlobAsDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Nao foi possivel abrir a imagem.'));
    image.src = src;
  });

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Nao foi possivel processar a imagem.'))), type, quality);
  });

const normalizeImageBlob = async (sourceBlob) => {
  const sourceUrl = URL.createObjectURL(sourceBlob);
  try {
    const image = await loadImage(sourceUrl);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);

    let blob = await canvasToBlob(canvas, 'image/webp', 0.82);
    if (blob.size > MAX_IMAGE_BYTES) {
      const reducedScale = Math.min(1, 1200 / Math.max(canvas.width, canvas.height));
      const reduced = document.createElement('canvas');
      reduced.width = Math.max(1, Math.round(canvas.width * reducedScale));
      reduced.height = Math.max(1, Math.round(canvas.height * reducedScale));
      reduced.getContext('2d', { alpha: false }).drawImage(canvas, 0, 0, reduced.width, reduced.height);
      blob = await canvasToBlob(reduced, 'image/webp', 0.68);
    }
    if (blob.size > MAX_IMAGE_BYTES) throw new Error('A imagem continua muito grande depois da compressao.');

    const previewUrl = await readBlobAsDataUrl(blob);
    return {
      id: crypto.randomUUID(),
      type: 'image',
      mimeType: blob.type || 'image/webp',
      data: previewUrl.split(',')[1] ?? '',
      previewUrl,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
};

const captureCurrentTabFrame = async () => {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Este navegador nao oferece captura de aba. Use Chrome ou Edge atualizado.');
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser' },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'exclude',
  });

  try {
    const track = stream.getVideoTracks()[0];
    if (track?.getSettings?.().displaySurface && track.getSettings().displaySurface !== 'browser') {
      throw new Error('Selecione a aba atual do workspace para fazer a captura.');
    }

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    if (!video.videoWidth || !video.videoHeight) {
      await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d', { alpha: false }).drawImage(video, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
};

function Icon({ name, className = 'h-4 w-4' }) {
  const paths = {
    close: <path d="M6 6l12 12M18 6L6 18" />,
    send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />,
    camera: <><path d="M14.5 4l1.5 2h3a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h3l1.5-2z" /><circle cx="12" cy="13" r="3.5" /></>,
    sparkle: <><path d="M12 3l1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8L12 3z" /><path d="M5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15z" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{paths[name]}</svg>;
}

const renderInlineMarkdown = (text) => {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\)|\*[^*]+\*)/g;
  const nodes = [];
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `${match.index}-${token}`;
    if (token.startsWith('**')) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      nodes.push(<a key={key} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>);
    } else nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    cursor = match.index + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
};

function AiMarkdown({ children }) {
  const blocks = useMemo(() => {
    const lines = String(children ?? '').split('\n');
    const parsed = [];
    let code = null;

    lines.forEach((line, index) => {
      if (line.startsWith('```')) {
        if (code) {
          parsed.push({ type: 'code', value: code.lines.join('\n'), language: code.language });
          code = null;
        } else code = { language: line.slice(3).trim(), lines: [] };
        return;
      }
      if (code) {
        code.lines.push(line);
        return;
      }
      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      const list = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
      if (heading) parsed.push({ type: 'heading', level: heading[1].length, value: heading[2] });
      else if (list) parsed.push({ type: list[1].match(/\d/) ? 'ordered' : 'unordered', value: list[2] });
      else if (line.startsWith('> ')) parsed.push({ type: 'quote', value: line.slice(2) });
      else if (line.trim()) parsed.push({ type: 'paragraph', value: line });
      else parsed.push({ type: 'space', value: '', key: index });
    });
    if (code) parsed.push({ type: 'code', value: code.lines.join('\n'), language: code.language });
    return parsed;
  }, [children]);

  return (
    <div className="ai-markdown">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === 'code') return <pre key={key}><code>{block.value}</code></pre>;
        if (block.type === 'heading') {
          const Heading = `h${block.level}`;
          return <Heading key={key}>{renderInlineMarkdown(block.value)}</Heading>;
        }
        if (block.type === 'ordered' || block.type === 'unordered') return <div key={key} className="ai-markdown-list"><span>{block.type === 'ordered' ? `${index + 1}.` : '•'}</span><span>{renderInlineMarkdown(block.value)}</span></div>;
        if (block.type === 'quote') return <blockquote key={key}>{renderInlineMarkdown(block.value)}</blockquote>;
        if (block.type === 'space') return <div key={key} className="h-2" />;
        return <p key={key}>{renderInlineMarkdown(block.value)}</p>;
      })}
    </div>
  );
}

function CaptureOverlay({ source, onCancel, onCapture }) {
  const [selection, setSelection] = useState(null);
  const startRef = useRef(null);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onCancel]);

  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = { x: event.clientX, y: event.clientY };
    setSelection({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
  };

  const handlePointerMove = (event) => {
    if (!startRef.current) return;
    const x = Math.min(startRef.current.x, event.clientX);
    const y = Math.min(startRef.current.y, event.clientY);
    setSelection({ x, y, width: Math.abs(event.clientX - startRef.current.x), height: Math.abs(event.clientY - startRef.current.y) });
  };

  const handlePointerUp = async (event) => {
    if (!startRef.current || !selection || selection.width < 12 || selection.height < 12) {
      startRef.current = null;
      setSelection(null);
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    startRef.current = null;

    const image = await loadImage(source);
    const scaleX = image.naturalWidth / window.innerWidth;
    const scaleY = image.naturalHeight / window.innerHeight;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(selection.width * scaleX));
    canvas.height = Math.max(1, Math.round(selection.height * scaleY));
    canvas.getContext('2d', { alpha: false }).drawImage(
      image,
      Math.round(selection.x * scaleX),
      Math.round(selection.y * scaleY),
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await canvasToBlob(canvas, 'image/png');
    onCapture(blob);
  };

  return (
    <div
      className="fixed inset-0 z-[200] cursor-crosshair touch-none select-none overflow-hidden bg-black"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => void handlePointerUp(event)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <img src={source} alt="Tela congelada para captura" className="pointer-events-none absolute inset-0 h-full w-full" draggable="false" />
      <div className="pointer-events-none absolute inset-0 bg-black/25" />
      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 border border-[#5a5853] bg-[#181817] px-3 py-2 text-xs text-[#ecebe8]">
        Arraste para selecionar uma area. Esc cancela.
      </div>
      {selection ? (
        <div
          className="pointer-events-none absolute border border-[#ecebe8] bg-white/5"
          style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}
        />
      ) : null}
    </div>
  );
}

export function AiPanel({ isOpen, session, onClose }) {
  const [panelWidth, setPanelWidth] = useState(getInitialPanelWidth);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureSource, setCaptureSource] = useState(null);
  const [error, setError] = useState('');
  const resizeRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [isOpen, messages, isSending]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !captureSource) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [captureSource, isOpen, onClose]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!resizeRef.current) return;
      const next = clampPanelWidth(resizeRef.current.startWidth + resizeRef.current.startX - event.clientX);
      resizeRef.current.currentWidth = next;
      setPanelWidth(next);
    };
    const handlePointerUp = () => {
      if (!resizeRef.current) return;
      window.localStorage.setItem(PANEL_WIDTH_KEY, String(resizeRef.current.currentWidth));
      resizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const addImage = async (blob) => {
    if (attachments.length >= MAX_IMAGES) {
      setError(`Envie no maximo ${MAX_IMAGES} imagens por mensagem.`);
      return;
    }
    try {
      const image = await normalizeImageBlob(blob);
      setAttachments((current) => current.length >= MAX_IMAGES ? current : [...current, image]);
      setError('');
    } catch (imageError) {
      setError(imageError.message || 'Nao foi possivel processar a imagem.');
    }
  };

  const handlePaste = (event) => {
    const imageItems = [...(event.clipboardData?.items ?? [])].filter((item) => item.type.startsWith('image/'));
    if (!imageItems.length) return;
    event.preventDefault();
    imageItems.slice(0, MAX_IMAGES - attachments.length).forEach((item) => {
      const file = item.getAsFile();
      if (file) void addImage(file);
    });
  };

  const startCapture = async () => {
    if (isCapturing || attachments.length >= MAX_IMAGES) return;
    setIsCapturing(true);
    setError('');
    try {
      const frame = await captureCurrentTabFrame();
      setCaptureSource(frame);
    } catch (captureError) {
      if (captureError?.name !== 'NotAllowedError') setError(captureError.message || 'Captura cancelada.');
    } finally {
      setIsCapturing(false);
    }
  };

  const sendMessage = async () => {
    const message = draft.trim();
    if (isSending || (!message && !attachments.length)) return;
    if (!session?.access_token) {
      setError('Sua sessao expirou. Entre novamente para usar a IA.');
      return;
    }

    const outgoingAttachments = attachments;
    const userMessage = { id: crypto.randomUUID(), role: 'user', content: message, attachments: outgoingAttachments };
    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setAttachments([]);
    setIsSending(true);
    setError('');

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          'X-Supabase-Anon-Key': supabaseAnonKey,
        },
        body: JSON.stringify(buildAiRequestPayload({
          message,
          messages,
          attachments: outgoingAttachments,
        })),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Nao foi possivel obter uma resposta.');
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: result.answer }]);
    } catch (requestError) {
      setError(requestError.message || 'Falha temporaria ao consultar a IA.');
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  if (!isOpen) return null;

  return (
    <Fragment>
      <aside
        data-ai-panel
        className="fixed inset-y-0 right-0 z-[100] flex w-full flex-col border-l border-[#5a5853] bg-[#181817] sm:max-w-[600px] md:static md:z-auto md:max-w-none"
        style={{ '--ai-panel-width': `${panelWidth}px`, width: 'min(100vw, var(--ai-panel-width))' }}
        aria-label="Assistente IA"
      >
        <button
          type="button"
          aria-label="Redimensionar painel da IA"
          className="absolute inset-y-0 left-0 hidden w-1 -translate-x-1/2 cursor-col-resize border-0 md:block"
          onPointerDown={(event) => {
            event.preventDefault();
            resizeRef.current = { startX: event.clientX, startWidth: panelWidth, currentWidth: panelWidth };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
        />

        <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#5a5853] px-3">
          <div className="flex items-center gap-2">
            <Icon name="sparkle" />
            <h2 className="text-sm font-semibold">Assistente IA</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center border border-transparent" aria-label="Fechar assistente">
            <Icon name="close" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-live="polite">
          {!messages.length ? (
            <div className="flex min-h-full flex-col justify-center">
              <p className="font-serif text-xl text-[#ecebe8]">Como posso ajudar?</p>
              <p className="mt-2 text-xs leading-5 text-[#8c8a85]">Cole texto ou imagem manualmente. Nenhum conteudo do workspace e lido automaticamente.</p>
              <div className="mt-5 grid grid-cols-2 gap-1.5">
                {['Explicar', 'Resumir', 'Reescrever', 'Organizar ideias'].map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="border border-[#5a5853] px-3 py-2 text-left text-xs"
                    onClick={() => {
                      setDraft(`${label} o conteudo que vou enviar.`);
                      requestAnimationFrame(() => textareaRef.current?.focus());
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <article key={message.id} className={message.role === 'user' ? 'ml-6 border-l border-[#5a5853] pl-3' : 'pr-2'}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8c8a85]">{message.role === 'user' ? 'Voce' : 'Assistente'}</p>
                  {message.attachments?.length ? (
                    <div className="mb-2 flex gap-2 overflow-x-auto">
                      {message.attachments.map((attachment) => <img key={attachment.id} src={attachment.previewUrl} alt="Imagem enviada" className="h-24 max-w-[180px] border border-[#5a5853] object-cover" />)}
                    </div>
                  ) : null}
                  {message.role === 'assistant' ? <AiMarkdown>{message.content}</AiMarkdown> : <p className="whitespace-pre-wrap text-sm leading-6 text-[#ecebe8]">{message.content}</p>}
                </article>
              ))}
              {isSending ? <p className="text-xs text-[#8c8a85]">Pensando...</p> : null}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-[#5a5853] p-2.5">
          {attachments.length ? (
            <div className="mb-2 flex gap-2 overflow-x-auto">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="relative shrink-0">
                  <img src={attachment.previewUrl} alt="Preview do anexo" className="h-20 w-28 border border-[#5a5853] object-cover" />
                  <button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center border border-[#5a5853] bg-[#181817]" aria-label="Remover imagem">
                    <Icon name="close" className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {error ? <p className="mb-2 border-l border-[#a06b6b] pl-2 text-xs leading-5 text-[#e6b8b8]">{error}</p> : null}
          <div className="border border-[#5a5853] bg-[#2d2c2b]">
            <textarea
              ref={textareaRef}
              value={draft}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={3}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={handlePaste}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Digite ou cole seu conteudo..."
              className="block max-h-40 min-h-[72px] w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-5 outline-none"
            />
            <div className="flex items-center justify-between border-t border-[#5a5853] px-1.5 py-1.5">
              <button type="button" onClick={() => void startCapture()} disabled={isCapturing || attachments.length >= MAX_IMAGES} className="flex h-8 items-center gap-1.5 border border-transparent px-2 text-xs" title="Capturar area da tela">
                <Icon name="camera" />
                <span>{isCapturing ? 'Abrindo...' : 'Captura de tela'}</span>
              </button>
              <button type="button" onClick={() => void sendMessage()} disabled={isSending || (!draft.trim() && !attachments.length)} className="flex h-8 w-8 items-center justify-center border border-[#5a5853]" aria-label="Enviar mensagem">
                <Icon name="send" />
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-[10px] text-[#8c8a85]">Enter envia · Shift+Enter cria nova linha</p>
        </div>
      </aside>

      {captureSource ? (
        <CaptureOverlay
          source={captureSource}
          onCancel={() => setCaptureSource(null)}
          onCapture={(blob) => {
            setCaptureSource(null);
            void addImage(blob);
          }}
        />
      ) : null}
    </Fragment>
  );
}
