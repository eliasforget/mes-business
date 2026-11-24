@echo off
node --experimental-strip-types --no-warnings=ExperimentalWarning "%~dp0stats.ts" %*
