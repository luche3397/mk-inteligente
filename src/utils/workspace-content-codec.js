const COMPRESSED_PREFIX = 'workspace-gzip-v1:';
const COMPRESSION_THRESHOLD = 24_000;

const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 32_768;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const base64ToBytes = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

export const compressWorkspaceContent = async (value) => {
  if (
    typeof value !== 'string' ||
    value.length < COMPRESSION_THRESHOLD ||
    value.startsWith(COMPRESSED_PREFIX) ||
    typeof CompressionStream === 'undefined'
  ) {
    return value;
  }

  try {
    const sourceBytes = new TextEncoder().encode(value);
    const compressedStream = new Blob([sourceBytes]).stream().pipeThrough(new CompressionStream('gzip'));
    const compressedBytes = new Uint8Array(await new Response(compressedStream).arrayBuffer());
    const encoded = `${COMPRESSED_PREFIX}${bytesToBase64(compressedBytes)}`;
    return encoded.length < value.length ? encoded : value;
  } catch {
    return value;
  }
};

export const decompressWorkspaceContent = async (value) => {
  if (
    typeof value !== 'string' ||
    !value.startsWith(COMPRESSED_PREFIX) ||
    typeof DecompressionStream === 'undefined'
  ) {
    return value;
  }

  try {
    const compressedBytes = base64ToBytes(value.slice(COMPRESSED_PREFIX.length));
    const decompressedStream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(decompressedStream).text();
  } catch {
    return value;
  }
};

export const createWorkspaceContentSignature = async (value) => {
  const content = typeof value === 'string' ? value : '';
  const bytes = new TextEncoder().encode(content);

  if (globalThis.crypto?.subtle) {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${bytes.length}:${hash}`;
  }

  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `${bytes.length}:${(hash >>> 0).toString(16)}`;
};
