import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Table, Button, message, Card, Tag, Space } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import api from '../services/api';
import DataSourcePicker, { DsItem } from '../components/DataSourcePicker';

export default function Binarization() {
  const { id } = useParams();
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [uploadedDs, setUploadedDs] = useState<DsItem | null>(null);
  const [binarizedData, setBinarizedData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');

  useEffect(() => {
    api.get(`/labeling/jobs/${id}`).then(r => {
      if (Array.isArray(r.data)) setJobs(r.data.filter((j: any) => j.status === 'done'));
    }).catch(() => {});
    const saved = localStorage.getItem(`binarize_${id}`);
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (p.selectedJob) setSelectedJob(p.selectedJob);
        if (p.binarizedData) setBinarizedData(p.binarizedData);
        if (p.columns) setColumns(p.columns);
        if (p.downloadUrl) setDownloadUrl(p.downloadUrl);
        if (p.uploadedDs) setUploadedDs(p.uploadedDs);
      } catch {}
    }
  }, [id]);

  const save = (d: any) => localStorage.setItem(`binarize_${id}`, JSON.stringify({
    selectedJob, binarizedData, columns, downloadUrl, uploadedDs, ...d,
  }));

  const runBinarize = async () => {
    setLoading(true);
    try {
      const body: any = {};
      if (uploadedDs) body.data_source_id = uploadedDs.id;
      else if (selectedJob) body.labeling_job_id = selectedJob;
      else { message.warning('请选择数据源'); setLoading(false); return; }

      const res = await api.post('/analysis/binarize', body);
      const outPath = res.data.file_path || '';
      const token = localStorage.getItem('token');
      const dlUrl = outPath ? `/api/analysis/download-binarized?token=${token}&path=${encodeURIComponent(outPath)}` : '';
      const state = {
        binarizedData: res.data.rows || [], columns: res.data.columns || [],
        downloadUrl: dlUrl,
      };
      setBinarizedData(state.binarizedData); setColumns(state.columns); setDownloadUrl(state.downloadUrl);
      save(state); message.success('二值化完成');
    } catch (err: any) { message.error(err.response?.data?.detail || '二值化失败'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <h2>标签二值化</h2>

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <DataSourcePicker
            projectId={id!}
            upstreamOptions={jobs.map((j: any) => ({
              value: j.id, label: `任务 #${j.id} — ${j.target_field}`, row_count: j.total_rows,
            }))}
            upstreamLabel="已完成标注任务"
            uploadEndpoint={`/upload/labeled-excel/${id}`}
            onSelectUpstream={v => { setSelectedJob(v); setUploadedDs(null); setBinarizedData([]); save({ selectedJob: v, uploadedDs: null }); }}
            onSelectUploaded={ds => { setUploadedDs(ds); setSelectedJob(null); setBinarizedData([]); save({ uploadedDs: ds, selectedJob: null }); }}
            selectedUpstreamId={selectedJob}
            selectedUploaded={uploadedDs as DsItem}
            modeLabels={{ upstream: '前期标注结果', upload: '本地上传 Excel' }}
          />
          <Space>
            <Button type="primary" onClick={runBinarize} loading={loading} disabled={!selectedJob && !uploadedDs}>
              执行二值化
            </Button>
            {binarizedData.length > 0 && (
              <Button danger onClick={() => {
                setBinarizedData([]); setColumns([]); setDownloadUrl('');
                save({ binarizedData: [], columns: [], downloadUrl: '' });
                }}>
                清除预览结果
              </Button>
            )}
          </Space>
        </Space>
      </Card>

      {binarizedData.length > 0 && (
        <Card title={<Space><span>二值化结果</span><Tag color="blue">{binarizedData.length} 行</Tag></Space>}
          extra={downloadUrl ? <Button icon={<DownloadOutlined />} onClick={() => window.open(downloadUrl, '_blank')}>下载</Button> : null}>
          <Table
            dataSource={binarizedData.map((r: any, i: number) => ({ ...r, _idx: i }))}
            rowKey="_idx" size="small" scroll={{ x: 'max-content' }}
            columns={columns.map(c => ({
              title: c, dataIndex: c, ellipsis: true, width: c.length > 10 ? 120 : 80,
              render: (v: any) => (typeof v === 'number' ? <span style={{ fontWeight: 600, color: v ? '#1677ff' : '#ccc' }}>{v}</span> : String(v ?? '')),
            }))}
            pagination={{ pageSize: 30, showSizeChanger: true }}
          />
        </Card>
      )}
    </div>
  );
}
