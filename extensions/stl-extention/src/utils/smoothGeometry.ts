import * as THREE from 'three';
import { MergedTopology } from './wrapMeshEditor';

/**
 * Volume-preserving Laplacian smoothing.
 *
 * STL meshes from voxel segmentations are non-indexed with heavy staircase
 * artifacts.  This function:
 *  1. Merges coincident vertices by position so adjacency spans faces.
 *  2. Runs plain Laplacian smoothing (move each vertex toward the average of
 *     its neighbors by `lambda`).
 *  3. After every iteration, rescales the mesh so its RMS radius from the
 *     centroid matches the original — preventing the shrinkage that plain
 *     Laplacian normally causes.
 *
 * Modifies the geometry's position attribute in-place.
 */
export async function laplacianSmooth(
  geometry: THREE.BufferGeometry,
  iterations: number,
  lambda: number,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  if (!posAttr) return;

  const positions = posAttr.array as Float32Array;
  const vertexCount = posAttr.count;

  // ── 1. Merge coincident vertices by snapping positions ──
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

  // ── 2. Build adjacency on merged vertices ──
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

  // Convert Sets to arrays for faster iteration in the hot loop
  const adjList: number[][] = new Array(mergedCount);
  for (let i = 0; i < mergedCount; i++) adjList[i] = Array.from(adjSets[i]);

  // ── 3. Extract one position per merged vertex ──
  const mp = new Float64Array(mergedCount * 3);
  for (let m = 0; m < mergedCount; m++) {
    const vi = mergedGroups[m][0];
    mp[m * 3]     = positions[vi * 3];
    mp[m * 3 + 1] = positions[vi * 3 + 1];
    mp[m * 3 + 2] = positions[vi * 3 + 2];
  }

  // ── 4. Compute original centroid & RMS radius (for volume preservation) ──
  let origCx = 0, origCy = 0, origCz = 0;
  for (let m = 0; m < mergedCount; m++) {
    origCx += mp[m * 3];
    origCy += mp[m * 3 + 1];
    origCz += mp[m * 3 + 2];
  }
  origCx /= mergedCount;
  origCy /= mergedCount;
  origCz /= mergedCount;

  let origRms = 0;
  for (let m = 0; m < mergedCount; m++) {
    const dx = mp[m * 3]     - origCx;
    const dy = mp[m * 3 + 1] - origCy;
    const dz = mp[m * 3 + 2] - origCz;
    origRms += dx * dx + dy * dy + dz * dz;
  }
  origRms = Math.sqrt(origRms / mergedCount);

  // ── 5. Iterative Laplacian smoothing with volume preservation ──
  for (let iter = 0; iter < iterations; iter++) {
    const prev = new Float64Array(mp);

    for (let m = 0; m < mergedCount; m++) {
      const neighbors = adjList[m];
      const nLen = neighbors.length;
      if (nLen === 0) continue;

      let avgX = 0, avgY = 0, avgZ = 0;
      for (let j = 0; j < nLen; j++) {
        const n = neighbors[j];
        avgX += prev[n * 3];
        avgY += prev[n * 3 + 1];
        avgZ += prev[n * 3 + 2];
      }
      avgX /= nLen;
      avgY /= nLen;
      avgZ /= nLen;

      mp[m * 3]     = prev[m * 3]     + lambda * (avgX - prev[m * 3]);
      mp[m * 3 + 1] = prev[m * 3 + 1] + lambda * (avgY - prev[m * 3 + 1]);
      mp[m * 3 + 2] = prev[m * 3 + 2] + lambda * (avgZ - prev[m * 3 + 2]);
    }

    // Rescale to preserve original RMS radius (prevents shrinkage)
    let cx = 0, cy = 0, cz = 0;
    for (let m = 0; m < mergedCount; m++) {
      cx += mp[m * 3];
      cy += mp[m * 3 + 1];
      cz += mp[m * 3 + 2];
    }
    cx /= mergedCount;
    cy /= mergedCount;
    cz /= mergedCount;

    let rms = 0;
    for (let m = 0; m < mergedCount; m++) {
      const dx = mp[m * 3]     - cx;
      const dy = mp[m * 3 + 1] - cy;
      const dz = mp[m * 3 + 2] - cz;
      rms += dx * dx + dy * dy + dz * dz;
    }
    rms = Math.sqrt(rms / mergedCount);

    if (rms > 1e-10) {
      const scale = origRms / rms;
      for (let m = 0; m < mergedCount; m++) {
        mp[m * 3]     = cx + (mp[m * 3]     - cx) * scale;
        mp[m * 3 + 1] = cy + (mp[m * 3 + 1] - cy) * scale;
        mp[m * 3 + 2] = cz + (mp[m * 3 + 2] - cz) * scale;
      }
    }

    if (onProgress) {
      onProgress(Math.round(((iter + 1) / iterations) * 100));
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // ── 6. Write merged positions back to ALL duplicate vertices ──
  for (let m = 0; m < mergedCount; m++) {
    const group = mergedGroups[m];
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

/**
 * Localized Laplacian smoothing with Gaussian falloff.
 *
 * Smooths vertices within `radius` of `center`, weighting the smoothing
 * strength by a Gaussian so edges of the brush blend smoothly into the
 * unmodified surface.  Operates on a precomputed MergedTopology so it
 * can be called at interactive rates (no vertex-merge overhead per call).
 */
export function localLaplacianSmooth(
  geometry: THREE.BufferGeometry,
  topology: MergedTopology,
  center: THREE.Vector3,
  radius: number,
  iterations: number = 2,
  lambda: number = 0.5,
): void {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  if (!posAttr) return;

  const positions = posAttr.array as Float32Array;
  const mp = topology.positions;
  const radiusSq = radius * radius;
  const sigma = radius / 3;
  const twoSigmaSq = 2 * sigma * sigma;

  // Find merged vertices within radius and compute Gaussian weights
  const localIndices: number[] = [];
  const weights: number[] = [];
  const localSet = new Set<number>();

  for (let m = 0; m < topology.mergedCount; m++) {
    const dx = mp[m * 3]     - center.x;
    const dy = mp[m * 3 + 1] - center.y;
    const dz = mp[m * 3 + 2] - center.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq <= radiusSq) {
      localIndices.push(m);
      weights.push(Math.exp(-distSq / twoSigmaSq));
      localSet.add(m);
    }
  }

  if (localIndices.length === 0) return;

  // Iterative weighted Laplacian smoothing
  for (let iter = 0; iter < iterations; iter++) {
    // Snapshot current positions of local vertices
    const prevPos = new Map<number, [number, number, number]>();
    for (const m of localIndices) {
      prevPos.set(m, [mp[m * 3], mp[m * 3 + 1], mp[m * 3 + 2]]);
    }

    for (let i = 0; i < localIndices.length; i++) {
      const m = localIndices[i];
      const w = weights[i];
      const neighbors = topology.adjList[m];
      const nLen = neighbors.length;
      if (nLen === 0) continue;

      let avgX = 0, avgY = 0, avgZ = 0;
      for (let j = 0; j < nLen; j++) {
        const n = neighbors[j];
        const p = prevPos.get(n);
        if (p) {
          avgX += p[0]; avgY += p[1]; avgZ += p[2];
        } else {
          avgX += mp[n * 3]; avgY += mp[n * 3 + 1]; avgZ += mp[n * 3 + 2];
        }
      }
      avgX /= nLen; avgY /= nLen; avgZ /= nLen;

      const prev = prevPos.get(m)!;
      const effectiveLambda = lambda * w;
      mp[m * 3]     = prev[0] + effectiveLambda * (avgX - prev[0]);
      mp[m * 3 + 1] = prev[1] + effectiveLambda * (avgY - prev[1]);
      mp[m * 3 + 2] = prev[2] + effectiveLambda * (avgZ - prev[2]);
    }
  }

  // Write merged positions back to all duplicate original vertices
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
