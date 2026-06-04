import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { SERVER_URL, fetchFile } from '../../../../config/server';
import { LPS_UP } from '../../../../extensions/stl-extention/src/utils/coordinateSystem';

interface PointCloudData {
  points: THREE.Vector3[];
  colors?: THREE.Color[];
}

interface DistanceStats {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  rms: number;
  median: number;
  percentile95: number;
  histogram: { range: string; count: number; percentage: number }[];
}

interface BidirectionalStats {
  series1ToSeries2: DistanceStats;
  series2ToSeries1: DistanceStats;
  hausdorffDistance: number;
  symmetricMean: number;
  overlapPercentage: number;
}

interface PostureMetrics {
  centroid: THREE.Vector3;
  boundingBox: {
    size: THREE.Vector3;
    min: THREE.Vector3;
    max: THREE.Vector3;
  };
  principalAxes: {
    axis1: THREE.Vector3; // Primary (longest)
    axis2: THREE.Vector3; // Secondary
    axis3: THREE.Vector3; // Tertiary (shortest)
  };
  eigenvalues: number[];
  aspectRatios: {
    lengthToWidth: number;
    lengthToHeight: number;
    widthToHeight: number;
  };
  orientation: {
    pitch: number; // Rotation around X
    yaw: number;   // Rotation around Y
    roll: number;  // Rotation around Z
  };
  volume: number;
  surfaceArea: number;
}

interface PostureComparison {
  series1: PostureMetrics;
  series2: PostureMetrics;
  centroidOffset: number;
  axisAngleDifferences: {
    axis1Angle: number;
    axis2Angle: number;
    axis3Angle: number;
  };
  sizeDifference: {
    length: number;
    width: number;
    height: number;
    percentageDiff: number;
  };
  aspectRatioDifference: {
    lengthToWidth: number;
    lengthToHeight: number;
    widthToHeight: number;
  };
  orientationDifference: {
    pitch: number;
    yaw: number;
    roll: number;
    totalAngle: number;
  };
  volumeDifference: number;
  volumePercentageDiff: number;
  postureSimilarityScore: number;
}

interface DeviationReport {
  timestamp: string;
  series1Name: string;
  series2Name: string;
  study1Name: string;
  study2Name: string;
  pointCount1: number;
  pointCount2: number;
  bidirectionalStats: BidirectionalStats | null;
  postureComparison: PostureComparison | null;
  alignmentApplied: boolean;
}

const ComparisonPage: React.FC = () => {
  const [searchParams] = useSearchParams();

  const series1Uid = searchParams.get('series1');
  const series2Uid = searchParams.get('series2');
  const study1Uid = searchParams.get('study1');
  const study2Uid = searchParams.get('study2');
  const series1Name = searchParams.get('series1Name') || 'Series 1';
  const series2Name = searchParams.get('series2Name') || 'Series 2';
  const study1Name = searchParams.get('study1Name') || '';
  const study2Name = searchParams.get('study2Name') || '';

  const userToken = localStorage.getItem('token');

  const mount1Ref = useRef<HTMLDivElement>(null);
  const mount2Ref = useRef<HTMLDivElement>(null);
  const histogram1CanvasRef = useRef<HTMLCanvasElement>(null);
  const histogram2CanvasRef = useRef<HTMLCanvasElement>(null);

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
  const axesHelper1Ref = useRef<THREE.Group | null>(null);
  const axesHelper2Ref = useRef<THREE.Group | null>(null);
  const animationRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState('Fetching model info...');
  const [error, setError] = useState<string | null>(null);
  const [stlUrls1, setStlUrls1] = useState<string[]>([]);
  const [stlUrls2, setStlUrls2] = useState<string[]>([]);

  const [showControlPanel, setShowControlPanel] = useState(true);
  const [pointCloud1, setPointCloud1] = useState<PointCloudData | null>(null);
  const [pointCloud2, setPointCloud2] = useState<PointCloudData | null>(null);
  const [isPointCloudMode, setIsPointCloudMode] = useState(false);
  const [pointCloudDensity, setPointCloudDensity] = useState(10000);
  const [isAligned, setIsAligned] = useState(false);
  const [bidirectionalStats, setBidirectionalStats] = useState<BidirectionalStats | null>(null);
  const [showColorMap, setShowColorMap] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [alignmentMatrix, setAlignmentMatrix] = useState<THREE.Matrix4 | null>(null);
  const [activeStatsTab, setActiveStatsTab] = useState<'series1' | 'series2' | 'combined'>('combined');

  // Posture comparison state
  const [postureComparison, setPostureComparison] = useState<PostureComparison | null>(null);
  const [showPostureAxes, setShowPostureAxes] = useState(false);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'distance' | 'posture'>('distance');

  // Fetch STL URLs
  useEffect(() => {
    if (!series1Uid || !series2Uid) {
      setError('Missing series information');
      setLoading(false);
      return;
    }

    const fetchUrls = async () => {
      setLoading(true);
      setError(null);
      try {
        const timestamp = Date.now();
        const url1 = study1Uid
          ? `${SERVER_URL}/analyst/meshes?series_instance_uid=${series1Uid}&study_instance_uid=${study1Uid}&_t=${timestamp}`
          : `${SERVER_URL}/analyst/meshes?series_instance_uid=${series1Uid}&_t=${timestamp}`;
        const url2 = study2Uid
          ? `${SERVER_URL}/analyst/meshes?series_instance_uid=${series2Uid}&study_instance_uid=${study2Uid}&_t=${timestamp + 1}`
          : `${SERVER_URL}/analyst/meshes?series_instance_uid=${series2Uid}&_t=${timestamp + 1}`;

        const [response1, response2] = await Promise.all([
          fetch(url1, { headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" }, credentials: 'include', cache: 'no-store' }),
          fetch(url2, { headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" }, credentials: 'include', cache: 'no-store' })
        ]);

        if (!response1.ok || !response2.ok) throw new Error('Failed to fetch 3D models');

        const [data1, data2] = await Promise.all([response1.json(), response2.json()]);
        const urls1 = data1?.data?.processed?.urls || [];
        const urls2 = data2?.data?.processed?.urls || [];

        if (urls1.length === 0 && urls2.length === 0) throw new Error('No 3D models found');

        setStlUrls1(urls1);
        setStlUrls2(urls2);
      } catch (error) {
        console.error('Error fetching 3D models:', error);
        setError(error instanceof Error ? error.message : 'Failed to load 3D models');
        setLoading(false);
      }
    };

    fetchUrls();
  }, [series1Uid, series2Uid, study1Uid, study2Uid, userToken]);

  // Setup renderers
  useEffect(() => {
    const setupRenderers = () => {
      const mount1 = mount1Ref.current;
      const mount2 = mount2Ref.current;
      if (!mount1 || !mount2) { setTimeout(setupRenderers, 100); return; }

      const width1 = mount1.clientWidth || 100;
      const height1 = mount1.clientHeight || 100;
      const width2 = mount2.clientWidth || 100;
      const height2 = mount2.clientHeight || 100;

      if (width1 === 0 || height1 === 0 || width2 === 0 || height2 === 0) { setTimeout(setupRenderers, 100); return; }

      const scene1 = new THREE.Scene();
      const scene2 = new THREE.Scene();
      scene1Ref.current = scene1;
      scene2Ref.current = scene2;
      scene1.background = new THREE.Color(0x0a0a0a);
      scene2.background = new THREE.Color(0x0a0a0a);

      const addLighting = (scene: THREE.Scene) => {
        scene.add(new THREE.AmbientLight(0xffffff, 1.0));
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
        keyLight.position.set(1, 1, 1).normalize();
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
        fillLight.position.set(-1, 0.5, -0.5).normalize();
        scene.add(fillLight);
        const backLight = new THREE.DirectionalLight(0xffffff, 0.4);
        backLight.position.set(0, 0, -1).normalize();
        scene.add(backLight);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.5));
      };
      addLighting(scene1);
      addLighting(scene2);

      const group1 = new THREE.Group();
      const group2 = new THREE.Group();
      group1Ref.current = group1;
      group2Ref.current = group2;
      scene1.add(group1);
      scene2.add(group2);

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

      // LPS coordinate system: Z is Superior (up)
      const camera1 = new THREE.PerspectiveCamera(45, width1 / height1, 0.1, 10000);
      camera1.up.copy(LPS_UP); // Set Z as up for LPS
      camera1.position.set(0, -500, 100); // Anterior view
      camera1Ref.current = camera1;

      const camera2 = new THREE.PerspectiveCamera(45, width2 / height2, 0.1, 10000);
      camera2.up.copy(LPS_UP); // Set Z as up for LPS
      camera2.position.set(0, -500, 100); // Anterior view
      camera2Ref.current = camera2;

      const controls1 = new OrbitControls(camera1, renderer1.domElement);
      controls1.enableDamping = true;
      controls1.dampingFactor = 0.25;
      controls1Ref.current = controls1;

      const controls2 = new OrbitControls(camera2, renderer2.domElement);
      controls2.enableDamping = true;
      controls2.dampingFactor = 0.25;
      controls2Ref.current = controls2;

      const animate = () => {
        animationRef.current = requestAnimationFrame(animate);
        controls1.update();
        controls2.update();
        renderer1.render(scene1, camera1);
        renderer2.render(scene2, camera2);
      };
      animate();

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

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
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

  // Load STLs
  useEffect(() => {
    if (stlUrls1.length === 0 && stlUrls2.length === 0) return;
    if (!renderer1Ref.current || !renderer2Ref.current) return;

    let cancelled = false;

    const loadSTLs = async () => {
      const loader = new STLLoader();
      const group1 = group1Ref.current;
      const group2 = group2Ref.current;

      group1.clear();
      group2.clear();

      const totalFiles = stlUrls1.length + stlUrls2.length;
      let completedFiles = 0;
      let totalBytes = 0;
      let downloadedBytes = 0;

      setLoadingStatus(`Downloading 0/${totalFiles} files...`);
      setLoadingProgress(0);

      const fetchWithProgress = async (url: string): Promise<ArrayBuffer | null> => {
        if (cancelled) return null;
        try {
          const response = await fetchFile(url, { cache: 'no-store' });
          if (!response.ok) return null;

          const contentLength = response.headers.get('content-length');
          const fileSize = contentLength ? parseInt(contentLength, 10) : 0;

          if (fileSize > 0) {
            totalBytes += fileSize;
          }

          if (!response.body || fileSize === 0) {
            const buffer = await response.arrayBuffer();
            completedFiles++;
            downloadedBytes += buffer.byteLength;
            const progress = Math.round((completedFiles / totalFiles) * 100);
            setLoadingProgress(progress);
            setLoadingStatus(`Downloading ${completedFiles}/${totalFiles} files... (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
            return buffer;
          }

          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            downloadedBytes += value.length;

            const fileProgress = received / fileSize;
            const overallProgress = ((completedFiles + fileProgress) / totalFiles) * 100;
            setLoadingProgress(Math.round(overallProgress));
            setLoadingStatus(`Downloading ${completedFiles + 1}/${totalFiles} files... (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
          }

          completedFiles++;
          const buffer = new Uint8Array(received);
          let offset = 0;
          for (const chunk of chunks) {
            buffer.set(chunk, offset);
            offset += chunk.length;
          }
          return buffer.buffer;
        } catch (error) {
          console.error('Failed to fetch STL:', url, error);
          completedFiles++;
          return null;
        }
      };

      const loadSTLsForGroup = async (urls: string[], group: THREE.Group, baseColor: number) => {
        const buffers = await Promise.all(urls.map(url => fetchWithProgress(url)));

        setLoadingStatus('Rendering 3D models...');

        for (const buffer of buffers) {
          if (cancelled) return null;
          if (!buffer) continue;

          const geometry = loader.parse(buffer);
          const material = new THREE.MeshPhongMaterial({
            color: baseColor, specular: 0x111111, shininess: 10,
            side: THREE.DoubleSide
          });
          group.add(new THREE.Mesh(geometry, material));
        }

        if (group.children.length > 0) {
          const bbox = new THREE.Box3().setFromObject(group);
          const center = bbox.getCenter(new THREE.Vector3());
          const size = bbox.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          return { center, maxDim };
        }
        return null;
      };

      const [result1, result2] = await Promise.all([
        loadSTLsForGroup(stlUrls1, group1, 0xffffff),
        loadSTLsForGroup(stlUrls2, group2, 0x00ffff)
      ]);

      if (cancelled) return;

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
    return () => { cancelled = true; };
  }, [stlUrls1, stlUrls2]);

  // Extract points from mesh
  const extractPointsFromGroup = useCallback((group: THREE.Group, numPoints: number): THREE.Vector3[] => {
    const points: THREE.Vector3[] = [];
    const allPositions: THREE.Vector3[] = [];

    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geometry = child.geometry;
        const positionAttribute = geometry.getAttribute('position');
        if (positionAttribute) {
          for (let i = 0; i < positionAttribute.count; i++) {
            const vertex = new THREE.Vector3(
              positionAttribute.getX(i),
              positionAttribute.getY(i),
              positionAttribute.getZ(i)
            );
            vertex.applyMatrix4(child.matrixWorld);
            allPositions.push(vertex);
          }
        }
      }
    });

    const step = Math.max(1, Math.floor(allPositions.length / numPoints));
    for (let i = 0; i < allPositions.length && points.length < numPoints; i += step) {
      points.push(allPositions[i]);
    }

    return points;
  }, []);

  // Compute PCA for principal axes
  const computePCA = useCallback((points: THREE.Vector3[]): { axes: THREE.Vector3[], eigenvalues: number[], centroid: THREE.Vector3 } => {
    // Calculate centroid
    const centroid = new THREE.Vector3();
    points.forEach(p => centroid.add(p));
    centroid.divideScalar(points.length);

    // Build covariance matrix
    let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
    points.forEach(p => {
      const dx = p.x - centroid.x;
      const dy = p.y - centroid.y;
      const dz = p.z - centroid.z;
      cxx += dx * dx;
      cxy += dx * dy;
      cxz += dx * dz;
      cyy += dy * dy;
      cyz += dy * dz;
      czz += dz * dz;
    });
    const n = points.length;
    cxx /= n; cxy /= n; cxz /= n; cyy /= n; cyz /= n; czz /= n;

    // Power iteration for eigenvalues/eigenvectors (simplified)
    const getEigenvector = (matrix: number[][], deflatedMatrix?: number[][], prevVectors?: THREE.Vector3[]): { vector: THREE.Vector3, eigenvalue: number } => {
      let v = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();
      const m = deflatedMatrix || matrix;

      for (let iter = 0; iter < 100; iter++) {
        const newV = new THREE.Vector3(
          m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
          m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
          m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z
        );
        const len = newV.length();
        if (len > 0.0001) {
          newV.divideScalar(len);
          if (newV.distanceTo(v) < 0.0001) break;
          v = newV;
        }
      }

      // Orthogonalize against previous vectors
      if (prevVectors) {
        prevVectors.forEach(pv => {
          const dot = v.dot(pv);
          v.sub(pv.clone().multiplyScalar(dot));
        });
        v.normalize();
      }

      const eigenvalue = v.x * (m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z) +
                         v.y * (m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z) +
                         v.z * (m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z);

      return { vector: v, eigenvalue: Math.abs(eigenvalue) };
    };

    const matrix = [[cxx, cxy, cxz], [cxy, cyy, cyz], [cxz, cyz, czz]];

    const e1 = getEigenvector(matrix);
    const e2 = getEigenvector(matrix, matrix, [e1.vector]);
    const e3 = getEigenvector(matrix, matrix, [e1.vector, e2.vector]);

    // Sort by eigenvalue
    const results = [
      { v: e1.vector, e: e1.eigenvalue },
      { v: e2.vector, e: e2.eigenvalue },
      { v: e3.vector, e: e3.eigenvalue }
    ].sort((a, b) => b.e - a.e);

    return {
      axes: results.map(r => r.v),
      eigenvalues: results.map(r => r.e),
      centroid
    };
  }, []);

  // Calculate posture metrics for a point cloud
  const calculatePostureMetrics = useCallback((points: THREE.Vector3[]): PostureMetrics => {
    const pca = computePCA(points);

    // Bounding box
    const bbox = new THREE.Box3();
    points.forEach(p => bbox.expandByPoint(p));
    const size = bbox.getSize(new THREE.Vector3());

    // Sort dimensions to get consistent length/width/height
    const dims = [size.x, size.y, size.z].sort((a, b) => b - a);
    const length = dims[0];
    const width = dims[1];
    const height = dims[2];

    // Orientation from principal axis
    const mainAxis = pca.axes[0];
    const pitch = Math.atan2(mainAxis.y, Math.sqrt(mainAxis.x * mainAxis.x + mainAxis.z * mainAxis.z)) * (180 / Math.PI);
    const yaw = Math.atan2(mainAxis.x, mainAxis.z) * (180 / Math.PI);
    const roll = Math.atan2(pca.axes[1].z, pca.axes[1].y) * (180 / Math.PI);

    // Estimate volume (convex hull approximation using bounding box * factor)
    const volume = length * width * height * 0.52; // Approximate for organic shapes

    // Estimate surface area
    const surfaceArea = 2 * (length * width + width * height + height * length) * 0.85;

    return {
      centroid: pca.centroid,
      boundingBox: {
        size: new THREE.Vector3(length, width, height),
        min: bbox.min,
        max: bbox.max
      },
      principalAxes: {
        axis1: pca.axes[0],
        axis2: pca.axes[1],
        axis3: pca.axes[2]
      },
      eigenvalues: pca.eigenvalues,
      aspectRatios: {
        lengthToWidth: length / width,
        lengthToHeight: length / height,
        widthToHeight: width / height
      },
      orientation: { pitch, yaw, roll },
      volume,
      surfaceArea
    };
  }, [computePCA]);

  // Compare postures of two point clouds
  const handlePostureComparison = useCallback(() => {
    if (!pointCloud1 || !pointCloud2) {
      setProcessingStatus('Please convert to point clouds first');
      return;
    }

    setProcessingStatus('Analyzing postures...');

    setTimeout(() => {
      const metrics1 = calculatePostureMetrics(pointCloud1.points);
      const metrics2 = calculatePostureMetrics(pointCloud2.points);

      // Calculate differences
      const centroidOffset = metrics1.centroid.distanceTo(metrics2.centroid);

      // Angle between principal axes
      const angle = (v1: THREE.Vector3, v2: THREE.Vector3) => {
        const dot = Math.abs(v1.dot(v2));
        return Math.acos(Math.min(1, dot)) * (180 / Math.PI);
      };

      const axisAngleDifferences = {
        axis1Angle: angle(metrics1.principalAxes.axis1, metrics2.principalAxes.axis1),
        axis2Angle: angle(metrics1.principalAxes.axis2, metrics2.principalAxes.axis2),
        axis3Angle: angle(metrics1.principalAxes.axis3, metrics2.principalAxes.axis3)
      };

      // Size differences
      const sizeDiff = {
        length: Math.abs(metrics1.boundingBox.size.x - metrics2.boundingBox.size.x),
        width: Math.abs(metrics1.boundingBox.size.y - metrics2.boundingBox.size.y),
        height: Math.abs(metrics1.boundingBox.size.z - metrics2.boundingBox.size.z),
        percentageDiff: 0
      };
      const avgSize1 = (metrics1.boundingBox.size.x + metrics1.boundingBox.size.y + metrics1.boundingBox.size.z) / 3;
      const avgSize2 = (metrics2.boundingBox.size.x + metrics2.boundingBox.size.y + metrics2.boundingBox.size.z) / 3;
      sizeDiff.percentageDiff = Math.abs(avgSize1 - avgSize2) / ((avgSize1 + avgSize2) / 2) * 100;

      // Aspect ratio differences
      const aspectRatioDifference = {
        lengthToWidth: Math.abs(metrics1.aspectRatios.lengthToWidth - metrics2.aspectRatios.lengthToWidth),
        lengthToHeight: Math.abs(metrics1.aspectRatios.lengthToHeight - metrics2.aspectRatios.lengthToHeight),
        widthToHeight: Math.abs(metrics1.aspectRatios.widthToHeight - metrics2.aspectRatios.widthToHeight)
      };

      // Orientation differences
      const orientationDifference = {
        pitch: Math.abs(metrics1.orientation.pitch - metrics2.orientation.pitch),
        yaw: Math.abs(metrics1.orientation.yaw - metrics2.orientation.yaw),
        roll: Math.abs(metrics1.orientation.roll - metrics2.orientation.roll),
        totalAngle: 0
      };
      orientationDifference.totalAngle = Math.sqrt(
        orientationDifference.pitch ** 2 +
        orientationDifference.yaw ** 2 +
        orientationDifference.roll ** 2
      );

      // Volume difference
      const volumeDifference = Math.abs(metrics1.volume - metrics2.volume);
      const volumePercentageDiff = volumeDifference / ((metrics1.volume + metrics2.volume) / 2) * 100;

      // Calculate similarity score (0-100)
      const axisScore = Math.max(0, 100 - (axisAngleDifferences.axis1Angle + axisAngleDifferences.axis2Angle) / 2);
      const sizeScore = Math.max(0, 100 - sizeDiff.percentageDiff * 2);
      const aspectScore = Math.max(0, 100 - (aspectRatioDifference.lengthToWidth + aspectRatioDifference.lengthToHeight) * 10);
      const orientScore = Math.max(0, 100 - orientationDifference.totalAngle / 2);
      const volumeScore = Math.max(0, 100 - volumePercentageDiff);

      const postureSimilarityScore = (axisScore * 0.3 + sizeScore * 0.2 + aspectScore * 0.2 + orientScore * 0.2 + volumeScore * 0.1);

      const comparison: PostureComparison = {
        series1: metrics1,
        series2: metrics2,
        centroidOffset,
        axisAngleDifferences,
        sizeDifference: sizeDiff,
        aspectRatioDifference,
        orientationDifference,
        volumeDifference,
        volumePercentageDiff,
        postureSimilarityScore
      };

      setPostureComparison(comparison);
      setProcessingStatus('Posture analysis completed');

      // Show axes visualization
      visualizePostureAxes(metrics1, metrics2);
    }, 100);
  }, [pointCloud1, pointCloud2, calculatePostureMetrics]);

  // Visualize principal axes and posture line
  const visualizePostureAxes = useCallback((metrics1: PostureMetrics, metrics2: PostureMetrics) => {
    const createAxesHelper = (metrics: PostureMetrics, scene: THREE.Scene, existingHelper: THREE.Group | null, isFirst: boolean): THREE.Group => {
      if (existingHelper) {
        scene.remove(existingHelper);
      }

      const axesGroup = new THREE.Group();
      const axisLength = Math.max(metrics.boundingBox.size.x, metrics.boundingBox.size.y, metrics.boundingBox.size.z) * 0.6;

      const createArrow = (dir: THREE.Vector3, color: number, length: number) => {
        const arrowHelper = new THREE.ArrowHelper(
          dir.clone().normalize(),
          metrics.centroid,
          length,
          color,
          length * 0.15,
          length * 0.08
        );
        return arrowHelper;
      };

      // Create POSTURE LINE - a thick line along the primary axis extending through the entire model
      const postureLineLength = Math.max(metrics.boundingBox.size.x, metrics.boundingBox.size.y, metrics.boundingBox.size.z) * 0.8;
      const primaryAxis = metrics.principalAxes.axis1.clone().normalize();

      // Line extends in both directions from centroid
      const lineStart = metrics.centroid.clone().sub(primaryAxis.clone().multiplyScalar(postureLineLength / 2));
      const lineEnd = metrics.centroid.clone().add(primaryAxis.clone().multiplyScalar(postureLineLength / 2));

      // Create thick posture line using cylinder for better visibility
      const lineDirection = new THREE.Vector3().subVectors(lineEnd, lineStart);
      const lineLength = lineDirection.length();
      const lineMidpoint = new THREE.Vector3().addVectors(lineStart, lineEnd).multiplyScalar(0.5);

      // Cylinder geometry for thick line
      const cylinderGeometry = new THREE.CylinderGeometry(2, 2, lineLength, 8);
      const postureMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00, // Yellow for posture line
        transparent: true,
        opacity: 0.9
      });
      const postureCylinder = new THREE.Mesh(cylinderGeometry, postureMaterial);

      // Position and orient the cylinder
      postureCylinder.position.copy(lineMidpoint);

      // Align cylinder with the primary axis
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, primaryAxis);
      postureCylinder.quaternion.copy(quaternion);

      axesGroup.add(postureCylinder);

      // Add spheres at the ends of posture line for better visibility
      const sphereGeometry = new THREE.SphereGeometry(4, 16, 16);
      const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });

      const startSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      startSphere.position.copy(lineStart);
      axesGroup.add(startSphere);

      const endSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      endSphere.position.copy(lineEnd);
      axesGroup.add(endSphere);

      // Add a small sphere at centroid
      const centroidGeometry = new THREE.SphereGeometry(5, 16, 16);
      const centroidMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff }); // Magenta for centroid
      const centroidSphere = new THREE.Mesh(centroidGeometry, centroidMaterial);
      centroidSphere.position.copy(metrics.centroid);
      axesGroup.add(centroidSphere);

      // Primary axis arrow (red) - smaller than posture line
      axesGroup.add(createArrow(metrics.principalAxes.axis1, 0xff0000, axisLength * 0.5));
      // Secondary axis arrow (green)
      axesGroup.add(createArrow(metrics.principalAxes.axis2, 0x00ff00, axisLength * 0.4));
      // Tertiary axis arrow (blue)
      axesGroup.add(createArrow(metrics.principalAxes.axis3, 0x0000ff, axisLength * 0.3));

      scene.add(axesGroup);
      return axesGroup;
    };

    axesHelper1Ref.current = createAxesHelper(metrics1, scene1Ref.current, axesHelper1Ref.current, true);
    axesHelper2Ref.current = createAxesHelper(metrics2, scene2Ref.current, axesHelper2Ref.current, false);
    setShowPostureAxes(true);
  }, []);

  // Toggle axes visibility
  const togglePostureAxes = useCallback(() => {
    if (axesHelper1Ref.current) axesHelper1Ref.current.visible = !axesHelper1Ref.current.visible;
    if (axesHelper2Ref.current) axesHelper2Ref.current.visible = !axesHelper2Ref.current.visible;
    setShowPostureAxes(prev => !prev);
  }, []);

  // Convert to point clouds
  const handleConvertToPointClouds = useCallback(() => {
    setProcessingStatus('Converting to point clouds...');

    setTimeout(() => {
      const group1 = group1Ref.current;
      const group2 = group2Ref.current;

      const points1 = extractPointsFromGroup(group1, pointCloudDensity);
      const points2 = extractPointsFromGroup(group2, pointCloudDensity);

      setPointCloud1({ points: points1 });
      setPointCloud2({ points: points2 });
      setIsPointCloudMode(true);
      setProcessingStatus(`Point clouds created: ${points1.length} and ${points2.length} points`);

      visualizePointCloudPreserveOrientation(group1, points1, 0xffffff);
      visualizePointCloudPreserveOrientation(group2, points2, 0x00ffff);
    }, 100);
  }, [pointCloudDensity, extractPointsFromGroup]);

  const visualizePointCloudPreserveOrientation = (group: THREE.Group, points: THREE.Vector3[], color: number) => {
    const meshesToRemove: THREE.Object3D[] = [];
    group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
        meshesToRemove.push(child);
      }
    });
    meshesToRemove.forEach(mesh => group.remove(mesh));

    group.scale.set(1, 1, 1);
    group.rotation.set(0, 0, 0);

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(points.length * 3);

    points.forEach((point, i) => {
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
    });

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({ color, size: 2, sizeAttenuation: true });
    const pointCloudObj = new THREE.Points(geometry, material);
    group.add(pointCloudObj);
  };

  // ICP Alignment
  const handleICPAlignment = useCallback(() => {
    if (!pointCloud1 || !pointCloud2) {
      setProcessingStatus('Please convert to point clouds first');
      return;
    }

    setProcessingStatus('Running ICP alignment...');

    setTimeout(() => {
      const source = pointCloud2.points.map(p => p.clone());
      const target = pointCloud1.points;

      const centroid = (points: THREE.Vector3[]): THREE.Vector3 => {
        const c = new THREE.Vector3();
        points.forEach(p => c.add(p));
        c.divideScalar(points.length);
        return c;
      };

      const sourceCentroid = centroid(source);
      const targetCentroid = centroid(target);
      const translation = targetCentroid.clone().sub(sourceCentroid);
      source.forEach(p => p.add(translation));

      const alignMatrix = new THREE.Matrix4();
      alignMatrix.makeTranslation(translation.x, translation.y, translation.z);

      setPointCloud2({ points: source });
      setIsAligned(true);
      setAlignmentMatrix(alignMatrix);

      visualizePointCloudPreserveOrientation(group2Ref.current, source, 0x00ffff);
      setProcessingStatus('ICP alignment completed');
    }, 100);
  }, [pointCloud1, pointCloud2]);

  // Calculate distance statistics
  const calculateStats = (distances: number[]): DistanceStats => {
    const sorted = [...distances].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / distances.length;
    const stdDev = Math.sqrt(variance);
    const rms = Math.sqrt(distances.reduce((sum, d) => sum + d * d, 0) / distances.length);
    const median = sorted[Math.floor(sorted.length / 2)];
    const percentile95 = sorted[Math.floor(sorted.length * 0.95)];

    const numBins = 10;
    const binSize = (max - min) / numBins || 1;
    const bins: number[] = new Array(numBins).fill(0);
    distances.forEach(d => {
      const binIndex = Math.min(Math.floor((d - min) / binSize), numBins - 1);
      bins[binIndex]++;
    });

    const histogram = bins.map((count, i) => ({
      range: `${(min + i * binSize).toFixed(2)} - ${(min + (i + 1) * binSize).toFixed(2)}`,
      count,
      percentage: (count / distances.length) * 100
    }));

    return { min, max, mean, stdDev, rms, median, percentile95, histogram };
  };

  // Compute distances
  const handleComputeDistances = useCallback(() => {
    if (!pointCloud1 || !pointCloud2) {
      setProcessingStatus('Please convert to point clouds first');
      return;
    }

    setProcessingStatus('Computing bidirectional distances...');

    setTimeout(() => {
      const points1 = pointCloud1.points;
      const points2 = pointCloud2.points;

      const distances1to2: number[] = [];
      points1.forEach(p1 => {
        let minDist = Infinity;
        const sampleStep = Math.max(1, Math.floor(points2.length / 2000));
        for (let i = 0; i < points2.length; i += sampleStep) {
          const dist = p1.distanceTo(points2[i]);
          if (dist < minDist) minDist = dist;
        }
        distances1to2.push(minDist);
      });

      const distances2to1: number[] = [];
      points2.forEach(p2 => {
        let minDist = Infinity;
        const sampleStep = Math.max(1, Math.floor(points1.length / 2000));
        for (let i = 0; i < points1.length; i += sampleStep) {
          const dist = p2.distanceTo(points1[i]);
          if (dist < minDist) minDist = dist;
        }
        distances2to1.push(minDist);
      });

      const stats1to2 = calculateStats(distances1to2);
      const stats2to1 = calculateStats(distances2to1);

      const hausdorffDistance = Math.max(stats1to2.max, stats2to1.max);
      const symmetricMean = (stats1to2.mean + stats2to1.mean) / 2;
      const overlapThreshold = symmetricMean;
      const overlapping1 = distances1to2.filter(d => d < overlapThreshold).length;
      const overlapping2 = distances2to1.filter(d => d < overlapThreshold).length;
      const overlapPercentage = ((overlapping1 / points1.length + overlapping2 / points2.length) / 2) * 100;

      setBidirectionalStats({
        series1ToSeries2: stats1to2,
        series2ToSeries1: stats2to1,
        hausdorffDistance,
        symmetricMean,
        overlapPercentage
      });

      applyColorMapToGroup(group1Ref.current, points1, distances1to2, stats1to2.min, stats1to2.max);
      applyColorMapToGroup(group2Ref.current, points2, distances2to1, stats2to1.min, stats2to1.max);

      setShowColorMap(true);
      setProcessingStatus('Distance computation completed');
    }, 100);
  }, [pointCloud1, pointCloud2]);

  const applyColorMapToGroup = (group: THREE.Group, points: THREE.Vector3[], distances: number[], min: number, max: number) => {
    const toRemove: THREE.Object3D[] = [];
    group.traverse((child) => {
      if (child instanceof THREE.Points) toRemove.push(child);
    });
    toRemove.forEach(obj => group.remove(obj));

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);

    points.forEach((point, i) => {
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;

      const normalized = (distances[i] - min) / (max - min || 1);
      const color = new THREE.Color();
      if (normalized < 0.5) {
        color.setRGB(0, normalized * 2, 1 - normalized * 2);
      } else {
        color.setRGB((normalized - 0.5) * 2, 1 - (normalized - 0.5) * 2, 0);
      }

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    });

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({ size: 2, vertexColors: true, sizeAttenuation: true });
    group.add(new THREE.Points(geometry, material));
  };

  // Draw histograms
  useEffect(() => {
    if (!bidirectionalStats) return;

    const drawHistogram = (canvas: HTMLCanvasElement | null, histogram: { range: string; count: number; percentage: number }[], title: string) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const padding = 25;
      const barWidth = (width - padding * 2) / histogram.length;

      ctx.fillStyle = '#0a0e17';
      ctx.fillRect(0, 0, width, height);

      const maxCount = Math.max(...histogram.map(h => h.count));

      histogram.forEach((bin, i) => {
        const barHeight = (bin.count / maxCount) * (height - padding * 2);
        const x = padding + i * barWidth;
        const y = height - padding - barHeight;

        const normalized = i / (histogram.length - 1);
        let r, g, b;
        if (normalized < 0.5) {
          r = 0; g = Math.floor(normalized * 2 * 255); b = Math.floor((1 - normalized * 2) * 255);
        } else {
          r = Math.floor((normalized - 0.5) * 2 * 255); g = Math.floor((1 - (normalized - 0.5) * 2) * 255); b = 0;
        }

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x, y, barWidth - 2, barHeight);
      });

      ctx.strokeStyle = '#666';
      ctx.beginPath();
      ctx.moveTo(padding, padding);
      ctx.lineTo(padding, height - padding);
      ctx.lineTo(width - padding, height - padding);
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, width / 2, 12);
    };

    drawHistogram(histogram1CanvasRef.current, bidirectionalStats.series1ToSeries2.histogram, 'Series 1 → Series 2');
    drawHistogram(histogram2CanvasRef.current, bidirectionalStats.series2ToSeries1.histogram, 'Series 2 → Series 1');
  }, [bidirectionalStats]);

  // Export report
  const handleExportReport = useCallback(() => {
    if (!bidirectionalStats && !postureComparison) {
      setProcessingStatus('Please run analysis first');
      return;
    }

    const report: DeviationReport = {
      timestamp: new Date().toISOString(),
      series1Name: decodeURIComponent(series1Name),
      series2Name: decodeURIComponent(series2Name),
      study1Name: decodeURIComponent(study1Name),
      study2Name: decodeURIComponent(study2Name),
      pointCount1: pointCloud1?.points.length || 0,
      pointCount2: pointCloud2?.points.length || 0,
      bidirectionalStats,
      postureComparison,
      alignmentApplied: isAligned
    };

    let reportText = `
================================================================================
                    3D MODEL COMPARISON - COMPREHENSIVE REPORT
================================================================================
Generated: ${report.timestamp}

================================================================================
                              SERIES INFORMATION
================================================================================

SERIES 1: ${report.series1Name}
  Study: ${report.study1Name || 'N/A'}
  Point Count: ${report.pointCount1.toLocaleString()}

SERIES 2: ${report.series2Name}
  Study: ${report.study2Name || 'N/A'}
  Point Count: ${report.pointCount2.toLocaleString()}

ICP Alignment Applied: ${report.alignmentApplied ? 'Yes' : 'No'}
`;

    if (postureComparison) {
      const pc = postureComparison;
      reportText += `
================================================================================
                           POSTURE COMPARISON ANALYSIS
================================================================================

OVERALL POSTURE SIMILARITY SCORE: ${pc.postureSimilarityScore.toFixed(1)}%
  (100% = identical posture, 0% = completely different)

  Score Interpretation:
  ${pc.postureSimilarityScore >= 90 ? '  Excellent - Nearly identical postures' :
    pc.postureSimilarityScore >= 75 ? '  Good - Similar postures with minor differences' :
    pc.postureSimilarityScore >= 60 ? '  Moderate - Noticeable posture differences' :
    pc.postureSimilarityScore >= 40 ? '  Fair - Significant posture differences' :
    '  Poor - Very different postures'}

--------------------------------------------------------------------------------
                         GEOMETRIC DIMENSIONS
--------------------------------------------------------------------------------

                          Series 1          Series 2          Difference
                          --------          --------          ----------
  Length:                 ${pc.series1.boundingBox.size.x.toFixed(2).padStart(8)} mm    ${pc.series2.boundingBox.size.x.toFixed(2).padStart(8)} mm    ${pc.sizeDifference.length.toFixed(2).padStart(8)} mm
  Width:                  ${pc.series1.boundingBox.size.y.toFixed(2).padStart(8)} mm    ${pc.series2.boundingBox.size.y.toFixed(2).padStart(8)} mm    ${pc.sizeDifference.width.toFixed(2).padStart(8)} mm
  Height:                 ${pc.series1.boundingBox.size.z.toFixed(2).padStart(8)} mm    ${pc.series2.boundingBox.size.z.toFixed(2).padStart(8)} mm    ${pc.sizeDifference.height.toFixed(2).padStart(8)} mm

  Size Difference: ${pc.sizeDifference.percentageDiff.toFixed(1)}%

--------------------------------------------------------------------------------
                         ASPECT RATIOS
--------------------------------------------------------------------------------

                          Series 1          Series 2          Difference
                          --------          --------          ----------
  Length/Width:           ${pc.series1.aspectRatios.lengthToWidth.toFixed(3).padStart(8)}        ${pc.series2.aspectRatios.lengthToWidth.toFixed(3).padStart(8)}        ${pc.aspectRatioDifference.lengthToWidth.toFixed(3).padStart(8)}
  Length/Height:          ${pc.series1.aspectRatios.lengthToHeight.toFixed(3).padStart(8)}        ${pc.series2.aspectRatios.lengthToHeight.toFixed(3).padStart(8)}        ${pc.aspectRatioDifference.lengthToHeight.toFixed(3).padStart(8)}
  Width/Height:           ${pc.series1.aspectRatios.widthToHeight.toFixed(3).padStart(8)}        ${pc.series2.aspectRatios.widthToHeight.toFixed(3).padStart(8)}        ${pc.aspectRatioDifference.widthToHeight.toFixed(3).padStart(8)}

--------------------------------------------------------------------------------
                         ORIENTATION (Euler Angles)
--------------------------------------------------------------------------------

                          Series 1          Series 2          Difference
                          --------          --------          ----------
  Pitch (X-axis):         ${pc.series1.orientation.pitch.toFixed(1).padStart(8)}°       ${pc.series2.orientation.pitch.toFixed(1).padStart(8)}°       ${pc.orientationDifference.pitch.toFixed(1).padStart(8)}°
  Yaw (Y-axis):           ${pc.series1.orientation.yaw.toFixed(1).padStart(8)}°       ${pc.series2.orientation.yaw.toFixed(1).padStart(8)}°       ${pc.orientationDifference.yaw.toFixed(1).padStart(8)}°
  Roll (Z-axis):          ${pc.series1.orientation.roll.toFixed(1).padStart(8)}°       ${pc.series2.orientation.roll.toFixed(1).padStart(8)}°       ${pc.orientationDifference.roll.toFixed(1).padStart(8)}°

  Total Angular Difference: ${pc.orientationDifference.totalAngle.toFixed(1)}°

--------------------------------------------------------------------------------
                         PRINCIPAL AXES ALIGNMENT
--------------------------------------------------------------------------------

  Primary Axis Angle Difference:    ${pc.axisAngleDifferences.axis1Angle.toFixed(1)}°
  Secondary Axis Angle Difference:  ${pc.axisAngleDifferences.axis2Angle.toFixed(1)}°
  Tertiary Axis Angle Difference:   ${pc.axisAngleDifferences.axis3Angle.toFixed(1)}°

--------------------------------------------------------------------------------
                         CENTROID & VOLUME
--------------------------------------------------------------------------------

  Centroid Offset: ${pc.centroidOffset.toFixed(2)} mm

  Volume (estimated):
    Series 1: ${pc.series1.volume.toFixed(2)} mm³
    Series 2: ${pc.series2.volume.toFixed(2)} mm³
    Difference: ${pc.volumeDifference.toFixed(2)} mm³ (${pc.volumePercentageDiff.toFixed(1)}%)

--------------------------------------------------------------------------------
                         POSTURE INTERPRETATION
--------------------------------------------------------------------------------

  ${pc.axisAngleDifferences.axis1Angle < 10 ? '- Primary axis alignment: Excellent (< 10°)' :
    pc.axisAngleDifferences.axis1Angle < 20 ? '- Primary axis alignment: Good (< 20°)' :
    pc.axisAngleDifferences.axis1Angle < 45 ? '- Primary axis alignment: Moderate (< 45°)' :
    '- Primary axis alignment: Significant difference (> 45°)'}
  ${pc.sizeDifference.percentageDiff < 5 ? '- Size similarity: Excellent (< 5% difference)' :
    pc.sizeDifference.percentageDiff < 10 ? '- Size similarity: Good (< 10% difference)' :
    pc.sizeDifference.percentageDiff < 20 ? '- Size similarity: Moderate (< 20% difference)' :
    '- Size similarity: Significant difference (> 20%)'}
  ${pc.orientationDifference.totalAngle < 15 ? '- Orientation match: Excellent (< 15° total)' :
    pc.orientationDifference.totalAngle < 30 ? '- Orientation match: Good (< 30° total)' :
    pc.orientationDifference.totalAngle < 60 ? '- Orientation match: Moderate (< 60° total)' :
    '- Orientation match: Significant difference (> 60°)'}
`;
    }

    if (bidirectionalStats) {
      const s1to2 = bidirectionalStats.series1ToSeries2;
      const s2to1 = bidirectionalStats.series2ToSeries1;

      reportText += `
================================================================================
                         SURFACE DISTANCE ANALYSIS
================================================================================

OVERALL METRICS:
  Hausdorff Distance: ${bidirectionalStats.hausdorffDistance.toFixed(4)} mm
  Symmetric Mean: ${bidirectionalStats.symmetricMean.toFixed(4)} mm
  Surface Overlap: ${bidirectionalStats.overlapPercentage.toFixed(1)}%

SERIES 1 → SERIES 2:
  Min: ${s1to2.min.toFixed(4)} mm | Max: ${s1to2.max.toFixed(4)} mm
  Mean: ${s1to2.mean.toFixed(4)} mm | Median: ${s1to2.median.toFixed(4)} mm
  Std Dev: ${s1to2.stdDev.toFixed(4)} mm | RMS: ${s1to2.rms.toFixed(4)} mm
  95th Percentile: ${s1to2.percentile95.toFixed(4)} mm

SERIES 2 → SERIES 1:
  Min: ${s2to1.min.toFixed(4)} mm | Max: ${s2to1.max.toFixed(4)} mm
  Mean: ${s2to1.mean.toFixed(4)} mm | Median: ${s2to1.median.toFixed(4)} mm
  Std Dev: ${s2to1.stdDev.toFixed(4)} mm | RMS: ${s2to1.rms.toFixed(4)} mm
  95th Percentile: ${s2to1.percentile95.toFixed(4)} mm
`;
    }

    reportText += `
================================================================================
Report generated by Nivalon 3D Comparison Tool
================================================================================`;

    const blob = new Blob([reportText.trim()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comprehensive_report_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const jsonBlob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonA = document.createElement('a');
    jsonA.href = jsonUrl;
    jsonA.download = `comprehensive_report_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(jsonA);
    jsonA.click();
    document.body.removeChild(jsonA);
    URL.revokeObjectURL(jsonUrl);

    setProcessingStatus('Comprehensive report exported');
  }, [bidirectionalStats, postureComparison, pointCloud1, pointCloud2, series1Name, series2Name, study1Name, study2Name, isAligned]);

  // Reset
  const handleResetView = useCallback(() => {
    setIsPointCloudMode(false);
    setPointCloud1(null);
    setPointCloud2(null);
    setIsAligned(false);
    setBidirectionalStats(null);
    setPostureComparison(null);
    setShowColorMap(false);
    setShowPostureAxes(false);
    setProcessingStatus('');
    setAlignmentMatrix(null);

    if (axesHelper1Ref.current) { scene1Ref.current.remove(axesHelper1Ref.current); axesHelper1Ref.current = null; }
    if (axesHelper2Ref.current) { scene2Ref.current.remove(axesHelper2Ref.current); axesHelper2Ref.current = null; }

    if (stlUrls1.length > 0 || stlUrls2.length > 0) {
      setLoading(true);
      setStlUrls1([...stlUrls1]);
      setStlUrls2([...stlUrls2]);
    }
  }, [stlUrls1, stlUrls2]);

  const renderStatsSection = (stats: DistanceStats, title: string) => (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '11px', color: '#87ceeb', marginBottom: '6px', fontWeight: 'bold' }}>{title}</div>
      <div style={{ fontSize: '10px', color: '#ddd' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span>Min:</span><span style={{ color: '#4dff4d' }}>{stats.min.toFixed(4)} mm</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span>Max:</span><span style={{ color: '#ff4d4d' }}>{stats.max.toFixed(4)} mm</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span>Mean:</span><span style={{ color: '#87ceeb' }}>{stats.mean.toFixed(4)} mm</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span>Std Dev:</span><span style={{ color: '#ffa500' }}>{stats.stdDev.toFixed(4)} mm</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>RMS:</span><span style={{ color: '#da70d6' }}>{stats.rms.toFixed(4)} mm</span>
        </div>
      </div>
    </div>
  );

  const renderPostureSection = () => {
    if (!postureComparison) return null;
    const pc = postureComparison;

    return (
      <div style={{ fontSize: '10px', color: '#ddd' }}>
        {/* Similarity Score */}
        <div style={{
          backgroundColor: pc.postureSimilarityScore >= 75 ? 'rgba(40, 167, 69, 0.2)' :
            pc.postureSimilarityScore >= 50 ? 'rgba(255, 193, 7, 0.2)' : 'rgba(220, 53, 69, 0.2)',
          padding: '8px', borderRadius: '4px', marginBottom: '10px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff' }}>Posture Similarity</div>
          <div style={{
            fontSize: '24px', fontWeight: 'bold',
            color: pc.postureSimilarityScore >= 75 ? '#4dff4d' :
              pc.postureSimilarityScore >= 50 ? '#ffc107' : '#ff4d4d'
          }}>
            {pc.postureSimilarityScore.toFixed(1)}%
          </div>
        </div>

        {/* Size Comparison */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ color: '#87ceeb', fontWeight: 'bold', marginBottom: '4px' }}>Size Difference</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Length:</span><span>{pc.sizeDifference.length.toFixed(2)} mm</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Width:</span><span>{pc.sizeDifference.width.toFixed(2)} mm</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Height:</span><span>{pc.sizeDifference.height.toFixed(2)} mm</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ffa500' }}>
            <span>Overall:</span><span>{pc.sizeDifference.percentageDiff.toFixed(1)}%</span>
          </div>
        </div>

        {/* Orientation */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ color: '#87ceeb', fontWeight: 'bold', marginBottom: '4px' }}>Orientation Difference</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Pitch:</span><span>{pc.orientationDifference.pitch.toFixed(1)}°</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Yaw:</span><span>{pc.orientationDifference.yaw.toFixed(1)}°</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Roll:</span><span>{pc.orientationDifference.roll.toFixed(1)}°</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ffa500' }}>
            <span>Total:</span><span>{pc.orientationDifference.totalAngle.toFixed(1)}°</span>
          </div>
        </div>

        {/* Axes Alignment */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ color: '#87ceeb', fontWeight: 'bold', marginBottom: '4px' }}>Principal Axes Alignment</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#ff6666' }}>Primary:</span><span>{pc.axisAngleDifferences.axis1Angle.toFixed(1)}°</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#66ff66' }}>Secondary:</span><span>{pc.axisAngleDifferences.axis2Angle.toFixed(1)}°</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6666ff' }}>Tertiary:</span><span>{pc.axisAngleDifferences.axis3Angle.toFixed(1)}°</span>
          </div>
        </div>

        {/* Other metrics */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span>Centroid Offset:</span><span>{pc.centroidOffset.toFixed(2)} mm</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Volume Diff:</span><span>{pc.volumePercentageDiff.toFixed(1)}%</span>
          </div>
        </div>

        {/* Visualization Legend */}
        <div style={{
          marginTop: '10px',
          padding: '8px',
          backgroundColor: 'rgba(0,0,0,0.3)',
          borderRadius: '4px',
          border: '1px solid #333'
        }}>
          <div style={{ color: '#87ceeb', fontWeight: 'bold', marginBottom: '6px', fontSize: '10px' }}>Visualization Legend</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <div style={{ width: '20px', height: '4px', backgroundColor: '#ffff00', borderRadius: '2px' }}></div>
            <span style={{ fontSize: '9px' }}>Posture Line (Primary Axis)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <div style={{ width: '8px', height: '8px', backgroundColor: '#ff00ff', borderRadius: '50%' }}></div>
            <span style={{ fontSize: '9px' }}>Centroid Point</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <div style={{ width: '12px', height: '3px', backgroundColor: '#ff0000' }}></div>
            <span style={{ fontSize: '9px' }}>Primary Axis (Red)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <div style={{ width: '12px', height: '3px', backgroundColor: '#00ff00' }}></div>
            <span style={{ fontSize: '9px' }}>Secondary Axis (Green)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '3px', backgroundColor: '#0000ff' }}></div>
            <span style={{ fontSize: '9px' }}>Tertiary Axis (Blue)</span>
          </div>
        </div>

        {/* Toggle Axes Button */}
        <button
          onClick={togglePostureAxes}
          style={{
            width: '100%', marginTop: '10px', padding: '6px',
            backgroundColor: showPostureAxes ? 'rgba(40, 167, 69, 0.5)' : 'rgba(30, 144, 255, 0.5)',
            border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '11px'
          }}
        >
          {showPostureAxes ? 'Hide' : 'Show'} Posture Line & Axes
        </button>
      </div>
    );
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#000', color: '#fff', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', backgroundColor: '#0a0e17', borderBottom: '1px solid #333' }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>3D Model Comparison</h2>
        <button onClick={() => setShowControlPanel(!showControlPanel)} style={{
          padding: '6px 12px', backgroundColor: showControlPanel ? 'rgba(30, 144, 255, 0.3)' : 'transparent',
          border: '1px solid #444', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '13px'
        }}>
          {showControlPanel ? 'Hide' : 'Show'} Analysis Panel
        </button>
      </div>

      {loading && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1a1a2e', color: '#fff', padding: '32px 48px', borderRadius: '16px', minWidth: '320px', textAlign: 'center', border: '1px solid #333' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Loading 3D Models</div>
            <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '12px' }}>{loadingStatus}</div>
            <div style={{ width: '100%', height: '8px', backgroundColor: '#333', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ width: `${loadingProgress}%`, height: '100%', backgroundColor: '#4da6ff', borderRadius: '4px', transition: 'width 0.2s ease' }} />
            </div>
            <div style={{ fontSize: '14px', color: '#4da6ff', fontWeight: 'bold' }}>{loadingProgress}%</div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 100, background: 'rgba(255,50,50,0.9)', color: '#fff', padding: '20px 30px', borderRadius: '10px', fontSize: '16px', textAlign: 'center' }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%', height: 'calc(100vh - 60px)' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minWidth: 0 }}>
          {/* Series 1 View */}
          <div style={{ flex: 1, position: 'relative', borderRight: '2px solid #333', minWidth: '200px' }}>
            <div style={{ position: 'absolute', top: 15, left: 15, color: '#fff', zIndex: 50, backgroundColor: 'rgba(0,0,0,0.8)', padding: '10px 14px', borderRadius: '6px', fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: showColorMap ? '#ffff00' : '#ffffff', display: 'inline-block', border: '1px solid #444' }}></span>
                <span style={{ fontWeight: 'bold' }}>{decodeURIComponent(series1Name)}</span>
              </div>
              {study1Name && <div style={{ fontSize: '11px', color: '#aaa', marginLeft: '20px' }}>{decodeURIComponent(study1Name)}</div>}
              {isPointCloudMode && pointCloud1 && <div style={{ fontSize: '11px', color: '#4dff4d', marginTop: '4px' }}>Points: {pointCloud1.points.length}</div>}
            </div>
            <div ref={mount1Ref} style={{ width: '100%', height: '100%' }} />
          </div>

          {/* Series 2 View */}
          <div style={{ flex: 1, position: 'relative', minWidth: '200px' }}>
            <div style={{ position: 'absolute', top: 15, left: 15, color: '#00ffff', zIndex: 50, backgroundColor: 'rgba(0,0,0,0.8)', padding: '10px 14px', borderRadius: '6px', fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: showColorMap ? '#ffff00' : '#00ffff', display: 'inline-block' }}></span>
                <span style={{ fontWeight: 'bold' }}>{decodeURIComponent(series2Name)}</span>
              </div>
              {study2Name && <div style={{ fontSize: '11px', color: '#88cccc', marginLeft: '20px' }}>{decodeURIComponent(study2Name)}</div>}
              {isPointCloudMode && pointCloud2 && (
                <div style={{ fontSize: '11px', color: '#4dff4d', marginTop: '4px' }}>
                  Points: {pointCloud2.points.length}
                  {isAligned && <span style={{ marginLeft: '8px', color: '#ffa500' }}>(Aligned)</span>}
                </div>
              )}
            </div>
            <div ref={mount2Ref} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>

        {/* Control Panel */}
        {showControlPanel && (
          <div style={{ width: '320px', backgroundColor: '#0a0e17', borderLeft: '1px solid #333', padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>Analysis Tools</h3>

            {processingStatus && (
              <div style={{ backgroundColor: 'rgba(30, 144, 255, 0.2)', border: '1px solid rgba(30, 144, 255, 0.5)', padding: '8px 12px', borderRadius: '4px', fontSize: '12px', color: '#87ceeb' }}>
                {processingStatus}
              </div>
            )}

            {/* Step 1: Convert */}
            <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '6px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#aaa' }}>1. Convert to Point Clouds</h4>
              <label style={{ fontSize: '12px', color: '#888', display: 'block', marginBottom: '8px' }}>Density:</label>
              <input type="range" min="1000" max="50000" step="1000" value={pointCloudDensity}
                onChange={(e) => setPointCloudDensity(parseInt(e.target.value))}
                style={{ width: '100%', marginBottom: '5px' }} />
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '10px' }}>{pointCloudDensity.toLocaleString()} points</div>
              <button onClick={handleConvertToPointClouds} disabled={loading}
                style={{ width: '100%', padding: '8px', backgroundColor: isPointCloudMode ? '#28a745' : 'rgba(30, 144, 255, 0.8)', border: 'none', borderRadius: '4px', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                {isPointCloudMode ? 'Converted' : 'Convert'}
              </button>
            </div>

            {/* Step 2: Alignment */}
            <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '6px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#aaa' }}>2. Align (Optional)</h4>
              <button onClick={handleICPAlignment} disabled={!isPointCloudMode || isAligned}
                style={{ width: '100%', padding: '8px', backgroundColor: isAligned ? '#28a745' : !isPointCloudMode ? '#444' : 'rgba(30, 144, 255, 0.8)', border: 'none', borderRadius: '4px', color: '#fff', cursor: !isPointCloudMode || isAligned ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                {isAligned ? 'Aligned' : 'ICP Align'}
              </button>
            </div>

            {/* Step 3: Analysis Type Selection */}
            <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '6px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#aaa' }}>3. Run Analysis</h4>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                <button onClick={() => setActiveAnalysisTab('distance')}
                  style={{ flex: 1, padding: '6px', fontSize: '11px', backgroundColor: activeAnalysisTab === 'distance' ? 'rgba(30, 144, 255, 0.5)' : 'transparent', border: '1px solid #444', borderRadius: '3px', color: '#fff', cursor: 'pointer' }}>
                  Distance
                </button>
                <button onClick={() => setActiveAnalysisTab('posture')}
                  style={{ flex: 1, padding: '6px', fontSize: '11px', backgroundColor: activeAnalysisTab === 'posture' ? 'rgba(30, 144, 255, 0.5)' : 'transparent', border: '1px solid #444', borderRadius: '3px', color: '#fff', cursor: 'pointer' }}>
                  Posture
                </button>
              </div>

              {activeAnalysisTab === 'distance' && (
                <button onClick={handleComputeDistances} disabled={!isPointCloudMode}
                  style={{ width: '100%', padding: '8px', backgroundColor: bidirectionalStats ? '#28a745' : !isPointCloudMode ? '#444' : 'rgba(30, 144, 255, 0.8)', border: 'none', borderRadius: '4px', color: '#fff', cursor: !isPointCloudMode ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                  {bidirectionalStats ? 'Computed' : 'Compute Distances'}
                </button>
              )}

              {activeAnalysisTab === 'posture' && (
                <button onClick={handlePostureComparison} disabled={!isPointCloudMode}
                  style={{ width: '100%', padding: '8px', backgroundColor: postureComparison ? '#28a745' : !isPointCloudMode ? '#444' : 'rgba(30, 144, 255, 0.8)', border: 'none', borderRadius: '4px', color: '#fff', cursor: !isPointCloudMode ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                  {postureComparison ? 'Analyzed' : 'Analyze Posture'}
                </button>
              )}
            </div>

            {/* Results Section */}
            {(bidirectionalStats || postureComparison) && (
              <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '6px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#aaa' }}>4. Results</h4>

                {/* Tab switcher for results */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                  {bidirectionalStats && (
                    <button onClick={() => setActiveAnalysisTab('distance')}
                      style={{ flex: 1, padding: '4px', fontSize: '10px', backgroundColor: activeAnalysisTab === 'distance' ? 'rgba(30, 144, 255, 0.5)' : 'transparent', border: '1px solid #444', borderRadius: '3px', color: '#fff', cursor: 'pointer' }}>
                      Distance
                    </button>
                  )}
                  {postureComparison && (
                    <button onClick={() => setActiveAnalysisTab('posture')}
                      style={{ flex: 1, padding: '4px', fontSize: '10px', backgroundColor: activeAnalysisTab === 'posture' ? 'rgba(30, 144, 255, 0.5)' : 'transparent', border: '1px solid #444', borderRadius: '3px', color: '#fff', cursor: 'pointer' }}>
                      Posture
                    </button>
                  )}
                </div>

                {activeAnalysisTab === 'distance' && bidirectionalStats && (
                  <>
                    <div style={{ backgroundColor: 'rgba(30, 144, 255, 0.1)', padding: '8px', borderRadius: '4px', marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', color: '#87ceeb', fontWeight: 'bold', marginBottom: '6px' }}>Overall</div>
                      <div style={{ fontSize: '10px', color: '#ddd' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span>Hausdorff:</span><span style={{ color: '#ff4d4d' }}>{bidirectionalStats.hausdorffDistance.toFixed(4)} mm</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span>Sym. Mean:</span><span style={{ color: '#87ceeb' }}>{bidirectionalStats.symmetricMean.toFixed(4)} mm</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Overlap:</span><span style={{ color: '#4dff4d' }}>{bidirectionalStats.overlapPercentage.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                      {(['series1', 'series2', 'combined'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveStatsTab(tab)}
                          style={{ flex: 1, padding: '4px', fontSize: '9px', backgroundColor: activeStatsTab === tab ? 'rgba(30, 144, 255, 0.5)' : 'transparent', border: '1px solid #444', borderRadius: '3px', color: '#fff', cursor: 'pointer' }}>
                          {tab === 'series1' ? 'S1→S2' : tab === 'series2' ? 'S2→S1' : 'Both'}
                        </button>
                      ))}
                    </div>

                    {activeStatsTab === 'series1' && renderStatsSection(bidirectionalStats.series1ToSeries2, 'Series 1 → Series 2')}
                    {activeStatsTab === 'series2' && renderStatsSection(bidirectionalStats.series2ToSeries1, 'Series 2 → Series 1')}
                    {activeStatsTab === 'combined' && (
                      <>
                        {renderStatsSection(bidirectionalStats.series1ToSeries2, 'Series 1 → Series 2')}
                        <div style={{ borderTop: '1px solid #333', marginTop: '8px', paddingTop: '8px' }}>
                          {renderStatsSection(bidirectionalStats.series2ToSeries1, 'Series 2 → Series 1')}
                        </div>
                      </>
                    )}

                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>Histograms:</div>
                      <canvas ref={histogram1CanvasRef} width={280} height={60} style={{ borderRadius: '4px', width: '100%', marginBottom: '4px' }} />
                      <canvas ref={histogram2CanvasRef} width={280} height={60} style={{ borderRadius: '4px', width: '100%' }} />
                    </div>
                  </>
                )}

                {activeAnalysisTab === 'posture' && postureComparison && renderPostureSection()}
              </div>
            )}

            {/* Export */}
            <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '6px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#aaa' }}>5. Export Report</h4>
              <button onClick={handleExportReport} disabled={!bidirectionalStats && !postureComparison}
                style={{ width: '100%', padding: '8px', backgroundColor: (!bidirectionalStats && !postureComparison) ? '#444' : 'rgba(40, 167, 69, 0.8)', border: 'none', borderRadius: '4px', color: '#fff', cursor: (!bidirectionalStats && !postureComparison) ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                Export Report
              </button>
            </div>

            <button onClick={handleResetView}
              style={{ width: '100%', padding: '10px', backgroundColor: 'rgba(220, 53, 69, 0.8)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', marginTop: 'auto' }}>
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComparisonPage;
