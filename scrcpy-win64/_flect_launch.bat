@echo off
cd /d "C:\Users\llewe\Documents\00-CODES\01-PERSONAL\flect\scrcpy-win64"
scrcpy.exe --pause-on-exit=if-error -s 192.168.8.123:39909 --max-size 1920 --video-bit-rate 8M --max-fps 60 --stay-awake
