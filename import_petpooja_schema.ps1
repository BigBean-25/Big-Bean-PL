# PowerShell script to import PetPooja schema
# Run this with: .\import_petpooja_schema.ps1

Write-Host "PetPooja Sales Schema Import" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

# Read SQL file
$sqlFile = "database\petpooja_sales_schema_UPDATED.sql"
$sqlContent = Get-Content $sqlFile -Raw

# MySQL connection details
$mysqlHost = "localhost"
$mysqlUser = "root"
$mysqlDatabase = "bigbeancafe_db"

Write-Host "`nEnter MySQL root password:" -ForegroundColor Yellow
$mysqlPassword = Read-Host -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($mysqlPassword)
$password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# Find MySQL executable
$mysqlPaths = @(
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
    "C:\Program Files\MySQL\MySQL Server 5.7\bin\mysql.exe",
    "C:\xampp\mysql\bin\mysql.exe",
    "C:\wamp64\bin\mysql\mysql8.0.27\bin\mysql.exe"
)

$mysqlExe = $null
foreach ($path in $mysqlPaths) {
    if (Test-Path $path) {
        $mysqlExe = $path
        break
    }
}

if (-not $mysqlExe) {
    Write-Host "`nMySQL not found in common locations." -ForegroundColor Red
    Write-Host "Please enter the full path to mysql.exe:" -ForegroundColor Yellow
    $mysqlExe = Read-Host
}

if (-not (Test-Path $mysqlExe)) {
    Write-Host "`nERROR: MySQL executable not found at: $mysqlExe" -ForegroundColor Red
    exit 1
}

Write-Host "`nUsing MySQL at: $mysqlExe" -ForegroundColor Green
Write-Host "Importing schema..." -ForegroundColor Yellow

# Execute SQL
try {
    $sqlContent | & $mysqlExe -h $mysqlHost -u $mysqlUser -p$password $mysqlDatabase
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Schema imported successfully!" -ForegroundColor Green
        Write-Host "`nTables created:" -ForegroundColor Cyan
        Write-Host "  - petpooja_sales_uploads"
        Write-Host "  - petpooja_sales_items"
        Write-Host "  - sales_reconciliation_batches"
        Write-Host "  - sales_reconciliation_errors"
        Write-Host "  - sales_category_summary"
        Write-Host "  - monthly_pnl_snapshots"
        Write-Host "  - sales_approval_audit"
    } else {
        Write-Host "`n❌ Import failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    }
} catch {
    Write-Host "`n❌ Error: $_" -ForegroundColor Red
}

# Clear password from memory
$password = $null
[System.GC]::Collect()

Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
