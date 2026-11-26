/**
 * Categorias de caixa definidas pelo volume V = largura * altura * profundidade.
 * - red:   V > X       (tier 3 — maior volume / base)
 * - green: Y < V <= X  (tier 2 — volume intermediário)
 * - blue:  V <= Y      (tier 1 — menor volume / topo)
 */
export type BoxCategory = 'red' | 'green' | 'blue';

export type AppMode = 'pallet' | 'truck-bed';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Dimensões em metros (largura = X, altura = Y, profundidade = Z). */
export interface BoxDimensions {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/** Especificação de uma caixa gerada randomicamente antes de ser posicionada. */
export interface BoxSpec {
  readonly id: string;
  readonly dimensions: BoxDimensions;
  readonly volume: number;
  readonly category: BoxCategory;
  readonly colorHex: number;
  readonly colorCss: string;
}

/** Caixa já alocada no espaço local do container (palete ou caçamba). */
export interface PlacedBox extends BoxSpec {
  /** Centro geométrico da caixa em coordenadas locais do container (metros). */
  readonly position: Vec3;
}

/** Limites úteis do container (origem no centro do piso: X ∈ [-W/2, W/2], Z ∈ [-D/2, D/2], Y ∈ [0, H]). */
export interface ContainerBounds {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export interface VolumeThresholds {
  /** Limiar inferior Y (m³): V <= Y => Azul. */
  readonly y: number;
  /** Limiar superior X (m³): V > X => Vermelho; Y < V <= X => Verde. */
  readonly x: number;
}

export interface DimensionRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface AxisAlignedBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export type PlacementErrorCode =
  | 'OUT_OF_BOUNDS_X'
  | 'OUT_OF_BOUNDS_Z'
  | 'BELOW_FLOOR'
  | 'EXCEEDS_MAX_HEIGHT'
  | 'COLLISION'
  | 'INSUFFICIENT_SUPPORT'
  | 'INVALID_COLOR_STACK';

export interface PlacementValidation {
  readonly valid: boolean;
  readonly reasons: readonly PlacementErrorCode[];
  /** IDs das caixas que causaram conflito (colisão ou violação da regra de cores). */
  readonly conflictingBoxIds: readonly string[];
  /** IDs das caixas que dão apoio sob a face inferior da caixa candidata. */
  readonly supportingBoxIds: readonly string[];
  /** Fração [0, 1] da área da base apoiada (1 quando está diretamente no piso). */
  readonly supportRatio: number;
}

export interface CubingMetrics {
  readonly containerVolume: number;
  readonly occupiedVolume: number;
  readonly occupancyPercent: number;
  readonly totalBoxes: number;
  readonly countByCategory: Readonly<Record<BoxCategory, number>>;
}

/** Zona/marcador espacial de alocação e picking dentro da caçamba do caminhão (Módulo B). */
export interface TruckZone {
  readonly id: string;
  readonly label: string;
  readonly centerX: number;
  readonly centerZ: number;
  readonly width: number;
  readonly depth: number;
}

export interface ZoneEvaluation {
  readonly zone: TruckZone;
  readonly candidate: PlacedBox;
  readonly validation: PlacementValidation;
}
