import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

function remoteConfiguration() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url && !token) return null;
  if (!url || !token) throw new Error('Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required');
  return { url, token };
}

function storeKey(name) {
  const namespace = String(process.env.NAVIRA_STORE_NAMESPACE || 'navira').trim() || 'navira';
  return `${namespace}:${name}`;
}

async function executeRemote(command) {
  const configuration = remoteConfiguration();
  if (!configuration) return null;
  const response = await fetch(configuration.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${configuration.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'navira-render-service',
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    throw new Error(`Persistent store unavailable: ${result.error || `HTTP ${response.status}`}`);
  }
  return result.result;
}

export async function readJsonStore(name, file, emptyStore) {
  if (remoteConfiguration()) {
    const value = await executeRemote(['GET', storeKey(name)]);
    if (value === null) return structuredClone(emptyStore);
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return { ...structuredClone(emptyStore), ...parsed };
  }

  return readFile(file, 'utf8').then((value) => ({
    ...structuredClone(emptyStore),
    ...JSON.parse(value),
  })).catch((error) => {
    if (error.code === 'ENOENT') return structuredClone(emptyStore);
    throw error;
  });
}

export async function writeJsonStore(name, file, store) {
  if (remoteConfiguration()) {
    await executeRemote(['SET', storeKey(name), JSON.stringify(store)]);
    return;
  }

  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPath, file);
}
