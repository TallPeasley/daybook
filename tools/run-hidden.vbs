' Hidden launcher for Daybook's Node scripts: runs node from the Daybook folder with no console window
' (window style 0), waits for it to finish, and passes node's exit code back to Task Scheduler.
'   wscript.exe "<Daybook>\tools\run-hidden.vbs"                            -> node tools\refresh-daybook.mjs --deploy
'                                                                              (the old "Daybook refresh" task)
'   wscript.exe "<Daybook>\tools\run-hidden.vbs" tools\daybook-service.mjs  -> node tools\daybook-service.mjs
'                                                                              (the "Daybook service" task, at sign-in)
' Logging is unchanged: the scripts append to tools\refresh.log themselves.
Option Explicit
Dim fso, sh, root, node, cmd, code, i
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
node = "C:\Program Files\nodejs\node.exe"
sh.CurrentDirectory = root
If WScript.Arguments.Count = 0 Then
  cmd = """" & node & """ tools\refresh-daybook.mjs --deploy"
Else
  cmd = """" & node & """"
  For i = 0 To WScript.Arguments.Count - 1
    cmd = cmd & " """ & WScript.Arguments(i) & """"
  Next
End If
code = sh.Run(cmd, 0, True)
WScript.Quit code
