import * as THREE from 'three';
import { DEFAULT_PALLET_BOUNDS } from '../../domain/config';
import {
  calculateCubingMetrics,
  computeRestingCenterY,
  describeDetailedValidation,
  validatePlacement,
} from '../../domain/stacking-rules';
import type {
  BoxSpec,
  ContainerBounds,
  CubingMetrics,
  PlacedBox,
  PlacementValidation,
} from '../../domain/types';
import {
  createBoxMesh,
  disposeObject3D,
  setBoxConflictHighlight,
  updateGhostAppearance,
} from '../../scene/box-mesh';
import { createLandingFootprint, resolveContainerAim } from '../../scene/container-aim';
import type { HoverInspection, InteractiveContainerModule } from '../types';

/**
 * Módulo A — Cubagem Virtual (Simulação de Carga em Palete).
 * Ancorado via Hit Testing em superfícies reais; a caixa fantasma acompanha suavemente
 * para onde o celular (ou mouse) aponta em tempo real com validação de empilhamento.
 */
export class PalletModule implements InteractiveContainerModule {
  public readonly root: THREE.Group;
  public readonly bounds: ContainerBounds;

  private readonly boxesGroup: THREE.Group;
  private readonly boxMeshes = new Map<string, THREE.Group>();
  private readonly boxBodyMeshes: THREE.Mesh[] = [];
  private readonly ceilingAlertMesh: THREE.Mesh;
  private readonly landingFootprint: THREE.LineSegments;

  private placedBoxes: PlacedBox[] = [];
  private anchored = false;

  private ghostMesh: THREE.Group | null = null;
  private ghostBoxId: string | null = null;
  private ghostSignature = '';
  private hasSmoothedAim = false;
  private smoothedX = 0;
  private smoothedZ = 0;
  private smoothedY = 0;

  private currentCandidate: PlacedBox | null = null;
  private currentValidation: PlacementValidation | null = null;

  constructor(bounds: ContainerBounds = DEFAULT_PALLET_BOUNDS) {
    this.bounds = bounds;
    this.root = new THREE.Group();
    this.root.name = 'pallet-module';

    this.boxesGroup = new THREE.Group();
    this.boxesGroup.name = 'pallet-boxes';

    const ceilingGeom = new THREE.PlaneGeometry(bounds.width, bounds.depth);
    ceilingGeom.rotateX(Math.PI / 2);
    this.ceilingAlertMesh = new THREE.Mesh(
      ceilingGeom,
      new THREE.MeshBasicMaterial({
        color: 0xff1e42,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.ceilingAlertMesh.position.y = bounds.height;
    this.ceilingAlertMesh.visible = false;

    this.landingFootprint = createLandingFootprint();

    this.root.add(
      this.buildPalletStructure(),
      this.ceilingAlertMesh,
      this.landingFootprint,
      this.boxesGroup,
    );
  }

  public get isAnchored(): boolean {
    return this.anchored;
  }

  public get boxes(): readonly PlacedBox[] {
    return this.placedBoxes;
  }

  public anchorAtMatrix(matrix: THREE.Matrix4): void {
    matrix.decompose(this.root.position, this.root.quaternion, this.root.scale);
    this.anchored = true;
    this.root.visible = true;
    this.root.updateMatrixWorld(true);
    this.hasSmoothedAim = false;
  }

  public resetAnchor(): void {
    this.anchored = false;
    this.clearHover();
  }

  public updateHover(
    raycaster: THREE.Raycaster,
    nextBox: BoxSpec,
    timeSec: number,
    dt: number,
  ): HoverInspection {
    if (!this.root.visible) {
      this.clearHover();
      return { active: false, candidate: null, validation: null };
    }

    const aim = resolveContainerAim(raycaster, this.root, this.boxBodyMeshes, this.bounds);
    if (!aim) {
      this.clearHover();
      return { active: false, candidate: null, validation: null };
    }

    // Suavização exponencial para eliminar trepidação da mão no celular mantendo resposta imediata
    const alpha = 1 - Math.exp(-20 * Math.max(0.001, dt));
    if (!this.hasSmoothedAim) {
      this.smoothedX = aim.localX;
      this.smoothedZ = aim.localZ;
      this.hasSmoothedAim = true;
    } else {
      this.smoothedX += (aim.localX - this.smoothedX) * alpha;
      this.smoothedZ += (aim.localZ - this.smoothedZ) * alpha;
    }

    const logicalX = Number(this.smoothedX.toFixed(3));
    const logicalZ = Number(this.smoothedZ.toFixed(3));

    const targetCenterY = computeRestingCenterY(
      logicalX,
      logicalZ,
      nextBox.dimensions.width,
      nextBox.dimensions.height,
      nextBox.dimensions.depth,
      this.placedBoxes,
    );

    if (this.ghostMesh?.visible) {
      this.smoothedY += (targetCenterY - this.smoothedY) * alpha;
    } else {
      this.smoothedY = targetCenterY;
    }

    const candidate: PlacedBox = {
      ...nextBox,
      position: { x: logicalX, y: targetCenterY, z: logicalZ },
    };

    const validation = validatePlacement(candidate, this.placedBoxes, this.bounds);
    this.currentCandidate = candidate;
    this.currentValidation = validation;

    this.ensureGhostMesh(nextBox);
    if (this.ghostMesh) {
      this.ghostMesh.visible = true;
      this.ghostMesh.position.set(this.smoothedX, this.smoothedY, this.smoothedZ);
      updateGhostAppearance(this.ghostMesh, !validation.valid, timeSec);
    }

    // Projeção da base no plano de pouso (y = baseY) para leitura imediata de profundidade em AR
    const baseY = targetCenterY - nextBox.dimensions.height / 2;
    this.landingFootprint.visible = true;
    this.landingFootprint.position.set(this.smoothedX, baseY + 0.004, this.smoothedZ);
    this.landingFootprint.scale.set(nextBox.dimensions.width, 1, nextBox.dimensions.depth);
    (this.landingFootprint.material as THREE.LineBasicMaterial).color.setHex(
      validation.valid ? 0x22c55e : 0xff1e42,
    );

    this.applyConflictHighlights(validation, timeSec);

    return {
      active: true,
      candidate,
      validation,
      diagnosticMessage: describeDetailedValidation(
        candidate,
        validation,
        this.placedBoxes,
        this.bounds,
      ),
    };
  }

  public clearHover(): void {
    this.currentCandidate = null;
    this.currentValidation = null;
    this.hasSmoothedAim = false;
    if (this.ghostMesh) {
      this.ghostMesh.visible = false;
    }
    this.landingFootprint.visible = false;
    this.ceilingAlertMesh.visible = false;
    for (const mesh of this.boxMeshes.values()) {
      setBoxConflictHighlight(mesh, false, 0);
    }
  }

  public tryPlaceCurrentHover(): PlacementValidation | null {
    if (!this.currentCandidate || !this.currentValidation) {
      return null;
    }

    if (!this.currentValidation.valid) {
      return this.currentValidation;
    }

    const placed = this.currentCandidate;
    this.placedBoxes.push(placed);

    const mesh = createBoxMesh(placed);
    mesh.position.set(placed.position.x, placed.position.y, placed.position.z);
    this.boxesGroup.add(mesh);
    this.boxMeshes.set(placed.id, mesh);
    this.rebuildBodyMeshList();

    const result = this.currentValidation;
    this.currentCandidate = null;
    this.currentValidation = null;
    return result;
  }

  public undoLastBox(): PlacedBox | null {
    const removed = this.placedBoxes.pop() ?? null;
    if (!removed) {
      return null;
    }

    const mesh = this.boxMeshes.get(removed.id);
    if (mesh) {
      this.boxesGroup.remove(mesh);
      disposeObject3D(mesh);
      this.boxMeshes.delete(removed.id);
      this.rebuildBodyMeshList();
    }

    this.clearHover();
    return removed;
  }

  public clearBoxes(): void {
    for (const mesh of this.boxMeshes.values()) {
      this.boxesGroup.remove(mesh);
      disposeObject3D(mesh);
    }
    this.boxMeshes.clear();
    this.boxBodyMeshes.length = 0;
    this.placedBoxes = [];
    this.clearHover();
  }

  public getMetrics(): CubingMetrics {
    return calculateCubingMetrics(this.placedBoxes, this.bounds);
  }

  private rebuildBodyMeshList(): void {
    this.boxBodyMeshes.length = 0;
    for (const group of this.boxMeshes.values()) {
      for (const child of group.children) {
        if (child instanceof THREE.Mesh) {
          this.boxBodyMeshes.push(child);
        }
      }
    }
  }

  private ensureGhostMesh(spec: BoxSpec): void {
    const signature = `${spec.id}:${spec.dimensions.width}x${spec.dimensions.height}x${spec.dimensions.depth}`;
    if (this.ghostMesh && this.ghostBoxId === spec.id && this.ghostSignature === signature) {
      return;
    }

    if (this.ghostMesh) {
      this.root.remove(this.ghostMesh);
      disposeObject3D(this.ghostMesh);
    }

    this.ghostMesh = createBoxMesh(spec, { ghost: true });
    this.ghostBoxId = spec.id;
    this.ghostSignature = signature;
    this.root.add(this.ghostMesh);
  }

  private applyConflictHighlights(validation: PlacementValidation, timeSec: number): void {
    const conflictSet = new Set(validation.conflictingBoxIds);
    for (const [boxId, mesh] of this.boxMeshes) {
      setBoxConflictHighlight(mesh, conflictSet.has(boxId), timeSec);
    }
    this.ceilingAlertMesh.visible = validation.reasons.includes('EXCEEDS_MAX_HEIGHT');
  }

  private buildPalletStructure(): THREE.Group {
    const pallet = new THREE.Group();
    pallet.name = 'pallet-structure';

    const woodLight = new THREE.MeshStandardMaterial({
      color: 0xc29156,
      roughness: 0.82,
      metalness: 0.04,
    });
    const woodDark = new THREE.MeshStandardMaterial({
      color: 0x996d3c,
      roughness: 0.88,
      metalness: 0.04,
    });

    const plankThickness = 0.02;
    const stringerHeight = 0.06;
    const plankCount = 5;
    const plankDepth = (this.bounds.depth / plankCount) * 0.78;

    for (let i = 0; i < plankCount; i++) {
      const t = (i + 0.5) / plankCount - 0.5;
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(this.bounds.width, plankThickness, plankDepth),
        woodLight,
      );
      plank.position.set(0, -plankThickness / 2, t * this.bounds.depth);
      pallet.add(plank);
    }

    const stringerWidth = 0.07;
    const stringerXs = [
      -this.bounds.width / 2 + stringerWidth / 2,
      0,
      this.bounds.width / 2 - stringerWidth / 2,
    ];
    for (const sx of stringerXs) {
      const stringer = new THREE.Mesh(
        new THREE.BoxGeometry(stringerWidth, stringerHeight, this.bounds.depth),
        woodDark,
      );
      stringer.position.set(sx, -plankThickness - stringerHeight / 2, 0);
      pallet.add(stringer);
    }

    for (const sz of [-this.bounds.depth / 2 + 0.05, 0, this.bounds.depth / 2 - 0.05]) {
      const bottomBoard = new THREE.Mesh(
        new THREE.BoxGeometry(this.bounds.width, 0.018, 0.09),
        woodDark,
      );
      bottomBoard.position.set(0, -plankThickness - stringerHeight - 0.009, sz);
      pallet.add(bottomBoard);
    }

    const guideBox = new THREE.BoxGeometry(
      this.bounds.width,
      this.bounds.height,
      this.bounds.depth,
    );
    const guideLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(guideBox),
      new THREE.LineBasicMaterial({
        color: 0xd4d4d8,
        transparent: true,
        opacity: 0.36,
      }),
    );
    guideLines.position.y = this.bounds.height / 2;
    pallet.add(guideLines);

    return pallet;
  }
}
