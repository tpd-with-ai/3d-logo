import * as THREE from 'three';
import type { Pose } from '../turtle/turtle';
import { labelSprite } from './label';
import { AXIS_COLORS } from './palette';
import { LEFT_TIP, RIGHT_TIP, TURTLE_COLORS, TURTLE_FACES } from './turtleShape';

/**
 * The turtle: a low arrowhead built in local coordinates where +X is the heading H, +Y is the
 * left wing L, and +Z is up U, so `makeBasis(H, L, U)` orients it directly. The back is bright
 * and the belly dark so pitch and roll are visible; wingtip lights follow aviation convention
 * (left red, right green). Arrows labelled H, L, and U show the turtle's own axes, which every
 * turn rotates about.
 */
export class TurtleModel {
  readonly object = new THREE.Group();
  private readonly axes = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.object.name = 'turtle';
    this.object.matrixAutoUpdate = false;

    const positions: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();
    for (const [a, b, c, side] of TURTLE_FACES) {
      positions.push(...a, ...b, ...c);
      color.setStyle(TURTLE_COLORS[side]);
      for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, side: THREE.DoubleSide });
    this.object.add(new THREE.Mesh(geometry, material));

    const lightGeometry = new THREE.SphereGeometry(0.09, 12, 8);
    const red = new THREE.MeshBasicMaterial({ color: TURTLE_COLORS.leftLight });
    const green = new THREE.MeshBasicMaterial({ color: TURTLE_COLORS.rightLight });
    const leftLight = new THREE.Mesh(lightGeometry, red);
    leftLight.position.set(...LEFT_TIP);
    const rightLight = new THREE.Mesh(lightGeometry, green);
    rightLight.position.set(...RIGHT_TIP);
    this.object.add(leftLight, rightLight);

    this.disposables.push(geometry, material, lightGeometry, red, green);
    this.buildAxes();
  }

  setAxesVisible(visible: boolean): void {
    this.axes.visible = visible;
  }

  /** Arrows along local +X (H), +Y (L), +Z (U), each with a letter label at its tip. */
  private buildAxes(): void {
    const shaft = new THREE.CylinderGeometry(0.035, 0.035, 1, 8);
    const head = new THREE.ConeGeometry(0.1, 0.3, 12);
    this.disposables.push(shaft, head);
    const arrows: [THREE.Vector3, string, string, number][] = [
      [new THREE.Vector3(1, 0, 0), AXIS_COLORS.heading, 'H', 2.1],
      [new THREE.Vector3(0, 1, 0), AXIS_COLORS.left, 'L', 1.7],
      [new THREE.Vector3(0, 0, 1), AXIS_COLORS.up, 'U', 1.7],
    ];
    for (const [direction, color, letter, length] of arrows) {
      const material = new THREE.MeshBasicMaterial({ color });
      const arrow = new THREE.Group();
      const body = new THREE.Mesh(shaft, material);
      body.scale.y = length - 0.3;
      body.position.y = (length - 0.3) / 2;
      const tip = new THREE.Mesh(head, material);
      tip.position.y = length - 0.15;
      arrow.add(body, tip);
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      const label = labelSprite(letter, color);
      label.position.copy(direction).multiplyScalar(length + 0.3);
      label.scale.setScalar(0.55);
      this.axes.add(arrow, label);
      this.disposables.push(material, label.material, label.material.map!);
    }
    this.axes.name = 'turtle-axes';
    this.object.add(this.axes);
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
