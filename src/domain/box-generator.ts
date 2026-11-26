import {
  CATEGORY_CONFIG,
  DEFAULT_DIMENSION_RANGE,
  DEFAULT_VOLUME_THRESHOLDS,
} from './config';
import type {
  BoxCategory,
  BoxDimensions,
  BoxSpec,
  DimensionRange,
  VolumeThresholds,
} from './types';

let boxSequence = 0;

export function calculateVolume(dimensions: BoxDimensions): number {
  return dimensions.width * dimensions.height * dimensions.depth;
}

/**
 * Classifica a caixa pela cor segundo o volume V:
 * - Vermelho: V > X
 * - Verde:    Y < V <= X
 * - Azul:     V <= Y
 */
export function classifyBoxByVolume(
  volume: number,
  thresholds: VolumeThresholds = DEFAULT_VOLUME_THRESHOLDS,
): BoxCategory {
  if (thresholds.y <= 0 || thresholds.x <= thresholds.y) {
    throw new RangeError('Limiares de volume inválidos: é necessário 0 < Y < X.');
  }

  if (volume > thresholds.x) {
    return 'red';
  }
  if (volume > thresholds.y) {
    return 'green';
  }
  return 'blue';
}

function sampleAxis(range: DimensionRange, rng: () => number): number {
  const steps = Math.max(1, Math.round((range.max - range.min) / range.step));
  const index = Math.floor(Math.min(0.999999, Math.max(0, rng())) * (steps + 1));
  return Number((range.min + index * range.step).toFixed(4));
}

export function createBoxSpec(
  dimensions: BoxDimensions,
  thresholds: VolumeThresholds = DEFAULT_VOLUME_THRESHOLDS,
  id?: string,
): BoxSpec {
  const volume = calculateVolume(dimensions);
  const category = classifyBoxByVolume(volume, thresholds);
  const visual = CATEGORY_CONFIG[category];

  return {
    id: id ?? `box-${++boxSequence}`,
    dimensions,
    volume,
    category,
    colorHex: visual.colorHex,
    colorCss: visual.colorCss,
  };
}

export interface GenerateBoxOptions {
  readonly range?: DimensionRange;
  readonly thresholds?: VolumeThresholds;
  readonly rng?: () => number;
  readonly id?: string;
}

/** Gera uma caixa com largura, altura e profundidade randômicas e cor definida pelo volume. */
export function generateRandomBox(options: GenerateBoxOptions = {}): BoxSpec {
  const range = options.range ?? DEFAULT_DIMENSION_RANGE;
  const thresholds = options.thresholds ?? DEFAULT_VOLUME_THRESHOLDS;
  const rng = options.rng ?? Math.random;

  const dimensions: BoxDimensions = {
    width: sampleAxis(range, rng),
    height: sampleAxis(range, rng),
    depth: sampleAxis(range, rng),
  };

  return createBoxSpec(dimensions, thresholds, options.id);
}

/** Rotaciona a caixa em 90° no plano horizontal (troca largura <-> profundidade). */
export function rotateBox90(box: BoxSpec): BoxSpec {
  return {
    ...box,
    dimensions: {
      width: box.dimensions.depth,
      height: box.dimensions.height,
      depth: box.dimensions.width,
    },
  };
}
