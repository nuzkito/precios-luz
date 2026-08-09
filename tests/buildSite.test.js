import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { beforeEach, describe, it } from 'node:test'
import { buildSite } from '../src/buildSite.js'
import { useSilentConsole, useTemporaryDirectory } from './helpers.js'

const site = '_site'

useTemporaryDirectory()

// Building the site announces how many days it published.
useSilentConsole()

// What the folder looks like before building: the page with its files and a
// history of two days.
beforeEach(async () => {
    await fs.mkdir('resources/icons', { recursive: true })
    await fs.writeFile('resources/index.html', '<h1>Precios</h1>')
    await fs.writeFile('resources/page.js', 'export const page = true')
    await fs.writeFile('resources/icons/icon.svg', '<svg></svg>')

    await fs.mkdir('data/2026/07', { recursive: true })
    await fs.writeFile('data/2026/07/29.json', '{"date":"2026-07-29"}')
    await fs.writeFile('data/2026/07/28.json', '{"date":"2026-07-28"}')
})

const read = file => fs.readFile(`${site}/${file}`, 'utf8')

describe('buildSite', () => {
    it('publishes the page with everything it needs', async () => {
        await buildSite()

        assert.equal(await read('index.html'), '<h1>Precios</h1>')
        assert.equal(await read('page.js'), 'export const page = true')
        assert.equal(await read('icons/icon.svg'), '<svg></svg>')
    })

    it('publishes the history next to the page, with its folders', async () => {
        await buildSite()

        assert.equal(await read('data/2026/07/29.json'), '{"date":"2026-07-29"}')
        assert.equal(await read('data/2026/07/28.json'), '{"date":"2026-07-28"}')
    })

    it('writes the list of days the page can navigate to, in order', async () => {
        await buildSite()

        assert.deepEqual(JSON.parse(await read('site.json')).dates, ['2026-07-28', '2026-07-29'])
    })

    it('writes an empty list when the history has no days', async () => {
        await fs.rm('data', { recursive: true })
        await fs.mkdir('data')

        await buildSite()

        assert.deepEqual(JSON.parse(await read('site.json')).dates, [])
    })

    it('writes the moment it was built next to the days', async () => {
        const before = Date.now()

        await buildSite()

        const { builtAt } = JSON.parse(await read('site.json'))

        assert.ok(Date.parse(builtAt) >= before)
        assert.ok(Date.parse(builtAt) <= Date.now())
        assert.equal(new Date(builtAt).toISOString(), builtAt)
    })

    it('drops what is no longer published instead of piling it up', async () => {
        await buildSite()
        await fs.rm('resources/page.js')
        await fs.rm('data/2026/07/28.json')
        await buildSite()

        await assert.rejects(() => read('page.js'), { code: 'ENOENT' })
        await assert.rejects(() => read('data/2026/07/28.json'), { code: 'ENOENT' })
        assert.equal(await read('index.html'), '<h1>Precios</h1>')
        assert.deepEqual(JSON.parse(await read('site.json')).dates, ['2026-07-29'])
    })

    it('empties the folder without deleting it, because the server mounts it', async () => {
        await fs.mkdir(site)

        const mounted = (await fs.stat(site)).ino

        await buildSite()

        assert.equal((await fs.stat(site)).ino, mounted)
    })
})
