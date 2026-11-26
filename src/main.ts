import * as THREE from 'three';
import {
  generateRandomBox,
  generateRandomBoxWithDifferentCategory,
  rotateBox90,
} from './domain/box-generator';
import type { AppMode, BoxSpec } from './domain/types';
import { PalletModule } from './modules/cubing/pallet-module';
import { TruckBedModule } from './modules/picking/truck-bed-module';
import type { HoverInspection, InteractiveContainerModule } from './modules/types';
import { animateReticle, createReticle, setReticleFootprint } from './scene/reticle';
import { SceneManager } from './scene/scene-manager';
import { HudController } from './ui/hud';
import { HitTestController, setRaycasterFromXRViewer } from './xr/hit-test';
import { isImmersiveARSupported, XRSessionManager } from './xr/xr-session';
import './styles/main.css';

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
  let nextBox: BoxSpec = generateRandomBox();
  let lastHover: HoverInspection = { active: false, candidate: null, validation: null };
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

  const syncNextBox = (): void => {
    hud.setNextBox(nextBox);
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

  const attemptPlacement = (): void => {
    const activeModule = getActiveModule();
    const validation = activeModule.tryPlaceCurrentHover();
    if (!validation) {
      return;
    }

    if (validation.valid) {
      nextBox = generateRandomBox();
      syncNextBox();
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

  const hud = new HudController({
    onModeChange: (mode) => {
      if (mode === activeMode) return;
      getActiveModule().clearHover();
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
            : 'Mova o mouse nas zonas Z1–Z6 da caçamba para testar bloqueios de empilhamento.',
          'info',
          3000,
        );
      }

      syncMetrics();
    },

    onRotateBox: () => {
      nextBox = rotateBox90(nextBox);
      syncNextBox();
      showTransientAlert('Caixa Rotacionada 90°', 'Largura e profundidade invertidas.', 'info', 1100);
    },

    onNextBox: () => {
      nextBox = generateRandomBoxWithDifferentCategory(nextBox.category);
      syncNextBox();
    },

    onUndo: () => {
      const removed = getActiveModule().undoLastBox();
      syncMetrics();
      if (removed) {
        showTransientAlert('Última Caixa Removida', 'Ação desfeita com sucesso.', 'info', 1300);
      }
    },

    onClear: () => {
      getActiveModule().clearBoxes();
      syncMetrics();
      showTransientAlert('Container Limpo', 'Todas as caixas foram removidas.', 'info', 1400);
    },

    onSeedTruck: () => {
      truckBedModule.seedDemoCargo();
      syncMetrics();
      showTransientAlert(
        'Carga Simulada na Caçamba',
        'Caixas aleatórias posicionadas em Z1–Z4. Aponte sobre elas para testar bloqueios!',
        'info',
        3000,
      );
    },

    onReanchor: () => {
      if (!xrSessionManager.isActive) return;
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
        'Aponte o celular para mover a caixa e toque na tela para empilhar.',
        'success',
        2600,
      );
      return;
    }

    attemptPlacement();
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
      attemptPlacement();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'r') {
      nextBox = rotateBox90(nextBox);
      syncNextBox();
    } else if (key === 'n') {
      nextBox = generateRandomBoxWithDifferentCategory(nextBox.category);
      syncNextBox();
    } else if (key === 'z') {
      getActiveModule().undoLastBox();
      syncMetrics();
    } else if (key === '1') {
      document.getElementById('btn-mode-pallet')?.click();
    } else if (key === '2') {
      document.getElementById('btn-mode-truck')?.click();
    }
  });

  setDesktopLayout();
  syncReticleFootprint();
  hud.setActiveMode(activeMode);
  syncNextBox();
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
      'Mova o mouse sobre o palete/caçamba e clique para empilhar. Arraste para girar.',
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

      lastHover = activeModule.updateHover(raycaster, nextBox, timeSec, dt);

      const crosshairStatus = !lastHover.active
        ? 'idle'
        : lastHover.validation?.valid
          ? 'valid'
          : 'invalid';
      hud.setCrosshairState(true, crosshairStatus);
      updateLiveHoverAlert(lastHover);
      return;
    }

    // 2. Fluxo Simulador 3D Desktop
    if (pointerInsideCanvas && activeModule.isAnchored) {
      raycaster.setFromCamera(pointerNdc, sceneManager.camera);
      lastHover = activeModule.updateHover(raycaster, nextBox, timeSec, dt);
      updateLiveHoverAlert(lastHover);
    }
  });

  function updateLiveHoverAlert(hover: HoverInspection): void {
    if (performance.now() < transientAlertUntil) {
      return;
    }

    if (!hover.active || !hover.validation) {
      hud.hideAlert();
      return;
    }

    if (!hover.validation.valid) {
      const title = hover.zoneLabel
        ? `✕ BLOQUEADO · Zona ${hover.zoneLabel}`
        : '✕ NÃO É POSSÍVEL EMPILHAR';
      hud.showAlert(
        title,
        hover.diagnosticMessage ?? 'Empilhamento inválido nesta posição.',
        'error',
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
