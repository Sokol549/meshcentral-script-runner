'use strict';
// The generated runner removes only the two scripts belonging to its attempt.
// Results and logs remain available for retrieval.
function build(script, id) {
    if (typeof script !== 'string' || !script.trim() || Buffer.byteLength(script, 'utf8') > 262144) throw Error('Invalid script');
    if (!/^[a-f0-9]{32}$/.test(id)) throw Error('Invalid attempt ID');
    const user = "$ErrorActionPreference = 'Stop'\r\ntry {\r\n" + script + "\r\nif (-not $?) { if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; exit 1 }\r\n} catch { [Console]::Error.WriteLine($_.Exception.ToString()); [Console]::Error.WriteLine($_.ScriptStackTrace); exit 1 }\r\n";
    const base = 'C:\\Windows\\System32\\config\\systemprofile\\AppData\\Local\\Temp\\BulkScriptRunner\\br_' + id;
    const runner = [
        "$ErrorActionPreference = 'Stop'",
        "$base = '" + base + "'",
        "$started = [DateTime]::UtcNow.ToString('o')",
        "$code = $null; $errorText = $null",
        "try {",
        "  $exe = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'",
        "  $child = Start-Process -FilePath $exe -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('" + base + "_script.ps1')) -RedirectStandardOutput ($base + '.stdout.log') -RedirectStandardError ($base + '.stderr.log') -PassThru -Wait -NoNewWindow",
        "  $code = [int]$child.ExitCode",
        "} catch { $errorText = $_.Exception.ToString() }",
        "$cleanupError = $null",
        "try { Remove-Item -LiteralPath ($base + '_script.ps1'), ($base + '_runner.ps1') -Force -ErrorAction Stop } catch { $cleanupError = $_.Exception.ToString() }",
        "$result = @{ attempt_id = '" + id + "'; exit_code = $code; error = $errorText; cleanup_error = $cleanupError; started_at = $started; completed_at = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Compress",
        "[IO.File]::WriteAllText(($base + '.result.tmp'), $result, (New-Object Text.UTF8Encoding($false)))",
        "[IO.File]::Move(($base + '.result.tmp'), ($base + '.result.json'))"
    ].join('\r\n') + '\r\n';
    return { user: Buffer.from('\ufeff' + user, 'utf8'), runner: Buffer.from('\ufeff' + runner, 'utf8') };
}
module.exports = { build };
