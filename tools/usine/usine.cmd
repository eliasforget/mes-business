@echo off
rem Lanceur Windows de l'usine (aussi utilise par le Planificateur de taches).
node --experimental-strip-types --no-warnings=ExperimentalWarning "%~dp0usine.ts" %*
