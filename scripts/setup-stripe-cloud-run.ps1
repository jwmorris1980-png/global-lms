param(
  [string]$ProjectId = "gen-lang-client-0007979237",
  [string]$Region = "us-central1",
  [string]$Service = "lms-global",
  [string]$PublicOrigin = "https://www.global-lms.org"
)

$ErrorActionPreference = "Stop"

function ConvertTo-PlainText {
  param([Security.SecureString]$SecureValue)

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Read-RequiredSecret {
  param(
    [string]$Prompt,
    [string]$Pattern,
    [string]$Example
  )

  $secure = Read-Host $Prompt -AsSecureString
  $plain = ConvertTo-PlainText $secure
  if ([string]::IsNullOrWhiteSpace($plain) -or $plain -notmatch $Pattern) {
    throw "That value does not look right. Expected something like $Example."
  }

  return $plain.Trim()
}

Write-Host ""
Write-Host "Stripe setup for $Service"
Write-Host "Webhook endpoint to create in Stripe:"
Write-Host "  https://lms-global-682818593798.us-central1.run.app/api/stripe/webhook"
Write-Host ""
Write-Host "Use Stripe Dashboard > Developers > Webhooks, create that endpoint, then copy its signing secret."
Write-Host "Do not paste these secrets into chat. Enter them only in this terminal."
Write-Host ""

$stripeSecret = Read-RequiredSecret `
  -Prompt "Stripe secret key (sk_test_... or sk_live_...)" `
  -Pattern "^sk_(test|live)_.+" `
  -Example "sk_live_..."

$webhookSecret = Read-RequiredSecret `
  -Prompt "Stripe webhook signing secret (whsec_...)" `
  -Pattern "^whsec_.+" `
  -Example "whsec_..."

$delimiter = "^|^"
$envVars = "STRIPE_SECRET_KEY=$stripeSecret|STRIPE_WEBHOOK_SECRET=$webhookSecret"

Write-Host ""
Write-Host "Updating Cloud Run environment variables..."
gcloud config set project $ProjectId | Out-Null
gcloud run services update $Service `
  --region $Region `
  --update-env-vars "$delimiter$envVars" `
  --quiet

Write-Host ""
Write-Host "Checking live payment configuration..."
$configUrl = "https://lms-global-682818593798.us-central1.run.app/api/payments/config"
$headers = @{ Origin = $PublicOrigin }
$result = Invoke-RestMethod -Uri $configUrl -Headers $headers -Method Get
$result | ConvertTo-Json

if (-not $result.configured -or -not $result.webhookConfigured) {
  throw "Stripe is still not fully configured. Check that both secrets were copied correctly."
}

Write-Host ""
Write-Host "Stripe Checkout is configured. Paid marketplace purchases can now open Stripe-hosted Checkout."
