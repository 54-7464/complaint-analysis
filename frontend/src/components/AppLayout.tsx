import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Modal, Input, message, Tag, Select } from 'antd';
import {
  ProjectOutlined, LogoutOutlined, KeyOutlined, TagOutlined, BarChartOutlined, FileTextOutlined,
  MedicineBoxOutlined, DashboardOutlined, ExperimentOutlined, FileSearchOutlined, AuditOutlined,
} from '@ant-design/icons';
import api from '../services/api';

const PROVIDER_PRESETS: Record<string, { base_url: string; model: string }> = {
  deepseek: { base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  zhipu: { base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  qwen: { base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  openai: { base_url: 'https://api.openai.com/v1', model: 'gpt-4o' },
  moonshot: { base_url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
};

const { Header, Sider, Content } = Layout;

const STYLES = `
.med-sider { background: linear-gradient(180deg, #0d3b66 0%, #1a5fb4 100%) !important; }
.med-sider .ant-menu { background: transparent; border-right: none; }
.med-sider .ant-menu-item { font-size: 13px; margin: 2px 8px; border-radius: 8px; padding-left: 16px !important; height: 42px; line-height: 42px; color: rgba(255,255,255,0.75); }
.med-sider .ant-menu-item:hover { color: #fff; background: rgba(255,255,255,0.1) !important; }
.med-sider .ant-menu-item-selected { color: #fff !important; background: rgba(255,255,255,0.18) !important; font-weight: 600; }
.med-sider .ant-menu-item .anticon { font-size: 16px; }
.med-header { background: #fff !important; padding: 0 24px !important; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e5e7eb; height: 56px; line-height: 56px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.med-header-left { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: var(--med-text); }
.med-header-right { display: flex; align-items: center; gap: 10px; }
.med-content { background: var(--med-bg) !important; padding: 20px !important; min-height: calc(100vh - 56px); }
.med-logo { display: flex; align-items: center; gap: 10px; padding: 18px 20px; border-bottom: 1px solid rgba(255,255,255,0.12); }
.med-logo-icon { width: 36px; height: 36px; background: rgba(255,255,255,0.2); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #fff; }
.med-logo-text { color: #fff; font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
.med-project-tag { background: rgba(255,255,255,0.15) !important; color: #fff !important; border: none !important; font-size: 12px; padding: 2px 8px; margin-top: 8px; margin-left: 16px; margin-bottom: 5px; display: inline-block; border-radius: 4px; }
`;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiKey, setAiKey] = useState('');
  const [aiUrl, setAiUrl] = useState('https://api.openai.com/v1');
  const [aiModel, setAiModel] = useState('gpt-4o');
  const [hasExistingKey, setHasExistingKey] = useState(false);

  useEffect(() => {
    api.get('/projects/ai-config').then(r => {
      setHasExistingKey(r.data.has_key);
      if (r.data.model_name) setAiModel(r.data.model_name);
      if (r.data.base_url) setAiUrl(r.data.base_url);
    }).catch(() => {});
  }, []);

  const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('has_ai_key'); navigate('/login'); };
  const openAiConfig = async () => {
    try { const res = await api.get('/projects/ai-config'); setAiUrl(res.data.base_url); setAiModel(res.data.model_name); setHasExistingKey(res.data.has_key); setAiKey(''); setAiModalOpen(true); } catch { setAiModalOpen(true); }
  };
  const saveAiConfig = async () => {
    try {
      await api.post('/projects/ai-config', { api_key: aiKey, base_url: aiUrl, model_name: aiModel });
      setHasExistingKey(!!aiKey || hasExistingKey);
      localStorage.setItem('has_ai_key', (!!aiKey || hasExistingKey) ? '1' : '');
      message.success('AI 配置已保存');
      setAiModalOpen(false);
      window.dispatchEvent(new Event('ai-config-updated'));
    } catch { message.error('保存失败'); }
  };

  const isProjectPage = location.pathname.match(/\/projects\/\d+/);
  const projectId = isProjectPage ? location.pathname.split('/')[2] : '';

  const menuItems = [
    { key: '/projects', icon: <ProjectOutlined />, label: '我的项目' },
    ...(projectId ? [
      { key: `/projects/${projectId}`, icon: <DashboardOutlined />, label: '数据与标签' },
      { key: `/projects/${projectId}/labeling`, icon: <ExperimentOutlined />, label: 'AI 标注' },
      { key: `/projects/${projectId}/binarize`, icon: <FileSearchOutlined />, label: '二值化' },
      { key: `/projects/${projectId}/analysis`, icon: <BarChartOutlined />, label: '数据分析' },
      { key: `/projects/${projectId}/report`, icon: <AuditOutlined />, label: '报告分析' },
    ] : []),
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <style>{STYLES}</style>
      <Sider width={220} className="med-sider" trigger={null}>
        <div className="med-logo">
          <div className="med-logo-icon"><MedicineBoxOutlined /></div>
          <div className="med-logo-text">卫生投诉分析</div>
        </div>
        {projectId && <span className="med-project-tag">项目 #{projectId}</span>}
        <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={menuItems} onClick={({ key }) => navigate(key)} />
      </Sider>
      <Layout>
        <Header className="med-header">
          <div className="med-header-left">
            <MedicineBoxOutlined style={{ color: 'var(--med-blue)', fontSize: 20 }} />
            Healthcare Complaint Analysis
          </div>
          <div className="med-header-right">
            <Button icon={<KeyOutlined />} onClick={openAiConfig} size="middle">
              AI 设置 {hasExistingKey && <span style={{ color: 'var(--med-green)', marginLeft: 4, fontSize: 11 }}>●</span>}
            </Button>
            <Button icon={<LogoutOutlined />} onClick={logout} size="middle">退出</Button>
          </div>
        </Header>
        <Content className="med-content">{children}</Content>
      </Layout>

      <Modal title="AI 模型配置" open={aiModalOpen} onOk={saveAiConfig} onCancel={() => setAiModalOpen(false)} okText="保存" cancelText="取消">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          {hasExistingKey && (
            <div style={{ background: '#e6f9ef', border: '1px solid #8bd5a8', padding: '8px 12px', borderRadius: 8, color: '#1e6e42', fontSize: 13 }}>
              已配置 API Key。如需更换，在下方输入新的 Key 即可。
            </div>
          )}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600 }}>快捷选择</label>
            <Select style={{ width: '100%' }} placeholder="选择一个平台自动填入配置" allowClear
              onChange={(val) => { if (val && PROVIDER_PRESETS[val]) { setAiUrl(PROVIDER_PRESETS[val].base_url); setAiModel(PROVIDER_PRESETS[val].model); } }}
              options={[
                { label: 'DeepSeek', value: 'deepseek' }, { label: '智谱 GLM', value: 'zhipu' },
                { label: '通义千问', value: 'qwen' }, { label: 'OpenAI', value: 'openai' }, { label: 'Moonshot', value: 'moonshot' },
              ]} />
          </div>
          <div><label style={{ fontSize: 13, fontWeight: 600 }}>API Base URL</label><Input value={aiUrl} onChange={e => setAiUrl(e.target.value)} /></div>
          <div><label style={{ fontSize: 13, fontWeight: 600 }}>模型名称</label><Input value={aiModel} onChange={e => setAiModel(e.target.value)} /></div>
          <div><label style={{ fontSize: 13, fontWeight: 600 }}>API Key（加密存储）</label><Input.Password value={aiKey} onChange={e => setAiKey(e.target.value)} placeholder={hasExistingKey ? '已配置（输入新Key更换）' : '输入你的 API Key'} /></div>
        </div>
      </Modal>
    </Layout>
  );
}
