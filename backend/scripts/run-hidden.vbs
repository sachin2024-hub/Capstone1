' Runs RapidRescue backend + tunnel in the background (no CMD window)
Dim fso, shell, scriptDir, backendDir, nodeExe
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
backendDir = fso.GetParentFolderName(scriptDir)
shell.CurrentDirectory = backendDir
nodeExe = "node.exe"
shell.Run nodeExe & " scripts\start-all.js", 0, False
