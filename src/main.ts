import * as THREE from 'three';
import {
  generateRandomBox,
  generateRandomBoxWithDifferentCategory,
  rotateBox90,
} from './domain/box-generator';
import { CATEGORY_CONFIG } from './domain/config';
import type { AppMode, BoxSpec, PlacedBox } from './domain/types';
import { PalletModule } from './modules/cubing/pallet-module';
import { TruckBedModule } from './modules/picking/truck-bed-module';
import type {
  HoverInspection,
  InteractiveContainerModule,
  TopBoxSelectionInspection,
} from './modules/types';
import { animateReticle, createReticle, setReticleFootprint } from './scene/reticle';
import { SceneManager } from './scene/scene-manager';
import { HudController } from './ui/hud';
import { HitTestController, setRaycasterFromXRViewer } from './xr/hit-test';
import { isImmersiveARSupported, XRSessionManager } from './xr/xr-session';
import './styles/main.css';

type InteractionState = 'place' | 'move-select' | 'move-carrying';

async function bootstrap(): Promise<void> {
  const canvasRoot = document.getElementById('canvas-root');
  if (!canvasRoot) {
    throw new Error('Elemento #canvas-root não encontrado.');
  }

  const sceneManager = new SceneManager(canvasRoot);
  const reticle = createReticle();
  sceneManager.scene.add(reticle);

  const previewGrid = new THREE.GridHelper(4.5, 18, 0x52525b, 0x27272a);
  previewGrid.position.y = -0.1;
  sceneManager.scene.add(previewGrid);

  const palletModule = new PalletModule();
  const truckBedModule = new TruckBedModule();
  truckBedModule.root.visible = false;
  truckBedModule.seedDemoCargo();

  sceneManager.scene.add(palletModule.root, truckBedModule.root);

  let activeMode: AppMode = 'pallet';
  let interactionState: InteractionState = 'place';
  let nextBox: BoxSpec = generateRandomBox();

  // Estado de movimentação de caixa do topo
  let movingOriginalBox: PlacedBox | null = null;
  let movingWorkingBox: BoxSpec | null = null;

  let lastHover: HoverInspection = { active: false, candidate: null, validation: null };
  let lastTopSelection: TopBoxSelectionInspection = { hoveredBox: null, selectable: false };
  let transientAlertUntil = 0;
  let lastFrameTimeMs = 0;

  const pointerNdc = new THREE.Vector2(0, 0);
  let pointerInsideCanvas = false;
  let pointerDownX = 0;
  let pointerDownY = 0;

  const raycaster = new THREE.Raycaster();
  raycaster.params.Line.threshold = 0.01;
  const hitTestController = new HitTestController();

  const getActiveModule = (): InteractiveContainerModule =>
    activeMode === 'pallet' ? palletModule : truckBedModule;

  const syncReticleFootprint = (): void => {
    const bounds = getActiveModule().bounds;
    setReticleFootprint(reticle, bounds.width, bounds.depth);
  };

  const syncMetrics = (): void => {
    hud.setMetrics(getActiveModule().getMetrics());
  };

  const syncBoxCard = (): void => {
    if (interactionState === 'move-carrying' && movingWorkingBox) {
      hud.setNextBox(movingWorkingBox, 'Movendo:');
      return;
    }
    hud.setNextBox(nextBox);
  };

  const syncMoveTopUI = (): void => {
    if (interactionState === 'place') {
      hud.setMoveTopState('idle');
    } else if (interactionState === 'move-select') {
      hud.setMoveTopState('selecting');
    } else {
      hud.setMoveTopState('carrying');
    }
  };

  const showTransientAlert = (
    title: string,
    message: string,
    variant: 'info' | 'success' | 'error',
    durationMs = 2400,
  ): void => {
    transientAlertUntil = performance.now() + durationMs;
    hud.showAlert(title, message, variant);
  };

  /** Restaura qualquer caixa sendo carregada e retorna ao modo normal (`place`). */
  const cancelActiveMove = (restoreToPlace = true): void => {
    const activeModule = getActiveModule();
    if (movingOriginalBox) {
      activeModule.restoreBox(movingOriginalBox);
      movingOriginalBox = null;
      movingWorkingBox = null;
    }
    activeModule.clearHover();
    activeModule.clearSelectionVisuals();
    interactionState = restoreToPlace ? 'place' : 'move-select';
    syncMoveTopUI();
    syncBoxCard();
    syncMetrics();
  };

  const setDesktopLayout = (): void => {
    const identity = new THREE.Matrix4();
    palletModule.root.position.set(0, 0, 0);
    palletModule.root.quaternion.identity();
    palletModule.root.scale.set(1, 1, 1);
    palletModule.anchorAtMatrix(identity);

    truckBedModule.root.position.set(0, 0, 0);
    truckBedModule.root.quaternion.identity();
    truckBedModule.root.scale.set(1, 1, 1);
    truckBedModule.anchorAtMatrix(identity);

    palletModule.root.visible = activeMode === 'pallet';
    truckBedModule.root.visible = activeMode === 'truck-bed';
  };

  const handlePrimaryAction = (): void => {
    const activeModule = getActiveModule();

    // 1. Modo Mover Topo — Etapa de Seleção
    if (interactionState === 'move-select') {
      const picked = activeModule.pickHoveredTopBox();
      if (picked) {
        movingOriginalBox = picked;
        movingWorkingBox = {
          id: picked.id,
          dimensions: picked.dimensions,
          volume: picked.volume,
          category: picked.category,
          colorHex: picked.colorHex,
          colorCss: picked.colorCss,
        };
        interactionState = 'move-carrying';
        syncMoveTopUI();
        syncBoxCard();
        syncMetrics();
        const label = CATEGORY_CONFIG[picked.category].shortLabel;
        showTransientAlert(
          `Caixa ${label} Selecionada`,
          'Aponte para o novo local e toque/clique para posicionar (ou toque em Cancelar Mov.).',
          'info',
          2600,
        );
        return;
      }

      if (lastTopSelection.hoveredBox && !lastTopSelection.selectable) {
        navigator.vibrate?.([60, 40, 60]);
        showTransientAlert(
          'Caixa Bloqueada',
          'Só é possível selecionar caixas do topo. Mova primeiro a caixa que está em cima.',
          'error',
          2600,
        );
      }
      return;
    }

    // 2. Modo Mover Topo — Etapa de Reposicionar a Caixa Selecionada
    if (interactionState === 'move-carrying') {
      const validation = activeModule.tryPlaceCurrentHover();
      if (!validation) {
        return;
      }

      if (validation.valid) {
        movingOriginalBox = null;
        movingWorkingBox = null;
        interactionState = 'move-select';
        syncMoveTopUI();
        syncBoxCard();
        syncMetrics();
        const zoneText =
          activeMode === 'truck-bed' && lastHover.zoneLabel ? ` para ${lastHover.zoneLabel}` : '';
        showTransientAlert(
          'Caixa Reposicionada',
          `Caixa movida com sucesso${zoneText}. Selecione outra do topo ou toque em Sair Mover.`,
          'success',
          1900,
        );
        return;
      }

      navigator.vibrate?.([60, 40, 60]);
      const zonePrefix = lastHover.zoneLabel ? `[${lastHover.zoneLabel}] ` : '';
      showTransientAlert(
        `${zonePrefix}Movimento Bloqueado`,
        lastHover.diagnosticMessage ?? 'Não é possível mover a caixa para esta posição.',
        'error',
        2800,
      );
      return;
    }

    // 3. Modo Normal — Empilhar Nova Caixa Randômica
    const validation = activeModule.tryPlaceCurrentHover();
    if (!validation) {
      return;
    }

    if (validation.valid) {
      nextBox = generateRandomBox();
      syncBoxCard();
      syncMetrics();

      const label =
        activeMode === 'truck-bed' && lastHover.zoneLabel
          ? `Caixa empilhada na zona ${lastHover.zoneLabel}`
          : 'Caixa empilhada com sucesso';
      showTransientAlert('Alocação Confirmada', label, 'success', 1400);
      return;
    }

    navigator.vibrate?.([60, 40, 60]);
    const zonePrefix = lastHover.zoneLabel ? `[${lastHover.zoneLabel}] ` : '';
    showTransientAlert(
      `${zonePrefix}Empilhamento Bloqueado`,
      lastHover.diagnosticMessage ?? 'Não é possível empilhar esta caixa nesta posição.',
      'error',
      2800,
    );
  };

  const toggleMoveTopMode = (): void => {
    const activeModule = getActiveModule();

    if (interactionState === 'move-carrying') {
      cancelActiveMove(false);
      showTransientAlert(
        'Movimento Cancelado',
        'A caixa voltou para a posição original.',
        'info',
        1800,
      );
      return;
    }

    if (interactionState === 'move-select') {
      cancelActiveMove(true);
      showTransientAlert('Modo Empilhar', 'Voltou para empilhamento de novas caixas.', 'info', 1400);
      return;
    }

    if (activeModule.boxes.length === 0) {
      showTransientAlert(
        'Sem Caixas no Container',
        'Empilhe ao menos uma caixa (ou clique em Simular Carga) antes de usar Mover Topo.',
        'info',
        2400,
      );
      return;
    }

    activeModule.clearHover();
    interactionState = 'move-select';
    syncMoveTopUI();
    showTransientAlert(
      'Modo Mover Topo',
      'Aponte para uma caixa do topo (contorno branco) e toque/clique para pegar e mudar de lugar.',
      'info',
      3200,
    );
  };

  const hud = new HudController({
    onModeChange: (mode) => {
      if (mode === activeMode) return;
      cancelActiveMove(true);
      activeMode = mode;
      hud.setActiveMode(mode);
      syncReticleFootprint();

      if (xrSessionManager.isActive) {
        const mod = getActiveModule();
        palletModule.root.visible = mode === 'pallet' && palletModule.isAnchored;
        truckBedModule.root.visible = mode === 'truck-bed' && truckBedModule.isAnchored;
        if (!mod.isAnchored) {
          showTransientAlert(
            mode === 'pallet' ? 'Posicione o Palete' : 'Posicione a Caçamba',
            'Aponte a câmera para o chão ou mesa até o retículo aparecer e toque na tela.',
            'info',
            4000,
          );
        }
      } else {
        palletModule.root.visible = mode === 'pallet';
        truckBedModule.root.visible = mode === 'truck-bed';
        showTransientAlert(
          mode === 'pallet' ? 'Módulo 01 · Cubagem em Palete' : 'Módulo 02 · Picking em Caçamba',
          mode === 'pallet'
            ? 'Mova o mouse sobre o palete e clique para empilhar.'
            : 'Mova o mouse nas zonas Z1–Z6 da caçamba para testar bloqueios ou use Mover Topo.',
          'info',
          3000,
        );
      }

      syncMetrics();
    },

    onRotateBox: () => {
      if (interactionState === 'move-carrying' && movingWorkingBox) {
        movingWorkingBox = rotateBox90(movingWorkingBox);
        syncBoxCard();
        showTransientAlert('Caixa Rotacionada 90°', 'Largura e profundidade invertidas.', 'info', 1100);
        return;
      }
      nextBox = rotateBox90(nextBox);
      syncBoxCard();
      showTransientAlert('Caixa Rotacionada 90°', 'Largura e profundidade invertidas.', 'info', 1100);
    },

    onNextBox: () => {
      if (interactionState !== 'place') return;
      nextBox = generateRandomBoxWithDifferentCategory(nextBox.category);
      syncBoxCard();
    },

    onToggleMoveTop: () => {
      toggleMoveTopMode();
    },

    onUndo: () => {
      if (interactionState === 'move-carrying') {
        cancelActiveMove(true);
        showTransientAlert('Movimento Cancelado', 'A caixa retornou à posição original.', 'info', 1500);
        return;
      }
      if (interactionState === 'move-select') {
        cancelActiveMove(true);
      }
      const removed = getActiveModule().undoLastBox();
      syncMetrics();
      if (removed) {
        showTransientAlert('Última Caixa Removida', 'Ação desfeita com sucesso.', 'info', 1300);
      }
    },

    onClear: () => {
      cancelActiveMove(true);
      getActiveModule().clearBoxes();
      syncMetrics();
      showTransientAlert('Container Limpo', 'Todas as caixas foram removidas.', 'info', 1400);
    },

    onSeedTruck: () => {
      cancelActiveMove(true);
      truckBedModule.seedDemoCargo();
      syncMetrics();
      showTransientAlert(
        'Carga Simulada na Caçamba',
        'Caixas aleatórias posicionadas em Z1–Z4. Teste empilhar ou clique em Mover Topo!',
        'info',
        3000,
      );
    },

    onReanchor: () => {
      if (!xrSessionManager.isActive) return;
      cancelActiveMove(true);
      const mod = getActiveModule();
      mod.resetAnchor();
      mod.root.visible = false;
      hud.setCrosshairState(false);
      syncReticleFootprint();
      showTransientAlert(
        'Reposicionar Container',
        'Aponte para o chão ou mesa até o retículo aparecer e toque na tela.',
        'info',
        3500,
      );
    },

    onToggleXR: () => {
      void toggleXRSession();
    },
  });

  const xrSessionManager = new XRSessionManager(sceneManager.renderer, hud.overlayRoot, {
    onSessionStart: () => {
      cancelActiveMove(true);
      hud.setXRSessionActive(true);
      sceneManager.setDesktopControlsEnabled(false);
      previewGrid.visible = false;

      palletModule.resetAnchor();
      truckBedModule.resetAnchor();
      palletModule.root.visible = false;
      truckBedModule.root.visible = false;
      syncReticleFootprint();

      hud.setCrosshairState(false);
      showTransientAlert(
        'Hit Testing Ativo',
        activeMode === 'pallet'
          ? 'Aponte a câmera para o chão ou mesa e toque para ancorar o palete.'
          : 'Aponte a câmera para o chão ou mesa e toque para ancorar a caçamba.',
        'info',
        5000,
      );
    },

    onSessionEnd: () => {
      cancelActiveMove(true);
      hitTestController.reset();
      reticle.visible = false;
      previewGrid.visible = true;
      sceneManager.setDesktopControlsEnabled(true);
      setDesktopLayout();
      hud.setXRSessionActive(false);
      hud.hideAlert();
      syncMetrics();
    },
  });

  const toggleXRSession = async (): Promise<void> => {
    try {
      if (xrSessionManager.isActive) {
        await xrSessionManager.stop();
      } else {
        await xrSessionManager.start();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro desconhecido ao iniciar sessão WebXR.';
      showTransientAlert('Falha no WebXR', message, 'error', 4500);
    }
  };

  // Evento de toque/clique na cena WebXR (`select`)
  sceneManager.controller.addEventListener('select', () => {
    if (!xrSessionManager.isActive) {
      return;
    }

    const activeModule = getActiveModule();

    if (!activeModule.isAnchored) {
      if (!reticle.visible) {
        showTransientAlert(
          'Superfície Não Detectada',
          'Movimente o celular devagar apontando para o chão ou mesa.',
          'info',
          2200,
        );
        return;
      }

      activeModule.anchorAtMatrix(reticle.matrix);
      reticle.visible = false;
      showTransientAlert(
        activeMode === 'pallet' ? 'Palete Ancorado!' : 'Caçamba Ancorada!',
        'Aponte o celular para mover a caixa e toque para empilhar (ou use Mover Topo).',
        'success',
        2600,
      );
      return;
    }

    handlePrimaryAction();
  });

  // Interação do Modo Simulador Desktop
  const domElement = sceneManager.renderer.domElement;

  const updatePointerNdc = (event: PointerEvent): void => {
    const rect = domElement.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };

  domElement.addEventListener('pointermove', (event) => {
    if (xrSessionManager.isActive) return;
    pointerInsideCanvas = true;
    updatePointerNdc(event);
  });

  domElement.addEventListener('pointerleave', () => {
    if (xrSessionManager.isActive) return;
    pointerInsideCanvas = false;
    getActiveModule().clearHover();
  });

  domElement.addEventListener('pointerdown', (event) => {
    if (xrSessionManager.isActive) return;
    pointerDownX = event.clientX;
    pointerDownY = event.clientY;
    pointerInsideCanvas = true;
    updatePointerNdc(event);
  });

  domElement.addEventListener('pointerup', (event) => {
    if (xrSessionManager.isActive) return;
    if (event.button !== 0) return;
    const moved = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
    if (moved < 6) {
      handlePrimaryAction();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'r') {
      if (interactionState === 'move-carrying' && movingWorkingBox) {
        movingWorkingBox = rotateBox90(movingWorkingBox);
      } else {
        nextBox = rotateBox90(nextBox);
      }
      syncBoxCard();
    } else if (key === 'n' && interactionState === 'place') {
      nextBox = generateRandomBoxWithDifferentCategory(nextBox.category);
      syncBoxCard();
    } else if (key === 'm') {
      toggleMoveTopMode();
    } else if (key === 'escape' && interactionState !== 'place') {
      cancelActiveMove(true);
    } else if (key === 'z') {
      if (interactionState === 'move-carrying') {
        cancelActiveMove(true);
      } else {
        getActiveModule().undoLastBox();
        syncMetrics();
      }
    } else if (key === '1') {
      document.getElementById('btn-mode-pallet')?.click();
    } else if (key === '2') {
      document.getElementById('btn-mode-truck')?.click();
    }
  });

  setDesktopLayout();
  syncReticleFootprint();
  hud.setActiveMode(activeMode);
  syncMoveTopUI();
  syncBoxCard();
  syncMetrics();

  const arSupported = await isImmersiveARSupported();
  hud.setXRSupportStatus(arSupported, window.isSecureContext);

  if (!arSupported && !window.isSecureContext) {
    showTransientAlert(
      'WebXR Requer HTTPS',
      'Abra via GitHub Pages (https://...) ou ngrok para habilitar a câmera AR no celular.',
      'error',
      8000,
    );
  } else if (!arSupported) {
    showTransientAlert(
      'Modo Simulador 3D Ativo',
      'Mova o mouse para empilhar ou clique em Mover Topo para reposicionar caixas do topo.',
      'info',
      4500,
    );
  }

  sceneManager.startLoop((timeMs, frame) => {
    const dt = lastFrameTimeMs > 0 ? Math.min(0.05, (timeMs - lastFrameTimeMs) / 1000) : 0.016;
    lastFrameTimeMs = timeMs;
    const timeSec = timeMs * 0.001;
    const activeModule = getActiveModule();

    // 1. Fluxo WebXR Real (`immersive-ar` + `hit-test`)
    if (frame) {
      if (!activeModule.isAnchored) {
        const hitFound = hitTestController.update(frame, sceneManager.renderer, reticle, dt);
        if (hitFound) {
          animateReticle(reticle, timeSec);
        }
        hud.setCrosshairState(false);
        return;
      }

      reticle.visible = false;
      const hasAim = setRaycasterFromXRViewer(frame, sceneManager.renderer, raycaster);
      if (!hasAim) {
        activeModule.clearHover();
        hud.setCrosshairState(true, 'idle');
        return;
      }

      runAimUpdate(activeModule, timeSec, dt, true);
      return;
    }

    // 2. Fluxo Simulador 3D Desktop
    if (pointerInsideCanvas && activeModule.isAnchored) {
      raycaster.setFromCamera(pointerNdc, sceneManager.camera);
      runAimUpdate(activeModule, timeSec, dt, false);
    }
  });

  function runAimUpdate(
    activeModule: InteractiveContainerModule,
    timeSec: number,
    dt: number,
    isXR: boolean,
  ): void {
    if (interactionState === 'move-select') {
      lastTopSelection = activeModule.inspectTopBoxSelection(raycaster, timeSec);
      if (isXR) {
        const status = !lastTopSelection.hoveredBox
          ? 'idle'
          : lastTopSelection.selectable
            ? 'valid'
            : 'invalid';
        hud.setCrosshairState(true, status);
      }
      updateTopSelectionAlert(lastTopSelection);
      return;
    }

    const boxToPlace =
      interactionState === 'move-carrying' && movingWorkingBox ? movingWorkingBox : nextBox;

    lastHover = activeModule.updateHover(raycaster, boxToPlace, timeSec, dt);

    if (isXR) {
      const status = !lastHover.active
        ? 'idle'
        : lastHover.validation?.valid
          ? 'valid'
          : 'invalid';
      hud.setCrosshairState(true, status);
    }

    updateLiveHoverAlert(lastHover);
  }

  function updateTopSelectionAlert(selection: TopBoxSelectionInspection): void {
    if (performance.now() < transientAlertUntil) {
      return;
    }

    if (!selection.hoveredBox) {
      hud.showAlert(
        'Modo Mover Topo',
        'Aponte para uma caixa do topo (destacadas em branco) e toque/clique para pegar.',
        'info',
      );
      return;
    }

    const colorLabel = CATEGORY_CONFIG[selection.hoveredBox.category].shortLabel;
    if (selection.selectable) {
      hud.showAlert(
        `✓ Caixa ${colorLabel} (Topo)`,
        'Toque/clique para pegar esta caixa e mudar de lugar.',
        'success',
      );
    } else {
      hud.showAlert(
        `✕ Caixa ${colorLabel} Bloqueada`,
        'Existe outra caixa empilhada em cima. Mova primeiro a caixa do topo.',
        'error',
      );
    }
  }

  function updateLiveHoverAlert(hover: HoverInspection): void {
    if (performance.now() < transientAlertUntil) {
      return;
    }

    if (!hover.active || !hover.validation) {
      hud.hideAlert();
      return;
    }

    if (!hover.validation.valid) {
      const actionPrefix = interactionState === 'move-carrying' ? 'MOVIMENTO BLOQUEADO' : 'BLOQUEADO';
      const title = hover.zoneLabel
        ? `✕ ${actionPrefix} · Zona ${hover.zoneLabel}`
        : `✕ ${actionPrefix}`;
      hud.showAlert(
        title,
        hover.diagnosticMessage ?? 'Empilhamento inválido nesta posição.',
        'error',
      );
      return;
    }

    if (interactionState === 'move-carrying') {
      const zoneSuffix = hover.zoneLabel ? ` em ${hover.zoneLabel}` : '';
      hud.showAlert(
        `✓ Nova Posição Válida${zoneSuffix}`,
        'Toque/clique para soltar a caixa aqui.',
        'success',
      );
      return;
    }

    if (activeMode === 'truck-bed' && hover.zoneLabel) {
      hud.showAlert(
        `✓ Zona ${hover.zoneLabel} Liberada`,
        'Toque/clique para empilhar esta caixa na caçamba.',
        'success',
      );
      return;
    }

    hud.hideAlert();
  }
}

void bootstrap().catch((error: unknown) => {
  console.error('[App] Erro fatal ao inicializar aplicação:', error);
  const banner = document.getElementById('alert-banner');
  const title = document.getElementById('alert-title');
  const message = document.getElementById('alert-message');
  if (banner && title && message) {
    title.textContent = 'Erro ao inicializar WebGL / Three.js';
    message.textContent =
      error instanceof Error
        ? error.message
        : 'Verifique se a aceleração gráfica (WebGL) está habilitada no navegador.';
    banner.dataset.variant = 'error';
    banner.classList.remove('is-hidden');
  }
});
