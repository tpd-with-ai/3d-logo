import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { Segment, Triangle } from '../geometry/drawing';
import type { Vec3 } from '../turtle/vec';

export interface VisibleRange {
  segmentStart: number;
  segmentEnd: number;
  triangleStart: number;
  triangleEnd: number;
}

/**
 * Prefix counts for one batch: `before[i]` is how many of the first i primitives belong to it.
 * Batches keep their members in emission order, so a playback range [s, e) of all primitives is
 * the contiguous slice [before[s], before[e]) of the batch.
 */
function prefix(count: number, member: (i: number) => boolean): Uint32Array {
  const before = new Uint32Array(count + 1);
  for (let i = 0; i < count; i++) before[i + 1] = before[i] + (member(i) ? 1 : 0);
  return before;
}

interface TriangleBatch {
  meshes: THREE.Mesh[];
  edges: THREE.LineSegments;
  before: Uint32Array;
}

/** Number of entries in the sorted array `members` that are less than `end`. */
function countBelow(members: readonly number[], end: number): number {
  let lo = 0;
  let hi = members.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (members[mid] < end) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface LineBatch {
  lines: LineSegments2;
  /** Indices (relative to the first visible segment) of this batch's segments, ascending. */
  members: number[];
  /** Per-batch material (translucent batches only); the opaque batch shares `lineMaterial`. */
  material?: LineMaterial;
}

/** Render order: opaque first, then translucent back faces, front faces, and translucent lines/edges. */
const ORDER = { opaque: 0, back: 1, front: 2, translucentLines: 3 };

/**
 * Owns every per-run GPU resource: thick lines, triangle meshes, triangle edges, and pending-point
 * markers. `setPrimitives` disposes the previous run's geometry before building new buffers, so
 * re-running never leaks.
 *
 * Opacity: opaque primitives (alpha 1) keep the single efficient opaque path. Translucent
 * triangles (0 < alpha < 1) go to their own batch with RGBA vertex colors, no depth writes, and two
 * passes (all back faces, then all front faces) so a translucent solid shows its far side through
 * its near side. Translucent lines are batched per alpha percent (the thick-line shader has one
 * opacity per material). Primitives with alpha 0 are kept in the model but not uploaded. Sorting is
 * per batch, not per triangle, so overlapping translucent shapes can still blend in a slightly
 * wrong order from some angles; that is the usual real-time transparency limitation.
 */
export class DrawingLayer {
  readonly group = new THREE.Group();

  private readonly lineMaterial = new LineMaterial({ linewidth: 3, vertexColors: true, worldUnits: false });
  private readonly meshMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.55,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  private readonly translucentMaterials = [THREE.BackSide, THREE.FrontSide].map(
    (side) =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        side,
        transparent: true,
        depthWrite: false,
        roughness: 0.4,
        metalness: 0.05,
      }),
  );
  private readonly edgeMaterial = new THREE.LineBasicMaterial({ color: 0x0b1020, transparent: true, opacity: 0.45 });
  private readonly pendingMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 9, sizeAttenuation: false });
  private readonly resolution = new THREE.Vector2(1, 1);

  private segments: readonly Segment[] = [];
  private lineBatches: LineBatch[] = [];
  private linesStart = -1;
  private readonly opaque: TriangleBatch;
  private readonly translucent: TriangleBatch;
  private pending?: THREE.Points;

  constructor() {
    this.group.name = 'drawing';
    const batch = (materials: THREE.Material[], orders: number[], name: string): TriangleBatch => {
      const geometry = new THREE.BufferGeometry();
      const meshes = materials.map((material, i) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${name}-mesh`;
        mesh.renderOrder = orders[i];
        mesh.frustumCulled = false;
        return mesh;
      });
      const edges = new THREE.LineSegments(new THREE.BufferGeometry(), this.edgeMaterial);
      edges.name = `${name}-edges`;
      edges.renderOrder = orders.at(-1)!;
      edges.frustumCulled = false;
      this.group.add(...meshes, edges);
      return { meshes, edges, before: new Uint32Array(1) };
    };
    this.opaque = batch([this.meshMaterial], [ORDER.opaque], 'opaque');
    this.translucent = batch(this.translucentMaterials, [ORDER.back, ORDER.front], 'translucent');
    this.translucent.edges.renderOrder = ORDER.translucentLines;
  }

  /** Viewport size in device pixels, needed by the thick-line shader. */
  setResolution(width: number, height: number): void {
    this.resolution.set(width, height);
    this.lineMaterial.resolution.set(width, height);
    for (const batch of this.lineBatches) batch.material?.resolution.set(width, height);
  }

  /** Replaces all primitives (disposing the previous buffers) and shows the full range. */
  setPrimitives(segments: readonly Segment[], triangles: readonly Triangle[]): void {
    this.segments = segments;
    this.disposeLines();
    this.buildTriangles(this.opaque, triangles, (t) => t.alpha === 1);
    this.buildTriangles(this.translucent, triangles, (t) => t.alpha > 0 && t.alpha < 1);
    this.setPending([]);
    this.show({ segmentStart: 0, segmentEnd: segments.length, triangleStart: 0, triangleEnd: triangles.length });
  }

  /** Shows only primitives inside the given ranges (used for step-by-step playback and `clear`). */
  show(range: VisibleRange): void {
    if (range.segmentStart !== this.linesStart) this.buildLines(range.segmentStart);
    for (const { lines, members } of this.lineBatches) {
      const count = countBelow(members, range.segmentEnd - range.segmentStart);
      lines.geometry.instanceCount = count;
      lines.visible = count > 0;
    }
    for (const { meshes, edges, before } of [this.opaque, this.translucent]) {
      const start = before[range.triangleStart];
      const count = before[range.triangleEnd] - start;
      meshes[0].geometry.setDrawRange(start * 3, count * 3);
      edges.geometry.setDrawRange(start * 6, count * 6);
    }
  }

  /** Marks triangle-window points that have not formed a triangle yet. */
  setPending(points: readonly Vec3[]): void {
    if (this.pending) {
      this.pending.geometry.dispose();
      this.group.remove(this.pending);
      this.pending = undefined;
    }
    if (points.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((p) => [p.x, p.y, p.z]), 3));
    this.pending = new THREE.Points(geometry, this.pendingMaterial);
    this.pending.name = 'pending-points';
    this.group.add(this.pending);
  }

  dispose(): void {
    this.disposeLines();
    this.setPending([]);
    for (const batch of [this.opaque, this.translucent]) {
      batch.meshes[0].geometry.dispose();
      batch.edges.geometry.dispose();
    }
    for (const material of [this.lineMaterial, this.meshMaterial, ...this.translucentMaterials, this.edgeMaterial, this.pendingMaterial]) {
      material.dispose();
    }
  }

  private disposeLines(): void {
    this.linesStart = -1;
    for (const { lines, material } of this.lineBatches) {
      lines.geometry.dispose();
      material?.dispose();
      this.group.remove(lines);
    }
    this.lineBatches = [];
  }

  /**
   * Builds thick-line buffers for segments from `start` on (rebuilt only after a `clear`): one
   * opaque batch, plus one batch per alpha percent for translucent segments.
   */
  private buildLines(start: number): void {
    this.disposeLines();
    this.linesStart = start;
    const visible = this.segments.slice(start);
    const groups = new Map<number, number[]>();
    visible.forEach((s, i) => {
      if (s.alpha === 0) return;
      const key = Math.round(s.alpha * 100);
      const members = groups.get(key);
      if (members) members.push(i);
      else groups.set(key, [i]);
    });
    const color = new THREE.Color();
    for (const [percent, members] of [...groups].sort((a, b) => b[0] - a[0])) {
      const positions = new Float32Array(members.length * 6);
      const colors = new Float32Array(members.length * 6);
      members.forEach((index, i) => {
        const s = visible[index];
        positions.set([s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z], i * 6);
        color.setStyle(s.color);
        colors.set([color.r, color.g, color.b, color.r, color.g, color.b], i * 6);
      });
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      geometry.setColors(colors);
      const opaque = percent === 100;
      const material = opaque
        ? undefined
        : new LineMaterial({ linewidth: 3, vertexColors: true, worldUnits: false, transparent: true, depthWrite: false, opacity: percent / 100 });
      material?.resolution.copy(this.resolution);
      const lines = new LineSegments2(geometry, material ?? this.lineMaterial);
      lines.name = opaque ? 'lines' : `lines-${percent}`;
      lines.renderOrder = opaque ? ORDER.opaque : ORDER.translucentLines;
      lines.frustumCulled = false;
      this.lineBatches.push({ lines, material, members });
      this.group.add(lines);
    }
  }

  private buildTriangles(batch: TriangleBatch, all: readonly Triangle[], member: (t: Triangle) => boolean): void {
    const triangles = all.filter(member);
    batch.before = prefix(all.length, (i) => member(all[i]));
    const translucent = batch === this.translucent;
    const stride = translucent ? 4 : 3;
    const positions = new Float32Array(triangles.length * 9);
    const normals = new Float32Array(triangles.length * 9);
    const colors = new Float32Array(triangles.length * 3 * stride);
    const edgePositions = new Float32Array(triangles.length * 18);
    const color = new THREE.Color();
    triangles.forEach((t, i) => {
      const { a, b, c, normal: n } = t;
      positions.set([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], i * 9);
      normals.set([n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z], i * 9);
      color.setStyle(t.color);
      const rgba = translucent ? [color.r, color.g, color.b, t.alpha] : [color.r, color.g, color.b];
      colors.set([...rgba, ...rgba, ...rgba], i * 3 * stride);
      // Edges left out of the outline (polygon diagonals) collapse to invisible zero-length lines.
      const edge = (bit: number, p: typeof a, q: typeof a) => (t.edges & bit ? [p.x, p.y, p.z, q.x, q.y, q.z] : [p.x, p.y, p.z, p.x, p.y, p.z]);
      edgePositions.set([...edge(1, a, b), ...edge(2, b, c), ...edge(4, c, a)], i * 18);
    });

    batch.meshes[0].geometry.dispose();
    const mesh = new THREE.BufferGeometry();
    mesh.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    mesh.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    mesh.setAttribute('color', new THREE.BufferAttribute(colors, stride));
    for (const m of batch.meshes) m.geometry = mesh;

    batch.edges.geometry.dispose();
    const edges = new THREE.BufferGeometry();
    edges.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    batch.edges.geometry = edges;
  }
}
