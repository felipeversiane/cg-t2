import { CATEGORY_CONFIG } from '../domain/config';
import type { AppMode, BoxSpec, CubingMetrics } from '../domain/types';

export interface HudCallbacks {
  readonly onModeChange: (mode: AppMode) => void;
  readonly onRotateBox: () => void;
  readonly onNextBox: () => void;
  readonly onToggleMoveTop: () => void;
  readonly onUndo: () => void;
  readonly onClear: () => void;
  readonly onSeedTruck: () => void;
  readonly onReanchor: () => void;
  readonly onToggleXR: () => void;
}

export type MoveTopUIState = 'idle' | 'selecting' | 'carrying';

export type AlertVariant = 'info' | 'success' | 'error';

function getRequiredElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Elemento DOM obrigatório não encontrado: #${id}`);
  }
  return el as T;
}

/**
 * Controla o HUD sobreposto (compatível com WebXR `dom-overlay`).
 * Protege todos os controles contra disparos acidentais de `select` no WebXR (`beforexrselect`).
 */
export class HudController {
  public readonly overlayRoot: HTMLElement;

  private readonly statusPill: HTMLElement;
  private readonly btnModePallet: HTMLButtonElement;
  private readonly btnModeTruck: HTMLButtonElement;
  private readonly btnRotate: HTMLButtonElement;
  private readonly btnNextBox: HTMLButtonElement;
  private readonly btnMoveTop: HTMLButtonElement;
  private readonly btnUndo: HTMLButtonElement;
  private readonly btnClear: HTMLButtonElement;
  private readonly btnSeedTruck: HTMLButtonElement;
  private readonly btnReanchor: HTMLButtonElement;
  private readonly btnToggleXR: HTMLButtonElement;
  private readonly btnRules: HTMLButtonElement;
  private readonly btnCloseRules: HTMLButtonElement;
  private readonly rulesModal: HTMLElement;
  private readonly crosshair: HTMLElement;

  private readonly nextBoxDot: HTMLElement;
  private readonly nextBoxLabel: HTMLElement;
  private readonly nextBoxDims: HTMLElement;
  private readonly nextBoxHint: HTMLElement;

  private readonly metricsPercent: HTMLElement;
  private readonly metricsProgress: HTMLElement;
  private readonly metricsVolume: HTMLElement;
  private readonly countRed: HTMLElement;
  private readonly countGreen: HTMLElement;
  private readonly countBlue: HTMLElement;

  private readonly alertBanner: HTMLElement;
  private readonly alertTitle: HTMLElement;
  private readonly alertMessage: HTMLElement;

  constructor(callbacks: HudCallbacks) {
    this.overlayRoot = getRequiredElement<HTMLElement>('xr-overlay');
    this.statusPill = getRequiredElement<HTMLElement>('xr-status-pill');
    this.btnModePallet = getRequiredElement<HTMLButtonElement>('btn-mode-pallet');
    this.btnModeTruck = getRequiredElement<HTMLButtonElement>('btn-mode-truck');
    this.btnRotate = getRequiredElement<HTMLButtonElement>('btn-rotate');
    this.btnNextBox = getRequiredElement<HTMLButtonElement>('btn-next-box');
    this.btnMoveTop = getRequiredElement<HTMLButtonElement>('btn-move-top');
    this.btnUndo = getRequiredElement<HTMLButtonElement>('btn-undo');
    this.btnClear = getRequiredElement<HTMLButtonElement>('btn-clear');
    this.btnSeedTruck = getRequiredElement<HTMLButtonElement>('btn-seed-truck');
    this.btnReanchor = getRequiredElement<HTMLButtonElement>('btn-reanchor');
    this.btnToggleXR = getRequiredElement<HTMLButtonElement>('btn-toggle-xr');
    this.btnRules = getRequiredElement<HTMLButtonElement>('btn-rules');
    this.btnCloseRules = getRequiredElement<HTMLButtonElement>('btn-close-rules');
    this.rulesModal = getRequiredElement<HTMLElement>('rules-modal');
    this.crosshair = getRequiredElement<HTMLElement>('ar-crosshair');

    this.nextBoxDot = getRequiredElement<HTMLElement>('next-box-dot');
    this.nextBoxLabel = getRequiredElement<HTMLElement>('next-box-label');
    this.nextBoxDims = getRequiredElement<HTMLElement>('next-box-dims');
    this.nextBoxHint = getRequiredElement<HTMLElement>('next-box-hint');

    this.metricsPercent = getRequiredElement<HTMLElement>('metrics-percent');
    this.metricsProgress = getRequiredElement<HTMLElement>('metrics-progress');
    this.metricsVolume = getRequiredElement<HTMLElement>('metrics-volume');
    this.countRed = getRequiredElement<HTMLElement>('count-red');
    this.countGreen = getRequiredElement<HTMLElement>('count-green');
    this.countBlue = getRequiredElement<HTMLElement>('count-blue');

    this.alertBanner = getRequiredElement<HTMLElement>('alert-banner');
    this.alertTitle = getRequiredElement<HTMLElement>('alert-title');
    this.alertMessage = getRequiredElement<HTMLElement>('alert-message');

    // Impede que toques nos elementos do DOM Overlay disparem 'select' na cena WebXR
    this.overlayRoot.addEventListener('beforexrselect', (event) => {
      const target = event.target as HTMLElement | null;
      if (target && target !== this.overlayRoot) {
        event.preventDefault();
      }
    });

    this.btnModePallet.addEventListener('click', () => callbacks.onModeChange('pallet'));
    this.btnModeTruck.addEventListener('click', () => callbacks.onModeChange('truck-bed'));
    this.btnRotate.addEventListener('click', () => callbacks.onRotateBox());
    this.btnNextBox.addEventListener('click', () => callbacks.onNextBox());
    this.btnMoveTop.addEventListener('click', () => callbacks.onToggleMoveTop());
    this.btnUndo.addEventListener('click', () => callbacks.onUndo());
    this.btnClear.addEventListener('click', () => callbacks.onClear());
    this.btnSeedTruck.addEventListener('click', () => callbacks.onSeedTruck());
    this.btnReanchor.addEventListener('click', () => callbacks.onReanchor());
    this.btnToggleXR.addEventListener('click', () => callbacks.onToggleXR());

    this.btnRules.addEventListener('click', () => this.toggleRulesModal());
    this.btnCloseRules.addEventListener('click', () => this.toggleRulesModal(false));
  }

  public toggleRulesModal(force?: boolean): void {
    const willOpen = force ?? this.rulesModal.classList.contains('is-hidden');
    this.rulesModal.classList.toggle('is-hidden', !willOpen);
    this.btnRules.setAttribute('aria-expanded', String(willOpen));
  }

  public setXRSupportStatus(supported: boolean, secureContext: boolean): void {
    if (supported) {
      this.statusPill.dataset.state = 'ready';
      this.statusPill.textContent = 'WebXR AR Pronto';
      this.btnToggleXR.disabled = false;
      this.btnToggleXR.textContent = 'Iniciar AR';
      this.btnToggleXR.classList.remove('action-btn--danger');
      this.btnToggleXR.classList.add('action-btn--primary');
      return;
    }

    this.statusPill.dataset.state = 'unsupported';
    this.statusPill.textContent = secureContext ? 'Simulador 3D' : 'Requer HTTPS (AR)';
    this.btnToggleXR.disabled = true;
    this.btnToggleXR.textContent = secureContext ? 'Modo Desktop' : 'Sem HTTPS';
  }

  public setXRSessionActive(active: boolean): void {
    if (active) {
      this.statusPill.dataset.state = 'active';
      this.statusPill.textContent = 'AR Ativo';
      this.btnToggleXR.textContent = 'Sair AR';
      this.btnToggleXR.classList.remove('action-btn--primary');
      this.btnToggleXR.classList.add('action-btn--danger');
    } else {
      this.statusPill.dataset.state = 'ready';
      this.statusPill.textContent = 'WebXR AR Pronto';
      this.btnToggleXR.textContent = 'Iniciar AR';
      this.btnToggleXR.classList.remove('action-btn--danger');
      this.btnToggleXR.classList.add('action-btn--primary');
      this.setCrosshairState(false);
    }
    this.btnReanchor.classList.toggle('is-hidden', !active);
  }

  public setCrosshairState(visible: boolean, status: 'idle' | 'valid' | 'invalid' = 'idle'): void {
    this.crosshair.classList.toggle('is-hidden', !visible);
    this.crosshair.dataset.status = status;
  }

  public setActiveMode(mode: AppMode): void {
    this.btnModePallet.classList.toggle('is-active', mode === 'pallet');
    this.btnModeTruck.classList.toggle('is-active', mode === 'truck-bed');
    this.btnSeedTruck.classList.toggle('is-hidden', mode !== 'truck-bed');
  }

  public setNextBox(box: BoxSpec, prefix?: string): void {
    const config = CATEGORY_CONFIG[box.category];
    const wCm = Math.round(box.dimensions.width * 100);
    const hCm = Math.round(box.dimensions.height * 100);
    const dCm = Math.round(box.dimensions.depth * 100);
    const liters = (box.volume * 1000).toFixed(1);

    this.nextBoxDot.style.backgroundColor = box.colorCss;
    this.nextBoxLabel.textContent = prefix
      ? `${prefix} ${config.label} · ${liters} L`
      : `${config.label} · ${liters} L`;
    this.nextBoxDims.textContent = `${wCm} × ${hCm} × ${dCm} cm`;
    this.nextBoxHint.textContent = `Empilha em: ${config.allowedBaseHint}`;
  }

  public setMoveTopState(state: MoveTopUIState): void {
    const isActive = state !== 'idle';
    this.btnMoveTop.classList.toggle('tool-btn--active', isActive);
    this.btnNextBox.disabled = isActive;

    if (state === 'idle') {
      this.btnMoveTop.textContent = 'Mover Topo';
    } else if (state === 'selecting') {
      this.btnMoveTop.textContent = 'Sair Mover';
    } else {
      this.btnMoveTop.textContent = 'Cancelar Mov.';
    }
  }

  public setMetrics(metrics: CubingMetrics): void {
    const pct = metrics.occupancyPercent.toFixed(1);
    const occL = (metrics.occupiedVolume * 1000).toFixed(0);
    const totalL = (metrics.containerVolume * 1000).toFixed(0);

    this.metricsPercent.textContent = `${pct}%`;
    this.metricsProgress.style.width = `${Math.min(100, metrics.occupancyPercent)}%`;
    this.metricsVolume.textContent = `${occL} / ${totalL} L`;
    this.countRed.textContent = String(metrics.countByCategory.red);
    this.countGreen.textContent = String(metrics.countByCategory.green);
    this.countBlue.textContent = String(metrics.countByCategory.blue);
  }

  public showAlert(title: string, message: string, variant: AlertVariant = 'info'): void {
    this.alertTitle.textContent = title;
    this.alertMessage.textContent = message;
    this.alertBanner.dataset.variant = variant;
    this.alertBanner.classList.remove('is-hidden');
  }

  public hideAlert(): void {
    this.alertBanner.classList.add('is-hidden');
  }
}
