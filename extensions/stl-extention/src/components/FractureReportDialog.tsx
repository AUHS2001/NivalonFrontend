import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import localFrontpage from '../assets/spine_report_frontpage.png';
import localCombinedPreview from '../assets/spine_report_combined_preview.png';
import spineReportJson from '../assets/spine_report.json';

// ---------------------------------------------------------------------------
// Hard-coded API response
// ---------------------------------------------------------------------------
const REPORT_DATA = {
  data: {
    status: 'completed',
    contrast_phase: 'native',
    found_fracture: true,
    fractured_vertebrae: ['L5'],
    low_attenuation_vertebrae: [],
    metadata: {
      StudyID: '1.3.12.2.1107.5.8.9.100505681171374.2024331.43432295.92',
      version: '0.1.0',
      PatientID: 'Z401543',
      StudyDate: '20241126',
      PatientAge: 52,
      PatientSex: 'M',
      PatientName: 'HODRINSKY^TODD^W',
      PatientBirthDate: '19720228',
      StudyDescription: 'CT Lumbar Spine wo contrast',
    },
    results: {
      LWS_max: 0.23,
      vertebrae_L1_intensity: 184.2, vertebrae_L1_volume_ml: 46.79,
      vertebrae_L2_intensity: 192.82, vertebrae_L2_volume_ml: 49.06,
      vertebrae_L3_intensity: 192.59, vertebrae_L3_volume_ml: 51.5,
      vertebrae_L4_intensity: 204.09, vertebrae_L4_volume_ml: 53.35,
      vertebrae_L5_intensity: 257.45, vertebrae_L5_volume_ml: 53.26,
      vertebrae_T11_intensity: 223.25, vertebrae_T11_volume_ml: 37.43,
      vertebrae_T12_intensity: 189.71, vertebrae_T12_volume_ml: 42.63,
      vertebrae_L1_height_middle_mm: 30.29, vertebrae_L1_intensity_median: 179,
      vertebrae_L2_height_middle_mm: 29.55, vertebrae_L2_intensity_median: 184,
      vertebrae_L3_height_middle_mm: 30.3, vertebrae_L3_intensity_median: 177,
      vertebrae_L4_height_middle_mm: 29.68, vertebrae_L4_intensity_median: 191,
      vertebrae_L5_height_middle_mm: 33, vertebrae_L5_intensity_median: 221,
      vertebrae_L1_height_difference: 0.14, vertebrae_L2_height_difference: 0.14,
      vertebrae_L3_height_difference: 0.13, vertebrae_L4_height_difference: 0.16,
      vertebrae_L5_height_difference: 0.23,
      vertebrae_T11_height_middle_mm: 27.79, vertebrae_T11_intensity_median: 214,
      vertebrae_T12_height_middle_mm: 29.84, vertebrae_T12_intensity_median: 184,
      vertebrae_L1_height_anterior_mm: 29.08, vertebrae_L2_height_anterior_mm: 34.33,
      vertebrae_L3_height_anterior_mm: 34.89, vertebrae_L4_height_anterior_mm: 35.31,
      vertebrae_L5_height_anterior_mm: 25.53,
      vertebrae_T11_height_difference: 0.12, vertebrae_T12_height_difference: 0.17,
      vertebrae_L1_height_posterior_mm: 33.63, vertebrae_L2_height_posterior_mm: 32.24,
      vertebrae_L3_height_posterior_mm: 31.52, vertebrae_L4_height_posterior_mm: 32.81,
      vertebrae_L5_height_posterior_mm: 29.89,
      vertebrae_T11_height_anterior_mm: 26.85, vertebrae_T12_height_anterior_mm: 26.42,
      vertebrae_T11_height_posterior_mm: 30.6, vertebrae_T12_height_posterior_mm: 31.7,
    },
    report_nifti_url: '/assets/nifti/spine_report.nii',
    report_json_url: '/assets/nifti/spine_report.json',
    report_png_url: '',
    combined_preview_png_url: '',
    vertebrae_mask_url: '/assets/nifti/totalseg_vertebrae_pp_refined.nii',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VERTEBRAE_ORDER = ['T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5'];

function formatDate(raw: string): string {
  if (!raw || raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}
function formatName(raw: string): string {
  return raw.replace(/\^/g, ' ').trim();
}
function lwsColor(diff: number, fractured: boolean): string {
  if (fractured) return '#ef4444';
  if (diff >= 0.2) return '#f97316';
  if (diff >= 0.15) return '#eab308';
  return '#22c55e';
}
function lwsLabel(diff: number, fractured: boolean): string {
  if (fractured) return 'Fracture';
  if (diff >= 0.2) return 'High Risk';
  if (diff >= 0.15) return 'Moderate';
  return 'Normal';
}

// Simple HSV→RGB for colorising segmentation labels
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// ---------------------------------------------------------------------------
// NIfTI RGB canvas viewer (spine_report.nii — datatype 128, 1210×1264×1)
// ---------------------------------------------------------------------------
const NiftiRgbViewer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/assets/nifti/spine_report.nii');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const view = new DataView(buffer);

      const nx = view.getInt16(42, true);   // 1210
      const ny = view.getInt16(44, true);   // 1264
      const voxOffset = Math.round(view.getFloat32(108, true)); // 352

      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = nx;
      canvas.height = ny;
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.createImageData(nx, ny);
      const src = new Uint8Array(buffer, voxOffset);

      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const si = (y * nx + x) * 3;
          // flip Y (NIfTI origin is bottom-left)
          const di = ((ny - 1 - y) * nx + x) * 4;
          imageData.data[di]     = src[si];
          imageData.data[di + 1] = src[si + 1];
          imageData.data[di + 2] = src[si + 2];
          imageData.data[di + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      setLoaded(true);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '11px', color: '#6b7280' }}>
          NIfTI RGB image — spine_report.nii (1210×1264, datatype RGB24)
        </div>
        {!loaded && (
          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: '5px 14px', fontSize: '11px', fontWeight: 600, borderRadius: '5px',
              border: '1px solid rgba(135,219,252,0.3)', backgroundColor: 'rgba(135,219,252,0.1)',
              color: '#87dbfc', cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Loading…' : 'Load NIfTI'}
          </button>
        )}
      </div>

      {error && (
        <div style={{ fontSize: '12px', color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: '6px' }}>
          {error}
        </div>
      )}

      <div
        style={{
          backgroundColor: '#050a12',
          border: '1px solid #1f2937',
          borderRadius: '8px',
          overflow: 'hidden',
          minHeight: '300px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!loaded && !loading && !error && (
          <div style={{ textAlign: 'center', color: '#4b5563', fontSize: '13px', padding: '40px' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>🫁</div>
            Click <strong style={{ color: '#87dbfc' }}>Load NIfTI</strong> to render
          </div>
        )}
        {loading && (
          <div style={{ textAlign: 'center', color: '#87dbfc', fontSize: '13px', padding: '40px' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px', animation: 'spin 1s linear infinite' }}>⟳</div>
            Fetching 4.4 MB…
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{
            display: loaded ? 'block' : 'none',
            maxWidth: '100%',
            maxHeight: '480px',
            objectFit: 'contain',
          }}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// NIfTI UINT8 3D segmentation viewer (vertebrae mask — 512×512×557)
// TotalSegmentator label mapping discovered from file: 17=L5(fractured), 18=L4,
// 19=L3, 20=L2, 21=L1, 22=T12, 23=T11, 24=T10
// ---------------------------------------------------------------------------
const MASK_NX = 512, MASK_NY = 512, MASK_NZ = 557;
const MASK_VOX_OFFSET = 3216;

const VERTEBRA_LABELS: Record<number, { name: string; color: [number, number, number]; fractured?: boolean }> = {
  17: { name: 'L5', color: [255, 55,  55],  fractured: true  },
  18: { name: 'L4', color: [255, 140,  0]               },
  19: { name: 'L3', color: [255, 215,  0]               },
  20: { name: 'L2', color: [ 60, 210, 100]              },
  21: { name: 'L1', color: [  0, 200, 220]              },
  22: { name: 'T12', color: [ 50, 140, 255]             },
  23: { name: 'T11', color: [175,  80, 255]             },
  24: { name: 'T10', color: [255,  80, 180]             },
};

const NiftiMaskViewer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<Uint8Array | null>(null);
  const [sliceZ, setSliceZ] = useState(Math.floor(MASK_NZ / 2));
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Build LUT once
  const colorLUT = useRef<Uint8Array | null>(null);
  if (!colorLUT.current) {
    const lut = new Uint8Array(256 * 3);
    for (const [labelStr, info] of Object.entries(VERTEBRA_LABELS)) {
      const idx = Number(labelStr);
      lut[idx * 3]     = info.color[0];
      lut[idx * 3 + 1] = info.color[1];
      lut[idx * 3 + 2] = info.color[2];
    }
    colorLUT.current = lut;
  }

  const drawSlice = useCallback((voxels: Uint8Array, z: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = MASK_NX;
    canvas.height = MASK_NY;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(MASK_NX, MASK_NY);
    const lut = colorLUT.current!;
    const zOffset = z * MASK_NX * MASK_NY;

    for (let y = 0; y < MASK_NY; y++) {
      for (let x = 0; x < MASK_NX; x++) {
        const val = voxels[zOffset + y * MASK_NX + x];
        const di = ((MASK_NY - 1 - y) * MASK_NX + x) * 4;
        if (val === 0) {
          // Dark blue-grey background
          imageData.data[di] = 8; imageData.data[di + 1] = 12; imageData.data[di + 2] = 22;
        } else {
          imageData.data[di]     = lut[val * 3];
          imageData.data[di + 1] = lut[val * 3 + 1];
          imageData.data[di + 2] = lut[val * 3 + 2];
        }
        imageData.data[di + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, []);

  useEffect(() => {
    if (data) drawSlice(data, sliceZ);
  }, [data, sliceZ, drawSlice]);

  const load = async () => {
    setLoading(true);
    setError(null);
    setProgress(0);
    try {
      const response = await fetch('/assets/nifti/totalseg_vertebrae_pp_refined.nii');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const total = Number(response.headers.get('Content-Length') || 0);
      const reader = response.body!.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total) setProgress(Math.round((received / total) * 100));
      }
      const full = new Uint8Array(received);
      let pos = 0;
      for (const c of chunks) { full.set(c, pos); pos += c.length; }
      setData(full.subarray(MASK_VOX_OFFSET));
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '11px', color: '#6b7280' }}>
          Vertebrae segmentation mask — 512×512×557 · UINT8 labels · 139 MB
        </div>
        {!data && (
          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: '5px 14px', fontSize: '11px', fontWeight: 600, borderRadius: '5px',
              border: '1px solid rgba(135,219,252,0.35)', backgroundColor: 'rgba(135,219,252,0.1)',
              color: '#87dbfc', cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? `Loading ${progress}%` : 'Load Mask'}
          </button>
        )}
      </div>

      {/* Progress bar */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af' }}>
            <span>Fetching vertebrae mask…</span><span>{progress}%</span>
          </div>
          <div style={{ height: '6px', backgroundColor: '#1f2937', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#3b82f6,#87dbfc)', borderRadius: '3px', transition: 'width 0.15s' }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: '12px', color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: '6px' }}>
          {error}
        </div>
      )}

      {/* Main layout: canvas left, legend right */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>

        {/* Canvas viewer */}
        <div style={{
          flex: 1,
          backgroundColor: '#08111e',
          border: '1px solid #1e2d42',
          borderRadius: '10px',
          overflow: 'hidden',
          minHeight: '320px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)',
        }}>
          {!data && !loading && !error && (
            <div style={{ textAlign: 'center', color: '#4b5563', fontSize: '13px', padding: '40px' }}>
              <div style={{ fontSize: '36px', marginBottom: '10px' }}>🦴</div>
              <div>Click <strong style={{ color: '#87dbfc' }}>Load Mask</strong></div>
              <div style={{ fontSize: '11px', marginTop: '4px', color: '#374151' }}>to render axial segmentation slices</div>
            </div>
          )}
          <canvas
            ref={canvasRef}
            style={{ display: data ? 'block' : 'none', maxWidth: '100%', maxHeight: '420px', objectFit: 'contain' }}
          />
        </div>

        {/* Legend */}
        <div style={{
          width: '130px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '2px' }}>
            Label Map
          </div>
          {Object.entries(VERTEBRA_LABELS).map(([labelStr, info]) => {
            const [r, g, b] = info.color;
            return (
              <div key={labelStr} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                  backgroundColor: `rgb(${r},${g},${b})`,
                  boxShadow: info.fractured ? `0 0 8px rgb(${r},${g},${b})` : 'none',
                  border: info.fractured ? '1px solid rgba(255,100,100,0.6)' : '1px solid rgba(255,255,255,0.1)',
                }} />
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: info.fractured ? `rgb(${r},${g},${b})` : '#d1d5db' }}>
                    {info.name}
                    {info.fractured && <span style={{ marginLeft: '4px', fontSize: '9px', color: '#ef4444' }}>⚠</span>}
                  </div>
                  <div style={{ fontSize: '9px', color: '#4b5563' }}>label {labelStr}</div>
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0, backgroundColor: '#08111e', border: '1px solid #1f2937' }} />
            <div style={{ fontSize: '11px', color: '#374151' }}>Background</div>
          </div>
        </div>
      </div>

      {/* Slice slider */}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af' }}>
            <span>Axial slice (Superior → Inferior)</span>
            <span style={{ color: '#87dbfc', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{sliceZ} / {MASK_NZ - 1}</span>
          </div>
          <input
            type="range"
            min={0}
            max={MASK_NZ - 1}
            value={sliceZ}
            onChange={e => setSliceZ(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#87dbfc', cursor: 'pointer', height: '4px' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#374151' }}>
            <span>Slice 0 (top)</span>
            <span>Slice {MASK_NZ - 1} (bottom)</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// JSON data viewer
// ---------------------------------------------------------------------------
const JsonViewer: React.FC = () => {
  const json = spineReportJson as any;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const toggle = (key: string) =>
    setCollapsed(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const copy = () => {
    navigator.clipboard.writeText(JSON.stringify(json, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const renderValue = (val: any, depth = 0, path = ''): React.ReactNode => {
    if (typeof val === 'object' && val !== null) {
      const isCollapsed = collapsed.has(path);
      const entries = Object.entries(val);
      return (
        <div style={{ marginLeft: depth * 14 }}>
          <span
            onClick={() => toggle(path)}
            style={{ cursor: 'pointer', color: '#9ca3af', userSelect: 'none' as const, fontSize: '11px' }}
          >
            {isCollapsed ? '▶' : '▼'} {`{${isCollapsed ? `…${entries.length} keys` : ''}}`}
          </span>
          {!isCollapsed && (
            <div style={{ borderLeft: '1px solid #1f2937', marginLeft: '6px', paddingLeft: '8px' }}>
              {entries.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: '6px', marginTop: '3px', flexWrap: 'wrap' as const }}>
                  <span style={{ color: '#87dbfc', fontSize: '11px', flexShrink: 0 }}>&quot;{k}&quot;:</span>
                  {typeof v === 'object' && v !== null
                    ? renderValue(v, depth + 1, `${path}.${k}`)
                    : (
                      <span style={{
                        color: typeof v === 'number' ? '#fbbf24' : typeof v === 'string' ? '#86efac' : '#c084fc',
                        fontSize: '11px',
                      }}>
                        {JSON.stringify(v)}
                      </span>
                    )
                  }
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    return <span style={{ color: typeof val === 'number' ? '#fbbf24' : '#86efac', fontSize: '11px' }}>{JSON.stringify(val)}</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: '11px', color: '#6b7280' }}>
          spine_report.json — vertebral measurements and metadata
        </div>
        <button
          onClick={copy}
          style={{
            padding: '4px 12px', fontSize: '11px', fontWeight: 600, borderRadius: '5px',
            border: '1px solid #1f2937', backgroundColor: copied ? 'rgba(34,197,94,0.15)' : '#111827',
            color: copied ? '#22c55e' : '#9ca3af', cursor: 'pointer',
          }}
        >
          {copied ? '✓ Copied' : 'Copy JSON'}
        </button>
      </div>

      <div
        style={{
          backgroundColor: '#060a14',
          border: '1px solid #1f2937',
          borderRadius: '8px',
          padding: '14px 16px',
          overflowY: 'auto' as const,
          fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
          flex: 1,
          minHeight: 0,
        }}
      >
        {renderValue(json, 0, 'root')}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Images tab (all file previews combined)
// ---------------------------------------------------------------------------
type FileTab = 'frontpage' | 'combined' | 'mask' | 'json';

const ImagesTab: React.FC = () => {
  const [activeFile, setActiveFile] = useState<FileTab>('frontpage');
  const [imgError, setImgError] = useState<Record<string, boolean>>({});

  const fileTabs: { id: FileTab; label: string; badge?: string }[] = [
    { id: 'frontpage', label: 'Report PNG' },
    { id: 'combined', label: 'Combined Preview' },
    { id: 'mask', label: 'Vertebrae Mask', badge: '139 MB' },
    { id: 'json', label: 'JSON Data' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* File sub-tabs */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
        {fileTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveFile(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '5px 12px', fontSize: '11px', fontWeight: 600, borderRadius: '6px',
              border: `1px solid ${activeFile === t.id ? '#87dbfc' : '#1f2937'}`,
              backgroundColor: activeFile === t.id ? 'rgba(135,219,252,0.12)' : '#111827',
              color: activeFile === t.id ? '#87dbfc' : '#6b7280',
              cursor: 'pointer', transition: 'all 0.12s',
            }}
          >
            {t.label}
            {t.badge && (
              <span style={{
                fontSize: '9px', padding: '1px 5px', borderRadius: '3px',
                backgroundColor: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)',
              }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* PNG viewers */}
      {(activeFile === 'frontpage' || activeFile === 'combined') && (
        <div
          style={{
            backgroundColor: '#050a12', border: '1px solid #1f2937', borderRadius: '8px',
            overflow: 'hidden', minHeight: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {imgError[activeFile] ? (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>🖼️</div>
              <div style={{ fontSize: '12px' }}>Image unavailable</div>
            </div>
          ) : (
            <img
              key={activeFile}
              src={activeFile === 'frontpage' ? localFrontpage : localCombinedPreview}
              alt={activeFile}
              onError={() => setImgError(prev => ({ ...prev, [activeFile]: true }))}
              style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain', display: 'block' }}
            />
          )}
        </div>
      )}

      {activeFile === 'mask' && <NiftiMaskViewer />}
      {activeFile === 'json' && <JsonViewer />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------
const StatCard: React.FC<{ label: string; value: string; accent?: string; icon?: string }> = ({
  label, value, accent = '#87dbfc', icon,
}) => (
  <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '12px 16px', flex: 1, minWidth: '110px' }}>
    <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '4px' }}>
      {icon && <span style={{ marginRight: '4px' }}>{icon}</span>}{label}
    </div>
    <div style={{ fontSize: '17px', fontWeight: 700, color: accent }}>{value}</div>
  </div>
);

const OverviewTab: React.FC<{ data: typeof REPORT_DATA.data }> = ({ data }) => {
  const { metadata, found_fracture, fractured_vertebrae, low_attenuation_vertebrae, contrast_phase, results } = data;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {found_fracture && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '8px', padding: '12px 16px', display: 'flex', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, color: '#ef4444', fontSize: '13px' }}>FRACTURE DETECTED</div>
            <div style={{ color: '#fca5a5', fontSize: '12px', marginTop: '2px' }}>
              Compression fracture at <strong>{fractured_vertebrae.join(', ')}</strong> — Immediate clinical review recommended.
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
        <StatCard label="Analyzed" value={`${VERTEBRAE_ORDER.length}`} icon="🦴" />
        <StatCard label="Fractured" value={fractured_vertebrae.length > 0 ? fractured_vertebrae.join(', ') : 'None'} accent={fractured_vertebrae.length > 0 ? '#ef4444' : '#22c55e'} icon="⚠️" />
        <StatCard label="Low Atten." value={low_attenuation_vertebrae.length > 0 ? low_attenuation_vertebrae.join(', ') : 'None'} accent={low_attenuation_vertebrae.length > 0 ? '#f97316' : '#22c55e'} icon="📉" />
        <StatCard label="Max LWS" value={`${(results.LWS_max * 100).toFixed(0)}%`} accent="#f97316" icon="📊" />
        <StatCard label="Phase" value={contrast_phase.charAt(0).toUpperCase() + contrast_phase.slice(1)} icon="💉" />
      </div>
      <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '14px 16px' }}>
        <div style={{ fontSize: '11px', color: '#87dbfc', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '10px', textTransform: 'uppercase' as const }}>Patient Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
          {[
            ['Patient Name', formatName(metadata.PatientName)],
            ['Patient ID', metadata.PatientID],
            ['Date of Birth', formatDate(metadata.PatientBirthDate)],
            ['Age / Sex', `${metadata.PatientAge} yrs / ${metadata.PatientSex === 'M' ? 'Male' : 'Female'}`],
            ['Study Date', formatDate(metadata.StudyDate)],
            ['Study Description', metadata.StudyDescription],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '1px' }}>{label}</div>
              <div style={{ fontSize: '12px', color: '#e5e7eb', fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Clinical Findings Summary */}
      <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '14px 16px' }}>
        <div style={{ fontSize: '11px', color: '#87dbfc', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '10px', textTransform: 'uppercase' as const }}>
          Clinical Findings Summary
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            {
              indicator: found_fracture ? '🔴' : '🟢',
              text: found_fracture
                ? `Vertebral compression fracture detected at ${fractured_vertebrae.join(', ')} with a wedge angle deformity (LWS score: ${(results.LWS_max * 100).toFixed(0)}%).`
                : 'No vertebral compression fractures detected.',
            },
            {
              indicator: '🔵',
              text: `CT Lumbar Spine performed without contrast (native phase). Vertebrae T11 through L5 were analyzed.`,
            },
            {
              indicator: low_attenuation_vertebrae.length > 0 ? '🟡' : '🟢',
              text: low_attenuation_vertebrae.length > 0
                ? `Low bone attenuation detected in: ${low_attenuation_vertebrae.join(', ')}.`
                : 'No low-attenuation vertebrae identified.',
            },
            {
              indicator: '📋',
              text: `Average vertebral body heights are within normal range for non-fractured levels. Bone density (HU) values are normal.`,
            },
          ].map(({ indicator, text }, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '12px', color: '#d1d5db', lineHeight: '1.5' }}>
              <span style={{ flexShrink: 0, marginTop: '1px' }}>{indicator}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Vertebrae data tab
// ---------------------------------------------------------------------------
const VertebraeTab: React.FC<{ data: typeof REPORT_DATA.data }> = ({ data }) => {
  const { results, fractured_vertebrae } = data;
  const rows = VERTEBRAE_ORDER.map(v => {
    const key = `vertebrae_${v}`;
    return {
      name: v,
      anterior: (results as any)[`${key}_height_anterior_mm`] ?? 0,
      middle: (results as any)[`${key}_height_middle_mm`] ?? 0,
      posterior: (results as any)[`${key}_height_posterior_mm`] ?? 0,
      heightDiff: (results as any)[`${key}_height_difference`] ?? 0,
      volume: (results as any)[`${key}_volume_ml`] ?? 0,
      intensity: (results as any)[`${key}_intensity`] ?? 0,
      fractured: fractured_vertebrae.includes(v),
    };
  });

  const thS: React.CSSProperties = { padding: '8px 12px', textAlign: 'left' as const, fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: '1px solid #1f2937', whiteSpace: 'nowrap' as const };
  const tdS: React.CSSProperties = { padding: '10px 12px', fontSize: '12px', color: '#d1d5db', borderBottom: '1px solid #1a1f2e' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' as const }}>
        {[['#22c55e', 'Normal (< 15%)'], ['#eab308', 'Moderate (15–20%)'], ['#f97316', 'High Risk (≥ 20%)'], ['#ef4444', 'Fracture']].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9ca3af' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: c }} />{l}
          </div>
        ))}
      </div>
      <div style={{ overflowX: 'auto' as const, borderRadius: '8px', border: '1px solid #1f2937' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
          <thead style={{ backgroundColor: '#0d1117' }}>
            <tr>
              {['Vertebra', 'Ant. (mm)', 'Mid. (mm)', 'Post. (mm)', 'LWS Score', 'Volume (mL)', 'Density (HU)', 'Status'].map((h, i) => (
                <th key={h} style={{ ...thS, textAlign: i === 0 ? 'left' as const : 'center' as const }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const color = lwsColor(row.heightDiff, row.fractured);
              const label = lwsLabel(row.heightDiff, row.fractured);
              return (
                <tr key={row.name} style={{ backgroundColor: row.fractured ? 'rgba(239,68,68,0.07)' : i % 2 === 0 ? '#111827' : '#0d1117' }}>
                  <td style={{ ...tdS, fontWeight: 700, color: row.fractured ? '#ef4444' : '#87dbfc' }}>
                    {row.name}
                    {row.fractured && <span style={{ marginLeft: '6px', fontSize: '10px', backgroundColor: 'rgba(239,68,68,0.2)', color: '#ef4444', padding: '1px 5px', borderRadius: '3px' }}>⚠</span>}
                  </td>
                  <td style={{ ...tdS, textAlign: 'center' as const }}>{row.anterior > 0 ? row.anterior.toFixed(1) : '—'}</td>
                  <td style={{ ...tdS, textAlign: 'center' as const }}>{row.middle > 0 ? row.middle.toFixed(1) : '—'}</td>
                  <td style={{ ...tdS, textAlign: 'center' as const }}>{row.posterior > 0 ? row.posterior.toFixed(1) : '—'}</td>
                  <td style={{ ...tdS, textAlign: 'center' as const }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <div style={{ width: '50px', height: '6px', backgroundColor: '#1f2937', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, row.heightDiff * 400)}%`, backgroundColor: color, borderRadius: '3px' }} />
                      </div>
                      <span style={{ color, fontSize: '11px', fontWeight: 600 }}>{(row.heightDiff * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{ ...tdS, textAlign: 'center' as const }}>{row.volume.toFixed(1)}</td>
                  <td style={{ ...tdS, textAlign: 'center' as const }}>{row.intensity.toFixed(1)}</td>
                  <td style={{ ...tdS, textAlign: 'center' as const }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, color, backgroundColor: `${color}22`, border: `1px solid ${color}55`, padding: '2px 8px', borderRadius: '20px' }}>{label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Anterior vs Posterior Heights bar chart */}
      <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '14px 16px' }}>
        <div style={{ fontSize: '11px', color: '#87dbfc', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '12px', textTransform: 'uppercase' as const }}>
          Anterior vs Posterior Heights Comparison
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rows.map(row => {
            const maxH = 45;
            const antPct = (row.anterior / maxH) * 100;
            const postPct = (row.posterior / maxH) * 100;
            const barColor = row.fractured ? '#ef4444' : '#87dbfc';
            return (
              <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', fontSize: '11px', fontWeight: 600, color: row.fractured ? '#ef4444' : '#87dbfc', flexShrink: 0 }}>
                  {row.name}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '30px', fontSize: '9px', color: '#6b7280', flexShrink: 0 }}>Ant</div>
                    <div style={{ flex: 1, height: '6px', backgroundColor: '#1f2937', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${antPct}%`, backgroundColor: barColor, opacity: 0.7, borderRadius: '3px' }} />
                    </div>
                    <div style={{ width: '36px', fontSize: '10px', color: '#9ca3af', textAlign: 'right' as const }}>
                      {row.anterior > 0 ? `${row.anterior.toFixed(1)}` : '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '30px', fontSize: '9px', color: '#6b7280', flexShrink: 0 }}>Post</div>
                    <div style={{ flex: 1, height: '6px', backgroundColor: '#1f2937', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${postPct}%`, backgroundColor: barColor, borderRadius: '3px' }} />
                    </div>
                    <div style={{ width: '36px', fontSize: '10px', color: '#9ca3af', textAlign: 'right' as const }}>
                      {row.posterior > 0 ? `${row.posterior.toFixed(1)}` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------
type TabId = 'overview' | 'vertebrae' | 'files';

const TabButton: React.FC<{ id: TabId; label: string; active: boolean; onClick: (id: TabId) => void }> = ({ id, label, active, onClick }) => (
  <button
    onClick={() => onClick(id)}
    style={{
      padding: '8px 18px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const,
      borderRadius: '6px', border: 'none', cursor: 'pointer', transition: 'all 0.15s',
      backgroundColor: active ? 'rgba(135,219,252,0.15)' : 'transparent',
      color: active ? '#87dbfc' : '#6b7280',
      borderBottom: active ? '2px solid #87dbfc' : '2px solid transparent',
    }}
  >
    {label}
  </button>
);

export interface FractureReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const FractureReportDialog: React.FC<FractureReportDialogProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  if (!isOpen) return null;
  const { data } = REPORT_DATA;

  return ReactDOM.createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ backgroundColor: '#0d1117', border: '1px solid #1e2a3a', borderRadius: '12px', width: '100%', maxWidth: '960px', height: '88vh', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e2a3a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'linear-gradient(135deg,#0d1117 0%,#111827 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'linear-gradient(135deg,rgba(239,68,68,0.3),rgba(239,68,68,0.1))', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🦴</div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#f3f4f6' }}>Fracture Detection Report</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px' }}>
                {formatName(data.metadata.PatientName)} &bull; {formatDate(data.metadata.StudyDate)} &bull; {data.metadata.StudyDescription}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '20px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} />
              {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
            </div>
            {data.found_fracture && (
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '20px', padding: '3px 10px' }}>
                ⚠️ Fracture: {data.fractured_vertebrae.join(', ')}
              </div>
            )}
            <button onClick={onClose} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #1f2937', backgroundColor: '#1a2030', color: '#9ca3af', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ padding: '0 20px', borderBottom: '1px solid #1e2a3a', display: 'flex', gap: '4px', flexShrink: 0, backgroundColor: '#0d1117' }}>
          <TabButton id="overview" label="Overview" active={activeTab === 'overview'} onClick={setActiveTab} />
          <TabButton id="vertebrae" label="Vertebrae Data" active={activeTab === 'vertebrae'} onClick={setActiveTab} />
          <TabButton id="files" label="Files & Previews" active={activeTab === 'files'} onClick={setActiveTab} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'overview' && <OverviewTab data={data} />}
          {activeTab === 'vertebrae' && <VertebraeTab data={data} />}
          {activeTab === 'files' && <ImagesTab />}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid #1e2a3a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backgroundColor: '#0a0e17' }}>
          <div style={{ fontSize: '10px', color: '#374151' }}>
            Nivalonmedical AI &bull; v{data.metadata.version} &bull; ID: …{data.metadata.StudyID.slice(-10)}
          </div>
          <button onClick={onClose} style={{ padding: '6px 16px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', border: '1px solid #374151', backgroundColor: '#1a2030', color: '#9ca3af', cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FractureReportDialog;
