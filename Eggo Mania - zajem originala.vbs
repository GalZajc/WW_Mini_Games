Option Explicit
Dim shell, files, root, python, script
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
python = root & "\runtime\python\pythonw.exe"
If Not files.FileExists(python) Then
    python = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\Python\Python312\pythonw.exe"
End If
script = root & "\tools\eggo-recorder\launch.py"
If Not files.FileExists(python) Then
    MsgBox "Python 3.12 was not found: " & python, vbExclamation, "Eggo Mania"
    WScript.Quit 1
End If
shell.CurrentDirectory = root
shell.Run Chr(34) & python & Chr(34) & " " & Chr(34) & script & Chr(34), 0, False
