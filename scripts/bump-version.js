const fs = require('fs')
const path = require('path')
const semver = require('semver')

const pkgPath = path.resolve(__dirname, '..', 'package.json')
const content = fs.readFileSync(pkgPath, 'utf8')
const pkg = JSON.parse(content)
const next = semver.inc(pkg.version, 'patch')
if (!next) process.exit(1)
pkg.version = next
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

