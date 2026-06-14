import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Modal, Input, message, Tag, Select } from 'antd';
import {
  ProjectOutlined,
  LogoutOutlined,
  KeyOutlined,
  TagOutlined,
  BarChartOutlined,
  FileTextOutlined,
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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiKey, setAiKey] = useState('');
  const [aiUrl, setAiUrl] = useState('https://api.openai.com/v1');
  const [aiModel, setAiModel] = useState('gpt-4o');
  const [hasExistingKey, setHasExistingKey] = useState(false);

  // 页面加载时读取已保存的模型名
  useEffect(() => {
    api.get('/projects/ai-config').then(r => {
      setHasExistingKey(r.data.has_key);
      if (r.data.model_name) setAiModel(r.data.model_name);
      if (r.data.base_url) setAiUrl(r.data.base_url);
    }).catch(() => {});
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('has_ai_key');
    navigate('/login');
  };

  const openAiConfig = async () => {
    try {
      const res = await api.get('/projects/ai-config');
      setAiUrl(res.data.base_url);
      setAiModel(res.data.model_name);
      setHasExistingKey(res.data.has_key);
      setAiKey('');
      setAiModalOpen(true);
    } catch {
      setAiModalOpen(true);
    }
  };

  const saveAiConfig = async () => {
    try {
      await api.post('/projects/ai-config', {
        api_key: aiKey,
        base_url: aiUrl,
        model_name: aiModel,
      });
      const hasKeyNow = !!aiKey || hasExistingKey;
      setHasExistingKey(hasKeyNow);
      localStorage.setItem('has_ai_key', hasKeyNow ? '1' : '');
      message.success('AI 配置已保存');
      setAiModalOpen(false);
      // 如果只是保存了key，通知标注页面刷新
      window.dispatchEvent(new Event('ai-config-updated'));
    } catch {
      message.error('保存失败');
    }
  };

  const isProjectPage = location.pathname.match(/\/projects\/\d+/);
  const projectId = isProjectPage ? location.pathname.split('/')[2] : '';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} theme="dark">
        <div style={{ color: '#fff', padding: '20px 16px', fontSize: 16, fontWeight: 700 }}>
          卫生投诉分析平台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={[
            { key: '/projects', icon: <ProjectOutlined />, label: '项目列表' },
            ...(projectId
              ? [
                  { key: `/projects/${projectId}`, icon: <TagOutlined />, label: '数据与标签' },
                  { key: `/projects/${projectId}/labeling`, icon: <TagOutlined />, label: 'AI 标签' },
                  { key: `/projects/${projectId}/binarize`, icon: <BarChartOutlined />, label: '二值化' },
                  { key: `/projects/${projectId}/analysis`, icon: <BarChartOutlined />, label: '数据分析' },
                  { key: `/projects/${projectId}/report`, icon: <FileTextOutlined />, label: '报告' },
                ]
              : []),
          ]}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          <Button icon={<KeyOutlined />} onClick={openAiConfig}>
            AI 设置
            {hasExistingKey && <Tag color="green" style={{ marginLeft: 4 }}>{aiModel || '已配置'}</Tag>}
          </Button>
          <Button icon={<LogoutOutlined />} onClick={logout}>退出</Button>
        </Header>
        <Content style={{ margin: 16, padding: 24, background: '#fff', borderRadius: 8, overflow: 'auto' }}>
          {children}
        </Content>
      </Layout>

      <Modal title="AI 模型配置" open={aiModalOpen} onOk={saveAiConfig} onCancel={() => setAiModalOpen(false)} okText="保存" cancelText="取消">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          {hasExistingKey && (
            <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', padding: '8px 12px', borderRadius: 4, color: '#52c41a' }}>
              已配置 API Key。如需更换，在下方输入新的 Key 即可。
            </div>
          )}
          <div>
            <label>快捷选择</label>
            <Select
              style={{ width: '100%' }}
              placeholder="选择一个平台自动填入配置…"
              allowClear
              onChange={(val) => {
                if (val && PROVIDER_PRESETS[val]) {
                  setAiUrl(PROVIDER_PRESETS[val].base_url);
                  setAiModel(PROVIDER_PRESETS[val].model);
                }
              }}
              options={[
                { label: 'DeepSeek', value: 'deepseek' },
                { label: '智谱 GLM', value: 'zhipu' },
                { label: '通义千问', value: 'qwen' },
                { label: 'OpenAI', value: 'openai' },
                { label: 'Moonshot', value: 'moonshot' },
              ]}
            />
          </div>
          <div>
            <label>API Base URL</label>
            <Input value={aiUrl} onChange={(e) => setAiUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
          </div>
          <div>
            <label>模型名称</label>
            <Input value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder="gpt-4o" />
          </div>
          <div>
            <label>API Key（加密存储，不会明文显示）</label>
            <Input.Password
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              placeholder={hasExistingKey ? '已配置（如需更换 Key 请在此输入）' : '输入你的 API Key'}
            />
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
