@echo off
rem Lanceur Windows : planche contact d'une video de gameplay (pour les commentaires de l'Agent web).
node --experimental-strip-types --no-warnings=ExperimentalWarning "%~dp0planche.ts" %*
