// components/ImplantViewer.tsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useImplantContext } from '../context/ImplantContext';
import { useBrightnessContext } from '../context/BrightnessContext';

interface ImplantViewerProps {
  showImplantView: boolean;
  onClose?: () => void;
}

export const ImplantViewer: React.FC<ImplantViewerProps> = ({
  showImplantView,
  onClose
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const { implantFile, setLoading, setError } = useImplantContext();
  const { brightnessEnabled, brightness } = useBrightnessContext();

  // Refs for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const animationIdRef = useRef<number>();

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current || !showImplantView) return;

    console.log('Initializing Implant Viewer...');

    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
    camera.position.set(0, 0, 100);
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controlsRef.current = controls;

    // Add lighting
    scene.add(new THREE.AmbientLight(0x404040, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(0, 1, 1).normalize();
    scene.add(dirLight);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (mountRef.current && camera && renderer) {
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      window.removeEventListener('resize', handleResize);

      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }

      renderer.dispose();
      controls.dispose();

      // Dispose of mesh if it exists
      if (meshRef.current) {
        scene.remove(meshRef.current);
        meshRef.current.geometry.dispose();
        if (Array.isArray(meshRef.current.material)) {
          meshRef.current.material.forEach(m => m.dispose());
        } else {
          meshRef.current.material.dispose();
        }
        meshRef.current = null;
      }
    };
  }, [showImplantView]);

  // Load implant when file changes
  useEffect(() => {
    if (!implantFile || !showImplantView || !sceneRef.current) {
      return;
    }

    console.log('Loading implant file:', implantFile.name);
    loadImplant(implantFile);
  }, [implantFile, showImplantView]);

  const loadImplant = async (file: File) => {
    if (!sceneRef.current) return;

    setLoading(true);
    setError(null);

    try {
      // Clear previous implant
      if (meshRef.current) {
        sceneRef.current.remove(meshRef.current);
        meshRef.current.geometry.dispose();
        if (Array.isArray(meshRef.current.material)) {
          meshRef.current.material.forEach(m => m.dispose());
        } else {
          meshRef.current.material.dispose();
        }
        meshRef.current = null;
      }

      // Read and parse STL file
      const arrayBuffer = await file.arrayBuffer();

      // Import STLLoader dynamically to avoid SSR issues
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader');
      const loader = new STLLoader();

      const geometry = loader.parse(arrayBuffer);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();

      // Create material
      const material = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        specular: 0x000000,
        shininess: 0,
        side: THREE.DoubleSide,
        emissive: brightnessEnabled ? new THREE.Color(0x8888ff) : new THREE.Color(0x000000),
        emissiveIntensity: brightnessEnabled ? brightness * 0.5 : 0,
      });

      // Create mesh
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { fileName: file.name };
      sceneRef.current.add(mesh);
      meshRef.current = mesh;

      // Center and scale the implant
      centerImplant(mesh);

      console.log('Implant loaded successfully');

    } catch (error) {
      console.error('Failed to load implant:', error);
      setError('Failed to load implant STL file');
    } finally {
      setLoading(false);
    }
  };

  const centerImplant = (mesh: THREE.Mesh) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const bbox = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    // Center the mesh
    mesh.position.set(-center.x, -center.y, -center.z);

    // Adjust camera
    const maxDim = Math.max(size.x, size.y, size.z);
    const cameraDistance = maxDim * 2.5;

    cameraRef.current.position.set(0, 0, cameraDistance);
    cameraRef.current.lookAt(0, 0, 0);

    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  // Update brightness when it changes
  useEffect(() => {
    if (!meshRef.current || !meshRef.current.material) return;

    const material = meshRef.current.material as THREE.MeshPhongMaterial;
    material.emissive = brightnessEnabled ? new THREE.Color(0x8888ff) : new THREE.Color(0x000000);
    material.emissiveIntensity = brightnessEnabled ? brightness * 0.5 : 0;
    material.needsUpdate = true;
  }, [brightnessEnabled, brightness]);

  if (!showImplantView) return null;

  return (
    <div>
      <div
        ref={mountRef}
        style={{
          width: '250px',
          height: '250px'
        }}
      />
    </div>
  );
};
