import React from 'react';
import { Measurement } from '../types/three.types';
import { useMeasurementContext } from '../context/MeasurementContext';

interface MeasurementPanelProps {
}

export const MeasurementPanel: React.FC<MeasurementPanelProps> = ({
}) => {
  const { measurements, clearMeasurements, removeMeasurement } = useMeasurementContext();

  if (measurements.length === 0) return null;

  return (
    <div style={{ marginTop: "18px" }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "7px",
        padding: "5px"
      }}>
        <h4 style={{ fontSize: "14px", margin: 0, color: "#9fcfff" }}>Measurements</h4>
        <button
          onClick={clearMeasurements}
          className="icon-button danger"
          data-tooltip="Clear All"
          style={{ fontSize: "13px", width: "28px", height: "28px", borderRadius: 8 }}
        >
          <i className="fas fa-trash-alt" />
        </button>
      </div>
      <div style={{
        maxHeight: "330px",
        overflowY: "auto",
        border: "1px solid #1a2030",
        borderRadius: "4px",
      }}>
        {measurements.map((meas) => (
          <div
            key={meas.id}
            style={{
              padding: "6px",
              borderBottom: "1px solid #1a2030",
              fontSize: "12px",
              marginBottom: "12px",
            }}
          >
            <div style={{ fontWeight: "bold", color: "#87dbfc", display: "flex", justifyContent: "space-between" }}>
              <div>Distance: {meas.distance.toFixed(2)} mm</div>
              <button
                onClick={() => removeMeasurement(meas.id)}
                className="icon-button danger"
                data-tooltip="Remove"
                style={{
                  fontSize: "11px",
                  width: "22px",
                  height: "22px",
                  borderRadius: "6px",
                  marginTop: "4px",
                  marginLeft: "-2px",
                }}
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div style={{ marginTop: "1px", color: "#e8e8e8" }}>
              Point 1: ({meas.point1.x.toFixed(2)}, {meas.point1.y.toFixed(2)}, {meas.point1.z.toFixed(2)})
            </div>
            <div style={{ color: "#e8e8e8" }}>
              Point 2: ({meas.point2.x.toFixed(2)}, {meas.point2.y.toFixed(2)}, {meas.point2.z.toFixed(2)})
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
