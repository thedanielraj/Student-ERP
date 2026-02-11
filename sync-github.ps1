param(
    [string]$Message
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )
    & git @Args
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Args -join ' ') failed with exit code $LASTEXITCODE"
    }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "git is not installed or not available in PATH."
}

if (-not (Test-Path ".git")) {
    Write-Error "This folder is not a git repository. Run this in the repo root."
}

if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = Read-Host "Commit message"
}

Invoke-Git -Args @("add", ".")
$hasStaged = & git diff --cached --name-only
if ($LASTEXITCODE -ne 0) {
    throw "git diff --cached --name-only failed with exit code $LASTEXITCODE"
}
if ([string]::IsNullOrWhiteSpace(($hasStaged -join ""))) {
    Write-Host "No changes to commit."
    exit 0
}

Invoke-Git -Args @("commit", "-m", $Message)
Invoke-Git -Args @("push")

Write-Host "Sync complete."
