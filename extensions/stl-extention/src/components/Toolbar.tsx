import React from 'react';

interface ToolbarProps {
  userRole: string;
  loading: boolean;
  removalMode: boolean;
  brightnessEnabled: boolean;
  measurementEnabled: boolean;
  clickRemovalMode: boolean;
  showRightView: boolean;
  versionHistoryEnabled: boolean;
  isApproving: boolean;
  clickRemovalUndoStack: any[];
  undoStack: any[];
  isDownloading: boolean;
  isMerging?: boolean; // ADD THIS
  canMerge?: boolean; // ADD THIS
  isCreatingSegmentation?: boolean;
  segmentationCreated?: boolean;
  hasOHIFServices?: boolean;
  hasSTLFiles?: boolean;
  onFileSelect: () => void;
  onRefresh: () => void;
  onToggleRemovalMode: () => void;
  onUndo: () => void;
  onDownload: () => void;
  onToggleBrightness: () => void;
  onToggleMeasurement: () => void;
  onScreenshot: () => void;
  onToggleClickRemoval: () => void;
  onUndoClickRemoval: () => void;
  onToggleRightView: () => void;
  onApprove: () => void;
  onToggleVersionHistory: () => void;
  onImplantUpload: () => void;
  onMergeWithDicom?: () => void;
  onCreateSegmentation?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  userRole,
  loading,
  removalMode,
  brightnessEnabled,
  measurementEnabled,
  clickRemovalMode,
  showRightView,
  versionHistoryEnabled,
  isApproving,
  clickRemovalUndoStack,
  undoStack,
  isDownloading,
  isMerging, // ADD THIS
  canMerge,
  isCreatingSegmentation = false,
  segmentationCreated = false,
  hasSTLFiles = false,
  hasOHIFServices = false,
  onFileSelect,
  onRefresh,
  onToggleRemovalMode,
  onUndo,
  onDownload,
  onToggleBrightness,
  onToggleMeasurement,
  onScreenshot,
  onToggleClickRemoval,
  onUndoClickRemoval,
  onToggleRightView,
  onApprove,
  onToggleVersionHistory,
  onImplantUpload,
  onMergeWithDicom,
  onCreateSegmentation
}) => {
  if (userRole === 'analyst' || userRole === 'admin') {
    return (
      <div className="icon-toolbar" style={{ marginTop: "10px", height: "40px" }}>
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "flex-start", width: "100%" }}>
          <span style={{ width: "10px" }}></span>
          <div style={{
            color: '#fff', width: "70px", height: "30px",
            backgroundColor: '#17202a', padding: '4px 8px', borderRadius: '4px',
            border: '1px solid #000', fontSize: '12px', marginTop: "5px"
          }}>3D Tools</div>
          <span style={{ width: "10px" }}></span>

          {/* File Selection */}
          <button
            className="icon-button"
            type="button"
            data-tooltip="Select STL files"
            onClick={onFileSelect}
            disabled={loading}
          >
            <i className="fas fa-folder-open" />
          </button>
          <span style={{ width: "10px" }}></span>

          {/* Refresh */}
          <button
            className="icon-button"
            type="button"
            data-tooltip="Refresh viewer"
            onClick={onRefresh}
          >
            <i className="fas fa-sync-alt" />
          </button>
          <span style={{ width: "10px" }}></span>

          {/* Bone Removal */}
          <button
            className={`icon-button${removalMode ? " selected danger" : ""}`}
            type="button"
            data-tooltip={removalMode ? "Disable Bone Removal" : "Enable Bone Removal"}
            onClick={onToggleRemovalMode}
          >
            <i className="fas fa-cut" />
          </button>
          <span style={{ width: "10px" }}></span>

          {/* Undo Removal */}
          <button
            className="icon-button"
            type="button"
            data-tooltip="Undo Removal"
            onClick={onUndo}
            disabled={undoStack.length === 0}
          >
            <i className="fas fa-undo-alt" />
          </button>
          <span style={{ width: "10px" }}></span>

          {/* Download */}
          <button
            className="icon-button"
            type="button"
            data-tooltip="Download All Edited STLs"
            onClick={onDownload}
            disabled={isDownloading}
          >
            <i className="fas fa-download" />
          </button>
          <span style={{ width: "10px" }}></span>

          {/* Brightness */}
          <button
            className={`icon-button${brightnessEnabled ? " selected" : ""}`}
            type="button"
            data-tooltip={brightnessEnabled ? "Disable Brightness" : "Enable Brightness"}
            onClick={onToggleBrightness}
          >
            <i className="fas fa-sun" />
          </button>
          <span style={{ width: "10px" }}></span>

          {/* Measurement */}
          <button
            className={`icon-button${measurementEnabled ? " selected" : ""}`}
            type="button"
            data-tooltip={measurementEnabled ? "Disable Measurement" : "Enable Measurement"}
            onClick={onToggleMeasurement}
          >
            <i className="fas fa-ruler" />
          </button>
          <span style={{ width: "10px" }}></span>

          {/* Screenshot */}
          <button
            className="icon-button"
            type="button"
            data-tooltip="Take Screenshot"
            onClick={onScreenshot}
          >
            <i className="fas fa-camera" />
          </button>
          <span style={{ width: "10px" }}></span>

          {/* Click Removal */}
          <button
            className={`icon-button${clickRemovalMode ? " selected danger" : ""}`}
            type="button"
            data-tooltip={clickRemovalMode ? "Disable Click Removal" : "Enable Click Removal"}
            onClick={onToggleClickRemoval}
          >
            <i className="fas fa-trash" />
          </button>
          <span style={{ width: "10px" }}></span>

          {/* Undo Click Removal */}
          <button
            className={`icon-button${clickRemovalUndoStack.length > 0 ? "" : " disabled"}`}
            type="button"
            data-tooltip="Undo Click Removal"
            onClick={onUndoClickRemoval}
            disabled={clickRemovalUndoStack.length === 0}
          >
            <i className="fas fa-undo-alt" />
          </button>
          <span style={{ width: "10px" }}></span>

          {/* Right View Toggle */}
          <button
            className={`icon-button${showRightView ? " selected" : ""}`}
            type="button"
            data-tooltip={showRightView ? "Hide Right View" : "Show Right View"}
            onClick={onToggleRightView}
          >
            <i className="fas fa-columns" />
          </button>
          <span style={{ width: "10px" }}></span>

          {/* Approve */}
          <button
            className={`icon-button${isApproving ? " loading" : ""}`}
            type="button"
            data-tooltip="Approve Final 3D"
            onClick={onApprove}
            disabled={isApproving}
          >
            <i className="fas fa-check" />
          </button>
          <span style={{ width: "10px" }}></span>

          {/* Version History */}
          <button
            className={`icon-button${versionHistoryEnabled ? " selected" : ""}`}
            type="button"
            data-tooltip={versionHistoryEnabled ? "Hide Version History" : "Show Version History"}
            onClick={onToggleVersionHistory}
          >
            <i className="fas fa-history" />
          </button>
          <span style={{ width: "10px" }}></span>

          {/* Implant Upload */}
          <button
            className="icon-button"
            type="button"
            data-tooltip="Upload Implant Device"
            onClick={onImplantUpload}
          >
            <i className="fas fa-plus-square" />
          </button>
          <span style={{ width: "10px" }}></span>
          <button
              className={`icon-button${segmentationCreated ? " selected success" : ""}${!hasSTLFiles || !hasOHIFServices ? " disabled" : ""}`}
              type="button"
              data-tooltip={
                !hasOHIFServices
                  ? "Waiting for OHIF services..."
                  : !hasSTLFiles
                    ? "No STL files available"
                    : segmentationCreated
                      ? "Segmentations created successfully"
                      : "Create automatic segmentations from STL files"
              }
              onClick={onCreateSegmentation}
              disabled={isCreatingSegmentation || !hasSTLFiles || !hasOHIFServices}
            >
              {isCreatingSegmentation ? (
                <i className="fas fa-spinner fa-spin" />
              ) : !hasOHIFServices ? (
                <i className="fas fa-hourglass-half" />
              ) : (
                <i className="fas fa-vector-square" />
              )}
            </button>
        </div>
      </div>
    );
  }

  // Basic user toolbar
  return (
    <div className="icon-toolbar" style={{ marginTop: "10px" }}>
      <div style={{ display: "flex", flexDirection: "row", justifyContent: "flex-start", width: "100%" }}>
        <span style={{ width: "10px" }}></span>
        <div style={{
          color: '#fff', width: "70px", height: "30px",
          backgroundColor: '#17202a', padding: '4px 8px', borderRadius: '4px',
          border: '1px solid #000', fontSize: '12px', marginTop: "5px"
        }}>3D Tools</div>
        <span style={{ width: "10px" }}></span>

        <button
          className="icon-button"
          type="button"
          data-tooltip="Select STL files"
          onClick={onFileSelect}
          disabled={loading}
        >
          <i className="fas fa-folder-open" />
        </button>
        <span style={{ width: "10px" }}></span>

        <button
          className="icon-button"
          type="button"
          data-tooltip="Refresh viewer"
          onClick={onRefresh}
        >
          <i className="fas fa-sync-alt" />
        </button>
        <span style={{ width: "10px" }}></span>

        <button
          className={`icon-button${brightnessEnabled ? " selected" : ""}`}
          type="button"
          data-tooltip={brightnessEnabled ? "Disable Brightness" : "Enable Brightness"}
          onClick={onToggleBrightness}
        >
          <i className="fas fa-sun" />
        </button>
        <span style={{ width: "10px" }}></span>

        <button
          className="icon-button"
          type="button"
          data-tooltip="Take Screenshot"
          onClick={onScreenshot}
        >
          <i className="fas fa-camera" />
        </button>
      </div>
    </div>
  );
};
