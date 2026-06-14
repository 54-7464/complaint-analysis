import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, Upload, Select, Input, message, Space, Tag, Divider, Collapse, Table as AntTable, Popconfirm } from 'antd';
import { UploadOutlined, FileTextOutlined, DownloadOutlined, PlusOutlined, SendOutlined, DeleteOutlined, ExpandOutlined, CompressOutlined } from '@ant-design/icons';
import api from '../services/api';

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
  const [panels, setPanels] = useState<TablePanel[]>([]);

  useEffect(() => {
    api.get(`/labeling/jobs/${id}`).then(r => {
      if (Array.isArray(r.data)) setJobs(r.data.filter((j: any) => j.status === 'done'));
    }).catch(() => {});
    const saved = localStorage.getItem(`report_panels_${id}`);
    if (saved) { try { setPanels(JSON.parse(saved)); } catch {} }
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

  const deleteTemplate = async () => {
    try { await api.delete(`/report/template/${id}?path=${encodeURIComponent(templatePath)}`); setTemplatePath(''); message.success('模板已删除'); }
    catch { message.error('删除失败'); }
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

  // ====== 表格智能解析工具 ======
  const parseTableData = (text: string): { headers: string[]; rows: string[][]; isTable: boolean } => {
    if (!text.trim()) return { headers: [], rows: [], isTable: false };
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return { headers: [], rows: [], isTable: false };

    // 尝试 Tab 分隔（从 Excel 粘贴的格式）
    if (lines[0].includes('\t')) {
      const headers = lines[0].split('\t').map(h => h.trim()).filter(h => h);
      const rows = [];
      let hasDataRow = false;
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split('\t').map(c => c.trim());
        if (cells.some(c => c)) {
          rows.push(cells);
          hasDataRow = true;
        }
      }
      if (headers.length > 0 && hasDataRow) {
        return { headers, rows, isTable: true };
      }
    }

    // 尝试逗号分隔（CSV）
    if (lines[0].includes(',')) {
      const headers = lines[0].split(',').map(h => h.trim()).filter(h => h);
      const rows = [];
      let hasDataRow = false;
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map(c => c.trim());
        if (cells.some(c => c)) {
          rows.push(cells);
          hasDataRow = true;
        }
      }
      if (headers.length > 0 && hasDataRow) {
        return { headers, rows, isTable: true };
      }
    }

    return { headers: [], rows: [], isTable: false };
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
            <Space>
              <Upload beforeUpload={uploadTemplate} showUploadList={false} accept=".docx">
                <Button icon={<UploadOutlined />}>上传 Word 模板</Button>
              </Upload>
              {templatePath && <Tag closable color="green" onClose={deleteTemplate}>模板已上传</Tag>}
            </Space>
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
        <h3 style={{ margin: 0 }}>自由表格分析</h3>
        <Button type="dashed" icon={<PlusOutlined />} onClick={addPanel}>新建分析面板</Button>
      </div>

      {panels.length === 0 && (
        <Card size="small">
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
            <p style={{ fontSize: 15 }}>点击「新建分析面板」</p>
            <p style={{ fontSize: 13 }}>从 Excel 复制表格 → 粘贴到输入框，系统自动识别为表格</p>
            <p style={{ fontSize: 13 }}>输入分析指令 → AI 自动分析并输出结果</p>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {panels.map((panel, idx) => {
          const tableData = parseTableData(panel.tableText);
          return (
            <Card
              key={panel.key}
              size="small"
              title={
                <Space>
                  <span>分析面板 #{idx + 1}</span>
                  {panel.result && <Tag color="blue">已完成</Tag>}
                  {tableData.isTable && <Tag color="green">已识别表格：{tableData.rows.length} 行 × {tableData.headers.length} 列</Tag>}
                </Space>
              }
              extra={
                <Space size={4}>
                  <Button size="small" icon={panel.collapsed ? <ExpandOutlined /> : <CompressOutlined />}
                    onClick={() => updatePanel(panel.key, 'collapsed', !panel.collapsed)}>
                    {panel.collapsed ? '展开' : '折叠'}
                  </Button>
                  <Popconfirm title="确认删除此面板？" onConfirm={() => removePanel(panel.key)}>
                    <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                </Space>
              }
            >
              {!panel.collapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* ====== 表格粘贴区 + 预览 ====== */}
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ marginBottom: 4, fontSize: 12, color: '#666', fontWeight: 500 }}>从 Excel 复制表格后粘贴到此处：</div>
                      <Input.TextArea
                        value={panel.tableText}
                        onChange={e => updatePanel(panel.key, 'tableText', e.target.value)}
                        placeholder={"直接从 Excel 选中表格 Ctrl+C → 在此 Ctrl+V 粘贴即可"}
                        rows={7}
                        style={{ fontFamily: 'Consolas, monospace', fontSize: 12, borderColor: tableData.isTable ? '#52c41a' : undefined }}
                      />
                    </div>

                    {/* 表格预览 */}
                    {tableData.isTable && (
                      <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden', maxHeight: 260 }}>
                        <div style={{ background: '#fafafa', padding: '6px 12px', fontSize: 11, color: '#999', borderBottom: '1px solid #f0f0f0' }}>
                          表格预览
                        </div>
                        <div style={{ overflow: 'auto', maxHeight: 230 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr>
                                {tableData.headers.map((h, hi) => (
                                  <th key={hi} style={{ border: '1px solid #e8e8e8', padding: '6px 10px', background: '#fafafa', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'left' }}>
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {tableData.rows.map((row, ri) => (
                                <tr key={ri}>
                                  {tableData.headers.map((_, hi) => (
                                    <td key={hi} style={{ border: '1px solid #f0f0f0', padding: '4px 10px', whiteSpace: 'nowrap' }}>
                                      {row[hi] ?? ''}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ====== 分析指令 + 发送 ====== */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ marginBottom: 4, fontSize: 12, color: '#666', fontWeight: 500 }}>分析指令：</div>
                      <Input.TextArea
                        value={panel.instruction}
                        onChange={e => updatePanel(panel.key, 'instruction', e.target.value)}
                        placeholder={"例：计算每个分类的频数和百分比 / 找出得分最高的前3名 / 统计年龄分布按年龄段分组"}
                        rows={3}
                      />
                    </div>
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      onClick={() => analyzeTable(panel.key)}
                      loading={panel.loading}
                      disabled={!panel.tableText.trim() || !panel.instruction.trim()}
                      style={{ marginTop: 22 }}
                      size="large"
                    >
                      发送分析
                    </Button>
                  </div>

                  {/* ====== 分析结果 ====== */}
                  {panel.result && (
                    <div style={{ background: '#f8f9fb', borderRadius: 6, padding: 16, border: '1px solid #e8ecf1' }}>
                      <div style={{ fontSize: 12, color: '#999', marginBottom: 8, fontWeight: 600 }}>分析结果：</div>
                      <SimpeMarkdown text={panel.result} />
                    </div>
                  )}
                  {panel.loading && (
                    <div style={{ textAlign: 'center', color: '#999', padding: 40, background: '#f8f9fb', borderRadius: 6 }}>AI 正在分析中...</div>
                  )}
                </div>
              )}

              {panel.collapsed && panel.result && (
                <div style={{ background: '#f8f9fb', borderRadius: 6, padding: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag color="blue">分析完成</Tag>
                    <span style={{ fontSize: 12, color: '#666' }}>
                      {panel.instruction.slice(0, 80)}{panel.instruction.length > 80 ? '...' : ''}
                    </span>
                  </div>
                </div>
              )}
              {panel.collapsed && !panel.result && tableData.isTable && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag>{tableData.rows.length}行 × {tableData.headers.length}列</Tag>
                  <span style={{ fontSize: 12, color: '#666' }}>点击「展开」继续操作</span>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ====== 简版 Markdown 渲染 ======
function SimpeMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const html: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) { if (inTable) { html.push('</table>'); inTable = false; } html.push('<div style="height:4px"></div>'); continue; }

    // Markdown table
    if (t.startsWith('|') && t.endsWith('|')) {
      const cells = t.split('|').filter(c => c.trim()).map(c => c.trim());
      if (t.includes('---')) continue;
      if (!inTable) { html.push('<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:13px">'); inTable = true; }
      html.push('<tr>' + cells.map(c => `<td style="border:1px solid #e0e0e0;padding:4px 8px">${c}</td>`).join('') + '</tr>');
      continue;
    }
    if (inTable) { html.push('</table>'); inTable = false; }

    if (t.startsWith('### ')) html.push(`<h4 style="margin:6px 0 2px">${esc(t.slice(4))}</h4>`);
    else if (t.startsWith('## ')) html.push(`<h3 style="margin:8px 0 2px">${esc(t.slice(3))}</h3>`);
    else if (t.startsWith('# ')) html.push(`<h2 style="margin:10px 0 2px">${esc(t.slice(2))}</h2>`);
    else if (t.startsWith('- ')) html.push(`<li style="margin:2px 0 2px 18px;font-size:13px">${bold(esc(t.slice(2)))}</li>`);
    else if (/^\d+[.、] /.test(t)) html.push(`<div style="margin:2px 0;font-size:13px">${bold(esc(t))}</div>`);
    else html.push(`<p style="margin:3px 0;font-size:13px;line-height:1.6">${bold(code(esc(t)))}</p>`);
  }
  if (inTable) html.push('</table>');
  return <div dangerouslySetInnerHTML={{ __html: html.join('\n') }} />;
}

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function bold(s: string) { return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }
function code(s: string) { return s.replace(/`(.+?)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px">$1</code>'); }
