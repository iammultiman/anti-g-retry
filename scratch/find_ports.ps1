[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Check all ports for both PIDs
$pids = @(21864, 20520)
foreach ($pid in $pids) {
    Write-Output "=== PID $pid listening ports ==="
    $result = netstat -ano | Select-String "LISTENING" | Select-String "$pid"
    $result | ForEach-Object { $_.Line.Trim() }
    Write-Output ""
}
