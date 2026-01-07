import React, { useState, useEffect } from 'react';
import { useMeasurementContext } from '../context/MeasurementContext';
import { useBrightnessContext } from '../context/BrightnessContext';
import { useBoneRemovalContext } from '../context/BoneRemovalContext';
import { useClickRemoveContext } from '../context/ClickRemoveContext';
import { useLabelingViewContext } from '../context/LabelingViewContext';
import { useVersionHistoryContext } from '../context/VersionHistoryContext';
import { useImplantContext } from '../context/ImplantContext';
import { useCenterLineContext } from '../context/CenterLineContext';
import { useVersionHistory } from '../hooks/useVersionHistory'
import { useAngleMeasurementContext } from '../context/AngleMeasurementContext';


interface SingleToolbarProps {
  userRole: string;
  loading: boolean;
  isApproving: boolean;
  clickRemovalUndoStack: any[];
  undoStack: any[];
  isDownloading: boolean;
  isMerging?: boolean;
  canMerge?: boolean;
  isCreatingSegmentation?: boolean;
  segmentationCreated?: boolean;
  hasSTLFiles?: boolean;
  isLinkingActive?: boolean;
  showMerge?: boolean;
  rotationMode?: boolean;
  rotationMode1?: boolean;
  rotationMode2?: boolean;
  rotationMode3?: boolean;
  onToggleRotation1?: () => void;
  onToggleRotation2?: () => void;
  onToggleRotation3?: () => void;
  onToggleLinking?: () => void;
  onToggleRotation?: () => void;
  onFileSelect: () => void;
  onRefresh: () => void;
  onUndo: () => void;
  onDownload: () => void;
  onScreenshot: () => void;
  onUndoClickRemoval: () => void;
  onApprove: () => void;
  onMergeWithDicom?: () => void;
  onCreateSegmentation?: () => void;
  onUnMergeWithDicom?: () => void;
}

export const SingleToolbar: React.FC<SingleToolbarProps> = ({
  userRole,
  loading,
  isApproving,
  clickRemovalUndoStack,
  undoStack,
  isDownloading,
  isMerging,
  canMerge,
  isLinkingActive,
  isCreatingSegmentation = false,
  segmentationCreated = false,
  hasSTLFiles = false,
  showMerge,
  rotationMode,
  rotationMode1,
  rotationMode2,
  rotationMode3,
  onFileSelect,
  onRefresh,
  onUndo,
  onDownload,
  onScreenshot,
  onUndoClickRemoval,
  onApprove,
  onMergeWithDicom,
  onCreateSegmentation,
  onToggleLinking,
  onUnMergeWithDicom,
  onToggleRotation,
  onToggleRotation1,
  onToggleRotation2,
  onToggleRotation3
}) => {
  // Add this CSS to your global styles or component
  const scrollbarStyles = `
    .scrollable-toolbar {
      scrollbar-width: thin;
    }
    .scrollable-toolbar::-webkit-scrollbar {
      width: 8px;
    }
    .scrollable-toolbar::-webkit-scrollbar-track {
      border-radius: 4px;
    }
    .scrollable-toolbar::-webkit-scrollbar-thumb {
      border-radius: 4px;
    }
    .scrollable-toolbar::-webkit-scrollbar-thumb:hover {
    }
  `;

  const [name, setName] = useState('');
  const [toggleEdit, setToggleEdit] = useState(false);
  const { measurementEnabled, toggleMeasurement } = useMeasurementContext();
  const { brightnessEnabled, toggleBrightness } = useBrightnessContext();
  const { removalMode, setRemovalMode } = useBoneRemovalContext();
  const { clickRemovalMode, onToggleClickRemoval } = useClickRemoveContext();
  const { showRightView, onToggleRightView } = useLabelingViewContext();
  const { versionHistoryEnabled, toggleVersionHistory } = useVersionHistoryContext();
  const { centerLineEnabled, toggleCenterLine } = useCenterLineContext();

  const [loading1, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approveSuccess, setApproveSuccess] = useState<string | null>(null);

  const { 
    angleMeasurementEnabled,
    toggleAngleMeasurement 
  } = useAngleMeasurementContext();
  

  const {
    showImplantView,
    toggleImplantView,
    handleImplantFileChange
  } = useImplantContext();

  const versionHistory = useVersionHistory({
      setLoading,
      setError,
      setApproveSuccess
    });

  useEffect(() => {
    const loadFromLocalStorage = () => {
      const savedName = localStorage.getItem('myLayout');
      if (savedName) {
        setName(savedName);
      }
    };
    loadFromLocalStorage();
  },[name]);

  useEffect(() => {
    if (angleMeasurementEnabled && measurementEnabled) {
      toggleMeasurement();
    }
  }, [angleMeasurementEnabled, measurementEnabled, toggleMeasurement]);


  useEffect(() => {
    if (measurementEnabled && angleMeasurementEnabled) {
      toggleAngleMeasurement();
    }
  }, [measurementEnabled, angleMeasurementEnabled, toggleAngleMeasurement]);


  if (userRole === 'analyst' || userRole === 'admin') {
    return (
      <>
        <style>{scrollbarStyles}</style>
        {
          toggleEdit === false ?
        <div
          className="scrollable-toolbar"
          style={{
            position: 'relative',
            marginTop: "5px",
            height: (name === "fourUp" || name === "main3D") ? "500px" : "100vh", // Fixed pixel height for reliable scrolling
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "15px",
            gap: "10px",
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          <button
            className="icon-button"
            type="button"
            onClick={() => {
               setToggleEdit(!toggleEdit)
            }}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
              { toggleEdit ?
              <i className="fas fa-toggle-on" />
              : <i className="fas fa-toggle-off" /> }
          </button>
        </div>
        : <div
          className="scrollable-toolbar"
          style={{
            position: 'relative',
            marginTop: "5px",
            height: (name === "fourUp" || name === "main3D") ? "500px" : "100vh", // Fixed pixel height for reliable scrolling
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "15px",
            gap: "10px",
            overflowY: "auto",
            overflowX: "hidden"
          }}
        >
          <button
            className="icon-button"
            type="button"
            onClick={() => {
               setToggleEdit(!toggleEdit)
            }}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
             { toggleEdit ?
              <i className="fas fa-toggle-on" />
              : <i className="fas fa-toggle-off" /> }
          </button>
          {/* File Selection */}
          <button
            className="icon-button"
            type="button"
            data-tooltip="Select"
            onClick={onFileSelect}
            disabled={loading}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-folder-open" />
          </button>

          {/* Bone Removal */}
          <button
            className={`icon-button${removalMode ? " selected danger" : ""}`}
            type="button"
            data-tooltip={removalMode ? "Removal" : "Removal"}
            onClick={() => {setRemovalMode(!removalMode)}}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-cut" />
          </button>

          {/* Undo Removal */}
          <button
            className="icon-button"
            type="button"
            data-tooltip="Undo"
            onClick={onUndo}
            disabled={undoStack.length === 0}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-undo-alt" />
          </button>

          <button
            className={`icon-button${isLinkingActive ? " selected" : ""}`}
            type="button"
            data-tooltip={isLinkingActive ? "Linking" : "Linking"}
            onClick={onToggleLinking}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-link" />
          </button>

          <button
            className={`icon-button${centerLineEnabled ? " selected" : ""}`}
            type="button"
            data-tooltip={centerLineEnabled ? "Alignment" : "Alignment"}
            onClick={toggleCenterLine}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-route" /> {/* You can change this icon */}
          </button>

          {/* Download */}
          <button
            className="icon-button"
            type="button"
            data-tooltip="Download"
            onClick={onDownload}
            disabled={isDownloading}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-download" />
          </button>

          {/* Brightness */}
          <button
            className={`icon-button${brightnessEnabled ? " selected" : ""}`}
            type="button"
            data-tooltip={brightnessEnabled ? "Brightness" : "Brightness"}
            onClick={toggleBrightness}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-sun" />
          </button>

          {/* Measurement */}
          <button
            className={`icon-button${measurementEnabled ? " selected" : ""}`}
            type="button"
            data-tooltip={measurementEnabled ? "Measure" : "Measure"}
            onClick={toggleMeasurement}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-ruler" />
          </button>


          <button
            className={`icon-button${angleMeasurementEnabled ? " selected" : ""}`}
            type="button"
            data-tooltip={angleMeasurementEnabled ? "Angle" : "Angle"}
            onClick={toggleAngleMeasurement}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-angle-double-right" />
          </button>

          <button
            className={`icon-button${rotationMode === true ? " selected" : ""}`}
            type="button"
            data-tooltip={rotationMode ? "Horizontal" : "Horizontal"}
            onClick={onToggleRotation}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-arrows-alt-h" />
          </button>

          <button
            className={`icon-button${rotationMode1 === true ? " selected" : ""}`}
            type="button"
            data-tooltip={rotationMode1 ? "Vertical" : "Vertical"}
            onClick={onToggleRotation1}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-arrows-alt-v" />
          </button>

          <button
            className={`icon-button${rotationMode3 === true ? " selected" : ""}`}
            type="button"
            data-tooltip={rotationMode3 ? "Longitudinal" : "Longitudinal"}
            onClick={onToggleRotation3}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-expand-arrows-alt" />
          </button>

          <button
            className={`icon-button${rotationMode2 === true ? " selected" : ""}`}
            type="button"
            data-tooltip={rotationMode2 ? "Rotation" : "Rotation"}
            onClick={onToggleRotation2}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-sync-alt" />
          </button>

          {/* Screenshot */}
          <button
            className="icon-button"
            type="button"
            data-tooltip="Screenshot"
            onClick={onScreenshot}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-camera" />
          </button>

          <button
            className="icon-button"
            type="button"
            data-tooltip="Merge"
            onClick={showMerge ? onUnMergeWithDicom : onMergeWithDicom}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className={showMerge ? "fas fa-times" : "fas fa-object-group"} />
          </button>

          {/* Click Removal */}
          <button
            className={`icon-button${clickRemovalMode ? " selected danger" : ""}`}
            type="button"
            data-tooltip={clickRemovalMode ? "Removal" : "Removal"}
            onClick={() => { onToggleClickRemoval(!clickRemovalMode) }}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-trash" />
          </button>

          {/* Undo Click Removal */}
          <button
            className={`icon-button${clickRemovalUndoStack.length > 0 ? "" : " disabled"}`}
            type="button"
            data-tooltip="Undo"
            onClick={onUndoClickRemoval}
            disabled={clickRemovalUndoStack.length === 0}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-undo-alt" />
          </button>

          {/* Right View Toggle */}
          <button
            className={`icon-button${showRightView ? " selected" : ""}`}
            type="button"
            data-tooltip={showRightView ? "Label" : "Label"}
            onClick={() => { onToggleRightView(!showRightView) }}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-columns" />
          </button>

          {/* Approve */}
          <button
            className={`icon-button${isApproving ? " loading" : ""}`}
            type="button"
            data-tooltip="Approve"
            onClick={onApprove}
            disabled={isApproving}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-check" />
          </button>

          {/* Version History */}
          <button
            className={`icon-button${versionHistoryEnabled ? " selected" : ""}`}
            type="button"
            data-tooltip={versionHistoryEnabled ? "History" : "History"}
            onClick={() => {
              toggleVersionHistory()
              versionHistory.getVersionHistory()
            }}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-history" />
          </button>

          <button
            className={`icon-button${showImplantView ? " selected" : ""}`}
            type="button"
            data-tooltip={showImplantView ? "Implant" : "Implant"}
            onClick={() => {
              if (showImplantView) {
                toggleImplantView();
              } else {
                document.getElementById('implant-file-input')?.click();
              }
            }}
            style={{ minWidth: '45px', minHeight: '45px' }}
          >
            <i className="fas fa-plus-square" />
          </button>

          <div style={{ marginTop: '70px'}}></div>
        </div>
        }
      </>
    );
  }

  // Basic user toolbar - vertical layout
  return (
    <>
      <style>{scrollbarStyles}</style>
      <div
        className="scrollable-toolbar"
        style={{
          position: 'relative',
          marginTop: "10px",
          height: "300px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "10px",
          gap: "8px",
          overflowY: "auto",
          overflowX: "hidden",
          backgroundColor: '#2c3e50',
          borderRadius: '8px'
        }}
      >
        {/* Toolbar Label */}
        <div style={{
          color: '#fff',
          width: "70px",
          height: "30px",
          backgroundColor: '#17202a',
          padding: '4px 8px',
          borderRadius: '4px',
          border: '1px solid #000',
          fontSize: '12px',
          textAlign: 'center',
          marginBottom: '5px'
        }}>
          3D Tools
        </div>

        {/* File Selection */}
        <button
          className="icon-button"
          type="button"
          data-tooltip="Select STL files"
          onClick={onFileSelect}
          disabled={loading}
          style={{ minWidth: '45px', minHeight: '45px' }}
        >
          <i className="fas fa-folder-open" />
        </button>

        {/* Refresh */}
        <button
          className="icon-button"
          type="button"
          data-tooltip="Refresh viewer"
          onClick={onRefresh}
          style={{ minWidth: '45px', minHeight: '45px' }}
        >
          <i className="fas fa-sync-alt" />
        </button>

        {/* Brightness */}
        <button
          className={`icon-button${brightnessEnabled ? " selected" : ""}`}
          type="button"
          data-tooltip={brightnessEnabled ? "Disable Brightness" : "Enable Brightness"}
          onClick={toggleBrightness}
          style={{ minWidth: '45px', minHeight: '45px' }}
        >
          <i className="fas fa-sun" />
        </button>

        {/* Screenshot */}
        <button
          className="icon-button"
          type="button"
          data-tooltip="Take Screenshot"
          onClick={onScreenshot}
          style={{ minWidth: '45px', minHeight: '45px' }}
        >
          <i className="fas fa-camera" />
        </button>
      </div>
    </>
  );
};
