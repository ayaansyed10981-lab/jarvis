' Start Jarvis in complete stealth 24/7 background mode (zero console window)
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)

WshShell.CurrentDirectory = ScriptDir
' Run hidden (window style 0, false for non-blocking background)
WshShell.Run "node.exe """ & ScriptDir & "\src\index.js""", 0, False
