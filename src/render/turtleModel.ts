import * as THREE from 'three';
import type { Pose } from '../turtle/turtle';

/**
 * The turtle: a low arrowhead built in local coordinates where +X is the heading H, +Y is the
 * left wing L, and +Z is up U, so `makeBasis(H, L, U)` orients it directly. The back is bright
 * and the belly dark so pitch and roll are visible; wingtip lights follow aviation convention
 * (left red, right green).
 */
export class TurtleModel {
  readonly object = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.object.name = 'turtle';
    this.object.matrixAutoUpdate = false;

    const nose = [1, 0, 0];
    const leftTip = [-0.65, 0.6, 0];
    const rightTip = [-0.65, -0.6, 0];
    const notch = [-0.35, 0, 0];
    const top = [-0.15, 0, 0.32];
    const back = 0x86efac;
    const belly = 0x14532d;
    const faces: [number[], number[], number[], number][] = [
      [nose, leftTip, top, back],
      [leftTip, notch, top, back],
      [notch, rightTip, top, back],
      [rightTip, nose, top, back],
      [nose, rightTip, notch, belly],
      [nose, notch, leftTip, belly],
    ];
    const positions: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();
    for (const [a, b, c, hex] of faces) {
      positions.push(...a, ...b, ...c);
      color.setHex(hex);
      for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, side: THREE.DoubleSide });
    this.object.add(new THREE.Mesh(geometry, material));

    const lightGeometry = new THREE.SphereGeometry(0.09, 12, 8);
    const red = new THREE.MeshBasicMaterial({ color: 0xff3b3b });
    const green = new THREE.MeshBasicMaterial({ color: 0x3bff6e });
    const leftLight = new THREE.Mesh(lightGeometry, red);
    leftLight.position.set(leftTip[0], leftTip[1], leftTip[2]);
    const rightLight = new THREE.Mesh(lightGeometry, green);
    rightLight.position.set(rightTip[0], rightTip[1], rightTip[2]);
    this.object.add(leftLight, rightLight);

    this.disposables.push(geometry, material, lightGeometry, red, green);
  }

  setPose(pose: Pose, size: number): void {
    const { position: p, heading: h, left: l, up: u } = pose;
    const m = this.object.matrix;
    m.makeBasis(new THREE.Vector3(h.x, h.y, h.z), new THREE.Vector3(l.x, l.y, l.z), new THREE.Vector3(u.x, u.y, u.z));
    m.scale(new THREE.Vector3(size, size, size));
    m.setPosition(p.x, p.y, p.z);
    this.object.matrixWorldNeedsUpdate = true;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
