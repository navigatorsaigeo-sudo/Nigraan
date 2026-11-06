import { useEffect, useState } from 'react';

const KEY = 'agn.operator.v2';
let allowOn = () => false;

export function setOperatorGuard(fn) {
  allowOn = typeof fn === 'function' ? fn : () => false;
}

export function operatorOn() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setOperator(on) {
  if (on && !allowOn()) on = false;
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch { /* the choice stays for this page view */ }
  document.documentElement.classList.toggle('agn-operator', on);
  window.dispatchEvent(new Event('agn-operator'));
}

export function useOperator() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(operatorOn());
    window.addEventListener('agn-operator', sync);
    return () => window.removeEventListener('agn-operator', sync);
  }, []);
  return on;
}
