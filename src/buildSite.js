import fs from 'node:fs/promises'
import path from 'node:path'
import { directory, listDates } from './data.js'

const site = '_site'

// `resources` is the site: the page, the modules it imports and the icons. So
// publishing it is copying that folder and the history next to it.
export async function buildSite() {
    const dates = await listDates()
    const builtAt = new Date().toISOString()

    await empty(site)

    await fs.cp('resources', site, { recursive: true })
    await fs.cp(directory, path.join(site, directory), { recursive: true })

    // Everything the site knows about itself: the days the page can navigate to
    // and the moment it was published, which a static page cannot know on its
    // own. The two travel together so that the page asks for them in a single
    // request, and they go next to the page and not into `data`, which is only
    // the history.
    await fs.writeFile(path.join(site, 'site.json'), JSON.stringify({ builtAt, dates }))

    console.log(`Site built (${dates.length} days in the history)`)
}

// Copying only adds, so whatever is no longer in `resources` or in the history
// would stay here for ever and the local server would show more than what is
// published. The folder itself is emptied and not deleted, because the server of
// `docker-compose.yml` mounts it and would stop seeing it.
async function empty(target) {
    await fs.mkdir(target, { recursive: true })

    const entries = await fs.readdir(target)

    await Promise.all(entries.map(entry => fs.rm(path.join(target, entry), { recursive: true })))
}
