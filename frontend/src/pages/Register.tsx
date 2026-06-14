import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import api from '../services/api';

const STYLES = `
.med-register-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #e6f9ef 0%, #e8f1ff 50%, #f0f4f8 100%); position: relative; overflow: hidden; }
.med-register-page::before { content: ''; position: absolute; top: -200px; left: -100px; width: 450px; height: 450px; border-radius: 50%; background: rgba(38,162,105,0.06); }
.med-register-page::after { content: ''; position: absolute; bottom: -160px; right: -80px; width: 380px; height: 380px; border-radius: 50%; background: rgba(26,95,180,0.05); }
.med-register-card { width: 440px; background: #fff; border-radius: 16px; box-shadow: 0 8px 32px rgba(26,95,180,0.12); padding: 40px 36px; position: relative; z-index: 1; }
.med-register-badge { width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #26a269, #33d17a); border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 32px; color: #fff; }
.med-register-title { font-size: 22px; font-weight: 700; text-align: center; color: var(--med-text); margin-bottom: 4px; }
.med-register-subtitle { font-size: 13px; text-align: center; color: var(--med-text-sec); margin-bottom: 32px; }
.med-register-input { height: 46px; border-radius: 8px; }
.med-register-btn { height: 46px; border-radius: 8px; font-size: 15px; font-weight: 600; width: 100%; }
.med-register-footer { text-align: center; margin-top: 20px; font-size: 13px; color: var(--med-text-sec); }
.med-register-footer a { color: var(--med-blue); font-weight: 600; }
`;

export default function Register() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: { username: string; password: string }) => {
    if (values.password.length < 4) { message.error('密码至少4位'); return; }
    setLoading(true);
    try {
      await api.post('/auth/register', values);
      message.success('注册成功，请登录');
      navigate('/login');
    } catch (err: any) { message.error(err.response?.data?.detail || '注册失败'); }
    finally { setLoading(false); }
  };

  return (
    <div className="med-register-page">
      <style>{STYLES}</style>
      <div className="med-register-card">
        <div className="med-register-badge"><MedicineBoxOutlined /></div>
        <div className="med-register-title">创建新账号</div>
        <div className="med-register-subtitle">Register Health Complaint Analysis Account</div>
        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined style={{ color: '#94a3b8' }} />} placeholder="用户名" className="med-register-input" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#94a3b8' }} />} placeholder="密码（至少4位）" className="med-register-input" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" loading={loading} className="med-register-btn">注 册</Button>
          </Form.Item>
        </Form>
        <div className="med-register-footer">已有账号？<Link to="/login">去登录</Link></div>
      </div>
    </div>
  );
}
