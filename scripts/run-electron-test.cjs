const { spawn } = require('node:child_process')
const path = require('node:path')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
if (process.platform === 'win32' && !env.ComSpec) env.ComSpec = path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
const child = spawn(require('electron'), [process.argv[2] || 'scripts/test-library.cjs'], {
  cwd: path.resolve(__dirname, '..'), env, stdio: 'inherit', windowsHide: true,
})
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
