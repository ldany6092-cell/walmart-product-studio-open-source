import * as THREE from 'three';

export const IDENTITY_QUATERNION = Object.freeze([0, 0, 0, 1]);

const AXIS_VECTORS = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

function snapZeroOrHalf(value) {
  const candidates = [-1, -Math.SQRT1_2, -0.5, 0, 0.5, Math.SQRT1_2, 1];
  for (const c of candidates) {
    if (Math.abs(value - c) < 1e-4) return c;
  }
  return value;
}

export function normalizeOrientation(raw) {
  const arr = raw?.quaternion;
  if (Array.isArray(arr) && arr.length === 4 && arr.every(Number.isFinite)) {
    const q = new THREE.Quaternion(arr[0], arr[1], arr[2], arr[3]);
    if (q.lengthSq() > 1e-8) {
      q.normalize();
      return {
        quaternion: [
          snapZeroOrHalf(q.x),
          snapZeroOrHalf(q.y),
          snapZeroOrHalf(q.z),
          snapZeroOrHalf(q.w),
        ],
      };
    }
  }
  return { quaternion: [...IDENTITY_QUATERNION] };
}

export function isIdentityOrientation(orientation) {
  const q = normalizeOrientation(orientation).quaternion;
  return Math.abs(q[3]) > 0.9999 && Math.hypot(q[0], q[1], q[2]) < 1e-4;
}

// World-space axis rotation (intuitive turntable / tilt / roll regardless of prior rotations).
export function rotateOrientationByAxis(orientation, axis, degrees) {
  const axisVec = AXIS_VECTORS[axis];
  if (!axisVec) return normalizeOrientation(orientation);
  const current = normalizeOrientation(orientation).quaternion;
  const q = new THREE.Quaternion(...current);
  const delta = new THREE.Quaternion().setFromAxisAngle(axisVec, THREE.MathUtils.degToRad(degrees));
  q.premultiply(delta).normalize();
  return normalizeOrientation({ quaternion: [q.x, q.y, q.z, q.w] });
}

export function orientationToDegrees(orientation) {
  const q = new THREE.Quaternion(...normalizeOrientation(orientation).quaternion);
  const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  const normDeg = rad => {
    let deg = Math.round(THREE.MathUtils.radToDeg(rad));
    deg = ((deg + 180) % 360 + 360) % 360 - 180;
    return deg === -180 ? 180 : (Object.is(deg, -0) ? 0 : deg);
  };
  return [normDeg(euler.x), normDeg(euler.y), normDeg(euler.z)];
}

export function formatOrientationSummary(orientation) {
  const [x, y, z] = orientationToDegrees(orientation);
  return `X ${x}° · Y ${y}° · Z ${z}°`;
}

// Mounts contentRoot inside a clean [outerGroup -> pivotGroup -> contentRoot] hierarchy,
// applies default orientation, normalizes scale, and aligns base strictly flush with y = 0 (ground plane).
export function mountAndGroundModel(contentRoot, orientation, { targetSpan = 2.4, sourceSpanCM } = {}) {
  const norm = normalizeOrientation(orientation);

  // Cache raw geometric center once so repeated loads/rotations never accumulate position drift.
  if (!contentRoot.userData.__rawCenter) {
    contentRoot.position.set(0, 0, 0);
    contentRoot.rotation.set(0, 0, 0);
    contentRoot.scale.set(1, 1, 1);
    contentRoot.updateMatrixWorld(true);
    const rawBox = new THREE.Box3().setFromObject(contentRoot);
    contentRoot.userData.__rawCenter = rawBox.getCenter(new THREE.Vector3()).toArray();
  }

  contentRoot.position.fromArray(contentRoot.userData.__rawCenter).negate();
  contentRoot.rotation.set(0, 0, 0);
  contentRoot.scale.set(1, 1, 1);

  const pivot = new THREE.Group();
  pivot.name = '__orientationPivot';
  pivot.quaternion.fromArray(norm.quaternion);
  pivot.add(contentRoot);

  const outer = new THREE.Group();
  outer.name = '__groundedModelRoot';
  outer.add(pivot);
  outer.updateMatrixWorld(true);

  const rotatedBox = new THREE.Box3().setFromObject(outer);
  const rotatedSize = rotatedBox.getSize(new THREE.Vector3());
  const span = Math.max(rotatedSize.x, rotatedSize.y, rotatedSize.z);
  const safeSpan = Number.isFinite(span) && span > 0 ? span : 1;

  const measuredDimensions = Number.isFinite(span) && span > 0 && Number.isFinite(sourceSpanCM) && sourceSpanCM > 0
    ? [rotatedSize.x, rotatedSize.y, rotatedSize.z].map(v => (v * sourceSpanCM) / span)
    : undefined;

  outer.scale.setScalar(targetSpan / safeSpan);
  outer.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(outer);
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
  // Center horizontally on X/Z and place bottom strictly flush on y = 0 ground plane.
  outer.position.set(-scaledCenter.x, -scaledBox.min.y, -scaledCenter.z);
  outer.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(outer);
  const groundTargetY = bounds.getCenter(new THREE.Vector3()).y;

  return {
    model: outer,
    pivot,
    bounds,
    groundTargetY,
    measuredDimensions,
  };
}
