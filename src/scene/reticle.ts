import * as THREE from 'three';

/**
 * Cria o retículo 3D posicionado pelo Hit Testing sobre superfícies reais,
 * incluindo o contorno em escala real da base do Palete ou Caçamba antes de ancorar.
 */
export function createReticle(): THREE.Group {
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.visible = false;

  const outerRingGeometry = new THREE.RingGeometry(0.065, 0.085, 40).rotateX(-Math.PI / 2);
  const outerRingMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const outerRing = new THREE.Mesh(outerRingGeometry, outerRingMaterial);
  outerRing.name = 'reticle-ring';

  const dotGeometry = new THREE.CircleGeometry(0.012, 16).rotateX(-Math.PI / 2);
  const dotMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  const dot = new THREE.Mesh(dotGeometry, dotMaterial);

  const footprint = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.002, 0.8)),
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
    }),
  );
  footprint.name = 'reticle-footprint';
  footprint.position.y = 0.004;

  group.add(outerRing, dot, footprint);
  return group;
}

/** Atualiza o contorno do retículo para mostrar exatamente o tamanho do Palete ou da Caçamba. */
export function setReticleFootprint(reticle: THREE.Group, width: number, depth: number): void {
  const footprint = reticle.getObjectByName('reticle-footprint');
  if (footprint) {
    footprint.scale.set(width, 1, depth / 0.8);
  }
}

export function animateReticle(reticle: THREE.Group, timeSec: number): void {
  const ring = reticle.getObjectByName('reticle-ring');
  if (ring) {
    const scale = 1 + 0.08 * Math.sin(timeSec * 5);
    ring.scale.set(scale, 1, scale);
  }
}
