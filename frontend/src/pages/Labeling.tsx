import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Select, Table, message, Progress, Alert, Space, Card, Tag, Badge, Popover, Upload, Popconfirm, Input } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, CaretRightOutlined, DownloadOutlined, UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import api from '../services/api';

interface DS { id: number; filename: string; row_count: number; columns_json: string; }
interface PD { id: number; filename: string; }
interface JobInfo { id: number; status: string; target_field: string; progress: number; total_rows: number; done_rows: number; labels: { id: number; name: string }[]; }

interface RowResult {
  row_index: number;
  original_text: string;
  labels: string[];
  thinking: string;
  status: string;
  error_msg: string;
}

export default function Labeling() {
  const { id } = useParams();
  const [datasources, setDatasources] = useState<DS[]>([]);
  const [prompts, setPrompts] = useState<PD[]>([]);
  const [selectedDS, setSelectedDS] = useState<number | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<number | null>(null);
  const [targetField, setTargetField] = useState<string>('');
  const [columns, setColumns] = useState<string[]>([]);
  const [job, setJob] = useState<JobInfo | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [liveRows, setLiveRows] = useState<RowResult[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [labelFilter, setLabelFilter] = useState<string>('');
  const [allLabels, setAllLabels] = useState<string[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
  const [concurrency, setConcurrency] = useState(3);
  const [currentModel, setCurrentModel] = useState('');
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [uploadingWord, setUploadingWord] = useState(false);
  const pollRef = useRef<number | null>(null);
  const livePollRef = useRef<number | null>(null);
  const jobIdFromStorage = localStorage.getItem(`active_job_${id}`);

  // ===== 文件上传（本模块内独立上传）=====

  const uploadExcel = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    setUploadingExcel(true);
    try {
      const res = await api.post(`/upload/excel/${id}`, form);
      setDatasources(prev => [...prev, res.data]);
      setSelectedDS(res.data.id);
      setColumns(res.data.columns);
      message.success(`已上传：${res.data.filename}（${res.data.row_count} 行）`);
    } catch { message.error('上传失败'); }
    finally { setUploadingExcel(false); }
    return false;
  };

  const uploadWord = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    setUploadingWord(true);
    try {
      const res = await api.post(`/upload/word/${id}`, form);
      setPrompts(prev => [...prev, res.data]);
      setSelectedPrompt(res.data.id);
      message.success(`已上传：${res.data.filename}`);
    } catch { message.error('上传失败'); }
    finally { setUploadingWord(false); }
    return false;
  };

  // ===== 其他逻辑 =====

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (livePollRef.current) { clearInterval(livePollRef.current); livePollRef.current = null; }
  }, []);

  const startLivePoll = useCallback((jobId: number) => {
    if (livePollRef.current) clearInterval(livePollRef.current);
    let failCount = 0;
    livePollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/labeling/${jobId}/live`);
        setLiveRows(res.data || []);
        const labels = new Set<string>();
        (res.data || []).forEach((r: RowResult) => r.labels.forEach((l: string) => labels.add(l)));
        setAllLabels(Array.from(labels).sort());
        failCount = 0;
        setReconnecting(false);
      } catch { failCount++; if (failCount >= 3) setReconnecting(true); }
    }, 1500) as unknown as number;
  }, []);

  const startPoll = useCallback((jobId: number) => {
    stopPoll();
    let failCount = 0;
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/labeling/job/${jobId}`);
        setJob(res.data);
        failCount = 0;
        setReconnecting(false);
        if (res.data.status === 'done' || res.data.status === 'failed') {
          stopPoll();
          localStorage.removeItem(`active_job_${id}`);
        }
      } catch { failCount++; if (failCount >= 3) setReconnecting(true); }
    }, 2000) as unknown as number;
  }, [id, stopPoll]);

  const refreshHasKey = useCallback(() => {
    api.get('/projects/ai-config').then(r => {
      setHasKey(r.data.has_key);
      if (r.data.model_name) setCurrentModel(r.data.model_name);
    });
  }, []);

  const reconnectToJob = useCallback(async (jobId: number) => {
    try {
      const res = await api.get(`/labeling/job/${jobId}`);
      setJob(res.data);
      if (res.data.status === 'running' || res.data.status === 'pending') {
        startPoll(jobId); startLivePoll(jobId);
      } else if (res.data.status === 'paused' || res.data.status === 'done') {
        fetchRowsOnce(jobId);
      }
    } catch { localStorage.removeItem(`active_job_${id}`); }
  }, [id, startPoll, startLivePoll]);

  const fetchRowsOnce = async (jobId: number) => {
    try { const res = await api.get(`/labeling/${jobId}/live`); setLiveRows(res.data || []); } catch {}
  };

  useEffect(() => {
    refreshHasKey();
    api.get(`/projects/${id}/datasources`).then(r => setDatasources(r.data));
    api.get(`/projects/${id}/prompts`).then(r => setPrompts(r.data));
    checkExistingJob();
    if (jobIdFromStorage) reconnectToJob(Number(jobIdFromStorage));
    window.addEventListener('ai-config-updated', refreshHasKey);
    window.addEventListener('online', () => {
      const savedJobId = localStorage.getItem(`active_job_${id}`);
      if (savedJobId) reconnectToJob(Number(savedJobId));
    });
    return () => { stopPoll(); window.removeEventListener('ai-config-updated', refreshHasKey); };
  }, [id, jobIdFromStorage]); // eslint-disable-line

  const checkExistingJob = async () => {
    try {
      const res = await api.get(`/labeling/jobs/${id}`);
      if (Array.isArray(res.data) && res.data.length > 0) {
        const active = res.data.find((j: any) =>
          j.status === 'running' || j.status === 'paused' || j.status === 'pending'
        );
        if (active) { localStorage.setItem(`active_job_${id}`, String(active.id)); reconnectToJob(active.id); }
      }
    } catch {}
  };

  const onSelectDS = async (dsId: number) => {
    setSelectedDS(dsId);
    try { const res = await api.get(`/upload/preview-excel/${dsId}`); setColumns(res.data.columns); } catch {}
  };

  const doStartLabeling = async (forceOverride = false) => {
    if (!selectedDS || !selectedPrompt || !targetField) {
      message.warning('请选择数据文件、提示词文档和分析字段');
      return;
    }
    try {
      const payload: any = { project_id: Number(id), data_source_id: selectedDS, prompt_doc_id: selectedPrompt, target_field: targetField, concurrency };
      if (forceOverride) payload.override = 1;
      const res = await api.post('/labeling/start', payload);
      if (res.data.blocked) {
        const { existing_status, message: msg } = res.data;
        if (window.confirm(`${msg}\n\n是否放弃该任务并开始新的分析？`)) {
          await doStartLabeling(true);
        }
        return;
      }
      stopPoll();
      setJob({ ...res.data, labels: [] });
      setLiveRows([]); setAllLabels([]);
      localStorage.setItem(`active_job_${id}`, String(res.data.id));
      startPoll(res.data.id); startLivePoll(res.data.id);
      message.success(`任务已启动（模型: ${currentModel}），共 ${res.data.total_rows} 条数据`);
    } catch (err: any) { message.error(err.response?.data?.detail || '启动失败'); }
  };
  const startLabeling = () => doStartLabeling(false);

  const pauseJob = async () => { /* unchanged */ if (!job) return;
    try { await api.post(`/labeling/${job.id}/pause`); setJob({ ...job, status: 'paused' }); message.info('已暂停'); }
    catch (err: any) { message.error(err.response?.data?.detail || '暂停失败'); }
  };

  const resumeJob = async () => { if (!job) return;
    try { await api.post(`/labeling/${job.id}/resume`);
      setJob({ ...job, status: 'running' }); startPoll(job.id); startLivePoll(job.id); message.info('已继续'); }
    catch (err: any) { message.error(err.response?.data?.detail || '恢复失败'); }
  };

  const downloadResults = () => {
    if (!job) return;
    window.open(`/api/labeling/download/${job.id}?token=${localStorage.getItem('token')}`, '_blank');
  };

  const doneCount = liveRows.filter(r => r.status === 'done').length;
  const errorCount = liveRows.filter(r => r.status === 'error').length;
  const isRunning = job?.status === 'running';
  const isPaused = job?.status === 'paused';

  const filteredRows = liveRows
    .filter(r => { if (statusFilter !== 'all' && r.status !== statusFilter) return false; if (labelFilter && !r.labels.includes(labelFilter)) return false; return true; })
    .sort((a, b) => a.row_index - b.row_index)
    .map(r => ({ ...r, key: r.row_index }));

  return (
    <div>
      <h2>AI 标签分析</h2>
      {currentModel && <Tag style={{ marginBottom: 8 }}>模型: {currentModel}</Tag>}

      {reconnecting && <Alert type="warning" message="网络连接异常，正在重连..." banner style={{ marginBottom: 12 }} />}
      {!hasKey && <Alert type="warning" message="请先在右上角「AI 设置」中配置你的 API Key" style={{ marginBottom: 16 }} />}

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>数据文件：</label>
              <Space.Compact style={{ width: '100%' }}>
                <Upload beforeUpload={uploadExcel} showUploadList={false} accept=".xlsx,.xls">
                  <Button icon={<UploadOutlined />} loading={uploadingExcel}>上传</Button>
                </Upload>
                <Select style={{ flex: 1 }} placeholder="选择 Excel"
                  value={selectedDS} onChange={onSelectDS} allowClear
                  options={datasources.map(d => ({ label: `${d.filename} (${d.row_count}行)`, value: d.id }))} />
              </Space.Compact>
              <details style={{ marginTop: 4 }}><summary style={{ fontSize: 11, color: '#999', cursor: 'pointer' }}>历史文件 ({datasources.length}) · 管理</summary>
                <div style={{ maxHeight: 100, overflow: 'auto', padding: '4px 0' }}>
                  {datasources.map(ds => (
                    <div key={ds.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, padding: '2px 4px' }}>
                      <span style={{color:'#666'}}>{ds.filename} ({ds.row_count}行)</span>
                      <Popconfirm title="删除？" onConfirm={async () => { await api.delete(`/upload/datasource/${ds.id}`); setDatasources(prev => prev.filter(x => x.id !== ds.id)); if (selectedDS === ds.id) setSelectedDS(null); }}>
                        <Button type="link" size="small" danger icon={<DeleteOutlined />} style={{ padding: 0 }} />
                      </Popconfirm>
                    </div>
                  ))}
                </div>
              </details>
            </div>
            <div style={{ flex: 1 }}>
              <label>提示词文档：</label>
              <Space.Compact style={{ width: '100%' }}>
                <Upload beforeUpload={uploadWord} showUploadList={false} accept=".docx">
                  <Button icon={<UploadOutlined />} loading={uploadingWord}>上传</Button>
                </Upload>
                <Select style={{ flex: 1 }} placeholder="选择 Word"
                  value={selectedPrompt} onChange={setSelectedPrompt} allowClear
                  options={prompts.map(p => ({ label: p.filename, value: p.id }))} />
              </Space.Compact>
              <details style={{ marginTop: 4 }}><summary style={{ fontSize: 11, color: '#999', cursor: 'pointer' }}>历史提示词 ({prompts.length}) · 管理</summary>
                <div style={{ maxHeight: 100, overflow: 'auto', padding: '4px 0' }}>
                  {prompts.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, padding: '2px 4px' }}>
                      <span style={{color:'#666'}}>{p.filename}</span>
                      <Popconfirm title="删除？" onConfirm={async () => { await api.delete(`/upload/prompt/${p.id}`); setPrompts(prev => prev.filter(x => x.id !== p.id)); if (selectedPrompt === p.id) setSelectedPrompt(null); }}>
                        <Button type="link" size="small" danger icon={<DeleteOutlined />} style={{ padding: 0 }} />
                      </Popconfirm>
                    </div>
                  ))}
                </div>
              </details>
            </div>
            <div style={{ flex: 1 }}>
              <label>分析字段：</label>
              <Select style={{ width: '100%' }} placeholder="选择文本字段"
                value={targetField || undefined} onChange={setTargetField}
                options={columns.map(c => ({ label: c, value: c }))} />
            </div>
          </div>
          <Space>
            {!isRunning && !isPaused && (
              <>
                <div>
                  <label style={{ marginRight: 6 }}>并发：</label>
                  <Select size="small" style={{ width: 70 }} value={concurrency} onChange={setConcurrency}
                    options={[1,2,3,5,8].map(n=>({label:String(n),value:n}))} />
                </div>
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={startLabeling} disabled={!hasKey}>
                  启动 AI 标注
                </Button>
              </>
            )}
            {(isRunning || isPaused) && (
              <>
                <Button icon={<PauseCircleOutlined />} onClick={pauseJob} disabled={isPaused}>暂停</Button>
                <Button icon={<CaretRightOutlined />} onClick={resumeJob} disabled={isRunning} type="primary">继续</Button>
                {doneCount > 0 && <Button icon={<DownloadOutlined />} onClick={downloadResults}>下载已有结果</Button>}
                <Popconfirm title="确认放弃此任务？" onConfirm={async () => {
                  if (!job) return;
                  stopPoll();
                  try { await api.delete(`/labeling/job/${job.id}`); } catch {}
                  setJob(null); setLiveRows([]); setAllLabels([]);
                  localStorage.removeItem(`active_job_${id}`);
                  message.info('任务已取消');
                }}>
                  <Button danger>取消任务</Button>
                </Popconfirm>
              </>
            )}
          </Space>
        </Space>
      </Card>

      {/* Progress */}
      {job && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
            <Badge status={isRunning?'processing':isPaused?'warning':job.status==='done'?'success':'default'}
              text={isRunning?'分析中':isPaused?'已暂停':job.status==='done'?'已完成':job.status==='pending'?'等待中':job.status} />
            <Progress percent={Math.round(job.progress*100)} style={{flex:1,marginBottom:0}}
              status={isPaused?'exception':isRunning?'active':'normal'} />
            <span style={{whiteSpace:'nowrap',color:'#666'}}>{doneCount}/{job.total_rows||liveRows.length} 条</span>
            {errorCount>0&&<Tag color="red">{errorCount}条出错</Tag>}
          </div>
          {job.status==='done'&&<Button icon={<DownloadOutlined />} onClick={downloadResults}>下载标注结果 Excel</Button>}
          {isPaused&&<Alert type="info" message="点击「继续」恢复分析" style={{marginTop:8}}/>}
        </Card>
      )}

      {/* Live results */}
      {liveRows.length > 0 && (
        <Card title={<Space><span>逐条分析结果</span><Tag color="blue">{doneCount}已完成</Tag></Space>}
          extra={<Space>
            <Select size="small" style={{width:100}} value={statusFilter} onChange={setStatusFilter}
              options={[{label:'全部',value:'all'},{label:'已完成',value:'done'},{label:'待处理',value:'pending'},{label:'出错',value:'error'}]} />
            <Select size="small" style={{width:140}} value={labelFilter||undefined} onChange={v=>setLabelFilter(v||'')} allowClear placeholder="按标签筛选"
              options={allLabels.map(l=>({label:l,value:l}))} />
          </Space>}>
          <Table dataSource={filteredRows}
            columns={[
              {title:'#',dataIndex:'row_index',width:60,fixed:'left' as const},
              {title:'状态',dataIndex:'status',width:80,fixed:'left' as const,
                render:(s:string)=>(s==='done'?<Tag color="success">完成</Tag>:s==='pending'?<Tag>等待</Tag>:s==='error'?<Tag color="red">错误</Tag>:<Tag>{s}</Tag>)},
              {title:'原始文本',dataIndex:'original_text',width:220,ellipsis:true},
              {title:'AI 标签',dataIndex:'labels',width:200,
                render:(labels:string[],record:RowResult)=>{
                  if(!labels||labels.length===0)return<span style={{color:'#999'}}>—</span>;
                  return (<>
                    <Popover content={<div>{labels.map((l,i)=><Tag key={i} color="blue" style={{margin:'2px 0'}}>{l}</Tag>)}</div>} trigger="click">
                      <span style={{cursor:'pointer',color:'#1677ff',borderBottom:'1px dashed #1677ff'}}>{labels.length}个标签...</span>
                    </Popover>
                    <div style={{fontSize:12,color:'#999',marginTop:2}}>{labels.join(', ')}</div>
                  </>);
                }},
              {title:'思考过程',dataIndex:'thinking',width:250,ellipsis:true,
                render:(t:string)=>t?<Popover content={<div style={{maxWidth:400}}>{t}</div>} trigger="hover"><span style={{color:'#666',fontSize:13,cursor:'pointer'}}>{t}</span></Popover>:<span style={{color:'#ccc'}}>—</span>},
              {title:'错误',dataIndex:'error_msg',width:200,ellipsis:true,
                render:(e:string)=>e?<span style={{color:'#ff4d4f',fontSize:12}}>{e}</span>:<span style={{color:'#ccc'}}>—</span>},
            ]}
            size="small" scroll={{x:1000}} pagination={{pageSize:30,showSizeChanger:true,showTotal:(t:number)=>`共${t}条`}}
            locale={{emptyText:'等待处理...'}} />
        </Card>
      )}
    </div>
  );
}
