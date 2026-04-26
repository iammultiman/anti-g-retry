[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$n = 'language_server'
$f = "name like '%$n%'"
$p = Get-CimInstance Win32_Process -Filter $f -ErrorAction SilentlyContinue
if ($p) {
    @($p) | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress
} else {
    '[]'
}
