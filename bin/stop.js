import { execSync } from 'child_process';

try {
  console.log('Finding and stopping Jarvis background instances...');
  const output = execSync('powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \'*jarvis-i5-assistant*\' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host \"Stopped PID: $($_.ProcessId)\" }"').toString();
  console.log(output || 'No running Jarvis instances found.');
} catch (err) {
  console.error('Stop operation error:', err.message);
}
