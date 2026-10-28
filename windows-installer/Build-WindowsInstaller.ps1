$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $PSScriptRoot 'FranCeeHostelSetup.cs'
$iconCandidates = @(
	(Join-Path $root 'icons\icon-192.png'),
	(Join-Path $root 'icon-192.png')
)
$iconPath = $iconCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$outputPath = Join-Path $PSScriptRoot 'FranCeeHostelSetup.exe'
$compilerPath = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path -LiteralPath $compilerPath)) {
	throw 'The Windows .NET Framework C# compiler is required to build the installer.'
}
if (-not (Test-Path -LiteralPath $iconPath)) {
	throw 'The FranCee Hostel app icon was not found.'
}

& $compilerPath /nologo /target:winexe /platform:anycpu `
	/reference:System.Windows.Forms.dll `
	/reference:Microsoft.CSharp.dll `
	/resource:"$iconPath,FranCeeHostel.icon-192.png" `
	/out:"$outputPath" `
	"$sourcePath"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $outputPath)) {
	throw "The Windows setup executable could not be built (compiler exit code $LASTEXITCODE)."
}

$installer = Get-Item -LiteralPath $outputPath
Write-Output "Created $($installer.FullName) ($($installer.Length) bytes)"
