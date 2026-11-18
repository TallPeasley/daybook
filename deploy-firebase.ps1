# Publish Daybook (the site\ folder) to Firebase Hosting, project aero-daybook (https://aero-daybook.web.app).
#   powershell -ExecutionPolicy Bypass -File deploy-firebase.ps1
Set-Location $PSScriptRoot
firebase deploy --only hosting --project aero-daybook
