strCommand = "cmd /c scrcpy.exe -s 10.206.85.202:35505"
WScript.Echo "Running: " & strCommand
CreateObject("Wscript.Shell").Run strCommand, 1, false
