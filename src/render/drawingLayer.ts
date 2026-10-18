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
 * Owns every per-run GPU resource: thick lines, triangle mesh, triangle edges, and pending-point
 * markers. `setPrimitives` disposes the previous run's geometry before building new buffers, so
 * re-running never leaks. Materials are created once and shared across runs.
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
  private readonly edgeMaterial = new THREE.LineBasicMaterial({ color: 0x0b1020, transparent: true, opacity: 0.45 });
  private readonly pendingMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 9, sizeAttenuation: false });

  private segments: readonly Segment[] = [];
  private lines?: LineSegments2;
  private linesStart = -1;
  private readonly mesh: THREE.Mesh;
  private readonly edges: THREE.LineSegments;
  private pending?: THREE.Points;

  constructor() {
    this.group.name = 'drawing';
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.meshMaterial);
    this.edges = new THREE.LineSegments(new THREE.BufferGeometry(), this.edgeMaterial);
    this.mesh.frustumCulled = false;
    this.edges.frustumCulled = false;
    this.group.add(this.mesh, this.edges);
  }

  /** Viewport size in device pixels, needed by the thick-line shader. */
  setResolution(width: number, height: number): void {
    this.lineMaterial.resolution.set(width, height);
  }

  /** Replaces all primitives (disposing the previous buffers) and shows the full range. */
  setPrimitives(segments: readonly Segment[], triangles: readonly Triangle[]): void {
    this.segments = segments;
    this.disposeLines();
    this.buildTriangles(triangles);
    this.setPending([]);
    this.show({ segmentStart: 0, segmentEnd: segments.length, triangleStart: 0, triangleEnd: triangles.length });
  }

  /** Shows only primitives inside the given ranges (used for step-by-step playback and `clear`). */
  show(range: VisibleRange): void {
    if (range.segmentStart !== this.linesStart) this.buildLines(range.segmentStart);
    if (this.lines) {
      const count = range.segmentEnd - range.segmentStart;
      this.lines.geometry.instanceCount = count;
      this.lines.visible = count > 0;
    }
    const start = range.triangleStart * 3;
    const count = (range.triangleEnd - range.triangleStart) * 3;
    this.mesh.geometry.setDrawRange(start, count);
    this.edges.geometry.setDrawRange(start * 2, count * 2);
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
    this.mesh.geometry.dispose();
    this.edges.geometry.dispose();
    for (const material of [this.lineMaterial, this.meshMaterial, this.edgeMaterial, this.pendingMaterial]) {
      material.dispose();
    }
  }

  private disposeLines(): void {
    this.linesStart = -1;
    if (!this.lines) return;
    this.lines.geometry.dispose();
    this.group.remove(this.lines);
    this.lines = undefined;
  }

  /** Builds thick-line buffers for segments from `start` on (rebuilt only after a `clear`). */
  private buildLines(start: number): void {
    this.disposeLines();
    this.linesStart = start;
    const visible = this.segments.slice(start);
    if (visible.length === 0) return;
    const positions = new Float32Array(visible.length * 6);
    const colors = new Float32Array(visible.length * 6);
    const color = new THREE.Color();
    visible.forEach((s, i) => {
      positions.set([s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z], i * 6);
      color.setStyle(s.color);
      colors.set([color.r, color.g, color.b, color.r, color.g, color.b], i * 6);
    });
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    geometry.setColors(colors);
    this.lines = new LineSegments2(geometry, this.lineMaterial);
    this.lines.name = 'lines';
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
  }

  private buildTriangles(triangles: readonly Triangle[]): void {
    const positions = new Float32Array(triangles.length * 9);
    const normals = new Float32Array(triangles.length * 9);
    const colors = new Float32Array(triangles.length * 9);
    const edgePositions = new Float32Array(triangles.length * 18);
    const color = new THREE.Color();
    triangles.forEach((t, i) => {
      const { a, b, c, normal: n } = t;
      positions.set([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], i * 9);
      normals.set([n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z], i * 9);
      color.setStyle(t.color);
      colors.set([color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b], i * 9);
      // Edges left out of the outline (polygon diagonals) collapse to invisible zero-length lines.
      const edge = (bit: number, p: typeof a, q: typeof a) => (t.edges & bit ? [p.x, p.y, p.z, q.x, q.y, q.z] : [p.x, p.y, p.z, p.x, p.y, p.z]);
      edgePositions.set([...edge(1, a, b), ...edge(2, b, c), ...edge(4, c, a)], i * 18);
    });

    this.mesh.geometry.dispose();
    const mesh = new THREE.BufferGeometry();
    mesh.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    mesh.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    mesh.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.mesh.geometry = mesh;

    this.edges.geometry.dispose();
    const edges = new THREE.BufferGeometry();
    edges.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    this.edges.geometry = edges;
  }
}
