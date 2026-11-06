import { useEffect, useState } from 'react';
import StartPage from './pages/StartPage.jsx';
import AnalystPage from './pages/AnalystPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import { CustomizeRoute } from './GateLock.jsx';
import NetBar from './components/NetBar.jsx';
import { startPrefetch } from './prefetch.js';

function Route({ path }) {
  if (path === '/analyst' || path.startsWith('/analyst/')) return <AnalystPage />;
  if (path === '/dashboard' || path.startsWith('/dashboard/')) return <DashboardPage />;
  if (path === '/customize' || path.startsWith('/customize/')) return <CustomizeRoute />;
  return <StartPage />;
}

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => { startPrefetch(); }, []);
  return (
    <>
      <NetBar />
      <Route path={path} />
    </>
  );
}
