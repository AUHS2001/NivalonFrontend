import React, { useEffect, useState, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { formatDicomDateTime } from '../../utils/Functions';
import { MODULE_TYPES, useSystem } from '@ohif/core';
import filesToStudies from '../../routes/Local/filesToStudies';
import { extensionManager } from '../../App';
import { StlInstanceContext } from '../../context/StlInstanceContext';
import { StlInstanceListDataContext } from '../../../../app/src/context/StlInstanceListDataContext';
import { ParentStudyIdContext } from '../../../../app/src/context/parentStudyIdContext';
import { SERVER_URL, fetchFile } from '../../../../../config/server';
import { isCached, getAllCachedBlobs, cacheBlob, initCacheForStudy } from '../../utils/dicomCache';
import { startSeriesLoad, fetchInitialBatch, cleanupPreviousStudy } from '../../services/lazyLoadService';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

interface Series {
  series_instance_uid: string;
  series_number: string;
  description: string;
  modality: string;
  num_series_instances: number;
  instance_url: string;
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

export default function StudyList() {
    const navigate = useNavigate()
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [loadingStudyIndex, setLoadingStudyIndex] = useState<number | null>(null);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [expandedStudyId, setExpandedStudyId] = useState<string | null>(null);
    const userRole = localStorage.getItem('userRole');
    const userToken = localStorage.getItem('token');
    const context = useContext(StlInstanceContext);
    const { stlInstanceId, seriesName, updateStlInstanceId, updateSeriesName, updateSeriesList } = context;
    const context1 = useContext(StlInstanceListDataContext);
    const { stlInstanceListData, updateStlInstanceListData } = context1;
    const context3 = useContext(ParentStudyIdContext);
    const { parentStudyId, updateParentStudyId } = context3;
    const system = useSystem();

    // Comparison popup state
    const [showComparisonPopup, setShowComparisonPopup] = useState(false);
    const [comparisonMode, setComparisonMode] = useState<'same' | 'different'>('same');
    const [selectedStudy1, setSelectedStudy1] = useState<Study | null>(null);
    const [selectedStudy2, setSelectedStudy2] = useState<Study | null>(null);
    const [selectedSeries1, setSelectedSeries1] = useState<Series | null>(null);
    const [selectedSeries2, setSelectedSeries2] = useState<Series | null>(null);
    const [comparisonError, setComparisonError] = useState<string>('');

    const [loadingSeriesUid, setLoadingSeriesUid] = useState<string | null>(null);
    const [seriesLoadProgress, setSeriesLoadProgress] = useState(0);

    // Download 3D popup state
    const [downloadPopupStudy, setDownloadPopupStudy] = useState<Study | null>(null);
    const [downloadingSeriesUid, setDownloadingSeriesUid] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [noStlMessage, setNoStlMessage] = useState<string | null>(null);

    // View 3D popup state
    const [viewStlSeriesUid, setViewStlSeriesUid] = useState<string | null>(null);
    const [viewStlFiles, setViewStlFiles] = useState<{name: string, url: string}[]>([]);
    const [viewStlLoading, setViewStlLoading] = useState(false);
    const [selectedStlIndex, setSelectedStlIndex] = useState(0);

    // Filter state
    const [filterPatientName, setFilterPatientName] = useState('');
    const [filterMRN, setFilterMRN] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [filterDescription, setFilterDescription] = useState('');
    const [filterModality, setFilterModality] = useState('');
    const [filterAccession, setFilterAccession] = useState('');
    const [filterInstances, setFilterInstances] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    const toggleRow = (studyInstanceUid: string) => {
      setExpandedStudyId(expandedStudyId === studyInstanceUid ? null : studyInstanceUid);
    };

    const handleNavigate = (study: any, index: number) => {
        // Extract all series_instance_uids from the study's series
        setLoadingStudyIndex(index);
        console.log("study data ",study?.study_instance_uid)
        updateStlInstanceId(study?.series[0].series_instance_uid)
        updateSeriesName(study?.series[0].description)
        updateSeriesList(study?.series)
        console.log("series description ==> ",study?.series[0].description)
        updateParentStudyId(study?.study_instance_uid)
        getSeriesInstances(study);
    };


    const handleLoadSeries = async (series: Series, study: Study) => {
        try {
            setLoadingSeriesUid(series.series_instance_uid);
            setSeriesLoadProgress(0);

            updateStlInstanceId(series.series_instance_uid);
            updateSeriesName(series.description);
            updateSeriesList(study.series);
            updateParentStudyId(study.study_instance_uid);

            cleanupPreviousStudy();

            setSeriesLoadProgress(10);

            // Fetch all instance URLs for this series
            let urls: string[] = [];
            if (series.instance_url) {
                urls = [series.instance_url];
            }
            try {
                const fetchedUrls = await fetchInitialBatch(series.series_instance_uid, 999999);
                if (fetchedUrls.length > 0) urls = fetchedUrls;
            } catch (err) {
                console.warn('[LoadSeries] Failed to fetch URLs, using instance_url fallback:', err);
            }

            if (urls.length === 0) {
                throw new Error('No instance URLs found for this series');
            }

            setSeriesLoadProgress(20);

            // Download all files for this series
            const totalFiles = urls.length;
            let completed = 0;

            const downloadFile = async (url: string): Promise<File | null> => {
                for (let retries = 0; retries < 3; retries++) {
                    try {
                        const res = await fetchFile(url);
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const blob = await res.blob();
                        if (study.study_instance_uid) cacheBlob(url, blob);
                        completed++;
                        setSeriesLoadProgress(20 + Math.round((completed / totalFiles) * 70));
                        return new File([blob], url.split('/').pop() || 'dicom.dcm', {
                            type: blob.type || 'application/dicom',
                        });
                    } catch (err) {
                        console.error(`[downloadFile] Attempt ${retries + 1}/3 failed for ${url}:`, err);
                        if (retries === 2) {
                            completed++;
                            setSeriesLoadProgress(20 + Math.round((completed / totalFiles) * 70));
                            return null;
                        }
                        await new Promise(r => setTimeout(r, 1000 * (retries + 1)));
                    }
                }
                return null;
            };

            // Download with concurrency limit to avoid overwhelming the browser
            const CONCURRENCY = 6;
            const results: (File | null)[] = new Array(urls.length);
            let nextIdx = 0;
            const worker = async () => {
                while (nextIdx < urls.length) {
                    const i = nextIdx++;
                    results[i] = await downloadFile(urls[i]);
                }
            };
            await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, () => worker()));
            const validFiles = results.filter((f): f is File => f !== null);

            if (validFiles.length === 0) {
                throw new Error('No valid DICOM files were fetched');
            }

            // Determine mode path
            const userPermissions: string[] = JSON.parse(localStorage.getItem('userPermissions') || '[]');
            const hasEdit = userPermissions.includes('case:edit');

            let modePath = "viewer/dicomlocal";
            if (userRole === 'admin' || userRole === 'super_admin') {
                modePath = "segmentation/dicomlocal";
            } else if (userRole === 'analyst') {
                modePath = hasEdit ? "segmentation/dicomlocal" : "signons/dicomlocal";
            } else if (userRole === 'patient' || userRole === 'signer') {
                modePath = "signons/dicomlocal";
            }

            const dataSourceModules = extensionManager.modules[MODULE_TYPES.DATA_SOURCE];
            const localDataSources = dataSourceModules.reduce((acc, curr) => {
                const mods = [];
                curr.module.forEach(mod => { if (mod.type === 'localApi') mods.push(mod); });
                return acc.concat(mods);
            }, []);
            const dataSource = localDataSources[0].createDataSource({});

            const studies = await filesToStudies(validFiles, dataSource);
            setSeriesLoadProgress(100);

            const query = new URLSearchParams();
            studies.forEach(id => query.append('StudyInstanceUIDs', id));
            query.append('datasources', 'dicomlocal');
            query.append('t', Date.now().toString());
            navigate(`/${modePath}?${decodeURIComponent(query.toString())}`);

        } catch (err) {
            console.error('[LoadSeries] Failed:', err);
        } finally {
            setLoadingSeriesUid(null);
            setSeriesLoadProgress(0);
        }
    };

    useEffect(() => {
        console.log("role => ",userRole);
        const fetchData = async () => {
            try {
                const response = await axios.get<{ data: { series: { series_instance_uid: string }[] }[] }>(`${SERVER_URL}/imaging/studies`,{
                    headers: {
                        Authorization: `Bearer ${userToken}`,
                        "Content-Type": "application/json"
                    }
                });
                const payload = response.data?.data;
                const studiesArray = Array.isArray(payload) ? payload : (payload?.items ?? []);
                setData(studiesArray);
                updateStlInstanceListData(studiesArray)
            } catch (error) {
                console.error('Failed to fetch studies:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    console.log("data =>",data);

    const getSeriesInstances = async (selectedStudy?) => {
        try {
            setLoadingProgress(0);

            // Clean up memory from any previously loaded study
            cleanupPreviousStudy();

            const studyUID = selectedStudy?.study_instance_uid;

            // ── CACHE HIT: Load from IndexedDB (instant) ──
            if (studyUID && await isCached(studyUID)) {
                const cachedEntries = await getAllCachedBlobs();
                if (cachedEntries.length > 0) {
                    setLoadingProgress(50);
                    const files = cachedEntries.map(e =>
                        new File([e.blob], e.url.split('/').pop() || 'cached.dcm', {
                            type: 'application/dicom',
                        })
                    );

                    let modePath = "viewer/dicomlocal";
                    if (userRole === 'analyst') modePath = "segmentation/dicomlocal";
                    else if (userRole === 'admin') modePath = "segmentation/dicomlocal";
                    else if (userRole === 'signer') modePath = "signons/dicomlocal";

                    const dataSourceModules = extensionManager.modules[MODULE_TYPES.DATA_SOURCE];
                    const localDataSources = dataSourceModules.reduce((acc, curr) => {
                        const mods = [];
                        curr.module.forEach(mod => { if (mod.type === 'localApi') mods.push(mod); });
                        return acc.concat(mods);
                    }, []);
                    const dataSource = localDataSources[0].createDataSource({});

                    const studies = await filesToStudies(files, dataSource);
                    setLoadingProgress(100);

                    const query = new URLSearchParams();
                    studies.forEach(id => query.append('StudyInstanceUIDs', id));
                    query.append('datasources', 'dicomlocal');
                    query.append('t', Date.now().toString());
                    navigate(`/${modePath}?${decodeURIComponent(query.toString())}`);
                    return;
                }
            }

            const studiesToProcess = selectedStudy ? [selectedStudy] : data;

            // Collect all series, including those without instance_url
            const rawSeries = studiesToProcess.flatMap(study =>
                study.series.map(s => ({
                    url: s.instance_url || '',
                    modality: s.modality || '',
                    seriesUID: s.series_instance_uid || '',
                    numInstances: s.num_series_instances || 1,
                }))
            );

            // For series missing instance_url, fetch one from /imaging/instances
            const allSeries: typeof rawSeries = [];
            for (const s of rawSeries) {
                if (s.url) {
                    allSeries.push(s);
                } else if (s.seriesUID) {
                    try {
                        const urls = await fetchInitialBatch(s.seriesUID, 1);
                        if (urls.length > 0) {
                            allSeries.push({ ...s, url: urls[0] });
                        } else {
                            console.warn(`[StudyList] No instance URLs for series ${s.seriesUID}, skipping`);
                        }
                    } catch (err) {
                        console.warn(`[StudyList] Failed to fetch URL for series ${s.seriesUID}:`, err);
                    }
                }
            }

            if (allSeries.length === 0) {
                throw new Error("No instance URLs found for the selected study");
            }

            // Initialize cache for this study (clears previous study's cache)
            if (studyUID) {
                initCacheForStudy(studyUID);
            }

            // ── PHASE 1: Load priority series completely, 1 image per other series ──
            setLoadingProgress(5);

            const ctMrSeries = allSeries.filter(s => ['CT', 'MR'].includes(s.modality?.toUpperCase()));
            const candidates = (ctMrSeries.length > 0 ? ctMrSeries : allSeries)
                .sort((a, b) => b.numInstances - a.numInstances);
            const prioritySeries = candidates[0];

            // Fetch ALL instance URLs for the priority series
            let priorityUrls: string[] = [];
            if (prioritySeries) {
                try {
                    priorityUrls = await fetchInitialBatch(prioritySeries.seriesUID, 999999);
                } catch (err) {
                    console.warn('[StudyList] Failed to fetch priority series URLs, using fallback:', err);
                }
            }

            // Build download list
            const urlsToDownload: string[] = [];
            allSeries.forEach(s => {
                if (s.seriesUID === prioritySeries?.seriesUID && priorityUrls.length > 0) {
                    // Priority series: download ALL instances
                    priorityUrls.forEach(u => urlsToDownload.push(u));
                } else {
                    // Other series: just 1 thumbnail image
                    urlsToDownload.push(s.url);
                }
            });

            setLoadingProgress(15);

            // ── PHASE 2: Download all files ──
            const totalFiles = urlsToDownload.length;
            let completed = 0;
            const downloadFile = async (url: string): Promise<File | null> => {
                for (let retries = 0; retries < 3; retries++) {
                    try {
                        const res = await fetchFile(url);
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const blob = await res.blob();
                        if (studyUID) cacheBlob(url, blob);
                        const fileName = url.split('/').pop();
                        completed++;
                        setLoadingProgress(15 + Math.round((completed / totalFiles) * 80));
                        return new File([blob], fileName || 'dicom.dcm', {
                            type: blob.type || 'application/dicom',
                        });
                    } catch (err) {
                        console.error(`[downloadFile] Attempt ${retries + 1}/3 failed for ${url}:`, err);
                        if (retries === 2) {
                            completed++;
                            setLoadingProgress(15 + Math.round((completed / totalFiles) * 80));
                            return null;
                        }
                        await new Promise(r => setTimeout(r, 1000 * (retries + 1)));
                    }
                }
                return null;
            };

            // Download with concurrency limit to avoid overwhelming the browser
            const CONCURRENCY = 6;
            const downloadResults: (File | null)[] = new Array(urlsToDownload.length);
            let nextDlIdx = 0;
            const dlWorker = async () => {
                while (nextDlIdx < urlsToDownload.length) {
                    const i = nextDlIdx++;
                    downloadResults[i] = await downloadFile(urlsToDownload[i]);
                }
            };
            await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urlsToDownload.length) }, () => dlWorker()));
            const validFiles = downloadResults.filter((f): f is File => f !== null);

            if (validFiles.length === 0) {
                throw new Error("No valid DICOM files were fetched");
            }

            // Determine the mode path based on user role + permissions
            const userPermissions: string[] = JSON.parse(localStorage.getItem('userPermissions') || '[]');
            const hasView = userPermissions.includes('case:view');
            const hasEdit = userPermissions.includes('case:edit');
            const hasApprove = userPermissions.includes('case:approve');

            let modePath = "viewer/dicomlocal";
            if (userRole === 'admin' || userRole === 'super_admin') {
                modePath = "segmentation/dicomlocal";
            } else if (userRole === 'analyst') {
                if (hasEdit) {
                    // case:view + case:edit (with or without case:approve) → segmentation
                    modePath = "segmentation/dicomlocal";
                } else {
                    // only case:view → signon viewer
                    modePath = "signons/dicomlocal";
                }
            } else if (userRole === 'patient' || userRole === 'signer') {
                modePath = "signons/dicomlocal";
            }

            // Initialize the dicom local dataSource
            const dataSourceModules = extensionManager.modules[MODULE_TYPES.DATA_SOURCE];
            const localDataSources = dataSourceModules.reduce((acc, curr) => {
                const mods = [];
                curr.module.forEach(mod => {
                    if (mod.type === 'localApi') mods.push(mod);
                });
                return acc.concat(mods);
            }, []);
            const dataSource = localDataSources[0].createDataSource({});

            const studies = await filesToStudies(validFiles, dataSource);
            setLoadingProgress(100);

            // ── NAVIGATE ──
            const query = new URLSearchParams();
            studies.forEach(id => query.append('StudyInstanceUIDs', id));
            query.append('datasources', 'dicomlocal');
            query.append('t', Date.now().toString());
            navigate(`/${modePath}?${decodeURIComponent(query.toString())}`);

            // ── Register only the priority series as fully loaded (so drag-and-drop won't re-download it).
            // Other series load on-demand when the user double-clicks or drags them onto a viewport. ──
            if (studyUID && prioritySeries && priorityUrls.length > 0) {
                setTimeout(() => {
                    startSeriesLoad(prioritySeries.seriesUID, studyUID, priorityUrls).catch(err =>
                        console.warn('[StudyList] startSeriesLoad error:', err)
                    );
                }, 3000);
            }

        } catch (err) {
            console.error("Failed to process series:", err);
        } finally {
            setLoadingStudyIndex(null);
            setLoadingProgress(0);
        }
    };


    function processList(list) {
        const result = {};

        list.forEach(item => {
          const key = `${item.series_instance_uid}-${item.description}`;

          if (!result[key]) {
            result[key] = {
              series_instance_uid: item.series_instance_uid,
              description: item.description,
              total_instances: 0
            };
          }

          result[key].total_instances += item.num_series_instances;
        });

        return Object.values(result);
      }

    // Comparison functions
    const openComparisonPopup = () => {
        setShowComparisonPopup(true);
        setComparisonMode('same');
        setSelectedStudy1(null);
        setSelectedStudy2(null);
        setSelectedSeries1(null);
        setSelectedSeries2(null);
        setComparisonError('');
    };

    const closeComparisonPopup = () => {
        setShowComparisonPopup(false);
        setSelectedStudy1(null);
        setSelectedStudy2(null);
        setSelectedSeries1(null);
        setSelectedSeries2(null);
        setComparisonError('');
    };

    const handleDownload3D = async (seriesUid: string) => {
        let simInterval: ReturnType<typeof setInterval> | null = null;
        try {
            setDownloadingSeriesUid(seriesUid);
            setDownloadProgress(0);
            setNoStlMessage(null);

            // Simulated progress: ramps from 0→90% while waiting
            let simulated = 0;
            simInterval = setInterval(() => {
                simulated += (90 - simulated) * 0.04;
                setDownloadProgress(Math.round(simulated));
            }, 200);

            const response = await fetch(
                `${SERVER_URL}/analyst/meshes/processed/download?series_instance_uid=${seriesUid}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${userToken}`,
                        "Content-Type": "application/json"
                    },
                    credentials: 'include',
                }
            );

            if (!response.ok) {
                throw new Error(`Download failed: ${response.status} ${response.statusText}`);
            }

            const contentLength = response.headers.get('Content-Length');
            const total = contentLength ? parseInt(contentLength, 10) : 0;
            const contentType = response.headers.get('Content-Type') || 'application/zip';

            const contentDisposition = response.headers.get('Content-Disposition');
            let fileName = 'downloaded_3d_file.zip';
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/);
                if (fileNameMatch && fileNameMatch[1]) {
                    fileName = fileNameMatch[1];
                }
            }

            const reader = response.body!.getReader();
            const chunks: Uint8Array[] = [];
            let received = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += value.length;
                if (total > 0) {
                    const realPct = Math.round((received / total) * 100);
                    simulated = Math.max(simulated, realPct);
                    setDownloadProgress(simulated);
                }
            }

            clearInterval(simInterval);
            simInterval = null;
            setDownloadProgress(100);
            await new Promise(r => setTimeout(r, 600));

            const blob = new Blob(chunks, { type: contentType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (error: any) {
            console.error('Download error:', error);
            setNoStlMessage(seriesUid);
        } finally {
            if (simInterval) clearInterval(simInterval);
            setDownloadingSeriesUid(null);
            setDownloadProgress(0);
        }
    };

    const handleView3D = async (seriesUid: string) => {
        try {
            setViewStlSeriesUid(seriesUid);
            setViewStlLoading(true);
            setViewStlFiles([]);
            setSelectedStlIndex(0);

            const response = await fetch(
                `${SERVER_URL}/analyst/meshes?series_instance_uid=${seriesUid}`,
                {
                    headers: {
                        Authorization: `Bearer ${userToken}`,
                        "Content-Type": "application/json"
                    },
                    credentials: 'include',
                }
            );

            if (!response.ok) {
                throw new Error(`Check failed: ${response.status}`);
            }

            const data = await response.json();
            const versions = data?.data?.versions || [];
            const stlUrls: string[] = versions.length > 0
                ? (versions.reduce((a: any, b: any) => (a.version > b.version ? a : b)).urls || [])
                : (data?.data?.processed?.urls || []);

            if (stlUrls.length === 0) {
                setNoStlMessage(seriesUid);
                setViewStlSeriesUid(null);
                setViewStlLoading(false);
                return;
            }

            const files = stlUrls.map(url => ({
                name: url.substring(url.lastIndexOf('/') + 1),
                url,
            }));

            setViewStlFiles(files);
        } catch (error: any) {
            console.error('View error:', error);
            setNoStlMessage(seriesUid);
            setViewStlSeriesUid(null);
        } finally {
            setViewStlLoading(false);
        }
    };

    const FILE_COLORS = [
        '#3498db', '#2ecc71', '#e74c3c', '#f1c40f', '#9b59b6',
        '#e67e22', '#1abc9c', '#e91e63', '#00bcd4', '#ff5722',
        '#8bc34a', '#673ab7', '#ff9800', '#03a9f4', '#cddc39',
        '#f44336', '#4caf50', '#2196f3', '#ffeb3b', '#795548',
    ];
    const getLegendColor = (index: number): string => {
        return FILE_COLORS[index % FILE_COLORS.length];
    };

    const StlMainViewer = ({ files }: { files: {name: string, url: string}[] }) => {
        const containerRef = useRef<HTMLDivElement>(null);
        const [loadedCount, setLoadedCount] = useState(0);
        const totalFiles = files.length;

        useEffect(() => {
            const container = containerRef.current;
            if (!container || files.length === 0) return;
            setLoadedCount(0);

            const width = container.clientWidth || 600;
            const height = container.clientHeight || 500;

            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setSize(width, height);
            renderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(renderer.domElement);

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x000000);

            const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
            camera.up.set(0, 0, 1);
            camera.position.set(0, -250, 50);
            camera.lookAt(0, 0, 0);

            // Lighting — same as SpinalCordViewer
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
            scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.3));

            const group = new THREE.Group();
            scene.add(group);

            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.25;
            controls.maxDistance = 5000;

            let animationId: number;
            let disposed = false;

            const animate = () => {
                if (disposed) return;
                animationId = requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
            };
            animate();

            // Load all STLs in parallel into the group
            const loader = new STLLoader();
            const loadPromises = files.map(async (file) => {
                try {
                    const res = await fetchFile(file.url);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const arrayBuffer = await res.arrayBuffer();
                    if (disposed) return;

                    const geometry = loader.parse(arrayBuffer);
                    geometry.computeVertexNormals();

                    const material = new THREE.MeshPhongMaterial({
                        color: 0xffffff,
                        specular: 0x111111,
                        shininess: 10,
                        side: THREE.DoubleSide,
                    });

                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.userData = { fileName: file.name };
                    group.add(mesh);
                    setLoadedCount(prev => prev + 1);
                } catch (err) {
                    console.error(`Failed to load STL: ${file.name}`, err);
                    setLoadedCount(prev => prev + 1);
                }
            });

            Promise.all(loadPromises).then(() => {
                if (disposed) return;

                // Fit camera to entire group
                const bbox = new THREE.Box3().setFromObject(group);
                if (bbox.isEmpty()) return;

                const center = bbox.getCenter(new THREE.Vector3());
                const size = bbox.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const fov = camera.fov * (Math.PI / 180);
                const camDist = maxDim / (2 * Math.tan(fov / 2)) * 1.0;

                controls.target.copy(center);
                camera.position.set(center.x, center.y - camDist, center.z);
                camera.up.set(0, 0, 1);
                camera.lookAt(center);
                camera.updateProjectionMatrix();
                controls.update();
            });

            const handleResize = () => {
                if (disposed || !container) return;
                const w = container.clientWidth;
                const h = container.clientHeight;
                renderer.setSize(w, h);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
            };
            window.addEventListener('resize', handleResize);

            return () => {
                disposed = true;
                window.removeEventListener('resize', handleResize);
                cancelAnimationFrame(animationId);
                controls.dispose();
                renderer.dispose();
                if (container.contains(renderer.domElement)) {
                    container.removeChild(renderer.domElement);
                }
                scene.traverse((obj) => {
                    if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
                    if ((obj as THREE.Mesh).material) {
                        const mat = (obj as THREE.Mesh).material;
                        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
                        else (mat as THREE.Material).dispose();
                    }
                });
            };
        }, [files]);

        const isLoading = loadedCount < totalFiles;

        return (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: '10px', overflow: 'hidden' }} />
                {isLoading && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: '10px',
                    }}>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" style={{ width: 20, height: 20 }}></span>
                        <span style={{ color: '#aaa' }}>Loading models... {loadedCount}/{totalFiles}</span>
                    </div>
                )}
            </div>
        );
    };

    const handleComparisonModeChange = (mode: 'same' | 'different') => {
        setComparisonMode(mode);
        setSelectedStudy1(null);
        setSelectedStudy2(null);
        setSelectedSeries1(null);
        setSelectedSeries2(null);
        setComparisonError('');
    };

    const handleStudySelect = (study: Study, position: 1 | 2) => {
        if (position === 1) {
            setSelectedStudy1(study);
            setSelectedSeries1(null);
        } else {
            setSelectedStudy2(study);
            setSelectedSeries2(null);
        }
        setComparisonError('');
    };

    const handleSeriesSelect = (series: Series, position: 1 | 2) => {
        if (position === 1) {
            setSelectedSeries1(series);
        } else {
            setSelectedSeries2(series);
        }
        setComparisonError('');
    };

    const handleComparisonConfirm = () => {
        if (!selectedSeries1 || !selectedSeries2) {
            setComparisonError('Please select two series for comparison');
            return;
        }

        if (selectedSeries1.series_instance_uid === selectedSeries2.series_instance_uid) {
            setComparisonError('Please select two different series');
            return;
        }

        // Build URL with query parameters
        const params = new URLSearchParams();
        params.set('series1', selectedSeries1.series_instance_uid);
        params.set('series2', selectedSeries2.series_instance_uid);
        params.set('series1Name', selectedSeries1.description || 'Series 1');
        params.set('series2Name', selectedSeries2.description || 'Series 2');

        if (comparisonMode === 'different' && selectedStudy1 && selectedStudy2) {
            params.set('study1', selectedStudy1.study_instance_uid);
            params.set('study2', selectedStudy2.study_instance_uid);
            params.set('study1Name', selectedStudy1.patient_name || selectedStudy1.description || 'Study 1');
            params.set('study2Name', selectedStudy2.patient_name || selectedStudy2.description || 'Study 2');
        } else if (comparisonMode === 'same' && selectedStudy1) {
            params.set('study1', selectedStudy1.study_instance_uid);
            params.set('study2', selectedStudy1.study_instance_uid);
            params.set('study1Name', selectedStudy1.patient_name || selectedStudy1.description || 'Study');
            params.set('study2Name', selectedStudy1.patient_name || selectedStudy1.description || 'Study');
        }

        closeComparisonPopup();
        // Open in new tab
        window.open(`/comparison?${params.toString()}`, '_blank');
    };

    const getSeriesListForPosition = (position: 1 | 2): Series[] => {
        if (comparisonMode === 'same') {
            return selectedStudy1?.series || [];
        }
        return position === 1 ? (selectedStudy1?.series || []) : (selectedStudy2?.series || []);
    };

    // ─── Filter studies based on filter inputs ───
    const filteredData = React.useMemo(() => {
        if (!Array.isArray(data)) return [];
        return data.filter((study: Study) => {
            // Patient Name
            if (filterPatientName && !(study.patient_name || '').toLowerCase().includes(filterPatientName.toLowerCase())) {
                return false;
            }
            // Study Instance ID
            if (filterMRN && !(study.study_instance_uid || '').toLowerCase().includes(filterMRN.toLowerCase())) {
                return false;
            }
            // Study Date range (DICOM date is YYYYMMDD, input date is YYYY-MM-DD)
            if (filterStartDate || filterEndDate) {
                const raw = (study.date || '').replace(/[-./]/g, '');
                if (raw.length < 8) { if (filterStartDate || filterEndDate) return false; }
                const studyDate = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
                if (filterStartDate && studyDate < filterStartDate) return false;
                if (filterEndDate && studyDate > filterEndDate) return false;
            }
            // Description
            if (filterDescription && !(study.description || '').toLowerCase().includes(filterDescription.toLowerCase())) {
                return false;
            }
            // Modality
            if (filterModality) {
                const studyModalities = study.series.map(s => s.modality?.toUpperCase());
                if (!studyModalities.includes(filterModality.toUpperCase())) return false;
            }
            // Accession (check study-level or fall back to description match)
            if (filterAccession) {
                const accession = (study as any).accession_number || (study as any).accession || '';
                if (!accession.toLowerCase().includes(filterAccession.toLowerCase())) return false;
            }
            // Instances count
            if (filterInstances) {
                const hasMatchingSeries = study.series.some(s => (s.series_instance_uid || '').toLowerCase().includes(filterInstances.toLowerCase()));
                if (!hasMatchingSeries) return false;
            }
            // Status
            if (filterStatus) {
                const status = (study as any).status || '';
                if (status.toLowerCase() !== filterStatus.toLowerCase()) return false;
            }
            return true;
        });
    }, [data, filterPatientName, filterMRN, filterStartDate, filterEndDate, filterDescription, filterModality, filterAccession, filterInstances, filterStatus]);

    return (
        <div className="p-3" style={{
                backgroundColor: "#0a0e17",
                minHeight: '100vh',
                position: 'relative',
                overflow: 'hidden',
                color: "white"
            }}>

        {/* Animated Background Elements */}
         <div style={{
                position: 'absolute',
                top: '10%',
                left: '10%',
                width: '300px',
                height: '300px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(56, 182, 255, 0.2) 0%, transparent 70%)',
                filter: 'blur(40px)',
                zIndex: 0,
                pointerEvents: 'none'
            }}></div>

            <div style={{
                position: 'absolute',
                bottom: '15%',
                right: '10%',
                width: '400px',
                height: '400px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(124, 58, 237, 0.15) 0%, transparent 70%)',
                filter: 'blur(50px)',
                zIndex: 0,
                pointerEvents: 'none'
            }}></div>

            {/* Header */}
            <div className="d-flex justify-content-between align-items-center mb-3 px-2">
                <h4>Study List</h4>
                <div className="d-flex align-items-center gap-3">
                    <button
                        className="btn btn-sm btn-primary"
                        onClick={openComparisonPopup}
                    >
                        <span className="me-1">&#x2194;</span>
                        Compare 3D
                    </button>
                    <div className="text-end">
                        <span className="text-primary me-2">{filteredData?.length ?? 0}</span>
                        <span className="text">Studies</span>
                    </div>
                </div>
            </div>

            {/* Filter Section */}
            <div className="mb-1 p-3" style={{ position: 'relative', zIndex: 1, backgroundColor: '#111827', borderRadius: '6px', border: 'none', outline: 'none', boxShadow: 'none' }}>
                <div className="d-flex align-items-end">
                    <div style={{ width: '24px', flexShrink: 0 }}></div>
                    <div style={{ width: '15%', paddingRight: '8px' }}>
                        <div className="fw-bold mb-1">Patient Name</div>
                        <input type="text" className="form-control form-control-sm bg-white text-black border-0" placeholder='Enter name' value={filterPatientName} onChange={e => setFilterPatientName(e.target.value)} />
                    </div>
                    <div style={{ width: '15%', paddingRight: '8px' }}>
                        <div className="fw-bold mb-1">Study Instance ID</div>
                        <input type="text" className="form-control form-control-sm bg-white text-black border-0" placeholder='Enter Study ID' value={filterMRN} onChange={e => setFilterMRN(e.target.value)} />
                    </div>
                    <div style={{ width: '15%', paddingRight: '8px' }}>
                        <div className="fw-bold mb-1">Series Instance ID</div>
                        <input type="text" className="form-control form-control-sm bg-white text-black border-0" placeholder="Series ID" value={filterInstances} onChange={e => setFilterInstances(e.target.value)} />
                    </div>
                    <div style={{ width: '18%', paddingRight: '8px' }}>
                        <div className="fw-bold mb-1">Study Date</div>
                        <div className="d-flex gap-1">
                            <input type="date" className="form-control form-control-sm bg-white text-black border-0" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
                            <input type="date" className="form-control form-control-sm bg-white text-black border-0" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
                        </div>
                    </div>
                    <div style={{ width: '16.5%', paddingRight: '8px' }}>
                        <div className="fw-bold mb-1">Description</div>
                        <input type="text" className="form-control form-control-sm bg-white text-black border-0" placeholder="Enter description" value={filterDescription} onChange={e => setFilterDescription(e.target.value)} />
                    </div>
                    <div style={{ width: '8%', paddingRight: '8px' }}>
                        <div className="fw-bold mb-1">Modality</div>
                        <select className="form-select form-select-sm bg-white text-black border-0" value={filterModality} onChange={e => setFilterModality(e.target.value)}>
                            <option value="">All</option>
                            <option value="CR">CR</option>
                            <option value="CT">CT</option>
                            <option value="DX">DX</option>
                            <option value="MG">MG</option>
                            <option value="MR">MR</option>
                            <option value="NM">NM</option>
                            <option value="OT">OT</option>
                            <option value="PT">PT</option>
                            <option value="RF">RF</option>
                            <option value="SC">SC</option>
                            <option value="SR">SR</option>
                            <option value="US">US</option>
                            <option value="XA">XA</option>
                        </select>
                    </div>
                    <div style={{ width: '8%' }}>
                        <div className="fw-bold mb-1">Status</div>
                        <select className="form-select form-select-sm bg-white text-black border-0" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            <option value="">All</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="pending">Pending</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Table Header */}
            <div className="d-flex align-items-center p-3 rounded mb-1" style={{ backgroundColor: '#111827' }}>
                <div style={{ width: '24px', flexShrink: 0 }}></div>
                <div style={{ width: '21%', paddingRight: '32px' }} className="fw-bold">Study Instance ID</div>
                <div style={{ width: '15%' }} className="fw-bold">Patient Name</div>
                <div style={{ width: '18%' }} className="fw-bold">Study Date</div>
                <div style={{ width: '14%' }} className="fw-bold">Description</div>
                <div style={{ width: '10%' }} className="fw-bold text-center">Series</div>
                <div style={{ width: '10%' }} className="fw-bold text-center">Modality</div>
                <div style={{ width: '10%' }} className="fw-bold text-center">Instances</div>
            </div>

            {/* Study List */}
            <div className="study-list">
                {loading ?
                <div className='text-center'>loading ...</div>
                : filteredData.length === 0 ? (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '80px 20px',
                    backgroundColor: '#111827',
                    borderRadius: '12px',
                    border: '1px dashed #333',
                    marginTop: '4px',
                }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.1), rgba(124, 58, 237, 0.1))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '20px',
                    }}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            <line x1="8" y1="11" x2="14" y2="11" />
                        </svg>
                    </div>
                    <div style={{ color: '#aaa', fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
                        No studies found
                    </div>
                    <div style={{ color: '#666', fontSize: '13px', textAlign: 'center', maxWidth: '360px', lineHeight: '1.5' }}>
                        No studies match your current filters. Try adjusting or clearing your search criteria.
                    </div>
                    <button
                        onClick={() => {
                            setFilterPatientName('');
                            setFilterMRN('');
                            setFilterInstances('');
                            setFilterStartDate('');
                            setFilterEndDate('');
                            setFilterDescription('');
                            setFilterModality('');
                            setFilterStatus('');
                        }}
                        style={{
                            marginTop: '20px',
                            padding: '8px 24px',
                            backgroundColor: 'transparent',
                            border: '1px solid #444',
                            borderRadius: '8px',
                            color: '#888',
                            fontSize: '13px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0d6efd'; e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#888'; }}
                    >
                        Clear all filters
                    </button>
                </div>
                ) :
              filteredData.map((study: any, index) => (
                <div key={study.study_instance_uid} className="mb-1">
                    {/* Study Row */}
                    <div
                        className="d-flex align-items-center p-3 rounded cursor-pointer"
                        style={{ backgroundColor: "#111827" }}
                        onClick={() => toggleRow(study.study_instance_uid)}
                    >
                        <div style={{ width: '24px', flexShrink: 0 }}>
                        </div>
                        <div style={{ width: '21%', paddingRight: '32px' }} className="text-truncate" title={study.study_instance_uid}>{study.study_instance_uid || 'No Study ID'}</div>
                        <div style={{ width: '15%' }} className="text-truncate">{study.patient_name || 'No Patient Name'}</div>
                        <div style={{ width: '18%' }}>
                        {study.date && study.time
                            ? formatDicomDateTime(study.date, study.time)
                            : 'No Date'}
                        </div>
                        <div style={{ width: '14%' }} className="text-truncate">{study.description || 'No Description'}</div>
                        <div style={{ width: '10%' }} className="text-center">{study.series.reduce((sum, item) => sum + parseFloat(item.series_number), 0) || 'No Series'}</div>
                        <div style={{ width: '10%' }} className="text-center">{[...new Set(study.series.map(item => item.modality))].join(' | ') || 'No Modality'}</div>
                        <div style={{ width: '10%' }} className="text-center">
                            <span>{study.series.reduce((sum, item) => sum + parseFloat(item.num_series_instances), 0) || 'No Instances'}</span>
                        </div>
                    </div>

                    {/* Expanded Study Content */}
                    {study.study_instance_uid === expandedStudyId && (
                        <div className="rounded-bottom" style={{ backgroundColor: "#111827", marginTop: '-1px', paddingTop: '12px', paddingBottom: '12px', paddingRight: '16px', paddingLeft: '40px' }}>
                            {/* Buttons */}
                            <div className="mb-3">
                                <button
                                    className="btn btn-sm btn-primary me-2"
                                    onClick={() => handleNavigate(study, index)}
                                    disabled={loadingStudyIndex !== null}
                                    style={{ position: 'relative', overflow: 'hidden' }}
                                >
                                    {loadingStudyIndex === index && (
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                height: '100%',
                                                width: `${loadingProgress}%`,
                                                background: 'linear-gradient(90deg, #0d6efd, #3d8bfd)',
                                                transition: 'width 0.3s ease',
                                                zIndex: 0,
                                                borderRadius: 'inherit',
                                            }}
                                        />
                                    )}
                                    <span style={{ position: 'relative', zIndex: 1 }}>
                                        {loadingStudyIndex === index ? (
                                            <>
                                                <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" style={{ width: 14, height: 14 }}></span>
                                                {loadingProgress}%
                                            </>
                                        ) : (
                                            <>
                                                <span className="me-1">→</span>
                                                Viewer
                                            </>
                                        )}
                                    </span>
                                </button>
                                {
                                    (userRole === 'analyst' || userRole === 'admin') ?
                                    <><button className="btn btn-sm btn-primary me-2" onClick={() => navigate("/localStls")}>
                                        <span className="me-1">→</span>
                                        Upload 3D
                                    </button>
                                    <button className="btn btn-sm btn-primary me-2" onClick={() => setDownloadPopupStudy(study)}>
                                        <span className="me-1">→</span>
                                        Download
                                    </button>
                                    <button className="btn btn-sm btn-primary me-2">
                                        <span className="me-1">→</span>
                                        Approve
                                    </button></> : <div></div>
                                }
                            </div>

                            {/* Sub Table */}
                            <div className="rounded" style={{ backgroundColor: "#0a0e17" }}>
                                <div className="d-flex p-2 border-bottom border-dark">
                                    <div style={{ width: '25%', paddingRight: '24px' }} className="fw-bold">Series Instance ID</div>
                                    <div style={{ width: '25%' }} className="fw-bold">Description</div>
                                    <div style={{ width: '10%' }} className="fw-bold">Series</div>
                                    <div style={{ width: '10%' }} className="fw-bold">Modality</div>
                                    <div style={{ width: '10%' }} className="fw-bold">Instances</div>
                                    <div style={{ width: '20%' }} className="fw-bold">Action</div>
                                </div>
                                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                    {study.series.map((item, index) => (
                                        <div key={index} className="d-flex p-2 border-bottom border-dark align-items-center">
                                            <div style={{ width: '25%', paddingRight: '24px' }} className="text-truncate" title={item.series_instance_uid}>{item.series_instance_uid || 'No Series ID'}</div>
                                            <div style={{ width: '25%' }} className="text-truncate">{item.description || 'No Description'}</div>
                                            <div style={{ width: '10%' }}>{item.series_number || 'No Series'}</div>
                                            <div style={{ width: '10%' }}>{item.modality || 'No Modality'}</div>
                                            <div style={{ width: '10%' }}>{item.num_series_instances || 'No Instances'}</div>
                                            <div style={{ width: '20%' }}>
                                                <button
                                                    className="btn btn-sm btn-primary me-1"
                                                    onClick={() => handleLoadSeries(item, study)}
                                                    disabled={loadingSeriesUid !== null || loadingStudyIndex !== null}
                                                    style={{ position: 'relative', overflow: 'hidden' }}
                                                >
                                                    {loadingSeriesUid === item.series_instance_uid && (
                                                        <div style={{
                                                            position: 'absolute',
                                                            top: 0,
                                                            left: 0,
                                                            height: '100%',
                                                            width: `${seriesLoadProgress}%`,
                                                            background: 'linear-gradient(90deg, #0d6efd, #3d8bfd)',
                                                            transition: 'width 0.3s ease',
                                                            zIndex: 0,
                                                            borderRadius: 'inherit',
                                                        }} />
                                                    )}
                                                    <span style={{ position: 'relative', zIndex: 1 }}>
                                                        {loadingSeriesUid === item.series_instance_uid ? (
                                                            <>
                                                                <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" style={{ width: 14, height: 14 }}></span>
                                                                {seriesLoadProgress}%
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="me-1">→</span>
                                                                View
                                                            </>
                                                        )}
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ))
            }
            </div>

            {/* Download 3D Popup */}
            {downloadPopupStudy && (
                <div
                    onClick={() => { setDownloadPopupStudy(null); setNoStlMessage(null); }}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10000,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: '#111827',
                            padding: '24px',
                            borderRadius: '12px',
                            width: '800px',
                            maxWidth: '95%',
                            maxHeight: '90vh',
                            overflow: 'auto',
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '20px',
                        }}>
                            <h3 style={{ margin: 0, color: '#fff' }}>
                                Download — {downloadPopupStudy.patient_name || 'Unknown Patient'}
                            </h3>
                            <button
                                onClick={() => { setDownloadPopupStudy(null); setNoStlMessage(null); }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#888',
                                    fontSize: '28px',
                                    cursor: 'pointer',
                                    padding: '0',
                                    width: '30px',
                                    height: '30px',
                                    lineHeight: '30px'
                                }}
                            >
                                &times;
                            </button>
                        </div>

                        {/* Series Table Header */}
                        <div style={{
                            display: 'flex',
                            padding: '10px 12px',
                            color: '#aaa',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                        }}>
                            <div style={{ width: '30%' }}>Series Instance ID</div>
                            <div style={{ width: '25%' }}>Description</div>
                            <div style={{ width: '10%' }}>Modality</div>
                            <div style={{ width: '10%' }}>Instances</div>
                            <div style={{ width: '25%' }}>Action</div>
                        </div>

                        {/* Series Rows */}
                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            {downloadPopupStudy.series.map((series) => (
                                <div
                                    key={series.series_instance_uid}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '12px',
                                        color: '#fff',
                                    }}
                                >
                                    <div
                                        style={{ width: '30%', fontSize: '12px', paddingRight: '8px' }}
                                        className="text-truncate"
                                        title={series.series_instance_uid}
                                    >
                                        {series.series_instance_uid}
                                    </div>
                                    <div style={{ width: '25%', fontSize: '13px' }} className="text-truncate">
                                        {series.description || 'No Description'}
                                    </div>
                                    <div style={{ width: '10%', fontSize: '13px' }}>
                                        {series.modality || '—'}
                                    </div>
                                    <div style={{ width: '10%', fontSize: '13px' }}>
                                        {series.num_series_instances || '—'}
                                    </div>
                                    <div style={{ width: '25%', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        {noStlMessage === series.series_instance_uid ? (
                                            <span style={{ color: '#ff9800', fontSize: '12px' }}>
                                                No STLs generated yet
                                            </span>
                                        ) : (
                                            <>
                                                <button
                                                    className="btn btn-sm btn-primary me-2"
                                                    onClick={() => handleView3D(series.series_instance_uid)}
                                                    disabled={downloadingSeriesUid !== null || viewStlLoading}
                                                >
                                                    <span className="me-1">&rarr;</span>
                                                    View
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-primary"
                                                    onClick={() => handleDownload3D(series.series_instance_uid)}
                                                    disabled={downloadingSeriesUid !== null}
                                                    style={{ position: 'relative', overflow: 'hidden' }}
                                                >
                                                    {downloadingSeriesUid === series.series_instance_uid && (
                                                        <div style={{
                                                            position: 'absolute',
                                                            top: 0,
                                                            left: 0,
                                                            height: '100%',
                                                            width: `${downloadProgress}%`,
                                                            background: 'linear-gradient(90deg, #0d6efd, #3d8bfd)',
                                                            transition: 'width 0.3s ease',
                                                            zIndex: 0,
                                                            borderRadius: 'inherit',
                                                        }} />
                                                    )}
                                                    <span style={{ position: 'relative', zIndex: 1 }}>
                                                        {downloadingSeriesUid === series.series_instance_uid ? (
                                                            <>
                                                                <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" style={{ width: 12, height: 12 }}></span>
                                                                {downloadProgress}%
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="me-1">&rarr;</span>
                                                                Download
                                                            </>
                                                        )}
                                                    </span>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* View 3D Popup */}
            {viewStlSeriesUid && (
                <div
                    onClick={() => { setViewStlSeriesUid(null); setViewStlFiles([]); setSelectedStlIndex(0); }}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10001,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: '#111827',
                            borderRadius: '12px',
                            width: '1100px',
                            maxWidth: '95%',
                            height: '80vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '16px 24px',
                            flexShrink: 0,
                        }}>
                            <h4 style={{ margin: 0, color: '#fff', fontWeight: 600 }}>
                                STL Preview
                                {viewStlFiles.length > 0 && (
                                    <span style={{ color: '#666', fontSize: '14px', fontWeight: 400, marginLeft: '12px' }}>
                                        {viewStlFiles.length} file{viewStlFiles.length !== 1 ? 's' : ''}
                                    </span>
                                )}
                            </h4>
                            <button
                                onClick={() => { setViewStlSeriesUid(null); setViewStlFiles([]); setSelectedStlIndex(0); }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#888',
                                    fontSize: '24px',
                                    cursor: 'pointer',
                                    padding: '0',
                                    width: '30px',
                                    height: '30px',
                                    lineHeight: '30px',
                                }}
                            >
                                &times;
                            </button>
                        </div>

                        {/* Body */}
                        {viewStlLoading ? (
                            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" style={{ width: 20, height: 20 }}></span>
                                <span style={{ color: '#aaa' }}>Loading STL files...</span>
                            </div>
                        ) : viewStlFiles.length === 0 ? (
                            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#888' }}>
                                No STL files found.
                            </div>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                                {/* Sidebar — file list */}
                                <div style={{
                                    width: '120px',
                                    flexShrink: 0,
                                    overflowY: 'auto',
                                    padding: '10px 0',
                                    backgroundColor: '#111827',
                                }}>
                                    <div style={{ padding: '0 0 6px', fontSize: '10px', color: '#555', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', textAlign: 'center' }}>
                                        Files
                                    </div>
                                    {viewStlFiles.map((file, idx) => (
                                        <div
                                            key={idx}
                                            style={{
                                                padding: '6px 8px',
                                                color: '#ccc',
                                                fontSize: '11px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                            }}
                                        >
                                            <span style={{
                                                width: '8px',
                                                height: '8px',
                                                borderRadius: '2px',
                                                backgroundColor: getLegendColor(idx),
                                                flexShrink: 0,
                                            }} />
                                            <span style={{
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }} title={file.name}>
                                                {file.name}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Main viewer */}
                                <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                    <div style={{
                                        flex: 1,
                                        borderRadius: '10px',
                                        overflow: 'hidden',
                                        backgroundColor: '#000',
                                    }}>
                                        <StlMainViewer files={viewStlFiles} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Comparison Popup */}
            {showComparisonPopup && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000,
                }}>
                    <div style={{
                        backgroundColor: '#0a0e17',
                        padding: '24px',
                        borderRadius: '12px',
                        width: '950px',
                        maxWidth: '95%',
                        maxHeight: '90vh',
                        overflow: 'auto',
                        border: '1px solid #333',
                    }}>
                        {/* Popup Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '20px',
                            paddingBottom: '10px',
                            borderBottom: '1px solid #333',
                        }}>
                            <h3 style={{ margin: 0, color: '#fff' }}>Select Series for 3D Comparison</h3>
                            <button
                                onClick={closeComparisonPopup}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#888',
                                    fontSize: '28px',
                                    cursor: 'pointer',
                                    padding: '0',
                                    width: '30px',
                                    height: '30px',
                                    lineHeight: '30px'
                                }}
                            >
                                &times;
                            </button>
                        </div>

                        {/* Mode Toggle */}
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                            <button
                                onClick={() => handleComparisonModeChange('same')}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    backgroundColor: comparisonMode === 'same' ? 'rgba(30, 144, 255, 0.3)' : 'transparent',
                                    border: comparisonMode === 'same' ? '2px solid rgba(30, 144, 255, 0.8)' : '1px solid #444',
                                    borderRadius: '8px',
                                    color: comparisonMode === 'same' ? '#fff' : '#aaa',
                                    cursor: 'pointer',
                                    fontWeight: comparisonMode === 'same' ? 'bold' : 'normal',
                                }}
                            >
                                Same Study
                                <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7 }}>
                                    Compare series from one study
                                </div>
                            </button>
                            <button
                                onClick={() => handleComparisonModeChange('different')}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    backgroundColor: comparisonMode === 'different' ? 'rgba(30, 144, 255, 0.3)' : 'transparent',
                                    border: comparisonMode === 'different' ? '2px solid rgba(30, 144, 255, 0.8)' : '1px solid #444',
                                    borderRadius: '8px',
                                    color: comparisonMode === 'different' ? '#fff' : '#aaa',
                                    cursor: 'pointer',
                                    fontWeight: comparisonMode === 'different' ? 'bold' : 'normal',
                                }}
                            >
                                Different Studies
                                <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7 }}>
                                    Compare series from different studies
                                </div>
                            </button>
                        </div>

                        {/* Error Message */}
                        {comparisonError && (
                            <div style={{
                                backgroundColor: 'rgba(255, 100, 100, 0.2)',
                                border: '1px solid rgba(255, 100, 100, 0.5)',
                                color: '#ff4d4d',
                                padding: '10px',
                                borderRadius: '6px',
                                marginBottom: '20px',
                            }}>
                                {comparisonError}
                            </div>
                        )}

                        {/* Selection Panels */}
                        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                            {/* Left Panel - Series 1 */}
                            <div style={{ flex: 1 }}>
                                <h4 style={{ color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        width: '12px',
                                        height: '12px',
                                        borderRadius: '50%',
                                        backgroundColor: '#ffffff',
                                        display: 'inline-block',
                                        border: '1px solid #444'
                                    }}></span>
                                    Series 1 {selectedSeries1 && <span style={{ color: '#4dff4d', fontSize: '12px' }}>({selectedSeries1.description})</span>}
                                </h4>

                                {/* Study Dropdown */}
                                <div style={{ marginBottom: '10px' }}>
                                    <label style={{ color: '#aaa', fontSize: '12px', marginBottom: '4px', display: 'block' }}>
                                        Select Study:
                                    </label>
                                    <select
                                        value={selectedStudy1?.study_instance_uid || ''}
                                        onChange={(e) => {
                                            const study = data?.find((s: Study) => s.study_instance_uid === e.target.value);
                                            if (study) handleStudySelect(study, 1);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '8px',
                                            backgroundColor: '#0f1420',
                                            border: '1px solid #444',
                                            borderRadius: '4px',
                                            color: '#fff',
                                            fontSize: '12px',
                                        }}
                                    >
                                        <option value="">-- Select a Study --</option>
                                        {data?.map((study: Study) => (
                                            <option key={study.study_instance_uid} value={study.study_instance_uid}>
                                                {study.patient_name || 'Unknown'} - {study.date || 'N/A'} - {study.description || 'No description'}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Series List */}
                                <div style={{
                                    height: '200px',
                                    overflowY: 'auto',
                                    border: '1px solid #444',
                                    borderRadius: '6px',
                                    padding: '8px',
                                    backgroundColor: '#0a0e17',
                                }}>
                                    {!selectedStudy1 ? (
                                        <div style={{ color: '#666', textAlign: 'center', paddingTop: '80px' }}>
                                            Select a study first
                                        </div>
                                    ) : getSeriesListForPosition(1).length === 0 ? (
                                        <div style={{ color: '#666', textAlign: 'center', paddingTop: '80px' }}>
                                            No series available
                                        </div>
                                    ) : (
                                        getSeriesListForPosition(1).map((series: Series) => (
                                            <div
                                                key={series.series_instance_uid}
                                                onClick={() => handleSeriesSelect(series, 1)}
                                                style={{
                                                    padding: '10px',
                                                    marginBottom: '6px',
                                                    backgroundColor: selectedSeries1?.series_instance_uid === series.series_instance_uid
                                                        ? 'rgba(77, 255, 77, 0.2)'
                                                        : 'transparent',
                                                    border: selectedSeries1?.series_instance_uid === series.series_instance_uid
                                                        ? '1px solid rgba(77, 255, 77, 0.5)'
                                                        : '1px solid #333',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    color: '#fff',
                                                }}
                                            >
                                                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{series.description || 'No description'}</div>
                                                <div style={{ fontSize: '11px', color: '#888' }}>
                                                    Series {series.series_number} | {series.modality} | {series.num_series_instances} instances
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Right Panel - Series 2 */}
                            <div style={{ flex: 1 }}>
                                <h4 style={{ color: '#00ffff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        width: '12px',
                                        height: '12px',
                                        borderRadius: '50%',
                                        backgroundColor: '#00ffff',
                                        display: 'inline-block'
                                    }}></span>
                                    Series 2 {selectedSeries2 && <span style={{ color: '#4dff4d', fontSize: '12px' }}>({selectedSeries2.description})</span>}
                                </h4>

                                {/* Study Dropdown (only for different mode) */}
                                {comparisonMode === 'different' ? (
                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ color: '#aaa', fontSize: '12px', marginBottom: '4px', display: 'block' }}>
                                            Select Study:
                                        </label>
                                        <select
                                            value={selectedStudy2?.study_instance_uid || ''}
                                            onChange={(e) => {
                                                const study = data?.find((s: Study) => s.study_instance_uid === e.target.value);
                                                if (study) handleStudySelect(study, 2);
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                backgroundColor: '#0f1420',
                                                border: '1px solid #444',
                                                borderRadius: '4px',
                                                color: '#fff',
                                                fontSize: '12px',
                                            }}
                                        >
                                            <option value="">-- Select a Study --</option>
                                            {data?.map((study: Study) => (
                                                <option key={study.study_instance_uid} value={study.study_instance_uid}>
                                                    {study.patient_name || 'Unknown'} - {study.date || 'N/A'} - {study.description || 'No description'}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <div style={{ marginBottom: '10px', padding: '8px', color: '#888', fontSize: '12px' }}>
                                        Using same study as Series 1
                                    </div>
                                )}

                                {/* Series List */}
                                <div style={{
                                    height: '200px',
                                    overflowY: 'auto',
                                    border: '1px solid #444',
                                    borderRadius: '6px',
                                    padding: '8px',
                                    backgroundColor: '#0a0e17',
                                }}>
                                    {(comparisonMode === 'same' && !selectedStudy1) || (comparisonMode === 'different' && !selectedStudy2) ? (
                                        <div style={{ color: '#666', textAlign: 'center', paddingTop: '80px' }}>
                                            {comparisonMode === 'same' ? 'Select a study in Series 1 first' : 'Select a study first'}
                                        </div>
                                    ) : getSeriesListForPosition(2).length === 0 ? (
                                        <div style={{ color: '#666', textAlign: 'center', paddingTop: '80px' }}>
                                            No series available
                                        </div>
                                    ) : (
                                        getSeriesListForPosition(2).map((series: Series) => (
                                            <div
                                                key={series.series_instance_uid}
                                                onClick={() => handleSeriesSelect(series, 2)}
                                                style={{
                                                    padding: '10px',
                                                    marginBottom: '6px',
                                                    backgroundColor: selectedSeries2?.series_instance_uid === series.series_instance_uid
                                                        ? 'rgba(0, 255, 255, 0.2)'
                                                        : 'transparent',
                                                    border: selectedSeries2?.series_instance_uid === series.series_instance_uid
                                                        ? '1px solid rgba(0, 255, 255, 0.5)'
                                                        : '1px solid #333',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    color: '#fff',
                                                }}
                                            >
                                                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{series.description || 'No description'}</div>
                                                <div style={{ fontSize: '11px', color: '#888' }}>
                                                    Series {series.series_number} | {series.modality} | {series.num_series_instances} instances
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Popup Footer */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '12px',
                            paddingTop: '15px',
                            borderTop: '1px solid #333',
                        }}>
                            <button
                                onClick={closeComparisonPopup}
                                style={{
                                    padding: '10px 24px',
                                    backgroundColor: 'transparent',
                                    border: '1px solid #555',
                                    borderRadius: '6px',
                                    color: '#aaa',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleComparisonConfirm}
                                disabled={!selectedSeries1 || !selectedSeries2}
                                style={{
                                    padding: '10px 24px',
                                    backgroundColor: selectedSeries1 && selectedSeries2
                                        ? 'rgba(30, 144, 255, 0.8)'
                                        : 'rgba(30, 144, 255, 0.3)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: '#ffffff',
                                    cursor: selectedSeries1 && selectedSeries2 ? 'pointer' : 'not-allowed',
                                    fontWeight: 'bold',
                                }}
                            >
                                Open Comparison View
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Animation styles */}
            <style>{`
                @keyframes spin {
                to { transform: rotate(360deg); }
                }
                @keyframes fadeInUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
                }
                input:focus {
                box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5) !important;
                }
            `}</style>
        </div>
    );
}
