import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import api from '../services/api';

const STYLES = `
.med-login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #e8f1ff 0%, #e6f9ef 50%, #f0f4f8 100%); position: relative; overflow: hidden; }
.med-login-page::before { content: ''; position: absolute; top: -180px; right: -120px; width: 500px; height: 500px; border-radius: 50%; background: rgba(26,95,180,0.06); }
.med-login-page::after { content: ''; position: absolute; bottom: -140px; left: -100px; width: 400px; height: 400px; border-radius: 50%; background: rgba(38,162,105,0.05); }
.med-login-card { width: 440px; background: #fff; border-radius: 16px; box-shadow: 0 8px 32px rgba(26,95,180,0.12); padding: 40px 36px; position: relative; z-index: 1; }
.med-login-badge { width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, var(--med-blue), var(--med-blue-light)); border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 32px; color: #fff; }
.med-login-title { font-size: 22px; font-weight: 700; text-align: center; color: var(--med-text); margin-bottom: 4px; }
.med-login-subtitle { font-size: 13px; text-align: center; color: var(--med-text-sec); margin-bottom: 32px; }
.med-login-input { height: 46px; border-radius: 8px; }
.med-login-btn { height: 46px; border-radius: 8px; font-size: 15px; font-weight: 600; width: 100%; }
.med-login-footer { text-align: center; margin-top: 20px; font-size: 13px; color: var(--med-text-sec); }
.med-login-footer a { color: var(--med-blue); font-weight: 600; }
`;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', values);
      localStorage.setItem('token', res.data.access_token);
      message.success('登录成功');
      navigate('/projects');
    } catch { message.error('用户名或密码错误'); }
    finally { setLoading(false); }
  };

  return (
    <div className="med-login-page">
      <style>{STYLES}</style>
      <div className="med-login-card">
        <div className="med-login-badge"><MedicineBoxOutlined /></div>
        <div className="med-login-title">卫生投诉分析平台</div>
        <div className="med-login-subtitle">Healthcare Complaint Analysis Platform</div>
        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined style={{ color: '#94a3b8' }} />} placeholder="用户名" className="med-login-input" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#94a3b8' }} />} placeholder="密码" className="med-login-input" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" loading={loading} className="med-login-btn">登 录</Button>
          </Form.Item>
        </Form>
        <div className="med-login-footer">还没有账号？<Link to="/register">立即注册</Link></div>
      </div>
    </div>
  );
}
