#!/usr/bin/env python3
"""v91.17.283.10 . agent 6 (experimentation): run ONE candidate script and measure it.
usage: python exp_run.py <meter json> <script.py> [script args ...]
The script runs in this process (runpy, as __main__, with its own argv), so the peak memory measured is the script's own:
  POSIX   resource.getrusage(RUSAGE_SELF).ru_maxrss (kB on Linux)
  Windows GetProcessMemoryInfo PeakWorkingSetSize (ctypes, psapi), no extra package
The meter file gets {script, args, startedUtc, endedUtc, wallS, cpuS, peakRssMb, exit, error}. It is written even when the script fails.
No network code: the agent's import graph test reads this file."""
import sys, os, json, time, runpy, traceback, datetime


def peak_mb():
    try:
        if os.name == 'nt':
            import ctypes
            from ctypes import wintypes

            class PMC(ctypes.Structure):
                _fields_ = [('cb', wintypes.DWORD), ('PageFaultCount', wintypes.DWORD), ('PeakWorkingSetSize', ctypes.c_size_t),
                            ('WorkingSetSize', ctypes.c_size_t), ('QuotaPeakPagedPoolUsage', ctypes.c_size_t), ('QuotaPagedPoolUsage', ctypes.c_size_t),
                            ('QuotaPeakNonPagedPoolUsage', ctypes.c_size_t), ('QuotaNonPagedPoolUsage', ctypes.c_size_t), ('PagefileUsage', ctypes.c_size_t),
                            ('PeakPagefileUsage', ctypes.c_size_t)]
            c = PMC(); c.cb = ctypes.sizeof(PMC)
            k32 = ctypes.WinDLL('kernel32'); ps = ctypes.WinDLL('psapi')
            k32.GetCurrentProcess.restype = wintypes.HANDLE
            if ps.GetProcessMemoryInfo(k32.GetCurrentProcess(), ctypes.byref(c), c.cb):
                return round(c.PeakWorkingSetSize / 1048576.0, 1)
            return None
        import resource
        r = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return round(r / 1024.0, 1) if sys.platform != 'darwin' else round(r / 1048576.0, 1)
    except Exception:
        return None


def main():
    meter, script, rest = sys.argv[1], sys.argv[2], sys.argv[3:]
    rec = {'script': os.path.basename(script), 'args': rest, 'startedUtc': datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).isoformat(timespec='seconds') + 'Z', 'exit': 0, 'error': None}
    t0 = time.time(); c0 = time.process_time()
    sys.argv = [script] + rest
    sys.path.insert(0, os.path.dirname(os.path.abspath(script)))
    try:
        runpy.run_path(script, run_name='__main__')
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
        rec['exit'] = code
    except BaseException as e:
        rec['exit'] = 1; rec['error'] = (type(e).__name__ + ': ' + str(e))[:600]
        traceback.print_exc()
    rec['wallS'] = round(time.time() - t0, 1); rec['cpuS'] = round(time.process_time() - c0, 1); rec['peakRssMb'] = peak_mb()
    rec['endedUtc'] = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).isoformat(timespec='seconds') + 'Z'
    tmp = meter + '.tmp'
    with open(tmp, 'w') as f: json.dump(rec, f, indent=1)
    os.replace(tmp, meter)
    sys.exit(rec['exit'])


if __name__ == '__main__':
    main()
