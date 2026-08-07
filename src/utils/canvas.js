export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 3;
export const GRID_SIZE = 16;

export const createCanvasId = () => crypto.randomUUID();
export const canvasNow = () => new Date().toISOString();
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const createCanvasDocument = () => ({
  version: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  favoriteColors: [],
  nodes: [],
  edges: [],
});

export const createCanvasNode = (type, x, y, data = {}) => {
  const dimensions = {
    text: [260, 120],
    image: [320, 220],
    link: [300, 120],
    group: [420, 260],
  }[type] ?? [260, 120];
  const timestamp = canvasNow();

  return {
    id: createCanvasId(),
    type,
    x,
    y,
    width: dimensions[0],
    height: dimensions[1],
    zIndex: type === 'group' ? 0 : 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(type === 'text' ? { text: data.text ?? 'Novo texto' } : {}),
    ...(type === 'image' ? { image: data.image ?? { src: '' }, caption: data.caption ?? '' } : {}),
    ...(type === 'link' ? { link: data.link ?? { url: '' } } : {}),
    ...(type === 'group' ? { group: data.group ?? { title: 'Novo grupo' } } : {}),
    ...data,
  };
};

const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);

export const normalizeCanvasColors = (value) =>
  [...new Set(
    (Array.isArray(value) ? value : [])
      .filter((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
      .map((color) => color.toUpperCase()),
  )].slice(0, 16);

export const normalizeCanvasDocument = (value) => {
  if (!value || typeof value !== 'object') return createCanvasDocument();

  const viewport = value.viewport && typeof value.viewport === 'object' ? value.viewport : {};
  const nodeIds = new Set();
  const nodes = (Array.isArray(value.nodes) ? value.nodes : [])
    .filter((node) => node && ['text', 'image', 'link', 'group'].includes(node.type))
    .map((node) => {
      const fallback = createCanvasNode(node.type, 0, 0);
      const id = typeof node.id === 'string' && !nodeIds.has(node.id) ? node.id : createCanvasId();
      nodeIds.add(id);
      const minWidth = node.type === 'image' ? 80 : node.type === 'group' ? 180 : 140;
      const minHeight = node.type === 'image' ? 80 : node.type === 'group' ? 120 : 70;
      return {
        ...fallback,
        ...node,
        id,
        x: finite(node.x, 0),
        y: finite(node.y, 0),
        width: Math.max(minWidth, finite(node.width, fallback.width)),
        height: Math.max(minHeight, finite(node.height, fallback.height)),
        zIndex: finite(node.zIndex, fallback.zIndex),
        createdAt: typeof node.createdAt === 'string' ? node.createdAt : canvasNow(),
        updatedAt: typeof node.updatedAt === 'string' ? node.updatedAt : canvasNow(),
      };
    });

  const edges = (Array.isArray(value.edges) ? value.edges : [])
    .filter((edge) => edge && nodeIds.has(edge.fromNode) && nodeIds.has(edge.toNode))
    .map((edge) => ({
      id: typeof edge.id === 'string' ? edge.id : createCanvasId(),
      fromNode: edge.fromNode,
      toNode: edge.toNode,
      fromSide: ['top', 'right', 'bottom', 'left'].includes(edge.fromSide) ? edge.fromSide : 'right',
      toSide: ['top', 'right', 'bottom', 'left'].includes(edge.toSide) ? edge.toSide : 'left',
      fromEnd: edge.fromEnd === 'arrow' ? 'arrow' : 'none',
      toEnd: edge.toEnd === 'none' ? 'none' : 'arrow',
      label: typeof edge.label === 'string' ? edge.label : '',
      color: typeof edge.color === 'string' ? edge.color : undefined,
      zIndex: finite(edge.zIndex, 0),
    }));

  return {
    version: 1,
    favoriteColors: normalizeCanvasColors(value.favoriteColors),
    viewport: {
      x: finite(viewport.x, 0),
      y: finite(viewport.y, 0),
      zoom: clamp(finite(viewport.zoom, 1), MIN_ZOOM, MAX_ZOOM),
    },
    nodes,
    edges,
  };
};

export const screenToWorld = (screenX, screenY, rect, viewport) => ({
  x: (screenX - rect.left) / viewport.zoom - viewport.x,
  y: (screenY - rect.top) / viewport.zoom - viewport.y,
});

export const worldToScreen = (worldX, worldY, viewport) => ({
  x: (worldX + viewport.x) * viewport.zoom,
  y: (worldY + viewport.y) * viewport.zoom,
});

export const getNodesBounds = (nodes) => {
  if (!nodes.length) return null;
  return nodes.reduce(
    (bounds, node) => ({
      minX: Math.min(bounds.minX, node.x),
      minY: Math.min(bounds.minY, node.y),
      maxX: Math.max(bounds.maxX, node.x + node.width),
      maxY: Math.max(bounds.maxY, node.y + node.height),
    }),
    {
      minX: nodes[0].x,
      minY: nodes[0].y,
      maxX: nodes[0].x + nodes[0].width,
      maxY: nodes[0].y + nodes[0].height,
    },
  );
};

export const fitCanvasBounds = (bounds, width, height) => {
  if (!bounds || width <= 0 || height <= 0) return { x: 0, y: 0, zoom: 1 };
  const padding = 90;
  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
  const zoom = clamp(Math.min((width - padding * 2) / contentWidth, (height - padding * 2) / contentHeight), MIN_ZOOM, MAX_ZOOM);
  return {
    zoom,
    x: width / (2 * zoom) - (bounds.minX + bounds.maxX) / 2,
    y: height / (2 * zoom) - (bounds.minY + bounds.maxY) / 2,
  };
};

export const rectanglesIntersect = (left, right) =>
  left.x <= right.x + right.width &&
  left.x + left.width >= right.x &&
  left.y <= right.y + right.height &&
  left.y + left.height >= right.y;

export const nodesInSelection = (nodes, start, end) => {
  const selection = {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
  return nodes.filter((node) => rectanglesIntersect(selection, node)).map((node) => node.id);
};

export const getNodeAnchor = (node, side) => {
  if (side === 'top') return { x: node.x + node.width / 2, y: node.y };
  if (side === 'bottom') return { x: node.x + node.width / 2, y: node.y + node.height };
  if (side === 'left') return { x: node.x, y: node.y + node.height / 2 };
  return { x: node.x + node.width, y: node.y + node.height / 2 };
};

export const getBezierPath = (start, end, fromSide = 'right', toSide = 'left') => {
  const distance = Math.max(60, Math.min(240, Math.hypot(end.x - start.x, end.y - start.y) * 0.45));
  const vector = (point, side, amount) => {
    if (side === 'top') return { x: point.x, y: point.y - amount };
    if (side === 'bottom') return { x: point.x, y: point.y + amount };
    if (side === 'left') return { x: point.x - amount, y: point.y };
    return { x: point.x + amount, y: point.y };
  };
  const controlStart = vector(start, fromSide, distance);
  const controlEnd = vector(end, toSide, distance);
  return `M ${start.x} ${start.y} C ${controlStart.x} ${controlStart.y}, ${controlEnd.x} ${controlEnd.y}, ${end.x} ${end.y}`;
};

export const deleteCanvasSelection = (documentValue, nodeIds, edgeIds = []) => ({
  ...documentValue,
  nodes: documentValue.nodes.filter((node) => !nodeIds.includes(node.id)),
  edges: documentValue.edges.filter(
    (edge) => !edgeIds.includes(edge.id) && !nodeIds.includes(edge.fromNode) && !nodeIds.includes(edge.toNode),
  ),
});

export const duplicateCanvasSelection = (documentValue, nodeIds, offset = 32) => {
  const idMap = new Map();
  const clones = documentValue.nodes
    .filter((node) => nodeIds.includes(node.id))
    .map((node) => {
      const id = createCanvasId();
      idMap.set(node.id, id);
      return { ...node, id, x: node.x + offset, y: node.y + offset, createdAt: canvasNow(), updatedAt: canvasNow() };
    });
  const edges = documentValue.edges
    .filter((edge) => idMap.has(edge.fromNode) && idMap.has(edge.toNode))
    .map((edge) => ({ ...edge, id: createCanvasId(), fromNode: idMap.get(edge.fromNode), toNode: idMap.get(edge.toNode) }));
  return {
    document: { ...documentValue, nodes: [...documentValue.nodes, ...clones], edges: [...documentValue.edges, ...edges] },
    nodeIds: clones.map((node) => node.id),
  };
};

export const serializeCanvasDocument = (documentValue) => JSON.stringify(normalizeCanvasDocument(documentValue), null, 2);
export const deserializeCanvasDocument = (text) => normalizeCanvasDocument(JSON.parse(text));

export const isSafeHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const looksLikeImageUrl = (value) =>
  isSafeHttpUrl(value) && /\.(png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(value);
