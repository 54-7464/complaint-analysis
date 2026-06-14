import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, Upload, Button, Table, message, Space, Descriptions, Spin } from 'antd';
import { UploadOutlined, FileExcelOutlined, FileWordOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
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
  const [selectedPrompt, setSelectedPrompt] = useState<PD | null>(null);

  useEffect(() => {
    api.get(`/projects/${id}`).then(r => setProject(r.data));
    loadData();
  }, [id]);

  const loadData = () => {
    api.get(`/projects/${id}/datasources`).then(r => setDatasources(r.data));
    api.get(`/projects/${id}/prompts`).then(r => setPrompts(r.data));
  };

  const uploadExcel = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    try {
      const res = await api.post(`/upload/excel/${id}`, form);
      setPreviewData({ columns: res.data.columns, rows: res.data.preview });
      setSelectedDS(res.data);
      message.success(`已上传，共 ${res.data.row_count} 条数据`);
      loadData();
    } catch { message.error('上传失败'); }
    finally { setUploading(false); }
    return false;
  };

  const uploadWord = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    try {
      const res = await api.post(`/upload/word/${id}`, form);
      setSelectedPrompt(res.data);
      message.success('提示词文档已上传');
      loadData();
    } catch { message.error('上传失败'); }
    finally { setUploading(false); }
    return false;
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
      <Descriptions title={project?.name || '项目详情'} size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="描述">{project?.description || '—'}</Descriptions.Item>
      </Descriptions>

      <Tabs defaultActiveKey="data" items={[
        {
          key: 'data',
          label: '数据文件',
          children: (
            <div>
              <Upload beforeUpload={uploadExcel} showUploadList={false} accept=".xlsx,.xls">
                <Button icon={<UploadOutlined />} loading={uploading}>上传 Excel 数据</Button>
              </Upload>
              <Table dataSource={datasources} rowKey="id" style={{ marginTop: 12 }} size="small"
                columns={[
                  { title: '文件名', dataIndex: 'filename', render: (t: string, r: DS) => <a onClick={() => previewDS(r.id)}>{t}</a> },
                  { title: '数据行数', dataIndex: 'row_count' },
                  { title: '上传时间', dataIndex: 'created_at', render: (v: string) => new Date(v).toLocaleString('zh-CN') },
                ]}
              />
              {previewData && (
                <div style={{ marginTop: 16 }}>
                  <h4>数据预览（前 {previewData.rows?.length || 0} 行）</h4>
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
                  <Button type="primary" onClick={() => navigate(`/projects/${id}/labeling`)}
                    disabled={prompts.length === 0}>
                    开始 AI 标签分析
                  </Button>
                  {prompts.length === 0 && <span style={{ color: '#999' }}>请先上传提示词文档</span>}
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
                <Button icon={<UploadOutlined />} loading={uploading}>上传 Word 提示词</Button>
              </Upload>
              <Table dataSource={prompts} rowKey="id" style={{ marginTop: 12 }} size="small"
                columns={[
                  { title: '文件名', dataIndex: 'filename' },
                  { title: '上传时间', dataIndex: 'created_at', render: (v: string) => new Date(v).toLocaleString('zh-CN') },
                ]}
                expandable={{
                  expandedRowRender: (r: PD) => <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>{r.content_text}</pre>,
                }}
              />
            </div>
          ),
        },
      ]} />
    </div>
  );
}
