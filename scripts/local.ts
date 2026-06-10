import { spawn } from 'node:child_process'
import process from 'node:process'

type Child = ReturnType<typeof spawn>

const isWin = process.platform === 'win32'
const npmCmd = isWin ? 'npm.cmd' : 'npm'
const children: Child[] = []

function start(name: string, args: string[]) {
  const child = spawn(npmCmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: { ...process.env, LOCAL_ONLY: process.env.LOCAL_ONLY || 'true' }
  })

  children.push(child)

  child.stdout?.on('data', chunk => process.stdout.write(`[${name}] ${chunk}`))
  child.stderr?.on('data', chunk => process.stderr.write(`[${name}] ${chunk}`))

  child.on('exit', code => {
    if (shuttingDown) return
    console.log(`[${name}] exited with code ${code}`)
    shutdown(code || 0)
  })

  return child
}

let shuttingDown = false
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(code), 500)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('Trash Site Finder 3000 local-only mode')
console.log('Dashboard: http://localhost:3000')
console.log('Worker: running in this same terminal')
console.log('Stop both with CTRL+C')

start('dashboard', ['run', 'dev'])
start('worker', ['run', 'worker'])
