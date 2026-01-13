# ============================================
# Sorryios Project Cleanup Script
# Safe cleanup with backup
# 
# Usage:
#   Right-click -> Run with PowerShell
#   Or: powershell -ExecutionPolicy Bypass -File cleanup-sorryios.ps1
# ============================================

$ErrorActionPreference = "Stop"

# Project root
$ProjectRoot = "D:\sorryios-test"

# Check directory
if (-not (Test-Path $ProjectRoot)) {
    Write-Host "[ERROR] Directory not found: $ProjectRoot" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       Sorryios Project Cleanup Script v1.0             " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# Files to delete (redundant/duplicate/test)
# ============================================

$FilesToDelete = @(
    # Root - duplicates of backend
    "$ProjectRoot\main-processor.js",
    "$ProjectRoot\report-generator.js",
    "$ProjectRoot\sorryios-automation.js",
    "$ProjectRoot\text-splitter.js",
    
    # Root - debug/test files
    "$ProjectRoot\debug-carlist.js",
    "$ProjectRoot\test-format.js",
    "$ProjectRoot\test-login.js",
    "$ProjectRoot\structure.txt",
    
    # backend - redundant
    "$ProjectRoot\backend\generate-report.js",
    "$ProjectRoot\backend\test-processor.js",
    
    # backend/services - old processors
    "$ProjectRoot\backend\services\sorryios-ai-processor.js",
    "$ProjectRoot\backend\services\auto-processor.js",
    "$ProjectRoot\backend\services\english-classroom-processor.js"
)

# Data directories to clean
$DataDirsToClean = @(
    "$ProjectRoot\backend\data\chunks",
    "$ProjectRoot\backend\data\progress",
    "$ProjectRoot\backend\data\results"
)

# ============================================
# Step 1: Create backup
# ============================================

Write-Host "[Step 1] Creating backup..." -ForegroundColor Yellow
Write-Host ""

$BackupDir = "$ProjectRoot\_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

$BackedUpCount = 0
foreach ($file in $FilesToDelete) {
    if (Test-Path $file) {
        $relativePath = $file.Replace($ProjectRoot, "").TrimStart("\")
        $backupPath = Join-Path $BackupDir $relativePath
        $backupFolder = Split-Path $backupPath -Parent
        
        if (-not (Test-Path $backupFolder)) {
            New-Item -ItemType Directory -Path $backupFolder -Force | Out-Null
        }
        
        Copy-Item $file $backupPath -Force
        $BackedUpCount++
        Write-Host "   [OK] Backed up: $relativePath" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "   Backup folder: $BackupDir" -ForegroundColor Green
Write-Host "   Files backed up: $BackedUpCount" -ForegroundColor Green
Write-Host ""

# ============================================
# Step 2: Show files to delete
# ============================================

Write-Host "[Step 2] Files to be DELETED:" -ForegroundColor Yellow
Write-Host ""

$ExistingFiles = @()
foreach ($file in $FilesToDelete) {
    if (Test-Path $file) {
        $relativePath = $file.Replace($ProjectRoot, "").TrimStart("\")
        $fileSize = (Get-Item $file).Length
        $fileSizeKB = [math]::Round($fileSize / 1KB, 1)
        Write-Host "   [X] $relativePath ($fileSizeKB KB)" -ForegroundColor Red
        $ExistingFiles += $file
    }
}

if ($ExistingFiles.Count -eq 0) {
    Write-Host "   [OK] No redundant files found!" -ForegroundColor Green
}

Write-Host ""

# ============================================
# Step 3: Show data directories to clean
# ============================================

Write-Host "[Step 3] Data directories to be CLEANED:" -ForegroundColor Yellow
Write-Host ""

$DirsToClean = @()
foreach ($dir in $DataDirsToClean) {
    if (Test-Path $dir) {
        $fileCount = (Get-ChildItem $dir -File -Recurse -ErrorAction SilentlyContinue).Count
        $relativePath = $dir.Replace($ProjectRoot, "").TrimStart("\")
        Write-Host "   [DIR] $relativePath ($fileCount files)" -ForegroundColor DarkYellow
        $DirsToClean += $dir
    }
}

if ($DirsToClean.Count -eq 0) {
    Write-Host "   [OK] No data directories to clean!" -ForegroundColor Green
}

Write-Host ""

# ============================================
# Step 4: Confirm
# ============================================

if ($ExistingFiles.Count -eq 0 -and $DirsToClean.Count -eq 0) {
    Write-Host "[DONE] Project is already clean!" -ForegroundColor Green
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 0
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[WARNING] This will delete the files listed above!" -ForegroundColor Yellow
Write-Host "          (Backup has been created)" -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "Type 'yes' to confirm deletion, or anything else to cancel"

if ($confirm -ne "yes") {
    Write-Host ""
    Write-Host "[CANCELLED] No files were deleted." -ForegroundColor Yellow
    Write-Host "   Backup folder kept: $BackupDir" -ForegroundColor DarkGray
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 0
}

# ============================================
# Step 5: Delete files
# ============================================

Write-Host ""
Write-Host "[Step 5] Deleting files..." -ForegroundColor Yellow
Write-Host ""

$DeletedCount = 0
foreach ($file in $ExistingFiles) {
    try {
        Remove-Item $file -Force
        $relativePath = $file.Replace($ProjectRoot, "").TrimStart("\")
        Write-Host "   [OK] Deleted: $relativePath" -ForegroundColor Green
        $DeletedCount++
    } catch {
        Write-Host "   [FAIL] Could not delete: $file - $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "[Step 6] Cleaning data directories..." -ForegroundColor Yellow
Write-Host ""

$CleanedFilesCount = 0
foreach ($dir in $DirsToClean) {
    if (Test-Path $dir) {
        try {
            $files = Get-ChildItem $dir -File -Recurse
            foreach ($f in $files) {
                Remove-Item $f.FullName -Force
                $CleanedFilesCount++
            }
            $relativePath = $dir.Replace($ProjectRoot, "").TrimStart("\")
            Write-Host "   [OK] Cleaned: $relativePath" -ForegroundColor Green
        } catch {
            Write-Host "   [FAIL] Could not clean: $dir - $_" -ForegroundColor Red
        }
    }
}

# ============================================
# Done
# ============================================

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "                   CLEANUP COMPLETE!                     " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   Summary:" -ForegroundColor Cyan
Write-Host "      - Deleted files: $DeletedCount" -ForegroundColor White
Write-Host "      - Cleaned temp data: $CleanedFilesCount files" -ForegroundColor White
Write-Host "      - Backup: $BackupDir" -ForegroundColor White
Write-Host ""
Write-Host "   Core files kept:" -ForegroundColor Cyan
Write-Host "      backend/server.js" -ForegroundColor DarkGray
Write-Host "      backend/services/aiProcessor.js (v3.1)" -ForegroundColor DarkGray
Write-Host "      backend/services/english-report-generator.js" -ForegroundColor DarkGray
Write-Host "      backend/services/taskQueue.js" -ForegroundColor DarkGray
Write-Host "      backend/services/database.js" -ForegroundColor DarkGray
Write-Host "      backend/lib/sorryios-automation.js" -ForegroundColor DarkGray
Write-Host "      backend/lib/text-splitter.js" -ForegroundColor DarkGray
Write-Host ""
Write-Host "   To restore: copy files from backup folder" -ForegroundColor Yellow
Write-Host ""

Read-Host "Press Enter to exit"