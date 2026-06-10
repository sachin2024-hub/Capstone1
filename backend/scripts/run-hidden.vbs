' Runs RapidRescue backend + tunnel in the background (no CMD window)
Dim fso, shell, scriptDir, backendDir
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
backendDir = fso.GetParentFolderName(scriptDir)
shell.CurrentDirectory = backendDir
shell.Run "node.exe scripts\start-all.js", 0, False
