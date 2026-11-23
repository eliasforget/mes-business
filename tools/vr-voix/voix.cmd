@echo off
rem Lanceur Windows : evite que PowerShell/npm avalent les options (--dry-run, --apercu...).
node --experimental-strip-types --no-warnings=ExperimentalWarning "%~dp0voix.ts" %*
