import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMarkdownLinePrefix, applyMarkdownWrap, insertMarkdownAtSelection } from '../src/utils/markdown.js';

test('aplica e remove negrito preservando a selecao', () => {
  const formatted = applyMarkdownWrap('um titulo', 3, 9, '**', '**', 'negrito');
  assert.equal(formatted.value, 'um **titulo**');
  assert.deepEqual([formatted.selectionStart, formatted.selectionEnd], [5, 11]);

  const removed = applyMarkdownWrap(formatted.value, 5, 11, '**', '**', 'negrito');
  assert.equal(removed.value, 'um titulo');
});

test('formata automaticamente a palavra sob o cursor', () => {
  const result = applyMarkdownWrap('texto central aqui', 8, 8, '*', '*', 'italico');
  assert.equal(result.value, 'texto *central* aqui');
});

test('cria e remove titulo markdown de nivel um', () => {
  const formatted = applyMarkdownLinePrefix('Meu titulo', 0, 0, '# ', 'Titulo');
  assert.equal(formatted.value, '# Meu titulo');

  const removed = applyMarkdownLinePrefix(formatted.value, 2, 2, '# ', 'Titulo');
  assert.equal(removed.value, 'Meu titulo');
});

test('insere imagem markdown na posicao selecionada', () => {
  const result = insertMarkdownAtSelection('antes depois', 6, 6, '![foto](url)');
  assert.equal(result.value, 'antes ![foto](url)depois');
});
