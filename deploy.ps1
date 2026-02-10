# FileTextReaderGAS デプロイスクリプト (PowerShell版)
# Usage: .\deploy.ps1 [-h|--help]

param(
    [switch]$h,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
    @"
Usage: .\deploy.ps1 [options]

Options:
  -h, --help  このヘルプを表示します。
"@
}

if ($h -or $Help) {
    Show-Help
    exit 0
}

Write-Host "デプロイを開始します..." -ForegroundColor Cyan

# 既存デプロイ情報の読み込み
$DeployCacheFile = ".gas-deployment.json"
$ExistingDeploymentId = ""
$ExistingWebAppUrl = ""

if (Test-Path $DeployCacheFile) {
    try {
        $cacheData = Get-Content $DeployCacheFile -Raw | ConvertFrom-Json
        if ($cacheData.deploymentId) {
            $ExistingDeploymentId = $cacheData.deploymentId
        }
        if ($cacheData.webAppUrl) {
            $ExistingWebAppUrl = $cacheData.webAppUrl
        }
    } catch {
        # キャッシュ読み込み失敗は無視
    }
}

# プロジェクトをプッシュ
Write-Host "プロジェクトファイルをGoogle Apps Scriptにプッシュ中..." -ForegroundColor Yellow
clasp push
if ($LASTEXITCODE -ne 0) {
    Write-Host "プッシュに失敗しました" -ForegroundColor Red
    exit 1
}
Write-Host "プッシュが完了しました" -ForegroundColor Green

# デプロイ
Write-Host "デプロイ中..." -ForegroundColor Yellow

$version = Get-Date -Format "yyyyMMdd_HHmmss"
$deployArgs = @("deploy", "--description", "FileTextReaderGAS v$version")

if ($ExistingDeploymentId -ne "") {
    $deployArgs += "--deploymentId"
    $deployArgs += $ExistingDeploymentId
}

$DeploymentId = ""
$WebAppUrl = ""

# デプロイ実行
$deployOutput = & clasp @deployArgs 2>&1 | Out-String

if ($LASTEXITCODE -ne 0) {
    Write-Host "デプロイに失敗しました" -ForegroundColor Red
    Write-Host $deployOutput
    exit 1
}

Write-Host "デプロイが完了しました" -ForegroundColor Green
Write-Host $deployOutput

# WebApp URLを出力から抽出
if ($deployOutput -match 'https://script\.google\.com/macros/s/[^\s]+') {
    $WebAppUrl = $Matches[0]
}

# URLからdeploymentIdを抽出
if ($WebAppUrl -match '/macros/s/([^/]+)/') {
    $DeploymentId = $Matches[1]
}

# それでも取れない場合はAKfで始まるIDを探す
if ($DeploymentId -eq "" -and $deployOutput -match 'AKf[A-Za-z0-9_\-]+') {
    $DeploymentId = $Matches[0]
}

# Script IDを取得
$ScriptId = ""
if (Test-Path ".clasp.json") {
    try {
        $claspJson = Get-Content ".clasp.json" -Raw | ConvertFrom-Json
        $ScriptId = $claspJson.scriptId
    } catch {
        # 無視
    }
}

# デプロイメント一覧から取得（IDが取れなかった場合）
if ($DeploymentId -eq "" -and $WebAppUrl -eq "") {
    Write-Host "デプロイメント情報を取得中..." -ForegroundColor Yellow
    $deploymentsOutput = & clasp deployments 2>&1 | Out-String
    if ($deploymentsOutput -match '@HEAD.*?(AKf[A-Za-z0-9_\-]+)') {
        $DeploymentId = $Matches[1]
        $WebAppUrl = "https://script.google.com/macros/s/$DeploymentId/exec"
    }
}

# デプロイ時刻（JST）
$DeployTimestamp = (Get-Date).ToUniversalTime().AddHours(9).ToString("yyyy-MM-dd HH:mm:ss") + " JST"

# 結果表示
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "デプロイ情報" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Write-Host "デプロイ時刻: $DeployTimestamp"

if ($DeploymentId -ne "") {
    Write-Host "Deployment ID: $DeploymentId"
}

if ($WebAppUrl -ne "") {
    Write-Host ""
    Write-Host "Web App URL:"
    Write-Host "   $WebAppUrl" -ForegroundColor Green
    Write-Host ""
} elseif ($DeploymentId -ne "") {
    $WebAppUrl = "https://script.google.com/macros/s/$DeploymentId/exec"
    Write-Host ""
    Write-Host "Web App URL:"
    Write-Host "   $WebAppUrl" -ForegroundColor Green
    Write-Host ""
}

if ($ScriptId -ne "") {
    Write-Host "Script ID: $ScriptId"
    $AdminEditUrl = "https://script.google.com/home/projects/$ScriptId/edit"
    Write-Host "管理画面: $AdminEditUrl"
}

Write-Host "==========================================" -ForegroundColor Cyan

# デプロイ情報をキャッシュ
if ($DeploymentId -ne "" -or $WebAppUrl -ne "") {
    $cacheData = @{}
    if ($DeploymentId -ne "") {
        $cacheData["deploymentId"] = $DeploymentId
    }
    if ($WebAppUrl -ne "") {
        $cacheData["webAppUrl"] = $WebAppUrl
    }
    $cacheData | ConvertTo-Json | Set-Content $DeployCacheFile -Encoding UTF8
}

# アクセス権限の警告
if ($WebAppUrl -ne "") {
    try {
        $response = Invoke-WebRequest -Uri $WebAppUrl -Method Head -MaximumRedirection 0 -ErrorAction SilentlyContinue
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 401) {
            Write-Host "Web App が HTTP $statusCode を返しました。公開設定が正しいか確認してください。" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "デプロイが正常に完了しました！" -ForegroundColor Green
