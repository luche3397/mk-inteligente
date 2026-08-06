import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  envContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separatorIndex = line.indexOf('=');
      return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
    }),
);

const supabaseUrl = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Variaveis do Supabase ausentes em .env.local');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const encoder = new TextEncoder();
const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
};
const shortId = (value) => (typeof value === 'string' ? `${value.slice(0, 8)}...` : 'ausente');

const fetchAllContents = async () => {
  const rows = [];
  const pageSize = 500;

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('tab_contents')
      .select('id,tab_id,user_id,content,updated_at')
      .order('id')
      .range(start, start + pageSize - 1);

    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
};

const diagnose = async () => {
  const tableNames = ['workspaces', 'sections', 'tabs', 'tab_contents', 'modules'];
  const counts = {};

  for (const tableName of tableNames) {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    if (error) throw new Error(`${tableName}: ${error.message}`);
    counts[tableName] = count ?? 0;
  }

  const contents = await fetchAllContents();
  const measured = contents
    .map((row) => {
      const content = typeof row.content === 'string' ? row.content : '';
      return {
        ...row,
        bytes: encoder.encode(content).length,
        compressed: content.startsWith('workspace-gzip-v1:'),
      };
    })
    .sort((left, right) => right.bytes - left.bytes);
  const totalsByUser = new Map();

  measured.forEach((row) => {
    const current = totalsByUser.get(row.user_id) ?? { rows: 0, bytes: 0, maximum: 0 };
    current.rows += 1;
    current.bytes += row.bytes;
    current.maximum = Math.max(current.maximum, row.bytes);
    totalsByUser.set(row.user_id, current);
  });

  console.log('Diagnostico Supabase (somente leitura)');
  console.table(counts);
  console.log(`Conteudo total em tab_contents: ${formatBytes(measured.reduce((sum, row) => sum + row.bytes, 0))}`);
  console.log(`Registros compactados: ${measured.filter((row) => row.compressed).length}/${measured.length}`);
  console.log('Resumo por usuario:');
  console.table(
    [...totalsByUser.entries()].map(([userId, total]) => ({
      usuario: shortId(userId),
      registros: total.rows,
      total: formatBytes(total.bytes),
      maior_registro: formatBytes(total.maximum),
    })),
  );
  console.log('Dez maiores registros (sem exibir conteudo):');
  console.table(
    measured.slice(0, 10).map((row) => ({
      id: shortId(row.id),
      usuario: shortId(row.user_id),
      tamanho: formatBytes(row.bytes),
      compactado: row.compressed ? 'sim' : 'nao',
      atualizado_em: row.updated_at,
    })),
  );
};

diagnose().catch((error) => {
  console.error(`Falha no diagnostico: ${error.message}`);
  process.exit(1);
});
