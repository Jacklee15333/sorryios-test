Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

strDesktop = objShell.SpecialFolders("Desktop")
strProjectDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
strVBS = strProjectDir & "\Sorryios-AI.vbs"

Set oLink = objShell.CreateShortcut(strDesktop & "\Sorryios AI.lnk")
oLink.TargetPath = "wscript.exe"
oLink.Arguments = Chr(34) & strVBS & Chr(34)
oLink.WorkingDirectory = strProjectDir
oLink.Description = "Sorryios AI Smart Note System"
oLink.WindowStyle = 7
oLink.IconLocation = strProjectDir & "\desktop\app.ico,0"
oLink.Save

MsgBox "Desktop shortcut created!" & vbCrLf & vbCrLf & "You can now double-click 'Sorryios AI' on your desktop to launch.", vbInformation, "Sorryios AI"
