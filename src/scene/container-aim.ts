import * as THREE from 'three';
import type { ContainerBounds } from '../domain/types';

const _invMatrix = new THREE.Matrix4();
const _localRay = new THREE.Ray();
const _floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _planeHit = new THREE.Vector3();
const _worldHit = new THREE.Vector3();
const _worldNormal = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();

export interface ContainerAimResult {
  readonly localX: number;
  readonly localZ: number;
  readonly hitBoxId: string | null;
}

/**
 * Resolve o ponto local (X, Z) no container onde o celular/mouse está apontando.
 * - Testa primeiro apenas as malhas sólidas das caixas (NUNCA LineSegments/wireframes!).
 * - Caso não atinja uma caixa, intercepta matematicamente o plano do piso (y = 0) do container.
 * - Limita suavemente a uma margem externa para a caixa continuar acompanhando a mira
 *   sem desaparecer e ainda sinalizar quando sair dos limites laterais.
 */
export function resolveContainerAim(
  raycaster: THREE.Raycaster,
  containerRoot: THREE.Object3D,
  boxBodyMeshes: THREE.Object3D[],
  bounds: ContainerBounds,
  outerMargin = 0.22,
): ContainerAimResult | null {
  containerRoot.updateMatrixWorld(true);

  const maxX = bounds.width / 2 + outerMargin;
  const maxZ = bounds.depth / 2 + outerMargin;

  // 1. Raycast direto apenas contra os corpos sólidos das caixas (recursive = false)
  if (boxBodyMeshes.length > 0) {
    const boxHits = raycaster.intersectObjects(boxBodyMeshes, false);
    const firstBoxHit = boxHits[0];
    if (firstBoxHit) {
      _worldHit.copy(firstBoxHit.point);

      // Se atingiu face lateral em ângulo inclinado, empurra 3 cm para dentro da caixa atingida
      if (firstBoxHit.face) {
        _normalMatrix.getNormalMatrix(firstBoxHit.object.matrixWorld);
        _worldNormal.copy(firstBoxHit.face.normal).applyMatrix3(_normalMatrix).normalize();
        if (Math.abs(_worldNormal.y) < 0.5) {
          _worldHit.addScaledVector(_worldNormal, -0.03);
        }
      }

      const local = containerRoot.worldToLocal(_worldHit);
      return {
        localX: THREE.MathUtils.clamp(local.x, -maxX, maxX),
        localZ: THREE.MathUtils.clamp(local.z, -maxZ, maxZ),
        hitBoxId: (firstBoxHit.object.userData.boxId as string | undefined) ?? null,
      };
    }
  }

  // 2. Interseção matemática exata com o plano horizontal y = 0 do container
  _invMatrix.copy(containerRoot.matrixWorld).invert();
  _localRay.copy(raycaster.ray).applyMatrix4(_invMatrix);

  const hit = _localRay.intersectPlane(_floorPlane, _planeHit);
  if (!hit) {
    return null;
  }

  const dist = _localRay.origin.distanceTo(_planeHit);
  if (dist > 8) {
    return null;
  }

  // Só ativa se o usuário estiver mirando na direção geral do container
  if (Math.abs(_planeHit.x) > maxX + 1.2 || Math.abs(_planeHit.z) > maxZ + 1.2) {
    return null;
  }

  return {
    localX: THREE.MathUtils.clamp(_planeHit.x, -maxX, maxX),
    localZ: THREE.MathUtils.clamp(_planeHit.z, -maxZ, maxZ),
    hitBoxId: null,
  };
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
