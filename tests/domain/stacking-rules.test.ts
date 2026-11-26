import { describe, expect, it } from 'vitest';
import { createBoxSpec } from '../../src/domain/box-generator';
import {
  DEFAULT_PALLET_BOUNDS,
  DEFAULT_TRUCK_BED_BOUNDS,
  DEFAULT_VOLUME_THRESHOLDS,
} from '../../src/domain/config';
import {
  calculateCubingMetrics,
  canStackCategory,
  computeRestingCenterY,
  createTruckZones,
  describeDetailedValidation,
  evaluateTruckZones,
  findZoneAt,
  validatePlacement,
} from '../../src/domain/stacking-rules';
import type { BoxCategory, PlacedBox } from '../../src/domain/types';

function makeBox(
  id: string,
  dims: { width: number; height: number; depth: number },
  position: { x: number; y: number; z: number },
): PlacedBox {
  const spec = createBoxSpec(dims, DEFAULT_VOLUME_THRESHOLDS, id);
  return { ...spec, position };
}

describe('stacking-rules — matriz 3x3 de cores/volume', () => {
  const cases: ReadonlyArray<readonly [BoxCategory, BoxCategory, boolean]> = [
    ['red', 'red', true],
    ['red', 'green', false],
    ['red', 'blue', false],
    ['green', 'red', true],
    ['green', 'green', true],
    ['green', 'blue', false],
    ['blue', 'red', true],
    ['blue', 'green', true],
    ['blue', 'blue', true],
  ];

  it.each(cases)('empilhar %s sobre %s deve ser %s', (above, below, expected) => {
    expect(canStackCategory(above, below)).toBe(expected);
  });
});

describe('stacking-rules — validação geométrica e de regras', () => {
  // Vermelha: 0.40 * 0.30 * 0.40 = 0.048 m³ (> 0.042)
  const redDims = { width: 0.4, height: 0.3, depth: 0.4 };
  // Verde: 0.30 * 0.30 * 0.30 = 0.027 m³ (0.020 < V <= 0.042)
  const greenDims = { width: 0.3, height: 0.3, depth: 0.3 };
  // Azul: 0.20 * 0.20 * 0.20 = 0.008 m³ (<= 0.020)
  const blueDims = { width: 0.2, height: 0.2, depth: 0.2 };

  it('permite posicionar qualquer caixa diretamente na base do palete', () => {
    const redBase = makeBox('r1', redDims, { x: 0, y: 0.15, z: 0 });
    const result = validatePlacement(redBase, [], DEFAULT_PALLET_BOUNDS);

    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.supportRatio).toBe(1);
  });

  it('permite empilhar caixa azul sobre caixa verde sobre caixa vermelha', () => {
    const redBase = makeBox('r1', redDims, { x: 0, y: 0.15, z: 0 });
    const greenMid = makeBox('g1', greenDims, { x: 0, y: 0.45, z: 0 });
    const blueTop = makeBox('b1', blueDims, { x: 0, y: 0.7, z: 0 });

    const resGreen = validatePlacement(greenMid, [redBase], DEFAULT_PALLET_BOUNDS);
    expect(resGreen.valid).toBe(true);
    expect(resGreen.supportingBoxIds).toEqual(['r1']);

    const resBlue = validatePlacement(blueTop, [redBase, greenMid], DEFAULT_PALLET_BOUNDS);
    expect(resBlue.valid).toBe(true);
    expect(resBlue.supportingBoxIds).toEqual(['g1']);
  });

  it('bloqueia caixa vermelha sobre caixa verde e aponta a caixa conflitante', () => {
    const greenBase = makeBox('g1', greenDims, { x: 0, y: 0.15, z: 0 });
    const redTop = makeBox('r1', redDims, { x: 0, y: 0.45, z: 0 });

    const result = validatePlacement(redTop, [greenBase], DEFAULT_PALLET_BOUNDS);

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('INVALID_COLOR_STACK');
    expect(result.conflictingBoxIds).toContain('g1');
  });

  it('bloqueia quando ultrapassa altura máxima ou limites laterais da caçamba/palete', () => {
    const lowContainer = { width: 0.6, height: 0.4, depth: 0.6 };
    const redBase = makeBox('r1', redDims, { x: 0, y: 0.15, z: 0 });
    const blueHigh = makeBox('b1', blueDims, { x: 0, y: 0.4, z: 0 });

    const heightResult = validatePlacement(blueHigh, [redBase], lowContainer);
    expect(heightResult.valid).toBe(false);
    expect(heightResult.reasons).toContain('EXCEEDS_MAX_HEIGHT');

    const outsideBox = makeBox('b2', blueDims, { x: 0.35, y: 0.1, z: 0 });
    const boundsResult = validatePlacement(outsideBox, [], lowContainer);
    expect(boundsResult.valid).toBe(false);
    expect(boundsResult.reasons).toContain('OUT_OF_BOUNDS_X');
  });

  it('bloqueia colisão AABB e caixa flutuando sem suporte suficiente', () => {
    const redBase = makeBox('r1', redDims, { x: 0, y: 0.15, z: 0 });
    const colliding = makeBox('b1', blueDims, { x: 0.1, y: 0.15, z: 0 });

    const collisionResult = validatePlacement(colliding, [redBase], DEFAULT_PALLET_BOUNDS);
    expect(collisionResult.valid).toBe(false);
    expect(collisionResult.reasons).toContain('COLLISION');
    expect(collisionResult.conflictingBoxIds).toContain('r1');

    const floating = makeBox('b2', blueDims, { x: 0.3, y: 0.4, z: 0 });
    const supportResult = validatePlacement(floating, [redBase], DEFAULT_PALLET_BOUNDS);
    expect(supportResult.valid).toBe(false);
    expect(supportResult.reasons).toContain('INSUFFICIENT_SUPPORT');
  });

  it('calcula corretamente a cota Y de repouso e métricas de cubagem', () => {
    const redBase = makeBox('r1', redDims, { x: 0, y: 0.15, z: 0 });
    const nextY = computeRestingCenterY(0, 0, blueDims.width, blueDims.height, blueDims.depth, [
      redBase,
    ]);
    expect(nextY).toBeCloseTo(0.4, 6);

    const blueTop = makeBox('b1', blueDims, { x: 0, y: nextY, z: 0 });
    const metrics = calculateCubingMetrics([redBase, blueTop], DEFAULT_PALLET_BOUNDS);

    const expectedContainerVol =
      DEFAULT_PALLET_BOUNDS.width * DEFAULT_PALLET_BOUNDS.height * DEFAULT_PALLET_BOUNDS.depth;
    expect(metrics.totalBoxes).toBe(2);
    expect(metrics.countByCategory).toEqual({ red: 1, green: 0, blue: 1 });
    expect(metrics.occupiedVolume).toBeCloseTo(0.056, 6);
    expect(metrics.occupancyPercent).toBeCloseTo((0.056 / expectedContainerVol) * 100, 4);
  });
});

describe('stacking-rules — zonas da caçamba (Módulo B) e diagnósticos', () => {
  const redDims = { width: 0.4, height: 0.3, depth: 0.4 };
  const blueDims = { width: 0.2, height: 0.2, depth: 0.2 };

  it('gera 6 zonas Z1..Z6 e localiza a zona correta a partir de coordenadas locais', () => {
    const zones = createTruckZones(DEFAULT_TRUCK_BED_BOUNDS, 2, 3);
    expect(zones).toHaveLength(6);
    expect(zones.map((z) => z.label)).toEqual(['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6']);

    const z1 = zones[0]!;
    expect(findZoneAt(zones, z1.centerX, z1.centerZ)?.label).toBe('Z1');
    expect(findZoneAt(zones, 99, 99)).toBeNull();
  });

  it('avalia todas as zonas identificando zonas bloqueadas e alternativas válidas', () => {
    const zones = createTruckZones(DEFAULT_TRUCK_BED_BOUNDS, 2, 3);
    const z1 = zones[0]!;
    const blueInZ1 = makeBox('b-z1', blueDims, { x: z1.centerX, y: 0.1, z: z1.centerZ });
    const incomingRed = createBoxSpec(redDims, DEFAULT_VOLUME_THRESHOLDS, 'r-next');

    const evaluations = evaluateTruckZones(
      incomingRed,
      [blueInZ1],
      DEFAULT_TRUCK_BED_BOUNDS,
      zones,
    );

    const z1Eval = evaluations[0]!;
    expect(z1Eval.validation.valid).toBe(false);
    expect(z1Eval.validation.reasons).toContain('INVALID_COLOR_STACK');

    const validZoneLabels = evaluations
      .filter((e) => e.validation.valid)
      .map((e) => e.zone.label);
    expect(validZoneLabels).toEqual(['Z2', 'Z3', 'Z4', 'Z5', 'Z6']);

    const message = describeDetailedValidation(
      z1Eval.candidate,
      z1Eval.validation,
      [blueInZ1],
      DEFAULT_TRUCK_BED_BOUNDS,
    );
    expect(message).toContain('Vermelha');
    expect(message).toContain('Azul');
  });
});
