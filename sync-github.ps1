param(
    [string]$Message
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "git is not installed or not available in PATH."
}

if (-not (Test-Path ".git")) {
    Write-Error "This folder is not a git repository. Run this in the repo root."
}

if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = Read-Host "Commit message"
}

git add .
$hasStaged = git diff --cached --name-only
if ([string]::IsNullOrWhiteSpace(($hasStaged -join ""))) {
    Write-Host "No changes to commit."
    exit 0
}

git commit -m $Message
git push

Write-Host "Sync complete."
