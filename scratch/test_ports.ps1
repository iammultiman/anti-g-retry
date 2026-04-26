[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Test both ports found from the language server processes
$ports = @(60254, 60304)
$tokens = @{
    60254 = "cd290b90-5d7b-4e7f-95a2-e36670519caa"
    60304 = "52379a42-ba30-42ff-b18b-13807ce1a1d5"
}

foreach ($port in $ports) {
    $token = $tokens[$port]
    $url = "http://127.0.0.1:$port/exa.language_server_pb.LanguageServerService/GetUserStatus"
    Write-Output "=== Testing port $port ==="
    Write-Output "URL: $url"
    Write-Output "Token: $token"
    
    try {
        $headers = @{
            'Content-Type' = 'application/json'
            'Connect-Protocol-Version' = '1'
            'X-Codeium-Csrf-Token' = $token
        }
        $body = '{"wrapper_data":{}}'
        $response = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body -TimeoutSec 3 -ErrorAction Stop
        Write-Output "Status: $($response.StatusCode)"
        Write-Output "Response: $($response.Content.Substring(0, [Math]::Min(500, $response.Content.Length)))"
    } catch {
        Write-Output "Error: $($_.Exception.Message)"
    }
    Write-Output ""
}
