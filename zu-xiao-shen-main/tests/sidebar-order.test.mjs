import assert from 'node:assert/strict'
import fs from 'node:fs'

const sidebarSource = fs.readFileSync(new URL('../src/components/AppSidebar.jsx', import.meta.url), 'utf8')
const primaryNavStart = sidebarSource.indexOf('const primaryNavItems = [')
const primaryNavEnd = sidebarSource.indexOf(']', primaryNavStart)
const primaryNavSource = sidebarSource.slice(primaryNavStart, primaryNavEnd)

assert.deepEqual([...primaryNavSource.matchAll(/key: '([^']+)'/g)].map((match) => match[1]), ['contract', 'negotiation'])
assert.doesNotMatch(sidebarSource, /key: '(verdict|needs)'/)

console.log('sidebar order tests passed')
