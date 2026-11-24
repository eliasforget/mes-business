@echo off
rem Lanceur Windows : evite que PowerShell/npm avalent les options (--dry-run, --produire...).
node --experimental-strip-types --no-warnings=ExperimentalWarning "%~dp0clips.ts" %*
