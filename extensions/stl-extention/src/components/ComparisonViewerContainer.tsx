import React, { useContext, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { StlInstanceContext } from '../../../../platform/app/src/context/StlInstanceContext';
import { SERVER_URL } from '../../../../config/server';
import { LPS_UP } from '../utils/coordinateSystem';

interface Series {
  series_instance_uid: string;
  series_number: string;
  description: string;
  modality: string;
  num_series_instances: number;
  instance_urls: string[];
}

interface Study {
  study_instance_uid: string;
  patient_name: string;
  patient_id: string;
  date: string;
  time: string;
  description: string;
  series: Series[];
}

interface ComparisonViewerContainerProps {
  series1: Series | null;
  series2: Series | null;
  study1?: Study | null;
  study2?: Study | null;
  userToken: string;
  onExitComparison: () => void;
}

export const ComparisonViewerContainer: React.FC<ComparisonViewerContainerProps> = ({
  series1,
  series2,
  study1,
  study2,
  userToken,
  onExitComparison
}) => {
  const context = useContext(StlInstanceContext);
  const { seriesName, seriesName1, updateSeriesName, updateSeriesName1 } = context;

  // Mount refs for the two views
  const mount1Ref = useRef<HTMLDivElement>(null);
  const mount2Ref = useRef<HTMLDivElement>(null);

  // THREE.js refs
  const renderer1Ref = useRef<THREE.WebGLRenderer | null>(null);
  const renderer2Ref = useRef<THREE.WebGLRenderer | null>(null);
  const scene1Ref = useRef<THREE.Scene>(new THREE.Scene());
  const scene2Ref = useRef<THREE.Scene>(new THREE.Scene());
  const camera1Ref = useRef<THREE.PerspectiveCamera | null>(null);
  const camera2Ref = useRef<THREE.PerspectiveCamera | null>(null);
  const controls1Ref = useRef<OrbitControls | null>(null);
  const controls2Ref = useRef<OrbitControls | null>(null);
  const group1Ref = useRef<THREE.Group>(new THREE.Group());
  const group2Ref = useRef<THREE.Group>(new THREE.Group());
  const animationRef = useRef<number | null>(null);

  // State
  const [loading, setLoading] = useState(true);
  const [stlUrls1, setStlUrls1] = useState<string[]>([]);
  const [stlUrls2, setStlUrls2] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch STL URLs for both series
  useEffect(() => {
    if (!series1 || !series2) return;

    const fetchUrls = async () => {
      setLoading(true);
      setError(null);
      try {
        const timestamp = Date.now();
        const study1Uid = study1?.study_instance_uid || '';
        const study2Uid = study2?.study_instance_uid || '';

        const url1 = study1Uid
          ? `${SERVER_URL}/analyst/get-3d?series_instance_uid=${series1.series_instance_uid}&study_instance_uid=${study1Uid}&_t=${timestamp}`
          : `${SERVER_URL}/analyst/get-3d?series_instance_uid=${series1.series_instance_uid}&_t=${timestamp}`;

        const url2 = study2Uid
          ? `${SERVER_URL}/analyst/get-3d?series_instance_uid=${series2.series_instance_uid}&study_instance_uid=${study2Uid}&_t=${timestamp + 1}`
          : `${SERVER_URL}/analyst/get-3d?series_instance_uid=${series2.series_instance_uid}&_t=${timestamp + 1}`;

        const [response1, response2] = await Promise.all([
          fetch(url1, {
            headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
            cache: 'no-store'
          }),
          fetch(url2, {
            headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
            cache: 'no-store'
          })
        ]);

        if (!response1.ok || !response2.ok) {
          throw new Error('Failed to fetch 3D models');
        }

        const [data1, data2] = await Promise.all([response1.json(), response2.json()]);

        const urls1 = data1?.data?.generated?.urls || [];
        const urls2 = data2?.data?.generated?.urls || [];

        setStlUrls1(urls1);
        setStlUrls2(urls2);

        // Update series names
        updateSeriesName(series1.description);
        updateSeriesName1(series2.description);

      } catch (error) {
        console.error('Error fetching 3D models:', error);
        setError('Failed to load 3D models');
      }
    };

    fetchUrls();
  }, [series1, series2, study1, study2, userToken]);

  // Setup THREE.js renderers
  useEffect(() => {
    const setupRenderers = () => {
      const mount1 = mount1Ref.current;
      const mount2 = mount2Ref.current;

      if (!mount1 || !mount2) {
        setTimeout(setupRenderers, 100);
        return;
      }

      const width1 = mount1.clientWidth || 100;
      const height1 = mount1.clientHeight || 100;
      const width2 = mount2.clientWidth || 100;
      const height2 = mount2.clientHeight || 100;

      if (width1 === 0 || height1 === 0 || width2 === 0 || height2 === 0) {
        setTimeout(setupRenderers, 100);
        return;
      }

      // Create scenes
      const scene1 = new THREE.Scene();
      const scene2 = new THREE.Scene();
      scene1Ref.current = scene1;
      scene2Ref.current = scene2;
      scene1.background = new THREE.Color(0x0a0a0a);
      scene2.background = new THREE.Color(0x001a1a);

      // Add lighting
      const addLighting = (scene: THREE.Scene) => {
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
        keyLight.position.set(1, 1, 1).normalize();
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
        fillLight.position.set(-1, 0.5, -0.5).normalize();
        scene.add(fillLight);
        const backLight = new THREE.DirectionalLight(0xffffff, 0.25);
        backLight.position.set(0, 0, -1).normalize();
        scene.add(backLight);
        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
        scene.add(hemisphereLight);
      };
      addLighting(scene1);
      addLighting(scene2);

      // Create groups
      const group1 = new THREE.Group();
      const group2 = new THREE.Group();
      group1Ref.current = group1;
      group2Ref.current = group2;
      scene1.add(group1);
      scene2.add(group2);

      // Create renderers
      const renderer1 = new THREE.WebGLRenderer({ antialias: true });
      renderer1.setSize(width1, height1);
      renderer1.setPixelRatio(window.devicePixelRatio);
      mount1.appendChild(renderer1.domElement);
      renderer1Ref.current = renderer1;

      const renderer2 = new THREE.WebGLRenderer({ antialias: true });
      renderer2.setSize(width2, height2);
      renderer2.setPixelRatio(window.devicePixelRatio);
      mount2.appendChild(renderer2.domElement);
      renderer2Ref.current = renderer2;

      // Create cameras
      const camera1 = new THREE.PerspectiveCamera(45, width1 / height1, 0.1, 10000);
      camera1.position.set(0, 0, 500);
      camera1Ref.current = camera1;

      const camera2 = new THREE.PerspectiveCamera(45, width2 / height2, 0.1, 10000);
      camera2.position.set(0, 0, 500);
      camera2Ref.current = camera2;

      // Create controls
      const controls1 = new OrbitControls(camera1, renderer1.domElement);
      controls1.enableDamping = true;
      controls1.dampingFactor = 0.25;
      controls1Ref.current = controls1;

      const controls2 = new OrbitControls(camera2, renderer2.domElement);
      controls2.enableDamping = true;
      controls2.dampingFactor = 0.25;
      controls2Ref.current = controls2;

      // Animation loop
      const animate = () => {
        animationRef.current = requestAnimationFrame(animate);
        controls1.update();
        controls2.update();
        renderer1.render(scene1, camera1);
        renderer2.render(scene2, camera2);
      };
      animate();

      // Handle resize
      const handleResize = () => {
        if (mount1Ref.current && camera1Ref.current && renderer1Ref.current) {
          const w1 = mount1Ref.current.clientWidth || 100;
          const h1 = mount1Ref.current.clientHeight || 100;
          camera1Ref.current.aspect = w1 / h1;
          camera1Ref.current.updateProjectionMatrix();
          renderer1Ref.current.setSize(w1, h1);
        }
        if (mount2Ref.current && camera2Ref.current && renderer2Ref.current) {
          const w2 = mount2Ref.current.clientWidth || 100;
          const h2 = mount2Ref.current.clientHeight || 100;
          camera2Ref.current.aspect = w2 / h2;
          camera2Ref.current.updateProjectionMatrix();
          renderer2Ref.current.setSize(w2, h2);
        }
      };
      window.addEventListener('resize', handleResize);
    };

    setupRenderers();

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (renderer1Ref.current) {
        renderer1Ref.current.dispose();
        if (renderer1Ref.current.domElement.parentElement) {
          renderer1Ref.current.domElement.parentElement.removeChild(renderer1Ref.current.domElement);
        }
      }
      if (renderer2Ref.current) {
        renderer2Ref.current.dispose();
        if (renderer2Ref.current.domElement.parentElement) {
          renderer2Ref.current.domElement.parentElement.removeChild(renderer2Ref.current.domElement);
        }
      }
    };
  }, []);

  // Load STLs when URLs are ready
  useEffect(() => {
    if (stlUrls1.length === 0 || stlUrls2.length === 0) return;
    if (!renderer1Ref.current || !renderer2Ref.current) return;

    let cancelled = false;

    const loadSTLs = async () => {
      const loader = new STLLoader();
      const group1 = group1Ref.current;
      const group2 = group2Ref.current;

      group1.clear();
      group2.clear();

      const loadSTLsForGroup = async (urls: string[], group: THREE.Group, isFirstView: boolean) => {
        const baseColor = isFirstView ? 0xffffff : 0x00ffff;

        for (const url of urls) {
          if (cancelled) return null;

          try {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) continue;

            const arrayBuffer = await response.arrayBuffer();
            const geometry = loader.parse(arrayBuffer);
            // STLs are already in LPS - no transformation needed
            geometry.computeBoundingBox();

            const material = new THREE.MeshPhongMaterial({
              color: baseColor,
              specular: 0x111111,
              shininess: 10,
              side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(geometry.clone(), material);
            // LPS coordinate system - no rotation needed
            group.add(mesh);
          } catch (error) {
            console.error('Failed to load STL:', url, error);
          }
        }

        // Note: STLs are already in LPS - no transformation needed

        if (group.children.length > 0) {
          const bbox = new THREE.Box3().setFromObject(group);
          const center = bbox.getCenter(new THREE.Vector3());
          const size = bbox.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          return { center, maxDim };
        }
        return null;
      };

      const result1 = await loadSTLsForGroup(stlUrls1, group1, true);
      const result2 = await loadSTLsForGroup(stlUrls2, group2, false);

      if (cancelled) return;

      // Position cameras
      if (camera1Ref.current && controls1Ref.current && result1) {
        camera1Ref.current.position.set(result1.center.x, result1.center.y, result1.maxDim * 2.5);
        camera1Ref.current.lookAt(result1.center);
        controls1Ref.current.target.copy(result1.center);
        controls1Ref.current.update();
      }

      if (camera2Ref.current && controls2Ref.current && result2) {
        camera2Ref.current.position.set(result2.center.x, result2.center.y, result2.maxDim * 2.5);
        camera2Ref.current.lookAt(result2.center);
        controls2Ref.current.target.copy(result2.center);
        controls2Ref.current.update();
      }

      setLoading(false);
    };

    loadSTLs();

    return () => {
      cancelled = true;
    };
  }, [stlUrls1, stlUrls2]);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'row',
      width: '100%',
      height: '100%',
      minHeight: '500px',
      backgroundColor: '#000',
      position: 'relative'
    }}>
      {/* Exit Comparison Button */}
      <button
        onClick={onExitComparison}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 200,
          fontSize: "12px",
          padding: "8px 16px",
          borderRadius: "4px",
          backgroundColor: 'rgba(255, 100, 100, 0.9)',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          fontWeight: 'bold',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
        }}
      >
        Exit Comparison
      </button>

      {/* Loading Indicator */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#222', color: '#fff', padding: '16px 24px', borderRadius: '8px',
            fontSize: '14px', fontWeight: 'bold'
          }}>
            Loading 3D Models...
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          position: 'absolute', top: '50px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, background: 'rgba(255,0,0,0.8)', color: '#fff',
          padding: '10px 20px', borderRadius: '6px', fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {/* Series 1 View (WHITE model) - Left side */}
      <div style={{ flex: 1, position: 'relative', borderRight: '2px solid #444', minWidth: '200px' }}>
        <div style={{
          position: 'absolute', top: 10, left: 10, color: '#fff', zIndex: 100,
          backgroundColor: '#17202a', padding: '4px 8px', borderRadius: '4px',
          fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ffffff', display: 'inline-block', border: '1px solid #444' }}></span>
          Series 1: {seriesName || series1?.description || '(No name)'}
        </div>
        <div ref={mount1Ref} style={{ width: '100%', height: '100%', position: 'relative' }} />
      </div>

      {/* Series 2 View (CYAN model) - Right side */}
      <div style={{ flex: 1, position: 'relative', minWidth: '200px' }}>
        <div style={{
          position: 'absolute', top: 10, left: 10, color: '#00ffff', zIndex: 100,
          backgroundColor: '#17202a', padding: '4px 8px', borderRadius: '4px',
          fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#00ffff', display: 'inline-block' }}></span>
          Series 2: {seriesName1 || series2?.description || '(No name)'}
        </div>
        <div ref={mount2Ref} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
};
