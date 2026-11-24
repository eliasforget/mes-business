<#
  Enregistre l'usine dans le Planificateur de tâches Windows : elle vérifie GitHub toutes les 5 minutes
  (et à l'ouverture de session), sans fenêtre, tant que le PC est allumé.

    .\installer.ps1                 → installe (ou met à jour) la tâche, puis lance un premier passage
    .\installer.ps1 -Minutes 30     → toutes les 30 minutes
    .\installer.ps1 -Desinstaller   → supprime la tâche
#>
param(
  [ValidateRange(5, 1440)][int]$Minutes = 5,
  [switch]$Desinstaller
)
$ErrorActionPreference = 'Stop'
$NomTache = 'Usine videos (automatisations)'

if ($Desinstaller) {
  Unregister-ScheduledTask -TaskName $NomTache -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Tâche « $NomTache » supprimée."
  return
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js introuvable dans le PATH.' }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git introuvable dans le PATH.' }

$lanceur = Join-Path $PSScriptRoot 'usine.cmd'
# conhost --headless : aucune fenêtre ne s'ouvre pendant que tu joues ou travailles.
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless cmd.exe /c `"$lanceur`"" -WorkingDirectory $PSScriptRoot
$regulier = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes $Minutes)
# Nom complet du compte (PC\utilisateur) : le nom court seul est refusé par le Planificateur sur certains PC.
$moi = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$ouverture = New-ScheduledTaskTrigger -AtLogOn -User $moi
$reglages = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable
$compte = New-ScheduledTaskPrincipal -UserId $moi -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $NomTache -Action $action -Trigger $regulier, $ouverture -Settings $reglages -Principal $compte `
  -Description "Récupère sur GitHub les vidéos préparées par les agents, les fabrique (voix, fonds, rendu) et les range dans « A publier »." -Force | Out-Null

Write-Host "Tâche « $NomTache » installée : toutes les $Minutes minutes et à l'ouverture de session."
Write-Host 'Premier passage maintenant (dry-run, rien n''est dépensé) :'
& $lanceur --dry-run
