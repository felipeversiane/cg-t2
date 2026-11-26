import * as THREE from 'three';
import { createBoxSpec, generateRandomBox } from '../../domain/box-generator';
import { DEFAULT_TRUCK_BED_BOUNDS, DEFAULT_VOLUME_THRESHOLDS } from '../../domain/config';
import {
  calculateCubingMetrics,
  computeRestingCenterY,
  createTruckZones,
  describeDetailedValidation,
  evaluateTruckZones,
  findZoneAt,
  getTopBoxIds,
  isTopBox,
  validatePlacement,
} from '../../domain/stacking-rules';
import type {
  BoxCategory,
  BoxSpec,
  ContainerBounds,
  CubingMetrics,
  PlacedBox,
  PlacementValidation,
  TruckZone,
} from '../../domain/types';
import {
  createBoxMesh,
  disposeObject3D,
  setBoxConflictHighlight,
  setBoxSelectionVisual,
  updateGhostAppearance,
} from '../../scene/box-mesh';
import {
  createLandingFootprint,
  findAimedBoxId,
  resolveContainerAim,
  smoothAxis,
} from '../../scene/container-aim';
import { createZoneLabelTexture } from '../../scene/label-sprite';
import type {
  HoverInspection,
  InteractiveContainerModule,
  TopBoxSelectionInspection,
} from '../types';

const AIM_HOLD_GRACE_SEC = 0.25;

interface ZoneVisual {
  readonly zone: TruckZone;
  readonly fillMaterial: THREE.MeshBasicMaterial;
  readonly borderMaterial: THREE.LineBasicMaterial;
}

/**
 * Módulo B — Picking Guiado e Caçamba de Caminhão.
 * A caixa acompanha suavemente onde o celular aponta em tempo real dentro da caçamba,
 * identificando o marcador/zona (Z1..Z6) sob a mira e destacando de forma inequívoca
 * quando NÃO é possível empilhar (badge ✕ BLOQUEADO, caixas/teto/paredes pulsantes e zonas alternativas).
 */
export class TruckBedModule implements InteractiveContainerModule {
  public readonly root: THREE.Group;
  public readonly bounds: ContainerBounds;
  public readonly zones: readonly TruckZone[];

  private readonly boxesGroup: THREE.Group;
  private readonly boxMeshes = new Map<string, THREE.Group>();
  private readonly zoneVisuals = new Map<string, ZoneVisual>();

  private readonly wallMaterials: THREE.MeshStandardMaterial[] = [];
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
  private lastValidAimTimeSec = -1;

  private currentCandidate: PlacedBox | null = null;
  private currentValidation: PlacementValidation | null = null;
  private hoveredSelectableTopBoxId: string | null = null;

  constructor(bounds: ContainerBounds = DEFAULT_TRUCK_BED_BOUNDS) {
    this.bounds = bounds;
    this.zones = createTruckZones(bounds, 2, 3);

    this.root = new THREE.Group();
    this.root.name = 'truck-bed-module';

    this.boxesGroup = new THREE.Group();
    this.boxesGroup.name = 'truck-bed-boxes';

    const ceilingGeom = new THREE.PlaneGeometry(bounds.width, bounds.depth);
    ceilingGeom.rotateX(Math.PI / 2);
    this.ceilingAlertMesh = new THREE.Mesh(
      ceilingGeom,
      new THREE.MeshBasicMaterial({
        color: 0xff1e42,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.ceilingAlertMesh.position.y = bounds.height;
    this.ceilingAlertMesh.visible = false;

    this.landingFootprint = createLandingFootprint();

    this.root.add(
      this.buildTruckBedStructure(),
      this.buildZoneMarkers(),
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

  /**
   * Pré-carrega a caçamba com caixas randômicas (Vermelha, Verde e Azul) distribuídas nas zonas
   * para demonstrar imediatamente cenários válidos e bloqueios de empilhamento.
   */
  public seedDemoCargo(): void {
    this.clearBoxes();

    const sampleByCategory = (target: BoxCategory): BoxSpec => {
      for (let attempt = 0; attempt < 120; attempt++) {
        const box = generateRandomBox();
        if (box.category === target) {
          return box;
        }
      }
      if (target === 'red') {
        return createBoxSpec({ width: 0.38, height: 0.34, depth: 0.38 }, DEFAULT_VOLUME_THRESHOLDS);
      }
      if (target === 'green') {
        return createBoxSpec({ width: 0.3, height: 0.3, depth: 0.32 }, DEFAULT_VOLUME_THRESHOLDS);
      }
      return createBoxSpec({ width: 0.22, height: 0.22, depth: 0.22 }, DEFAULT_VOLUME_THRESHOLDS);
    };

    const seedPlan: ReadonlyArray<{ zoneIndex: number; category: BoxCategory }> = [
      { zoneIndex: 0, category: 'red' },
      { zoneIndex: 1, category: 'blue' },
      { zoneIndex: 2, category: 'green' },
      { zoneIndex: 3, category: 'red' },
      { zoneIndex: 3, category: 'green' },
    ];

    for (const item of seedPlan) {
      const zone = this.zones[item.zoneIndex];
      if (!zone) continue;

      const spec = sampleByCategory(item.category);
      const centerY = computeRestingCenterY(
        zone.centerX,
        zone.centerZ,
        spec.dimensions.width,
        spec.dimensions.height,
        spec.dimensions.depth,
        this.placedBoxes,
      );

      const candidate: PlacedBox = {
        ...spec,
        position: { x: zone.centerX, y: centerY, z: zone.centerZ },
      };

      const validation = validatePlacement(candidate, this.placedBoxes, this.bounds);
      if (validation.valid) {
        this.commitPlacedBox(candidate);
      }
    }
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

    const aim = resolveContainerAim(raycaster, this.root, this.bounds);
    if (!aim) {
      if (this.hasSmoothedAim && timeSec - this.lastValidAimTimeSec <= AIM_HOLD_GRACE_SEC) {
        if (this.currentCandidate && this.currentValidation) {
          const heldZone = findZoneAt(
            this.zones,
            this.currentCandidate.position.x,
            this.currentCandidate.position.z,
          );
          if (this.ghostMesh) {
            updateGhostAppearance(this.ghostMesh, !this.currentValidation.valid, timeSec);
          }
          return {
            active: true,
            candidate: this.currentCandidate,
            validation: this.currentValidation,
            zoneLabel: heldZone?.label,
            diagnosticMessage: describeDetailedValidation(
              this.currentCandidate,
              this.currentValidation,
              this.placedBoxes,
              this.bounds,
            ),
          };
        }
      }
      this.clearHover();
      return { active: false, candidate: null, validation: null };
    }

    this.lastValidAimTimeSec = timeSec;

    // Movimento contínuo e suave seguindo exatamente onde o celular aponta (sem saltos!)
    if (!this.hasSmoothedAim) {
      this.smoothedX = aim.localX;
      this.smoothedZ = aim.localZ;
      this.hasSmoothedAim = true;
    } else {
      this.smoothedX = smoothAxis(this.smoothedX, aim.localX, dt);
      this.smoothedZ = smoothAxis(this.smoothedZ, aim.localZ, dt);
    }

    const logicalX = Number(this.smoothedX.toFixed(3));
    const logicalZ = Number(this.smoothedZ.toFixed(3));
    const detectedZone = findZoneAt(this.zones, logicalX, logicalZ);

    const targetCenterY = computeRestingCenterY(
      logicalX,
      logicalZ,
      nextBox.dimensions.width,
      nextBox.dimensions.height,
      nextBox.dimensions.depth,
      this.placedBoxes,
    );

    if (this.ghostMesh?.visible) {
      this.smoothedY = smoothAxis(this.smoothedY, targetCenterY, dt, 22, 3.2);
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

    // Projeção da base no plano de pouso para percepção imediata de profundidade em AR
    const baseY = targetCenterY - nextBox.dimensions.height / 2;
    this.landingFootprint.visible = true;
    this.landingFootprint.position.set(this.smoothedX, baseY + 0.005, this.smoothedZ);
    this.landingFootprint.scale.set(nextBox.dimensions.width, 1, nextBox.dimensions.depth);
    (this.landingFootprint.material as THREE.LineBasicMaterial).color.setHex(
      validation.valid ? 0x22c55e : 0xff1e42,
    );

    // Avalia zonas para sugerir alternativas válidas quando a posição atual estiver bloqueada
    const zoneEvaluations = evaluateTruckZones(nextBox, this.placedBoxes, this.bounds, this.zones);
    const validAlternativeZones = zoneEvaluations
      .filter((ev) => ev.validation.valid && ev.zone.id !== detectedZone?.id)
      .map((ev) => ev.zone);

    this.applyVisualFeedback(
      validation,
      detectedZone,
      new Set(validAlternativeZones.map((z) => z.id)),
      timeSec,
    );

    const baseReason = describeDetailedValidation(
      candidate,
      validation,
      this.placedBoxes,
      this.bounds,
    );

    const suggestedZoneLabels = validAlternativeZones.map((z) => z.label);
    let diagnosticMessage = baseReason;
    if (!validation.valid) {
      const suggestionText =
        suggestedZoneLabels.length > 0
          ? ` Zonas válidas: ${suggestedZoneLabels.join(', ')}.`
          : ' Nenhuma zona da caçamba comporta esta caixa agora.';
      diagnosticMessage = `${baseReason}${suggestionText}`;
    } else if (detectedZone) {
      diagnosticMessage = `Zona ${detectedZone.label} liberada para empilhamento.`;
    }

    return {
      active: true,
      candidate,
      validation,
      zoneLabel: detectedZone?.label,
      suggestedZoneLabels,
      diagnosticMessage,
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
    for (const wallMat of this.wallMaterials) {
      wallMat.color.setHex(0x71717a);
      wallMat.emissive.setHex(0x000000);
      wallMat.opacity = 0.16;
    }

    for (const mesh of this.boxMeshes.values()) {
      setBoxConflictHighlight(mesh, false, 0);
    }

    for (const visual of this.zoneVisuals.values()) {
      visual.fillMaterial.color.setHex(0xffffff);
      visual.fillMaterial.opacity = 0.05;
      visual.borderMaterial.color.setHex(0x71717a);
    }
  }

  public tryPlaceCurrentHover(): PlacementValidation | null {
    if (!this.currentCandidate || !this.currentValidation) {
      return null;
    }

    if (!this.currentValidation.valid) {
      return this.currentValidation;
    }

    this.commitPlacedBox(this.currentCandidate);
    const result = this.currentValidation;
    this.currentCandidate = null;
    this.currentValidation = null;
    return result;
  }

  public inspectTopBoxSelection(
    raycaster: THREE.Raycaster,
    timeSec: number,
  ): TopBoxSelectionInspection {
    this.clearHover();
    this.root.updateMatrixWorld(true);

    const topIds = new Set(getTopBoxIds(this.placedBoxes));
    const aimedId = findAimedBoxId(raycaster, this.boxMeshes);
    const hoveredBox = aimedId ? (this.placedBoxes.find((b) => b.id === aimedId) ?? null) : null;
    const selectable = hoveredBox !== null && isTopBox(hoveredBox, this.placedBoxes);

    this.hoveredSelectableTopBoxId = selectable && hoveredBox ? hoveredBox.id : null;

    for (const [boxId, mesh] of this.boxMeshes) {
      if (aimedId && boxId === aimedId) {
        setBoxSelectionVisual(mesh, selectable ? 'top-hovered' : 'blocked-hovered', timeSec);
      } else if (topIds.has(boxId)) {
        setBoxSelectionVisual(mesh, 'top-idle', timeSec);
      } else {
        setBoxSelectionVisual(mesh, 'none', timeSec);
      }
    }

    return { hoveredBox, selectable };
  }

  public pickHoveredTopBox(): PlacedBox | null {
    if (!this.hoveredSelectableTopBoxId) {
      return null;
    }

    const index = this.placedBoxes.findIndex((b) => b.id === this.hoveredSelectableTopBoxId);
    if (index < 0) {
      this.hoveredSelectableTopBoxId = null;
      return null;
    }

    const [picked] = this.placedBoxes.splice(index, 1);
    if (!picked) {
      return null;
    }

    const mesh = this.boxMeshes.get(picked.id);
    if (mesh) {
      this.boxesGroup.remove(mesh);
      disposeObject3D(mesh);
      this.boxMeshes.delete(picked.id);
    }

    this.clearSelectionVisuals();
    this.hasSmoothedAim = true;
    this.smoothedX = picked.position.x;
    this.smoothedY = picked.position.y;
    this.smoothedZ = picked.position.z;
    return picked;
  }

  public restoreBox(box: PlacedBox): void {
    if (this.boxMeshes.has(box.id)) {
      return;
    }
    this.commitPlacedBox(box);
    this.clearHover();
  }

  public clearSelectionVisuals(): void {
    this.hoveredSelectableTopBoxId = null;
    for (const mesh of this.boxMeshes.values()) {
      setBoxSelectionVisual(mesh, 'none', 0);
    }
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

  private commitPlacedBox(placed: PlacedBox): void {
    this.placedBoxes.push(placed);
    const mesh = createBoxMesh(placed);
    mesh.position.set(placed.position.x, placed.position.y, placed.position.z);
    this.boxesGroup.add(mesh);
    this.boxMeshes.set(placed.id, mesh);
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

  private applyVisualFeedback(
    validation: PlacementValidation,
    activeZone: TruckZone | null,
    validAlternativeIds: ReadonlySet<string>,
    timeSec: number,
  ): void {
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * 8);

    const conflictSet = new Set(validation.conflictingBoxIds);
    for (const [boxId, mesh] of this.boxMeshes) {
      setBoxConflictHighlight(mesh, conflictSet.has(boxId), timeSec);
    }

    const heightExceeded = validation.reasons.includes('EXCEEDS_MAX_HEIGHT');
    this.ceilingAlertMesh.visible = heightExceeded;
    if (heightExceeded) {
      const mat = this.ceilingAlertMesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.22 + pulse * 0.35;
    }

    const outOfBounds =
      validation.reasons.includes('OUT_OF_BOUNDS_X') ||
      validation.reasons.includes('OUT_OF_BOUNDS_Z');
    for (const wallMat of this.wallMaterials) {
      if (outOfBounds) {
        wallMat.color.setHex(0xff1e42);
        wallMat.emissive.setHex(0xdc2626);
        wallMat.emissiveIntensity = 0.35 + pulse * 0.5;
        wallMat.opacity = 0.35 + pulse * 0.2;
      } else {
        wallMat.color.setHex(0x71717a);
        wallMat.emissive.setHex(0x000000);
        wallMat.emissiveIntensity = 0;
        wallMat.opacity = 0.16;
      }
    }

    for (const [zoneId, visual] of this.zoneVisuals) {
      if (activeZone && zoneId === activeZone.id) {
        if (validation.valid) {
          visual.fillMaterial.color.setHex(0x22c55e);
          visual.fillMaterial.opacity = 0.3;
          visual.borderMaterial.color.setHex(0x86efac);
        } else {
          visual.fillMaterial.color.setHex(0xff1e42);
          visual.fillMaterial.opacity = 0.28 + pulse * 0.32;
          visual.borderMaterial.color.setHex(0xfef08a);
        }
      } else if (!validation.valid && validAlternativeIds.has(zoneId)) {
        visual.fillMaterial.color.setHex(0x10b981);
        visual.fillMaterial.opacity = 0.14 + pulse * 0.2;
        visual.borderMaterial.color.setHex(0x34d399);
      } else {
        visual.fillMaterial.color.setHex(0xffffff);
        visual.fillMaterial.opacity = 0.05;
        visual.borderMaterial.color.setHex(0x52525b);
      }
    }
  }

  private buildZoneMarkers(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'truck-zone-markers';

    for (const zone of this.zones) {
      const margin = 0.03;
      const w = zone.width - margin;
      const d = zone.depth - margin;

      const fillGeom = new THREE.PlaneGeometry(w, d);
      fillGeom.rotateX(-Math.PI / 2);
      const fillMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
      });
      const fillMesh = new THREE.Mesh(fillGeom, fillMaterial);
      fillMesh.position.set(zone.centerX, 0.003, zone.centerZ);

      const borderGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.002, d));
      const borderMaterial = new THREE.LineBasicMaterial({ color: 0x71717a });
      const borderMesh = new THREE.LineSegments(borderGeom, borderMaterial);
      borderMesh.position.set(zone.centerX, 0.004, zone.centerZ);

      const labelSize = Math.min(w, d) * 0.42;
      const labelGeom = new THREE.PlaneGeometry(labelSize, labelSize);
      labelGeom.rotateX(-Math.PI / 2);
      const labelMat = new THREE.MeshBasicMaterial({
        map: createZoneLabelTexture(zone.label),
        transparent: true,
        depthWrite: false,
      });
      const labelMesh = new THREE.Mesh(labelGeom, labelMat);
      labelMesh.position.set(zone.centerX, 0.006, zone.centerZ);

      group.add(fillMesh, borderMesh, labelMesh);
      this.zoneVisuals.set(zone.id, { zone, fillMaterial, borderMaterial });
    }

    return group;
  }

  private buildTruckBedStructure(): THREE.Group {
    const bed = new THREE.Group();
    bed.name = 'truck-bed-structure';

    const floorThickness = 0.05;
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(this.bounds.width + 0.06, floorThickness, this.bounds.depth + 0.06),
      new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.72,
        metalness: 0.25,
      }),
    );
    floor.position.y = -floorThickness / 2;
    bed.add(floor);

    const bumper = new THREE.Mesh(
      new THREE.BoxGeometry(this.bounds.width + 0.08, 0.055, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0xe4e4e7,
        roughness: 0.45,
        metalness: 0.2,
      }),
    );
    bumper.position.set(0, -floorThickness / 2, this.bounds.depth / 2 + 0.045);
    bed.add(bumper);

    const wallThickness = 0.025;
    const makeWallMat = (): THREE.MeshStandardMaterial => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x71717a,
        roughness: 0.45,
        metalness: 0.2,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.wallMaterials.push(mat);
      return mat;
    };

    const leftWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, this.bounds.height, this.bounds.depth),
      makeWallMat(),
    );
    leftWall.position.set(
      -this.bounds.width / 2 - wallThickness / 2,
      this.bounds.height / 2,
      0,
    );

    const rightWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, this.bounds.height, this.bounds.depth),
      makeWallMat(),
    );
    rightWall.position.set(
      this.bounds.width / 2 + wallThickness / 2,
      this.bounds.height / 2,
      0,
    );

    const frontWall = new THREE.Mesh(
      new THREE.BoxGeometry(this.bounds.width, this.bounds.height, wallThickness),
      makeWallMat(),
    );
    frontWall.position.set(
      0,
      this.bounds.height / 2,
      -this.bounds.depth / 2 - wallThickness / 2,
    );

    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(this.bounds.width, this.bounds.height, this.bounds.depth),
      ),
      new THREE.LineBasicMaterial({
        color: 0xe4e4e7,
        transparent: true,
        opacity: 0.55,
      }),
    );
    frame.position.y = this.bounds.height / 2;

    bed.add(leftWall, rightWall, frontWall, frame);
    return bed;
  }
}
