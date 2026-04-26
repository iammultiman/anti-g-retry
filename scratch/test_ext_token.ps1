[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Test with extension_server_csrf_token instead
$tests = @(
    @{ Port = 60254; Token = "a2c2827a-5d60-408b-9c33-9d43da55ca77" },
    @{ Port = 60304; Token = "409f0b65-4d05-4322-9e30-e7d93d948dd3" }
)

foreach ($test in $tests) {
    $port = $test.Port
    $token = $test.Token
    $url = "http://127.0.0.1:$port/exa.language_server_pb.LanguageServerService/GetUserStatus"
    Write-Output "=== Testing port $port with extension_server_csrf_token ==="
    
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
