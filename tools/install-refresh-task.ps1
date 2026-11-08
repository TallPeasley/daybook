# Creates the Windows task "Daybook refresh": every 30 minutes from 8:00 to 14:30, runs
#   node tools/refresh-daybook.mjs --deploy
# which publishes new data to the API, and redeploys only when the page or API code changed.
# The task runs as the signed-in user, so set DAYBOOK_* variables as user environment variables first (see .env.example).
# Remove with:  Unregister-ScheduledTask -TaskName "Daybook refresh" -Confirm:$false
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$action = New-ScheduledTaskAction -Execute $node -Argument "tools\refresh-daybook.mjs --deploy" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At 8:00am   # the 8:00 run exports phone taps before the morning brief runs
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At 8:00am -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Hours 6 -Minutes 31)).Repetition
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "Daybook refresh" -Action $action -Trigger $trigger -Settings $settings -Description "Rebuilds Daybook from the notes vault after the morning brief and publishes it. Log: tools\refresh.log" -Force | Out-Null
Get-ScheduledTask -TaskName "Daybook refresh" | Select-Object TaskName, State
