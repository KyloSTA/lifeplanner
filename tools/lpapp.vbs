' Lance lpapp.ps1 sans faire apparaître de fenêtre PowerShell (appelé par le lien « lpapp: »).
Dim sh, dir, url
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
url = ""
If WScript.Arguments.Count > 0 Then url = WScript.Arguments(0)
url = Replace(url, """", "")
sh.Run "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & dir & "\lpapp.ps1"" """ & url & """", 0, False
