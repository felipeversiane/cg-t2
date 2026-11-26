import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Configura cena Three.js, câmera, iluminação, OrbitControls (modo desktop)
 * e WebGLRenderer preparado para WebXR (`immersive-ar`).
 */
export class SceneManager {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly controller: THREE.XRTargetRaySpace;
  public readonly controls: OrbitControls;

  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.01,
      30,
    );
    this.camera.position.set(1.25, 1.35, 1.75);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.minDistance = 0.7;
    this.controls.maxDistance = 5.5;
    this.controls.target.set(0, 0.25, 0);
    this.controls.update();

    this.setupLights();

    this.controller = this.renderer.xr.getController(0);
    this.scene.add(this.controller);

    window.addEventListener('resize', this.handleResize);
  }

  private setupLights(): void {
    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x334155, 1.25);
    hemisphere.position.set(0, 4, 0);
    this.scene.add(hemisphere);

    const directional = new THREE.DirectionalLight(0xffffff, 1.1);
    directional.position.set(2.5, 5, 3);
    this.scene.add(directional);

    const fill = new THREE.DirectionalLight(0x93c5fd, 0.45);
    fill.position.set(-2.5, 3, -2);
    this.scene.add(fill);
  }

  public setDesktopControlsEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  /** Retorna a câmera ativa (câmera XR durante sessão AR ou câmera desktop fora dela). */
  public getActiveCamera(): THREE.Camera {
    return this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
  }

  public startLoop(onFrame: (time: DOMHighResTimeStamp, frame?: XRFrame) => void): void {
    this.renderer.setAnimationLoop((time, frame) => {
      if (!this.renderer.xr.isPresenting) {
        this.controls.update();
      }
      onFrame(time, frame);
      this.renderer.render(this.scene, this.camera);
    });
  }

  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.controls.dispose();
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }

  private readonly handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}
