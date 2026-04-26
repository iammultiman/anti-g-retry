[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$n = 'language_server'
$f = "name like '%$n%'"
$p = Get-CimInstance Win32_Process -Filter $f -ErrorAction SilentlyContinue
if ($p) {
    @($p) | ForEach-Object {
        Write-Output "=== PID: $($_.ProcessId) ==="
        Write-Output "Name: $($_.Name)"
        Write-Output "CommandLine: $($_.CommandLine)"
        Write-Output ""
    }
} else {
    Write-Output "No language_server processes found"
}
