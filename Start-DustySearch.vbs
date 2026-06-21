Set shell = CreateObject("WScript.Shell")
appDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = appDir
shell.Run Chr(34) & appDir & "\node_modules\electron\dist\electron.exe" & Chr(34) & " " & Chr(34) & appDir & Chr(34), 0, False
