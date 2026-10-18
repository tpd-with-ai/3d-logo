import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Bounds } from '../geometry/drawing';
import type { Pose } from '../turtle/turtle';
import { DrawingLayer } from './drawingLayer';
import { FlyKeys } from './fly';
import { labelSprite } from './label';
import { TurtleModel } from './turtleModel';

/** Default view direction: from the front-right, above the ground, looking toward the target. */
const DEFAULT_DIRECTION = new THREE.Vector3(0.6, -1, 0.95).normalize();
const MIN_RADIUS = 40;
/** Fly speed in world units per second, per unit of framed scene radius (crosses the scene in ~2 s). */
const FLY_SPEED_PER_RADIUS = 1;

function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const mantissa = raw / power;
  return (mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 5 ? 5 : 10) * power;
}

/**
 * The 3D viewport: renderer, Z-up camera with orbit/pan/zoom, adaptive ground grid on z = 0,
 * labelled axes, lights, the turtle, and the drawing layer. Renders on demand.
 */
export class Viewport {
  readonly drawing = new DrawingLayer();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100_000);
  private readonly controls: OrbitControls;
  private readonly turtle = new TurtleModel();
  private readonly guides = new THREE.Group();
  private gridHalf = 0;
  /** Size of one grid cell in world units. */
  gridStep = 10;
  private pose?: Pose;
  private needsRender = true;
  private frameId = 0;
  private readonly resizeObserver: ResizeObserver;
  /** Radius of the region the camera last framed; also sizes the turtle. */
  private radius = MIN_RADIUS;
  private readonly fly = new FlyKeys();
  private readonly removeListeners: () => void;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0e1424);
    this.camera.up.set(0, 0, 1);

    this.scene.add(new THREE.HemisphereLight(0xe6eeff, 0x3a4152, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(0.6, -0.8, 1.4);
    const fill = new THREE.DirectionalLight(0xbfd2ff, 0.7);
    fill.position.set(-1, 0.7, -0.4);
    this.scene.add(key, fill, this.guides, this.drawing.group, this.turtle.object);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    this.controls.listenToKeyEvents(container);
    this.controls.addEventListener('change', () => this.invalidate());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.setPose({ position: { x: 0, y: 0, z: 0 }, heading: { x: 0, y: 1, z: 0 }, left: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } });
    this.rebuildGuides(MIN_RADIUS);
    this.resetCamera(null);

    this.removeListeners = this.bindFlyKeys();

    let last = performance.now();
    const loop = (now: number) => {
      this.frameId = requestAnimationFrame(loop);
      const seconds = (now - last) / 1000;
      last = now;
      if (this.fly.moving) this.flyStep(seconds);
      const moved = this.controls.update();
      if (moved || this.needsRender) {
        this.needsRender = false;
        this.renderer.render(this.scene, this.camera);
      }
    };
    this.frameId = requestAnimationFrame(loop);
  }

  /**
   * Keyboard flight (see ./fly.ts) listens only on the focusable viewport element, so typing in the
   * editor or other controls never moves the camera. Held keys are dropped whenever focus or page
   * visibility is lost.
   */
  private bindFlyKeys(): () => void {
    const el = this.container;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (this.fly.press(event.code)) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => this.fly.release(event.code);
    const clear = () => this.fly.clear();
    const onVisibility = () => document.hidden && clear();
    // Clicking or dragging in the view engages it for the keyboard.
    const onPointerDown = () => el.focus({ preventScroll: true });
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('keyup', onKeyUp);
    el.addEventListener('focusout', clear);
    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('keyup', onKeyUp);
      el.removeEventListener('focusout', clear);
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  /**
   * Moves the camera and the orbit target by the same offset, so the view direction and orbit
   * distance are unchanged and the next mouse orbit pivots smoothly around the carried-along target.
   */
  private flyStep(seconds: number): void {
    this.camera.updateMatrixWorld();
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    const d = this.fly.displacement(
      { forward, right, up: { x: 0, y: 0, z: 1 } },
      seconds,
      this.radius * FLY_SPEED_PER_RADIUS,
    );
    const offset = new THREE.Vector3(d.x, d.y, d.z);
    this.camera.position.add(offset);
    this.controls.target.add(offset);
    this.invalidate();
  }

  /** Largest |x| or |y| of the bounds' corners in normalized device coordinates (≤ 1 = in view). */
  ndcExtent(bounds: Bounds | null): number {
    if (!bounds) return 0;
    this.camera.updateMatrixWorld();
    let extent = 0;
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const p = new THREE.Vector3(x, y, z).project(this.camera);
          extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
        }
    return extent;
  }

  /** Drops held fly keys (e.g. when a dialog opens over the view). */
  stopFlying(): void {
    this.fly.clear();
  }

  /** Camera position and orbit target, for browser tests. */
  cameraState(): { position: number[]; target: number[]; direction: number[] } {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      direction: this.camera.getWorldDirection(new THREE.Vector3()).toArray(),
    };
  }

  invalidate(): void {
    this.needsRender = true;
  }

  setPose(pose: Pose): void {
    this.pose = pose;
    this.turtle.setPose(pose, this.turtleSize());
    this.invalidate();
  }

  setTurtleAxesVisible(visible: boolean): void {
    this.turtle.setAxesVisible(visible);
    this.invalidate();
  }

  setGuidesVisible(visible: boolean): void {
    this.guides.visible = visible;
    this.invalidate();
  }

  /**
   * Re-aims the camera so `bounds` (plus the origin and turtle) fill the view. Keeps the current
   * view direction unless `resetDirection`.
   */
  frame(bounds: Bounds | null, resetDirection = false): void {
    const box = new THREE.Box3();
    if (bounds) {
      box.expandByPoint(new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z));
      box.expandByPoint(new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z));
    }
    const turtle = this.pose?.position ?? { x: 0, y: 0, z: 0 };
    box.expandByPoint(new THREE.Vector3(turtle.x, turtle.y, turtle.z));
    box.expandByPoint(new THREE.Vector3(0, 0, 0));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.radius = Math.max(sphere.radius * 1.1, MIN_RADIUS);
    this.rebuildGuides(Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.y), Math.abs(box.max.y), MIN_RADIUS));

    const direction = resetDirection
      ? DEFAULT_DIRECTION.clone()
      : this.camera.position.clone().sub(this.controls.target).normalize();
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const fitFov = this.camera.aspect < 1 ? 2 * Math.atan(Math.tan(fov / 2) * this.camera.aspect) : fov;
    const distance = (this.radius / Math.sin(fitFov / 2)) * 1.1;
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
    this.camera.near = distance / 1000;
    this.camera.far = distance * 50;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    if (this.pose) this.turtle.setPose(this.pose, this.turtleSize());
    this.invalidate();
  }

  resetCamera(bounds: Bounds | null): void {
    this.frame(bounds, true);
  }

  /** Zooms toward the orbit target; factor < 1 moves closer. */
  zoom(factor: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(factor);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.invalidate();
  }

  /** GPU resource counts, exposed for leak checks in browser tests. */
  memory(): { geometries: number; textures: number } {
    return { ...this.renderer.info.memory };
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.removeListeners();
    this.fly.clear();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.drawing.dispose();
    this.turtle.dispose();
    this.disposeGuides();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private turtleSize(): number {
    return Math.max(5, this.radius * 0.1);
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const pixels = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.drawing.setResolution(pixels.x, pixels.y);
    this.invalidate();
  }

  /** Grid on the ground plane z = 0 sized to cover `extent`, plus X/Y/Z axes with labels. */
  private rebuildGuides(extent: number): void {
    const step = niceStep((extent * 1.25) / 6);
    const half = Math.ceil((extent * 1.25) / step) * step;
    if (half === this.gridHalf) return;
    this.gridHalf = half;
    this.gridStep = step;
    this.disposeGuides();

    const grid = new THREE.GridHelper(half * 2, Math.round((half * 2) / step), 0x41506e, 0x232c42);
    grid.rotation.x = Math.PI / 2; // GridHelper lies in XZ; turn it into the XY ground plane.
    grid.position.z = -half * 0.002; // just below z = 0 so axes and ground drawings win the depth test
    grid.name = 'grid';
    this.guides.add(grid);

    const axisLength = half * 0.9;
    const axes: [THREE.Vector3, string, string][] = [
      [new THREE.Vector3(1, 0, 0), '#f87171', 'X'],
      [new THREE.Vector3(0, 1, 0), '#4ade80', 'Y'],
      [new THREE.Vector3(0, 0, 1), '#60a5fa', 'Z'],
    ];
    for (const [dir, color, name] of axes) {
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(axisLength)]);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
      const label = labelSprite(name, color);
      label.position.copy(dir).multiplyScalar(axisLength * 1.06);
      label.scale.setScalar(half * 0.09);
      this.guides.add(line, label);
    }
    this.invalidate();
  }

  private disposeGuides(): void {
    for (const child of [...this.guides.children]) {
      child.traverse((object) => {
        const item = object as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
        item.geometry?.dispose();
        for (const material of [item.material ?? []].flat()) {
          (material as THREE.SpriteMaterial).map?.dispose();
          material.dispose();
        }
      });
      this.guides.remove(child);
    }
  }
}
