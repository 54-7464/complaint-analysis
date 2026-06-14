import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, Upload, Select, Input, message, Space, Tag, Divider, Collapse } from 'antd';
import { UploadOutlined, FileTextOutlined, DownloadOutlined, PlusOutlined, SendOutlined, DeleteOutlined, ExpandOutlined, CompressOutlined } from '@ant-design/icons';
import api from '../services/api';

// ========= 表格分析面板 =========
interface TablePanel {
  key: string;
  tableText: string;
  instruction: string;
  result: string;
  loading: boolean;
  collapsed: boolean;
}

export default function Report() {
  const { id } = useParams();
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [templatePath, setTemplatePath] = useState('');
  const [report, setReport] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  // 自由表格分析
  const [panels, setPanels] = useState<TablePanel[]>([]);

  useEffect(() => {
    api.get(`/labeling/jobs/${id}`).then(r => {
      if (Array.isArray(r.data)) setJobs(r.data.filter((j: any) => j.status === 'done'));
    }).catch(() => {});
    const saved = localStorage.getItem(`report_panels_${id}`);
    if (saved) {
      try { setPanels(JSON.parse(saved)); } catch {}
    }
  }, [id]);

  useEffect(() => {
    localStorage.setItem(`report_panels_${id}`, JSON.stringify(panels));
  }, [panels, id]);

  // ====== 流水线报告 ======

  const uploadTemplate = async (file: File) => {
    const form = new FormData(); form.append('file', file);
    try { const res = await api.post(`/report/upload-template/${id}`, form); setTemplatePath(res.data.file_path); message.success('模板已上传'); }
    catch { message.error('上传失败'); }
    return false;
  };

  const generateReport = async () => {
    if (!selectedJob) { message.warning('请选择标注任务'); return; }
    if (!templatePath) { message.warning('请先上传报告模板'); return; }
    setGenerating(true);
    try {
      const res = await api.post('/report/generate', { project_id: Number(id), labeling_job_id: selectedJob, template_path: templatePath });
      setReport(res.data); message.success('报告生成成功');
    } catch (err: any) { message.error(err.response?.data?.detail || '生成失败'); }
    finally { setGenerating(false); }
  };

  const downloadReport = () => {
    if (!report) return;
    const token = localStorage.getItem('token');
    window.open(`/api/report/download/${report.id}?token=${token}`, '_blank');
  };

  // ====== 自由表格分析 ======

  const addPanel = () => {
    setPanels(prev => [...prev, {
      key: Date.now().toString(),
      tableText: '',
      instruction: '',
      result: '',
      loading: false,
      collapsed: false,
    }]);
  };

  const removePanel = (key: string) => {
    setPanels(prev => prev.filter(p => p.key !== key));
  };

  const updatePanel = (key: string, field: 'tableText' | 'instruction' | 'collapsed', value: any) => {
    setPanels(prev => prev.map(p => p.key === key ? { ...p, [field]: value } : p));
  };

  const analyzeTable = async (key: string) => {
    const panel = panels.find(p => p.key === key);
    if (!panel) return;
    if (!panel.tableText.trim()) { message.warning('请先粘贴表格数据'); return; }
    if (!panel.instruction.trim()) { message.warning('请输入分析指令'); return; }

    updatePanel(key, 'tableText', panel.tableText); // persist
    setPanels(prev => prev.map(p => p.key === key ? { ...p, loading: true, result: '' } : p));

    try {
      const res = await api.post('/report/analyze-table', {
        table_text: panel.tableText,
        instruction: panel.instruction,
      });
      setPanels(prev => prev.map(p => p.key === key
        ? { ...p, result: res.data.result, loading: false, collapsed: true }
        : p));
    } catch (err: any) {
      setPanels(prev => prev.map(p => p.key === key
        ? { ...p, result: '分析失败：' + (err.response?.data?.detail || err.message), loading: false }
        : p));
    }
  };

  // ====== 辅助：Markdown → HTML ======
  const renderMarkdown = (text: string) => {
    if (!text) return null;
    const lines = text.split('\n');
    const html: string[] = [];
    let inTable = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed.split('|').filter(c => c.trim()).map(c => c.trim());
        const isHeader = line.includes('---');
        if (!inTable) { html.push('<table style="border-collapse:collapse;width:100%;margin:8px 0">'); inTable = true; }
        if (!isHeader) {
          html.push('<tr>' + cells.map(c => `<td style="border:1px solid #e8e8e8;padding:4px 8px;font-size:13px">${c}</td>`).join('') + '</tr>');
        }
      } else {
        if (inTable) { html.push('</table>'); inTable = false; }
        if (trimmed.startsWith('### ')) html.push(`<h4 style="margin:8px 0 4px">${trimmed.slice(4)}</h4>`);
        else if (trimmed.startsWith('## ')) html.push(`<h3 style="margin:10px 0 4px">${trimmed.slice(3)}</h3>`);
        else if (trimmed.startsWith('# ')) html.push(`<h2 style="margin:12px 0 4px">${trimmed.slice(2)}</h2>`);
        else if (trimmed.startsWith('- ')) html.push(`<li style="margin:2px 0 2px 16px;font-size:13px">${trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`);
        else if (trimmed.match(/^\d+\. /)) html.push(`<div style="margin:2px 0;font-size:13px">${trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>`);
        else if (trimmed) html.push(`<p style="margin:4px 0;font-size:13px;line-height:1.6">${trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`(.*?)`/g, '<code style="background:#f5f5f5;padding:1px 4px;border-radius:2px">$1</code>')}</p>`);
      }
    }
    if (inTable) html.push('</table>');
    return <div dangerouslySetInnerHTML={{ __html: html.join('\n') }} />;
  };

  return (
    <div>
      <h2>报告分析</h2>

      {/* ======== 流水线报告 ======== */}
      <Card title="流水线报告（基于标注结果）" size="small" style={{ marginBottom: 20 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div>
            <label style={{ fontSize: 13 }}>标注任务：</label>
            <Select style={{ width: '100%' }} placeholder="选择已完成标注的任务"
              value={selectedJob} onChange={setSelectedJob}
              options={jobs.map((j: any) => ({ label: `任务 #${j.id} — ${j.target_field}`, value: j.id }))} />
          </div>
          <div>
            <label style={{ fontSize: 13 }}>报告模板：</label>
            <Upload beforeUpload={uploadTemplate} showUploadList={false} accept=".docx">
              <Button icon={<UploadOutlined />}>上传 Word 模板</Button>
            </Upload>
            {templatePath && <Tag color="green" style={{ marginTop: 4 }}>已上传</Tag>}
          </div>
          <Space>
            <Button type="primary" icon={<FileTextOutlined />} onClick={generateReport} loading={generating}
              disabled={!selectedJob || !templatePath}>生成报告</Button>
            {report && <Button icon={<DownloadOutlined />} onClick={downloadReport}>下载 Word</Button>}
          </Space>
        </Space>
        {report && (
          <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 6, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 13 }}>
            {report.content || '报告内容为空'}
          </div>
        )}
      </Card>

      {/* ======== 自由表格分析 ======== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>自由表格分析（AI 对话式）</h3>
        <Button type="dashed" icon={<PlusOutlined />} onClick={addPanel}>新建分析面板</Button>
      </div>

      {panels.length === 0 && (
        <Card size="small">
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
            <p>点击「新建分析面板」粘贴外部表格数据</p>
            <p style={{ fontSize: 12 }}>可以粘贴 CSV、TSV、Markdown 表格、或者纯文本格式的数据</p>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {panels.map((panel, idx) => (
          <Card
            key={panel.key}
            size="small"
            title={<span style={{ fontSize: 13 }}>分析面板 #{idx + 1} {panel.result ? <Tag color="blue">已完成</Tag> : ''}</span>}
            extra={
              <Space size={4}>
                <Button size="small" icon={panel.collapsed ? <ExpandOutlined /> : <CompressOutlined />}
                  onClick={() => updatePanel(panel.key, 'collapsed', !panel.collapsed)}>
                  {panel.collapsed ? '展开' : '折叠'}
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removePanel(panel.key)} />
              </Space>
            }
          >
            {!panel.collapsed && (
              <div style={{ display: 'flex', gap: 12 }}>
                {/* 左侧：输入区 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#666' }}>粘贴表格数据：</label>
                    <Input.TextArea
                      value={panel.tableText}
                      onChange={e => updatePanel(panel.key, 'tableText', e.target.value)}
                      placeholder={"支持 CSV/TSV/Markdown 格式，例如：\n姓名,年龄,得分\n张三,28,85\n李四,35,92\n...\n\n或者直接从 Excel/网页复制粘贴"}
                      rows={6}
                      style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#666' }}>分析指令（自然语言）：</label>
                    <Input.TextArea
                      value={panel.instruction}
                      onChange={e => updatePanel(panel.key, 'instruction', e.target.value)}
                      placeholder={"例如：\n- 计算每个分类的频数和百分比\n- 找出得分最高的前3名\n- 统计年龄分布，按年龄段分组\n- 计算列之间的相关性"}
                      rows={3}
                    />
                  </div>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={() => analyzeTable(panel.key)}
                    loading={panel.loading}
                    disabled={!panel.tableText.trim() || !panel.instruction.trim()}
                    block
                  >
                    发送给 AI 分析
                  </Button>
                </div>

                {/* 右侧：结果区 */}
                <div style={{ flex: 1, background: '#f8f9fb', borderRadius: 6, padding: 12, minHeight: 150 }}>
                  {panel.loading ? (
                    <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
                      AI 正在分析中...
                    </div>
                  ) : panel.result ? (
                    <div>
                      <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>分析结果：</div>
                      {renderMarkdown(panel.result)}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#bbb', padding: 40, fontSize: 13 }}>
                      等待分析...
                    </div>
                  )}
                </div>
              </div>
            )}

            {panel.collapsed && panel.result && (
              <div style={{ background: '#f8f9fb', borderRadius: 6, padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag>分析完成</Tag>
                  <span style={{ fontSize: 12, color: '#666' }}>{panel.instruction.slice(0, 80)}{panel.instruction.length > 80 ? '...' : ''}</span>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
