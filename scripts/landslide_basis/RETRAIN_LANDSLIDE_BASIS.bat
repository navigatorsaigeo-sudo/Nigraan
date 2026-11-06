@echo off
rem v283 WS5 - landslide retrain on ONE rain basis. Run after FETCH_LANDSLIDE_BASIS.bat finished without failures.
rem This version writes CANDIDATE files only. Nothing the live server reads is changed; v283 deploy installs what passed.
cd /d "D:\NIGRAAN\nig\nigraan-local"
python -c "import numpy, pandas, scipy, sklearn" || (echo Missing Python packages. Run: python -m pip install numpy pandas scipy scikit-learn & pause & exit /b 1)
if exist data\landslide-basis\landslide-odds-model.monotone.json del data\landslide-basis\landslide-odds-model.monotone.json
python scripts\gen\ws5\landslide_monotone_test.py "D:\NIGRAAN\nig\station-lake\reports\landslide_events.csv" data\landslide-basis\cache data\landslide-basis\monotone_test.json --era5 --served-model data\landslide-odds-model.json --write-model data\landslide-basis\landslide-odds-model.monotone.json
if exist data\landslide-basis\landslide-odds-model.monotone.json (echo Monotone model PASSED its rule - candidate saved in data\landslide-basis) else (echo Monotone model did not pass its rule - see data\landslide-basis\monotone_test.json)
python scripts\gen\ws5\landslide_basis_fit.py data\landslide-basis server\contract\units.json data\landslide-odds-model.json data\landslide-basis\landslide-basis-map.candidate.json data\landslide-basis\basis_fit_test.json
echo Rain-basis mapping candidate: data\landslide-basis\landslide-basis-map.candidate.json  (test: data\landslide-basis\basis_fit_test.json)
pause
