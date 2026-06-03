param(
  [string[]]$Urls = @(
    "https://www.global-lms.org",
    "https://www.global-lms.org/api/health",
    "https://lms-global-682818593798.us-central1.run.app/health"
  )
)

$ErrorActionPreference = "Stop"

foreach ($url in $Urls) {
  $started = Get-Date
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
    $elapsed = [int]((Get-Date) - $started).TotalMilliseconds
    Write-Host "OK $($response.StatusCode) $elapsed ms $url"
  }
  catch {
    $elapsed = [int]((Get-Date) - $started).TotalMilliseconds
    Write-Host "FAIL $elapsed ms $url"
    Write-Host $_.Exception.Message
    exit 1
  }
}
