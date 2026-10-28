Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' Set working directory to the folder where this script lives
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' Launch Electron without showing a console window
electronPath = fso.BuildPath(scriptDir, "node_modules\electron\dist\electron.exe")
If fso.FileExists(electronPath) Then
    WshShell.Run Chr(34) & electronPath & Chr(34) & " .", 0, False
Else
    WshShell.Run "cmd /c npx electron .", 0, False
End If
