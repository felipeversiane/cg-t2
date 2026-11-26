import * as THREE from 'three';

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _camPos = new THREE.Vector3();

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
   * Atualiza a matriz do objeto `reticle` com base no primeiro hit-test válido do frame,
   * orientando-o nivelado no plano horizontal e voltado para a câmera do usuário.
   */
  public update(
    frame: XRFrame,
    renderer: THREE.WebGLRenderer,
    reticle: THREE.Object3D,
    dt = 0.016,
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

    const hitMatrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
    hitMatrix.decompose(_pos, _quat, _scale);

    // Mantém o retículo e o container nivelados no chão/mesa e voltados de frente para o usuário
    const viewerPose = frame.getViewerPose(referenceSpace);
    if (viewerPose) {
      const vp = viewerPose.transform.position;
      _camPos.set(vp.x, vp.y, vp.z);
      const yaw = Math.atan2(_camPos.x - _pos.x, _camPos.z - _pos.z);
      _quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    }

    const wasVisible = reticle.visible;
    reticle.visible = true;

    if (!wasVisible) {
      reticle.position.copy(_pos);
      reticle.quaternion.copy(_quat);
      reticle.scale.set(1, 1, 1);
    } else {
      const alpha = 1 - Math.exp(-16 * dt);
      reticle.position.lerp(_pos, alpha);
      reticle.quaternion.slerp(_quat, alpha);
    }

    reticle.updateMatrix();
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

/**
 * Extrai o raio exato (origem + direção frontal -Z) de onde o celular está apontando
 * diretamente do `XRViewerPose` da WebXR Device API, evitando imprecisões de ArrayCamera.
 */
export function setRaycasterFromXRViewer(
  frame: XRFrame,
  renderer: THREE.WebGLRenderer,
  raycaster: THREE.Raycaster,
): boolean {
  const referenceSpace = renderer.xr.getReferenceSpace();
  if (!referenceSpace) {
    return false;
  }

  const viewerPose = frame.getViewerPose(referenceSpace);
  if (!viewerPose) {
    return false;
  }

  const { position, orientation } = viewerPose.transform;
  _pos.set(position.x, position.y, position.z);
  _quat.set(orientation.x, orientation.y, orientation.z, orientation.w);
  _forward.set(0, 0, -1).applyQuaternion(_quat).normalize();

  raycaster.ray.origin.copy(_pos);
  raycaster.ray.direction.copy(_forward);
  return true;
}
