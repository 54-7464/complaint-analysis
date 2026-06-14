import { useState, useEffect } from 'react';
import { Select, Upload, Button, message, Space, Tag, Popconfirm, Radio, Divider } from 'antd';
import { UploadOutlined, DeleteOutlined, InboxOutlined, FolderOpenOutlined } from '@ant-design/icons';
import api from '../services/api';

// ========= 类型 =========
export interface DsItem {
  id: number; filename: string; row_count: number;
  columns: string[]; has_labels: boolean; created_at: string;
  label_names: string[];  // 上传标注Excel时后端返回的标签名列表
}
interface SheetInfo { sheets: string[]; }

// ========= 组件 =========
interface Props {
  projectId: string;
  /** 上游数据（标注任务等），{id, label, row_count?}[] */
  upstreamOptions?: { value: number; label: string; row_count?: number }[];
  upstreamLabel?: string;     // "已完成标注任务"
  uploadEndpoint?: string;    // "/upload/labeled-excel" or "/upload/excel"
  accept?: string;            // ".xlsx,.xls"
  onSelectUpstream?: (id: number) => void;
  onSelectUploaded?: (ds: DsItem | null) => void;
  selectedUpstreamId?: number | null;
  selectedUploaded?: DsItem | null;
  /** 允许删除已上传的文件 */
  allowDelete?: boolean;
  /** 左侧模式标签 */
  modeLabels?: { upstream: string; upload: string };
}

export default function DataSourcePicker(props: Props) {
  const {
    projectId, upstreamOptions = [], upstreamLabel = "流水线数据",
    uploadEndpoint, accept = ".xlsx,.xls",
    onSelectUpstream, onSelectUploaded,
    selectedUpstreamId, selectedUploaded,
    allowDelete = true, modeLabels,
  } = props;

  const ul = modeLabels?.upstream || "前期结果";
  const uu = modeLabels?.upload || "本地上传";

  const [mode, setMode] = useState<'upstream' | 'upload'>(
    selectedUploaded ? 'upload' : selectedUpstreamId ? 'upstream' : 'upstream'
  );
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [tempFilePath, setTempFilePath] = useState('');
  const [uploading, setUploading] = useState(false);
  const [allDs, setAllDs] = useState<DsItem[]>([]);

  // 加载项目下所有数据源
  const loadDs = () => {
    api.get(`/upload/all-datasources/${projectId}`).then(r => setAllDs(r.data)).catch(() => {});
  };

  useEffect(() => { loadDs(); }, [projectId]);
  useEffect(() => { if (selectedUpstreamId) setMode('upstream'); }, [selectedUpstreamId]);
  useEffect(() => { if (selectedUploaded) setMode('upload'); }, [selectedUploaded]);

  const handleFileSelect = async (file: File) => {
    // 先上传到临时位置获取 sheets
    const form = new FormData(); form.append('file', file);
    const res = await api.post(`/upload/excel/${projectId}`, form);
    const dsId = res.data.id;
    const fp = res.data.file_path || '';

    // 通过原文件读取 sheets
    const ext = file.name.split('.').pop()?.toLowerCase();
    const re = new FormData(); re.append('file', file);
    // 直接用 openpyxl 服务端接口获取 sheets（需要新增临时接口）
    setTempFilePath(fp);
    // 把文件再次保存
    if (fp) {
      try {
        // 直接获取 sheets 列表
        const sheetRes = await api.get(`/upload/sheets?file_path=${encodeURIComponent(fp)}`);
        const shs: string[] = sheetRes.data.sheets || [];
        setSheets(shs);
        if (shs.length > 0) setSelectedSheet(shs[0]);
      } catch {
        setSheets([]);
      }
    }
    // 临时上传的 ds 也记录下来
    loadDs();
    return false;
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData(); form.append('file', file);
      if (selectedSheet) form.append('sheet_name', selectedSheet);

      const endpoint = uploadEndpoint || `/upload/labeled-excel/${projectId}`;
      const res = await api.post(endpoint, form);
      const dsItem: DsItem = {
        id: res.data.id, filename: res.data.filename, row_count: res.data.row_count,
        columns: res.data.columns || [], has_labels: true, created_at: new Date().toISOString(),
        label_names: res.data.label_names || [],
      };
      onSelectUploaded?.(dsItem);
      setSheets([]); setSelectedSheet(''); setTempFilePath('');
      loadDs();
      message.success(`已上传: ${res.data.filename} (${res.data.row_count} 行)`);
    } catch (err: any) { message.error(err.response?.data?.detail || '上传失败'); }
    finally { setUploading(false); }
    return false;
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
              <summary style={{ cursor: 'pointer', color: '#888', fontSize: 12 }}>
                历史文件 ({allDs.length})
              </summary>
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
          <Upload.Dragger
            beforeUpload={handleUpload}
            showUploadList={false}
            accept={accept}
            style={{ padding: '12px 16px' }}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖拽上传文件</p>
          </Upload.Dragger>

          {sheets.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, color: '#666' }}>选择 Sheet：</label>
              <Select size="small" style={{ width: '100%' }} value={selectedSheet} onChange={setSelectedSheet}
                options={sheets.map(s => ({ label: s, value: s }))} />
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
