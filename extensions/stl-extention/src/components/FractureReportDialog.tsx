import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { fetchFile } from '../../../../config/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SpineReportData {
  status: string;
  contrast_phase: string;
  found_fracture: boolean;
  fractured_vertebrae: string[];
  low_attenuation_vertebrae: string[];
  metadata: {
    StudyID: string;
    version: string;
    PatientID: string;
    StudyDate: string;
    PatientAge: number;
    PatientSex: string;
    PatientName: string;
    PatientBirthDate: string;
    StudyDescription: string;
  };
  results: Record<string, number>;
  report_nifti_url: string;
  report_json_url: string;
  report_png_url: string;
  report_html_url: string;
  combined_preview_png_url: string;
  vertebrae_mask_url: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VERTEBRAE_ORDER = ['T9', 'T10', 'T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5'];

function formatDate(raw: string): string {
  if (!raw || raw.length !== 8) return raw || '—';
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}
function formatName(raw: string): string {
  return raw.replace(/\^/g, ' ').trim() || '—';
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

// Blob URL hook — uses fetchFile for CDN/S3 rewriting in dev
function useBlobUrl(url: string | null): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let active = true;
    let created: string | null = null;
    fetchFile(url)
      .then(r => r.blob())
      .then(blob => {
        if (active) {
          created = URL.createObjectURL(blob);
          setBlobUrl(created);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);
  return blobUrl;
}

// ---------------------------------------------------------------------------
// NIfTI mask viewer — accepts URL, parses header, handles .nii.gz
// ---------------------------------------------------------------------------
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

const NiftiMaskViewer: React.FC<{ maskUrl: string | null }> = ({ maskUrl }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<Uint8Array | null>(null);
  const [dims, setDims] = useState<{ nx: number; ny: number; nz: number } | null>(null);
  const [sliceZ, setSliceZ] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

  const drawSlice = useCallback((voxels: Uint8Array, z: number, nx: number, ny: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = nx;
    canvas.height = ny;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(nx, ny);
    const lut = colorLUT.current!;
    const zOffset = z * nx * ny;
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const val = voxels[zOffset + y * nx + x];
        const di = ((ny - 1 - y) * nx + x) * 4;
        if (val === 0) {
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
    if (data && dims) drawSlice(data, sliceZ, dims.nx, dims.ny);
  }, [data, sliceZ, dims, drawSlice]);

  const load = async () => {
    if (!maskUrl) return;
    setLoading(true);
    setError(null);
    setProgress(0);
    try {
      const response = await fetchFile(maskUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const isGzip = maskUrl.endsWith('.gz');
      const total = Number(response.headers.get('Content-Length') || 0);
      const chunks: Uint8Array[] = [];
      let received = 0;

      let reader: ReadableStreamDefaultReader<Uint8Array>;
      if (isGzip && typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('gzip');
        reader = response.body!.pipeThrough(ds).getReader();
      } else {
        reader = response.body!.getReader();
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total && !isGzip) setProgress(Math.round((received / total) * 100));
      }

      const full = new Uint8Array(received);
      let pos = 0;
      for (const c of chunks) { full.set(c, pos); pos += c.length; }

      const view = new DataView(full.buffer);
      const nx = view.getInt16(42, true);
      const ny = view.getInt16(44, true);
      const nz = view.getInt16(46, true);
      const voxOffset = Math.round(view.getFloat32(108, true));

      setDims({ nx, ny, nz });
      setSliceZ(Math.floor(nz / 2));
      setData(full.subarray(voxOffset));
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const nz = dims?.nz ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '11px', color: '#6b7280' }}>
          Vertebrae segmentation mask · UINT8 labels
        </div>
        {!data && (
          <button
            onClick={load}
            disabled={loading || !maskUrl}
            style={{ padding: '5px 14px', fontSize: '11px', fontWeight: 600, borderRadius: '5px', border: '1px solid rgba(135,219,252,0.35)', backgroundColor: 'rgba(135,219,252,0.1)', color: '#87dbfc', cursor: loading ? 'wait' : 'pointer' }}
          >
            {loading ? `Loading ${progress}%` : 'Load Mask'}
          </button>
        )}
      </div>

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
        <div style={{ fontSize: '12px', color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: '6px' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, backgroundColor: '#08111e', border: '1px solid #1e2d42', borderRadius: '10px', overflow: 'hidden', minHeight: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)' }}>
          {!data && !loading && !error && (
            <div style={{ textAlign: 'center', color: '#4b5563', fontSize: '13px', padding: '40px' }}>
              <div style={{ fontSize: '36px', marginBottom: '10px' }}>🦴</div>
              <div>Click <strong style={{ color: '#87dbfc' }}>Load Mask</strong></div>
              <div style={{ fontSize: '11px', marginTop: '4px', color: '#374151' }}>to render axial segmentation slices</div>
            </div>
          )}
          <canvas ref={canvasRef} style={{ display: data ? 'block' : 'none', maxWidth: '100%', maxHeight: '420px', objectFit: 'contain' }} />
        </div>

        <div style={{ width: '130px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '2px' }}>Label Map</div>
          {Object.entries(VERTEBRA_LABELS).map(([labelStr, info]) => {
            const [r, g, b] = info.color;
            return (
              <div key={labelStr} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0, backgroundColor: `rgb(${r},${g},${b})`, boxShadow: info.fractured ? `0 0 8px rgb(${r},${g},${b})` : 'none', border: info.fractured ? '1px solid rgba(255,100,100,0.6)' : '1px solid rgba(255,255,255,0.1)' }} />
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: info.fractured ? `rgb(${r},${g},${b})` : '#d1d5db' }}>
                    {info.name}{info.fractured && <span style={{ marginLeft: '4px', fontSize: '9px', color: '#ef4444' }}>⚠</span>}
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

      {data && dims && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af' }}>
            <span>Axial slice (Superior → Inferior)</span>
            <span style={{ color: '#87dbfc', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{sliceZ} / {nz - 1}</span>
          </div>
          <input type="range" min={0} max={nz - 1} value={sliceZ} onChange={e => setSliceZ(Number(e.target.value))} style={{ width: '100%', accentColor: '#87dbfc', cursor: 'pointer', height: '4px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#374151' }}>
            <span>Slice 0 (top)</span><span>Slice {nz - 1} (bottom)</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// JSON data viewer
// ---------------------------------------------------------------------------
const JsonViewer: React.FC<{ data: Record<string, any> }> = ({ data: json }) => {
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
          <span onClick={() => toggle(path)} style={{ cursor: 'pointer', color: '#9ca3af', userSelect: 'none' as const, fontSize: '11px' }}>
            {isCollapsed ? '▶' : '▼'} {`{${isCollapsed ? `…${entries.length} keys` : ''}}`}
          </span>
          {!isCollapsed && (
            <div style={{ borderLeft: '1px solid #1f2937', marginLeft: '6px', paddingLeft: '8px' }}>
              {entries.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: '6px', marginTop: '3px', flexWrap: 'wrap' as const }}>
                  <span style={{ color: '#87dbfc', fontSize: '11px', flexShrink: 0 }}>&quot;{k}&quot;:</span>
                  {typeof v === 'object' && v !== null
                    ? renderValue(v, depth + 1, `${path}.${k}`)
                    : <span style={{ color: typeof v === 'number' ? '#fbbf24' : typeof v === 'string' ? '#86efac' : '#c084fc', fontSize: '11px' }}>{JSON.stringify(v)}</span>
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
    <div>
      {renderValue(json, 0, 'root')}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Images / files tab
// ---------------------------------------------------------------------------
type FileTab = 'frontpage' | 'combined';

const ImagesTab: React.FC<{ reportData: SpineReportData }> = ({ reportData }) => {
  const [activeFile, setActiveFile] = useState<FileTab>('frontpage');
  const [imgError, setImgError] = useState<Record<string, boolean>>({});

  const frontpageBlobUrl = useBlobUrl(reportData.report_png_url || null);
  const combinedBlobUrl  = useBlobUrl(reportData.combined_preview_png_url || null);

  const fileTabs: { id: FileTab; label: string }[] = [
    { id: 'frontpage', label: 'Report PNG' },
    { id: 'combined',  label: 'Combined Preview' },
  ];

  const imgSrc = activeFile === 'frontpage' ? frontpageBlobUrl : combinedBlobUrl;
  const imgUrl = activeFile === 'frontpage' ? reportData.report_png_url : reportData.combined_preview_png_url;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch', height: '700px' }}>
        {/* Image */}
        <div style={{ flex: 1, backgroundColor: '#050a12', border: '1px solid #1f2937', borderRadius: '8px', overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {imgError[activeFile] || (!imgSrc && !imgUrl) ? (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>🖼️</div>
              <div style={{ fontSize: '12px' }}>Image unavailable</div>
            </div>
          ) : !imgSrc ? (
            <div style={{ textAlign: 'center', color: '#87dbfc', fontSize: '12px', padding: '40px' }}>Loading image…</div>
          ) : (
            <img
              key={activeFile}
              src={imgSrc}
              alt={activeFile}
              onError={() => setImgError(prev => ({ ...prev, [activeFile]: true }))}
              style={{ width: '100%', display: 'block' }}
            />
          )}
        </div>

        {/* JSON — only shown next to combined preview */}
        {activeFile === 'combined' && (
          <div style={{ flex: 1, backgroundColor: '#060a14', border: '1px solid #1f2937', borderRadius: '8px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>vertebral measurements</div>
              <button
                onClick={() => { navigator.clipboard.writeText(JSON.stringify(reportData.results, null, 2)); }}
                style={{ padding: '4px 12px', fontSize: '11px', fontWeight: 600, borderRadius: '5px', border: '1px solid #1f2937', backgroundColor: '#111827', color: '#9ca3af', cursor: 'pointer' }}
              >
                Copy JSON
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', fontFamily: '"JetBrains Mono", "Fira Code", monospace', minHeight: 0 }}>
              <JsonViewer data={reportData.results} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------
const StatCard: React.FC<{ label: string; value: string; accent?: string; icon?: string }> = ({ label, value, accent = '#87dbfc', icon }) => (
  <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '12px 16px', flex: 1, minWidth: '110px' }}>
    <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '4px' }}>
      {icon && <span style={{ marginRight: '4px' }}>{icon}</span>}{label}
    </div>
    <div style={{ fontSize: '17px', fontWeight: 700, color: accent }}>{value}</div>
  </div>
);

const OverviewTab: React.FC<{ data: SpineReportData }> = ({ data }) => {
  const { metadata, found_fracture, fractured_vertebrae, low_attenuation_vertebrae, contrast_phase, results } = data;
  const analyzedCount = VERTEBRAE_ORDER.filter(v => results[`vertebrae_${v}_intensity`] !== undefined).length;
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
        <StatCard label="Analyzed" value={`${analyzedCount}`} icon="🦴" />
        <StatCard label="Fractured" value={fractured_vertebrae.length > 0 ? fractured_vertebrae.join(', ') : 'None'} accent={fractured_vertebrae.length > 0 ? '#ef4444' : '#22c55e'} icon="⚠️" />
        <StatCard label="Low Atten." value={low_attenuation_vertebrae.length > 0 ? low_attenuation_vertebrae.join(', ') : 'None'} accent={low_attenuation_vertebrae.length > 0 ? '#f97316' : '#22c55e'} icon="📉" />
        <StatCard label="Max LWS" value={`${(results.LWS_max * 100).toFixed(0)}%`} accent="#f97316" icon="📊" />
        <StatCard label="Phase" value={contrast_phase.charAt(0).toUpperCase() + contrast_phase.slice(1).replace('_', ' ')} icon="💉" />
      </div>
      <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '14px 16px' }}>
        <div style={{ fontSize: '11px', color: '#87dbfc', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '10px', textTransform: 'uppercase' as const }}>Patient Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
          {[
            ['Patient Name', formatName(metadata.PatientName)],
            ['Patient ID', metadata.PatientID],
            ['Date of Birth', formatDate(metadata.PatientBirthDate)],
            ['Age / Sex', `${metadata.PatientAge} yrs / ${metadata.PatientSex === 'M' ? 'Male' : metadata.PatientSex === 'F' ? 'Female' : metadata.PatientSex}`],
            ['Study Date', formatDate(metadata.StudyDate)],
            ['Study Description', metadata.StudyDescription || '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '1px' }}>{label}</div>
              <div style={{ fontSize: '12px', color: '#e5e7eb', fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '14px 16px' }}>
        <div style={{ fontSize: '11px', color: '#87dbfc', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '10px', textTransform: 'uppercase' as const }}>Clinical Findings Summary</div>
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
              text: `CT ${metadata.StudyDescription || 'Spine'} (${contrast_phase.replace('_', ' ')} phase). ${analyzedCount} vertebrae analyzed.`,
            },
            {
              indicator: low_attenuation_vertebrae.length > 0 ? '🟡' : '🟢',
              text: low_attenuation_vertebrae.length > 0
                ? `Low bone attenuation detected in: ${low_attenuation_vertebrae.join(', ')}.`
                : 'No low-attenuation vertebrae identified.',
            },
            {
              indicator: '📋',
              text: 'Average vertebral body heights are within normal range for non-fractured levels. Bone density (HU) values are normal.',
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
const VertebraeTab: React.FC<{ data: SpineReportData }> = ({ data }) => {
  const { results, fractured_vertebrae } = data;
  const rows = VERTEBRAE_ORDER
    .filter(v => results[`vertebrae_${v}_intensity`] !== undefined)
    .map(v => {
      const key = `vertebrae_${v}`;
      return {
        name: v,
        anterior:  results[`${key}_height_anterior_mm`]  ?? 0,
        middle:    results[`${key}_height_middle_mm`]    ?? 0,
        posterior: results[`${key}_height_posterior_mm`] ?? 0,
        heightDiff: results[`${key}_height_difference`]  ?? 0,
        volume:    results[`${key}_volume_ml`]            ?? 0,
        intensity: results[`${key}_intensity`]            ?? 0,
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
                    {row.name}{row.fractured && <span style={{ marginLeft: '6px', fontSize: '10px', backgroundColor: 'rgba(239,68,68,0.2)', color: '#ef4444', padding: '1px 5px', borderRadius: '3px' }}>⚠</span>}
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

      <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '14px 16px' }}>
        <div style={{ fontSize: '11px', color: '#87dbfc', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '12px', textTransform: 'uppercase' as const }}>Anterior vs Posterior Heights Comparison</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rows.map(row => {
            const maxH = 45;
            const antPct  = (row.anterior  / maxH) * 100;
            const postPct = (row.posterior / maxH) * 100;
            const barColor = row.fractured ? '#ef4444' : '#87dbfc';
            return (
              <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', fontSize: '11px', fontWeight: 600, color: row.fractured ? '#ef4444' : '#87dbfc', flexShrink: 0 }}>{row.name}</div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '30px', fontSize: '9px', color: '#6b7280', flexShrink: 0 }}>Ant</div>
                    <div style={{ flex: 1, height: '6px', backgroundColor: '#1f2937', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${antPct}%`, backgroundColor: barColor, opacity: 0.7, borderRadius: '3px' }} />
                    </div>
                    <div style={{ width: '36px', fontSize: '10px', color: '#9ca3af', textAlign: 'right' as const }}>{row.anterior > 0 ? row.anterior.toFixed(1) : '—'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '30px', fontSize: '9px', color: '#6b7280', flexShrink: 0 }}>Post</div>
                    <div style={{ flex: 1, height: '6px', backgroundColor: '#1f2937', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${postPct}%`, backgroundColor: barColor, borderRadius: '3px' }} />
                    </div>
                    <div style={{ width: '36px', fontSize: '10px', color: '#9ca3af', textAlign: 'right' as const }}>{row.posterior > 0 ? row.posterior.toFixed(1) : '—'}</div>
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
  reportData: SpineReportData | null;
  isLoading: boolean;
  error: string | null;
}

const FractureReportDialog: React.FC<FractureReportDialogProps> = ({ isOpen, onClose, reportData, isLoading, error }) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ backgroundColor: '#0d1117', border: '1px solid #1e2a3a', borderRadius: '12px', width: '100%', maxWidth: '960px', height: '96vh', maxHeight: '96vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e2a3a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'linear-gradient(135deg,#0d1117 0%,#111827 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'linear-gradient(135deg,rgba(239,68,68,0.3),rgba(239,68,68,0.1))', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🦴</div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#f3f4f6' }}>Fracture Detection Report</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px' }}>
                {reportData
                  ? `${formatName(reportData.metadata.PatientName)} · ${formatDate(reportData.metadata.StudyDate)} · ${reportData.metadata.StudyDescription}`
                  : 'Loading report…'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {reportData && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '20px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} />
                  {reportData.status.charAt(0).toUpperCase() + reportData.status.slice(1)}
                </div>
                {reportData.found_fracture && (
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '20px', padding: '3px 10px' }}>
                    ⚠️ Fracture: {reportData.fractured_vertebrae.join(', ')}
                  </div>
                )}
              </>
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
          {isLoading && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: '#87dbfc' }}>
              <div style={{ fontSize: '32px', animation: 'spin 1s linear infinite' }}>⟳</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Loading spine report…</div>
              <div style={{ fontSize: '12px', color: '#4b5563' }}>Fetching data from server</div>
            </div>
          )}
          {!isLoading && error && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <div style={{ fontSize: '32px' }}>⚠️</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#ef4444' }}>Failed to load report</div>
              <div style={{ fontSize: '12px', color: '#6b7280', maxWidth: '400px', textAlign: 'center' as const }}>{error}</div>
            </div>
          )}
          {!isLoading && !error && reportData && (
            <>
              {activeTab === 'overview'  && <OverviewTab data={reportData} />}
              {activeTab === 'vertebrae' && <VertebraeTab data={reportData} />}
              {activeTab === 'files'     && <ImagesTab reportData={reportData} />}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid #1e2a3a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backgroundColor: '#0a0e17' }}>
          <div style={{ fontSize: '10px', color: '#374151' }}>
            {reportData
              ? `Nivalonmedical AI · v${reportData.metadata.version} · ID: …${reportData.metadata.StudyID.slice(-10)}`
              : 'Nivalonmedical AI'}
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
