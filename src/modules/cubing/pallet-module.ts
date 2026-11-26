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
import type { HoverInspection, InteractiveContainerModule } from '../types';

const SNAP_STEP = 0.02;

function snapToGrid(value: number): number {
  return Math.round(value / SNAP_STEP) * SNAP_STEP;
}

/**
 * Módulo A — Cubagem Virtual (Simulação de Carga em Palete).
 * Permite ancorar um palete 3D procedural em uma superfície real (Hit Testing)
 * e empilhar caixas geradas dinamicamente com pré-visualização e métricas em tempo real.
 */
export class PalletModule implements InteractiveContainerModule {
  public readonly root: THREE.Group;
  public readonly bounds: ContainerBounds;

  private readonly boxesGroup: THREE.Group;
  private readonly boxMeshes = new Map<string, THREE.Group>();
  private readonly raycastFloor: THREE.Mesh;
  private readonly ceilingAlertMesh: THREE.Mesh;

  private placedBoxes: PlacedBox[] = [];
  private anchored = false;

  private ghostMesh: THREE.Group | null = null;
  private ghostBoxId: string | null = null;
  private ghostSignature = '';

  private currentCandidate: PlacedBox | null = null;
  private currentValidation: PlacementValidation | null = null;

  constructor(bounds: ContainerBounds = DEFAULT_PALLET_BOUNDS) {
    this.bounds = bounds;
    this.root = new THREE.Group();
    this.root.name = 'pallet-module';

    this.boxesGroup = new THREE.Group();
    this.boxesGroup.name = 'pallet-boxes';

    // Plano invisível um pouco maior que o palete para detectar tentativas fora da borda
    const floorGeom = new THREE.PlaneGeometry(bounds.width + 0.5, bounds.depth + 0.5);
    floorGeom.rotateX(-Math.PI / 2);
    this.raycastFloor = new THREE.Mesh(
      floorGeom,
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
    );
    this.raycastFloor.name = 'pallet-raycast-floor';

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

    this.root.add(
      this.buildPalletStructure(),
      this.raycastFloor,
      this.ceilingAlertMesh,
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
  }

  public resetAnchor(): void {
    this.anchored = false;
    this.clearHover();
  }

  public updateHover(
    raycaster: THREE.Raycaster,
    nextBox: BoxSpec,
    timeSec: number,
  ): HoverInspection {
    if (!this.root.visible) {
      this.clearHover();
      return { active: false, candidate: null, validation: null };
    }

    this.root.updateMatrixWorld(true);

    const targets: THREE.Object3D[] = [...this.boxesGroup.children, this.raycastFloor];
    const hits = raycaster.intersectObjects(targets, true);
    const firstHit = hits[0];

    if (!firstHit) {
      this.clearHover();
      return { active: false, candidate: null, validation: null };
    }

    const localPoint = this.root.worldToLocal(firstHit.point.clone());
    let localX = snapToGrid(localPoint.x);
    let localZ = snapToGrid(localPoint.z);

    // Se a mira atingiu o topo de uma caixa existente, facilita o alinhamento central no celular
    const hitBoxId = firstHit.object.userData.boxId as string | undefined;
    if (hitBoxId) {
      const targetBox = this.placedBoxes.find((b) => b.id === hitBoxId);
      if (targetBox) {
        const dist = Math.hypot(
          localPoint.x - targetBox.position.x,
          localPoint.z - targetBox.position.z,
        );
        if (dist < 0.14) {
          localX = targetBox.position.x;
          localZ = targetBox.position.z;
        }
      }
    }

    const centerY = computeRestingCenterY(
      localX,
      localZ,
      nextBox.dimensions.width,
      nextBox.dimensions.height,
      nextBox.dimensions.depth,
      this.placedBoxes,
    );

    const candidate: PlacedBox = {
      ...nextBox,
      position: { x: localX, y: centerY, z: localZ },
    };

    const validation = validatePlacement(candidate, this.placedBoxes, this.bounds);
    this.currentCandidate = candidate;
    this.currentValidation = validation;

    this.ensureGhostMesh(nextBox);
    if (this.ghostMesh) {
      this.ghostMesh.visible = true;
      this.ghostMesh.position.set(candidate.position.x, candidate.position.y, candidate.position.z);
      updateGhostAppearance(this.ghostMesh, !validation.valid, timeSec);
    }

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
    if (this.ghostMesh) {
      this.ghostMesh.visible = false;
    }
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

    const result = this.currentValidation;
    this.clearHover();
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
    this.placedBoxes = [];
    this.clearHover();
  }

  public getMetrics(): CubingMetrics {
    return calculateCubingMetrics(this.placedBoxes, this.bounds);
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

    // Tábuas superiores do palete (face superior alinhada exatamente em y = 0)
    for (let i = 0; i < plankCount; i++) {
      const t = (i + 0.5) / plankCount - 0.5;
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(this.bounds.width, plankThickness, plankDepth),
        woodLight,
      );
      plank.position.set(0, -plankThickness / 2, t * this.bounds.depth);
      pallet.add(plank);
    }

    // 3 longarinas de apoio abaixo das tábuas
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

    // Base inferior para estabilidade visual
    for (const sz of [-this.bounds.depth / 2 + 0.05, 0, this.bounds.depth / 2 - 0.05]) {
      const bottomBoard = new THREE.Mesh(
        new THREE.BoxGeometry(this.bounds.width, 0.018, 0.09),
        woodDark,
      );
      bottomBoard.position.set(0, -plankThickness - stringerHeight - 0.009, sz);
      pallet.add(bottomBoard);
    }

    // Contorno da área útil e gabarito de altura máxima
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
