import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { formatDicomDateTime } from '../../utils/Functions';
import { DicomMetadataStore, MODULE_TYPES, useSystem } from '@ohif/core';
import filesToStudies from '../../routes/Local/filesToStudies';
import { extensionManager } from '../../App';
import { StlInstanceContext } from '../../context/StlInstanceContext';
import { StlInstanceListDataContext } from '../../../../app/src/context/StlInstanceListDataContext';
import { ParentStudyIdContext } from '../../../../app/src/context/parentStudyIdContext';


export default function StudyList() {
    const navigate = useNavigate()
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [isButtonLoading, setIsButtonLoading] = useState(false);
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

    const toggleRow = (studyInstanceUid: string) => {
      setExpandedStudyId(expandedStudyId === studyInstanceUid ? null : studyInstanceUid);
    };

    const handleNavigate = (study: { series: { series_instance_uid: string }[] },index: string) => {
        // Extract all series_instance_uids from the study's series
        setIsButtonLoading(true);
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


    useEffect(() => {
        console.log("role => ",userRole);
        const fetchData = async () => {
            try {
                const response = await axios.get<{ data: { series: { series_instance_uid: string }[] }[] }>('http://127.0.0.1:8000/imaging/studies',{
                    headers: {
                        Authorization: `Bearer ${userToken}`,
                        "Content-Type": "application/json"
                    }
                });
                setData(response.data?.data);
                updateStlInstanceListData(response.data?.data)
            } catch (error) {
                console.error('Failed to fetch studies:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    console.log("data =>",data);

    const getSeriesInstances = async (selectedStudy?: { study_instance_uid: string; series: { series_instance_uid: string; instance_urls: string[] }[] }) => {
        try {
            setIsButtonLoading(true);

            // Use the selected study if provided, otherwise fall back to all studies
            const studiesToProcess = selectedStudy ? [selectedStudy] : data;

            // Collect instance URLs only from the selected study
            const allInstanceUrls = studiesToProcess.flatMap(study =>
                study.series.flatMap(series =>
                    series.instance_urls || []
                )
            );

            console.log("Processing study:", selectedStudy?.study_instance_uid);
            console.log("Instance URLs to fetch:", allInstanceUrls);

            if (allInstanceUrls.length === 0) {
                throw new Error("No instance URLs found for the selected study");
            }

            // Fetch DICOM files in parallel with retry logic
            const fetchedFiles = await Promise.all(
                allInstanceUrls.map(async (url, idx) => {
                    let retries = 0;
                    while (retries < 3) {
                        try {
                            const res = await fetch(url);
                            if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
                            const blob = await res.blob();
                            const fileName = url.split('/').pop();
                            return new File([blob], fileName || `dicom-${idx}.dcm`, {
                                type: blob.type || 'application/dicom',
                            });
                        } catch (error) {
                            retries++;
                            if (retries === 3) {
                                console.error(`Failed to fetch ${url} after ${retries} attempts`);
                                return null;
                            }
                            await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
                        }
                    }
                    return null;
                })
            );

            // Filter out failed file fetches
            const validFiles = fetchedFiles.filter((file): file is File => file !== null);

            if (validFiles.length === 0) {
                throw new Error("No valid DICOM files were fetched");
            }

            // Determine the mode path based on user role
            let modePath = "viewer/dicomlocal";
            if (userRole === 'analyst') {
                modePath = "segmentation/dicomlocal";
            } else if (userRole === 'admin') {
                modePath = "segmentation/dicomlocal";
            }else if (userRole === 'signer') {
                modePath = "signons/dicomlocal";
            }

            // Initialize the dicom local dataSource
            const dataSourceModules = extensionManager.modules[MODULE_TYPES.DATA_SOURCE];
            const localDataSources = dataSourceModules.reduce((acc, curr) => {
                const mods = [];
                curr.module.forEach(mod => {
                    if (mod.type === 'localApi') {
                        mods.push(mod);
                    }
                });
                return acc.concat(mods);
            }, []);

            const firstLocalDataSource = localDataSources[0];
            const dataSource = firstLocalDataSource.createDataSource({});

            // Convert files to studies
            const studies1 = await filesToStudies([], dataSource);
            const studies = await filesToStudies(validFiles, dataSource);

            const query = new URLSearchParams();

            // Add ONLY the current study to the query
            studies.forEach(id => query.append('StudyInstanceUIDs', id));
            query.append('datasources', 'dicomlocal');

            // 🔥 ADD TIMESTAMP TO FORCE FRESH LOAD
            query.append('t', Date.now().toString());

            console.log("Navigating with study:", studies[0]);
            console.log("Query parameters:", Array.from(query.entries()));

            // 🔥 USE REPLACE NAVIGATION TO PREVENT BROWSER HISTORY STACKING
            navigate(`/${modePath}?${decodeURIComponent(query.toString())}`);

        } catch (err) {
            console.error("Failed to process series:", err);
        } finally {
            setIsButtonLoading(false);
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
                <div className="text-end">
                    <span className="text-primary me-2">{data?.length ?? 0}</span>
                    <span className="text">Studies</span>
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
              data.map((study: any, index) => (
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
                                <button className="btn btn-primary me-2" onClick={() => handleNavigate(study,index)} disabled={isButtonLoading}>
                                   {isButtonLoading ? (
                                        <>
                                            <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                            Loading...
                                        </>
                                    ) :
                                   (<>
                                    <span className="me-1">→</span>
                                    Viewer
                                    </>)}
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
                                    <div style={{ width: '40%' }} className="fw-bold">Description</div>
                                    <div style={{ width: '20%' }} className="fw-bold">Series</div>
                                    <div style={{ width: '20%' }} className="fw-bold">Modality</div>
                                    <div style={{ width: '20%' }} className="fw-bold">Instances</div>
                                </div>
                                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                    {study.series.map((item, index) => (
                                        <div key={index} className="d-flex p-2 border-bottom border-dark">
                                            <div style={{ width: '40%' }}>{item.description || 'N/A'}</div>
                                            <div style={{ width: '20%' }}>{item.series_number || 'N/A'}</div>
                                            <div style={{ width: '20%' }}>{item.modality || 'N/A'}</div>
                                            <div style={{ width: '20%' }}>{item.num_series_instances || 'N/A'}</div>
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
