import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, Upload, Button, Table, message, Space, Select, Popconfirm } from 'antd';
import { UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../services/api';

interface DS { id: number; filename: string; row_count: number; columns_json: string; created_at: string; }
interface PD { id: number; filename: string; content_text: string; created_at: string; }
interface Project { id: number; name: string; description: string; }

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [datasources, setDatasources] = useState<DS[]>([]);
  const [prompts, setPrompts] = useState<PD[]>([]);
  const [previewData, setPreviewData] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedDS, setSelectedDS] = useState<DS | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [pendingDsId, setPendingDsId] = useState<number | null>(null);

  useEffect(() => {
    api.get(`/projects/${id}`).then(r => setProject(r.data));
    loadData();
  }, [id]);

  const loadData = () => {
    api.get(`/projects/${id}/datasources`).then(r => setDatasources(r.data));
    api.get(`/projects/${id}/prompts`).then(r => setPrompts(r.data));
  };

  const uploadExcel = async (file: File) => {
    const form = new FormData(); form.append('file', file);
    setUploading(true);
    try {
      const res = await api.post(`/upload/excel/${id}`, form);
      const shs: string[] = (res.data.sheets && res.data.sheets.length > 0) ? res.data.sheets : [];
      if (shs.length > 1) {
        setSheets(shs); setSelectedSheet(shs[0]);
        setPendingDsId(res.data.id);
        setPreviewData({ columns: res.data.columns, rows: res.data.preview });
        message.info(`请选择 Sheet（当前: ${res.data.sheet_used || '默认'}）`);
        setUploading(false); return false;
      }
      setPreviewData({ columns: res.data.columns, rows: res.data.preview });
      setSelectedDS(res.data);
      message.success(`已上传，共 ${res.data.row_count} 条`);
      setUploading(false); loadData(); return false;
    } catch { message.error('上传失败'); setUploading(false); return false; }
  };

  const confirmSheet = async () => {
    if (!pendingDsId || !selectedSheet) return;
    setUploading(true);
    try {
      const res = await api.post(`/upload/select-sheet/${pendingDsId}?sheet_name=${encodeURIComponent(selectedSheet)}`);
      setSelectedDS({ id: pendingDsId, ...res.data } as any);
      setPreviewData({ columns: res.data.columns, rows: res.data.preview });
      setSheets([]); setSelectedSheet(''); setPendingDsId(null);
      message.success(`已选择 Sheet: ${res.data.sheet_used}`);
      setUploading(false); loadData();
    } catch { message.error('切换 Sheet 失败'); setUploading(false); }
  };

  const uploadWord = async (file: File) => {
    const form = new FormData(); form.append('file', file);
    setUploading(true);
    try {
      await api.post(`/upload/word/${id}`, form);
      message.success('已上传');
      setUploading(false); loadData(); return false;
    } catch { message.error('上传失败'); setUploading(false); return false; }
  };

  const deleteDS = async (dsId: number) => {
    await api.delete(`/upload/datasource/${dsId}`);
    setDatasources(prev => prev.filter(d => d.id !== dsId));
    if (selectedDS?.id === dsId) { setSelectedDS(null); setPreviewData(null); }
    message.success('已删除');
  };

  const deletePrompt = async (promptId: number) => {
    await api.delete(`/upload/prompt/${promptId}`);
    setPrompts(prev => prev.filter(p => p.id !== promptId));
    message.success('已删除');
  };

  const previewDS = async (dsId: number) => {
    try {
      const res = await api.get(`/upload/preview-excel/${dsId}`);
      setPreviewData(res.data);
      const ds = datasources.find(d => d.id === dsId);
      setSelectedDS(ds || null);
    } catch { message.error('加载失败'); }
  };

  return (
    <div>
      <h2>{project?.name || '项目详情'}</h2>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>{project?.description || '—'}</p>

      <Tabs defaultActiveKey="data" items={[
        {
          key: 'data',
          label: '数据文件',
          children: (
            <div>
              <Upload beforeUpload={uploadExcel} showUploadList={false} accept=".xlsx,.xls">
                <Button icon={<UploadOutlined />} loading={uploading && !pendingDsId}>上传 Excel</Button>
              </Upload>

              {/* Sheet 选择器 */}
              {sheets.length > 1 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#888' }}>选择 Sheet：</span>
                  <Select size="small" style={{ flex: 1 }} value={selectedSheet} onChange={setSelectedSheet}
                    options={sheets.map(s => ({ label: s, value: s }))} />
                  <Button size="small" type="primary" loading={uploading} onClick={confirmSheet}>确认</Button>
                  <Button size="small" onClick={() => { setSheets([]); setPendingDsId(null); }}>取消</Button>
                </div>
              )}

              <Table dataSource={datasources} rowKey="id" style={{ marginTop: 8 }} size="small"
                columns={[
                  { title: '文件名', dataIndex: 'filename', render: (t: string, r: DS) => <a onClick={() => previewDS(r.id)}>{t}</a> },
                  { title: '行数', dataIndex: 'row_count', width: 80 },
                  { title: '上传时间', dataIndex: 'created_at', width: 160, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '' },
                  { title: '', width: 50, render: (_: any, r: DS) => (
                    <Popconfirm title="删除此文件？" onConfirm={() => deleteDS(r.id)}>
                      <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  )},
                ]}
              />

              {previewData && (
                <div style={{ marginTop: 12 }}>
                  <h4 style={{ fontSize: 13 }}>数据预览（前 {previewData.rows?.length || 0} 行）</h4>
                  <Table
                    dataSource={previewData.rows?.map((row: string[], i: number) => {
                      const obj: any = { _key: i };
                      previewData.columns.forEach((col: string, j: number) => { obj[col] = row[j] || ''; });
                      return obj;
                    })}
                    columns={previewData.columns?.map((c: string) => ({ title: c, dataIndex: c, ellipsis: true }))}
                    rowKey="_key" size="small" scroll={{ x: 'max-content' }}
                  />
                </div>
              )}

              {selectedDS && (
                <Space style={{ marginTop: 12 }}>
                  <Button type="primary" onClick={() => navigate(`/projects/${id}/labeling`)} disabled={prompts.length === 0}>
                    开始 AI 标签分析
                  </Button>
                  {prompts.length === 0 && <span style={{ color: '#999', fontSize: 12 }}>请先上传提示词文档</span>}
                </Space>
              )}
            </div>
          ),
        },
        {
          key: 'prompt',
          label: '提示词文档',
          children: (
            <div>
              <Upload beforeUpload={uploadWord} showUploadList={false} accept=".docx">
                <Button icon={<UploadOutlined />} loading={uploading}>上传 Word</Button>
              </Upload>
              <Table dataSource={prompts} rowKey="id" style={{ marginTop: 8 }} size="small"
                columns={[
                  { title: '文件名', dataIndex: 'filename' },
                  { title: '上传时间', dataIndex: 'created_at', width: 160, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '' },
                  { title: '', width: 50, render: (_: any, r: PD) => (
                    <Popconfirm title="删除此文件？" onConfirm={() => deletePrompt(r.id)}>
                      <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  )},
                ]}
                expandable={{
                  expandedRowRender: (r: PD) => <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto', fontSize: 12 }}>{r.content_text}</pre>,
                }}
              />
            </div>
          ),
        },
      ]} />
    </div>
  );
}
