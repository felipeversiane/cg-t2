import type * as THREE from 'three';

export interface XRSessionCallbacks {
  readonly onSessionStart: (session: XRSession) => void;
  readonly onSessionEnd: () => void;
}

/** Verifica se o navegador/dispositivo atual suporta WebXR immersive-ar. */
export async function isImmersiveARSupported(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.xr) {
    return false;
  }

  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch {
    return false;
  }
}

/**
 * Gerencia o ciclo de vida de sessões WebXR Device API (`immersive-ar`)
 * com `hit-test` obrigatório e `dom-overlay` opcional.
 */
export class XRSessionManager {
  private currentSession: XRSession | null = null;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly overlayRoot: HTMLElement;
  private readonly callbacks: XRSessionCallbacks;

  constructor(
    renderer: THREE.WebGLRenderer,
    overlayRoot: HTMLElement,
    callbacks: XRSessionCallbacks,
  ) {
    this.renderer = renderer;
    this.overlayRoot = overlayRoot;
    this.callbacks = callbacks;
  }

  public get isActive(): boolean {
    return this.currentSession !== null;
  }

  public get session(): XRSession | null {
    return this.currentSession;
  }

  public async start(): Promise<XRSession> {
    if (!navigator.xr) {
      throw new Error('WebXR Device API não está disponível neste navegador.');
    }

    if (this.currentSession) {
      return this.currentSession;
    }

    const sessionInit: XRSessionInit = {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'anchors', 'local-floor'],
      domOverlay: { root: this.overlayRoot },
    };

    const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
    this.currentSession = session;

    session.addEventListener('end', this.handleSessionEnd);

    this.renderer.xr.setReferenceSpaceType('local');
    await this.renderer.xr.setSession(session);

    this.callbacks.onSessionStart(session);
    return session;
  }

  public async stop(): Promise<void> {
    if (!this.currentSession) {
      return;
    }
    await this.currentSession.end();
  }

  private readonly handleSessionEnd = (): void => {
    if (this.currentSession) {
      this.currentSession.removeEventListener('end', this.handleSessionEnd);
      this.currentSession = null;
    }
    this.callbacks.onSessionEnd();
  };
}
