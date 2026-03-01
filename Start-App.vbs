Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strDir & "\desktop"
WshShell.Run """" & strDir & "\desktop\node_modules\.bin\electron.cmd"" .", 0, False
