# Registers the Windows Scheduled Task "Daybook Bark Sync"
# Runs tools\sync-bark-leads-cron.mjs every 2 hours (8:00 AM - 10:00 PM) silently in the background with run-hidden.vbs
$root = Split-Path -Parent $PSScriptRoot
$action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wscript.exe" -Argument "`"$root\tools\run-hidden.vbs`" tools\sync-bark-leads-cron.mjs" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At 8:00am
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At 8:00am -RepetitionInterval (New-TimeSpan -Hours 2) -RepetitionDuration (New-TimeSpan -Hours 14)).Repetition
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "Daybook Bark Sync" -Action $action -Trigger $trigger -Settings $settings -Description "Runs Bark leads sync and Gemini qualification every 2 hours from 8:00 AM to 10:00 PM, posting updates directly to Daybook on Firebase." -Force | Out-Null
Start-ScheduledTask -TaskName "Daybook Bark Sync"
Get-ScheduledTask -TaskName "Daybook Bark Sync" | Select-Object TaskName, State
