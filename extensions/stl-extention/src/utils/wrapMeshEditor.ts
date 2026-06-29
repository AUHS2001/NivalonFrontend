import * as THREE from 'three';

/**
 * Wrap mesh editor — vertex merging, adjacency, influence-based movement,
 * and local Laplacian smoothing for the Wrap tool.
 *
 * Reuses patterns from smoothGeometry.ts (vertex merge, adjacency, Laplacian)
 * but operates on live THREE.Mesh objects rather than raw BufferGeometry.
 */

// ── Types ──

export interface MergedTopology {
  /** For each original vertex index, its merged vertex id */
  mergedId: Int32Array;
  /** For each merged vertex id, list of original vertex indices sharing that position */
  mergedGroups: number[][];
  /** Adjacency list on merged vertices */
  adjList: number[][];
  /** Positions of merged vertices (3 floats per vertex) */
  positions: Float64Array;
  /** Total merged vertex count */
  mergedCount: number;
}

export interface InfluenceVertex {
  /** Merged vertex index */
  mergedIndex: number;
  /** Gaussian weight (0..1) */
  weight: number;
}

// ── Vertex merging (reuses smoothGeometry.ts pattern) ──

export function buildMergedTopology(geometry: THREE.BufferGeometry): MergedTopology {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  if (!posAttr) {
    return { mergedId: new Int32Array(0), mergedGroups: [], adjList: [], positions: new Float64Array(0), mergedCount: 0 };
  }

  const positions = posAttr.array as Float32Array;
  const vertexCount = posAttr.count;

  // Snap positions to grid, group coincident vertices
  const PRECISION = 1e4;
  const posMap = new Map<string, number[]>();

  for (let i = 0; i < vertexCount; i++) {
    const x = Math.round(positions[i * 3] * PRECISION);
    const y = Math.round(positions[i * 3 + 1] * PRECISION);
    const z = Math.round(positions[i * 3 + 2] * PRECISION);
    const key = `${x},${y},${z}`;
    let group = posMap.get(key);
    if (!group) {
      group = [];
      posMap.set(key, group);
    }
    group.push(i);
  }

  const mergedId = new Int32Array(vertexCount);
  const mergedGroups: number[][] = [];
  let nextId = 0;
  for (const group of posMap.values()) {
    const id = nextId++;
    mergedGroups.push(group);
    for (const vi of group) {
      mergedId[vi] = id;
    }
  }
  const mergedCount = nextId;

  // Build adjacency on merged vertices
  const adjSets: Set<number>[] = new Array(mergedCount);
  for (let i = 0; i < mergedCount; i++) adjSets[i] = new Set();

  const addEdge = (a: number, b: number, c: number) => {
    if (a !== b) { adjSets[a].add(b); adjSets[b].add(a); }
    if (a !== c) { adjSets[a].add(c); adjSets[c].add(a); }
    if (b !== c) { adjSets[b].add(c); adjSets[c].add(b); }
  };

  const index = geometry.index;
  if (index) {
    const indices = index.array;
    for (let i = 0; i < indices.length; i += 3) {
      addEdge(mergedId[indices[i]], mergedId[indices[i + 1]], mergedId[indices[i + 2]]);
    }
  } else {
    for (let i = 0; i < vertexCount; i += 3) {
      addEdge(mergedId[i], mergedId[i + 1], mergedId[i + 2]);
    }
  }

  const adjList: number[][] = new Array(mergedCount);
  for (let i = 0; i < mergedCount; i++) adjList[i] = Array.from(adjSets[i]);

  // Extract one position per merged vertex
  const mp = new Float64Array(mergedCount * 3);
  for (let m = 0; m < mergedCount; m++) {
    const vi = mergedGroups[m][0];
    mp[m * 3]     = positions[vi * 3];
    mp[m * 3 + 1] = positions[vi * 3 + 1];
    mp[m * 3 + 2] = positions[vi * 3 + 2];
  }

  return { mergedId, mergedGroups, adjList, positions: mp, mergedCount };
}

// ── Find vertices within influence radius ──

export function findInfluenceVertices(
  topology: MergedTopology,
  worldPoint: [number, number, number],
  radius: number,
): InfluenceVertex[] {
  const result: InfluenceVertex[] = [];
  const sigma = radius / 3;
  const twoSigmaSq = 2 * sigma * sigma;
  const radiusSq = radius * radius;
  const mp = topology.positions;

  for (let m = 0; m < topology.mergedCount; m++) {
    const dx = mp[m * 3]     - worldPoint[0];
    const dy = mp[m * 3 + 1] - worldPoint[1];
    const dz = mp[m * 3 + 2] - worldPoint[2];
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq <= radiusSq) {
      const weight = Math.exp(-distSq / twoSigmaSq);
      result.push({ mergedIndex: m, weight });
    }
  }

  return result;
}

// ── Move vertices with Gaussian falloff influence ──

export function moveVerticesWithInfluence(
  geometry: THREE.BufferGeometry,
  topology: MergedTopology,
  influences: InfluenceVertex[],
  displacement: [number, number, number],
): void {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  if (!posAttr) return;

  const positions = posAttr.array as Float32Array;
  const mp = topology.positions;

  for (const { mergedIndex, weight } of influences) {
    const dx = displacement[0] * weight;
    const dy = displacement[1] * weight;
    const dz = displacement[2] * weight;

    // Update merged position
    mp[mergedIndex * 3]     += dx;
    mp[mergedIndex * 3 + 1] += dy;
    mp[mergedIndex * 3 + 2] += dz;

    // Update ALL original vertices for this merged vertex
    const group = topology.mergedGroups[mergedIndex];
    for (let g = 0; g < group.length; g++) {
      const vi = group[g];
      positions[vi * 3]     += dx;
      positions[vi * 3 + 1] += dy;
      positions[vi * 3 + 2] += dz;
    }
  }

  posAttr.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

// ── Local Laplacian smoothing around edit center ──

export function applyLocalSmoothing(
  geometry: THREE.BufferGeometry,
  topology: MergedTopology,
  editCenter: [number, number, number],
  editRadius: number,
  iterations: number = 3,
  lambda: number = 0.3,
): void {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  if (!posAttr) return;

  const positions = posAttr.array as Float32Array;
  const mp = topology.positions;
  const smoothRadius = editRadius * 2;
  const smoothRadiusSq = smoothRadius * smoothRadius;

  // Find merged vertices within smoothing radius
  const localIndices: number[] = [];
  const localSet = new Set<number>();
  for (let m = 0; m < topology.mergedCount; m++) {
    const dx = mp[m * 3]     - editCenter[0];
    const dy = mp[m * 3 + 1] - editCenter[1];
    const dz = mp[m * 3 + 2] - editCenter[2];
    if (dx * dx + dy * dy + dz * dz <= smoothRadiusSq) {
      localIndices.push(m);
      localSet.add(m);
    }
  }

  if (localIndices.length === 0) return;

  // Plain Laplacian smoothing (no volume preservation for local edits —
  // rescaling a small patch inflates/grows the bone outward)
  for (let iter = 0; iter < iterations; iter++) {
    // Snapshot positions of local vertices
    const prevPos = new Map<number, [number, number, number]>();
    for (const m of localIndices) {
      prevPos.set(m, [mp[m * 3], mp[m * 3 + 1], mp[m * 3 + 2]]);
    }

    for (const m of localIndices) {
      const neighbors = topology.adjList[m];
      const nLen = neighbors.length;
      if (nLen === 0) continue;

      let avgX = 0, avgY = 0, avgZ = 0;
      for (let j = 0; j < nLen; j++) {
        const n = neighbors[j];
        // Use previous position for neighbors that are in local set, current for boundary
        const p = prevPos.get(n);
        if (p) {
          avgX += p[0]; avgY += p[1]; avgZ += p[2];
        } else {
          avgX += mp[n * 3]; avgY += mp[n * 3 + 1]; avgZ += mp[n * 3 + 2];
        }
      }
      avgX /= nLen; avgY /= nLen; avgZ /= nLen;

      const prev = prevPos.get(m)!;
      mp[m * 3]     = prev[0] + lambda * (avgX - prev[0]);
      mp[m * 3 + 1] = prev[1] + lambda * (avgY - prev[1]);
      mp[m * 3 + 2] = prev[2] + lambda * (avgZ - prev[2]);
    }
  }

  // Write merged positions back to all duplicate vertices
  for (const m of localIndices) {
    const group = topology.mergedGroups[m];
    const px = mp[m * 3];
    const py = mp[m * 3 + 1];
    const pz = mp[m * 3 + 2];
    for (let g = 0; g < group.length; g++) {
      const vi = group[g];
      positions[vi * 3]     = px;
      positions[vi * 3 + 1] = py;
      positions[vi * 3 + 2] = pz;
    }
  }

  posAttr.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}
