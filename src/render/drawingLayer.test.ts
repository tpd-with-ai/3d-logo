import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import type { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { DrawingLayer } from './drawingLayer';
import { runSource } from '../interpreter/interpreter';

function load(layer: DrawingLayer, source: string) {
  const result = runSource(source);
  layer.setPrimitives(result.allSegments, result.allTriangles);
  layer.setPending(result.drawing.pendingPoints);
  return result;
}

/** Every BufferGeometry currently attached to the layer's scene graph. */
function geometries(layer: DrawingLayer): THREE.BufferGeometry[] {
  const found = new Set<THREE.BufferGeometry>(); // translucent back/front meshes share one geometry
  layer.group.traverse((object) => {
    const geometry = (object as THREE.Mesh).geometry;
    if (geometry) found.add(geometry);
  });
  return [...found];
}

const lines = (layer: DrawingLayer) => layer.group.getObjectByName('lines') as LineSegments2 | undefined;
const mesh = (layer: DrawingLayer, name = 'opaque-mesh') => layer.group.getObjectByName(name) as THREE.Mesh;
const translucentMeshes = (layer: DrawingLayer) => layer.group.children.filter((c) => c.name === 'translucent-mesh') as THREE.Mesh[];

describe('DrawingLayer resources', () => {
  it('disposes every geometry from the previous run and keeps the scene graph size stable', () => {
    const layer = new DrawingLayer();
    const source = 'repeat 4 [ fd 10 rt 90 ] color rgba(255, 0, 0, 40) fd 10 triangles fd 10 rt 90 fd 10 color hsva(0, 50, 100, 60) fd 10 pu fd 5 pd';
    load(layer, source);
    const childCount = layer.group.children.length;
    for (let i = 0; i < 5; i++) {
      const previous = geometries(layer);
      const disposed = new Set<THREE.BufferGeometry>();
      for (const g of previous) g.addEventListener('dispose', () => disposed.add(g));
      load(layer, source);
      expect(disposed.size).toBe(previous.length);
      expect(layer.group.children.length).toBe(childCount);
    }
  });

  it('rebuilds lines after a run that drew none', () => {
    const layer = new DrawingLayer();
    load(layer, 'triangles fd 10 rt 90 fd 10');
    expect(lines(layer)).toBeUndefined();
    load(layer, 'fd 10 rt 90 fd 10');
    expect(lines(layer)?.geometry.instanceCount).toBe(2);
  });

  it('shows only the requested ranges, honouring clear and step-by-step playback', () => {
    const layer = new DrawingLayer();
    const result = load(layer, 'fd 10 fd 10 clear fd 10 triangles rt 90 fd 10 rt 90 fd 10 rt 90 fd 10');
    // After `clear`, only the third segment is visible.
    const afterClear = result.frames[2];
    layer.show(afterClear);
    expect(lines(layer)?.visible).toBe(false);
    layer.show(result.frames.at(-1)!);
    expect(lines(layer)?.geometry.instanceCount).toBe(1);
    expect(mesh(layer).geometry.drawRange).toMatchObject({ start: 0, count: 6 });
    layer.show(result.frames[1]); // replay from the start again
    expect(lines(layer)?.geometry.instanceCount).toBe(2);
    expect(mesh(layer).geometry.drawRange.count).toBe(0);
  });

  it('replaces pending-point markers instead of accumulating them', () => {
    const layer = new DrawingLayer();
    load(layer, 'triangles fd 10');
    load(layer, 'triangles fd 10');
    expect(layer.group.children.filter((c) => c.name === 'pending-points')).toHaveLength(1);
    load(layer, 'fd 10');
    expect(layer.group.getObjectByName('pending-points')).toBeUndefined();
  });

  it('keeps opaque primitives on the opaque path and batches translucent ones apart', () => {
    const layer = new DrawingLayer();
    // Lines: opaque, 50 %, 0 %, 50 %, 25 %. Triangles: opaque, 40 %, 0 % (kept but not drawn).
    load(
      layer,
      'fd 10 color rgba(0, 255, 0, 50) fd 10 color rgba(0, 0, 255, 0) fd 10 color rgba(0, 255, 0, 50) fd 10 ' +
        'color hsva(0, 100, 100, 25) fd 10 ' +
        'triangles color red fd 10 rt 120 fd 10 color rgba(0, 0, 255, 40) rt 120 fd 10 color rgba(0, 0, 0, 0) lt 120 fd 10',
    );
    expect(lines(layer)?.geometry.instanceCount).toBe(1);
    const half = layer.group.getObjectByName('lines-50') as LineSegments2;
    expect(half.geometry.instanceCount).toBe(2);
    expect(half.material.transparent).toBe(true);
    expect(half.material.opacity).toBe(0.5);
    expect(half.material.depthWrite).toBe(false);
    expect((layer.group.getObjectByName('lines-25') as LineSegments2).geometry.instanceCount).toBe(1);
    expect(layer.group.getObjectByName('lines-0')).toBeUndefined();
    expect(half.renderOrder).toBeGreaterThan(lines(layer)!.renderOrder);

    const opaque = mesh(layer);
    expect(opaque.material).toMatchObject({ transparent: false });
    expect(opaque.geometry.getAttribute('color').itemSize).toBe(3);
    expect(opaque.geometry.drawRange.count).toBe(3);
    const [back, front] = translucentMeshes(layer);
    expect(back.geometry).toBe(front.geometry);
    expect(back.material).toMatchObject({ transparent: true, depthWrite: false, side: 1 }); // BackSide
    expect(front.material).toMatchObject({ transparent: true, depthWrite: false, side: 0 }); // FrontSide
    expect(back.renderOrder).toBeLessThan(front.renderOrder);
    const color = back.geometry.getAttribute('color');
    expect(color.itemSize).toBe(4);
    expect(back.geometry.drawRange.count).toBe(3); // the alpha-0 triangle is not uploaded
    expect(color.getW(0)).toBeCloseTo(0.4, 6);
  });

  it('maps playback ranges onto each batch', () => {
    const layer = new DrawingLayer();
    const result = load(layer, 'triangles fd 10 rt 120 fd 10 color rgba(255, 0, 0, 50) rt 120 fd 10 color red lt 120 fd 10 color rgba(255, 0, 0, 50) rt 120 fd 10');
    expect(result.allTriangles.map((t) => t.alpha)).toEqual([1, 0.5, 1, 0.5]);
    layer.show({ segmentStart: 0, segmentEnd: 0, triangleStart: 0, triangleEnd: 2 }); // first two steps
    expect(mesh(layer).geometry.drawRange).toMatchObject({ start: 0, count: 3 });
    expect(translucentMeshes(layer)[0].geometry.drawRange).toMatchObject({ start: 0, count: 3 });
    layer.show({ segmentStart: 0, segmentEnd: 0, triangleStart: 1, triangleEnd: 4 }); // as after a clear
    expect(mesh(layer).geometry.drawRange).toMatchObject({ start: 3, count: 3 });
    expect(translucentMeshes(layer)[0].geometry.drawRange).toMatchObject({ start: 0, count: 6 });
  });
});
