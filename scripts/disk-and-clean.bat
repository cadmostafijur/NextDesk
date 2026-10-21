@echo off
echo === Disk free ===
wmic logicaldisk get Caption,FreeSpace,Size
echo === Cargo registry size on C ===
dir "%USERPROFILE%\.cargo\registry" 2>nul
echo === Cleaning unused cargo git/registry caches (safe) ===
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
cargo cache -a 2>nul
REM Remove broken webview2 unpack if present
rmdir /s /q "%USERPROFILE%\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\webview2-com-sys-0.39.1" 2>nul
REM Clear temp
del /q /f /s "%TEMP%\*.*" >nul 2>&1
echo done
wmic logicaldisk where "Caption='C:'" get FreeSpace
