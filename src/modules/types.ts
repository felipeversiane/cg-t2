import type * as THREE from 'three';
import type {
  BoxSpec,
  ContainerBounds,
  CubingMetrics,
  PlacedBox,
  PlacementValidation,
} from '../domain/types';

export interface HoverInspection {
  readonly active: boolean;
  readonly candidate: PlacedBox | null;
  readonly validation: PlacementValidation | null;
  /** Nome da zona/marcador detectado (usado no Módulo B — Caçamba). */
  readonly zoneLabel?: string;
  /** Lista de zonas alternativas válidas (usado no Módulo B — Picking Guiado). */
  readonly suggestedZoneLabels?: readonly string[];
  /** Mensagem diagnóstica pronta para o HUD. */
  readonly diagnosticMessage?: string;
}

export interface InteractiveContainerModule {
  readonly root: THREE.Group;
  readonly bounds: ContainerBounds;
  readonly isAnchored: boolean;
  readonly boxes: readonly PlacedBox[];

  anchorAtMatrix(matrix: THREE.Matrix4): void;
  resetAnchor(): void;
  updateHover(raycaster: THREE.Raycaster, nextBox: BoxSpec, timeSec: number): HoverInspection;
  clearHover(): void;
  tryPlaceCurrentHover(): PlacementValidation | null;
  undoLastBox(): PlacedBox | null;
  clearBoxes(): void;
  getMetrics(): CubingMetrics;
}
