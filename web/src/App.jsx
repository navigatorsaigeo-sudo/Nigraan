import { lazy, Suspense, useEffect, useState } from 'react';
import StartPage from './pages/StartPage.jsx';
import NetBar from './components/NetBar.jsx';
import { startPrefetch } from './prefetch.js';

const AnalystPage = lazy(() => import('./pages/AnalystPage.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const CustomizeRoute = lazy(() => import('./GateLock.jsx').then((mod) => ({ default: mod.CustomizeRoute })));

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
      <Suspense fallback={null}>
        <Route path={path} />
      </Suspense>
    </>
  );
}
