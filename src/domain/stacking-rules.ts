import { CATEGORY_CONFIG, GEOMETRY_EPSILON, MIN_SUPPORT_RATIO } from './config';
import type {
  AxisAlignedBounds,
  BoxCategory,
  BoxSpec,
  ContainerBounds,
  CubingMetrics,
  PlacedBox,
  PlacementErrorCode,
  PlacementValidation,
  TruckZone,
  ZoneEvaluation,
} from './types';

/**
 * Regra obrigatória do enunciado:
 * - Mesma cor pode empilhar sobre mesma cor.
 * - Azul (tier 1) pode ficar sobre Azul (1), Verde (2) ou Vermelho (3).
 * - Verde (tier 2) pode ficar sobre Verde (2) ou Vermelho (3).
 * - Vermelho (tier 3) só pode ficar sobre Vermelho (3) ou na base.
 */
export function canStackCategory(above: BoxCategory, below: BoxCategory): boolean {
  return CATEGORY_CONFIG[above].tier <= CATEGORY_CONFIG[below].tier;
}

export function getBoxBounds(box: PlacedBox): AxisAlignedBounds {
  const halfW = box.dimensions.width / 2;
  const halfH = box.dimensions.height / 2;
  const halfD = box.dimensions.depth / 2;

  return {
    minX: box.position.x - halfW,
    maxX: box.position.x + halfW,
    minY: box.position.y - halfH,
    maxY: box.position.y + halfH,
    minZ: box.position.z - halfD,
    maxZ: box.position.z + halfD,
  };
}

export function hasAABBCollision(
  a: AxisAlignedBounds,
  b: AxisAlignedBounds,
  epsilon = GEOMETRY_EPSILON,
): boolean {
  return (
    a.minX < b.maxX - epsilon &&
    a.maxX > b.minX + epsilon &&
    a.minY < b.maxY - epsilon &&
    a.maxY > b.minY + epsilon &&
    a.minZ < b.maxZ - epsilon &&
    a.maxZ > b.minZ + epsilon
  );
}

function horizontalOverlapArea(a: AxisAlignedBounds, b: AxisAlignedBounds): number {
  const overlapX = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const overlapZ = Math.max(0, Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ));
  return overlapX * overlapZ;
}

export interface ValidatePlacementOptions {
  readonly minSupportRatio?: number;
  readonly epsilon?: number;
}

/**
 * Valida se `candidate` pode ser posicionada no container considerando:
 * 1. Limites físicos do container (largura, profundidade, piso e altura máxima)
 * 2. Colisão 3D (AABB) com caixas já alocadas
 * 3. Área mínima de apoio (quando acima do piso)
 * 4. Regra de cores/volume com todas as caixas de apoio sob a base
 */
export function validatePlacement(
  candidate: PlacedBox,
  placedBoxes: readonly PlacedBox[],
  container: ContainerBounds,
  options: ValidatePlacementOptions = {},
): PlacementValidation {
  const epsilon = options.epsilon ?? GEOMETRY_EPSILON;
  const minSupportRatio = options.minSupportRatio ?? MIN_SUPPORT_RATIO;

  const reasons = new Set<PlacementErrorCode>();
  const conflictingBoxIds = new Set<string>();
  const supportingBoxIds: string[] = [];

  const bounds = getBoxBounds(candidate);
  const halfContainerW = container.width / 2;
  const halfContainerD = container.depth / 2;

  if (bounds.minX < -halfContainerW - epsilon || bounds.maxX > halfContainerW + epsilon) {
    reasons.add('OUT_OF_BOUNDS_X');
  }

  if (bounds.minZ < -halfContainerD - epsilon || bounds.maxZ > halfContainerD + epsilon) {
    reasons.add('OUT_OF_BOUNDS_Z');
  }

  if (bounds.minY < -epsilon) {
    reasons.add('BELOW_FLOOR');
  }

  if (bounds.maxY > container.height + epsilon) {
    reasons.add('EXCEEDS_MAX_HEIGHT');
  }

  let supportedArea = 0;
  const candidateBaseArea = candidate.dimensions.width * candidate.dimensions.depth;
  const isOnFloor = Math.abs(bounds.minY) <= epsilon;

  for (const existing of placedBoxes) {
    const existingBounds = getBoxBounds(existing);

    if (hasAABBCollision(bounds, existingBounds, epsilon)) {
      reasons.add('COLLISION');
      conflictingBoxIds.add(existing.id);
      continue;
    }

    if (!isOnFloor && Math.abs(existingBounds.maxY - bounds.minY) <= epsilon * 2) {
      const overlap = horizontalOverlapArea(bounds, existingBounds);
      if (overlap > epsilon * epsilon) {
        supportingBoxIds.push(existing.id);
        supportedArea += overlap;

        if (!canStackCategory(candidate.category, existing.category)) {
          reasons.add('INVALID_COLOR_STACK');
          conflictingBoxIds.add(existing.id);
        }
      }
    }
  }

  const supportRatio = isOnFloor
    ? 1
    : Math.min(1, candidateBaseArea > 0 ? supportedArea / candidateBaseArea : 0);

  if (!isOnFloor && supportRatio + epsilon < minSupportRatio) {
    reasons.add('INSUFFICIENT_SUPPORT');
  }

  return {
    valid: reasons.size === 0,
    reasons: [...reasons],
    conflictingBoxIds: [...conflictingBoxIds],
    supportingBoxIds,
    supportRatio,
  };
}

/**
 * Calcula a cota Y de repouso (centro geométrico da caixa) sobre o piso ou sobre a caixa mais alta
 * cuja projeção horizontal intercepta a caixa candidata em (x, z).
 */
export function computeRestingCenterY(
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  placedBoxes: readonly PlacedBox[],
  epsilon = GEOMETRY_EPSILON,
): number {
  const probeBounds: AxisAlignedBounds = {
    minX: x - width / 2,
    maxX: x + width / 2,
    minY: 0,
    maxY: height,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  };

  let highestSurfaceY = 0;

  for (const existing of placedBoxes) {
    const existingBounds = getBoxBounds(existing);
    if (horizontalOverlapArea(probeBounds, existingBounds) > epsilon * epsilon) {
      highestSurfaceY = Math.max(highestSurfaceY, existingBounds.maxY);
    }
  }

  return highestSurfaceY + height / 2;
}

/**
 * Verifica se `box` é uma "caixa do topo", ou seja, se NÃO existe nenhuma outra caixa
 * apoiada diretamente sobre sua face superior. Apenas caixas do topo podem ser selecionadas
 * e movidas sem derrubar a pilha.
 */
export function isTopBox(
  box: PlacedBox,
  placedBoxes: readonly PlacedBox[],
  epsilon = GEOMETRY_EPSILON,
): boolean {
  const boxBounds = getBoxBounds(box);

  for (const other of placedBoxes) {
    if (other.id === box.id) {
      continue;
    }

    const otherBounds = getBoxBounds(other);
    const restsOnTopPlane = Math.abs(otherBounds.minY - boxBounds.maxY) <= epsilon * 2;
    if (restsOnTopPlane && horizontalOverlapArea(boxBounds, otherBounds) > epsilon * epsilon) {
      return false;
    }
  }

  return true;
}

/** Retorna os IDs de todas as caixas que estão no topo (livres para serem selecionadas/movidas). */
export function getTopBoxIds(
  placedBoxes: readonly PlacedBox[],
  epsilon = GEOMETRY_EPSILON,
): readonly string[] {
  return placedBoxes.filter((box) => isTopBox(box, placedBoxes, epsilon)).map((box) => box.id);
}

export function calculateCubingMetrics(
  placedBoxes: readonly PlacedBox[],
  container: ContainerBounds,
): CubingMetrics {
  const containerVolume = container.width * container.height * container.depth;
  let occupiedVolume = 0;
  const countByCategory: Record<BoxCategory, number> = {
    red: 0,
    green: 0,
    blue: 0,
  };

  for (const box of placedBoxes) {
    occupiedVolume += box.volume;
    countByCategory[box.category] += 1;
  }

  const occupancyPercent =
    containerVolume > 0 ? Math.min(100, (occupiedVolume / containerVolume) * 100) : 0;

  return {
    containerVolume,
    occupiedVolume,
    occupancyPercent,
    totalBoxes: placedBoxes.length,
    countByCategory,
  };
}

/** Gera a grade de zonas/marcadores espaciais dentro da caçamba do caminhão (2 colunas x 3 linhas = Z1..Z6). */
export function createTruckZones(
  bounds: ContainerBounds,
  cols = 2,
  rows = 3,
): readonly TruckZone[] {
  const zones: TruckZone[] = [];
  const cellW = bounds.width / cols;
  const cellD = bounds.depth / rows;

  let index = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const centerX = -bounds.width / 2 + cellW * (c + 0.5);
      const centerZ = -bounds.depth / 2 + cellD * (r + 0.5);
      const label = `Z${index}`;
      zones.push({
        id: label.toLowerCase(),
        label,
        centerX: Number(centerX.toFixed(4)),
        centerZ: Number(centerZ.toFixed(4)),
        width: Number(cellW.toFixed(4)),
        depth: Number(cellD.toFixed(4)),
      });
      index += 1;
    }
  }

  return zones;
}

/** Localiza qual zona/marcador da caçamba contém a coordenada local (x, z). */
export function findZoneAt(
  zones: readonly TruckZone[],
  localX: number,
  localZ: number,
): TruckZone | null {
  for (const zone of zones) {
    const halfW = zone.width / 2;
    const halfD = zone.depth / 2;
    if (
      localX >= zone.centerX - halfW &&
      localX <= zone.centerX + halfW &&
      localZ >= zone.centerZ - halfD &&
      localZ <= zone.centerZ + halfD
    ) {
      return zone;
    }
  }
  return null;
}

/** Avalia todas as zonas da caçamba para a caixa atual, permitindo sugerir zonas válidas no picking guiado. */
export function evaluateTruckZones(
  spec: BoxSpec,
  placedBoxes: readonly PlacedBox[],
  bounds: ContainerBounds,
  zones: readonly TruckZone[],
): readonly ZoneEvaluation[] {
  return zones.map((zone) => {
    const centerY = computeRestingCenterY(
      zone.centerX,
      zone.centerZ,
      spec.dimensions.width,
      spec.dimensions.height,
      spec.dimensions.depth,
      placedBoxes,
    );

    const candidate: PlacedBox = {
      ...spec,
      position: { x: zone.centerX, y: centerY, z: zone.centerZ },
    };

    const validation = validatePlacement(candidate, placedBoxes, bounds);
    return { zone, candidate, validation };
  });
}

export function describePlacementError(code: PlacementErrorCode): string {
  switch (code) {
    case 'INVALID_COLOR_STACK':
      return 'Empilhamento proibido pela regra de cor/volume.';
    case 'EXCEEDS_MAX_HEIGHT':
      return 'Altura ultrapassa o limite superior do container.';
    case 'OUT_OF_BOUNDS_X':
    case 'OUT_OF_BOUNDS_Z':
      return 'Caixa extrapola os limites laterais do container.';
    case 'BELOW_FLOOR':
      return 'Posição abaixo da base do container.';
    case 'COLLISION':
      return 'Colisão detectada com outra caixa já alocada.';
    case 'INSUFFICIENT_SUPPORT':
      return 'Base sem apoio suficiente para empilhamento seguro.';
  }
}

/** Gera diagnóstico legível e específico para exibir no HUD quando o empilhamento for bloqueado. */
export function describeDetailedValidation(
  candidate: PlacedBox,
  validation: PlacementValidation,
  placedBoxes: readonly PlacedBox[],
  container: ContainerBounds,
): string {
  if (validation.valid) {
    return 'Posição válida para empilhamento.';
  }

  const candidateLabel = CATEGORY_CONFIG[candidate.category].shortLabel;
  const candidateLiters = (candidate.volume * 1000).toFixed(1);

  if (validation.reasons.includes('INVALID_COLOR_STACK')) {
    const conflictingBoxes = placedBoxes.filter(
      (box) =>
        validation.conflictingBoxIds.includes(box.id) &&
        !canStackCategory(candidate.category, box.category),
    );
    const belowBox = conflictingBoxes[0];
    if (belowBox) {
      const belowLabel = CATEGORY_CONFIG[belowBox.category].shortLabel;
      const belowLiters = (belowBox.volume * 1000).toFixed(1);
      return `Caixa ${candidateLabel} (${candidateLiters} L) não pode ser empilhada sobre Caixa ${belowLabel} (${belowLiters} L).`;
    }
    return `Caixa ${candidateLabel} viola a hierarquia de cores/volume.`;
  }

  if (validation.reasons.includes('EXCEEDS_MAX_HEIGHT')) {
    const topY = candidate.position.y + candidate.dimensions.height / 2;
    return `Altura final (${topY.toFixed(2)} m) excede o limite de ${container.height.toFixed(2)} m.`;
  }

  if (
    validation.reasons.includes('OUT_OF_BOUNDS_X') ||
    validation.reasons.includes('OUT_OF_BOUNDS_Z')
  ) {
    return 'Caixa ultrapassa as paredes/limites da área útil.';
  }

  if (validation.reasons.includes('INSUFFICIENT_SUPPORT')) {
    const pct = Math.round(validation.supportRatio * 100);
    return `Base instável: apenas ${pct}% apoiado (mínimo 60%).`;
  }

  if (validation.reasons.includes('COLLISION')) {
    return 'Sobreposição/colisão com caixa já posicionada.';
  }

  const first = validation.reasons[0];
  return first ? describePlacementError(first) : 'Não é possível empilhar nesta posição.';
}
