@echo off
cd /d "C:\Users\llewe\Documents\00-CODES\01-PERSONAL\wireshare\scrcpy-win64"
scrcpy.exe --pause-on-exit=if-error -s 192.168.1.226:41091 --max-size 1920 --video-bit-rate 8M --max-fps 60 --stay-awake --no-audio
