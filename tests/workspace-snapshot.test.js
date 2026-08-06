import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWorkspaceSnapshot,
  chunkRowsBySerializedSize,
  rowsMatchSnapshot,
} from '../src/utils/workspace-snapshot.js';
import {
  compressWorkspaceContent,
  createWorkspaceContentSignature,
  decompressWorkspaceContent,
} from '../src/utils/workspace-content-codec.js';

test('mantém o workspace oculto correto quando existem títulos depois dele', () => {
  const workspace = [
    { id: 'section-before-title', type: 'section', name: 'Entrada', tabs: [] },
    { id: 'visible-title', type: 'title', title: 'Projetos', color: '#ffffff' },
    { id: 'section-after-title', type: 'section', name: 'Ativos', tabs: [] },
  ];

  const snapshot = buildWorkspaceSnapshot(workspace, 'user-1', 'hidden-workspace');

  assert.equal(snapshot.hiddenLeadingWorkspaceId, 'hidden-workspace');
  assert.equal(snapshot.sections[0].workspace_id, 'hidden-workspace');
  assert.equal(snapshot.sections[1].workspace_id, 'visible-title');
});

test('snapshot completo não mantém abas removidas e preserva todo o conteúdo atual', () => {
  const workspace = [
    { id: 'title-1', type: 'title', title: 'Projetos', color: '#ffffff' },
    {
      id: 'section-1',
      type: 'section',
      name: 'Ativos',
      tabs: [
        {
          id: 'tab-current',
          name: 'Documento',
          type: 'note',
          content: 'conteúdo mais recente',
          fileUrl: null,
          noteZoom: 1.2,
          viewMode: 'content',
          canvasDocument: null,
          status: 'em revisão',
        },
      ],
    },
  ];

  const snapshot = buildWorkspaceSnapshot(workspace, 'user-1', null);
  const savedContent = JSON.parse(snapshot.tabContents[0].content);

  assert.deepEqual(snapshot.tabIds, ['tab-current']);
  assert.equal(snapshot.tabs.some((tab) => tab.id === 'tab-removed'), false);
  assert.equal(savedContent.content, 'conteúdo mais recente');
  assert.equal(savedContent.noteZoom, 1.2);
  assert.equal(savedContent.status, 'em revisão');
});

test('verificação rejeita registros antigos que reapareceriam no próximo login', () => {
  const expected = [{ id: 'tab-current', title: 'Documento', position: 0 }];
  const remoteWithStaleTab = [
    ...expected,
    { id: 'tab-removed', title: 'Antiga', position: 1 },
  ];

  assert.equal(rowsMatchSnapshot(expected, expected, ['id', 'title', 'position']), true);
  assert.equal(rowsMatchSnapshot(remoteWithStaleTab, expected, ['id', 'title', 'position']), false);
});

test('divide conteúdos grandes em lotes sem perder nenhuma aba', () => {
  const rows = [
    { id: 'a', content: 'a'.repeat(80) },
    { id: 'b', content: 'b'.repeat(80) },
    { id: 'c', content: 'c'.repeat(80) },
  ];

  const chunks = chunkRowsBySerializedSize(rows, 150);

  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flat().map((row) => row.id), ['a', 'b', 'c']);
});

test('compacta conteúdo grande e restaura o texto original', async () => {
  const original = JSON.stringify({
    type: 'html',
    content: `<main>${'<section>conteúdo</section>'.repeat(4_000)}</main>`,
  });

  const compressed = await compressWorkspaceContent(original);
  const restored = await decompressWorkspaceContent(compressed);

  assert.ok(compressed.length < original.length);
  assert.equal(restored, original);
});

test('gera assinaturas iguais somente para conteudos iguais', async () => {
  const first = await createWorkspaceContentSignature('conteudo importante');
  const second = await createWorkspaceContentSignature('conteudo importante');
  const changed = await createWorkspaceContentSignature('conteudo alterado');

  assert.equal(first, second);
  assert.notEqual(first, changed);
});
