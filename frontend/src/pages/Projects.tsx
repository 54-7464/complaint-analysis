import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, List, Modal, Input, message, Popconfirm, Empty } from 'antd';
import { PlusOutlined, FolderOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../services/api';

interface Project {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await api.get('/projects');
      setProjects(res.data);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProjects(); }, []);

  const createProject = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.post('/projects', { name, description: desc });
      message.success('项目已创建');
      setModalOpen(false);
      setName('');
      setDesc('');
      fetchProjects();
    } catch { message.error('创建失败'); }
    finally { setCreating(false); }
  };

  const deleteProject = async (id: number) => {
    try {
      await api.delete(`/projects/${id}`);
      message.success('已删除');
      fetchProjects();
    } catch { message.error('删除失败'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>我的项目</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新建项目</Button>
      </div>
      <List
        loading={loading}
        dataSource={projects}
        locale={{ emptyText: <Empty description="还没有项目，点击上方按钮创建" /> }}
        renderItem={(p) => (
          <Card
            hoverable
            style={{ marginBottom: 12 }}
            onClick={() => navigate(`/projects/${p.id}`)}
            extra={
              <Popconfirm title="确认删除？" onConfirm={(e) => { e?.stopPropagation(); deleteProject(p.id); }}
                onCancel={(e) => e?.stopPropagation()}>
                <Button type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
              </Popconfirm>
            }
          >
            <Card.Meta
              avatar={<FolderOutlined style={{ fontSize: 24, color: '#1677ff' }} />}
              title={p.name}
              description={<>{p.description || '—'}<br /><small>{new Date(p.created_at).toLocaleString('zh-CN')}</small></>}
            />
          </Card>
        )}
      />
      <Modal title="新建项目" open={modalOpen} onOk={createProject} onCancel={() => setModalOpen(false)}
        okText="创建" cancelText="取消" confirmLoading={creating}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <Input placeholder="项目名称" value={name} onChange={(e) => setName(e.target.value)} />
          <Input.TextArea placeholder="项目描述（可选）" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
        </div>
      </Modal>
    </div>
  );
}
