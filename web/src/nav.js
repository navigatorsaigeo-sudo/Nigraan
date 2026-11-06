export function go(path) {
  /* Hand the active place to classic Customize (/n3) when the React shell
     opens it — same localStorage contract the sealed page already reads. */
  try {
    if (String(path || '').startsWith('/customize')) {
      const match = /[#&]agnplace=(-?[0-9.]+),(-?[0-9.]+)(?:,([^&]*))?/.exec(path)
        || /[#&]agnplace=(-?[0-9.]+),(-?[0-9.]+)(?:,([^&]*))?/.exec(window.location.hash || '');
      if (match) {
        let name = '';
        try { name = match[3] ? decodeURIComponent(match[3]) : ''; } catch { name = ''; }
        localStorage.setItem('agn.switchPlace', JSON.stringify({
          lat: +match[1],
          lon: +match[2],
          name,
          t: Date.now(),
        }));
      }
    }
  } catch { /* ignore */ }
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
