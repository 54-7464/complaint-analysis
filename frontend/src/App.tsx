import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Labeling from './pages/Labeling';
import Binarization from './pages/Binarization';
import Analysis from './pages/Analysis';
import Report from './pages/Report';
import AppLayout from './components/AppLayout';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  return token ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <AppLayout>
              <Routes>
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/projects/:id/labeling" element={<Labeling />} />
                <Route path="/projects/:id/binarize" element={<Binarization />} />
                <Route path="/projects/:id/analysis" element={<Analysis />} />
                <Route path="/projects/:id/report" element={<Report />} />
                <Route path="*" element={<Navigate to="/projects" />} />
              </Routes>
            </AppLayout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}
