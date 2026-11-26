import type * as THREE from 'three';

/**
 * Encapsula a aquisição e consulta do `XRHitTestSource` da WebXR Device API
 * para detectar superfícies reais (chão, mesas, paletes físicos).
 */
export class HitTestController {
  private hitTestSource: XRHitTestSource | null = null;
  private hitTestRequested = false;

  public reset(): void {
    if (this.hitTestSource) {
      this.hitTestSource.cancel();
      this.hitTestSource = null;
    }
    this.hitTestRequested = false;
  }

  /**
   * Atualiza a matriz do objeto `reticle` com base no primeiro hit-test válido do frame.
   * Retorna `true` se uma superfície física foi detectada neste frame.
   */
  public update(
    frame: XRFrame,
    renderer: THREE.WebGLRenderer,
    reticle: THREE.Object3D,
  ): boolean {
    const session = renderer.xr.getSession();
    const referenceSpace = renderer.xr.getReferenceSpace();

    if (!session || !referenceSpace) {
      reticle.visible = false;
      return false;
    }

    if (!this.hitTestRequested) {
      this.hitTestRequested = true;
      void this.requestSource(session);
      reticle.visible = false;
      return false;
    }

    if (!this.hitTestSource) {
      reticle.visible = false;
      return false;
    }

    const hitTestResults = frame.getHitTestResults(this.hitTestSource);
    const firstHit = hitTestResults[0];

    if (!firstHit) {
      reticle.visible = false;
      return false;
    }

    const pose = firstHit.getPose(referenceSpace);
    if (!pose) {
      reticle.visible = false;
      return false;
    }

    reticle.visible = true;
    reticle.matrix.fromArray(pose.transform.matrix);
    return true;
  }

  private async requestSource(session: XRSession): Promise<void> {
    try {
      const viewerSpace = await session.requestReferenceSpace('viewer');
      const source = await session.requestHitTestSource?.({ space: viewerSpace });
      if (source) {
        this.hitTestSource = source;
      }
    } catch (error) {
      console.error('[WebXR] Falha ao solicitar XRHitTestSource:', error);
    }
  }
}
