@echo off
rem Lanceur PowerShell : evite que « npm run ... -- --option » perde les options.
node --experimental-strip-types --no-warnings=ExperimentalWarning "%~dp0rendu.ts" %*
