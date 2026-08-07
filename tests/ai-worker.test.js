import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker/index.js';
import { buildAiRequestPayload } from '../src/utils/ai-request.js';

const createEnvironment = () => ({
  GEMINI_API_KEY: 'test-only-key',
  ASSETS: {
    fetch: async () => new Response('asset-ok', { status: 200 }),
  },
});

test('endpoint de IA aceita somente POST', async () => {
  const response = await worker.fetch(new Request('https://workspace.test/api/ai'), createEnvironment());
  assert.equal(response.status, 405);
});

test('endpoint de IA exige sessao Supabase valida', async () => {
  const response = await worker.fetch(
    new Request('https://workspace.test/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Ola', history: [], attachments: [] }),
    }),
    createEnvironment(),
  );
  assert.equal(response.status, 401);
});

test('Worker delega arquivos do aplicativo ao binding ASSETS', async () => {
  const response = await worker.fetch(new Request('https://workspace.test/'), createEnvironment());
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'asset-ok');
});

test('payload da IA contem somente contexto enviado manualmente', () => {
  const payload = buildAiRequestPayload({
    message: 'Explique este recorte',
    messages: [{ role: 'user', content: 'Texto colado manualmente' }],
    attachments: [{ type: 'image', mimeType: 'image/webp', data: 'YWJj', previewUrl: 'nao-enviar' }],
    workspace: { segredo: true },
    canvasDocument: { nodes: [{ text: 'nao enviar' }] },
  });

  assert.deepEqual(Object.keys(payload), ['message', 'history', 'attachments']);
  assert.deepEqual(payload.attachments, [{ type: 'image', mimeType: 'image/webp', data: 'YWJj' }]);
  assert.equal(JSON.stringify(payload).includes('nao enviar'), false);
  assert.equal(JSON.stringify(payload).includes('segredo'), false);
});
