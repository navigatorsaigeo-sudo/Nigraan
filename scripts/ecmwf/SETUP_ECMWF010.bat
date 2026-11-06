@echo off
rem v91.17.283.2 - installs the two Python packages the ECMWF 0.1 deg fetcher needs: numpy and eccodes.
rem Both come as Windows binary wheels from PyPI (eccodes-2.50.0-cp3xx-win_amd64.whl carries eccodes.dll, the GRIB definitions
rem and the CCSDS/AEC decoder, so nothing else is installed). The same Python the NIGRAAN server starts is used:
rem %LOCALAPPDATA%\Python\bin\python.exe when present, else the py launcher.
cd /d "D:\NIGRAAN\nig\nigraan-local"
set "PYEXE=py -3"
if exist "%LOCALAPPDATA%\Python\bin\python.exe" set "PYEXE=%LOCALAPPDATA%\Python\bin\python.exe"
if not "%NIGRAAN_PYTHON%"=="" set "PYEXE=%NIGRAAN_PYTHON%"
echo Python: %PYEXE%
%PYEXE% -m pip install --upgrade --only-binary=:all: numpy eccodes
if errorlevel 1 echo pip failed: check the internet connection and run this file again.
%PYEXE% -c "import eccodes, numpy; print('eccodes', eccodes.__version__, 'library', eccodes.codes_get_api_version(), 'numpy', numpy.__version__)"
pause
