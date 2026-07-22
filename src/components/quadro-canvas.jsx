import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GRID_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  canvasNow,
  clamp,
  createCanvasId,
  createCanvasNode,
  deleteCanvasSelection,
  deserializeCanvasDocument,
  duplicateCanvasSelection,
  fitCanvasBounds,
  getBezierPath,
  getNodeAnchor,
  getNodesBounds,
  isSafeHttpUrl,
  looksLikeImageUrl,
  nodesInSelection,
  normalizeCanvasDocument,
  screenToWorld,
  serializeCanvasDocument,
  worldToScreen,
} from '../utils/canvas';

const COLORS = [null, '#7c83ff', '#2dd4bf', '#f59e0b', '#f472b6', '#ef4444'];
const SIDES = ['top', 'right', 'bottom', 'left'];
const RESIZE_HANDLES = ['nw', 'ne', 'se', 'sw'];
const CLIPBOARD_PREFIX = 'workspace-quadro:';

const isTextInput = (target) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const getImageDimensions = (src) =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 320, height: image.naturalHeight || 220 });
    image.onerror = () => resolve({ width: 320, height: 220 });
    image.src = src;
  });

const nearestSide = (node, point) => {
  const distances = {
    top: Math.abs(point.y - node.y),
    right: Math.abs(point.x - (node.x + node.width)),
    bottom: Math.abs(point.y - (node.y + node.height)),
    left: Math.abs(point.x - node.x),
  };
  return Object.entries(distances).sort((left, right) => left[1] - right[1])[0][0];
};

const ResizeHandles = () => (
  <>
    {RESIZE_HANDLES.map((handle) => (
      <button
        key={handle}
        type="button"
        data-resize-handle={handle}
        aria-label={`Redimensionar pelo ponto ${handle}`}
        className={`absolute z-30 h-3 w-3 rounded-full border border-[#7c83ff] bg-white shadow-sm ${
          {
            nw: '-left-1.5 -top-1.5 cursor-nwse-resize',
            n: 'left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize',
            ne: '-right-1.5 -top-1.5 cursor-nesw-resize',
            e: '-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize',
            se: '-bottom-1.5 -right-1.5 cursor-nwse-resize',
            s: '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize',
            sw: '-bottom-1.5 -left-1.5 cursor-nesw-resize',
            w: '-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize',
          }[handle]
        }`}
      />
    ))}
  </>
);

const ConnectionHandles = ({ nodeId }) => (
  <>
    {SIDES.map((side) => (
      <button
        key={side}
        type="button"
        data-connection-handle={side}
        data-node-id={nodeId}
        title={`Criar conexão pela lateral ${side}`}
        aria-label={`Criar conexão pela lateral ${side}`}
        className={`absolute z-30 h-3.5 w-3.5 rounded-full border-2 border-[#11141a] bg-[#8b91ff] shadow ${
          {
            top: 'left-1/2 -top-2 -translate-x-1/2',
            right: '-right-2 top-1/2 -translate-y-1/2',
            bottom: '-bottom-2 left-1/2 -translate-x-1/2',
            left: '-left-2 top-1/2 -translate-y-1/2',
          }[side]
        }`}
      />
    ))}
  </>
);

function CanvasNode({ node, selected, hovered, connectionTarget, editing, lowDetail, onEdit, onHoverChange, onTextChange, onTextCommit, onOpenImage }) {
  const colorStyle = node.color
    ? { borderColor: node.color, backgroundColor: `${node.color}18` }
    : undefined;

  return (
    <div
      data-node-id={node.id}
      data-node-type={node.type}
      className={`absolute cursor-grab select-none rounded-2xl border shadow-[0_14px_34px_rgba(0,0,0,0.28)] active:cursor-grabbing ${
        node.type === 'group' ? 'bg-[#15182180]' : 'bg-[#191c23]'
      } ${selected ? 'border-[#8b91ff] ring-1 ring-[#8b91ff]' : connectionTarget ? 'border-[#65d8c5] ring-2 ring-[#65d8c580]' : hovered ? 'border-[#666e80] ring-1 ring-[#666e8060]' : 'border-[#343946]'}`}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height, zIndex: node.zIndex, ...colorStyle }}
      onPointerEnter={() => onHoverChange(node.id)}
      onPointerLeave={() => onHoverChange(null)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onEdit(node);
      }}
    >
      {node.type === 'text' ? (
        editing ? (
          <textarea
            autoFocus
            value={node.text ?? ''}
            onChange={(event) => onTextChange(node.id, { text: event.target.value })}
            onBlur={onTextCommit}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            className="h-full w-full resize-none select-text rounded-2xl bg-transparent px-4 py-3 text-sm leading-6 text-white outline-none"
          />
        ) : (
          <div className="h-full overflow-hidden whitespace-pre-wrap break-words px-4 py-3 text-sm leading-6 text-[#f4f4f5]">
            {lowDetail ? (node.text || 'Texto').slice(0, 80) : node.text || 'Novo texto'}
          </div>
        )
      ) : null}

      {node.type === 'image' ? (
        <button type="button" className="group relative h-full w-full overflow-hidden rounded-2xl" onDoubleClick={() => onOpenImage(node.image?.src)}>
          <img src={node.image?.src} alt={node.image?.alt || node.caption || 'Imagem do quadro'} loading="lazy" className="h-full w-full object-contain" draggable={false} />
          {node.caption ? <span className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-left text-xs text-white">{node.caption}</span> : null}
        </button>
      ) : null}

      {node.type === 'link' ? (
        <div className="flex h-full flex-col justify-center gap-2 overflow-hidden px-4 py-3">
          <span className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-[#9ba1b2]">
            {node.link?.url ? new URL(node.link.url).hostname : 'Link'}
          </span>
          <span className="line-clamp-2 text-sm font-semibold text-white">{node.link?.title || node.link?.url}</span>
          <span className="truncate text-xs text-[#9399a8]">Ctrl + clique para abrir</span>
        </div>
      ) : null}

      {node.type === 'group' ? (
        editing ? (
          <input
            autoFocus
            value={node.group?.title ?? ''}
            onChange={(event) => onTextChange(node.id, { group: { ...node.group, title: event.target.value } })}
            onBlur={onTextCommit}
            onKeyDown={(event) => event.key === 'Escape' && event.currentTarget.blur()}
            className="mx-3 mt-2 w-[calc(100%-24px)] rounded-lg bg-black/20 px-2 py-1 text-sm font-semibold text-white outline-none"
          />
        ) : (
          <div className="pointer-events-none px-4 py-3 text-sm font-semibold text-[#d7d9e1]">{node.group?.title || 'Grupo'}</div>
        )
      ) : null}

      {selected || hovered ? <ResizeHandles /> : null}
      {selected || hovered || connectionTarget ? <ConnectionHandles nodeId={node.id} /> : null}
    </div>
  );
}

function FloatingButton({ children, onClick, title, disabled = false, active = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`rounded-xl border px-3 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-35 ${
        active ? 'border-[#858cff] bg-[#3a3f6b]' : 'border-[#3a404d] bg-[#20232a] hover:bg-[#2f3542]'
      }`}
    >
      {children}
    </button>
  );
}

function ContextIconButton({ children, onClick, title, active = false, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition ${
        danger
          ? 'border-[#5a3037] bg-[#2a171c] text-[#ff9b9b] hover:bg-[#3b2028]'
          : active
            ? 'border-[#7c83ff] bg-[#343861] text-white'
            : 'border-[#383e4b] bg-[#20232a] text-[#e5e7eb] hover:bg-[#303541]'
      }`}
    >
      {children}
    </button>
  );
}

export function QuadroCanvas({ documentValue, onChange, onExit, onUploadImage }) {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);
  const documentRef = useRef(normalizeCanvasDocument(documentValue));
  const interactionRef = useRef({ type: 'idle' });
  const suppressContextMenuRef = useRef(false);
  const pointerWorldRef = useRef(null);
  const historyRef = useRef({ past: [], future: [] });
  const clipboardRef = useRef(null);
  const [documentState, setDocumentState] = useState(documentRef.current);
  const [selection, setSelection] = useState({ nodeIds: [], edgeId: null });
  const [editing, setEditing] = useState(null);
  const [interactionVisual, setInteractionVisual] = useState(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [imagePreview, setImagePreview] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [isColorPaletteOpen, setIsColorPaletteOpen] = useState(false);

  const setDocument = useCallback((nextDocument, persist = false) => {
    const normalized = normalizeCanvasDocument(nextDocument);
    documentRef.current = normalized;
    setDocumentState(normalized);
    if (persist) onChange?.(normalized);
  }, [onChange]);

  const commit = useCallback((nextDocument, previousDocument = documentRef.current) => {
    const normalized = normalizeCanvasDocument(nextDocument);
    if (serializeCanvasDocument(previousDocument) !== serializeCanvasDocument(normalized)) {
      historyRef.current.past.push(normalizeCanvasDocument(previousDocument));
      if (historyRef.current.past.length > 80) historyRef.current.past.shift();
      historyRef.current.future = [];
      setHistoryVersion((value) => value + 1);
    }
    setDocument(normalized, true);
  }, [setDocument]);

  useEffect(() => {
    const next = normalizeCanvasDocument(documentValue);
    if (serializeCanvasDocument(next) !== serializeCanvasDocument(documentRef.current)) setDocument(next, false);
  }, [documentValue, setDocument]);

  const getRect = () => canvasRef.current?.getBoundingClientRect();
  const screenPointToWorld = (clientX, clientY) => {
    const rect = getRect();
    return rect ? screenToWorld(clientX, clientY, rect, documentRef.current.viewport) : { x: 0, y: 0 };
  };
  const viewportCenter = () => {
    const rect = getRect();
    if (!rect) return { x: 0, y: 0 };
    return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2, rect, documentRef.current.viewport);
  };

  const nextZIndex = () => Math.max(1, ...documentRef.current.nodes.map((node) => node.zIndex)) + 1;

  const addNode = (node, edit = false, previous = documentRef.current) => {
    const prepared = { ...node, zIndex: node.type === 'group' ? 0 : nextZIndex() };
    commit({ ...documentRef.current, nodes: [...documentRef.current.nodes, prepared] }, previous);
    setSelection({ nodeIds: [prepared.id], edgeId: null });
    setEditing(edit ? { type: 'node', id: prepared.id } : null);
    return prepared;
  };

  const addTextAt = (point, text = 'Novo texto') => addNode(createCanvasNode('text', point.x - 130, point.y - 60, { text }), true);

  const addLinkAt = (point, url) => {
    if (!isSafeHttpUrl(url)) return;
    const parsed = new URL(url);
    addNode(createCanvasNode('link', point.x - 150, point.y - 60, { link: { url, title: parsed.hostname } }));
  };

  const addImageSourceAt = async (src, point, metadata = {}) => {
    const dimensions = await getImageDimensions(src);
    const ratio = dimensions.width / dimensions.height;
    const width = Math.min(420, Math.max(160, dimensions.width));
    const height = Math.min(320, width / ratio);
    addNode(createCanvasNode('image', point.x - width / 2, point.y - height / 2, {
      width,
      height,
      image: { src, naturalWidth: dimensions.width, naturalHeight: dimensions.height, ...metadata },
    }));
  };

  const addImageFileAt = async (file, point) => {
    if (!file?.type?.startsWith('image/') || file.size > 15 * 1024 * 1024) {
      window.alert('Use uma imagem PNG, JPEG, WebP ou GIF de até 15 MB.');
      return;
    }
    try {
      const uploaded = onUploadImage ? await onUploadImage(file) : null;
      const src = uploaded?.url || (await readFileAsDataUrl(file));
      await addImageSourceAt(src, point, { storageId: uploaded?.path, alt: file.name });
    } catch (error) {
      console.error('Erro ao inserir imagem no quadro:', error);
      window.alert('Não foi possível inserir a imagem no Quadro.');
    }
  };

  const createGroup = () => {
    const selectedNodes = documentRef.current.nodes.filter((node) => selection.nodeIds.includes(node.id));
    const bounds = getNodesBounds(selectedNodes);
    const center = viewportCenter();
    const node = bounds
      ? createCanvasNode('group', bounds.minX - 36, bounds.minY - 56, {
          width: bounds.maxX - bounds.minX + 72,
          height: bounds.maxY - bounds.minY + 92,
        })
      : createCanvasNode('group', center.x - 210, center.y - 130);
    addNode(node);
  };

  const removeSelection = () => {
    if (!selection.nodeIds.length && !selection.edgeId) return;
    const previous = documentRef.current;
    commit(deleteCanvasSelection(previous, selection.nodeIds, selection.edgeId ? [selection.edgeId] : []), previous);
    setSelection({ nodeIds: [], edgeId: null });
    setEditing(null);
  };

  const duplicateSelection = (offset = 32) => {
    if (!selection.nodeIds.length) return;
    const previous = documentRef.current;
    const result = duplicateCanvasSelection(previous, selection.nodeIds, offset);
    commit(result.document, previous);
    setSelection({ nodeIds: result.nodeIds, edgeId: null });
    return result.nodeIds;
  };

  const undo = useCallback(() => {
    const previous = historyRef.current.past.pop();
    if (!previous) return;
    historyRef.current.future.push(documentRef.current);
    setDocument(previous, true);
    setSelection({ nodeIds: [], edgeId: null });
    setHistoryVersion((value) => value + 1);
  }, [setDocument]);

  const redo = useCallback(() => {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(documentRef.current);
    setDocument(next, true);
    setSelection({ nodeIds: [], edgeId: null });
    setHistoryVersion((value) => value + 1);
  }, [setDocument]);

  const fitNodes = (nodeIds = null) => {
    const rect = getRect();
    if (!rect) return;
    const nodes = nodeIds?.length ? documentRef.current.nodes.filter((node) => nodeIds.includes(node.id)) : documentRef.current.nodes;
    setDocument({ ...documentRef.current, viewport: fitCanvasBounds(getNodesBounds(nodes), rect.width, rect.height) }, true);
  };

  const zoomAt = (nextZoom, clientX, clientY) => {
    const rect = getRect();
    if (!rect) return;
    const current = documentRef.current.viewport;
    const point = screenToWorld(clientX, clientY, rect, current);
    const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    setDocument({
      ...documentRef.current,
      viewport: {
        zoom,
        x: (clientX - rect.left) / zoom - point.x,
        y: (clientY - rect.top) / zoom - point.y,
      },
    }, true);
  };

  const changeSelectionColor = (color) => {
    const previous = documentRef.current;
    const nodes = previous.nodes.map((node) => selection.nodeIds.includes(node.id) ? { ...node, color: color || undefined, updatedAt: canvasNow() } : node);
    const edges = previous.edges.map((edge) => edge.id === selection.edgeId ? { ...edge, color: color || undefined } : edge);
    commit({ ...previous, nodes, edges }, previous);
    setIsColorPaletteOpen(false);
  };

  const copySelection = async (cut = false) => {
    if (!selection.nodeIds.length) return;
    const nodes = documentRef.current.nodes.filter((node) => selection.nodeIds.includes(node.id));
    const edges = documentRef.current.edges.filter((edge) => selection.nodeIds.includes(edge.fromNode) && selection.nodeIds.includes(edge.toNode));
    const payload = { nodes, edges };
    clipboardRef.current = payload;
    try { await navigator.clipboard.writeText(`${CLIPBOARD_PREFIX}${JSON.stringify(payload)}`); } catch { /* Clipboard API can be unavailable. */ }
    if (cut) removeSelection();
  };

  const pasteCanvasPayload = (payload, point) => {
    if (!payload?.nodes?.length) return false;
    const idMap = new Map();
    const bounds = getNodesBounds(payload.nodes);
    const nodes = payload.nodes.map((node) => {
      const id = createCanvasId();
      idMap.set(node.id, id);
      return {
        ...node,
        id,
        x: point.x + (node.x - bounds.minX),
        y: point.y + (node.y - bounds.minY),
        createdAt: canvasNow(),
        updatedAt: canvasNow(),
      };
    });
    const edges = (payload.edges || []).filter((edge) => idMap.has(edge.fromNode) && idMap.has(edge.toNode)).map((edge) => ({
      ...edge,
      id: createCanvasId(),
      fromNode: idMap.get(edge.fromNode),
      toNode: idMap.get(edge.toNode),
    }));
    const previous = documentRef.current;
    commit({ ...previous, nodes: [...previous.nodes, ...nodes], edges: [...previous.edges, ...edges] }, previous);
    setSelection({ nodeIds: nodes.map((node) => node.id), edgeId: null });
    return true;
  };

  const handlePaste = async (event) => {
    if (isTextInput(event.target) || editing) return;
    const point = pointerWorldRef.current || viewportCenter();
    const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith('image/'));
    if (files.length) {
      event.preventDefault();
      for (let index = 0; index < files.length; index += 1) await addImageFileAt(files[index], { x: point.x + index * 28, y: point.y + index * 28 });
      return;
    }
    const text = event.clipboardData?.getData('text/plain')?.trim();
    if (!text) return;
    event.preventDefault();
    if (text.startsWith(CLIPBOARD_PREFIX)) {
      try { if (pasteCanvasPayload(JSON.parse(text.slice(CLIPBOARD_PREFIX.length)), point)) return; } catch { /* Treat invalid payload as text. */ }
    }
    if (looksLikeImageUrl(text)) await addImageSourceAt(text, point);
    else if (isSafeHttpUrl(text)) addLinkAt(point, text);
    else addTextAt(point, text);
  };

  const exportCanvas = () => {
    const blob = new Blob([serializeCanvasDocument(documentRef.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'quadro.canvas';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importCanvas = async (file) => {
    try {
      if (!file || file.size > 8 * 1024 * 1024) throw new Error('Arquivo inválido ou muito grande.');
      const next = deserializeCanvasDocument(await file.text());
      commit(next, documentRef.current);
      setSelection({ nodeIds: [], edgeId: null });
    } catch (error) {
      window.alert(`Não foi possível importar o quadro. ${error.message}`);
    }
  };

  const beginNodeMove = (event, node) => {
    if (editing || spacePressed || event.button !== 0) return;
    event.preventDefault();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const nodeIds = selection.nodeIds.includes(node.id) ? selection.nodeIds : additive ? [...selection.nodeIds, node.id] : [node.id];
    if (node.type === 'link' && (event.ctrlKey || event.metaKey) && isSafeHttpUrl(node.link?.url)) {
      window.open(node.link.url, '_blank', 'noopener,noreferrer');
      return;
    }
    const previous = documentRef.current;
    let movingIds = nodeIds;
    if (node.type === 'group') {
      const contained = previous.nodes.filter((item) => item.id !== node.id && item.x >= node.x && item.y >= node.y && item.x + item.width <= node.x + node.width && item.y + item.height <= node.y + node.height).map((item) => item.id);
      movingIds = [...new Set([...movingIds, ...contained])];
    }
    if (event.altKey) {
      setSelection({ nodeIds, edgeId: null });
      const result = duplicateCanvasSelection(previous, movingIds, 0);
      setDocument(result.document, false);
      movingIds = result.nodeIds;
      setSelection({ nodeIds: movingIds, edgeId: null });
    } else setSelection({ nodeIds, edgeId: null });
    interactionRef.current = {
      type: 'dragging-nodes',
      startClient: { x: event.clientX, y: event.clientY },
      startDocument: event.altKey ? documentRef.current : previous,
      historyDocument: previous,
      nodeIds: movingIds,
      startNodes: new Map(documentRef.current.nodes.filter((item) => movingIds.includes(item.id)).map((item) => [item.id, item])),
      constrain: event.shiftKey,
    };
    setInteractionVisual({ type: 'dragging-nodes' });
  };

  const findConnectionTarget = (point, sourceNodeId) => {
    const threshold = 44 / documentRef.current.viewport.zoom;
    let bestTarget = null;

    for (const node of documentRef.current.nodes) {
      if (node.id === sourceNodeId) continue;
      const anchors = SIDES.map((side) => ({ side, ...getNodeAnchor(node, side) }));
      const closest = anchors
        .map((anchor) => ({ ...anchor, distance: Math.hypot(point.x - anchor.x, point.y - anchor.y) }))
        .sort((left, right) => left.distance - right.distance)[0];
      const insideExpandedBounds =
        point.x >= node.x - threshold &&
        point.x <= node.x + node.width + threshold &&
        point.y >= node.y - threshold &&
        point.y <= node.y + node.height + threshold;

      if (insideExpandedBounds && (!bestTarget || closest.distance < bestTarget.distance)) {
        bestTarget = { nodeId: node.id, side: closest.side, distance: closest.distance };
      }
    }

    return bestTarget;
  };

  const handlePointerDown = (event) => {
    setContextMenu(null);
    setIsColorPaletteOpen(false);
    const handle = event.target.closest?.('[data-resize-handle]')?.dataset.resizeHandle;
    const connectionSide = event.target.closest?.('[data-connection-handle]')?.dataset.connectionHandle;
    const nodeElement = event.target.closest?.('[data-node-id]');
    const node = nodeElement ? documentRef.current.nodes.find((item) => item.id === nodeElement.dataset.nodeId) : null;

    if (event.button === 2) {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setSelection({ nodeIds: [], edgeId: null });
      suppressContextMenuRef.current = false;
      interactionRef.current = {
        type: 'panning',
        startClient: { x: event.clientX, y: event.clientY },
        startViewport: documentRef.current.viewport,
        moved: false,
      };
      setInteractionVisual({ type: 'panning' });
      return;
    }

    if (connectionSide && node) {
      event.preventDefault(); event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      interactionRef.current = { type: 'connecting', fromNode: node.id, fromSide: connectionSide, point: getNodeAnchor(node, connectionSide) };
      setInteractionVisual(interactionRef.current);
      return;
    }
    if (handle && node) {
      event.preventDefault(); event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setSelection({ nodeIds: [node.id], edgeId: null });
      interactionRef.current = { type: 'resizing-node', nodeId: node.id, handle, startClient: { x: event.clientX, y: event.clientY }, startNode: node, startDocument: documentRef.current };
      return;
    }
    if (node) {
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      beginNodeMove(event, node);
      return;
    }
    if (event.button === 0) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const point = screenPointToWorld(event.clientX, event.clientY);
      interactionRef.current = { type: 'selecting', start: point, current: point, additive: event.shiftKey || event.ctrlKey || event.metaKey, initialIds: selection.nodeIds };
      if (!interactionRef.current.additive) setSelection({ nodeIds: [], edgeId: null });
      setInteractionVisual(interactionRef.current);
    }
  };

  const handlePointerMove = (event) => {
    pointerWorldRef.current = screenPointToWorld(event.clientX, event.clientY);
    const interaction = interactionRef.current;
    if (interaction.type === 'idle') return;
    const viewport = documentRef.current.viewport;

    if (interaction.type === 'panning') {
      interaction.moved = interaction.moved || Math.hypot(event.clientX - interaction.startClient.x, event.clientY - interaction.startClient.y) > 4;
      const nextViewport = { ...interaction.startViewport, x: interaction.startViewport.x + (event.clientX - interaction.startClient.x) / viewport.zoom, y: interaction.startViewport.y + (event.clientY - interaction.startClient.y) / viewport.zoom };
      setDocument({ ...documentRef.current, viewport: nextViewport }, false);
      return;
    }
    if (interaction.type === 'selecting') {
      interaction.current = pointerWorldRef.current;
      const ids = nodesInSelection(documentRef.current.nodes.filter((node) => node.type !== 'group'), interaction.start, interaction.current);
      setSelection({ nodeIds: interaction.additive ? [...new Set([...interaction.initialIds, ...ids])] : ids, edgeId: null });
      setInteractionVisual({ ...interaction });
      return;
    }
    if (interaction.type === 'connecting') {
      interaction.point = pointerWorldRef.current;
      interaction.target = findConnectionTarget(pointerWorldRef.current, interaction.fromNode);
      setInteractionVisual({ ...interaction });
      return;
    }
    if (interaction.type === 'dragging-nodes') {
      let deltaX = (event.clientX - interaction.startClient.x) / viewport.zoom;
      let deltaY = (event.clientY - interaction.startClient.y) / viewport.zoom;
      if (interaction.constrain) Math.abs(deltaX) > Math.abs(deltaY) ? (deltaY = 0) : (deltaX = 0);
      const snap = spacePressed ? 1 : GRID_SIZE;
      const nodes = interaction.startDocument.nodes.map((node) => {
        const startNode = interaction.startNodes.get(node.id);
        if (!startNode) return node;
        return { ...node, x: Math.round((startNode.x + deltaX) / snap) * snap, y: Math.round((startNode.y + deltaY) / snap) * snap, updatedAt: canvasNow() };
      });
      setDocument({ ...interaction.startDocument, nodes }, false);
      return;
    }
    if (interaction.type === 'resizing-node') {
      const dx = (event.clientX - interaction.startClient.x) / viewport.zoom;
      const dy = (event.clientY - interaction.startClient.y) / viewport.zoom;
      const original = interaction.startNode;
      const minWidth = original.type === 'image' ? 80 : original.type === 'group' ? 180 : 140;
      const minHeight = original.type === 'image' ? 80 : original.type === 'group' ? 120 : 70;
      let { x, y, width, height } = original;
      if (interaction.handle.includes('e')) width = Math.max(minWidth, original.width + dx);
      if (interaction.handle.includes('s')) height = Math.max(minHeight, original.height + dy);
      if (interaction.handle.includes('w')) { width = Math.max(minWidth, original.width - dx); x = original.x + original.width - width; }
      if (interaction.handle.includes('n')) { height = Math.max(minHeight, original.height - dy); y = original.y + original.height - height; }
      if (event.shiftKey) {
        const ratio = original.width / original.height;
        if (Math.abs(dx) > Math.abs(dy)) height = width / ratio; else width = height * ratio;
      }
      const nodes = interaction.startDocument.nodes.map((node) => node.id === original.id ? { ...node, x, y, width, height, updatedAt: canvasNow() } : node);
      setDocument({ ...interaction.startDocument, nodes }, false);
    }
  };

  const handlePointerUp = (event) => {
    const interaction = interactionRef.current;
    if (interaction.type === 'idle') return;
    if (interaction.type === 'connecting') {
      const point = screenPointToWorld(event.clientX, event.clientY);
      const magneticTarget = interaction.target || findConnectionTarget(point, interaction.fromNode);
      const targetNode = magneticTarget ? documentRef.current.nodes.find((node) => node.id === magneticTarget.nodeId) : null;
      if (targetNode && targetNode.id !== interaction.fromNode) {
        const previous = documentRef.current;
        const edge = { id: createCanvasId(), fromNode: interaction.fromNode, toNode: targetNode.id, fromSide: interaction.fromSide, toSide: magneticTarget?.side || nearestSide(targetNode, point), fromEnd: 'none', toEnd: 'arrow', label: '', zIndex: 0 };
        commit({ ...previous, edges: [...previous.edges, edge] }, previous);
        setSelection({ nodeIds: [], edgeId: edge.id });
      }
    } else if (interaction.type === 'dragging-nodes' || interaction.type === 'resizing-node') {
      commit(documentRef.current, interaction.historyDocument || interaction.startDocument);
    } else if (interaction.type === 'panning') {
      suppressContextMenuRef.current = interaction.moved;
      onChange?.(documentRef.current);
    }
    interactionRef.current = { type: 'idle' };
    setInteractionVisual(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event) => {
    event.preventDefault();
    const viewport = documentRef.current.viewport;
    zoomAt(viewport.zoom * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
  };

  const moveSelectionBy = useCallback((dx, dy) => {
    if (!selection.nodeIds.length) return;
    const previous = documentRef.current;
    commit({ ...previous, nodes: previous.nodes.map((node) => selection.nodeIds.includes(node.id) ? { ...node, x: node.x + dx, y: node.y + dy, updatedAt: canvasNow() } : node) }, previous);
  }, [selection.nodeIds, commit]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === 'Space' && !isTextInput(event.target)) { setSpacePressed(true); if (!event.repeat) event.preventDefault(); }
      if (isTextInput(event.target)) { if (event.key === 'Escape') event.target.blur(); return; }
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
      if (modifier && event.key.toLowerCase() === 'a') { event.preventDefault(); setSelection({ nodeIds: documentRef.current.nodes.map((node) => node.id), edgeId: null }); return; }
      if (modifier && event.key.toLowerCase() === 'c') { event.preventDefault(); void copySelection(false); return; }
      if (modifier && event.key.toLowerCase() === 'x') { event.preventDefault(); void copySelection(true); return; }
      if (modifier && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelection(); return; }
      if (event.shiftKey && event.key === '1') { event.preventDefault(); fitNodes(); return; }
      if (event.shiftKey && event.key === '2') { event.preventDefault(); fitNodes(selection.nodeIds); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelection(); return; }
      if (event.key === 'Enter') {
        if (selection.edgeId) {
          const edge = documentRef.current.edges.find((item) => item.id === selection.edgeId);
          const label = window.prompt('Rótulo da conexão:', edge?.label || '');
          if (label !== null && edge) commit({ ...documentRef.current, edges: documentRef.current.edges.map((item) => item.id === edge.id ? { ...item, label } : item) });
        } else if (selection.nodeIds.length === 1) setEditing({ type: 'node', id: selection.nodeIds[0] });
        return;
      }
      if (event.key === 'Escape') { setEditing(null); setContextMenu(null); setSelection({ nodeIds: [], edgeId: null }); interactionRef.current = { type: 'idle' }; setInteractionVisual(null); return; }
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const step = event.shiftKey ? 16 : 2;
        moveSelectionBy(event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
      }
    };
    const onKeyUp = (event) => event.code === 'Space' && setSpacePressed(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [selection, undo, redo, moveSelectionBy]);

  const selectedNodes = useMemo(() => documentState.nodes.filter((node) => selection.nodeIds.includes(node.id)), [documentState.nodes, selection.nodeIds]);
  const selectionBounds = getNodesBounds(selectedNodes);
  const selectedEdge = documentState.edges.find((edge) => edge.id === selection.edgeId);
  const worldStyle = { transform: `translate(${documentState.viewport.x * documentState.viewport.zoom}px, ${documentState.viewport.y * documentState.viewport.zoom}px) scale(${documentState.viewport.zoom})`, transformOrigin: '0 0' };
  const lowDetail = documentState.viewport.zoom < 0.35;
  const selectionToolbarPosition = selectionBounds ? worldToScreen((selectionBounds.minX + selectionBounds.maxX) / 2, selectionBounds.minY, documentState.viewport) : null;
  const selectedEdgeToolbarPosition = selectedEdge ? (() => {
    const fromNode = documentState.nodes.find((node) => node.id === selectedEdge.fromNode);
    const toNode = documentState.nodes.find((node) => node.id === selectedEdge.toNode);
    if (!fromNode || !toNode) return null;
    const start = getNodeAnchor(fromNode, selectedEdge.fromSide);
    const end = getNodeAnchor(toNode, selectedEdge.toSide);
    return worldToScreen((start.x + end.x) / 2, (start.y + end.y) / 2, documentState.viewport);
  })() : null;
  const contextualToolbarPosition = selectionToolbarPosition || selectedEdgeToolbarPosition;

  return (
    <div
      ref={canvasRef}
      tabIndex={0}
      role="application"
      aria-label="Quadro visual infinito"
      className={`relative h-full min-h-[420px] w-full overflow-hidden rounded-3xl border border-[#2a2f3a] bg-[#0f1115] outline-none focus-visible:ring-2 focus-visible:ring-[#7c83ff] ${interactionVisual?.type === 'panning' || interactionVisual?.type === 'dragging-nodes' ? 'cursor-grabbing' : 'cursor-default'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onPaste={handlePaste}
      onDragOver={(event) => { if ([...event.dataTransfer.types].includes('Files') || event.dataTransfer.types.includes('text/plain')) event.preventDefault(); }}
      onDrop={async (event) => {
        event.preventDefault();
        const point = screenPointToWorld(event.clientX, event.clientY);
        const images = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'));
        if (images.length) for (let index = 0; index < images.length; index += 1) await addImageFileAt(images[index], { x: point.x + index * 24, y: point.y + index * 24 });
        else { const text = event.dataTransfer.getData('text/plain')?.trim(); if (text) isSafeHttpUrl(text) ? addLinkAt(point, text) : addTextAt(point, text); }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (suppressContextMenuRef.current) {
          suppressContextMenuRef.current = false;
          return;
        }
        const node = event.target.closest?.('[data-node-id]');
        const edge = event.target.closest?.('[data-edge-id]');
        setContextMenu({ x: event.clientX, y: event.clientY, point: screenPointToWorld(event.clientX, event.clientY), nodeId: node?.dataset.nodeId, edgeId: edge?.dataset.edgeId });
        if (node && !selection.nodeIds.includes(node.dataset.nodeId)) setSelection({ nodeIds: [node.dataset.nodeId], edgeId: null });
        if (edge) setSelection({ nodeIds: [], edgeId: edge.dataset.edgeId });
      }}
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.11) 1px, transparent 1.2px)',
        backgroundSize: `${32 * documentState.viewport.zoom}px ${32 * documentState.viewport.zoom}px`,
        backgroundPosition: `${documentState.viewport.x * documentState.viewport.zoom}px ${documentState.viewport.y * documentState.viewport.zoom}px`,
      }}
    >
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addImageFileAt(file, viewportCenter()); event.target.value = ''; }} />
      <input ref={importInputRef} type="file" accept=".canvas,.json,application/json" className="hidden" onChange={(event) => { void importCanvas(event.target.files?.[0]); event.target.value = ''; }} />

      <div className="absolute left-0 top-0 h-full w-full" style={worldStyle}>
        {documentState.nodes.filter((node) => node.type === 'group').sort((a, b) => a.zIndex - b.zIndex).map((node) => (
          <CanvasNode key={node.id} node={node} selected={selection.nodeIds.includes(node.id)} hovered={hoveredNodeId === node.id} connectionTarget={interactionVisual?.type === 'connecting' && interactionVisual.target?.nodeId === node.id} editing={editing?.type === 'node' && editing.id === node.id} lowDetail={lowDetail} onEdit={() => { setSelection({ nodeIds: [node.id], edgeId: null }); setEditing({ type: 'node', id: node.id }); }} onHoverChange={setHoveredNodeId} onTextChange={(id, patch) => setDocument({ ...documentRef.current, nodes: documentRef.current.nodes.map((item) => item.id === id ? { ...item, ...patch, updatedAt: canvasNow() } : item) }, false)} onTextCommit={() => { setEditing(null); onChange?.(documentRef.current); }} onOpenImage={setImagePreview} />
        ))}

        <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" aria-label="Conexões do quadro">
          <defs>
            {COLORS.filter(Boolean).concat(['#8b91a7']).map((color) => <marker key={color} id={`arrow-${color.replace('#', '')}`} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill={color} /></marker>)}
          </defs>
          {documentState.edges.map((edge) => {
            const from = documentState.nodes.find((node) => node.id === edge.fromNode);
            const to = documentState.nodes.find((node) => node.id === edge.toNode);
            if (!from || !to) return null;
            const start = getNodeAnchor(from, edge.fromSide);
            const end = getNodeAnchor(to, edge.toSide);
            const path = getBezierPath(start, end, edge.fromSide, edge.toSide);
            const color = edge.color || '#8b91a7';
            const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
            return <g key={edge.id} data-edge-id={edge.id} className="cursor-pointer" onClick={(event) => { event.stopPropagation(); setSelection({ nodeIds: [], edgeId: edge.id }); }} onDoubleClick={(event) => { event.stopPropagation(); const label = window.prompt('Rótulo da conexão:', edge.label || ''); if (label !== null) commit({ ...documentRef.current, edges: documentRef.current.edges.map((item) => item.id === edge.id ? { ...item, label } : item) }); }}>
              <path d={path} fill="none" stroke="transparent" strokeWidth="16" />
              <path d={path} fill="none" stroke={selection.edgeId === edge.id ? '#ffffff' : color} strokeWidth={selection.edgeId === edge.id ? 3 : 2} markerStart={edge.fromEnd === 'arrow' ? `url(#arrow-${color.replace('#', '')})` : undefined} markerEnd={edge.toEnd === 'arrow' ? `url(#arrow-${color.replace('#', '')})` : undefined} />
              {edge.label ? <foreignObject x={center.x - 70} y={center.y - 14} width="140" height="28" className="pointer-events-none"><div className="truncate rounded-lg bg-[#101218e6] px-2 py-1 text-center text-xs text-white">{edge.label}</div></foreignObject> : null}
            </g>;
          })}
          {interactionVisual?.type === 'connecting' ? (() => {
            const source = documentState.nodes.find((node) => node.id === interactionVisual.fromNode);
            if (!source) return null;
            const start = getNodeAnchor(source, interactionVisual.fromSide);
            return <path d={getBezierPath(start, interactionVisual.point, interactionVisual.fromSide, 'left')} fill="none" stroke="#8b91ff" strokeWidth="2" strokeDasharray="7 5" />;
          })() : null}
        </svg>

        {documentState.nodes.filter((node) => node.type !== 'group').sort((a, b) => a.zIndex - b.zIndex).map((node) => (
          <CanvasNode key={node.id} node={node} selected={selection.nodeIds.includes(node.id)} hovered={hoveredNodeId === node.id} connectionTarget={interactionVisual?.type === 'connecting' && interactionVisual.target?.nodeId === node.id} editing={editing?.type === 'node' && editing.id === node.id} lowDetail={lowDetail} onEdit={() => { setSelection({ nodeIds: [node.id], edgeId: null }); setEditing({ type: 'node', id: node.id }); }} onHoverChange={setHoveredNodeId} onTextChange={(id, patch) => setDocument({ ...documentRef.current, nodes: documentRef.current.nodes.map((item) => item.id === id ? { ...item, ...patch, updatedAt: canvasNow() } : item) }, false)} onTextCommit={() => { setEditing(null); onChange?.(documentRef.current); }} onOpenImage={setImagePreview} />
        ))}

        {interactionVisual?.type === 'selecting' && Math.hypot(interactionVisual.current.x - interactionVisual.start.x, interactionVisual.current.y - interactionVisual.start.y) > 3 ? (
          <div className="pointer-events-none absolute border border-[#8b91ff] bg-[#7c83ff20]" style={{ left: Math.min(interactionVisual.start.x, interactionVisual.current.x), top: Math.min(interactionVisual.start.y, interactionVisual.current.y), width: Math.abs(interactionVisual.current.x - interactionVisual.start.x), height: Math.abs(interactionVisual.current.y - interactionVisual.start.y) }} />
        ) : null}
      </div>

      {contextualToolbarPosition && (selection.nodeIds.length || selectedEdge) ? (
        <div onPointerDown={(event) => event.stopPropagation()} className="absolute z-50 flex -translate-x-1/2 -translate-y-[calc(100%+12px)] items-center gap-1.5 rounded-xl border border-[#353a47] bg-[#13161def] p-1.5 shadow-xl backdrop-blur" style={{ left: clamp(contextualToolbarPosition.x, 90, (getRect()?.width || 600) - 90), top: Math.max(54, contextualToolbarPosition.y) }}>
          <div className="relative">
            <ContextIconButton title="Escolher cor" active={isColorPaletteOpen} onClick={() => setIsColorPaletteOpen((current) => !current)}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m14.7 5.3 4 4M4 20l4.5-1 10.2-10.2a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" /><path d="M3 3h6v6H3z" /></svg>
            </ContextIconButton>
            {isColorPaletteOpen ? (
              <div className="absolute left-1/2 top-full mt-2 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-[#353a47] bg-[#13161df5] p-2 shadow-xl">
                {COLORS.map((color) => <button key={color || 'none'} type="button" title={color ? 'Aplicar cor' : 'Remover cor'} aria-label={color ? `Cor ${color}` : 'Sem cor'} onClick={() => changeSelectionColor(color)} className="h-6 w-6 rounded-full border border-white/20 transition hover:scale-110" style={{ background: color || '#252a34' }} />)}
              </div>
            ) : null}
          </div>
          {selection.nodeIds.length ? (
            <>
              <ContextIconButton title="Duplicar seleção" onClick={() => duplicateSelection()}><span className="text-xl font-light leading-none">+</span></ContextIconButton>
              <ContextIconButton title="Agrupar seleção" onClick={createGroup}><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="11" height="11" rx="2" /><rect x="10" y="10" width="11" height="11" rx="2" /></svg></ContextIconButton>
            </>
          ) : null}
          {selectedEdge ? <ContextIconButton title="Editar rótulo" onClick={() => { const label = window.prompt('Rótulo da conexão:', selectedEdge.label || ''); if (label !== null) commit({ ...documentRef.current, edges: documentRef.current.edges.map((edge) => edge.id === selectedEdge.id ? { ...edge, label } : edge) }); }}><span className="text-xs font-bold">T</span></ContextIconButton> : null}
          <ContextIconButton title="Excluir seleção" danger onClick={removeSelection}><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg></ContextIconButton>
        </div>
      ) : null}

      <div onPointerDown={(event) => event.stopPropagation()} className="absolute right-4 top-4 z-50 flex flex-wrap items-center gap-2 rounded-2xl border border-[#2a2f3a] bg-[#11141aeb] p-2 text-white shadow-lg backdrop-blur-xl">
        <FloatingButton title="Diminuir zoom" onClick={() => { const rect = getRect(); if (rect) zoomAt(documentState.viewport.zoom - 0.12, rect.left + rect.width / 2, rect.top + rect.height / 2); }}>−</FloatingButton>
        <span className="min-w-14 text-center text-xs font-semibold">{Math.round(documentState.viewport.zoom * 100)}%</span>
        <FloatingButton title="Aumentar zoom" onClick={() => { const rect = getRect(); if (rect) zoomAt(documentState.viewport.zoom + 0.12, rect.left + rect.width / 2, rect.top + rect.height / 2); }}>+</FloatingButton>
        <FloatingButton title="Ajustar tudo (Shift+1)" onClick={() => fitNodes()}>Ajustar tudo</FloatingButton>
        <FloatingButton title="Ajustar seleção (Shift+2)" disabled={!selection.nodeIds.length} onClick={() => fitNodes(selection.nodeIds)}>Seleção</FloatingButton>
        <FloatingButton title="Resetar zoom" onClick={() => setDocument({ ...documentRef.current, viewport: { ...documentRef.current.viewport, zoom: 1 } }, true)}>100%</FloatingButton>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-50 flex justify-center px-4">
        <div onPointerDown={(event) => event.stopPropagation()} className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-[#2a2f3a] bg-[#11141aeb] p-2 shadow-[0_24px_80px_rgba(0,0,0,.4)] backdrop-blur-xl">
          <FloatingButton title="Criar cartão de texto" onClick={() => addTextAt(viewportCenter())}>Texto</FloatingButton>
          <FloatingButton title="Inserir imagem" onClick={() => fileInputRef.current?.click()}>Imagem</FloatingButton>
          <FloatingButton title="Criar grupo" onClick={createGroup}>Grupo</FloatingButton>
          <FloatingButton title="Desfazer (Ctrl+Z)" disabled={!historyRef.current.past.length} onClick={undo}>Desfazer</FloatingButton>
          <FloatingButton title="Refazer (Ctrl+Y)" disabled={!historyRef.current.future.length} onClick={redo}>Refazer</FloatingButton>
          <FloatingButton title="Exportar quadro" onClick={exportCanvas}>Exportar</FloatingButton>
          <FloatingButton title="Importar quadro" onClick={() => importInputRef.current?.click()}>Importar</FloatingButton>
          <FloatingButton title="Voltar ao conteúdo" onClick={onExit}>Voltar</FloatingButton>
          <span className="sr-only">{historyVersion}</span>
        </div>
      </div>

      {contextMenu ? (
        <div onPointerDown={(event) => event.stopPropagation()} className="fixed z-[100] w-52 overflow-hidden rounded-xl border border-[#343946] bg-[#171a20] py-1 text-sm text-white shadow-2xl" style={{ left: Math.min(contextMenu.x, window.innerWidth - 220), top: Math.min(contextMenu.y, window.innerHeight - 330) }}>
          {!contextMenu.nodeId && !contextMenu.edgeId ? <><button className="w-full px-4 py-2 text-left hover:bg-white/5" onClick={() => { addTextAt(contextMenu.point); setContextMenu(null); }}>Adicionar texto</button><button className="w-full px-4 py-2 text-left hover:bg-white/5" onClick={() => { fileInputRef.current?.click(); setContextMenu(null); }}>Adicionar imagem</button><button className="w-full px-4 py-2 text-left hover:bg-white/5" onClick={() => { createGroup(); setContextMenu(null); }}>Criar grupo</button><button className="w-full px-4 py-2 text-left hover:bg-white/5" onClick={() => { setSelection({ nodeIds: documentRef.current.nodes.map((node) => node.id), edgeId: null }); setContextMenu(null); }}>Selecionar tudo</button><button className="w-full px-4 py-2 text-left hover:bg-white/5" onClick={() => { fitNodes(); setContextMenu(null); }}>Ajustar visualização</button></> : null}
          {contextMenu.nodeId ? <><button className="w-full px-4 py-2 text-left hover:bg-white/5" onClick={() => { setEditing({ type: 'node', id: contextMenu.nodeId }); setContextMenu(null); }}>Editar</button><button className="w-full px-4 py-2 text-left hover:bg-white/5" onClick={() => { duplicateSelection(); setContextMenu(null); }}>Duplicar</button><button className="w-full px-4 py-2 text-left hover:bg-white/5" onClick={() => { void copySelection(false); setContextMenu(null); }}>Copiar</button><button className="w-full px-4 py-2 text-left hover:bg-white/5" onClick={() => { createGroup(); setContextMenu(null); }}>Criar grupo</button></> : null}
          {contextMenu.edgeId ? <button className="w-full px-4 py-2 text-left hover:bg-white/5" onClick={() => { const edge = documentRef.current.edges.find((item) => item.id === contextMenu.edgeId); const label = window.prompt('Rótulo da conexão:', edge?.label || ''); if (label !== null && edge) commit({ ...documentRef.current, edges: documentRef.current.edges.map((item) => item.id === edge.id ? { ...item, label } : item) }); setContextMenu(null); }}>Editar rótulo</button> : null}
          {(contextMenu.nodeId || contextMenu.edgeId) ? <button className="w-full border-t border-[#343946] px-4 py-2 text-left text-[#ff9b9b] hover:bg-white/5" onClick={() => { removeSelection(); setContextMenu(null); }}>Excluir</button> : null}
        </div>
      ) : null}

      {imagePreview ? <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-8" onClick={() => setImagePreview(null)}><button type="button" className="absolute right-5 top-5 rounded-xl bg-white/10 px-4 py-2 text-white" onClick={() => setImagePreview(null)}>Fechar</button><img src={imagePreview} alt="Imagem ampliada" className="max-h-full max-w-full object-contain" /></div> : null}
    </div>
  );
}
