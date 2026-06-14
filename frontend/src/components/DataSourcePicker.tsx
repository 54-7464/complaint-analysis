import { useState, useEffect } from 'react';
import { Select, Upload, Button, message, Space, Tag, Popconfirm, Radio } from 'antd';
import { UploadOutlined, DeleteOutlined, InboxOutlined } from '@ant-design/icons';
import api from '../services/api';

export interface DsItem {
  id: number; filename: string; row_count: number;
  columns: string[]; has_labels: boolean; created_at: string;
  label_names: string[];
}

interface Props {
  projectId: string;
  upstreamOptions?: { value: number; label: string; row_count?: number }[];
  upstreamLabel?: string;
  uploadEndpoint?: string;
  accept?: string;
  onSelectUpstream?: (id: number) => void;
  onSelectUploaded?: (ds: DsItem | null) => void;
  selectedUpstreamId?: number | null;
  selectedUploaded?: DsItem | null;
  allowDelete?: boolean;
  modeLabels?: { upstream: string; upload: string };
}

export default function DataSourcePicker(props: Props) {
  const { projectId, upstreamOptions = [], upstreamLabel = "流水线数据",
    uploadEndpoint, accept = ".xlsx,.xls",
    onSelectUpstream, onSelectUploaded,
    selectedUpstreamId, selectedUploaded, allowDelete = true,
    modeLabels } = props;
  const ul = modeLabels?.upstream || "前期结果";
  const uu = modeLabels?.upload || "本地上传";

  const [mode, setMode] = useState<'upstream' | 'upload'>(selectedUploaded ? 'upload' : selectedUpstreamId ? 'upstream' : 'upstream');
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [pendingDsData, setPendingDsData] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [allDs, setAllDs] = useState<DsItem[]>([]);

  const loadDs = () => {
    api.get(`/upload/all-datasources/${projectId}`).then(r => setAllDs(r.data)).catch(() => {});
  };

  useEffect(() => { loadDs(); }, [projectId]);
  useEffect(() => { if (selectedUpstreamId) setMode('upstream'); }, [selectedUpstreamId]);
  useEffect(() => { if (selectedUploaded) setMode('upload'); }, [selectedUploaded]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData(); form.append('file', file);
      const endpoint = uploadEndpoint || `/upload/labeled-excel/${projectId}`;
      const res = await api.post(endpoint, form);
      const shs: string[] = (res.data.sheets && res.data.sheets.length > 0) ? res.data.sheets : [];

      if (shs.length > 1) {
        setSheets(shs); setSelectedSheet(shs[0]);
        setPendingDsData(res.data);
        message.info(`请选择 Sheet（当前: ${res.data.sheet_used || '默认'}）`);
        setUploading(false); return false;
      }
      finishWithData(res.data);
    } catch (err: any) { message.error(err.response?.data?.detail || '上传失败'); setUploading(false); }
    return false;
  };

  const finishWithData = (data: any) => {
    const dsItem: DsItem = {
      id: data.id, filename: data.filename, row_count: data.row_count,
      columns: data.columns || [], has_labels: true, created_at: new Date().toISOString(),
      label_names: data.label_names || [],
    };
    onSelectUploaded?.(dsItem);
    setSheets([]); setSelectedSheet(''); setPendingDsData(null);
    setUploading(false);
    loadDs();
    message.success(`已上传: ${data.filename} (${data.row_count} 行)`);
  };

  const confirmSheet = async () => {
    if (!pendingDsData) return;
    setUploading(true);
    try {
      const res = await api.post(`/upload/select-sheet/${pendingDsData.id}?sheet_name=${encodeURIComponent(selectedSheet)}`);
      finishWithData({ ...pendingDsData, columns: res.data.columns, row_count: res.data.row_count });
    } catch { message.error('切换 Sheet 失败'); setUploading(false); }
  };

  const handleDeleteDs = async (dsId: number) => {
    try {
      await api.delete(`/upload/datasource/${dsId}`);
      if (selectedUploaded?.id === dsId) onSelectUploaded?.(null);
      loadDs();
      message.success('已删除');
    } catch { message.error('删除失败'); }
  };

  return (
    <div>
      <Radio.Group value={mode} onChange={e => { setMode(e.target.value); }}
        size="small" style={{ marginBottom: 8 }}>
        <Radio.Button value="upstream">{ul}</Radio.Button>
        <Radio.Button value="upload">{uu}</Radio.Button>
      </Radio.Group>

      {mode === 'upstream' && (
        <div>
          <Select
            style={{ width: '100%' }}
            placeholder={`选择${upstreamLabel}`}
            value={selectedUpstreamId}
            onChange={v => { onSelectUpstream?.(v); }}
            options={upstreamOptions.map(o => ({
              label: o.label + (o.row_count ? ` (${o.row_count}行)` : ''),
              value: o.value,
            }))}
            allowClear
          />
          {allDs.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', color: '#888', fontSize: 12 }}>历史文件 ({allDs.length})</summary>
              <div style={{ maxHeight: 120, overflow: 'auto', marginTop: 4 }}>
                {allDs.map(ds => (
                  <div key={ds.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0', fontSize: 12 }}>
                    <span style={{ color: '#666' }}>{ds.filename} ({ds.row_count}行)
                      {ds.has_labels && <Tag color="green" style={{ marginLeft: 4, fontSize: 10, padding: '0 4px' }}>已标注</Tag>}
                    </span>
                    {allowDelete && (
                      <Popconfirm title="确认删除？" onConfirm={() => handleDeleteDs(ds.id)}>
                        <Button type="link" size="small" danger icon={<DeleteOutlined />} style={{ padding: 0 }} />
                      </Popconfirm>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {mode === 'upload' && (
        <div>
          {!pendingDsData && (
            <Upload.Dragger beforeUpload={handleUpload} showUploadList={false} accept={accept}
              style={{ padding: '12px 16px' }}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">点击或拖拽上传文件</p>
            </Upload.Dragger>
          )}

          {/* Sheet selector */}
          {sheets.length > 1 && pendingDsData && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: '#f6ffed', borderRadius: 4 }}>
              <span style={{ fontSize: 12 }}>选择 Sheet：</span>
              <Select size="small" style={{ flex: 1 }} value={selectedSheet} onChange={setSelectedSheet}
                options={sheets.map(s => ({ label: s, value: s }))} />
              <Button size="small" type="primary" loading={uploading} onClick={confirmSheet}>确认</Button>
              <Button size="small" onClick={() => { setSheets([]); setPendingDsData(null); setUploading(false); }}>取消</Button>
            </div>
          )}

          {selectedUploaded && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag closable onClose={() => onSelectUploaded?.(null)} color="blue">
                {selectedUploaded.filename} ({selectedUploaded.row_count}行)
              </Tag>
              {allowDelete && (
                <Popconfirm title="确认删除此文件？" onConfirm={() => handleDeleteDs(selectedUploaded.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
