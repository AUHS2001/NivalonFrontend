import React, { useState, useEffect } from 'react';
import { useAngleMeasurementContext } from '../context/AngleMeasurementContext';

interface AngleMeasurementPanelProps {
}

export const AngleMeasurementPanel: React.FC<AngleMeasurementPanelProps> = () => {
  const { 
    angleMeasurements, 
    clearAngleMeasurements, 
    removeAngleMeasurement,
    isMeasuringAngle,
    tempAnglePoints,
    angleMeasurementEnabled,
    isDraggingAnglePoint
  } = useAngleMeasurementContext();

  const [activeDrag, setActiveDrag] = useState<string | null>(null);

  useEffect(() => {
    if (isDraggingAnglePoint) {
      setActiveDrag('DRAGGING_POINT');
    } else {
      setActiveDrag(null);
    }
  }, [isDraggingAnglePoint]);

  if (angleMeasurements.length === 0 && tempAnglePoints.length === 0) {
    return (
      <div style={{ marginTop: "18px", padding: "10px", backgroundColor: "#0a0e17", borderRadius: "8px" }}>
        <h4 style={{ fontSize: "14px", margin: 0, color: "#9fcfff" }}>Angle Measurements</h4>
        <div style={{ marginTop: "10px", fontSize: "12px", color: "#aaa" }}>
          <div>No measurements yet.</div>
          <div style={{ marginTop: "5px" }}>
            <strong>Instructions:</strong>
            <ol style={{ marginLeft: "15px", marginTop: "5px" }}>
              <li>Enable angle measurement mode</li>
              <li>Click on 3 points on bones to create an angle</li>
              <li><strong>Click and drag red points</strong> to adjust angle and move bones</li>
              <li><strong>Text gets BIGGER</strong> while dragging for better visibility</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "18px" }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "7px",
        padding: "5px"
      }}>
        <div>
          <h4 style={{ fontSize: "14px", margin: 0, color: "#9fcfff" }}>Angle Measurements</h4>
          {activeDrag && (
            <div style={{ fontSize: "11px", color: "#ffff00", marginTop: "2px" }}>
              ⚡ Dragging - Text is enlarged
            </div>
          )}
        </div>
        <button
          onClick={clearAngleMeasurements}
          className="icon-button danger"
          data-tooltip="Clear All"
          style={{ fontSize: "13px", width: "28px", height: "28px", borderRadius: 8 }}
        >
          <i className="fas fa-trash-alt" />
        </button>
      </div>
      
      {tempAnglePoints.length > 0 && (
        <div style={{
          padding: "8px",
          backgroundColor: "#0f1420",
          borderRadius: "4px",
          marginBottom: "10px",
          fontSize: "12px",
          color: "#ffcc00",
          animation: "pulse 2s infinite"
        }}>
          <strong>Creating measurement...</strong> Click {3 - tempAnglePoints.length} more point(s)
          <div style={{ fontSize: "11px", color: "#aaa", marginTop: "3px" }}>
            Points clicked: {tempAnglePoints.length}/3
          </div>
        </div>
      )}
      
      <div style={{
        maxHeight: "330px",
        overflowY: "auto",
        border: "1px solid #1a2030",
        borderRadius: "4px",
      }}>
        {angleMeasurements.map((meas, index) => (
          <div
            key={meas.id}
            style={{
              padding: "10px",
              borderBottom: "1px solid #1a2030",
              fontSize: "12px",
              backgroundColor: index % 2 === 0 ? "rgba(0, 0, 0, 0.1)" : "transparent",
              borderLeft: activeDrag ? "4px solid #ffff00" : "4px solid transparent",
              transition: "border-left 0.3s"
            }}
          >
            <div style={{ fontWeight: "bold", color: "#87dbfc", display: "flex", justifyContent: "space-between" }}>
              <div>
                <span style={{ color: "#ffff00", fontSize: "16px" }}>{meas.angle.toFixed(1)}°</span>
                <span style={{ fontSize: "11px", color: "#aaa", marginLeft: "8px" }}>
                  Angle {index + 1}
                </span>
              </div>
              <button
                onClick={() => removeAngleMeasurement(meas.id)}
                className="icon-button danger"
                data-tooltip="Remove"
                style={{
                  fontSize: "11px",
                  width: "22px",
                  height: "22px",
                  borderRadius: "6px",
                }}
              >
                <i className="fas fa-times" />
              </button>
            </div>
            
            <div style={{ marginTop: "8px", color: "#e8e8e8", fontSize: "11px" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: "4px" }}>
                <div style={{ width: "12px", height: "12px", backgroundColor: "#ff0000", borderRadius: "50%", marginRight: "6px" }}></div>
                <div><strong>Points (click & drag):</strong></div>
              </div>
              <div style={{ paddingLeft: "18px" }}>
                <div>• Start: ({meas.startPoint.x.toFixed(1)}, {meas.startPoint.y.toFixed(1)}, {meas.startPoint.z.toFixed(1)})</div>
                <div>• Vertex: ({meas.vertex.x.toFixed(1)}, {meas.vertex.y.toFixed(1)}, {meas.vertex.z.toFixed(1)})</div>
                <div>• End: ({meas.endPoint.x.toFixed(1)}, {meas.endPoint.y.toFixed(1)}, {meas.endPoint.z.toFixed(1)})</div>
              </div>
            </div>
            
            <div style={{ 
              marginTop: "10px", 
              padding: "6px",
              backgroundColor: "rgba(0, 100, 255, 0.1)", 
              borderRadius: "4px",
              border: "1px solid rgba(0, 150, 255, 0.3)"
            }}>
              <div style={{ color: "#00ffff", fontSize: "11px", fontWeight: "bold" }}>
                🎯 Drag Features:
              </div>
              <div style={{ fontSize: "10px", color: "#aaffaa", marginTop: "3px" }}>
                • Click & hold red points to drag
                <br/>
                • Bone moves with the point
                <br/>
                • Angle updates in real-time
                <br/>
                • Text gets 2x bigger while dragging
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div style={{ 
        marginTop: "10px", 
        padding: "8px", 
        backgroundColor: activeDrag ? "#2a2a00" : "#0f1420", 
        borderRadius: "4px",
        border: activeDrag ? "2px solid #ffff00" : "1px solid #333",
        transition: "all 0.3s"
      }}>
        <div style={{ color: activeDrag ? "#ffff00" : "#666", fontSize: "11px", fontWeight: "bold" }}>
          {activeDrag ? "⚡ ACTIVE DRAGGING" : "💡 Tips"}
        </div>
        <div style={{ marginTop: "5px", fontSize: "10px", color: activeDrag ? "#ffffaa" : "#888" }}>
          {activeDrag ? 
            "Dragging point → Bone moves & angle updates. Text is enlarged for visibility." :
            "Drag red points to adjust angle. The connected bone will move with the point."}
        </div>
      </div>
      
      <style>
        {`
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
          }
        `}
      </style>
    </div>
  );
};