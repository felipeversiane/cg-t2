import * as THREE from 'three';
import type { BoxSpec } from '../domain/types';
import { createBlockedBadgeSprite } from './label-sprite';

export interface CreateBoxMeshOptions {
  readonly ghost?: boolean;
  readonly invalid?: boolean;
}

export interface BoxMeshUserData {
  boxId: string;
  bodyMaterial: THREE.MeshStandardMaterial;
  edgeMaterial: THREE.LineBasicMaterial;
  baseColorHex: number;
  blockedBadge?: THREE.Sprite;
}

/**
 * Cria um objeto 3D procedural para uma caixa (`BoxGeometry` + bordas destacadas),
 * sem qualquer modelo estático externo.
 */
export function createBoxMesh(
  spec: BoxSpec,
  options: CreateBoxMeshOptions = {},
): THREE.Group {
  const { width, height, depth } = spec.dimensions;
  const group = new THREE.Group();
  group.name = spec.id;

  const geometry = new THREE.BoxGeometry(width, height, depth);
  const color = options.invalid ? 0xff1e42 : spec.colorHex;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.08,
    transparent: Boolean(options.ghost),
    opacity: options.ghost ? (options.invalid ? 0.58 : 0.48) : 1,
    emissive: options.invalid ? new THREE.Color(0xdc2626) : new THREE.Color(0x000000),
    emissiveIntensity: options.invalid ? 0.7 : 0,
    depthWrite: !options.ghost,
  });

  const mesh = new THREE.Mesh(geometry, bodyMaterial);
  mesh.name = `${spec.id}-body`;
  mesh.userData.boxId = spec.id;

  const edges = new THREE.EdgesGeometry(geometry);
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: options.invalid ? 0xffffff : 0x0f172a,
    transparent: Boolean(options.ghost),
    opacity: options.ghost ? 0.95 : 0.72,
  });
  const wireframe = new THREE.LineSegments(edges, edgeMaterial);

  group.add(mesh, wireframe);

  let blockedBadge: THREE.Sprite | undefined;
  if (options.ghost) {
    blockedBadge = createBlockedBadgeSprite();
    blockedBadge.position.set(0, height / 2 + 0.11, 0);
    blockedBadge.visible = Boolean(options.invalid);
    group.add(blockedBadge);
  }

  const userData: BoxMeshUserData = {
    boxId: spec.id,
    bodyMaterial,
    edgeMaterial,
    baseColorHex: spec.colorHex,
    blockedBadge,
  };
  group.userData = userData;

  return group;
}

/** Atualiza aparência de um ghost preview para estado válido ou bloqueado (pulsando em erro). */
export function updateGhostAppearance(
  ghost: THREE.Group,
  invalid: boolean,
  pulsePhase: number,
): void {
  const data = ghost.userData as Partial<BoxMeshUserData>;
  if (!data.bodyMaterial || !data.edgeMaterial || data.baseColorHex === undefined) {
    return;
  }

  if (invalid) {
    const pulse = 0.5 + 0.5 * Math.sin(pulsePhase * 8);
    data.bodyMaterial.color.setHex(0xff1e42);
    data.bodyMaterial.emissive.setHex(0xdc2626);
    data.bodyMaterial.emissiveIntensity = 0.45 + pulse * 0.65;
    data.bodyMaterial.opacity = 0.45 + pulse * 0.3;
    data.edgeMaterial.color.setHex(0xfef08a);
    if (data.blockedBadge) {
      data.blockedBadge.visible = true;
      const scalePulse = 1 + pulse * 0.08;
      data.blockedBadge.scale.set(0.36 * scalePulse, 0.135 * scalePulse, 1);
    }
  } else {
    data.bodyMaterial.color.setHex(data.baseColorHex);
    data.bodyMaterial.emissive.setHex(0x10b981);
    data.bodyMaterial.emissiveIntensity = 0.18;
    data.bodyMaterial.opacity = 0.52;
    data.edgeMaterial.color.setHex(0xecfdf5);
    if (data.blockedBadge) {
      data.blockedBadge.visible = false;
    }
  }
}

/** Destaca uma caixa já empilhada que está causando conflito (ex.: caixa Azul sob caixa Vermelha). */
export function setBoxConflictHighlight(
  boxGroup: THREE.Group,
  conflicting: boolean,
  pulsePhase: number,
): void {
  const data = boxGroup.userData as Partial<BoxMeshUserData>;
  if (!data.bodyMaterial || !data.edgeMaterial) {
    return;
  }

  if (conflicting) {
    const pulse = 0.5 + 0.5 * Math.sin(pulsePhase * 10);
    data.bodyMaterial.emissive.setHex(0xff1e42);
    data.bodyMaterial.emissiveIntensity = 0.4 + pulse * 0.7;
    data.edgeMaterial.color.setHex(0xfef08a);
  } else {
    data.bodyMaterial.emissive.setHex(0x000000);
    data.bodyMaterial.emissiveIntensity = 0;
    data.edgeMaterial.color.setHex(0x0f172a);
  }
}

/** Libera geometrias e materiais ao descartar uma caixa 3D. */
export function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.dispose();
      }
    } else if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    }
  });
}
