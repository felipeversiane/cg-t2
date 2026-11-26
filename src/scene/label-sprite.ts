import * as THREE from 'three';

/** Cria textura procedural nítida para etiquetas de zona (ex.: Z1..Z6) no piso da caçamba. */
export function createZoneLabelTexture(label: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.beginPath();
    ctx.roundRect(24, 24, size - 48, size - 48, 28);
    ctx.fill();

    ctx.strokeStyle = 'rgba(248, 250, 252, 0.75)';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 104px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, size / 2, size / 2 + 4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Cria um sprite 3D flutuante "✕ BLOQUEADO" para destacar visualmente quando não é possível empilhar. */
export function createBlockedBadgeSprite(): THREE.Sprite {
  const width = 512;
  const height = 192;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
    ctx.beginPath();
    ctx.roundRect(14, 18, width - 28, height - 36, 36);
    ctx.fill();

    ctx.strokeStyle = '#fecaca';
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 66px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕ BLOQUEADO', width / 2, height / 2 + 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.36, 0.135, 1);
  sprite.renderOrder = 20;
  return sprite;
}
