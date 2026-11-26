import type {
  BoxCategory,
  ContainerBounds,
  DimensionRange,
  VolumeThresholds,
} from './types';

/** Tolerância geométrica (1 mm) para comparações de ponto flutuante em metros. */
export const GEOMETRY_EPSILON = 0.001;

/** Fração mínima da área da base apoiada para considerar um empilhamento estável. */
export const MIN_SUPPORT_RATIO = 0.6;

/**
 * Faixa randômica de dimensões (metros) calibrada para testes em mesas e pisos via WebXR:
 * - Volume mínimo: 0.16³ ≈ 0.0041 m³ (4.1 L)
 * - Volume máximo: 0.42³ ≈ 0.0741 m³ (74.1 L)
 */
export const DEFAULT_DIMENSION_RANGE: DimensionRange = {
  min: 0.16,
  max: 0.42,
  step: 0.02,
};

/**
 * Limiares de volume (m³):
 * - Azul:     V <= 0.020 m³ (<= 20 L)
 * - Verde:    0.020 < V <= 0.042 m³ (20 L a 42 L)
 * - Vermelho: V > 0.042 m³ (> 42 L)
 */
export const DEFAULT_VOLUME_THRESHOLDS: VolumeThresholds = {
  y: 0.02,
  x: 0.042,
};

/** Dimensões úteis padrão do palete (Módulo A) em metros (escala amigável para AR). */
export const DEFAULT_PALLET_BOUNDS: ContainerBounds = {
  width: 1.0,
  height: 1.1,
  depth: 0.8,
};

/** Dimensões úteis padrão da caçamba de caminhão (Módulo B) em metros (escala amigável para AR). */
export const DEFAULT_TRUCK_BED_BOUNDS: ContainerBounds = {
  width: 0.96,
  height: 0.85,
  depth: 1.44,
};

export interface CategoryVisualConfig {
  readonly label: string;
  readonly shortLabel: string;
  readonly allowedBaseHint: string;
  readonly tier: number;
  readonly colorHex: number;
  readonly colorCss: string;
}

export const CATEGORY_CONFIG: Readonly<Record<BoxCategory, CategoryVisualConfig>> = {
  blue: {
    label: 'Azul (Pequena)',
    shortLabel: 'Azul',
    allowedBaseHint: 'Base, Vermelha, Verde ou Azul',
    tier: 1,
    colorHex: 0x3b82f6,
    colorCss: '#3b82f6',
  },
  green: {
    label: 'Verde (Média)',
    shortLabel: 'Verde',
    allowedBaseHint: 'Base, Vermelha ou Verde',
    tier: 2,
    colorHex: 0x22c55e,
    colorCss: '#22c55e',
  },
  red: {
    label: 'Vermelha (Grande)',
    shortLabel: 'Vermelha',
    allowedBaseHint: 'Apenas Base ou Vermelha',
    tier: 3,
    colorHex: 0xef4444,
    colorCss: '#ef4444',
  },
};
