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

export interface TopBoxSelectionInspection {
  readonly hoveredBox: PlacedBox | null;
  /** `true` se a caixa sob a mira é uma caixa do topo (sem nada empilhado em cima). */
  readonly selectable: boolean;
}

export interface InteractiveContainerModule {
  readonly root: THREE.Group;
  readonly bounds: ContainerBounds;
  readonly isAnchored: boolean;
  readonly boxes: readonly PlacedBox[];

  anchorAtMatrix(matrix: THREE.Matrix4): void;
  resetAnchor(): void;
  updateHover(
    raycaster: THREE.Raycaster,
    nextBox: BoxSpec,
    timeSec: number,
    dt: number,
  ): HoverInspection;
  clearHover(): void;
  tryPlaceCurrentHover(): PlacementValidation | null;

  /** Modo "Mover Topo": destaca caixas do topo e verifica qual caixa está sob a mira. */
  inspectTopBoxSelection(raycaster: THREE.Raycaster, timeSec: number): TopBoxSelectionInspection;
  /** Remove da cena e retorna a caixa do topo atualmente sob a mira para ser movida. */
  pickHoveredTopBox(): PlacedBox | null;
  /** Restaura uma caixa retirada (ex.: ao cancelar a movimentação). */
  restoreBox(box: PlacedBox): void;
  /** Limpa os destaques visuais do modo de seleção de topo. */
  clearSelectionVisuals(): void;

  undoLastBox(): PlacedBox | null;
  clearBoxes(): void;
  getMetrics(): CubingMetrics;
}
