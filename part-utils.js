// Generic 3D part naming and handle/grip multi-part grouping utilities.

const GENERIC_MESH_NAME_RE = /^(mesh|object|node|solid|body|shape|part|group|scene|root|default|poly|surface|shell|unnamed|component)[_\-\s.\d]*$/i;
const GENERIC_MATERIAL_NAME_RE = /^(default|material|mat|lambert|phong|standard|physical|blinn|none|unnamed)[_\-\s.\d]*$/i;

// Common Chinese and English keywords for handles / grips / bails.
const HANDLE_KEYWORDS_ZH_RE = /(把手|提手|拉手|耳把|握把|手柄)/;
const HANDLE_KEYWORDS_EN_RE = /\b(handles?|bails?|ear\s*handles?|side\s*handles?|carry\s*handles?)\b/i;

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\x00-\x1f]/g, '')
    .trim();
}

function splitIdentifierTokens(value) {
  return normalizeText(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-./\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMeaningfulName(name, genericRe) {
  const clean = normalizeText(name);
  return Boolean(clean && !genericRe.test(clean));
}

function findMeaningfulParentName(mesh) {
  let cursor = mesh?.parent;
  let depth = 0;
  while (cursor && depth < 6) {
    if (cursor.isScene) break;
    const candidate = normalizeText(cursor.name);
    if (candidate && isMeaningfulName(candidate, GENERIC_MESH_NAME_RE)) {
      return candidate;
    }
    cursor = cursor.parent;
    depth++;
  }
  return '';
}

function findMeaningfulMaterialName(mesh) {
  const mats = Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
  for (const mat of mats) {
    const candidate = normalizeText(mat?.name);
    if (candidate && isMeaningfulName(candidate, GENERIC_MATERIAL_NAME_RE)) {
      return candidate;
    }
  }
  return '';
}

export function resolvePartLabel(mesh, index, metaParts = null) {
  const metaName = normalizeText(metaParts?.[index]?.label || metaParts?.[index]?.name);
  if (metaName) return metaName;

  const meshName = normalizeText(mesh?.name);
  if (meshName && isMeaningfulName(meshName, GENERIC_MESH_NAME_RE)) {
    return meshName;
  }

  const parentName = findMeaningfulParentName(mesh);
  if (parentName) return parentName;

  const materialName = findMeaningfulMaterialName(mesh);
  if (materialName) return materialName;

  if (meshName) return meshName;
  return `部件 ${index + 1}`;
}

export function matchesHandleKeyword(text) {
  const clean = normalizeText(text);
  if (!clean) return false;
  if (HANDLE_KEYWORDS_ZH_RE.test(clean)) return true;
  const tokenized = splitIdentifierTokens(clean);
  return HANDLE_KEYWORDS_EN_RE.test(tokenized);
}

export function isHandlePart(meshOrLabel) {
  if (typeof meshOrLabel === 'string') return matchesHandleKeyword(meshOrLabel);
  if (!meshOrLabel) return false;
  if (matchesHandleKeyword(meshOrLabel.userData?.partLabel)) return true;
  if (matchesHandleKeyword(meshOrLabel.name)) return true;
  if (matchesHandleKeyword(meshOrLabel.parent?.name)) return true;
  return false;
}

export function findHandleParts(partMeshes) {
  return (partMeshes || []).filter(mesh => isHandlePart(mesh));
}

export function getHandleGroupOption(partMeshes) {
  const handles = findHandleParts(partMeshes);
  if (handles.length < 2) return null;
  return {
    value: 'handles',
    label: `把手 / 提手组（共 ${handles.length} 处一起调色）`,
  };
}

export function getEditTargets(activePart, partMeshes) {
  const list = partMeshes || [];
  if (activePart === 'all') return list;
  if (activePart === 'handles') return findHandleParts(list);
  return list.filter(mesh => mesh.userData?.partKey === activePart);
}
