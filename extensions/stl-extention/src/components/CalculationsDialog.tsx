import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { SpineReportData } from './FractureReportDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface VertebraRow {
  name: string;
  ant: number;
  mid: number;
  post: number;
  volume: number;
  intensity: number;
  intensityMedian: number;
  fractured: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const FRACTURE_THRESHOLD  = 0.20;
const HIGH_RISK_THRESHOLD = 0.15;
const VERTEBRA_ORDER = ['T9', 'T10', 'T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function deriveVertebrae(results: Record<string, number>, fracturedVertebrae: string[]): VertebraRow[] {
  return VERTEBRA_ORDER
    .filter(name => results[`vertebrae_${name}_intensity`] !== undefined)
    .map(name => ({
      name,
      ant:            results[`vertebrae_${name}_height_anterior_mm`]  ?? 0,
      mid:            results[`vertebrae_${name}_height_middle_mm`]    ?? 0,
      post:           results[`vertebrae_${name}_height_posterior_mm`] ?? 0,
      volume:         results[`vertebrae_${name}_volume_ml`]            ?? 0,
      intensity:      results[`vertebrae_${name}_intensity`]            ?? 0,
      intensityMedian: results[`vertebrae_${name}_intensity_median`]   ?? 0,
      fractured:      fracturedVertebrae.includes(name),
    }));
}

function calcLWS(v: VertebraRow) {
  const vals = { ant: v.ant, mid: v.mid, post: v.post };
  const mx = Math.max(v.ant, v.mid, v.post);
  const mn = Math.min(v.ant, v.mid, v.post);
  const lws = mx > 0 ? (mx - mn) / mx : 0;
  const maxKey = (Object.entries(vals).find(([, val]) => val === mx)?.[0] ?? 'post') as 'ant' | 'mid' | 'post';
  const minKey = (Object.entries(vals).find(([, val]) => val === mn)?.[0] ?? 'ant') as 'ant' | 'mid' | 'post';
  return { lws, mx, mn, maxKey, minKey };
}

const HEIGHT_LABELS: Record<string, string> = { ant: 'Anterior', mid: 'Middle', post: 'Posterior' };

function lwsColor(lws: number, fractured?: boolean) {
  if (fractured) return '#ef4444';
  if (lws >= FRACTURE_THRESHOLD) return '#f97316';
  if (lws >= HIGH_RISK_THRESHOLD) return '#eab308';
  return '#22c55e';
}
function lwsStatus(lws: number, fractured?: boolean) {
  if (fractured) return 'Fracture';
  if (lws >= FRACTURE_THRESHOLD) return 'High Risk';
  if (lws >= HIGH_RISK_THRESHOLD) return 'Moderate';
  return 'Normal';
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------
const OverviewTab: React.FC<{ vertebrae: VertebraRow[]; lwsMax: number }> = ({ vertebrae, lwsMax }) => {
  const fractured = vertebrae.filter(v => v.fractured);
  const gaugePct = Math.min(100, (lwsMax / 0.35) * 100);
  const gaugeColor = lwsMax >= FRACTURE_THRESHOLD ? '#ef4444' : lwsMax >= HIGH_RISK_THRESHOLD ? '#f97316' : '#22c55e';

  const r = 70;
  const cx = 90, cy = 90;
  const circumference = Math.PI * r;
  const dashOffset = circumference * (1 - gaugePct / 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {[
          { label: 'Vertebrae Analyzed', value: `${vertebrae.length}`, sub: `${vertebrae[0]?.name ?? '?'} – ${vertebrae[vertebrae.length - 1]?.name ?? '?'}`, accent: '#87dbfc' },
          { label: 'Fractured', value: fractured.length > 0 ? fractured.map(v => v.name).join(', ') : 'None', sub: fractured.length > 0 ? 'Compression fracture' : 'No fractures detected', accent: fractured.length > 0 ? '#ef4444' : '#22c55e' },
          { label: 'Max LWS Score', value: `${(lwsMax * 100).toFixed(1)}%`, sub: `threshold ${(FRACTURE_THRESHOLD * 100).toFixed(0)}%`, accent: gaugeColor },
          { label: 'Fracture Threshold', value: `≥ ${(FRACTURE_THRESHOLD * 100).toFixed(0)}%`, sub: 'LWS classification rule', accent: '#a78bfa' },
        ].map(c => (
          <div key={c.label} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: '6px' }}>{c.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: c.accent, lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: '10px', color: '#4b5563', marginTop: '4px' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '200px' }}>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>LWS Max Score</div>
          <svg width="180" height="100" viewBox="0 0 180 100">
            <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#1f2937" strokeWidth="14" strokeLinecap="round" />
            <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={gaugeColor} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${circumference}`} strokeDashoffset={dashOffset} style={{ filter: `drop-shadow(0 0 6px ${gaugeColor})` }} />
            {[15, 20].map(pct => {
              const angle = Math.PI * (1 - pct / 35);
              const tx = cx + (r + 6) * Math.cos(angle - Math.PI);
              const ty = cy - (r + 6) * Math.sin(angle - Math.PI);
              return (
                <g key={pct}>
                  <circle cx={tx} cy={ty} r={3} fill={pct === 20 ? '#ef4444' : '#eab308'} />
                  <text x={tx} y={ty - 6} textAnchor="middle" fill={pct === 20 ? '#ef4444' : '#eab308'} fontSize="8">{pct}%</text>
                </g>
              );
            })}
            <text x={cx} y={cy - 6} textAnchor="middle" fill={gaugeColor} fontSize="22" fontWeight="800">{(lwsMax * 100).toFixed(0)}%</text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill="#6b7280" fontSize="9">LWS SCORE</text>
          </svg>
          <div style={{ marginTop: '4px', fontSize: '11px', fontWeight: 700, color: gaugeColor, backgroundColor: `${gaugeColor}20`, border: `1px solid ${gaugeColor}44`, borderRadius: '20px', padding: '3px 12px' }}>
            {lwsMax >= FRACTURE_THRESHOLD ? '⚠ ABOVE FRACTURE THRESHOLD' : lwsMax >= HIGH_RISK_THRESHOLD ? '⚠ HIGH RISK ZONE' : '✓ NORMAL RANGE'}
          </div>
        </div>

        <div style={{ flex: 1, backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '14px' }}>LWS Classification Scale</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { range: '0% – 14%',  label: 'Normal',    color: '#22c55e', desc: 'No deformity. Heights are symmetric.' },
              { range: '15% – 19%', label: 'Moderate',  color: '#eab308', desc: 'Mild asymmetry. Monitor closely.' },
              { range: '≥ 20%',     label: 'High Risk', color: '#f97316', desc: 'Significant wedge deformity. Fracture likely.' },
              { range: 'Confirmed', label: 'Fracture',  color: '#ef4444', desc: 'Clinical fracture confirmed by AI model.' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '72px', fontSize: '10px', fontWeight: 600, color: row.color, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{row.range}</div>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: row.color, flexShrink: 0 }} />
                <div style={{ fontSize: '12px', fontWeight: 600, color: row.color, width: '70px', flexShrink: 0 }}>{row.label}</div>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>{row.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '16px', padding: '10px 12px', backgroundColor: '#0d1117', borderRadius: '8px', border: '1px solid #1f2937', fontSize: '11px', color: '#9ca3af', lineHeight: '1.6' }}>
            <strong style={{ color: '#87dbfc' }}>Formula:</strong> LWS = (H<sub>max</sub> − H<sub>min</sub>) / H<sub>max</sub> &nbsp;·&nbsp; where H ∈ &#123;Anterior, Middle, Posterior&#125;
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '16px 20px' }}>
        <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '14px' }}>LWS Score — All Vertebrae</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {vertebrae.map(v => {
            const { lws } = calcLWS(v);
            const color = lwsColor(lws, v.fractured);
            const barPct = Math.min(100, (lws / 0.30) * 100);
            return (
              <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '28px', fontSize: '12px', fontWeight: 700, color: v.fractured ? '#ef4444' : '#87dbfc', flexShrink: 0 }}>{v.name}</div>
                <div style={{ flex: 1, height: '8px', backgroundColor: '#1f2937', borderRadius: '4px', overflow: 'hidden', position: 'relative' as const }}>
                  <div style={{ position: 'absolute', left: `${(0.15/0.30)*100}%`, top: 0, height: '100%', width: '1px', backgroundColor: '#eab308', opacity: 0.5 }} />
                  <div style={{ position: 'absolute', left: `${(0.20/0.30)*100}%`, top: 0, height: '100%', width: '1px', backgroundColor: '#ef4444', opacity: 0.7 }} />
                  <div style={{ height: '100%', width: `${barPct}%`, backgroundColor: color, borderRadius: '4px', boxShadow: v.fractured ? `0 0 8px ${color}` : 'none', transition: 'width 0.3s ease' }} />
                </div>
                <div style={{ width: '38px', fontSize: '12px', fontWeight: 700, color, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' }}>{(lws * 100).toFixed(1)}%</div>
                <div style={{ width: '64px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color, backgroundColor: `${color}20`, border: `1px solid ${color}44`, padding: '2px 7px', borderRadius: '20px' }}>{lwsStatus(lws, v.fractured)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: '10px', display: 'flex', gap: '16px' }}>
          <div style={{ fontSize: '10px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '1px', height: '10px', backgroundColor: '#eab308' }} /> 15% moderate threshold</div>
          <div style={{ fontSize: '10px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '1px', height: '10px', backgroundColor: '#ef4444' }} /> 20% fracture threshold</div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// LWS Breakdown Tab
// ---------------------------------------------------------------------------
const LWSTab: React.FC<{ vertebrae: VertebraRow[] }> = ({ vertebrae }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '14px 18px' }}>
      <div style={{ fontSize: '12px', color: '#87dbfc', fontWeight: 600, marginBottom: '6px' }}>LWS Formula</div>
      <div style={{ fontFamily: 'monospace', fontSize: '14px', color: '#e5e7eb', letterSpacing: '0.03em' }}>
        LWS = ( H<sub style={{ fontSize: '10px' }}>max</sub> − H<sub style={{ fontSize: '10px' }}>min</sub> ) / H<sub style={{ fontSize: '10px' }}>max</sub>
      </div>
      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>H ∈ &#123; Anterior height, Middle height, Posterior height &#125; in millimeters</div>
    </div>

    {vertebrae.map(v => {
      const { lws, mx, mn, maxKey, minKey } = calcLWS(v);
      const color = lwsColor(lws, v.fractured);
      const barPct = Math.min(100, (lws / 0.30) * 100);

      return (
        <div key={v.name} style={{ backgroundColor: v.fractured ? 'rgba(239,68,68,0.06)' : '#111827', border: `1px solid ${v.fractured ? 'rgba(239,68,68,0.3)' : '#1f2937'}`, borderRadius: '10px', padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: v.fractured ? '#ef4444' : '#87dbfc' }}>
              {v.name}
              {v.fractured && <span style={{ marginLeft: '8px', fontSize: '11px', backgroundColor: 'rgba(239,68,68,0.2)', color: '#ef4444', padding: '2px 8px', borderRadius: '4px' }}>⚠ FRACTURED</span>}
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, color, backgroundColor: `${color}20`, border: `1px solid ${color}44`, padding: '3px 10px', borderRadius: '20px' }}>{lwsStatus(lws, v.fractured)}</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: '12px', fontFamily: 'monospace', fontSize: '12px' }}>
            {(['ant', 'mid', 'post'] as const).map(key => {
              const val = v[key];
              const isMax = key === maxKey;
              const isMin = key === minKey;
              return (
                <div key={key} style={{ padding: '6px 10px', borderRadius: '6px', backgroundColor: isMax ? 'rgba(135,219,252,0.12)' : isMin ? 'rgba(251,191,36,0.12)' : '#0d1117', border: `1px solid ${isMax ? 'rgba(135,219,252,0.3)' : isMin ? 'rgba(251,191,36,0.3)' : '#1f2937'}`, textAlign: 'center' as const }}>
                  <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '2px' }}>{HEIGHT_LABELS[key]}</div>
                  <div style={{ fontWeight: 700, color: isMax ? '#87dbfc' : isMin ? '#fbbf24' : '#d1d5db' }}>{val.toFixed(2)} mm</div>
                  {(isMax || isMin) && <div style={{ fontSize: '9px', marginTop: '2px', color: isMax ? '#87dbfc' : '#fbbf24' }}>{isMax ? 'H_max' : 'H_min'}</div>}
                </div>
              );
            })}
            <div style={{ color: '#4b5563', fontSize: '16px', padding: '0 4px' }}>→</div>
            <div style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: '#0d1117', border: '1px solid #1f2937', fontSize: '12px', color: '#9ca3af' }}>
              <span style={{ color: '#87dbfc' }}>({mx.toFixed(2)}</span>
              <span style={{ color: '#6b7280' }}> − </span>
              <span style={{ color: '#fbbf24' }}>{mn.toFixed(2)}</span>
              <span style={{ color: '#6b7280' }}>) / </span>
              <span style={{ color: '#87dbfc' }}>{mx.toFixed(2)}</span>
            </div>
            <div style={{ color: '#4b5563', fontSize: '16px', padding: '0 4px' }}>→</div>
            <div style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: '#0d1117', border: '1px solid #1f2937', fontSize: '12px', color: '#9ca3af' }}>
              {(mx - mn).toFixed(2)} / {mx.toFixed(2)}
            </div>
            <div style={{ color: '#4b5563', fontSize: '16px', padding: '0 4px' }}>= </div>
            <div style={{ padding: '6px 14px', borderRadius: '6px', backgroundColor: `${color}18`, border: `1px solid ${color}55`, fontSize: '14px', fontWeight: 800, color, boxShadow: v.fractured ? `0 0 12px ${color}44` : 'none' }}>
              {(lws * 100).toFixed(2)}%
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, height: '6px', backgroundColor: '#1f2937', borderRadius: '3px', overflow: 'hidden', position: 'relative' as const }}>
              <div style={{ position: 'absolute', left: `${(FRACTURE_THRESHOLD/0.30)*100}%`, top: 0, height: '100%', width: '1px', backgroundColor: '#ef4444', opacity: 0.6 }} />
              <div style={{ height: '100%', width: `${barPct}%`, backgroundColor: color, borderRadius: '3px', boxShadow: v.fractured ? `0 0 8px ${color}` : 'none' }} />
            </div>
            <div style={{ fontSize: '10px', color: '#4b5563', flexShrink: 0 }}>
              {v.fractured ? '↑ above 20% threshold' : lws >= HIGH_RISK_THRESHOLD ? 'approaching threshold' : 'within normal range'}
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Heights Tab
// ---------------------------------------------------------------------------
const HeightsTab: React.FC<{ vertebrae: VertebraRow[] }> = ({ vertebrae }) => {
  const maxH = Math.max(...vertebrae.flatMap(v => [v.ant, v.mid, v.post]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '11px', color: '#6b7280' }}>All vertebral body heights measured in millimeters (mm). Three reference points: Anterior (front), Middle (centre), Posterior (back).</div>

      <div style={{ overflowX: 'auto' as const, borderRadius: '10px', border: '1px solid #1f2937' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
          <thead>
            <tr style={{ backgroundColor: '#0d1117' }}>
              {['Vertebra', 'Anterior (mm)', 'Middle (mm)', 'Posterior (mm)', 'Min', 'Max', 'Diff (mm)', 'LWS'].map((h, i) => (
                <th key={h} style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: '1px solid #1f2937', textAlign: i === 0 ? 'left' as const : 'center' as const, whiteSpace: 'nowrap' as const }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vertebrae.map((v, ri) => {
              const { lws, mx, mn } = calcLWS(v);
              const color = lwsColor(lws, v.fractured);
              const heights = [v.ant, v.mid, v.post];
              const rowBg = v.fractured ? 'rgba(239,68,68,0.07)' : ri % 2 === 0 ? '#111827' : '#0d1117';
              return (
                <tr key={v.name} style={{ backgroundColor: rowBg }}>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: v.fractured ? '#ef4444' : '#87dbfc', fontSize: '13px', borderBottom: '1px solid #1a1f2e' }}>
                    {v.name}{v.fractured && <span style={{ marginLeft: '6px', fontSize: '9px', backgroundColor: 'rgba(239,68,68,0.2)', color: '#ef4444', padding: '1px 5px', borderRadius: '3px' }}>⚠</span>}
                  </td>
                  {heights.map((h, hi) => {
                    const relBrightness = (h / maxH);
                    const isMax = h === mx;
                    const isMin = h === mn;
                    return (
                      <td key={hi} style={{ padding: '12px 14px', textAlign: 'center' as const, borderBottom: '1px solid #1a1f2e' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: isMax ? 'rgba(135,219,252,0.15)' : isMin ? 'rgba(251,191,36,0.12)' : 'transparent', color: isMax ? '#87dbfc' : isMin ? '#fbbf24' : `rgba(255,255,255,${0.4 + relBrightness * 0.6})`, border: isMax ? '1px solid rgba(135,219,252,0.3)' : isMin ? '1px solid rgba(251,191,36,0.25)' : '1px solid transparent', minWidth: '60px' }}>
                          {h > 0 ? h.toFixed(2) : '—'}
                          {isMax && <span style={{ fontSize: '8px', marginLeft: '3px', color: '#87dbfc' }}>▲</span>}
                          {isMin && <span style={{ fontSize: '8px', marginLeft: '3px', color: '#fbbf24' }}>▼</span>}
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ padding: '12px 14px', textAlign: 'center' as const, fontSize: '12px', color: '#fbbf24', borderBottom: '1px solid #1a1f2e', fontVariantNumeric: 'tabular-nums' as const }}>{mn.toFixed(2)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' as const, fontSize: '12px', color: '#87dbfc', borderBottom: '1px solid #1a1f2e', fontVariantNumeric: 'tabular-nums' as const }}>{mx.toFixed(2)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' as const, fontSize: '12px', color: '#d1d5db', borderBottom: '1px solid #1a1f2e', fontVariantNumeric: 'tabular-nums' as const }}>{(mx - mn).toFixed(2)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' as const, borderBottom: '1px solid #1a1f2e' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color, backgroundColor: `${color}18`, border: `1px solid ${color}44`, padding: '3px 9px', borderRadius: '20px' }}>{(lws * 100).toFixed(1)}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '16px 18px' }}>
        <div style={{ fontSize: '11px', color: '#87dbfc', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '14px' }}>Vertebral Body Shape (Anterior vs Posterior)</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
          {vertebrae.map(v => {
            const { lws } = calcLWS(v);
            const color = lwsColor(lws, v.fractured);
            const SCALE = 2.2;
            const antH = v.ant * SCALE;
            const postH = v.post * SCALE;
            const W = 36, PAD = 6;
            const maxRender = Math.max(antH, postH) + PAD * 2;
            const pts = [[PAD, maxRender],[PAD + W, maxRender],[PAD + W, maxRender - postH],[PAD, maxRender - antH]].map(p => p.join(',')).join(' ');
            return (
              <div key={v.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <svg width={W + PAD * 2} height={maxRender} style={{ display: 'block' }}>
                  <polygon points={pts} fill={`${color}28`} stroke={color} strokeWidth="1.5" />
                  <text x={PAD} y={maxRender - antH - 3} fontSize="7" fill="#fbbf24" textAnchor="middle">{v.ant.toFixed(0)}</text>
                  <text x={PAD + W} y={maxRender - postH - 3} fontSize="7" fill="#87dbfc" textAnchor="middle">{v.post.toFixed(0)}</text>
                </svg>
                <div style={{ fontSize: '11px', fontWeight: 700, color: v.fractured ? '#ef4444' : '#87dbfc' }}>{v.name}</div>
                <div style={{ fontSize: '9px', color }}>LWS {(lws * 100).toFixed(0)}%</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: '10px', display: 'flex', gap: '16px', fontSize: '10px', color: '#4b5563' }}>
          <span style={{ color: '#fbbf24' }}>■</span> Anterior height
          <span style={{ color: '#87dbfc' }}>■</span> Posterior height
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Density & Volume Tab
// ---------------------------------------------------------------------------
const DensityTab: React.FC<{ vertebrae: VertebraRow[] }> = ({ vertebrae }) => {
  const maxVol = Math.max(...vertebrae.map(v => v.volume));
  const maxHU  = Math.max(...vertebrae.map(v => v.intensity));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '11px', color: '#6b7280' }}>Bone mineral density measured in Hounsfield Units (HU). Normal trabecular bone: 100–300 HU. Volume measured in millilitres (mL).</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[
          { label: 'Avg HU (Mean)',   value: (vertebrae.reduce((s, v) => s + v.intensity, 0) / vertebrae.length).toFixed(1), sub: 'Hounsfield Units', accent: '#87dbfc' },
          { label: 'Avg HU (Median)', value: (vertebrae.reduce((s, v) => s + v.intensityMedian, 0) / vertebrae.length).toFixed(1), sub: 'Hounsfield Units', accent: '#a78bfa' },
          { label: 'Total Volume',    value: vertebrae.reduce((s, v) => s + v.volume, 0).toFixed(1) + ' mL', sub: 'All vertebrae combined', accent: '#34d399' },
        ].map(c => (
          <div key={c.label} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: '6px' }}>{c.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: c.accent }}>{c.value}</div>
            <div style={{ fontSize: '10px', color: '#4b5563', marginTop: '3px' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '16px 18px' }}>
        <div style={{ fontSize: '11px', color: '#87dbfc', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '14px' }}>Per-Vertebra Density & Volume</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {vertebrae.map(v => {
            const { lws } = calcLWS(v);
            const fracColor = lwsColor(lws, v.fractured);
            const volPct = (v.volume / maxVol) * 100;
            const huPct  = (v.intensity / maxHU) * 100;
            const huColor = v.intensity > 250 ? '#ef4444' : v.intensity > 150 ? '#22c55e' : '#87dbfc';
            return (
              <div key={v.name} style={{ backgroundColor: v.fractured ? 'rgba(239,68,68,0.05)' : '#0d1117', borderRadius: '8px', border: `1px solid ${v.fractured ? 'rgba(239,68,68,0.2)' : '#1f2937'}`, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '32px', fontSize: '13px', fontWeight: 800, color: v.fractured ? '#ef4444' : '#87dbfc', flexShrink: 0 }}>{v.name}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#4b5563', marginBottom: '3px' }}>
                    <span>Density (HU)</span><span style={{ color: huColor, fontWeight: 600 }}>{v.intensity.toFixed(1)} HU</span>
                  </div>
                  <div style={{ height: '7px', backgroundColor: '#1f2937', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${huPct}%`, backgroundColor: huColor, borderRadius: '4px' }} />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#4b5563', marginBottom: '3px' }}>
                    <span>Volume (mL)</span><span style={{ color: '#34d399', fontWeight: 600 }}>{v.volume.toFixed(1)} mL</span>
                  </div>
                  <div style={{ height: '7px', backgroundColor: '#1f2937', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${volPct}%`, backgroundColor: '#34d399', borderRadius: '4px' }} />
                  </div>
                </div>
                <div style={{ flexShrink: 0, width: '58px', textAlign: 'right' as const }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: fracColor, backgroundColor: `${fracColor}18`, border: `1px solid ${fracColor}40`, padding: '2px 7px', borderRadius: '20px' }}>{(lws * 100).toFixed(1)}%</span>
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
type MainTabId = 'overview' | 'lws' | 'heights' | 'density';

const TABS: { id: MainTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'lws',      label: 'LWS Breakdown' },
  { id: 'heights',  label: 'Height Analysis' },
  { id: 'density',  label: 'Density & Volume' },
];

export interface CalculationsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reportData: SpineReportData | null;
  isLoading: boolean;
}

const CalculationsDialog: React.FC<CalculationsDialogProps> = ({ isOpen, onClose, reportData, isLoading }) => {
  const [activeTab, setActiveTab] = useState<MainTabId>('overview');
  if (!isOpen) return null;

  const vertebrae = reportData ? deriveVertebrae(reportData.results, reportData.fractured_vertebrae) : [];
  const lwsMax = reportData?.results?.LWS_max ?? 0;
  const fractured = vertebrae.filter(v => v.fractured);

  return ReactDOM.createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ backgroundColor: '#0d1117', border: '1px solid #1e2a3a', borderRadius: '12px', width: '100%', maxWidth: '900px', height: '88vh', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e2a3a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'linear-gradient(135deg,#0d1117 0%,#111827 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'linear-gradient(135deg,rgba(135,219,252,0.25),rgba(135,219,252,0.08))', border: '1px solid rgba(135,219,252,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📐</div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#f3f4f6' }}>Vertebral Calculations</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px' }}>LWS formula · Height analysis · Density &amp; Volume</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {reportData && fractured.length > 0 && (
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '20px', padding: '3px 10px' }}>
                ⚠ {fractured.map(v => v.name).join(', ')} Fracture{fractured.length > 1 ? 's' : ''} Detected
              </div>
            )}
            <button onClick={onClose} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #1f2937', backgroundColor: '#1a2030', color: '#9ca3af', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ padding: '0 20px', borderBottom: '1px solid #1e2a3a', display: 'flex', gap: '4px', flexShrink: 0, backgroundColor: '#0d1117' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{ padding: '8px 18px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const, borderRadius: '6px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', backgroundColor: activeTab === t.id ? 'rgba(135,219,252,0.15)' : 'transparent', color: activeTab === t.id ? '#87dbfc' : '#6b7280', borderBottom: activeTab === t.id ? '2px solid #87dbfc' : '2px solid transparent' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', minHeight: 0 }}>
          {isLoading && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: '#87dbfc', height: '100%' }}>
              <div style={{ fontSize: '32px' }}>⟳</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Loading data…</div>
            </div>
          )}
          {!isLoading && reportData && vertebrae.length > 0 && (
            <>
              {activeTab === 'overview' && <OverviewTab vertebrae={vertebrae} lwsMax={lwsMax} />}
              {activeTab === 'lws'      && <LWSTab vertebrae={vertebrae} />}
              {activeTab === 'heights'  && <HeightsTab vertebrae={vertebrae} />}
              {activeTab === 'density'  && <DensityTab vertebrae={vertebrae} />}
            </>
          )}
          {!isLoading && (!reportData || vertebrae.length === 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#4b5563', gap: '12px' }}>
              <div style={{ fontSize: '32px' }}>📊</div>
              <div>No vertebrae data available</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid #1e2a3a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backgroundColor: '#0a0e17' }}>
          <div style={{ fontSize: '10px', color: '#374151' }}>
            LWS = Loss of Wedge Shape &nbsp;·&nbsp; Formula: (H_max − H_min) / H_max &nbsp;·&nbsp; Nivalonmedical AI {reportData ? `v${reportData.metadata.version}` : ''}
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

export default CalculationsDialog;
