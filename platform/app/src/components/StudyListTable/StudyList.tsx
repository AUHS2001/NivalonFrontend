import React, { useEffect, useState, useContext } from 'react';
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

    const toggleRow = (studyInstanceUid: string) => {
      setExpandedStudyId(expandedStudyId === studyInstanceUid ? null : studyInstanceUid);
    };

    const handleNavigate = (study: { series: { series_instance_uid: string }[] },index: string) => {
        // Extract all series_instance_uids from the study's series
        setLoadingStudyIndex(Number(index));
        console.log("study data ",study?.study_instance_uid)
        updateStlInstanceId(data[index]?.series[0].series_instance_uid)
        updateSeriesName(data[index]?.series[0].description)
        updateSeriesList(data[index]?.series)
        console.log("series description ==> ",data[index]?.series[0].description)
        updateParentStudyId(study?.study_instance_uid)
        getSeriesInstances(study);
        // getSeriesInstances();
        // Pass the entire array now
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
                zIndex: 0
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
                zIndex: 0
            }}></div>

            {/* Header */}
            <div className="d-flex justify-content-between align-items-center mb-3 px-2">
                <h4>Study List</h4>
                <div className="d-flex align-items-center gap-3">
                    <button
                        onClick={openComparisonPopup}
                        style={{
                            padding: '4px 12px',
                            backgroundColor: 'rgba(77, 255, 77, 0.2)',
                            border: '1px solid rgba(77, 255, 77, 0.5)',
                            borderRadius: '4px',
                            color: '#4dff4d',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span style={{ fontSize: '14px' }}>&#x2194;</span>
                        Compare 3D
                    </button>
                    <div className="text-end">
                        <span className="text-primary me-2">{data?.length ?? 0}</span>
                        <span className="text">Studies</span>
                    </div>
                </div>
            </div>

            {/* Filter Section */}
            <div className="mb-3 p-3 rounded">
                <div className="row mb-2" style={{ backgroundColor: "#0a0e17" }}>
                    <div className="col">
                        <div className="d-flex align-items-center mb-1">
                            <span>Patient Name</span>
                        </div>
                        <input type="text" className="form-control bg-white text-black border-white" placeholder='Enter name' />
                    </div>
                    <div className="col">
                        <div className="d-flex align-items-center mb-1">
                            <span>MRN</span>
                        </div>
                        <input type="text" className="form-control bg-white text-black border-white" placeholder='Enter MRN'/>
                    </div>
                    <div className="col">
                        <div className="d-flex align-items-center mb-1">
                            <span>Study Date</span>
                        </div>
                        <div className="d-flex gap-3">
                            <div className="input-group me-1">
                                <input type="date" className="form-control bg-white text-black border-white" placeholder="Start date" />
                            </div>
                            <div className="input-group">
                                <input type="date" className="form-control bg-white text-black border-white" placeholder="End date" />
                            </div>
                        </div>
                    </div>
                    <div className="col">
                        <div className="d-flex align-items-center mb-1">
                            <span>Description</span>
                        </div>
                        <input type="text" className="form-control bg-white text-black border-white" placeholder="Enter description"/>
                    </div>
                    <div className="col">
                        <div className="d-flex align-items-center mb-1">
                            <span>Modality</span>
                        </div>
                        <select className="form-select bg-white text-black border-white">
                            <option>AR</option>
                            <option>ASMT</option>
                            <option>AU</option>
                            <option>BDUS</option>
                            <option>BI</option>
                            <option>BMD</option>
                            <option>CR</option>
                            <option>CT</option>
                        </select>
                    </div>
                    <div className="col">
                        <div className="d-flex align-items-center mb-1">
                            <span>Accession #</span>
                        </div>
                        <input type="text" className="form-control bg-white text-black border-white" placeholder="Enter accession"/>
                    </div>
                    <div className="col">
                        <div className="mb-1">
                            <span>Instances</span>
                        </div>
                        <input type="text" className="form-control bg-white text-black border-white" placeholder="Enter instances"/>
                    </div>
                    <div className="col">
                        <div className="mb-1">
                            <span>Status</span>
                        </div>
                        <select className="form-select bg-white text-black border-white">
                            <option>Approved</option>
                            <option>Rejected</option>
                        </select>
                     </div>
                </div>
            </div>

            {/* Study List */}
            <div className="study-list">
                {loading ?
                <div className='text-center'>loading ...</div>
                :
              (Array.isArray(data) ? data : []).map((study: any, index) => (
                <div key={study.study_instance_uid} className="mb-1">
                    {/* Study Row */}
                    <div
                        className="d-flex align-items-center p-3 rounded cursor-pointer"
                        style={{ backgroundColor: "#0a0e17", border: '1px solid white'  }}
                        onClick={() => toggleRow(study.study_instance_uid)}
                    >
                        <div style={{ width: '24px' }}>
                        </div>
                        <div style={{ width: '18%' }}>{study.patient_name || 'N/A'}</div>
                        <div style={{ width: '15%' }}>{study.patient_id
                            ? study.patient_id.length > 8
                            ? `${study.patient_id.substring(0, 7)}...`
                            : study.patient_id
                            : 'N/A'}</div>
                        <div style={{ width: '18%' }}>
                        {study.date && study.time
                            ? formatDicomDateTime(study.date, study.time)
                            : 'N/A'}
                        </div>

                        <div style={{ width: '10%' }} className="text-truncate">{study.description || 'N/A'}</div>
                        <div style={{ width: '10%' }}>{study.series.reduce((sum, item) => sum + parseFloat(item.series_number), 0) || 'N/A'}</div>
                        <div style={{ width: '10%' }}>{[...new Set(study.series.map(item => item.modality))].join(' | ') || 'N/A'}</div>
                        <div style={{ width: '10%' }} className="d-flex align-items-center justify-content-end">
                            <span>{study.series.reduce((sum, item) => sum + parseFloat(item.num_series_instances), 0)  || 'N/A'}</span>
                        </div>
                        <div style={{ width: '10%' }} className="d-flex align-items-center justify-content-end">
                            <input
                                className="form-check-input"
                                type="checkbox"
                                id="check-blue"
                                style={{
                                accentColor: '#0d6efd', // Bootstrap blue
                                transform: 'scale(1)', // Increase size by 1.5x (adjust as needed)
                                width: '20px', // Optional: Set explicit width
                                height: '20px', // Optional: Set explicit height
                                cursor: 'pointer'
                                }}
                            />
                        </div>
                    </div>

                    {/* Expanded Study Content */}
                    {study.study_instance_uid === expandedStudyId && (
                        <div className="p-3 rounded-bottom" style={{ backgroundColor: "#0a0e17", border: '1px solid white', marginTop: '-1px' }}>
                            {/* Buttons */}
                            <div className="mb-3">
                                <button
                                    className={`btn me-2 ${loadingStudyIndex === index ? '' : 'btn-primary'}`}
                                    onClick={() => handleNavigate(study,index)}
                                    disabled={loadingStudyIndex !== null}
                                    style={{
                                        minWidth: 140,
                                        position: 'relative',
                                        overflow: 'hidden',
                                        ...(loadingStudyIndex === index ? {
                                            backgroundColor: '#1a1f2e',
                                            border: '2px solid #0d6efd',
                                            color: '#fff',
                                        } : {}),
                                    }}
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
                                    <span style={{ position: 'relative', zIndex: 1, fontWeight: loadingStudyIndex === index ? 700 : 400 }}>
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
                                    <><button className="btn btn-primary me-2" onClick={() => navigate("/localStls")}>
                                        <span className="me-1">→</span>
                                        Upload 3D
                                    </button>
                                    <button className="btn btn-primary me-2">
                                        <span className="me-1">→</span>
                                        Download
                                    </button>
                                    <button className="btn btn-primary me-2">
                                        <span className="me-1">→</span>
                                        Approve
                                    </button>
                                    <button className="btn btn-primary me-2">
                                        <span className="me-1">→</span>
                                        Last Updated
                                    </button></> : <div></div>
                                }
                            </div>

                            {/* Sub Table */}
                            <div className="rounded" style={{ backgroundColor: "#0a0e17", border: '1px solid white' }}>
                                <div className="d-flex p-2 border-bottom border-dark">
                                    <div style={{ width: '30%' }} className="fw-bold">Description</div>
                                    <div style={{ width: '15%' }} className="fw-bold">Series</div>
                                    <div style={{ width: '15%' }} className="fw-bold">Modality</div>
                                    <div style={{ width: '15%' }} className="fw-bold">Instances</div>
                                    <div style={{ width: '25%' }} className="fw-bold">Action</div>
                                </div>
                                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                    {study.series.map((item, index) => (
                                        <div key={index} className="d-flex p-2 border-bottom border-dark align-items-center">
                                            <div style={{ width: '30%' }}>{item.description || 'N/A'}</div>
                                            <div style={{ width: '15%' }}>{item.series_number || 'N/A'}</div>
                                            <div style={{ width: '15%' }}>{item.modality || 'N/A'}</div>
                                            <div style={{ width: '15%' }}>{item.num_series_instances || 'N/A'}</div>
                                            <div style={{ width: '25%' }}>
                                                <button
                                                    className={`btn btn-sm me-1 ${loadingSeriesUid === item.series_instance_uid ? '' : 'btn-primary'}`}
                                                    onClick={() => handleLoadSeries(item, study)}
                                                    disabled={loadingSeriesUid !== null || loadingStudyIndex !== null}
                                                    style={{
                                                        minWidth: 100,
                                                        position: 'relative',
                                                        overflow: 'hidden',
                                                        ...(loadingSeriesUid === item.series_instance_uid ? {
                                                            backgroundColor: '#1a1f2e',
                                                            border: '2px solid #0d6efd',
                                                            color: '#fff',
                                                        } : {}),
                                                    }}
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
                                                    <span style={{ position: 'relative', zIndex: 1, fontWeight: loadingSeriesUid === item.series_instance_uid ? 700 : 400 }}>
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
