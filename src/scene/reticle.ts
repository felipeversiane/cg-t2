import * as THREE from 'three';

/**
 * Cria o retículo 3D posicionado pelo Hit Testing sobre superfícies reais.
 * `matrixAutoUpdate = false` permite aplicar diretamente a matriz da pose WebXR.
 */
export function createReticle(): THREE.Group {
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.visible = false;

  const outerRingGeometry = new THREE.RingGeometry(0.085, 0.108, 40).rotateX(-Math.PI / 2);
  const outerRingMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const outerRing = new THREE.Mesh(outerRingGeometry, outerRingMaterial);
  outerRing.name = 'reticle-ring';

  const innerRingGeometry = new THREE.RingGeometry(0.04, 0.05, 32).rotateX(-Math.PI / 2);
  const innerRingMaterial = new THREE.MeshBasicMaterial({
    color: 0xa1a1aa,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const innerRing = new THREE.Mesh(innerRingGeometry, innerRingMaterial);

  const dotGeometry = new THREE.CircleGeometry(0.012, 16).rotateX(-Math.PI / 2);
  const dotMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  const dot = new THREE.Mesh(dotGeometry, dotMaterial);

  group.add(outerRing, innerRing, dot);
  return group;
}

export function animateReticle(reticle: THREE.Group, timeSec: number): void {
  const ring = reticle.getObjectByName('reticle-ring');
  if (ring) {
    const scale = 1 + 0.08 * Math.sin(timeSec * 5);
    ring.scale.set(scale, 1, scale);
  }
}
