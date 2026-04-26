[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Real listening ports and both token types
$tests = @(
    # PID 21864 ports with csrf_token
    @{ Port = 60259; Token = "cd290b90-5d7b-4e7f-95a2-e36670519caa"; Label = "PID21864:60259 csrf_token" },
    @{ Port = 60260; Token = "cd290b90-5d7b-4e7f-95a2-e36670519caa"; Label = "PID21864:60260 csrf_token" },
    # PID 21864 ports with ext_csrf_token
    @{ Port = 60259; Token = "a2c2827a-5d60-408b-9c33-9d43da55ca77"; Label = "PID21864:60259 ext_csrf" },
    @{ Port = 60260; Token = "a2c2827a-5d60-408b-9c33-9d43da55ca77"; Label = "PID21864:60260 ext_csrf" },
    # PID 20520 ports with csrf_token
    @{ Port = 58976; Token = "52379a42-ba30-42ff-b18b-13807ce1a1d5"; Label = "PID20520:58976 csrf_token" },
    @{ Port = 60307; Token = "52379a42-ba30-42ff-b18b-13807ce1a1d5"; Label = "PID20520:60307 csrf_token" },
    # PID 20520 ports with ext_csrf_token
    @{ Port = 58976; Token = "409f0b65-4d05-4322-9e30-e7d93d948dd3"; Label = "PID20520:58976 ext_csrf" },
    @{ Port = 60307; Token = "409f0b65-4d05-4322-9e30-e7d93d948dd3"; Label = "PID20520:60307 ext_csrf" }
)

foreach ($t in $tests) {
    $url = "http://127.0.0.1:$($t.Port)/exa.language_server_pb.LanguageServerService/GetUserStatus"
    try {
        $headers = @{
            'Content-Type' = 'application/json'
            'Connect-Protocol-Version' = '1'
            'X-Codeium-Csrf-Token' = $t.Token
        }
        $response = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body '{"wrapper_data":{}}' -TimeoutSec 3 -ErrorAction Stop
        Write-Output "$($t.Label) => $($response.StatusCode) OK! ($($response.Content.Length) bytes)"
    } catch {
        $status = ""
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
        }
        Write-Output "$($t.Label) => $status $($_.Exception.Message)"
    }
}
