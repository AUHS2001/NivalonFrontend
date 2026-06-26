import { useRef, useCallback, useState, useEffect } from 'react';
import * as THREE from 'three';
import {
  Enums,
  getRenderingEngine,
  utilities as csUtils,
  cache,
} from '@cornerstonejs/core';

interface UseCenterLineProps {
  meshRefs: React.RefObject<{ left: THREE.Mesh[]; right: THREE.Mesh[] }>;
  leftSceneRef: React.RefObject<THREE.Scene>;
  rightSceneRef: React.RefObject<THREE.Scene>;
  servicesManager?: any;
}

export const useCenterLine = ({
  meshRefs,
  leftSceneRef,
  rightSceneRef,
  servicesManager
}: UseCenterLineProps) => {
  const centerLineRefs = useRef<{
    left: THREE.Mesh | null;
    right: THREE.Mesh | null;
    leftGlow: THREE.Mesh | null;
    rightGlow: THREE.Mesh | null;
    dicomCanvases: Map<string, HTMLCanvasElement>;
  }>({ left: null, right: null, leftGlow: null, rightGlow: null, dicomCanvases: new Map() });

  const originalMaterials = useRef<{
    left: (THREE.Material | THREE.Material[])[];
    right: (THREE.Material | THREE.Material[])[];
  }>({ left: [], right: [] });

  const [centerLineEnabled, setCenterLineEnabled] = useState(false);
  const [transparencyEnabled, setTransparencyEnabled] = useState(true);

  // Store centerline points in both coordinate systems
  const centerLineWorldPointsRef = useRef<Array<[number, number, number]>>([]);
  const vertebraNamesRef = useRef<string[]>([]);
  const stlBoundsRef = useRef<{ min: THREE.Vector3; max: THREE.Vector3 } | null>(null);
  const volumeBoundsRef = useRef<{ origin: number[]; dimensions: number[]; spacing: number[] } | null>(null);
  const canalOffsetRef = useRef<number>(15); // Anatomy-based canal offset in mm

  // Store event listeners for cleanup
  const eventListenersRef = useRef<Array<{ element: any; event: string; handler: (e: any) => void }>>([]);

  /**
   * Get Cornerstone viewports and volume bounds from servicesManager
   */
  const getCornerstoneViewportsAndBounds = useCallback(() => {
    const { cornerstoneViewportService, viewportGridService } = servicesManager?.services || {};

    if (!cornerstoneViewportService || !viewportGridService) {
      console.log('Cornerstone services not available');
      return { viewports: [], volumeBounds: null };
    }

    const viewportState = viewportGridService.getState();
    const viewports = viewportState?.viewports;

    if (!viewports) return { viewports: [], volumeBounds: null };

    const result: Array<{
      viewportId: string;
      viewport: any;
      element: HTMLElement;
      orientation: string;
    }> = [];

    let volumeBounds: { origin: number[]; dimensions: number[]; spacing: number[]; direction: number[] } | null = null;

    const viewportEntries = viewports instanceof Map
      ? Array.from(viewports.entries())
      : Object.entries(viewports);

    viewportEntries.forEach(([viewportId, viewportInfo]: [string, any]) => {
      const viewportOptions = viewportInfo?.viewportOptions || {};

      // Skip STL (3D) viewport
      if (viewportOptions.customLayout === 'stl' || viewportId === 'stlViewport') {
        return;
      }

      try {
        const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
        if (viewport && viewport.element) {
          const orientation = viewportOptions.orientation || 'axial';
          result.push({
            viewportId,
            viewport,
            element: viewport.element,
            orientation
          });

          // Try to get volume bounds from this viewport
          if (!volumeBounds) {
            try {
              const imageData = viewport.getImageData?.();
              if (imageData) {
                volumeBounds = {
                  origin: imageData.origin || [0, 0, 0],
                  dimensions: imageData.dimensions || [512, 512, 100],
                  spacing: imageData.spacing || [1, 1, 1],
                  direction: imageData.direction || [1, 0, 0, 0, 1, 0, 0, 0, 1]
                };
              }
            } catch (e) {
              console.warn('Could not get image data from viewport');
            }
          }
        }
      } catch (e) {
        console.warn(`Error getting viewport ${viewportId}:`, e);
      }
    });

    return { viewports: result, volumeBounds };
  }, [servicesManager]);

  /**
   * Detect spinal foramen center by scanning from posterior toward anterior.
   * The foramen is the dark gap between laminae (bone) and vertebral body (bone).
   */
  const detectCanalPureDICOMHook = useCallback((): Array<[number, number, number]> | null => {
    const { viewports } = getCornerstoneViewportsAndBounds();
    if (viewports.length === 0) return null;

    let scalarData: any = null;
    let dims: number[] = [], sp: number[] = [], ori: number[] = [];
    let dir: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    let vtkImgData: any = null;

    for (const { viewport } of viewports) {
      try {
        let vol: any = null;
        if (typeof viewport.getAllVolumeIds === 'function') {
          const volumeIds = viewport.getAllVolumeIds();
          for (const vid of volumeIds) { vol = (cache as any).getVolume?.(vid); if (vol) break; }
        }
        if (!vol) {
          const actors = viewport.getActors?.();
          if (actors?.length) { vol = (cache as any).getVolume?.((actors[0] as any).referencedId || actors[0].uid); }
        }
        if (!vol) continue;
        try { scalarData = vol.getScalarData(); }
        catch { scalarData = vol.voxelManager?.getCompleteScalarDataArray?.(); }
        dims = Array.from(vol.dimensions);
        sp = Array.from(vol.spacing);
        ori = Array.from(vol.origin);
        if (vol.direction) dir = Array.from(vol.direction);
        try { vtkImgData = vol.imageData; } catch {}
        break;
      } catch (e) { continue; }
    }

    if (!scalarData || dims.length < 3 || dims[0] === 0) return null;

    const sliceSize = dims[0] * dims[1];
    const getV = (x: number, y: number, z: number): number | null => {
      if (x < 0 || x >= dims[0] || y < 0 || y >= dims[1] || z < 0 || z >= dims[2]) return null;
      return scalarData[x + y * dims[0] + z * sliceSize];
    };
    const i2w = (ix: number, iy: number, iz: number): [number, number, number] => {
      if (vtkImgData && typeof vtkImgData.indexToWorld === 'function') {
        const out: [number, number, number] = [0, 0, 0];
        vtkImgData.indexToWorld([ix, iy, iz], out);
        return out;
      }
      const sx = ix * sp[0], sy = iy * sp[1], sz = iz * sp[2];
      return [
        ori[0] + dir[0] * sx + dir[1] * sy + dir[2] * sz,
        ori[1] + dir[3] * sx + dir[4] * sy + dir[5] * sz,
        ori[2] + dir[6] * sx + dir[7] * sy + dir[8] * sz,
      ];
    };

    const jDirY = dir[4];
    const posteriorIsHighJ = jDirY >= 0;

    let gMin = Infinity, gMax = -Infinity;
    const sampleStepZ = Math.max(1, Math.floor(dims[2] / 20));
    for (let iz = 0; iz < dims[2]; iz += sampleStepZ) {
      for (let iy = 0; iy < dims[1]; iy += 4) {
        for (let ix = 0; ix < dims[0]; ix += 4) {
          const v = getV(ix, iy, iz);
          if (v !== null) { if (v < gMin) gMin = v; if (v > gMax) gMax = v; }
        }
      }
    }
    if (gMax - gMin < 200) return null;

    const BONE_HU = 200;
    const SOFT_HU = 100;
    const CANAL_MAX_HU = 80;

    function scanColumn(ix: number, iz: number, yStart: number, yEnd: number, yStep: number): number | null {
      let scanState: 'seeking_bone' | 'in_bone' | 'in_canal' = 'seeking_bone';
      let bonePixelsSeen = 0;
      let canalStart = -1, canalEnd = -1;
      let transitionStart = -1; // Track continuous transition zone for VB cortex detection
      const darkVoxels: Array<{ iy: number; v: number }> = [];

      for (let iy = yStart; yStep > 0 ? iy <= yEnd : iy >= yEnd; iy += yStep) {
        const v = getV(ix, iy, iz);
        if (v === null) continue;

        if (scanState === 'seeking_bone') {
          if (v >= BONE_HU) { scanState = 'in_bone'; bonePixelsSeen = 1; }
        } else if (scanState === 'in_bone') {
          if (v >= BONE_HU) { bonePixelsSeen++; }
          else if (v < SOFT_HU && bonePixelsSeen >= Math.max(2, Math.ceil(1.5 / sp[1]))) {
            scanState = 'in_canal'; canalStart = iy;
            if (v < CANAL_MAX_HU) darkVoxels.push({ iy, v });
          } else if (v < BONE_HU) {
            if (bonePixelsSeen < Math.max(2, Math.ceil(1.5 / sp[1]))) { scanState = 'seeking_bone'; bonePixelsSeen = 0; }
            else { scanState = 'in_canal'; canalStart = iy; if (v < CANAL_MAX_HU) darkVoxels.push({ iy, v }); }
          }
        } else if (scanState === 'in_canal') {
          if (v < CANAL_MAX_HU) {
            if (transitionStart !== -1 && Math.abs(iy - transitionStart) * sp[1] >= 2) break;
            transitionStart = -1; canalEnd = iy; darkVoxels.push({ iy, v });
          }
          else if (v >= BONE_HU) { if (canalEnd === -1) canalEnd = iy - yStep; break; }
          else { if (transitionStart === -1) transitionStart = iy; const gapMM = Math.abs(iy - canalStart) * sp[1]; if (gapMM > 20) break; canalEnd = iy; }
        }
      }

      if (canalStart === -1 || canalEnd === -1) return null;
      const canalSizeMM = Math.abs(canalEnd - canalStart) * sp[1];
      if (canalSizeMM < 3 || canalSizeMM > 25) return null;
      // Trimmed mean of dark voxels — strip outermost 20% (LF posteriorly, PLL anteriorly)
      if (darkVoxels.length >= 2) {
        darkVoxels.sort((a, b) => a.iy - b.iy);
        const trim = darkVoxels.length >= 6 ? Math.max(1, Math.floor(darkVoxels.length * 0.20)) : 0;
        const trimmed = darkVoxels.slice(trim, darkVoxels.length - trim);
        let wSum = 0;
        for (const { iy } of trimmed) wSum += iy;
        return Math.round(wSum / trimmed.length);
      }
      return Math.round((canalStart + canalEnd) / 2);
    }

    function detectSlice(iz: number, searchCenterX: number, searchRangeX: number): { ix: number; iy: number } | null {
      const xLo = Math.max(0, searchCenterX - searchRangeX);
      const xHi = Math.min(dims[0] - 1, searchCenterX + searchRangeX);
      let yStart: number, yEnd: number, yStep: number;
      if (posteriorIsHighJ) { yStart = dims[1] - 1; yEnd = Math.floor(dims[1] * 0.2); yStep = -1; }
      else { yStart = 0; yEnd = Math.floor(dims[1] * 0.8); yStep = 1; }
      // Scan every ~1mm for dense sampling
      const scanStep = Math.max(1, Math.ceil(1 / sp[0]));
      const results: Array<{ ix: number; iy: number }> = [];
      for (let ix = xLo; ix <= xHi; ix += scanStep) {
        const canalY = scanColumn(ix, iz, yStart, yEnd, yStep);
        if (canalY !== null) results.push({ ix, iy: canalY });
      }
      if (results.length < 2) return null;
      const sortedIxs = results.map(r => r.ix).sort((a, b) => a - b);
      const sortedIys = results.map(r => r.iy).sort((a, b) => a - b);
      const medIdx = Math.floor(results.length / 2);
      let bestIx = sortedIxs[medIdx];
      let bestIy = sortedIys[medIdx];

      // --- 2D DT helper: compute chamfer DT + weighted centroid in ROI ---
      function dtRefine(cx: number, cy: number, halfMM: number): { ix: number; iy: number } | null {
        const half = Math.ceil(halfMM / Math.min(sp[0], sp[1]));
        const x0 = Math.max(0, cx - half), x1 = Math.min(dims[0] - 1, cx + half);
        const y0 = Math.max(0, cy - half), y1 = Math.min(dims[1] - 1, cy + half);
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        if (w < 6 || h < 6) return null;
        const INF = 9999;
        const dt = new Uint16Array(w * h);
        for (let ry = 0; ry < h; ry++)
          for (let rx = 0; rx < w; rx++) {
            const v = getV(x0 + rx, y0 + ry, iz);
            // Use CANAL_MAX_HU barrier: isolates canal (<80 HU) from VB marrow/muscle
            dt[rx + ry * w] = (v !== null && v >= CANAL_MAX_HU) ? 0 : INF;
          }
        for (let ry = 1; ry < h - 1; ry++)
          for (let rx = 1; rx < w - 1; rx++) {
            const i = rx + ry * w;
            dt[i] = Math.min(dt[i], dt[(rx-1)+(ry-1)*w]+4, dt[rx+(ry-1)*w]+3, dt[(rx+1)+(ry-1)*w]+4, dt[(rx-1)+ry*w]+3);
          }
        for (let ry = h - 2; ry >= 1; ry--)
          for (let rx = w - 2; rx >= 1; rx--) {
            const i = rx + ry * w;
            dt[i] = Math.min(dt[i], dt[(rx+1)+(ry+1)*w]+4, dt[rx+(ry+1)*w]+3, dt[(rx-1)+(ry+1)*w]+4, dt[(rx+1)+ry*w]+3);
          }
        let peakD = 0, pRx = -1, pRy = -1;
        const m = 3;
        for (let ry = m; ry < h - m; ry++)
          for (let rx = m; rx < w - m; rx++) {
            const d = dt[rx + ry * w];
            if (d <= 0 || d >= INF) continue;
            const v = getV(x0 + rx, y0 + ry, iz);
            if (v === null || v >= 50) continue;
            if (d > peakD) { peakD = d; pRx = rx; pRy = ry; }
          }
        if (pRx < 0) return null;
        // Collect contributing voxels for coordinate-wise trimmed centroid
        const cR = Math.max(3, Math.round(peakD / 6));
        const cPts: { x: number; y: number; d: number }[] = [];
        for (let dy = -cR; dy <= cR; dy++)
          for (let dx = -cR; dx <= cR; dx++) {
            const rx = pRx + dx, ry = pRy + dy;
            if (rx < 0 || rx >= w || ry < 0 || ry >= h) continue;
            const d = dt[rx + ry * w];
            if (d <= 0 || d >= INF) continue;
            const v = getV(x0 + rx, y0 + ry, iz);
            if (v === null || v >= 50) continue;
            cPts.push({ x: x0 + rx, y: y0 + ry, d });
          }
        if (cPts.length >= 4) {
          // Trim outermost 15% in X to remove lateral boundary bias
          cPts.sort((a, b) => a.x - b.x);
          const tX = cPts.length >= 10 ? Math.max(1, Math.floor(cPts.length * 0.15)) : 0;
          let trimmed = cPts.slice(tX, cPts.length - tX);
          // Trim outermost 15% in Y to remove anterior/posterior boundary bias
          trimmed.sort((a, b) => a.y - b.y);
          const tY = trimmed.length >= 10 ? Math.max(1, Math.floor(trimmed.length * 0.15)) : 0;
          trimmed = trimmed.slice(tY, trimmed.length - tY);
          let wcX = 0, wcY = 0, wcW = 0;
          for (const p of trimmed) { wcX += p.x * p.d; wcY += p.y * p.d; wcW += p.d; }
          if (wcW > 0) return { ix: Math.round(wcX / wcW), iy: Math.round(wcY / wcW) };
        }
        return { ix: x0 + pRx, iy: y0 + pRy };
      }

      // Two-iteration DT refinement: coarse (±15mm) then tight (±8mm)
      // Clamp Y after each pass to prevent anterior drift through leaky DT boundaries
      const anchorIy = bestIy;
      const yClampPx = Math.ceil(5 / sp[1]);
      const pass1 = dtRefine(bestIx, bestIy, 15);
      if (pass1) { bestIx = pass1.ix; bestIy = Math.max(anchorIy - yClampPx, Math.min(anchorIy + yClampPx, pass1.iy)); }
      const pass2 = dtRefine(bestIx, bestIy, 8);
      if (pass2) { bestIx = pass2.ix; bestIy = Math.max(anchorIy - yClampPx, Math.min(anchorIy + yClampPx, pass2.iy)); }

      return { ix: bestIx, iy: bestIy };
    }

    const coarseStep = Math.max(1, Math.round(4 / sp[2]));
    const xCenter = Math.floor(dims[0] / 2);
    const xSearchHalf = Math.floor(dims[0] * 0.15);
    const coarseResults: Array<{ ix: number; iy: number; iz: number }> = [];
    for (let iz = 0; iz < dims[2]; iz += coarseStep) {
      const r = detectSlice(iz, xCenter, xSearchHalf);
      if (r) coarseResults.push({ ...r, iz });
    }
    if (coarseResults.length < 3) return null;

    const sortedXs = coarseResults.map(r => r.ix).sort((a, b) => a - b);
    const globalMedianX = sortedXs[Math.floor(sortedXs.length / 2)];
    coarseResults.sort((a, b) => a.iz - b.iz);

    const fineStep = Math.max(1, Math.round(2 / sp[2]));
    const refinedXRange = Math.ceil(12 / sp[0]); // ±12mm around adaptive center
    const rawDetections = new Map<number, { ix: number; iy: number }>();

    // Adaptive X center: interpolate from coarse results per-slice
    function getAdaptiveX(iz: number): number {
      if (coarseResults.length === 0) return globalMedianX;
      if (iz <= coarseResults[0].iz) return coarseResults[0].ix;
      if (iz >= coarseResults[coarseResults.length - 1].iz) return coarseResults[coarseResults.length - 1].ix;
      for (let i = 0; i < coarseResults.length - 1; i++) {
        if (iz >= coarseResults[i].iz && iz <= coarseResults[i + 1].iz) {
          const t = (iz - coarseResults[i].iz) / (coarseResults[i + 1].iz - coarseResults[i].iz);
          return Math.round(coarseResults[i].ix + t * (coarseResults[i + 1].ix - coarseResults[i].ix));
        }
      }
      return globalMedianX;
    }

    for (let iz = 0; iz < dims[2]; iz += fineStep) {
      const r = detectSlice(iz, getAdaptiveX(iz), refinedXRange);
      if (r) rawDetections.set(iz, r);
    }

    // Interpolation
    const allFineSlices: number[] = [];
    for (let iz = 0; iz < dims[2]; iz += fineStep) allFineSlices.push(iz);
    const detSlices = Array.from(rawDetections.keys()).sort((a, b) => a - b);
    const minZ = detSlices.length > 0 ? detSlices[0] : 0;
    const maxZ = detSlices.length > 0 ? detSlices[detSlices.length - 1] : 0;
    for (const iz of allFineSlices) {
      if (rawDetections.has(iz) || iz < minZ || iz > maxZ) continue;
      const maxGap = Math.ceil(40 / sp[2]);
      let above: { iz: number; ix: number; iy: number } | null = null;
      let below: { iz: number; ix: number; iy: number } | null = null;
      for (let d = fineStep; d <= maxGap; d += fineStep) {
        if (!above && iz-d >= 0 && rawDetections.has(iz-d)) { const r = rawDetections.get(iz-d)!; above = { iz: iz-d, ix: r.ix, iy: r.iy }; }
        if (!below && iz+d < dims[2] && rawDetections.has(iz+d)) { const r = rawDetections.get(iz+d)!; below = { iz: iz+d, ix: r.ix, iy: r.iy }; }
        if (above && below) break;
      }
      if (above && below) {
        const t = (iz - above.iz) / (below.iz - above.iz);
        rawDetections.set(iz, { ix: Math.round(above.ix + (below.ix - above.ix) * t), iy: Math.round(above.iy + (below.iy - above.iy) * t) });
      }
    }

    const sortedSlices = Array.from(rawDetections.keys()).sort((a, b) => a - b);
    if (sortedSlices.length < 5) return null;
    const tracked = sortedSlices.map(iz => { const r = rawDetections.get(iz)!; return { ix: r.ix, iy: r.iy, iz }; });

    // Outlier rejection: clamp points deviating >8mm from local trend
    // Edge-aware: extend window inward at endpoints for stable median
    const OUTLIER_W = Math.max(8, Math.ceil(20 / sp[2]));
    const MAX_DEV_X = Math.ceil(8 / sp[0]);
    const MAX_DEV_Y = Math.ceil(8 / sp[1]);
    const minCtx = Math.min(OUTLIER_W * 2 + 1, tracked.length);
    const cleaned: typeof tracked = [];
    for (let i = 0; i < tracked.length; i++) {
      let lo = Math.max(0, i - OUTLIER_W);
      let hi = Math.min(tracked.length - 1, i + OUTLIER_W);
      // At edges, extend window inward to get enough context
      if (hi - lo + 1 < minCtx) {
        if (lo === 0) hi = Math.min(tracked.length - 1, minCtx - 1);
        else if (hi === tracked.length - 1) lo = Math.max(0, tracked.length - minCtx);
      }
      const wxs: number[] = [], wys: number[] = [];
      for (let j = lo; j <= hi; j++) {
        wxs.push(tracked[j].ix); wys.push(tracked[j].iy);
      }
      wxs.sort((a, b) => a - b); wys.sort((a, b) => a - b);
      const localMedX = wxs[Math.floor(wxs.length / 2)];
      const localMedY = wys[Math.floor(wys.length / 2)];
      let cx = tracked[i].ix, cy = tracked[i].iy;
      if (Math.abs(cx - localMedX) > MAX_DEV_X) cx = localMedX + Math.sign(cx - localMedX) * MAX_DEV_X;
      if (Math.abs(cy - localMedY) > MAX_DEV_Y) cy = localMedY + Math.sign(cy - localMedY) * MAX_DEV_Y;
      cleaned.push({ ix: cx, iy: cy, iz: tracked[i].iz });
    }

    // Smoothing: single pass Median (±5) then Mean (±3)
    const MED_W = 5;
    const medFiltered: typeof tracked = [];
    for (let i = 0; i < cleaned.length; i++) {
      const wxs: number[] = [], wys: number[] = [];
      for (let j = Math.max(0, i - MED_W); j <= Math.min(cleaned.length - 1, i + MED_W); j++) {
        wxs.push(cleaned[j].ix); wys.push(cleaned[j].iy);
      }
      wxs.sort((a, b) => a - b); wys.sort((a, b) => a - b);
      medFiltered.push({ ix: wxs[Math.floor(wxs.length / 2)], iy: wys[Math.floor(wys.length / 2)], iz: cleaned[i].iz });
    }
    const MEAN_W = 3;
    let smoothedArr: typeof tracked = [];
    for (let i = 0; i < medFiltered.length; i++) {
      let sIx = 0, sIy = 0, cnt = 0;
      for (let j = Math.max(0, i - MEAN_W); j <= Math.min(medFiltered.length - 1, i + MEAN_W); j++) {
        sIx += medFiltered[j].ix; sIy += medFiltered[j].iy; cnt++;
      }
      smoothedArr.push({ ix: Math.round(sIx / cnt), iy: Math.round(sIy / cnt), iz: medFiltered[i].iz });
    }

    // Endpoint extrapolation: replace unreliable edge points with interior trend
    const EXTRAP_N = 3;
    const FIT_N = 8;
    if (smoothedArr.length > EXTRAP_N + FIT_N + 2) {
      // Low-Z end
      const fitLo = EXTRAP_N;
      const fitHiLo = Math.min(smoothedArr.length - 1, EXTRAP_N + FIT_N);
      if (fitHiLo > fitLo + 1) {
        const dxPerStep = (smoothedArr[fitHiLo].ix - smoothedArr[fitLo].ix) / (fitHiLo - fitLo);
        const dyPerStep = (smoothedArr[fitHiLo].iy - smoothedArr[fitLo].iy) / (fitHiLo - fitLo);
        for (let i = EXTRAP_N - 1; i >= 0; i--) {
          const steps = fitLo - i;
          smoothedArr[i].ix = Math.round(smoothedArr[fitLo].ix - dxPerStep * steps);
          smoothedArr[i].iy = Math.round(smoothedArr[fitLo].iy - dyPerStep * steps);
        }
      }
      // High-Z end
      const fitHi = smoothedArr.length - 1 - EXTRAP_N;
      const fitLoHi = Math.max(0, smoothedArr.length - 1 - EXTRAP_N - FIT_N);
      if (fitHi > fitLoHi + 1) {
        const dxPerStep = (smoothedArr[fitHi].ix - smoothedArr[fitLoHi].ix) / (fitHi - fitLoHi);
        const dyPerStep = (smoothedArr[fitHi].iy - smoothedArr[fitLoHi].iy) / (fitHi - fitLoHi);
        for (let i = fitHi + 1; i < smoothedArr.length; i++) {
          const steps = i - fitHi;
          smoothedArr[i].ix = Math.round(smoothedArr[fitHi].ix + dxPerStep * steps);
          smoothedArr[i].iy = Math.round(smoothedArr[fitHi].iy + dyPerStep * steps);
        }
      }
    }

    const maxXDev = Math.ceil(12 / sp[0]);
    for (const p of smoothedArr) {
      if (p.ix > globalMedianX + maxXDev) p.ix = globalMedianX + maxXDev;
      if (p.ix < globalMedianX - maxXDev) p.ix = globalMedianX - maxXDev;
    }

    return smoothedArr.map(p => i2w(p.ix, p.iy, p.iz));
  }, [getCornerstoneViewportsAndBounds]);

  /**
   * Transform STL coordinates to DICOM world coordinates
   */
  const transformSTLToDICOMWorld = useCallback((
    stlPoint: THREE.Vector3,
    stlBounds: { min: THREE.Vector3; max: THREE.Vector3 },
    volumeBounds: { origin: number[]; dimensions: number[]; spacing: number[] }
  ): [number, number, number] => {
    // Calculate the size of the STL bounding box
    const stlSize = new THREE.Vector3().subVectors(stlBounds.max, stlBounds.min);
    const stlCenter = new THREE.Vector3().addVectors(stlBounds.min, stlBounds.max).multiplyScalar(0.5);

    // Calculate the size of the DICOM volume in world coordinates
    const volumeSize = [
      volumeBounds.dimensions[0] * volumeBounds.spacing[0],
      volumeBounds.dimensions[1] * volumeBounds.spacing[1],
      volumeBounds.dimensions[2] * volumeBounds.spacing[2]
    ];

    // Calculate volume center in world coordinates
    const volumeCenter = [
      volumeBounds.origin[0] + volumeSize[0] / 2,
      volumeBounds.origin[1] + volumeSize[1] / 2,
      volumeBounds.origin[2] + volumeSize[2] / 2
    ];

    // Get the offset from STL center (preserving actual distances/shape)
    const offsetFromCenter = new THREE.Vector3().subVectors(stlPoint, stlCenter);

    // Calculate uniform scale factor based on the Z axis (superior-inferior)
    // Both STL and DICOM use Z for superior-inferior in LPS
    const stlHeight = stlSize.z; // STL Z is superior-inferior (LPS)
    const volumeHeight = volumeSize[2]; // DICOM Z is superior-inferior (LPS)
    const uniformScale = volumeHeight / stlHeight;

    // Apply uniform scaling to preserve shape
    const scaledOffsetX = offsetFromCenter.x * uniformScale;
    const scaledOffsetY = offsetFromCenter.y * uniformScale;
    const scaledOffsetZ = offsetFromCenter.z * uniformScale;

    // Negate Y: STL +Y is anterior, DICOM LPS +Y is posterior
    const dicomX = volumeCenter[0] + scaledOffsetX;
    const dicomY = volumeCenter[1] - scaledOffsetY;
    const dicomZ = volumeCenter[2] + scaledOffsetZ;

    return [dicomX, dicomY, dicomZ];
  }, []);

  /**
   * Draw centerline on a Cornerstone viewport using worldToCanvas
   */
  const drawCenterlineOnViewport = useCallback((
    viewportId: string,
    viewport: any,
    worldPoints: Array<[number, number, number]>,
    vertebraNames: string[] = []
  ) => {
    if (!viewport || worldPoints.length < 2) return;

    const element = viewport.element;
    if (!element) return;

    // Get or create canvas overlay
    let canvas = centerLineRefs.current.dicomCanvases.get(viewportId);

    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'centerline-overlay-canvas';
      canvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 50;
      `;

      // Append to the viewport element's parent
      const parent = element.parentElement || element;
      parent.style.position = 'relative';
      parent.appendChild(canvas);
      centerLineRefs.current.dicomCanvases.set(viewportId, canvas);
    }

    const rect = element.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get camera info to determine view type
    const camera = viewport.getCamera?.();
    if (!camera) return;

    // Determine view orientation from camera
    const { viewPlaneNormal, focalPoint } = camera;
    const absNormal = viewPlaneNormal.map((n: number) => Math.abs(n));
    const maxIndex = absNormal.indexOf(Math.max(...absNormal));

    let viewType = 'axial';
    if (maxIndex === 0) viewType = 'sagittal';
    else if (maxIndex === 1) viewType = 'coronal';
    else viewType = 'axial';

    // Convert world points to canvas coordinates
    const canvasPoints: Array<{ x: number; y: number; distance: number; originalIndex: number }> = [];

    // Get volume info for calculating world-space offsets
    const imageData = viewport.getImageData?.();
    const volumeSpacing = imageData?.spacing || [1, 1, 1];
    const volumeDimensions = imageData?.dimensions || [512, 512, 100];
    const volumeHeight = volumeDimensions[2] * volumeSpacing[2]; // Z extent in mm

    // Get volume center for reference
    const volumeOrigin = imageData?.origin || [0, 0, 0];
    const volumeCenter = [
      volumeOrigin[0] + (volumeDimensions[0] * volumeSpacing[0]) / 2,
      volumeOrigin[1] + (volumeDimensions[1] * volumeSpacing[1]) / 2,
      volumeOrigin[2] + (volumeDimensions[2] * volumeSpacing[2]) / 2
    ];

    // Calculate volume Y size for axial adjustment
    const volumeYSize = volumeDimensions[1] * volumeSpacing[1]; // Y extent in mm (anterior-posterior)

    worldPoints.forEach((worldPoint, idx) => {
      try {
        // Apply view-specific world coordinate adjustments
        let adjustedWorldPoint = [...worldPoint] as [number, number, number];

        if (viewType === 'sagittal') {
          adjustedWorldPoint[2] = worldPoint[2] - volumeHeight * 0.02;
          // Anatomy-based posterior shift into spinal canal
          adjustedWorldPoint[1] = worldPoint[1] + canalOffsetRef.current;
        } else if (viewType === 'coronal') {
          // For coronal: small downward offset
          adjustedWorldPoint[2] = worldPoint[2] - volumeHeight * 0.02;
        } else if (viewType === 'axial') {
          // Anatomy-based posterior shift into spinal canal
          adjustedWorldPoint[1] = worldPoint[1] + canalOffsetRef.current;
        }

        const canvasPoint = viewport.worldToCanvas(adjustedWorldPoint);
        if (canvasPoint && !isNaN(canvasPoint[0]) && !isNaN(canvasPoint[1])) {
          // Calculate distance from focal plane
          let distance = 0;
          if (viewType === 'axial') {
            distance = Math.abs(worldPoint[2] - focalPoint[2]);
          } else if (viewType === 'sagittal') {
            distance = Math.abs(worldPoint[0] - focalPoint[0]);
          } else if (viewType === 'coronal') {
            distance = Math.abs(worldPoint[1] - focalPoint[1]);
          }

          canvasPoints.push({
            x: canvasPoint[0],
            y: canvasPoint[1],
            distance,
            originalIndex: idx
          });
        }
      } catch (e) {
        // Point couldn't be converted
      }
    });

    if (canvasPoints.length === 0) return;

    // Cyan color scheme (like Canon Vitrea)
    const color = '#00e5ff';
    const glowColor = 'rgba(0, 229, 255, 0.4)';

    ctx.save();

    if (viewType === 'axial') {
      // For axial view, find the point closest to the current slice and draw a crosshair
      const closestPoint = canvasPoints.reduce((prev, curr) =>
        prev.distance < curr.distance ? prev : curr
      );

      // Only draw if the point is close to the current slice (within a threshold)
      const sliceThickness = 10; // mm threshold
      if (closestPoint.distance < sliceThickness) {
        const size = 20;
        const { x, y } = closestPoint;

        // Check if point is within canvas bounds
        if (x >= 0 && x <= canvas.width && y >= 0 && y <= canvas.height) {
          // Draw glow
          ctx.shadowColor = color;
          ctx.shadowBlur = 15;
          ctx.strokeStyle = glowColor;
          ctx.lineWidth = 5;

          ctx.beginPath();
          ctx.moveTo(x - size, y);
          ctx.lineTo(x + size, y);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x, y - size);
          ctx.lineTo(x, y + size);
          ctx.stroke();

          // Draw main crosshair
          ctx.shadowBlur = 0;
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;

          ctx.beginPath();
          ctx.moveTo(x - size, y);
          ctx.lineTo(x + size, y);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x, y - size);
          ctx.lineTo(x, y + size);
          ctx.stroke();

          // Draw center dot
          ctx.beginPath();
          ctx.fillStyle = color;
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();

          // Draw label for closest vertebra
          const name = vertebraNames[closestPoint.originalIndex];
          if (name) {
            ctx.shadowBlur = 0;
            ctx.font = 'bold 14px Arial';
            ctx.fillStyle = color;
            ctx.fillText(name, x + size + 6, y + 5);
          }
        }
      }
    } else {
      // For sagittal and coronal views, draw the full centerline
      const threshold = 500; // mm - large threshold to show all points
      const visiblePoints = canvasPoints.filter(p => p.distance < threshold);

      // Sort by canvas Y to draw a smooth line
      const sortedPoints = [...visiblePoints].sort((a, b) => a.y - b.y);

      if (sortedPoints.length >= 2) {
        // Filter to points within canvas bounds
        const validPoints = sortedPoints.filter(p =>
          p.x >= -50 && p.x <= canvas.width + 50 &&
          p.y >= -50 && p.y <= canvas.height + 50
        );

        if (validPoints.length >= 2) {
          // Draw cross-section lines first (behind everything else)
          validPoints.forEach(point => {
            const name = vertebraNames[point.originalIndex];
            if (name) {
              ctx.beginPath();
              ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
              ctx.lineWidth = 1;
              ctx.setLineDash([4, 4]);
              ctx.moveTo(0, point.y);
              ctx.lineTo(canvas.width, point.y);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          });

          // Smooth curve helper using quadratic Bezier through midpoints
          const drawSmoothCurve = (pts: typeof validPoints) => {
            if (pts.length < 3) {
              pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
              return;
            }
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length - 1; i++) {
              const xc = (pts[i].x + pts[i + 1].x) / 2;
              const yc = (pts[i].y + pts[i + 1].y) / 2;
              ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
            }
            const last = pts[pts.length - 1];
            ctx.lineTo(last.x, last.y);
          };

          // Draw glow path
          ctx.beginPath();
          ctx.strokeStyle = glowColor;
          ctx.lineWidth = 8;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.shadowColor = color;
          ctx.shadowBlur = 20;
          drawSmoothCurve(validPoints);
          ctx.stroke();

          // Draw main path
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 4;
          ctx.shadowBlur = 0;
          drawSmoothCurve(validPoints);
          ctx.stroke();

          // Draw dots at each vertebra center
          validPoints.forEach(point => {
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            ctx.fill();
          });

          // Draw vertebra text labels
          ctx.shadowBlur = 0;
          validPoints.forEach(point => {
            const name = vertebraNames[point.originalIndex];
            if (!name) return;

            const labelX = point.x - 55;
            const labelY = point.y;

            // Draw connecting line from dot to label
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.moveTo(point.x - 5, point.y);
            ctx.lineTo(labelX + 30, labelY);
            ctx.stroke();

            // Draw label background
            ctx.font = 'bold 14px Arial';
            const textWidth = ctx.measureText(name).width;
            const bgPadding = 4;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(
              labelX - bgPadding,
              labelY - 10 - bgPadding,
              textWidth + bgPadding * 2,
              14 + bgPadding * 2
            );

            // Draw label text
            ctx.fillStyle = color;
            ctx.fillText(name, labelX, labelY + 4);
          });
        }
      }
    }

    ctx.restore();
  }, []);

  /**
   * Redraw centerlines on all viewports
   */
  const redrawAllCenterlines = useCallback(() => {
    const worldPoints = centerLineWorldPointsRef.current;
    const names = vertebraNamesRef.current;
    if (worldPoints.length < 2) return;

    const { viewports } = getCornerstoneViewportsAndBounds();
    viewports.forEach(({ viewportId, viewport }) => {
      drawCenterlineOnViewport(viewportId, viewport, worldPoints, names);
    });
  }, [getCornerstoneViewportsAndBounds, drawCenterlineOnViewport]);

  /**
   * Setup event listeners for viewport changes
   */
  const setupEventListeners = useCallback(() => {
    // Clean up existing listeners
    eventListenersRef.current.forEach(({ element, event, handler }) => {
      try { element.removeEventListener(event, handler); } catch (e) {}
    });
    eventListenersRef.current = [];

    const { viewports } = getCornerstoneViewportsAndBounds();

    viewports.forEach(({ viewportId, viewport, element }) => {
      // Debounced redraw handler
      let timeout: NodeJS.Timeout | null = null;
      const handleChange = () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          if (centerLineWorldPointsRef.current.length > 0) {
            drawCenterlineOnViewport(viewportId, viewport, centerLineWorldPointsRef.current, vertebraNamesRef.current);
          }
        }, 16);
      };

      // Cornerstone events
      const cornerstoneEvents = [
        Enums.Events.CAMERA_MODIFIED,
        Enums.Events.VOLUME_NEW_IMAGE,
        Enums.Events.STACK_NEW_IMAGE,
        Enums.Events.IMAGE_RENDERED,
      ];

      cornerstoneEvents.forEach(eventName => {
        if (eventName) {
          element.addEventListener(eventName, handleChange);
          eventListenersRef.current.push({ element, event: eventName, handler: handleChange });
        }
      });

      // Wheel event for scroll
      element.addEventListener('wheel', handleChange);
      eventListenersRef.current.push({ element, event: 'wheel', handler: handleChange });
    });
  }, [getCornerstoneViewportsAndBounds, drawCenterlineOnViewport]);

  /**
   * Remove all DICOM centerlines
   */
  const removeDICOMCenterlines = useCallback(() => {
    // Clean up event listeners
    eventListenersRef.current.forEach(({ element, event, handler }) => {
      try { element.removeEventListener(event, handler); } catch (e) {}
    });
    eventListenersRef.current = [];

    // Remove canvas overlays
    centerLineRefs.current.dicomCanvases.forEach((canvas) => {
      canvas.remove();
    });
    centerLineRefs.current.dicomCanvases.clear();

    // Clear points
    centerLineWorldPointsRef.current = [];
    vertebraNamesRef.current = [];
    stlBoundsRef.current = null;
    volumeBoundsRef.current = null;
  }, []);

  /**
   * Calculate spinal centerline from vertebra meshes and convert to DICOM world coordinates
   */
  const calculateSpinalCenterline = useCallback(() => {
    const meshes = meshRefs.current?.left || [];
    if (meshes.length === 0) {
      console.warn('No meshes found for centerline');
      return null;
    }

    // Filter only vertebrae meshes (C, T, L, S types)
    const vertebrae = meshes.filter(mesh => {
      const userData = mesh.userData;
      return userData && ['C', 'T', 'L', 'S'].includes(userData.type);
    });

    // Sort vertebrae in anatomical order (C1-C7, T1-T12, L1-L5, S1-S5)
    const anatomicalOrder = ['C', 'T', 'L', 'S'];
    const sortedVertebrae = [...(vertebrae.length > 0 ? vertebrae : meshes)].sort((a, b) => {
      const aData = a.userData || {};
      const bData = b.userData || {};
      const aType = aData.type || 'X';
      const bType = bData.type || 'X';
      const aNum = aData.number || 0;
      const bNum = bData.number || 0;

      const typeOrderDiff = anatomicalOrder.indexOf(aType) - anatomicalOrder.indexOf(bType);
      if (typeOrderDiff !== 0) return typeOrderDiff;
      return aNum - bNum;
    });

    // Calculate center points for each vertebra in world coordinates (in anatomical order)
    const centerPoints: THREE.Vector3[] = [];
    const vertebraNames: string[] = [];

    // Calculate overall STL bounds
    const overallBounds = {
      min: new THREE.Vector3(Infinity, Infinity, Infinity),
      max: new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    };

    let totalLocalYExtent = 0;
    let vertebraCount = 0;

    sortedVertebrae.forEach(mesh => {
      const geometry = mesh.geometry;
      geometry.computeBoundingBox();

      const boundingBox = geometry.boundingBox;
      if (boundingBox) {
        // Get center in local space
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);

        // Apply mesh's world matrix to get world position
        center.applyMatrix4(mesh.matrixWorld);
        centerPoints.push(center);

        // Get vertebra name from mesh userData
        const name = mesh.userData?.fullName || 'Unknown';
        vertebraNames.push(name);

        // Accumulate local Y (AP) extent for anatomy-based canal offset
        totalLocalYExtent += (boundingBox.max.y - boundingBox.min.y);
        vertebraCount++;

        // Update overall bounds
        const min = boundingBox.min.clone().applyMatrix4(mesh.matrixWorld);
        const max = boundingBox.max.clone().applyMatrix4(mesh.matrixWorld);
        overallBounds.min.min(min);
        overallBounds.max.max(max);
      }
    });

    if (centerPoints.length < 2) return null;

    stlBoundsRef.current = overallBounds;

    // Get volume bounds from Cornerstone
    const { volumeBounds } = getCornerstoneViewportsAndBounds();

    if (!volumeBounds) {
      volumeBoundsRef.current = {
        origin: [-250, -250, -500],
        dimensions: [512, 512, 200],
        spacing: [1, 1, 2.5]
      };
    } else {
      volumeBoundsRef.current = volumeBounds;
    }

    // Compute anatomy-based canal offset (proportional to actual vertebra size, not volume dimensions)
    const avgVertYExtent = vertebraCount > 0 ? totalLocalYExtent / vertebraCount : 0;
    const stlSizeZ = overallBounds.max.z - overallBounds.min.z;
    const volZ = volumeBoundsRef.current!.dimensions[2] * volumeBoundsRef.current!.spacing[2];
    const uScale = stlSizeZ > 0 ? volZ / stlSizeZ : 1;
    if (avgVertYExtent > 0) {
      canalOffsetRef.current = avgVertYExtent * uScale * 0.20;
    } else {
      canalOffsetRef.current = 15;
    }

    // ===== STL-based calculation (separate) =====
    const stlWorldPoints: Array<[number, number, number]> = centerPoints.map(p =>
      transformSTLToDICOMWorld(p, stlBoundsRef.current!, volumeBoundsRef.current!)
    );

    // ===== DICOM-based calculation (independent of STL) =====
    const dicomCenterline = detectCanalPureDICOMHook();
    if (dicomCenterline && dicomCenterline.length >= 5) {
      // Map STL vertebra Z-levels onto the DICOM-detected canal centerline
      const mappedPoints = stlWorldPoints.map(stlPt => {
        let closest = dicomCenterline[0];
        let closestDist = Math.abs(dicomCenterline[0][2] - stlPt[2]);
        for (const dp of dicomCenterline) {
          const dist = Math.abs(dp[2] - stlPt[2]);
          if (dist < closestDist) { closestDist = dist; closest = dp; }
        }
        return [closest[0], closest[1], stlPt[2]] as [number, number, number];
      });
      canalOffsetRef.current = 0; // DICOM detection already at canal
      return { threePoints: centerPoints, worldPoints: mappedPoints, vertebraNames };
    }

    // Fallback: STL positions with anatomy-based offset
    return { threePoints: centerPoints, worldPoints: stlWorldPoints, vertebraNames };
  }, [meshRefs, getCornerstoneViewportsAndBounds, transformSTLToDICOMWorld, detectCanalPureDICOMHook]);

  /**
   * Create DICOM centerlines on all viewports
   */
  const createDICOMCenterlines = useCallback((centerData: { threePoints: THREE.Vector3[], worldPoints: Array<[number, number, number]>, vertebraNames: string[] }) => {
    centerLineWorldPointsRef.current = centerData.worldPoints;
    vertebraNamesRef.current = centerData.vertebraNames;

    // Wait for viewports to be ready
    setTimeout(() => {
      const { viewports } = getCornerstoneViewportsAndBounds();

      if (viewports.length === 0) {
        setTimeout(() => {
          redrawAllCenterlines();
          setupEventListeners();
        }, 1000);
        return;
      }

      viewports.forEach(({ viewportId, viewport }) => {
        drawCenterlineOnViewport(viewportId, viewport, centerData.worldPoints, centerData.vertebraNames);
      });

      setupEventListeners();
    }, 500);
  }, [getCornerstoneViewportsAndBounds, drawCenterlineOnViewport, setupEventListeners, redrawAllCenterlines]);

  // Material handling functions
  const makeMeshesTransparent = useCallback(() => {
    if (meshRefs.current) {
      originalMaterials.current.left = meshRefs.current.left.map(mesh => {
        if (Array.isArray(mesh.material)) {
          return mesh.material.map(mat => mat.clone());
        } else {
          return mesh.material.clone();
        }
      });

      originalMaterials.current.right = meshRefs.current.right.map(mesh => {
        if (Array.isArray(mesh.material)) {
          return mesh.material.map(mat => mat.clone());
        } else {
          return mesh.material.clone();
        }
      });

      const applyTransparency = (mesh: THREE.Mesh) => {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => {
            if (mat instanceof THREE.Material) {
              mat.transparent = true;
              mat.opacity = 0.2;
              if (mat instanceof THREE.MeshPhongMaterial) {
                mat.color = new THREE.Color(0xffffff);
                mat.emissive = new THREE.Color(0xaaaaaa);
                mat.emissiveIntensity = 0.7;
                mat.needsUpdate = true;
              }
            }
          });
        } else {
          mesh.material.transparent = true;
          mesh.material.opacity = 0.2;
          if (mesh.material instanceof THREE.MeshPhongMaterial) {
            mesh.material.color = new THREE.Color(0xffffff);
            mesh.material.emissive = new THREE.Color(0xaaaaaa);
            mesh.material.emissiveIntensity = 0.7;
            mesh.material.needsUpdate = true;
          }
        }
      };

      meshRefs.current.left.forEach(applyTransparency);
      meshRefs.current.right.forEach(applyTransparency);
    }
  }, [meshRefs]);

  const restoreOriginalMaterials = useCallback(() => {
    if (meshRefs.current && originalMaterials.current.left.length > 0) {
      meshRefs.current.left.forEach((mesh, index) => {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => mat.dispose());
        } else {
          mesh.material.dispose();
        }

        const originalMaterial = originalMaterials.current.left[index];
        if (Array.isArray(originalMaterial)) {
          mesh.material = originalMaterial.map(mat => mat.clone());
        } else {
          mesh.material = (originalMaterial as THREE.Material).clone();
        }
      });

      meshRefs.current.right.forEach((mesh, index) => {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => mat.dispose());
        } else {
          mesh.material.dispose();
        }

        const originalMaterial = originalMaterials.current.right[index];
        if (Array.isArray(originalMaterial)) {
          mesh.material = originalMaterial.map(mat => mat.clone());
        } else {
          mesh.material = (originalMaterial as THREE.Material).clone();
        }
      });

      originalMaterials.current = { left: [], right: [] };
    }
  }, [meshRefs]);

  const toggleTransparency = useCallback(() => {
    if (!centerLineEnabled) return;

    if (transparencyEnabled) {
      // Turn off transparency - restore original materials
      restoreOriginalMaterials();
      setTransparencyEnabled(false);
    } else {
      // Turn on transparency
      makeMeshesTransparent();
      setTransparencyEnabled(true);
    }
  }, [centerLineEnabled, transparencyEnabled, restoreOriginalMaterials, makeMeshesTransparent]);

  const removeCenterLine = useCallback(() => {
    // Remove 3D centerlines
    if (centerLineRefs.current.left) {
      leftSceneRef.current?.remove(centerLineRefs.current.left);
      centerLineRefs.current.left.geometry.dispose();
      (centerLineRefs.current.left.material as THREE.Material).dispose();
    }
    if (centerLineRefs.current.right) {
      rightSceneRef.current?.remove(centerLineRefs.current.right);
      centerLineRefs.current.right.geometry.dispose();
      (centerLineRefs.current.right.material as THREE.Material).dispose();
    }
    if (centerLineRefs.current.leftGlow) {
      leftSceneRef.current?.remove(centerLineRefs.current.leftGlow);
      centerLineRefs.current.leftGlow.geometry.dispose();
      (centerLineRefs.current.leftGlow.material as THREE.Material).dispose();
    }
    if (centerLineRefs.current.rightGlow) {
      rightSceneRef.current?.remove(centerLineRefs.current.rightGlow);
      centerLineRefs.current.rightGlow.geometry.dispose();
      (centerLineRefs.current.rightGlow.material as THREE.Material).dispose();
    }

    // Remove DICOM centerlines
    removeDICOMCenterlines();

    centerLineRefs.current = {
      ...centerLineRefs.current,
      left: null,
      right: null,
      leftGlow: null,
      rightGlow: null
    };

    restoreOriginalMaterials();
    setCenterLineEnabled(false);
    setTransparencyEnabled(true);
  }, [leftSceneRef, rightSceneRef, restoreOriginalMaterials, removeDICOMCenterlines]);

  const showCenterLine = useCallback(() => {
    removeCenterLine();

    const centerData = calculateSpinalCenterline();
    if (!centerData || centerData.threePoints.length < 2) {
      console.warn('Not enough points for centerline');
      return;
    }

    const { threePoints } = centerData;

    // Create 3D tube (cyan color)
    const curve = new THREE.CatmullRomCurve3(threePoints);

    const tubeGeometry = new THREE.TubeGeometry(curve, threePoints.length * 20, 1.5, 8, false);
    const tubeMaterial = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 1.0 });

    const leftTube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    const rightTube = new THREE.Mesh(tubeGeometry.clone(), tubeMaterial);

    const glowTubeGeometry = new THREE.TubeGeometry(curve, threePoints.length * 20, 2.5, 8, false);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x00b8cc, transparent: true, opacity: 0.6 });

    const leftGlowTube = new THREE.Mesh(glowTubeGeometry, glowMaterial);
    const rightGlowTube = new THREE.Mesh(glowTubeGeometry.clone(), glowMaterial);

    leftSceneRef.current?.add(leftGlowTube);
    leftSceneRef.current?.add(leftTube);
    rightSceneRef.current?.add(rightGlowTube);
    rightSceneRef.current?.add(rightTube);

    centerLineRefs.current = {
      ...centerLineRefs.current,
      left: leftTube,
      right: rightTube,
      leftGlow: leftGlowTube,
      rightGlow: rightGlowTube
    };

    // DICOM centerlines are handled by the Spine Label button (spineLabelOverlayManager)
    // so we only create the 3D tube here

    makeMeshesTransparent();
    setCenterLineEnabled(true);
    setTransparencyEnabled(true);
  }, [
    calculateSpinalCenterline,
    leftSceneRef,
    rightSceneRef,
    makeMeshesTransparent,
    removeCenterLine
  ]);

  const toggleCenterLine = useCallback(() => {
    if (centerLineRefs.current.left) {
      removeCenterLine();
    } else {
      showCenterLine();
    }
  }, [showCenterLine, removeCenterLine]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventListenersRef.current.forEach(({ element, event, handler }) => {
        try { element.removeEventListener(event, handler); } catch (e) {}
      });
      centerLineRefs.current.dicomCanvases.forEach(canvas => canvas.remove());
    };
  }, []);

  return {
    showCenterLine,
    removeCenterLine,
    toggleCenterLine,
    toggleTransparency,
    hasCenterLine: !!centerLineRefs.current.left,
    centerLineEnabled,
    transparencyEnabled
  };
};
