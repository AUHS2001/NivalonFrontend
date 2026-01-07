import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import logo from '../../assets/logo.png';

const SpinalCordViewer: React.FC = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const leftMountRef = useRef(null);
  const rightMountRef = useRef(null);

  const leftSceneRef = useRef(new THREE.Scene());
  const rightSceneRef = useRef(new THREE.Scene());

  const leftRendererRef = useRef(null);
  const rightRendererRef = useRef(null);
  const cameraRef = useRef(null);

  const leftControlsRef = useRef(null);
  const rightControlsRef = useRef(null);

  const meshRefs = useRef({ left: [], right: [] });
  const leftGroupRef = useRef(new THREE.Group());
  const rightGroupRef = useRef(new THREE.Group());

  const animationIdRef = useRef(null);

  useEffect(() => {
    const leftScene = leftSceneRef.current;
    const rightScene = rightSceneRef.current;
    const leftMount = leftMountRef.current;
    const rightMount = rightMountRef.current;

    leftScene.background = new THREE.Color(0x000000);
    rightScene.background = new THREE.Color(0x00000);

    const camera = new THREE.PerspectiveCamera(
      45,
      leftMount.clientWidth / leftMount.clientHeight,
      0.1,
      10000
    );
    camera.position.set(0, 0, 350);
    cameraRef.current = camera;

    const leftRenderer = new THREE.WebGLRenderer({ antialias: true });
    leftRenderer.setSize(leftMount.clientWidth, leftMount.clientHeight);
    leftRenderer.setPixelRatio(window.devicePixelRatio);
    leftRendererRef.current = leftRenderer;
    leftMount.appendChild(leftRenderer.domElement);

    const rightRenderer = new THREE.WebGLRenderer({ antialias: true });
    rightRenderer.setSize(rightMount.clientWidth, rightMount.clientHeight);
    rightRenderer.setPixelRatio(window.devicePixelRatio);
    rightRendererRef.current = rightRenderer;
    rightMount.appendChild(rightRenderer.domElement);

    const leftControls = new OrbitControls(camera, leftRenderer.domElement);
    const rightControls = new OrbitControls(camera, rightRenderer.domElement);
    [leftControls, rightControls].forEach((ctrl) => {
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.25;
      ctrl.maxDistance = 5000;
    });
    leftControlsRef.current = leftControls;
    rightControlsRef.current = rightControls;

    const setupLighting = (scene) => {
      scene.add(new THREE.AmbientLight(0x404040, 0.5));
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(0, 1, 1).normalize();
      scene.add(directionalLight);
    };

    setupLighting(leftScene);
    setupLighting(rightScene);

    leftScene.add(leftGroupRef.current);
    rightScene.add(rightGroupRef.current);

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      leftControls.update();
      rightControls.update();
      leftRenderer.render(leftScene, camera);
      rightRenderer.render(rightScene, camera);
    };
    animate();

    const handleResize = () => {
      const width = leftMount.clientWidth;
      const height = leftMount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      leftRenderer.setSize(width, height);
      rightRenderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationIdRef.current);
      window.removeEventListener('resize', handleResize);
      leftMount.removeChild(leftRenderer.domElement);
      rightMount.removeChild(rightRenderer.domElement);
      leftRenderer.dispose();
      rightRenderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!files.length) return;
    setLoading(true);
    setError(null);

    const loader = new STLLoader();
    const leftGroup = leftGroupRef.current;
    const rightGroup = rightGroupRef.current;

    leftGroup.clear();
    rightGroup.clear();
    meshRefs.current = { left: [], right: [] };

    const getVertebraInfo = (fileName) => {
      const match = fileName.match(/(C|T|L|S)(\d+)/i);
      if (!match) return { type: 'X', number: 0 };
      return {
        type: match[1].toUpperCase(),
        number: parseInt(match[2]),
        fullName: match[0].toUpperCase(),
      };
    };

    const loadPromises = files.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const geometry = loader.parse(e.target.result);
            geometry.computeBoundingBox();
            resolve({
              geometry,
              fileName: file.name,
              ...getVertebraInfo(file.name),
            });
          } catch (err) {
            console.error("Error loading STL:", err);
            resolve(null);
          }
        };
        reader.readAsArrayBuffer(file);
      });
    });

    Promise.all(loadPromises)
      .then((vertebrae) => {
        const valid = vertebrae.filter(Boolean);
        const anatomicalOrder = ['C', 'T', 'L', 'S'];

        valid.sort((a, b) => {
          const orderDiff = anatomicalOrder.indexOf(a.type) - anatomicalOrder.indexOf(b.type);
          return orderDiff !== 0 ? orderDiff : a.number - b.number;
        });

        let currentY = 0;
        const compression = 0;
        const gap = 0;

        valid.forEach((v) => {
          const bbox = v.geometry.boundingBox;
          const size = new THREE.Vector3();
          bbox.getSize(size);
          const center = new THREE.Vector3();
          bbox.getCenter(center);

          const colorMap = {
            C: 0x3498db,
            T: 0x2ecc71,
            L: 0xe74c3c,
            S: 0xf1c40f,
          };
          const color = new THREE.Color(colorMap[v.type] || 0x9b59b6);

          const materialLeft = new THREE.MeshPhongMaterial({
            color,
            specular: 0x00000000,
            shininess: 0,
            side: THREE.DoubleSide,
          });

          const mesh = new THREE.Mesh(v.geometry, materialLeft);
          mesh.position.y = currentY - center.y * compression;
          mesh.rotation.x = Math.PI / 2;
          mesh.userData = v;
          leftGroup.add(mesh);
          meshRefs.current.left.push(mesh);

          const materialRight = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            specular: 0xffffff,
            shininess: 0,
            side: THREE.DoubleSide,
          });

          const meshClone = new THREE.Mesh(v.geometry, materialRight);
          meshClone.position.copy(mesh.position);
          meshClone.rotation.copy(mesh.rotation);
          rightGroup.add(meshClone);
          meshRefs.current.right.push(meshClone);

          currentY -= size.y * compression + gap;
        });

        // Flip left group
        leftGroup.scale.y = -1;
        rightGroup.scale.y = -1;

        // Center camera
        const bbox = new THREE.Box3().setFromObject(leftGroup);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        cameraRef.current.position.set(center.x, center.y, maxDim * 2.5);
        cameraRef.current.lookAt(center);

        leftControlsRef.current.target.copy(center);
        rightControlsRef.current.target.copy(center);
        leftControlsRef.current.update();
        rightControlsRef.current.update();
      })
      .catch((err) => {
        console.error(err);
        setError("Error loading spinal segments");
      })
      .finally(() => setLoading(false));
  }, [files]);

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files).filter((f) =>
      /\.stl$/i.test(f.name) && /(C|T|L|S)\d+/i.test(f.name)
    );
    setFiles(newFiles);
  };

  return (
    <div style={{
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#000000',
      color: 'white',
      minHeight: '130vh'
    }}>
      {/* Header Section */}
      <div className="d-flex justify-content-between align-items-center py-2 px-4"
        style={{
          backgroundColor: '#17202a',
          color: 'white',
          minHeight: '60px',
          borderBottom: '1px solid #000'
        }}>
        <div className="d-flex align-items-center">
          <div className="me-2">
            <img src={logo} alt="Logo" width="250" height="250" />
          </div>
        </div>
      </div>

      <div style={{
        padding: '16px',
        backgroundColor: '#000000',
        borderBottom: '1px solid #000'
      }}>
        {/* <div className="d-flex align-items-center">
          <input
            type="file"
            accept=".stl"
            onChange={handleFileChange}
            multiple
            style={{
              padding: '8px 12px',
              backgroundColor: '#2c3e50',
              border: '1px solid #000',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          />
          {loading && (
            <div className="ms-3 d-flex align-items-center">
              <span className="spinner-border spinner-border-sm me-2" role="status"></span>
              <span>Loading spinal segments...</span>
            </div>
          )}
          {error && (
            <div className="ms-3" style={{ color: '#e74c3c' }}>
              {error}
            </div>
          )}
        </div> */}

        <div className="mb-4">
          <label className="form-label text-white">STL Files</label>
          <div className="input-group">
            <input
              type="text"
              className="form-control"
              placeholder={files.length > 0 ?
                `${files.length} file${files.length !== 1 ? 's' : ''} selected` :
                "No files chosen"}
              readOnly
              style={{
                backgroundColor: '#2c3e50',
                border: '1px solid #000',
                color: 'white',
                height: '46px'
              }}
            />
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => document.getElementById('stl-file-input')?.click()}
              disabled={loading}
              style={{
                fontWeight: 'bold',
                height: '44.5px'
              }}
            >
              {files.length > 0 ? 'Change Files' : 'Select Files'}
            </button>
          </div>
          <input
            id="stl-file-input"
            type="file"
            accept=".stl"
            onChange={handleFileChange}
            multiple
            style={{ display: 'none' }}
            disabled={loading}
          />
          {/* Loading and error states */}
          {loading && (
            <div className="mt-2 d-flex align-items-center">
              <span className="spinner-border spinner-border-sm me-2" role="status"></span>
              <span>Loading spinal segments...</span>
            </div>
          )}
          {error && (
            <div className="mt-2" style={{ color: '#e74c3c' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ marginTop: '12px' }}>
          <div className="d-flex gap-3">
            <span style={{ color: '#3498db' }}>■ Cervical (C1-C7)</span>
            <span style={{ color: '#2ecc71' }}>■ Thoracic (T1-T12)</span>
            <span style={{ color: '#e74c3c' }}>■ Lumbar (L1-L5)</span>
            <span style={{ color: '#f1c40f' }}>■ Sacral (S1-S5)</span>
          </div>
        </div>
      </div>

      {/* Viewer Section */}
      <div style={{
        flex: 1,
        display: 'flex',
        width: '100%',
        backgroundColor: '#000000'
      }}>
        {/* Left Viewer (Color) */}
        <div style={{
          flex: 1,
          position: 'relative',
          borderRight: '1px solid #2c3e50'
        }}>
          <div style={{
            position: 'absolute',
            top: 10,
            left: 10,
            color: 'white',
            zIndex: 100,
            backgroundColor: '#17202a',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #000'
          }}>
            Color View
          </div>
          <div ref={leftMountRef} style={{ width: '100%', height: '100%' }} />
        </div>

        {/* Right Viewer (Original) */}
        <div style={{
          flex: 1,
          position: 'relative'
        }}>
          <div style={{
            position: 'absolute',
            top: 10,
            left: 10,
            color: 'white',
            zIndex: 100,
            backgroundColor: '#17202a',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #000'
          }}>
            Original View
          </div>
          <div ref={rightMountRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
    </div>
  );
};

export default SpinalCordViewer;
