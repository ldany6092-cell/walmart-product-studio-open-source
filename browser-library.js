// Browser model library: lightweight multi-file/folder indexing + LRU IndexedDB cache.
import {
  SUPPORTED_EXTENSIONS,
  detectModelFormat,
  getFileExtension,
  isCompanionResource,
  isHiddenOrSystemFile,
  isSupportedModelFile,
  validateGLB,
} from './model-loader.js';

export { validateGLB };

const DB_NAME = 'open-product-studio-models';
const STORE_NAME = 'models';

export const DEFAULT_CACHE_LIMITS = Object.freeze({
  maxModels: 20,
  maxBytes: 200 * 1024 * 1024,       // 200 MB total IndexedDB cache budget
  maxSingleFileBytes: 100 * 1024 * 1024, // 100 MB per single cached file
});

const objectUrls = new Map();

function sanitizeModelName(filename) {
  return String(filename || 'model')
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .trim()
    .slice(0, 80) || 'model';
}

function normalizePathKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim()
    .toLowerCase();
}

// Fast, deterministic 64-bit (dual 32-bit FNV-1a) hex digest for stable local storage keys.
function stableHashHex(input) {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b1;
  const text = String(input || '');
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code + ((i + 1) * 31);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function computeFileSignature({ fileName, relativePath, byteSize = 0, name = '', format = '' } = {}) {
  const baseName = normalizePathKey(fileName || String(relativePath || '').split(/[\\/]/).pop() || (name ? `${name}.${format || 'glb'}` : 'model'));
  const size = Math.max(0, Math.round(Number(byteSize) || 0));
  return `${baseName}|${size}`;
}

export function computeStableModelId({ relativePath, fileName, byteSize = 0, name = '', format = '' } = {}) {
  const pathKey = normalizePathKey(relativePath || fileName || (name ? `${name}.${format || 'glb'}` : 'model'));
  const size = Math.max(0, Math.round(Number(byteSize) || 0));
  return `model_${stableHashHex(`${pathKey}|${size}`)}`;
}

export function isLegacyRandomModelId(id) {
  return typeof id === 'string' && id.startsWith('upload_');
}

export function migratePersistedStateMap(stateMap, idMigrations = new Map(), aliasMap = null, items = []) {
  const target = stateMap && typeof stateMap === 'object' ? stateMap : {};
  let changed = false;

  if (idMigrations && typeof idMigrations.entries === 'function') {
    for (const [oldId, newId] of idMigrations.entries()) {
      if (!oldId || !newId || oldId === newId) continue;
      if (Object.prototype.hasOwnProperty.call(target, oldId)) {
        if (!Object.prototype.hasOwnProperty.call(target, newId)) {
          target[newId] = target[oldId];
        }
        delete target[oldId];
        changed = true;
      }
    }
  }

  if (aliasMap && typeof aliasMap === 'object' && Array.isArray(items)) {
    for (const item of items) {
      if (!item?.id || Object.prototype.hasOwnProperty.call(target, item.id)) continue;
      const sig = item.fileSignature || computeFileSignature(item);
      const prevId = aliasMap[sig];
      if (prevId && prevId !== item.id && Object.prototype.hasOwnProperty.call(target, prevId)) {
        target[item.id] = structuredClone(target[prevId]);
        changed = true;
      }
    }
  }

  return changed;
}

const lastMigratedIdMap = new Map();
export function getLastMigratedModelIds() {
  return new Map(lastMigratedIdMap);
}

async function openDatabase() {
  if (!globalThis.indexedDB) {
    throw Error('当前浏览器不支持 IndexedDB 本地存储，请检查浏览器隐私或存储权限');
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error('无法打开本机模型库，请检查浏览器存储权限'));
  });
}

function toCatalogMetadata(record) {
  const { blob, ...rest } = record;
  const format = rest.format || detectModelFormat(rest.fileName || rest.name || '') || 'glb';
  const byteSize = rest.byteSize ?? blob?.size ?? 0;
  const fileSignature = rest.fileSignature || computeFileSignature({
    fileName: rest.fileName,
    relativePath: rest.relativePath,
    byteSize,
    name: rest.name,
    format,
  });
  return {
    ...rest,
    format,
    byteSize,
    fileSignature,
    persisted: true,
    file: objectUrls.get(rest.id) || null,
  };
}

// Compute LRU eviction victims given records, limits, and optional protected id.
export function selectLruEvictions(records, limits = DEFAULT_CACHE_LIMITS, protectedId = null) {
  const maxModels = Math.max(1, limits.maxModels ?? DEFAULT_CACHE_LIMITS.maxModels);
  const maxBytes = Math.max(1, limits.maxBytes ?? DEFAULT_CACHE_LIMITS.maxBytes);

  const sorted = [...records].sort((a, b) => {
    const timeA = a.lastAccessedAt ?? a.createdAt ?? 0;
    const timeB = b.lastAccessedAt ?? b.createdAt ?? 0;
    return timeA - timeB;
  });

  let totalCount = sorted.length;
  let totalBytes = sorted.reduce((sum, r) => sum + (r.byteSize ?? r.blob?.size ?? 0), 0);
  const victims = [];

  for (const record of sorted) {
    if (totalCount <= maxModels && totalBytes <= maxBytes) break;
    if (record.id === protectedId) continue;
    victims.push(record.id);
    totalCount--;
    totalBytes -= (record.byteSize ?? record.blob?.size ?? 0);
  }
  return victims;
}

function revokeObjectUrl(id) {
  const url = objectUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(id);
  }
}

// Lightweight scan of selected files / folder without reading file bytes or parsing geometry.
export function indexSelectedFiles(fileList, { category = 'solid', source = '本机导入' } = {}) {
  const files = Array.from(fileList || []);
  const companionFiles = new Map();
  const entries = [];
  const skipped = [];

  for (const file of files) {
    const relPath = (file.webkitRelativePath || file.name || '').replace(/\\/g, '/');
    if (isHiddenOrSystemFile(file.name, relPath)) continue;
    if (isCompanionResource(file.name)) {
      companionFiles.set(relPath.toLowerCase(), file);
      if (file.name) companionFiles.set(file.name.toLowerCase(), file);
    }
  }

  for (const file of files) {
    const relPath = (file.webkitRelativePath || file.name || '').replace(/\\/g, '/');
    if (isHiddenOrSystemFile(file.name, relPath)) continue;
    if (isCompanionResource(file.name)) continue;

    if (!isSupportedModelFile(file.name)) {
      const ext = getFileExtension(file.name) || '无扩展名';
      skipped.push({
        name: file.name,
        relativePath: relPath,
        ext,
        reason: `暂不支持 ${ext} 格式，浏览器本地仅支持 ${SUPPORTED_EXTENSIONS.join(' / ')}`,
      });
      continue;
    }

    const format = detectModelFormat(file.name);
    const byteSize = file.size || 0;
    const id = computeStableModelId({ relativePath: relPath, fileName: file.name, byteSize, format });
    const fileSignature = computeFileSignature({ fileName: file.name, relativePath: relPath, byteSize, format });
    const entry = {
      id,
      fileSignature,
      name: sanitizeModelName(file.name),
      fileName: file.name,
      relativePath: relPath,
      format,
      byteSize,
      category,
      source,
      up: 'Y',
      persisted: false,
      file: null,
      fileRef: file,
      companionFiles: format === 'gltf' && companionFiles.size ? companionFiles : null,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
    entries.push(entry);
  }

  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-CN', { numeric: true }));

  const skippedByExt = new Map();
  for (const s of skipped) {
    skippedByExt.set(s.ext, (skippedByExt.get(s.ext) || 0) + 1);
  }
  const skippedSummary = skipped.length
    ? `跳过 ${skipped.length} 个不支持格式（${[...skippedByExt.entries()].map(([ext, count]) => `${ext}×${count}`).join('、')}）`
    : '';

  return { entries, skipped, skippedSummary };
}

// Read metadata list from IndexedDB and smoothly migrate legacy random upload_* IDs to deterministic keys.
export async function readLocalModels() {
  lastMigratedIdMap.clear();
  if (!globalThis.indexedDB) return [];
  let db;
  try {
    db = await openDatabase();
    const records = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    const valid = records.filter(record => record?.id && record?.blob instanceof Blob);
    const byStableId = new Map();
    const toPut = [];
    const toDelete = [];

    for (const rec of valid) {
      const format = rec.format || detectModelFormat(rec.fileName || rec.name || '') || 'glb';
      const byteSize = rec.byteSize ?? rec.blob.size ?? 0;
      const fileSignature = rec.fileSignature || computeFileSignature({
        fileName: rec.fileName,
        relativePath: rec.relativePath,
        byteSize,
        name: rec.name,
        format,
      });
      if (!isLegacyRandomModelId(rec.id)) {
        const normalized = { ...rec, format, byteSize, fileSignature };
        byStableId.set(rec.id, normalized);
        continue;
      }

      const stableId = computeStableModelId({
        relativePath: rec.relativePath,
        fileName: rec.fileName || `${rec.name}.${format}`,
        byteSize,
        name: rec.name,
        format,
      });
      lastMigratedIdMap.set(rec.id, stableId);
      toDelete.push(rec.id);

      const existing = byStableId.get(stableId);
      const recTime = rec.lastAccessedAt ?? rec.createdAt ?? 0;
      const existingTime = existing ? (existing.lastAccessedAt ?? existing.createdAt ?? 0) : -1;
      if (!existing || recTime > existingTime) {
        const migrated = { ...rec, id: stableId, format, byteSize, fileSignature };
        byStableId.set(stableId, migrated);
        toPut.push(migrated);
      }
    }

    if (toDelete.length) {
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          for (const rec of toPut) store.put(rec);
          for (const oldId of toDelete) store.delete(oldId);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        for (const oldId of toDelete) revokeObjectUrl(oldId);
      } catch (migErr) {
        console.warn('IndexedDB legacy ID migration skipped:', migErr);
      }
    }

    return [...byStableId.values()]
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map(toCatalogMetadata);
  } catch (error) {
    console.warn('readLocalModels failed:', error);
    return [];
  } finally {
    db?.close();
  }
}

export async function getLibraryCacheStats(limits = DEFAULT_CACHE_LIMITS) {
  if (!globalThis.indexedDB) {
    return { count: 0, totalBytes: 0, maxModels: limits.maxModels, maxBytes: limits.maxBytes };
  }
  let db;
  try {
    db = await openDatabase();
    const records = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    const valid = records.filter(r => r?.id && r?.blob instanceof Blob);
    const totalBytes = valid.reduce((sum, r) => sum + (r.byteSize ?? r.blob.size ?? 0), 0);
    return {
      count: valid.length,
      totalBytes,
      maxModels: limits.maxModels,
      maxBytes: limits.maxBytes,
    };
  } catch {
    return { count: 0, totalBytes: 0, maxModels: limits.maxModels, maxBytes: limits.maxBytes };
  } finally {
    db?.close();
  }
}

async function getStoredRecord(id) {
  let db;
  try {
    db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db?.close();
  }
}

export async function touchLocalModel(id) {
  if (!globalThis.indexedDB || !id) return;
  let db;
  try {
    db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (record) {
          record.lastAccessedAt = Date.now();
          store.put(record);
        }
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('touchLocalModel failed:', error);
  } finally {
    db?.close();
  }
}

// Lazily fetch bytes for a catalog item (session File -> IndexedDB -> remote/built-in URL).
export async function readModelBytes(item) {
  if (!item) throw Error('未指定模型项');

  if (item.fileRef instanceof Blob) {
    return item.fileRef.arrayBuffer();
  }

  if (item.persisted && item.id) {
    const record = await getStoredRecord(item.id);
    if (!record?.blob) {
      throw Error(`本机缓存中未找到模型「${item.name}」（可能已被 LRU 淘汰，请重新选择导入）`);
    }
    touchLocalModel(item.id);
    if (!item.file && (item.format === 'glb' || item.format === 'gltf')) {
      const url = objectUrls.get(item.id) || URL.createObjectURL(record.blob);
      objectUrls.set(item.id, url);
      item.file = url;
    }
    return record.blob.arrayBuffer();
  }

  if (item.file) {
    const response = await fetch(item.file);
    if (!response.ok) throw Error(`模型文件加载失败（HTTP ${response.status}）：${item.name}`);
    return response.arrayBuffer();
  }

  throw Error(`模型「${item.name}」缺少有效文件引用，请重新导入`);
}

// Ensure a lazy ObjectURL exists for GLB/GLTF models (used by WebGPU volume path tracer).
export async function ensureModelObjectURL(item) {
  if (!item) return null;
  if (item.file) return item.file;
  if (item.fileRef instanceof Blob) {
    const url = URL.createObjectURL(item.fileRef);
    objectUrls.set(item.id, url);
    item.file = url;
    return url;
  }
  if (item.persisted && item.id) {
    const existing = objectUrls.get(item.id);
    if (existing) {
      item.file = existing;
      return existing;
    }
    const record = await getStoredRecord(item.id);
    if (record?.blob) {
      const url = URL.createObjectURL(record.blob);
      objectUrls.set(item.id, url);
      item.file = url;
      return url;
    }
  }
  return null;
}

// Persist an on-demand loaded model into IndexedDB with strict LRU eviction.
export async function cacheModelInLibrary(item, bytes, limits = DEFAULT_CACHE_LIMITS) {
  if (!globalThis.indexedDB || !item?.id || !bytes?.byteLength) {
    return { cached: false, evictedIds: [] };
  }
  const maxSingle = limits.maxSingleFileBytes ?? DEFAULT_CACHE_LIMITS.maxSingleFileBytes;
  if (bytes.byteLength > maxSingle) {
    return {
      cached: false,
      evictedIds: [],
      reason: `单文件超过 ${Math.round(maxSingle / 1024 / 1024)} MB 缓存上限，仅本次会话按需使用`,
    };
  }
  // Skip caching multi-file external-URI GLTFs that require sibling files in IndexedDB.
  if (item.format === 'gltf' && item.companionFiles?.size) {
    return {
      cached: false,
      evictedIds: [],
      reason: '含外部资源的 GLTF 仅本次会话按需使用（建议转单文件 GLB 以便持久化）',
    };
  }

  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const now = Date.now();
  const record = {
    id: item.id,
    fileSignature: item.fileSignature || computeFileSignature({
      fileName: item.fileName,
      relativePath: item.relativePath,
      byteSize: bytes.byteLength,
      name: item.name,
      format: item.format,
    }),
    name: item.name,
    fileName: item.fileName || `${item.name}.${item.format || 'glb'}`,
    relativePath: item.relativePath || item.fileName || item.name,
    format: item.format || 'glb',
    byteSize: bytes.byteLength,
    category: item.category || 'solid',
    source: item.source || '本机导入',
    up: item.up || 'Y',
    createdAt: item.createdAt || now,
    lastAccessedAt: now,
    blob,
  };

  let db;
  try {
    db = await openDatabase();
    const evictedIds = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let evicted = [];

      const putReq = store.put(record);
      putReq.onsuccess = () => {
        const allReq = store.getAll();
        allReq.onsuccess = () => {
          const allRecords = allReq.result || [];
          evicted = selectLruEvictions(allRecords, limits, record.id);
          for (const id of evicted) {
            store.delete(id);
          }
        };
      };

      tx.oncomplete = () => resolve(evicted);
      tx.onerror = () => reject(Error('本机模型缓存写入失败，可能超出浏览器存储配额'));
      tx.onabort = () => reject(Error('本机模型缓存被浏览器中止'));
    });

    for (const id of evictedIds) revokeObjectUrl(id);
    item.persisted = true;
    item.lastAccessedAt = now;
    item.byteSize = bytes.byteLength;
    return { cached: true, evictedIds };
  } catch (error) {
    console.warn('cacheModelInLibrary skipped:', error);
    return { cached: false, evictedIds: [], reason: error.message };
  } finally {
    db?.close();
  }
}

// Backward-compatible single-file eager import helper.
export async function importLocalModel(file, category) {
  if (!['solid', 'transparent'].includes(category)) throw Error('请选择材质分类');
  const { entries, skipped } = indexSelectedFiles([file], { category, source: '本机上传' });
  if (!entries.length) {
    throw Error(skipped[0]?.reason || `请选择支持的模型格式（${SUPPORTED_EXTENSIONS.join(' / ')}）`);
  }
  const entry = entries[0];
  const bytes = await readModelBytes(entry);
  if (entry.format === 'glb') validateGLB(bytes);
  await cacheModelInLibrary(entry, bytes);
  if (entry.format === 'glb' || entry.format === 'gltf') {
    await ensureModelObjectURL(entry);
  }
  return entry;
}
