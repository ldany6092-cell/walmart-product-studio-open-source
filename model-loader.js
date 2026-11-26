import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const SUPPORTED_FORMATS = Object.freeze({
  glb: { ext: '.glb', label: 'GLB', kind: 'gltf', volumeSupported: true },
  gltf: { ext: '.gltf', label: 'GLTF', kind: 'gltf', volumeSupported: true },
  fbx: { ext: '.fbx', label: 'FBX', kind: 'fbx', volumeSupported: false },
  stp: { ext: '.stp', label: 'STP', kind: 'step', volumeSupported: false },
  step: { ext: '.step', label: 'STEP', kind: 'step', volumeSupported: false },
});

export const SUPPORTED_EXTENSIONS = Object.freeze(Object.values(SUPPORTED_FORMATS).map(f => f.ext));
export const SUPPORTED_MODEL_ACCEPT = SUPPORTED_EXTENSIONS.join(',');

const COMPANION_EXTENSIONS = new Set([
  '.bin', '.png', '.jpg', '.jpeg', '.webp', '.ktx2', '.dds', '.tga', '.bmp', '.gif', '.mtl',
]);

const SYSTEM_FILENAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);

export function getFileExtension(filename = '') {
  const clean = String(filename).trim();
  const base = clean.split(/[\\/]/).pop() || clean;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

export function detectModelFormat(filename = '') {
  const ext = getFileExtension(filename);
  const key = ext.startsWith('.') ? ext.slice(1) : ext;
  return Object.prototype.hasOwnProperty.call(SUPPORTED_FORMATS, key) ? key : null;
}

export function isSupportedModelFile(filename = '') {
  return detectModelFormat(filename) !== null;
}

export function isCompanionResource(filename = '') {
  return COMPANION_EXTENSIONS.has(getFileExtension(filename));
}

export function isHiddenOrSystemFile(filename = '', relativePath = '') {
  const pathText = String(relativePath || filename);
  const segments = pathText.split(/[\\/]/).filter(Boolean);
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    if (lower === '__macosx' || SYSTEM_FILENAMES.has(lower) || seg.startsWith('._')) {
      return true;
    }
  }
  const base = segments[segments.length - 1] || '';
  return base.startsWith('.');
}

export function formatDisplayName(format) {
  return SUPPORTED_FORMATS[format]?.label || String(format || '').toUpperCase();
}

export function supportsVolumePathTracing(item) {
  const format = item?.format || detectModelFormat(item?.file || item?.name || '') || 'glb';
  return Boolean(SUPPORTED_FORMATS[format]?.volumeSupported);
}

export function validateGLB(bytes) {
  const view = new DataView(bytes);
  if (
    bytes.byteLength < 24 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  ) {
    throw Error('请选择有效的 GLB 2.0 模型');
  }
  const size = view.getUint32(12, true);
  if (size > bytes.byteLength - 20) throw Error('GLB 文件不完整');
  const model = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, size)).trim());
  if (!model.meshes?.length) throw Error('模型中没有可渲染的网格');
  for (const resource of [...(model.buffers || []), ...(model.images || [])]) {
    if (resource.uri && !resource.uri.startsWith('data:')) {
      throw Error('请导出嵌入贴图的 GLB，避免外部文件缺失');
    }
  }
  return model;
}

function normalizeColorArrayToHex(color) {
  if (!Array.isArray(color) || color.length < 3) return null;
  const maxChannel = Math.max(color[0], color[1], color[2]);
  const scale = maxChannel > 1 ? 1 / 255 : 1;
  const c = new THREE.Color().setRGB(
    Math.min(1, Math.max(0, Number(color[0]) * scale)),
    Math.min(1, Math.max(0, Number(color[1]) * scale)),
    Math.min(1, Math.max(0, Number(color[2]) * scale)),
    THREE.SRGBColorSpace,
  );
  return '#' + c.getHexString();
}

function buildStepMeshObject(meshData, index) {
  const posArr = meshData?.attributes?.position?.array;
  if (!posArr || posArr.length < 9) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));

  const normArr = meshData?.attributes?.normal?.array;
  if (normArr && normArr.length === posArr.length) {
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normArr, 3));
  }

  const idxArr = meshData?.index?.array;
  if (idxArr && idxArr.length >= 3) {
    const IndexArrayCtor = posArr.length / 3 > 65535 ? Uint32Array : Uint16Array;
    geometry.setIndex(new THREE.BufferAttribute(new IndexArrayCtor(idxArr), 1));
  }

  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }

  const cadColor = normalizeColorArrayToHex(meshData.color);
  const material = new THREE.MeshStandardMaterial({
    color: cadColor || '#cccccc',
    roughness: 0.42,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = (meshData.name || '').trim() || `CAD零件_${index + 1}`;
  if (cadColor) mesh.userData.cadColor = cadColor;
  return mesh;
}

export function buildStepSceneFromResult(result) {
  if (!result || !result.success) {
    throw Error('STEP / STP 文件解析失败，请确认文件完整且为标准 STEP (AP203/AP214/AP242) 格式');
  }
  const sourceMeshes = Array.isArray(result.meshes) ? result.meshes : [];
  if (!sourceMeshes.length) {
    throw Error('STEP / STP 文件中未包含可渲染的实体或曲面');
  }

  const rootGroup = new THREE.Group();
  rootGroup.name = 'STEP_Scene';
  const placedIndices = new Set();

  function walkNode(node, parentGroup) {
    if (!node) return;
    const nodeName = (node.name || '').trim();
    const targetGroup = nodeName ? new THREE.Group() : parentGroup;
    if (nodeName) {
      targetGroup.name = nodeName;
      parentGroup.add(targetGroup);
    }
    if (Array.isArray(node.meshes)) {
      for (const meshIndex of node.meshes) {
        if (placedIndices.has(meshIndex) || !sourceMeshes[meshIndex]) continue;
        placedIndices.add(meshIndex);
        const mesh = buildStepMeshObject(sourceMeshes[meshIndex], meshIndex);
        if (mesh) targetGroup.add(mesh);
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walkNode(child, targetGroup);
      }
    }
  }

  if (result.root) {
    walkNode(result.root, rootGroup);
  }

  // Include any meshes not referenced by root hierarchy.
  for (let i = 0; i < sourceMeshes.length; i++) {
    if (placedIndices.has(i)) continue;
    const mesh = buildStepMeshObject(sourceMeshes[i], i);
    if (mesh) rootGroup.add(mesh);
  }

  let meshCount = 0;
  rootGroup.traverse(o => {
    if (o.isMesh) meshCount++;
  });
  if (!meshCount) {
    throw Error('STEP / STP 文件解析后无有效三角网格');
  }

  // Output from ReadStepFile with linearUnit='centimeter' carries real-world cm dimensions.
  const box = new THREE.Box3().setFromObject(rootGroup);
  const size = box.getSize(new THREE.Vector3());
  const spanCM = Math.max(size.x, size.y, size.z);
  const estimatedMaxCM = Number.isFinite(spanCM) && spanCM > 0.05 && spanCM < 10000 ? spanCM : undefined;

  return { scene: rootGroup, estimatedMaxCM };
}

let occtPromise = null;
async function getOcctInstance() {
  if (!occtPromise) {
    occtPromise = (async () => {
      const [{ default: occtimportjs }, { default: wasmUrl }] = await Promise.all([
        import('occt-import-js'),
        import('occt-import-js/dist/occt-import-js.wasm?url'),
      ]);
      const factory = typeof occtimportjs === 'function' ? occtimportjs : occtimportjs?.default;
      if (typeof factory !== 'function') {
        throw Error('STEP 解析引擎初始化失败（occt-import-js 加载异常）');
      }
      return factory({
        locateFile: path => (path.endsWith('.wasm') ? wasmUrl : path),
      });
    })().catch(error => {
      occtPromise = null;
      throw error;
    });
  }
  return occtPromise;
}

function yieldForPaint() {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }
  return Promise.resolve();
}

function normalizeRelativeLookupPath(baseDir, rawUri) {
  const cleanUri = decodeURIComponent(String(rawUri || '').split('?')[0].split('#')[0]).replace(/\\/g, '/');
  const joined = (baseDir ? `${baseDir}/${cleanUri}` : cleanUri).split('/');
  const resolved = [];
  for (const part of joined) {
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/').toLowerCase();
}

async function parseGLTFBytes(bytes, format, item) {
  if (format === 'glb') {
    validateGLB(bytes);
  }

  const companionFiles = item?.companionFiles;
  const revokedUrls = [];
  const manager = new THREE.LoadingManager();

  if (format === 'gltf') {
    const jsonText = new TextDecoder().decode(bytes);
    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch {
      throw Error('GLTF 文件不是有效的 JSON 格式');
    }
    const baseDir = String(item?.relativePath || '').replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    const externalRefs = [...(parsedJson.buffers || []), ...(parsedJson.images || [])]
      .map(r => r?.uri)
      .filter(uri => uri && !uri.startsWith('data:') && !/^https?:\/\//i.test(uri));

    if (externalRefs.length && (!companionFiles || !companionFiles.size)) {
      throw Error('该 GLTF 引用了外部 .bin 或贴图文件，请改用「选择文件夹」导入完整目录，或导出为单文件 GLB');
    }

    if (companionFiles?.size) {
      manager.setURLModifier(url => {
        if (!url || url.startsWith('data:') || url.startsWith('blob:') || /^https?:\/\//i.test(url)) {
          return url;
        }
        const key = normalizeRelativeLookupPath(baseDir, url);
        const matched = companionFiles.get(key) || companionFiles.get(url.split(/[\\/]/).pop().toLowerCase());
        if (!matched) return url;
        const blobUrl = URL.createObjectURL(matched);
        revokedUrls.push(blobUrl);
        return blobUrl;
      });
    }
  }

  const loader = new GLTFLoader(manager);
  try {
    const gltf = await new Promise((resolve, reject) => {
      const input = format === 'gltf' ? new TextDecoder().decode(bytes) : bytes;
      loader.parse(input, '', resolve, reject);
    });
    return { scene: gltf.scene };
  } catch (error) {
    const msg = error?.message || '';
    if (format === 'gltf' && /404|fetch|network|buffer|image/i.test(msg)) {
      throw Error('GLTF 依赖的外部资源缺失，请使用「选择文件夹」导入完整目录，或导出为单文件 GLB');
    }
    throw error;
  } finally {
    for (const url of revokedUrls) URL.revokeObjectURL(url);
  }
}

async function parseFBXBytes(bytes) {
  const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
  const loader = new FBXLoader();
  let group;
  try {
    group = loader.parse(bytes, '');
  } catch (error) {
    throw Error(`FBX 解析失败（请确认是标准二进制/ASCII FBX 文件）：${error?.message || '未知错误'}`);
  }
  let meshCount = 0;
  group.traverse(o => {
    if (o.isMesh) {
      meshCount++;
      if (o.geometry && !o.geometry.getAttribute('normal')) {
        o.geometry.computeVertexNormals();
      }
    }
  });
  if (!meshCount) {
    throw Error('FBX 文件中未包含可渲染的网格');
  }
  return { scene: group };
}

async function parseStepBytes(bytes, onStatus) {
  onStatus?.('正在加载 CAD 解析内核 (OCCT WASM)…');
  await yieldForPaint();
  const occt = await getOcctInstance();
  onStatus?.('正在解析 STEP 实体并拆分零件网格…');
  await yieldForPaint();
  let result;
  try {
    result = occt.ReadStepFile(new Uint8Array(bytes), {
      linearUnit: 'centimeter',
      linearDeflectionType: 'bounding_box_ratio',
      linearDeflection: 0.002,
      angularDeflection: 0.5,
    });
  } catch (error) {
    throw Error(`STEP / STP 解析异常：${error?.message || '文件可能过大或结构损坏'}`);
  }
  return buildStepSceneFromResult(result);
}

export async function loadModelScene(item, { readBytes, onStatus } = {}) {
  const format = item?.format || detectModelFormat(item?.file || item?.name || '');
  if (!format || !SUPPORTED_FORMATS[format]) {
    throw Error(`暂不支持该文件格式，当前支持：${SUPPORTED_EXTENSIONS.join(' / ')}`);
  }

  onStatus?.(`正在读取 ${item.name}…`);
  const bytes = await readBytes(item);
  if (!bytes || !bytes.byteLength) {
    throw Error(`模型文件为空或无法读取：${item.name}`);
  }

  const kind = SUPPORTED_FORMATS[format].kind;
  if (kind === 'gltf') {
    onStatus?.(`正在解析 ${formatDisplayName(format)} 网格…`);
    return parseGLTFBytes(bytes, format, item);
  }
  if (kind === 'fbx') {
    onStatus?.('正在解析 FBX 模型与独立网格…');
    return parseFBXBytes(bytes);
  }
  if (kind === 'step') {
    return parseStepBytes(bytes, onStatus);
  }
  throw Error(`未注册的模型解析器：${format}`);
}

export function disposeObject3D(root) {
  if (!root) return;
  root.traverse(obj => {
    if (!obj.isMesh) return;
    obj.geometry?.dispose?.();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (!mat) continue;
      for (const value of Object.values(mat)) {
        if (value && value.isTexture) value.dispose?.();
      }
      mat.dispose?.();
    }
  });
}

// Bounded in-memory LRU cache for parsed 3D scenes.
export class ModelSceneCache {
  constructor(maxEntries = 3) {
    this.maxEntries = Math.max(1, maxEntries);
    this.entries = new Map();
  }

  get size() {
    return this.entries.size;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  set(key, entry) {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, entry);
  }

  delete(key, dispose = false) {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (dispose && entry.result?.scene) disposeObject3D(entry.result.scene);
    this.entries.delete(key);
  }

  trim(pinnedKey = null) {
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= this.maxEntries) break;
      if (key === pinnedKey || !entry.result) continue;
      disposeObject3D(entry.result.scene);
      this.entries.delete(key);
    }
  }
}
