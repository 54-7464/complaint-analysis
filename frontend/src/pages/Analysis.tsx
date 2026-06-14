import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import DataSourcePicker, { DsItem } from '../components/DataSourcePicker';
import { Table, Button, Select, Card, Space, message, Tag, Checkbox, Divider, Collapse, Statistic, Row, Col, Input, Upload } from 'antd';
import { BarChartOutlined, PlusOutlined, ArrowRightOutlined, CloseCircleOutlined, FileTextOutlined, NumberOutlined, TagsOutlined, UploadOutlined, InboxOutlined } from '@ant-design/icons';
import api from '../services/api';

const COLORS = {
  bg: '#f6f7f9',
  cardBg: '#ffffff',
  zoneRow: '#7986cb',
  zoneRowBg: '#f0f1fa',
  zoneRowBorder: '#c5cae9',
  zoneCol: '#66bb6a',
  zoneColBg: '#f1f8f4',
  zoneColBorder: '#c8e6c9',
  zoneLayer: '#8d6e63',
  zoneLayerBg: '#faf6f3',
  zoneLayerBorder: '#d7ccc8',
  varOrdinary: '#546e7a',
  varOrdinaryBg: '#f5f7f9',
  varBinary: '#00897b',
  varBinaryBg: '#f2faf9',
  accent: '#5c6bc0',
  accentHover: '#3f51b5',
  text: '#37474f',
  textSec: '#78909c',
  border: '#e8ecf1',
  divider: '#f0f2f5',
  tableHeader: '#f4f6f8',
  tableBorder: '#e8ecf1',
  statCard: '#f8f9fb',
  chiSig: '#e8f5e9',
  chiNotSig: '#fffde7',
  hoverBg: '#f0f2f5',
  dropHint: '#b0bec5',
};

interface ColumnInfo { columns: string[]; label_names: string[]; job_target_field: string; }
interface VarDef { key: string; name: string; column: string; vtype: 'categorical' | 'multiple_choice'; children: string[]; }

const styles = `
.pro-analytics { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: ${COLORS.text}; }
.pro-toolbar { display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: ${COLORS.cardBg}; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.pro-toolbar-label { font-size: 13px; font-weight: 600; color: ${COLORS.textSec}; letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap; }
.pro-grid { display: grid; grid-template-columns: 260px 1fr 200px; gap: 20px; margin-bottom: 20px; }
.pro-card { background: ${COLORS.cardBg}; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); overflow: hidden; }
.pro-card-header { padding: 14px 16px; font-size: 13px; font-weight: 600; color: ${COLORS.text}; border-bottom: 1px solid ${COLORS.border}; display: flex; align-items: center; gap: 8px; }
.pro-card-body { padding: 14px 16px; }

.var-section-title { font-size: 11px; font-weight: 700; color: ${COLORS.textSec}; letter-spacing: 1px; margin-bottom: 10px; margin-top: 14px; }
.var-section-title:first-child { margin-top: 0; }
.var-item { display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-radius: 6px; margin-bottom: 4px; transition: background 0.15s; cursor: default; }
.var-item:hover { background: ${COLORS.hoverBg}; }
.var-item-label { display: flex; align-items: center; gap: 8px; font-size: 13px; flex: 1; min-width: 0; }
.var-item-label .var-icon { width: 14px; height: 14px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.var-item-label > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.var-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.15s; }
.var-item:hover .var-actions { opacity: 1; }
.var-btn { width: 40px; height: 28px; border-radius: 4px; border: 1px solid ${COLORS.border}; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; transition: all 0.15s; color: ${COLORS.textSec}; white-space: nowrap; }
.var-btn.row-btn:hover { background: ${COLORS.zoneRow}; color: #fff; border-color: ${COLORS.zoneRow}; }
.var-btn.col-btn:hover { background: ${COLORS.zoneCol}; color: #fff; border-color: ${COLORS.zoneCol}; }
.var-btn.layer-btn:hover { background: ${COLORS.zoneLayer}; color: #fff; border-color: ${COLORS.zoneLayer}; }

.zone { min-height: 92px; border-radius: 8px; border: 2px dashed; padding: 14px; transition: all 0.2s; }
.zone-row { border-color: ${COLORS.zoneRowBorder}; background: ${COLORS.zoneRowBg}; }
.zone-col { border-color: ${COLORS.zoneColBorder}; background: ${COLORS.zoneColBg}; }
.zone-layer { border-color: ${COLORS.zoneLayerBorder}; background: ${COLORS.zoneLayerBg}; }
.zone-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.zone-title { font-size: 13px; font-weight: 700; }
.zone-row .zone-title { color: ${COLORS.zoneRow}; }
.zone-col .zone-title { color: ${COLORS.zoneCol}; }
.zone-layer .zone-title { color: ${COLORS.zoneLayer}; }
.zone-badge { font-size: 11px; padding: 1px 8px; border-radius: 10px; font-weight: 600; }
.zone-row .zone-badge { background: ${COLORS.zoneRow}; color: #fff; }
.zone-col .zone-badge { background: ${COLORS.zoneCol}; color: #fff; }
.zone-layer .zone-badge { background: ${COLORS.zoneLayer}; color: #fff; }
.zone-empty { text-align: center; padding: 18px 0; font-size: 13px; color: ${COLORS.dropHint}; }

.zone-clear-btn { background: none; border: none; color: ${COLORS.textSec}; cursor: pointer; font-size: 11px; padding: 2px 6px; border-radius: 3px; margin-left: auto; white-space: nowrap; }
.zone:hover .zone-clear-btn, .zone-header .zone-clear-btn { display: inline-block; }
.zone-clear-btn:hover { background: rgba(0,0,0,0.06); color: #e53935; }

.zone-var-tag { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 6px; font-size: 13px; margin: 0 6px 6px 0; cursor: default; transition: all 0.15s; }
.zone-row .zone-var-tag { background: ${COLORS.zoneRow}; color: #fff; }
.zone-col .zone-var-tag { background: ${COLORS.zoneCol}; color: #fff; }
.zone-layer .zone-var-tag { background: ${COLORS.zoneLayer}; color: #fff; }
.zone-var-tag .zone-var-remove { cursor: pointer; opacity: 0.7; font-size: 11px; display: flex; align-items: center; }
.zone-var-tag .zone-var-remove:hover { opacity: 1; }
.zone-var-mc-note { font-size: 10px; opacity: 0.8; }

/* zones horizontal layout */
.zones-flex { display: flex; gap: 14px; flex-wrap: wrap; }
.zones-flex .zone { flex: 1; min-width: 180px; }

.stats-section { margin-bottom: 16px; }
.stats-item { display: flex; align-items: center; padding: 8px 0; font-size: 13px; cursor: pointer; color: ${COLORS.text}; border-bottom: 1px solid ${COLORS.divider}; }
.stats-item:hover { color: ${COLORS.accent}; }
.stats-check { width: 16px; height: 16px; border-radius: 3px; border: 2px solid ${COLORS.border}; margin-right: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s; font-size: 11px; }
.stats-check.active { background: ${COLORS.accent}; border-color: ${COLORS.accent}; color: #fff; }
.run-btn { width: 100%; padding: 10px 0; border-radius: 6px; border: none; background: ${COLORS.accent}; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 8px; }
.run-btn:hover { background: ${COLORS.accentHover}; }
.run-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.result-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
.result-stat-card { background: ${COLORS.statCard}; border-radius: 8px; padding: 16px; border: 1px solid ${COLORS.border}; }
.result-stat-value { font-size: 28px; font-weight: 700; color: ${COLORS.accent}; }
.result-stat-label { font-size: 12px; color: ${COLORS.textSec}; margin-top: 2px; }
.result-narrative { background: ${COLORS.cardBg}; border-radius: 8px; border: 1px solid ${COLORS.border}; padding: 16px 20px; margin-bottom: 20px; }
.result-narrative-title { font-size: 13px; font-weight: 600; margin-bottom: 10px; color: ${COLORS.textSec}; }
.result-narrative-item { font-size: 13px; line-height: 1.8; color: ${COLORS.text}; margin-bottom: 4px; }
.result-table-card { background: ${COLORS.cardBg}; border-radius: 8px; border: 1px solid ${COLORS.border}; margin-bottom: 20px; }
.result-table-header { padding: 14px 18px; font-size: 13px; font-weight: 600; border-bottom: 1px solid ${COLORS.border}; }
.result-table-body { padding: 4px; overflow-x: auto; overflow-y: visible; min-height: 60px; }
.result-table-body::-webkit-scrollbar { height: 10px; }
.result-table-body::-webkit-scrollbar-track { background: #f5f5f5; border-radius: 4px; }
.result-table-body::-webkit-scrollbar-thumb { background: #c0c4cc; border-radius: 4px; }
.result-table-body::-webkit-scrollbar-thumb:hover { background: #909399; }

.pro-table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 13px; }
.pro-table th { background: ${COLORS.tableHeader}; padding: 10px 14px; text-align: center; font-weight: 600; font-size: 12px; color: ${COLORS.textSec}; border: 1px solid ${COLORS.tableBorder}; letter-spacing: 0.3px; white-space: nowrap; }
.pro-table td { padding: 8px 14px; text-align: center; border: 1px solid ${COLORS.tableBorder}; color: ${COLORS.text}; }
.pro-table tr:hover td { background: #f8f9fb; }
.pro-table .row-label { text-align: left; font-weight: 500; background: ${COLORS.tableHeader}; }
.pro-table .summary-row td { background: ${COLORS.tableHeader}; font-weight: 700; }

.chi-result { margin-top: 12px; padding: 12px 16px; border-radius: 6px; font-size: 13px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.chi-result.sig { background: ${COLORS.chiSig}; border: 1px solid #c8e6c9; }
.chi-result.not-sig { background: ${COLORS.chiNotSig}; border: 1px solid #fff9c4; }
.chi-stat { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 13px; font-weight: 600; }

.empty-state { text-align: center; padding: 80px 20px; }
.empty-state-icon { font-size: 48px; color: ${COLORS.border}; margin-bottom: 16px; }
.empty-state-title { font-size: 18px; color: ${COLORS.text}; font-weight: 600; margin-bottom: 8px; }
.empty-state-desc { font-size: 13px; color: ${COLORS.textSec}; line-height: 1.8; }

/* Tooltip — JS positioned */
.formula-panel { margin: 8px 12px 12px; padding: 10px 14px; background: #f8f9fb; border: 1px solid #e8ecf1; border-radius: 6px; min-height: 36px; display: flex; align-items: center; }
.formula-panel-content { font-size: 13px; color: #37474f; display: flex; align-items: center; gap: 8px; }
.formula-panel-text { font-family: Consolas, monospace; font-size: 12px; color: #37474f; }
.formula-panel-hint { font-size: 12px; color: #b0bec5; font-style: italic; }

/* 0-1 tag display */
.pro-table td.has-tooltip { cursor: pointer; position: relative; }
.pro-table td.has-tooltip:active { background: #eef0fa; }

.pro-table td.clickable-cell { cursor: pointer; transition: background 0.15s; }
.pro-table td.clickable-cell:hover { background: #e8eaf6; }

.mc-editor { background: ${COLORS.cardBg}; border-radius: 8px; border: 1px solid ${COLORS.border}; margin-bottom: 16px; overflow: hidden; }
.mc-editor-header { padding: 12px 16px; font-size: 12px; font-weight: 600; color: ${COLORS.textSec}; background: ${COLORS.tableHeader}; display: flex; align-items: center; gap: 8px; user-select: none; }
.mc-editor-body { padding: 14px 16px; display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.mc-editor-body .field-group { display: flex; flex-direction: column; gap: 4px; }
.mc-editor-body .field-group label { font-size: 12px; color: ${COLORS.textSec}; font-weight: 500; }
`;

// ========================== Component ==========================

export default function Analysis() {
  const { id } = useParams();
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [colInfo, setColInfo] = useState<ColumnInfo | null>(null);
  const [rowVars, setRowVars] = useState<VarDef[]>([]);
  const [colVars, setColVars] = useState<VarDef[]>([]);
  const [layerVars, setLayerVars] = useState<VarDef[]>([]);
  const [stats, setStats] = useState<string[]>(['frequency', 'row_pct']);
  const [mcSetName, setMcSetName] = useState('');
  const [mcSetCols, setMcSetCols] = useState<string[]>([]);
  const [mcTargetZone, setMcTargetZone] = useState<'row' | 'col' | 'layer'>('row');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [uploadedDs, setUploadedDs] = useState<DsItem | null>(null);
  const [, setUploading] = useState(false);

  useEffect(() => {
    api.get(`/labeling/jobs/${id}`).then(r => {
      if (Array.isArray(r.data)) setJobs(r.data.filter((j: any) => j.status === 'done'));
    }).catch(() => {});
    const saved = localStorage.getItem(`spss_${id}`);
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (p.selectedJob) setSelectedJob(p.selectedJob);
        if (p.rowVars) setRowVars(p.rowVars);
        if (p.colVars) setColVars(p.colVars);
        if (p.layerVars) setLayerVars(p.layerVars);
        if (p.stats) setStats(p.stats);
      } catch {}
    }
  }, [id]);

  useEffect(() => {
    if (uploadedDs) {
      setColInfo({ columns: uploadedDs.columns, label_names: uploadedDs.label_names, job_target_field: '' });
    } else if (selectedJob) {
      api.get(`/analysis/columns/${selectedJob}`).then(r => setColInfo(r.data)).catch(() => {});
    }
  }, [selectedJob, uploadedDs]);

  const saveState = (updates: any) => {
    localStorage.setItem(`spss_${id}`, JSON.stringify({ selectedJob, rowVars, colVars, layerVars, stats, ...updates }));
  };

  const addSingleVar = (zone: 'row' | 'col' | 'layer', colName: string) => {
    const def: VarDef = { key: `${zone}_${colName}_${Date.now()}`, name: colName, column: colName, vtype: 'categorical', children: [] };
    if (zone === 'row') { const n = [...rowVars, def]; setRowVars(n); saveState({ rowVars: n }); }
    else if (zone === 'col') { const n = [...colVars, def]; setColVars(n); saveState({ colVars: n }); }
    else { const n = [...layerVars, def]; setLayerVars(n); saveState({ layerVars: n }); }
  };

  const addMCSet = () => {
    if (!mcSetName.trim() || mcSetCols.length === 0) { message.warning('请输入名称并选择至少一个子项'); return; }
    const def: VarDef = { key: `${mcTargetZone}_mc_${Date.now()}`, name: mcSetName, column: mcSetCols[0], vtype: 'multiple_choice', children: [...mcSetCols] };
    if (mcTargetZone === 'row') { const n = [...rowVars, def]; setRowVars(n); saveState({ rowVars: n }); }
    else if (mcTargetZone === 'col') { const n = [...colVars, def]; setColVars(n); saveState({ colVars: n }); }
    else { const n = [...layerVars, def]; setLayerVars(n); saveState({ layerVars: n }); }
    setMcSetName(''); setMcSetCols([]); message.success(`已添加多选题集「${mcSetName}」`);
  };

  const removeVar = (zone: 'row' | 'col' | 'layer', key: string) => {
    if (zone === 'row') { const n = rowVars.filter(v => v.key !== key); setRowVars(n); saveState({ rowVars: n }); }
    else if (zone === 'col') { const n = colVars.filter(v => v.key !== key); setColVars(n); saveState({ colVars: n }); }
    else { const n = layerVars.filter(v => v.key !== key); setLayerVars(n); saveState({ layerVars: n }); }
  };

  const runAnalysis = async () => {
    if (!selectedJob && !uploadedDs) { message.warning('请选择标注任务或上传已标注 Excel'); return; }
    if (rowVars.length === 0 && colVars.length === 0) { message.warning('请至少添加一个行变量或列变量'); return; }
    setLoading(true);
    try {
      const payload: any = {
        row_vars: rowVars.map(v => ({ name: v.name, column: v.column, vtype: v.vtype, children: v.children })),
        col_vars: colVars.map(v => ({ name: v.name, column: v.column, vtype: v.vtype, children: v.children })),
        layer_vars: layerVars.map(v => ({ name: v.name, column: v.column, vtype: v.vtype, children: v.children })),
        stats,
      };
      if (uploadedDs) payload.data_source_id = uploadedDs.id;
      else payload.job_id = selectedJob;
      const res = await api.post('/analysis/run', payload);
      setResult(res.data);
    } catch (err: any) { message.error(err.response?.data?.detail || '分析失败'); }
    finally { setLoading(false); }
  };

  const toggleStat = (s: string) => {
    const next = stats.includes(s) ? stats.filter(x => x !== s) : [...stats, s];
    setStats(next); saveState({ stats: next });
  };

  const statOptions = [
    { key: 'frequency', label: '频数' }, { key: 'row_pct', label: '行百分比' },
    { key: 'col_pct', label: '列百分比' }, { key: 'total_pct', label: '总计百分比' },
    { key: 'chi_square', label: '卡方检验' },
  ];

  const allColumns = colInfo?.columns || [];
  const labelNames = colInfo?.label_names || [];
  const ordinaryCols = allColumns.filter(c => !labelNames.includes(c) && c !== 'AI标签' && c !== 'AI思考过程');
  const binaryCols = labelNames;

  // ====== 计算规则面板 =====

  const fmtNum = (v: any) => (typeof v === 'number' ? v.toLocaleString() : (v ?? ''));

  const [infoText, setInfoText] = useState('');
  const [infoKey, setInfoKey] = useState('');

  const getFreqFormula = (colHdr: string, row: any) => {
    const vn = row['变量'] || ''; const nc = row['频数'] ?? '';
    if (colHdr === '频数') return '标签「' + vn + '」为 1 的记录条数 = ' + nc;
    if (colHdr === '涉及比例(%)') return '条数 ' + nc + ' ÷ 总记录数 × 100';
    return '';
  };

  const getCrossFormula = (colHdr: string, row: any) => {
    const variable = row['变量'] || ''; const cat = row['类别'] || '';
    const clean = colHdr.replace(/\n.*/, '').trim();
    if (colHdr === '行总计') return '「' + variable + '」' + cat + ' = 1 的记录总数 = ' + row['行总计'];
    if (colHdr.includes('频数')) return '「' + variable + '」' + cat + ' = 1 且「' + clean + '」= 1 的交集条数';
    if (colHdr.includes('行%')) return '交集条数 ÷「' + variable + '」' + cat + ' 的行总计 × 100';
    if (colHdr.includes('列%')) return '交集条数 ÷「' + clean + '」的列总计 × 100';
    if (colHdr.includes('总%')) return '交集条数 ÷ 总记录数 × 100';
    return '';
  };

  const handleCellClick = (colHdr: string, row: any, tableType: string) => {
    const key = tableType + '|' + (row['变量'] || row['类别'] || '') + '|' + colHdr;
    const formula = tableType === 'freq' ? getFreqFormula(colHdr, row) : getCrossFormula(colHdr, row);
    if (formula) { setInfoText(formula); setInfoKey(key); }
  };

  // ====== 渲染 ======

  const renderVarItem = (colName: string, isBinary: boolean) => (
    <div className="var-item" key={colName}>
      <div className="var-item-label">
        <span className="var-icon">
          {isBinary ? <TagsOutlined style={{ color: COLORS.varBinary, fontSize: 14 }} /> : <FileTextOutlined style={{ color: COLORS.varOrdinary, fontSize: 14 }} />}
        </span>
        <span title={colName}>{colName}</span>
      </div>
      <div className="var-actions">
        <button className="var-btn row-btn" onClick={() => addSingleVar('row', colName)}>行</button>
        <button className="var-btn col-btn" onClick={() => addSingleVar('col', colName)}>列</button>
        <button className="var-btn layer-btn" onClick={() => addSingleVar('layer', colName)}>分层</button>
      </div>
    </div>
  );

  const renderVarTags = (vars: VarDef[], zone: 'row' | 'col' | 'layer') => (
    <div>
      {vars.map(v => (
        <span className="zone-var-tag" key={v.key}>
          {v.name}
          {v.vtype === 'multiple_choice' && <span className="zone-var-mc-note">·{v.children.length}项</span>}
          <span className="zone-var-remove" onClick={() => removeVar(zone, v.key)}><CloseCircleOutlined /></span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="pro-analytics">
      <style>{styles}</style>

      <div className="pro-toolbar" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
        <span className="pro-toolbar-label">数据源</span>
        <div style={{ flex: 1, minWidth: 320, maxWidth: 480 }}>
          <DataSourcePicker
            projectId={id!}
            upstreamOptions={jobs.map((j: any) => ({ value: j.id, label: `任务 #${j.id} — ${j.target_field}`, row_count: j.total_rows }))}
            upstreamLabel="已完成标注任务"
            uploadEndpoint={`/upload/labeled-excel/${id}`}
            onSelectUpstream={v => { setSelectedJob(v); setUploadedDs(null); setColInfo(null); setResult(null); saveState({ selectedJob: v, uploadedDs: null }); }}
            onSelectUploaded={(ds) => {
              if (!ds) { setUploadedDs(null); setColInfo(null); return; }
              setUploadedDs(ds); setSelectedJob(null);
              setColInfo({ columns: ds.columns, label_names: ds.label_names, job_target_field: '' });
              setResult(null); setRowVars([]); setColVars([]); setLayerVars([]);
              saveState({ selectedJob: null, uploadedDs: ds });
            }}
            selectedUpstreamId={uploadedDs ? null : selectedJob}
            selectedUploaded={uploadedDs as any}
            modeLabels={{ upstream: '前期标注', upload: '本地上传' }}
          />
        </div>
        {colInfo && (
          <Tag style={{ background: COLORS.statCard, border: 'none', color: COLORS.textSec, padding: '4px 12px', fontSize: 12 }}>
            {colInfo.columns.length} 列 · {colInfo.label_names?.length || 0} 标签
          </Tag>
        )}
      </div>

      {!selectedJob && !uploadedDs && (
        <div className="pro-card">
          <div className="empty-state">
            <div className="empty-state-icon"><BarChartOutlined /></div>
            <div className="empty-state-title">数据分析</div>
            <div className="empty-state-desc">选择一个已完成的标注任务 → 从变量池放入行/列 → 运行分析</div>
          </div>
        </div>
      )}

      {(selectedJob || uploadedDs) && colInfo && (
        <>
          <div className="pro-grid">
            {/* 左侧：变量池 */}
            <div>
              <div className="pro-card" style={{ position: 'sticky', top: 16 }}>
                <div className="pro-card-header"><NumberOutlined style={{ color: COLORS.accent }} />变量池</div>
                <div className="pro-card-body">
                  <div className="var-section-title">普通变量</div>
                  {ordinaryCols.length === 0 ? <div style={{ fontSize: 12, color: COLORS.textSec, padding: 8 }}>（无）</div> : ordinaryCols.map(c => renderVarItem(c, false))}
                  {binaryCols.length > 0 && (<>
                    <Divider style={{ margin: '12px 0', borderColor: COLORS.divider }} />
                    <div className="var-section-title">0-1 单选题 / 可组多选题集</div>
                    {binaryCols.map(c => renderVarItem(c, true))}
                  </>)}
                </div>
              </div>
            </div>

            {/* 中部：变量放置区 + MC编辑器 */}
            <div>
              {/* 三个区横向排列 */}
              <div className="zones-flex">
                <div className="zone zone-row">
                  <div className="zone-header">
                    <span className="zone-title">行变量区</span>
                    <span className="zone-badge">{rowVars.length}</span>
                    {rowVars.length > 0 && <button className="zone-clear-btn" onClick={() => { setRowVars([]); saveState({ rowVars: [] }); }}>清空</button>}
                  </div>
                  {rowVars.length === 0 ? <div className="zone-empty">从变量池点击「行」放入</div> : renderVarTags(rowVars, 'row')}
                </div>

                <div className="zone zone-col">
                  <div className="zone-header">
                    <span className="zone-title">列变量区</span>
                    <span className="zone-badge">{colVars.length}</span>
                    {colVars.length > 0 && <button className="zone-clear-btn" onClick={() => { setColVars([]); saveState({ colVars: [] }); }}>清空</button>}
                  </div>
                  {colVars.length === 0 ? <div className="zone-empty">从变量池点击「列」放入</div> : renderVarTags(colVars, 'col')}
                </div>

                <div className="zone zone-layer">
                  <div className="zone-header">
                    <span className="zone-title">分层变量区</span>
                    <span className="zone-badge">{layerVars.length}</span>
                    {layerVars.length > 0 && <button className="zone-clear-btn" onClick={() => { setLayerVars([]); saveState({ layerVars: [] }); }}>清空</button>}
                  </div>
                  {layerVars.length === 0 ? <div className="zone-empty">从变量池点击「分层」放入</div> : renderVarTags(layerVars, 'layer')}
                </div>
              </div>

              {/* 多选题集编辑器 */}
              <div className="mc-editor" style={{ marginTop: 14 }}>
                <div className="mc-editor-header"><PlusOutlined />多重响应集 · 将多个 0-1 标签合并为一个多选题变量进行分析</div>
                <div className="mc-editor-body">
                  <div className="field-group"><label>集合名称</label><Input value={mcSetName} onChange={e => setMcSetName(e.target.value)} placeholder="如：投诉类型" style={{ width: 160 }} /></div>
                  <div className="field-group" style={{ flex: 1, minWidth: 220 }}><label>选择子项（可多选）</label>
                    <Select mode="multiple" placeholder={binaryCols.length === 0 ? '请先加载数据' : '选择 0-1 标签列'} value={mcSetCols} onChange={setMcSetCols}
                      options={binaryCols.map(c => ({ label: c, value: c }))} style={{ width: '100%' }} disabled={binaryCols.length === 0} /></div>
                  <div className="field-group"><label>放入</label>
                    <Select value={mcTargetZone} onChange={setMcTargetZone} style={{ width: 120 }}
                      options={[{ label: '行变量区', value: 'row' }, { label: '列变量区', value: 'col' }, { label: '分层变量区', value: 'layer' }]} /></div>
                  <div className="field-group" style={{ justifyContent: 'flex-end' }}>
                    <label>&nbsp;</label>
                    <Button icon={<PlusOutlined />} onClick={addMCSet}>{mcSetName.trim() && mcSetCols.length > 0 ? `添加「${mcSetName}」` : '添加'}</Button>
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧：统计指标 */}
            <div>
              <div className="pro-card" style={{ position: 'sticky', top: 16 }}>
                <div className="pro-card-header"><BarChartOutlined style={{ color: COLORS.accent }} />统计指标</div>
                <div className="pro-card-body">
                  <div className="stats-section">
                    {statOptions.map(o => (
                      <div className="stats-item" key={o.key} onClick={() => toggleStat(o.key)}>
                        <div className={`stats-check${stats.includes(o.key) ? ' active' : ''}`}>{stats.includes(o.key) && '✓'}</div>{o.label}
                      </div>
                    ))}
                  </div>
                  <button className="run-btn" onClick={runAnalysis} disabled={loading}><BarChartOutlined style={{ fontSize: 15 }} />{loading ? '分析中…' : '运行分析'}</button>
                </div>
              </div>
            </div>
          </div>

          {/* ====== 分析结果 ====== */}
          {result && (<div style={{ marginTop: 24 }}>
            <div className="result-summary">
              <div className="result-stat-card"><div className="result-stat-value">{result.summary?.total_records || 0}</div><div className="result-stat-label">总记录数</div></div>
              <div className="result-stat-card"><div className="result-stat-value">{result.summary?.frequency_tables || 0}</div><div className="result-stat-label">频率表</div></div>
              <div className="result-stat-card"><div className="result-stat-value">{result.summary?.cross_tables || 0}</div><div className="result-stat-label">交叉表</div></div>
              <div className="result-stat-card"><div className="result-stat-value">{rowVars.length + colVars.length + layerVars.length}</div><div className="result-stat-label">分析变量</div></div>
            </div>

            {result.narratives?.length > 0 && (
              <div className="result-narrative">
                <div className="result-narrative-title">AI 分析摘要</div>
                {result.narratives.map((n: string, i: number) => (<div className="result-narrative-item" key={i}>{i + 1}. {n}</div>))}
              </div>
            )}

            {result.frequency_tables?.map((ft: any, fi: number) => (
              <div className="result-table-card" key={fi}>
                <div className="result-table-header">{ft.title}</div>
                <div className="result-table-body">
                  <table className="pro-table"><thead><tr>
                    {ft.headers?.map((h: string, hi: number) => (<th key={hi} className={hi === 0 ? 'row-label' : ''}>{h}</th>))}
                  </tr></thead><tbody>
                    {ft.rows?.map((r: any, ri: number) => (
                      <tr key={ri} className={r.类别?.includes('汇总') || r.类别?.includes('至少涉及') ? 'summary-row' : ''}>
                        {ft.headers?.map((h: string, hi: number) => (
                          <td key={hi} className={`${hi === 0 ? 'row-label' : ''}${typeof r[h] === 'number' ? ' clickable-cell' : ''}`}
                            onClick={typeof r[h] === 'number' ? () => handleCellClick(h, r, 'freq') : undefined}>
                            {fmtNum(r[h])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody></table>
                  <div className="formula-panel">
                    {infoText && <div className="formula-panel-content">📐 
                      <span className="formula-panel-text">{infoText}</span>
                    </div>}
                    {!infoText && <div className="formula-panel-hint">点击表中数值查看计算规则</div>}
                  </div>
                </div>
              </div>
            ))}

            {result.cross_tables?.map((ct: any, ci: number) => (
              <div className="result-table-card" key={ci}>
                <div className="result-table-header">{ct.title}</div>
                <div className="result-table-body">
                  <table className="pro-table"><thead><tr>
                    {ct.headers?.map((h: string, hi: number) => (<th key={hi} className={hi === 0 ? 'row-label' : ''} style={{ whiteSpace: 'pre-line' }}>{h}</th>))}
                  </tr></thead><tbody>
                    {ct.rows?.map((r: any, ri: number) => (
                      <tr key={ri} className={ri === ct.rows.length - 1 ? 'summary-row' : ''}>
                        {ct.headers?.map((h: string, hi: number) => (
                          <td key={hi} className={`${hi === 0 ? 'row-label' : ''}${typeof r[h] === 'number' ? ' clickable-cell' : ''}`}
                            onClick={typeof r[h] === 'number' ? () => handleCellClick(h, r, 'cross') : undefined}>
                            {fmtNum(r[h])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody></table>
                  <div className="formula-panel">
                    {infoText && <div className="formula-panel-content">📐 <span className="formula-panel-text">{infoText}</span></div>}
                    {!infoText && <div className="formula-panel-hint">点击表中数值查看计算规则</div>}
                  </div>
                  {ct.chi_square && (
                    <div className={`chi-result ${ct.chi_square.significant ? 'sig' : 'not-sig'}`}>
                      <span style={{ fontWeight: 600 }}>卡方检验</span>
                      <span className="chi-stat">χ² = {ct.chi_square.chi_square}</span>
                      <span className="chi-stat">df = {ct.chi_square.df}</span>
                      <span className="chi-stat">p = {ct.chi_square.p_value}</span>
                      {ct.chi_square.cramer_v != null && (<span className="chi-stat">Cramér's V = {ct.chi_square.cramer_v}</span>)}
                      <Tag color={ct.chi_square.significant ? 'success' : 'default'}>{ct.chi_square.significant ? '显著 (p < 0.05)' : '不显著'}</Tag>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {result.frequency_tables?.length === 0 && result.cross_tables?.length === 0 && (
              <div className="pro-card" style={{ textAlign: 'center', padding: 40, color: COLORS.textSec, fontSize: 13 }}>未生成分析结果，请检查变量配置</div>
            )}
          </div>)}
        </>
      )}
    </div>
  );
}
