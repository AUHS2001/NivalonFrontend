import { useEffect, useRef, useCallback, useState, useContext } from 'react';
import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import {
  RenderingEngine,
  Enums,
  CONSTANTS,
  volumeLoader,
  cache as csCache,
  getRenderingEngine,
  eventTarget,
} from '@cornerstonejs/core';
import { StlInstanceContext } from '../../../../platform/app/src/context/StlInstanceContext';
import { SERVER_URL, fetchFile } from '../../../../config/server';
import { useOvfLegendContext } from '../context/OvfLegendContext';

/**
 * Two-layer rendering:
 * - Layer 1 (bottom): Cornerstone volume3d viewport — grey CT bone volume
 * - Layer 2 (top):    Three.js canvas (alpha:true)  — colored STL vertebral meshes
 *
 * OrbitControls live on the Three.js canvas.
 * On every camera change we render Three.js AND push the camera to Cornerstone.
 * No VTK actor management — STLs are purely Three.js meshes.
 */

const VERTEBRA_PALETTE = [
  0xe53935, 0x43a047, 0xfdd835, 0x8e24aa, 0xfb8c00, 0xf06292,
  0x00acc1, 0x1e88e5, 0xd4e157, 0xff7043, 0x26a69a, 0x5c6bc0,
  0xab47bc, 0x29b6f6, 0xef5350, 0x66bb6a, 0xffa726, 0x7e57c2,
  0x26c6da, 0xec407a, 0x42a5f5, 0xffca28, 0x78909c, 0x8d6e63,
];

const OVF_ENGINE_ID = 'ovfRenderingEngine';
const OVF_VIEWPORT_ID = 'ovfVolume3dViewport';
const OVF_VOLUME_PREFIX = 'ovf-volume';

interface UseOVFSetupProps {
  servicesManager: any;
  commandsManager: any;
  extensionManager?: any;
  dataSource?: any;
  csContainerRef: React.RefObject<HTMLDivElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  threeCanvasRef: React.RefObject<HTMLCanvasElement>;
}

interface UseOVFSetupReturn {
  loading: boolean;
  error: string | null;
  loadProgress: number;
}

function getVertebraInfo(fileName: string) {
  // Match patterns like C7, T12, L3, S1, or standalone S (sacrum merged)
  const match = fileName.match(/(C|T|L|S)(\d+)/i);
  if (match) {
    return { type: match[1].toUpperCase(), number: parseInt(match[2]), fullName: match[0].toUpperCase() };
  }
  // Handle standalone letter without number (e.g. S.stl = merged sacrum)
  const soloMatch = fileName.match(/^(C|T|L|S)\.stl$/i);
  if (soloMatch) {
    return { type: soloMatch[1].toUpperCase(), number: 0, fullName: soloMatch[1].toUpperCase() };
  }
  return null;
}

export function useOVFSetup({
  servicesManager,
  commandsManager,
  extensionManager,
  dataSource,
  csContainerRef,
  containerRef,
  threeCanvasRef,
}: UseOVFSetupProps): UseOVFSetupReturn {
  const stlContext = useContext(StlInstanceContext);
  const stlInstanceId = stlContext?.stlInstanceId;
  const userToken =
    localStorage.getItem('token') ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzIiwicm9sZSI6ImFuYWx5c3QiLCJleHAiOjE3OTYyMDMxNDF9.cLkGlpxslfYOe_ZKuseyCiuP7jsr3m8XXZyyrUU5B1Y';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const { setVertebraLegend, colorsDisabled, hiddenVertebrae, selectedPreset, tissueOpacity } = useOvfLegendContext();
  const originalColorsRef = useRef<Map<THREE.Mesh, number>>(new Map());

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const animLoopRef = useRef<number>(0);
  const csRenderingEngineRef = useRef<RenderingEngine | null>(null);
  const ovfVolumeIdRef = useRef<string | null>(null);
  const csMapperRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const csIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const contextMenuHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const volumeReadyRef = useRef(false);
  const isResizingRef = useRef(false);

  const getDataSource = useCallback(() => {
    if (dataSource) return dataSource;
    if (extensionManager) {
      const dataSources = extensionManager.getDataSources?.();
      if (dataSources && dataSources.length > 0) return dataSources[0];
    }
    return null;
  }, [dataSource, extensionManager]);

  // ─── Push Three.js camera → Cornerstone viewport ───
  const pushCameraToCS = useCallback(() => {
    const camera = cameraRef.current;
    const re = csRenderingEngineRef.current;
    if (!camera || !re || re.hasBeenDestroyed || !volumeReadyRef.current) return;
    try {
      const vp = re.getViewport(OVF_VIEWPORT_ID);
      if (!vp) return;
      const pos = camera.position;
      const target = controlsRef.current?.target || new THREE.Vector3(0, 0, 0);

      // Compute the ACTUAL camera up direction from its quaternion.
      // camera.up is just a fixed world-up hint for OrbitControls — it doesn't
      // change when the camera rotates. The real up is the camera's local Y axis.
      const actualUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

      const dist = pos.distanceTo(target);
      const fovRad = camera.fov * (Math.PI / 180);
      const parallelScale = dist * Math.tan(fovRad / 2);
      (vp as any).setCamera({
        position: [pos.x, pos.y, pos.z],
        focalPoint: [target.x, target.y, target.z],
        viewUp: [actualUp.x, actualUp.y, actualUp.z],
        viewAngle: camera.fov,
        parallelScale,
        clippingRange: [dist * 0.001, dist * 10],
      });
      vp.render();
    } catch (e) { /* not ready */ }
  }, []);

  // ─── Render both layers ───
  const renderBoth = useCallback(() => {
    // Render Three.js (STL meshes on transparent canvas)
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
    // Push camera to Cornerstone and render CT volume
    pushCameraToCS();
  }, [pushCameraToCS]);

  // ─── Setup Three.js renderer + scene + OrbitControls ───
  const setupThreeJS = useCallback(() => {
    const canvas = threeCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 10000);
    cameraRef.current = camera;

    // Renderer — transparent background so CT volume shows through
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(1, 1, 1);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dir2.position.set(-1, -1, -0.5);
    scene.add(dir2);

    // TrackballControls — free 3D rotation like grabbing a ball
    const controls = new TrackballControls(camera, canvas);
    controls.rotateSpeed = 3.0;
    controls.zoomSpeed = 1.5;
    controls.panSpeed = 1.0;
    controls.dynamicDampingFactor = 0.15;
    controls.noRotate = false;
    controls.noZoom = false;
    controls.noPan = false;
    controlsRef.current = controls;

    // Prevent right-click context menu
    const preventContext = (e: MouseEvent) => e.preventDefault();
    contextMenuHandlerRef.current = preventContext;
    canvas.addEventListener('contextmenu', preventContext);

    // On change: render both layers
    controls.addEventListener('change', () => {
      if (csMapperRef.current) csMapperRef.current.setSampleDistance(0.5);
      renderBoth();
      // Full quality after idle
      if (csIdleTimerRef.current) clearTimeout(csIdleTimerRef.current);
      csIdleTimerRef.current = setTimeout(() => {
        if (csMapperRef.current) csMapperRef.current.setSampleDistance(0.2);
        renderBoth();
      }, 200);
    });

    // Animation loop — TrackballControls needs continuous update() for smooth damping
    const animate = () => {
      animLoopRef.current = requestAnimationFrame(animate);
      controls.update();
    };
    animate();
  }, [containerRef, threeCanvasRef, renderBoth]);

  // ─── Setup Cornerstone volume3d viewport (CT bone rendering) ───
  const setupCornerstoneViewport = useCallback(async () => {
    const csContainer = csContainerRef.current;
    if (!csContainer) return;

    const { displaySetService } = servicesManager.services;
    const allDisplaySets = displaySetService.getActiveDisplaySets();
    const ctDisplaySet = allDisplaySets.find(
      (ds: any) => ds.Modality === 'CT' && !ds.isSTL
    );
    if (!ctDisplaySet) {
      console.warn('[OVF] No CT display set found');
      return;
    }

    try {
      // ── Step 1: Get image IDs ──
      let imageIds = ctDisplaySet.imageIds;
      if (!imageIds || imageIds.length === 0) {
        const ds = getDataSource();
        if (ds?.getImageIdsForDisplaySet) imageIds = ds.getImageIdsForDisplaySet(ctDisplaySet);
      }
      if (!imageIds || imageIds.length === 0) {
        if (ctDisplaySet.images?.length > 0) imageIds = ctDisplaySet.images.map((img: any) => img.imageId).filter(Boolean);
      }
      if (!imageIds || imageIds.length === 0) { console.error('[OVF] No imageIds'); return; }

      const ovfVolumeId = `${OVF_VOLUME_PREFIX}:${ctDisplaySet.displaySetInstanceUID}`;
      ovfVolumeIdRef.current = ovfVolumeId;

      // Robust cache cleanup — remove any stale volume from previous loads
      try {
        if (csCache.getVolume(ovfVolumeId)) {
          csCache.removeVolumeLoadObject(ovfVolumeId);
        }
      } catch (e) {
        try { (csCache as any)._volumeCache?.delete(ovfVolumeId); } catch (_) {}
      }

      // ── Step 2: Create volume and load ALL frames BEFORE creating viewport ──
      // We must NOT create the viewport (enableElement) until volume data is
      // fully loaded. If a viewport exists during loading, Cornerstone/VTK
      // internal rendering can trigger shader compilation on empty data,
      // crashing with: "Cannot read properties of null ('isAttributeUsed')"
      const volume = await volumeLoader.createAndCacheVolume(ovfVolumeId, { imageIds });
      (volume as any).autoRenderOnLoad = false;

      await new Promise<void>((resolve) => {
        let resolved = false;
        const done = (source: string) => {
          if (resolved) return;
          resolved = true;
          console.log(`[OVF] Volume loading complete (${source})`);
          cleanupListener();
          resolve();
        };

        const onVolumeLoaded = (evt: any) => {
          const evtVolumeId = evt?.detail?.volumeId;
          if (!evtVolumeId || evtVolumeId === ovfVolumeId) {
            done('event');
          }
        };
        const loadingCompletedEvent = Enums.Events.IMAGE_VOLUME_LOADING_COMPLETED
          || 'CORNERSTONE_IMAGE_VOLUME_LOADING_COMPLETED';
        try {
          eventTarget.addEventListener(loadingCompletedEvent, onVolumeLoaded);
        } catch (_) {}

        const cleanupListener = () => {
          try { eventTarget.removeEventListener(loadingCompletedEvent, onVolumeLoaded); } catch (_) {}
        };

        const poll = () => {
          if (resolved) return;
          if (cancelledRef.current) { done('cancelled'); return; }
          if ((volume as any).loadStatus?.loaded) { done('poll'); return; }
          setTimeout(poll, 200);
        };

        setTimeout(() => { if (!resolved) done('timeout'); }, 60000);

        if ((volume as any).loadStatus?.loaded) {
          done('already-loaded');
          return;
        }

        try {
          (volume as any).load((status: any) => { done('callback'); });
        } catch (_) {
          try { (volume as any).load(); } catch (__) {}
        }

        setTimeout(poll, 500);
      });
      if (cancelledRef.current) return;

      console.log('[OVF] Volume loaded, creating viewport...');

      // ── Step 3: NOW create the viewport — volume data is ready ──
      let renderingEngine = getRenderingEngine(OVF_ENGINE_ID) as RenderingEngine;
      if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
        renderingEngine = new RenderingEngine(OVF_ENGINE_ID);
      }
      csRenderingEngineRef.current = renderingEngine;

      renderingEngine.enableElement({
        viewportId: OVF_VIEWPORT_ID,
        type: Enums.ViewportType.VOLUME_3D,
        element: csContainer,
        defaultOptions: {
          background: [10 / 255, 15 / 255, 23 / 255] as [number, number, number],
        },
      });

      const viewport = renderingEngine.getViewport(OVF_VIEWPORT_ID);
      if (!viewport) return;

      // ── Step 4: Add loaded volume to viewport ──
      try {
        await (viewport as any).setVolumes([{ volumeId: ovfVolumeId }]);
      } catch (setVolErr) {
        console.error('[OVF] setVolumes failed:', setVolErr);
        return;
      }

      const presets = (CONSTANTS as any).VIEWPORT_PRESETS || [];
      const bonePreset = presets.find((p: any) => p.name === 'CT-Bone');
      if (bonePreset) {
        try { (viewport as any).setProperties({ preset: bonePreset }); } catch (_) {}
      }

      // High-quality bone volume rendering
      try {
        const actorEntry = (viewport as any).getDefaultActor?.();
        if (actorEntry?.actor) {
          const property = actorEntry.actor.getProperty();

          // Color: muscles dark grey, bones bright grey/white
          const ctfun = property.getRGBTransferFunction(0);
          ctfun.removeAllPoints();
          ctfun.addRGBPoint(-1000, 0, 0, 0);
          ctfun.addRGBPoint(-50, 0, 0, 0);
          ctfun.addRGBPoint(20, 0.2, 0.2, 0.2);      // muscle: dark grey
          ctfun.addRGBPoint(60, 0.3, 0.3, 0.3);       // muscle: grey
          ctfun.addRGBPoint(100, 0.35, 0.35, 0.35);   // dense tissue: grey
          ctfun.addRGBPoint(150, 0.85, 0.85, 0.85);     // early bone: brighter grey
          ctfun.addRGBPoint(250, 1.0, 1.0, 1.0);      // cancellous bone: white
          ctfun.addRGBPoint(400, 1.0, 1.0, 1.0);      // cortical bone: white
          ctfun.addRGBPoint(700, 1.0, 1.0, 1.0);      // dense bone: white
          ctfun.addRGBPoint(3000, 1.0, 1.0, 1.0);

          // Opacity: hint of muscles, strong bones
          const ofun = property.getScalarOpacity(0);
          ofun.removeAllPoints();
          ofun.addPoint(-1000, 0);
          ofun.addPoint(-50, 0);
          ofun.addPoint(20, 0.02);         // muscle: very faint
          ofun.addPoint(60, 0.04);         // muscle: subtle hint
          ofun.addPoint(100, 0.06);        // dense tissue: slight
          ofun.addPoint(150, 0.2);         // transition to bone
          ofun.addPoint(200, 0.7);         // bone: strong
          ofun.addPoint(300, 0.85);
          ofun.addPoint(500, 0.95);
          ofun.addPoint(800, 1.0);
          ofun.addPoint(3000, 1.0);

          // Gradient opacity — enhances surface detail at bone boundaries
          try {
            const gofun = property.getGradientOpacity(0);
            gofun.removeAllPoints();
            gofun.addPoint(0, 0.2);
            gofun.addPoint(30, 0.5);
            gofun.addPoint(80, 1.0);
            gofun.addPoint(300, 1.0);
            property.setUseGradientOpacity(0, true);
          } catch (_) { /* gradient opacity not supported */ }

          // Shading for realistic 3D appearance
          property.setShade(true);
          property.setAmbient(0.15);
          property.setDiffuse(0.75);
          property.setSpecular(0.4);
          property.setSpecularPower(24);

          const mapper = actorEntry.actor.getMapper?.();
          if (mapper) {
            csMapperRef.current = mapper;
            mapper.setAutoAdjustSampleDistances(false);
            // Lower sample distance = more ray samples = sharper CT
            mapper.setSampleDistance(0.2);
            // Max resolution for volume rendering
            try { mapper.setMaximumSamplesPerRay(4000); } catch (_) {}
          }
        }
      } catch (e) { console.warn('[OVF] Color/LOD setup error:', e); }

      volumeReadyRef.current = true;

      // Render — wrapped in try-catch to prevent Error Boundary crash
      try {
        viewport.render();
      } catch (renderErr) {
        console.warn('[OVF] Initial render failed:', renderErr);
      }
    } catch (err) {
      console.error('[OVF] Cornerstone setup error:', err);
    }
  }, [servicesManager, csContainerRef, getDataSource]);

  // ─── Load STL meshes → Three.js scene ───
  const loadSTLMeshes = useCallback(async () => {
    if (!stlInstanceId) { setError('No STL instance available'); setLoading(false); return; }
    const scene = sceneRef.current;
    if (!scene) { setError('Three.js scene not ready'); setLoading(false); return; }

    try {
      setLoading(true);
      setError(null);
      setLoadProgress(0);

      const response = await fetch(
        `${SERVER_URL}/analyst/meshes?series_instance_uid=${stlInstanceId}`,
        { headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' }, credentials: 'include' }
      );
      if (!response.ok) throw new Error(`Failed to fetch meshes: ${response.status}`);

      const data = await response.json();
      const versions = data?.data?.versions || [];
      const stlUrls: string[] = versions.length > 0
        ? (versions.reduce((a: any, b: any) => (a.version > b.version ? a : b)).urls || [])
        : (data?.data?.processed?.urls || []);
      if (stlUrls.length === 0) throw new Error('No STL URLs returned');

      const vertebraUrls: Array<{ url: string; info: ReturnType<typeof getVertebraInfo> }> = [];
      for (const url of stlUrls) {
        const fileName = url.substring(url.lastIndexOf('/') + 1);
        const info = getVertebraInfo(fileName);
        if (info) vertebraUrls.push({ url, info });
      }
      if (vertebraUrls.length === 0) throw new Error('No vertebral STL files found');

      const order = ['C', 'T', 'L', 'S'];
      vertebraUrls.sort((a, b) => {
        const diff = order.indexOf(a.info!.type) - order.indexOf(b.info!.type);
        return diff !== 0 ? diff : a.info!.number - b.info!.number;
      });

      const stlLoader = new STLLoader();
      let completedCount = 0;
      const legendEntries: Array<{ name: string; color: string }> = [];

      await Promise.all(
        vertebraUrls.map(async ({ url, info }, index) => {
          if (cancelledRef.current) return;
          try {
            const res = await fetchFile(url);
            if (!res.ok) { completedCount++; setLoadProgress(Math.round((completedCount / vertebraUrls.length) * 100)); return; }
            const arrayBuffer = await res.arrayBuffer();

            const geometry = stlLoader.parse(arrayBuffer);
            geometry.computeVertexNormals();

            const color = VERTEBRA_PALETTE[index % VERTEBRA_PALETTE.length];
            const material = new THREE.MeshPhongMaterial({
              color,
              opacity: 0.85,
              transparent: true,
              side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = info!.fullName;

            if (!cancelledRef.current) {
              scene.add(mesh);
              originalColorsRef.current.set(mesh, color);
              legendEntries.push({
                name: info!.fullName,
                color: `#${color.toString(16).padStart(6, '0')}`,
              });
            }

            completedCount++;
            setLoadProgress(Math.round((completedCount / vertebraUrls.length) * 100));
          } catch (err) {
            console.error('[OVF] Failed to load STL:', url, err);
            completedCount++;
            setLoadProgress(Math.round((completedCount / vertebraUrls.length) * 100));
          }
        })
      );

      if (cancelledRef.current) return;

      // Sort legend
      legendEntries.sort((a, b) => {
        const aMatch = a.name.match(/(C|T|L|S)(\d+)/);
        const bMatch = b.name.match(/(C|T|L|S)(\d+)/);
        if (!aMatch || !bMatch) return 0;
        const diff = order.indexOf(aMatch[1]) - order.indexOf(bMatch[1]);
        return diff !== 0 ? diff : parseInt(aMatch[2]) - parseInt(bMatch[2]);
      });
      setVertebraLegend(legendEntries);

      // ─── Initialize camera from STL bounding box for full 3D rotation ───
      // Compute bounding box of all loaded meshes to position camera properly.
      // Using STL bounds (not Cornerstone's camera) ensures OrbitControls
      // gets a sensible initial view with unconstrained 3D rotation.
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (camera && controls) {
        const box = new THREE.Box3();
        scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) box.expandByObject(obj);
        });

        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const dist = maxDim * 1.8;

          // LPS coordinates: L=+X, P=+Y, S=+Z
          // Look from front-left (anterior-left) for a nice 3D view of the spine
          camera.position.set(
            center.x - dist * 0.5,
            center.y - dist,
            center.z
          );
          camera.up.set(0, 0, 1); // Superior (+Z in LPS) points up in view
          camera.fov = 50;
          camera.near = dist * 0.01;
          camera.far = dist * 20;
          camera.updateProjectionMatrix();

          controls.target.copy(center);
          controls.update();
        }
      }

      // Render both layers immediately — Three.js meshes are guaranteed visible
      renderBoth();

      setLoading(false);

      // Render again after loading overlay is removed
      requestAnimationFrame(() => renderBoth());

      console.log('[OVF] STL meshes loaded:', vertebraUrls.length);
    } catch (err: any) {
      console.error('[OVF] Error loading STL meshes:', err);
      setError(err.message || 'Failed to load vertebral meshes');
      setLoading(false);
    }
  }, [stlInstanceId, userToken, renderBoth]);

  // ─── Toggle STL mesh colors (white bone vs colored) ───
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const BONE_WHITE = 0xe8e0d8;
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshPhongMaterial;
      if (!mat || !mat.color) return;
      if (colorsDisabled) {
        mat.color.setHex(BONE_WHITE);
        mat.opacity = 1.0;
      } else {
        const orig = originalColorsRef.current.get(mesh);
        if (orig !== undefined) {
          mat.color.setHex(orig);
          mat.opacity = 0.85;
        }
      }
    });
    renderBoth();
  }, [colorsDisabled, renderBoth]);

  // ─── Toggle individual vertebra visibility ───
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.name) return;
      mesh.visible = !hiddenVertebrae.has(mesh.name);
    });
    renderBoth();
  }, [hiddenVertebrae, renderBoth]);

  // ─── Apply volume rendering preset ───
  useEffect(() => {
    if (!selectedPreset) return;
    const re = csRenderingEngineRef.current;
    if (!re || re.hasBeenDestroyed) return;
    const vp = re.getViewport(OVF_VIEWPORT_ID) as any;
    if (!vp) return;
    const presets = (CONSTANTS as any).VIEWPORT_PRESETS || [];
    const preset = presets.find((p: any) => p.name === selectedPreset);
    if (preset) {
      try {
        vp.setProperties({ preset });
        vp.render();
      } catch (e) { console.warn('[OVF] Preset render error:', e); }
    }
  }, [selectedPreset]);

  // ─── Tissue visibility slider — shift scalar opacity transfer function ───
  useEffect(() => {
    const re = csRenderingEngineRef.current;
    if (!re || re.hasBeenDestroyed || !volumeReadyRef.current) return;
    const vp = re.getViewport(OVF_VIEWPORT_ID) as any;
    if (!vp) return;

    try {
      const actorEntry = vp.getDefaultActor?.();
      if (!actorEntry?.actor) return;
      const property = actorEntry.actor.getProperty();
      const ofun = property.getScalarOpacity(0);

      // t = 0 → bone-only (default), t = 1 → full tissue/muscle visible
      const t = tissueOpacity / 100;

      // Base opacity points (bone-only) → Full tissue opacity points
      // Format: [HU value, bone-only opacity, full-tissue opacity]
      const opacityPoints: [number, number, number][] = [
        [-1000, 0,    0],
        [-50,   0,    0],
        [20,    0.02, 0.45],   // muscle
        [60,    0.04, 0.55],   // muscle
        [100,   0.06, 0.60],   // dense tissue
        [150,   0.20, 0.65],   // transition
        [200,   0.70, 0.75],   // bone
        [300,   0.85, 0.88],
        [500,   0.95, 0.95],
        [800,   1.0,  1.0],
        [3000,  1.0,  1.0],
      ];

      ofun.removeAllPoints();
      for (const [hu, boneOpacity, tissueMax] of opacityPoints) {
        const opacity = boneOpacity + t * (tissueMax - boneOpacity);
        ofun.addPoint(hu, opacity);
      }

      vp.render();
    } catch (e) {
      console.warn('[OVF] Tissue opacity update error:', e);
    }
  }, [tissueOpacity]);

  // ─── Resize handler ───
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleResize = () => {
      if (isResizingRef.current) return;
      isResizingRef.current = true;
      try {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (cameraRef.current) {
          cameraRef.current.aspect = w / h;
          cameraRef.current.updateProjectionMatrix();
        }
        if (rendererRef.current) rendererRef.current.setSize(w, h);
        if (volumeReadyRef.current && csRenderingEngineRef.current && !csRenderingEngineRef.current.hasBeenDestroyed) {
          try { csRenderingEngineRef.current.resize(); } catch (e) { console.warn('[OVF] Resize render error:', e); }
        }
        renderBoth();
      } finally {
        isResizingRef.current = false;
      }
    };
    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, renderBoth]);

  // ─── Main setup effect ───
  useEffect(() => {
    cancelledRef.current = false;
    setupThreeJS();

    const timeout = setTimeout(async () => {
      await setupCornerstoneViewport();
      await loadSTLMeshes();
    }, 300);

    return () => {
      cancelledRef.current = true;
      volumeReadyRef.current = false;
      clearTimeout(timeout);
      setVertebraLegend([]);
      if (csIdleTimerRef.current) clearTimeout(csIdleTimerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (animLoopRef.current) cancelAnimationFrame(animLoopRef.current);

      // Dispose Three.js
      if (controlsRef.current) { controlsRef.current.dispose(); controlsRef.current = null; }
      if (threeCanvasRef.current && contextMenuHandlerRef.current) {
        threeCanvasRef.current.removeEventListener('contextmenu', contextMenuHandlerRef.current);
      }
      if (sceneRef.current) {
        sceneRef.current.traverse((obj) => {
          if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
          if ((obj as THREE.Mesh).material) {
            const mat = (obj as THREE.Mesh).material;
            if (Array.isArray(mat)) mat.forEach(m => m.dispose());
            else mat.dispose();
          }
        });
        sceneRef.current.clear();
        sceneRef.current = null;
      }
      if (rendererRef.current) { rendererRef.current.dispose(); rendererRef.current = null; }

      // Dispose Cornerstone
      if (ovfVolumeIdRef.current) {
        try { csCache.removeVolumeLoadObject(ovfVolumeIdRef.current); } catch (e) { /* ok */ }
      }
      if (csRenderingEngineRef.current && !csRenderingEngineRef.current.hasBeenDestroyed) {
        try {
          csRenderingEngineRef.current.disableElement(OVF_VIEWPORT_ID);
          csRenderingEngineRef.current.destroy();
        } catch (e) { console.warn('[OVF] Cleanup error:', e); }
      }
    };
  }, [setupThreeJS, setupCornerstoneViewport, loadSTLMeshes]);

  return { loading, error, loadProgress };
}

export default useOVFSetup;
