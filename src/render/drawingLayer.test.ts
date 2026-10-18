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
  const found: THREE.BufferGeometry[] = [];
  layer.group.traverse((object) => {
    const geometry = (object as THREE.Mesh).geometry;
    if (geometry) found.push(geometry);
  });
  return found;
}

const lines = (layer: DrawingLayer) => layer.group.getObjectByName('lines') as LineSegments2 | undefined;
const mesh = (layer: DrawingLayer) => layer.group.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;

describe('DrawingLayer resources', () => {
  it('disposes every geometry from the previous run and keeps the scene graph size stable', () => {
    const layer = new DrawingLayer();
    load(layer, 'repeat 4 [ fd 10 rt 90 ] triangles fd 10 rt 90 fd 10 pu fd 5 pd');
    const childCount = layer.group.children.length;
    for (let i = 0; i < 5; i++) {
      const previous = geometries(layer);
      const disposed = new Set<THREE.BufferGeometry>();
      for (const g of previous) g.addEventListener('dispose', () => disposed.add(g));
      load(layer, 'repeat 4 [ fd 10 rt 90 ] triangles fd 10 rt 90 fd 10 pu fd 5 pd');
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
});
