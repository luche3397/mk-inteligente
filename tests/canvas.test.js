import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCanvasDocument,
  createCanvasNode,
  deleteCanvasSelection,
  deserializeCanvasDocument,
  duplicateCanvasSelection,
  getBezierPath,
  getNodesBounds,
  nodesInSelection,
  normalizeCanvasDocument,
  screenToWorld,
  serializeCanvasDocument,
  worldToScreen,
} from '../src/utils/canvas.js';

test('converte coordenadas entre tela e mundo', () => {
  const viewport = { x: 40, y: -20, zoom: 2 };
  const rect = { left: 100, top: 50 };
  const world = screenToWorld(380, 210, rect, viewport);
  assert.deepEqual(world, { x: 100, y: 100 });
  assert.deepEqual(worldToScreen(world.x, world.y, viewport), { x: 280, y: 160 });
});

test('calcula limites e seleção por interseção', () => {
  const nodes = [
    { id: 'a', x: 10, y: 20, width: 100, height: 80 },
    { id: 'b', x: 200, y: 100, width: 50, height: 50 },
  ];
  assert.deepEqual(getNodesBounds(nodes), { minX: 10, minY: 20, maxX: 250, maxY: 150 });
  assert.deepEqual(nodesInSelection(nodes, { x: 0, y: 0 }, { x: 120, y: 120 }), ['a']);
  assert.deepEqual(nodesInSelection(nodes, { x: 260, y: 160 }, { x: 190, y: 90 }), ['b']);
  assert.deepEqual(nodesInSelection(nodes, { x: 110, y: 20 }, { x: 130, y: 40 }), ['a']);
});

test('duplica nós com IDs novos e preserva conexões internas', () => {
  const first = createCanvasNode('text', 0, 0);
  const second = createCanvasNode('text', 300, 0);
  const documentValue = {
    ...createCanvasDocument(),
    nodes: [first, second],
    edges: [{ id: 'edge', fromNode: first.id, toNode: second.id, fromSide: 'right', toSide: 'left', fromEnd: 'none', toEnd: 'arrow', zIndex: 0 }],
  };
  const result = duplicateCanvasSelection(documentValue, [first.id, second.id]);
  assert.equal(result.nodeIds.length, 2);
  assert.equal(new Set(result.document.nodes.map((node) => node.id)).size, 4);
  assert.equal(result.document.edges.length, 2);
  assert.ok(result.nodeIds.every((id) => id !== first.id && id !== second.id));
});

test('excluir nó remove suas conexões', () => {
  const documentValue = {
    ...createCanvasDocument(),
    nodes: [{ id: 'a' }, { id: 'b' }],
    edges: [{ id: 'edge', fromNode: 'a', toNode: 'b' }],
  };
  const result = deleteCanvasSelection(documentValue, ['a']);
  assert.deepEqual(result.nodes, [{ id: 'b' }]);
  assert.deepEqual(result.edges, []);
});

test('serializa, desserializa e valida o documento', () => {
  const node = createCanvasNode('link', 10, 20, { link: { url: 'https://example.com' } });
  const documentValue = { ...createCanvasDocument(), viewport: { x: 4, y: 5, zoom: 1.5 }, nodes: [node] };
  const restored = deserializeCanvasDocument(serializeCanvasDocument(documentValue));
  assert.equal(restored.nodes[0].id, node.id);
  assert.deepEqual(restored.viewport, documentValue.viewport);
  const invalid = normalizeCanvasDocument({ viewport: { zoom: 99 }, nodes: [{ type: 'script' }], edges: [] });
  assert.equal(invalid.viewport.zoom, 3);
  assert.equal(invalid.nodes.length, 0);
});

test('gera curva Bézier válida', () => {
  const path = getBezierPath({ x: 0, y: 0 }, { x: 300, y: 100 }, 'right', 'left');
  assert.match(path, /^M 0 0 C /);
  assert.match(path, /300 100$/);
});
