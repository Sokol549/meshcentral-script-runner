'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { build } = require('../runner-build');
const id = '1234567890abcdef1234567890abcdef';
const files = build("Write-Output 'тест'; exit 7", id);
for (const file of [files.user, files.runner]) {
  const input = file.toString('utf8').replace(/^\ufeff/, '');
  const parser = '$s=[Console]::In.ReadToEnd(); $errors=$null; $tokens=$null; [Management.Automation.Language.Parser]::ParseInput($s,[ref]$tokens,[ref]$errors) | Out-Null; if($errors.Count){$errors | Out-String | Write-Error; exit 1}';
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(parser, 'utf16le').toString('base64')], { input: Buffer.from(input, 'utf8'), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
assert.throws(() => build('echo hi', '../bad'));
assert.match(files.runner.toString('utf8'), /cleanup_error/);
const plugin = require('../scriptrunner')({});
let reply;
plugin.serveraction({pluginaction:'build',request:id,script:'echo ok'}, {user:{siteadmin:0xffffffff},send:m=>reply=m});
assert.equal(reply.request, id);
assert.ok(reply.runner && reply.user);
reply = undefined;
plugin.serveraction({pluginaction:'build',request:id,script:'echo ok'}, {user:{siteadmin:0},send:m=>reply=m});
assert.equal(reply, undefined);
console.log('PowerShell parsing and server authorization: OK');
