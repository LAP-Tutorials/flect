Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
scrcpyPath = fso.BuildPath(strPath, "scrcpy.exe")
strCommand = Chr(34) & scrcpyPath & Chr(34)
strCommand = strCommand & " " & Chr(34) & "-s" & Chr(34)
strCommand = strCommand & " " & Chr(34) & "10.124.37.202:33137" & Chr(34)
CreateObject("Wscript.Shell").Run strCommand, 0, false
