Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' Set working directory to the folder where this script lives
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' Launch Electron without showing a console window
WshShell.Run "cmd /c npx electron .", 0, False
