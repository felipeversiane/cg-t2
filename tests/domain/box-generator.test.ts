import { describe, expect, it } from 'vitest';
import {
  calculateVolume,
  classifyBoxByVolume,
  createBoxSpec,
  generateRandomBox,
  rotateBox90,
} from '../../src/domain/box-generator';
import { DEFAULT_DIMENSION_RANGE, DEFAULT_VOLUME_THRESHOLDS } from '../../src/domain/config';

describe('box-generator', () => {
  it('calcula o volume V = largura * altura * profundidade', () => {
    expect(calculateVolume({ width: 0.4, height: 0.3, depth: 0.5 })).toBeCloseTo(0.06, 6);
  });

  it('classifica corretamente por volume usando os limiares Y e X', () => {
    const thresholds = { y: 0.02, x: 0.042 };

    expect(classifyBoxByVolume(0.01, thresholds)).toBe('blue');
    expect(classifyBoxByVolume(0.02, thresholds)).toBe('blue');
    expect(classifyBoxByVolume(0.0201, thresholds)).toBe('green');
    expect(classifyBoxByVolume(0.042, thresholds)).toBe('green');
    expect(classifyBoxByVolume(0.0421, thresholds)).toBe('red');
  });

  it('lança erro quando os limiares não respeitam 0 < Y < X', () => {
    expect(() => classifyBoxByVolume(0.03, { y: 0.05, x: 0.04 })).toThrow(RangeError);
    expect(() => classifyBoxByVolume(0.03, { y: 0, x: 0.04 })).toThrow(RangeError);
  });

  it('gera dimensões randômicas dentro dos limites configurados', () => {
    const minBox = generateRandomBox({ rng: () => 0 });
    const maxBox = generateRandomBox({ rng: () => 0.999999 });

    expect(minBox.dimensions.width).toBe(DEFAULT_DIMENSION_RANGE.min);
    expect(minBox.dimensions.height).toBe(DEFAULT_DIMENSION_RANGE.min);
    expect(minBox.dimensions.depth).toBe(DEFAULT_DIMENSION_RANGE.min);
    expect(minBox.category).toBe('blue');

    expect(maxBox.dimensions.width).toBe(DEFAULT_DIMENSION_RANGE.max);
    expect(maxBox.dimensions.height).toBe(DEFAULT_DIMENSION_RANGE.max);
    expect(maxBox.dimensions.depth).toBe(DEFAULT_DIMENSION_RANGE.max);
    expect(maxBox.category).toBe('red');
  });

  it('rotaciona a caixa em 90° preservando altura, volume e cor', () => {
    const box = createBoxSpec(
      { width: 0.4, height: 0.25, depth: 0.2 },
      DEFAULT_VOLUME_THRESHOLDS,
      'box-rot',
    );
    const rotated = rotateBox90(box);

    expect(rotated.dimensions).toEqual({ width: 0.2, height: 0.25, depth: 0.4 });
    expect(rotated.volume).toBe(box.volume);
    expect(rotated.category).toBe(box.category);
  });
});
