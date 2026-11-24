@echo off
node --experimental-strip-types --no-warnings=ExperimentalWarning "%~dp0compil.ts" %*
