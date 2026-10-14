// Prints a VITE_LEASEWISE_PASSWORD_HASH value for the login gate. The password is typed at a
// hidden prompt and never written anywhere; only the salted PBKDF2 hash is printed.
//   npm run hash-password

import { pbkdf2Sync, randomBytes } from 'node:crypto'

const ITERATIONS = 600000

function hiddenPrompt(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    if (!stdin.isTTY) return reject(new Error('Run this in an interactive terminal.'))
    process.stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    const onData = (chunk) => {
      // A paste arrives as one chunk, so handle it character by character.
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          process.stdout.write('\n')
          return resolve(value)
        }
        if (ch === '\u0003') {
          process.stdout.write('\n')
          process.exit(130)
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
        else value += ch
      }
    }
    stdin.on('data', onData)
  })
}

const password = await hiddenPrompt('Password for LeasewiseAdmin: ')
if (password !== (await hiddenPrompt('Confirm password: '))) {
  console.error('Passwords do not match.')
  process.exit(1)
}
if (password.length < 14) {
  console.error('Use at least 14 characters: the hash is public in the built site, so a long passphrase matters.')
  process.exit(1)
}
const salt = randomBytes(16)
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256')
console.log(`\nVITE_LEASEWISE_PASSWORD_HASH=pbkdf2-sha256$${ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`)
