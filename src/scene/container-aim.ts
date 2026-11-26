import * as THREE from 'three';
import type { ContainerBounds } from '../domain/types';

const _invMatrix = new THREE.Matrix4();
const _localRay = new THREE.Ray();
const _floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _planeHit = new THREE.Vector3();

export interface ContainerAimResult {
  readonly localX: number;
  readonly localZ: number;
}

/**
 * Projeta continuamente onde o celular/mouse está apontando diretamente no plano
 * horizontal (y = 0) do container ancorado.
 *
 * Usar um único plano contínuo elimina 100% os saltos bruscos de paralaxe que ocorrem
 * quando o raio sai da borda de uma caixa alta e cai no chão muito atrás dela.
 * A altura (Y) de empilhamento é resolvida de forma suave por `computeRestingCenterY`.
 */
export function resolveContainerAim(
  raycaster: THREE.Raycaster,
  containerRoot: THREE.Object3D,
  bounds: ContainerBounds,
  outerMargin = 0.2,
): ContainerAimResult | null {
  containerRoot.updateMatrixWorld(true);

  _invMatrix.copy(containerRoot.matrixWorld).invert();
  _localRay.copy(raycaster.ray).applyMatrix4(_invMatrix);

  // Ignora raios quase paralelos ou apontando para cima (evita disparos para o infinito / parede do fundo)
  if (_localRay.direction.y > -0.12) {
    return null;
  }

  const hit = _localRay.intersectPlane(_floorPlane, _planeHit);
  if (!hit) {
    return null;
  }

  const dist = _localRay.origin.distanceTo(_planeHit);
  if (dist > 5.5) {
    return null;
  }

  const maxX = bounds.width / 2 + outerMargin;
  const maxZ = bounds.depth / 2 + outerMargin;

  // Só rastreia enquanto a mira estiver próxima à área do container
  if (Math.abs(_planeHit.x) > maxX + 0.85 || Math.abs(_planeHit.z) > maxZ + 0.85) {
    return null;
  }

  return {
    localX: THREE.MathUtils.clamp(_planeHit.x, -maxX, maxX),
    localZ: THREE.MathUtils.clamp(_planeHit.z, -maxZ, maxZ),
  };
}

/**
 * Move `current` em direção a `target` com suavização exponencial E limite máximo
 * de deslocamento por frame, impedindo teleporte súbito em qualquer condição.
 */
export function smoothAxis(
  current: number,
  target: number,
  dt: number,
  speed = 18,
  maxStepPerSec = 2.4,
): number {
  const safeDt = Math.max(0.001, Math.min(0.05, dt));
  const alpha = 1 - Math.exp(-speed * safeDt);
  const delta = (target - current) * alpha;
  const maxDelta = maxStepPerSec * safeDt;
  return current + THREE.MathUtils.clamp(delta, -maxDelta, maxDelta);
}

/** Cria a projeção luminosa da base da caixa no plano de pouso para percepção de profundidade em AR. */
export function createLandingFootprint(): THREE.LineSegments {
  const geom = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.002, 1));
  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
  });
  const lines = new THREE.LineSegments(geom, mat);
  lines.visible = false;
  return lines;
}

/**
 * Identifica o ID da caixa posicionada diretamente sob o raio da câmera/mouse,
 * testando apenas os corpos sólidos (`THREE.Mesh`) e ignorando wireframes (`LineSegments`).
 */
export function findAimedBoxId(
  raycaster: THREE.Raycaster,
  boxMeshes: ReadonlyMap<string, THREE.Group>,
): string | null {
  const bodies: THREE.Object3D[] = [];
  for (const group of boxMeshes.values()) {
    for (const child of group.children) {
      if (child instanceof THREE.Mesh) {
        bodies.push(child);
      }
    }
  }

  if (bodies.length === 0) {
    return null;
  }

  const hits = raycaster.intersectObjects(bodies, false);
  const firstHit = hits[0];
  if (!firstHit) {
    return null;
  }

  return (firstHit.object.userData.boxId as string | undefined) ?? null;
}
