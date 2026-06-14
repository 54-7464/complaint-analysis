import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, Upload, Select, Input, message, Space, Spin, Divider } from 'antd';
import { UploadOutlined, FileTextOutlined, DownloadOutlined, EyeOutlined } from '@ant-design/icons';
import api from '../services/api';

export default function Report() {
  const { id } = useParams();
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [templatePath, setTemplatePath] = useState('');
  const [report, setReport] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [templateUploading, setTemplateUploading] = useState(false);

  useEffect(() => {
    api.get(`/labeling/jobs/${id}`).then(r => {
      if (Array.isArray(r.data)) setJobs(r.data.filter((j: any) => j.status === 'done'));
    }).catch(() => {});
  }, [id]);

  const uploadTemplate = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    setTemplateUploading(true);
    try {
      const res = await api.post(`/report/upload-template/${id}`, form);
      setTemplatePath(res.data.file_path);
      message.success('模板已上传');
    } catch { message.error('上传失败'); }
    finally { setTemplateUploading(false); }
    return false;
  };

  const generateReport = async () => {
    if (!selectedJob) { message.warning('请选择标注任务'); return; }
    if (!templatePath) { message.warning('请先上传报告模板'); return; }
    setGenerating(true);
    try {
      const res = await api.post('/report/generate', {
        project_id: Number(id),
        labeling_job_id: selectedJob,
        template_path: templatePath,
      });
      setReport(res.data);
      message.success('报告生成成功');
    } catch (err: any) {
      message.error(err.response?.data?.detail || '生成失败');
    } finally { setGenerating(false); }
  };

  const downloadReport = () => {
    if (!report) return;
    const token = localStorage.getItem('token');
    window.open(`/api/report/download/${report.id}?token=${token}`, '_blank');
  };

  return (
    <div>
      <h2>报告生成</h2>
      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <label>选择标注任务：</label>
            <Select style={{ width: '100%' }} placeholder="选择已完成的标注任务"
              value={selectedJob} onChange={setSelectedJob}
              options={jobs.map((j: any) => ({ label: `#${j.id} — ${j.target_field}`, value: j.id }))} />
          </div>
          <div>
            <label>上传报告模板（Word 文档）：</label>
            <Upload beforeUpload={uploadTemplate} showUploadList={false} accept=".docx">
              <Button icon={<UploadOutlined />} loading={templateUploading}>上传 Word 模板</Button>
            </Upload>
            {templatePath && <div style={{ color: '#52c41a' }}>模板已上传 ✓</div>}
          </div>
          <Button type="primary" icon={<FileTextOutlined />} onClick={generateReport}
            loading={generating} disabled={!selectedJob || !templatePath}>
            生成报告
          </Button>
        </Space>
      </Card>

      {report && (
        <Card title="生成的报告" extra={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={downloadReport}>下载 Word 报告</Button>
          </Space>
        }>
          <div style={{ maxHeight: 600, overflow: 'auto', border: '1px solid #f0f0f0', padding: 16, whiteSpace: 'pre-wrap' }}>
            {report.content || '报告内容为空'}
          </div>
        </Card>
      )}
    </div>
  );
}
