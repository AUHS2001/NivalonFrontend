import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useImplantContext } from '../../../stl-extention/src/context/ImplantContext';

interface UseImplantViewerProps {
  brightnessEnabled: boolean;
  brightness: number;
}

export const useImplantViewer = ({
  brightnessEnabled,
  brightness
}: UseImplantViewerProps) => {
  const [implantCamera, setImplantCamera] = useState<THREE.PerspectiveCamera | null>(null);

  const implantGroupRef = useRef<THREE.Group>(new THREE.Group());
  const implantSceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const implantRendererRef = useRef<THREE.WebGLRenderer>();
  const implantMountRef = useRef<HTMLDivElement>(null);
  const implantControlsRef = useRef<OrbitControls>();

  const {
    implantFile,
    setImplantFile,
    implantMesh,
    setImplantMesh,
    setLoading,
    setError,
    setShowImplantView
  } = useImplantContext();

  const handleImplantFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.name.toLowerCase().endsWith('.stl')) {
        setImplantFile(file);
        loadImplant(file);
      } else {
        setError('Please select an STL file for the implant');
      }
    }
  };

  const loadImplant = useCallback((file: File) => {
    setLoading(true);
    setError(null);
    setShowImplantView(true);

    const loader = new STLLoader();

    // Clear previous implant
    implantGroupRef.current.clear();
    if (implantMesh) {
      implantGroupRef.current.remove(implantMesh);
      setImplantMesh(null);
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const geometry = loader.parse(e.target!.result as ArrayBuffer);
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();

        const mat = new THREE.MeshPhongMaterial({
          color: 0xffffff,
          specular: 0x00000000,
          shininess: 0,
          side: THREE.DoubleSide,
          emissive: brightnessEnabled ? new THREE.Color(0x8888ff) : new THREE.Color(0xffffff),
          emissiveIntensity: brightnessEnabled ? brightness * 0.5 : 0.2,
        });

        const mesh = new THREE.Mesh(geometry, mat);
        mesh.userData = { fileName: file.name };

        implantGroupRef.current.add(mesh);
        setImplantMesh(mesh);

        // Center the implant
        const bbox = new THREE.Box3().setFromObject(mesh);
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        const size = new THREE.Vector3();
        bbox.getSize(size);

        mesh.position.set(-center.x, -center.y, -center.z);

        const maxDim = Math.max(size.x, size.y, size.z);
        const cameraDistance = maxDim * 2.5;

        if (implantControlsRef.current && implantCamera) {
          implantCamera.position.set(0, 0, cameraDistance);
          implantCamera.lookAt(0, 0, 0);

          implantControlsRef.current.target.set(0, 0, 0);
          implantControlsRef.current.update();

          implantRendererRef.current?.render(implantSceneRef.current, implantCamera);
          centerImplant();
        }

      } catch (error) {
        setError('Failed to load implant STL file');
        console.error('Implant loading error:', error);
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError('Failed to read implant file');
      setLoading(false);
    };

    reader.readAsArrayBuffer(file);
  }, [implantMesh, brightnessEnabled, brightness, implantCamera]);

  const centerImplant = useCallback(() => {
    if (implantMesh && implantControlsRef.current && implantCamera) {
      const bbox = new THREE.Box3().setFromObject(implantMesh);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const cameraDistance = maxDim * 2.5;

      implantCamera.position.set(0, 0, cameraDistance);
      implantCamera.lookAt(0, 0, 0);

      implantControlsRef.current.target.set(0, 0, 0);
      implantControlsRef.current.update();

      if (implantRendererRef.current) {
        implantRendererRef.current.render(implantSceneRef.current, implantCamera);
      }
    }
  }, [implantMesh, implantCamera]);

  // Implant viewer setup
  useEffect(() => {
    if (!implantMountRef.current) return;

    const implantScene = implantSceneRef.current;
    const implantMount = implantMountRef.current;
    implantScene.background = new THREE.Color(0x000000);

    // Set up lighting
    implantScene.add(new THREE.AmbientLight(0x404040, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(0, 1, 1).normalize();
    implantScene.add(dirLight);

    implantScene.add(implantGroupRef.current);

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      45,
      implantMount.clientWidth / implantMount.clientHeight,
      0.1,
      10000
    );
    setImplantCamera(camera);

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(implantMount.clientWidth, implantMount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    implantRendererRef.current = renderer;
    implantMount.appendChild(renderer.domElement);

    // Set up controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.maxDistance = 5000;
    controls.enableRotate = true;
    controls.rotateSpeed = 1.0;
    controls.enableZoom = true;
    controls.zoomSpeed = 1.2;
    controls.enablePan = true;
    controls.panSpeed = 0.8;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;

    implantControlsRef.current = controls;
    camera.position.set(0, 0, 100);

    // Animation loop
    const animateImplant = () => {
      requestAnimationFrame(animateImplant);
      controls.update();
      renderer.render(implantScene, camera);
    };
    animateImplant();

    // Handle resize
    const handleResize = () => {
      if (implantMountRef.current && camera) {
        const width = implantMountRef.current.clientWidth;
        const height = implantMountRef.current.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        renderer.render(implantScene, camera);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (implantMount.contains(renderer.domElement)) {
        implantMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Handle brightness changes for implant
  useEffect(() => {
    if (implantMesh && implantMesh.material) {
      implantMesh.material.emissive = brightnessEnabled ?
        new THREE.Color(0xffffff) : new THREE.Color(0xffffff);
      implantMesh.material.emissiveIntensity = brightnessEnabled ? brightness * 0.5 : 0.2;
      implantMesh.material.needsUpdate = true;

      if (implantRendererRef.current && implantCamera) {
        implantRendererRef.current.render(implantSceneRef.current, implantCamera);
      }
    }
  }, [brightnessEnabled, brightness, implantMesh]);

  return {
    implantFile,
    implantMesh,
    implantMountRef,
    handleImplantFileChange,
    loadImplant,
    centerImplant
  };
};
