import { buildSite } from './src/buildSite.js'
import { downloadDay, writeDay } from './src/data.js'
import { today } from './src/dates.js'

// Downloads the prices of the day and publishes them. Any failure is left to
// Node, which prints it whole —trace included— and exits with an error code,
// which is what the workflow needs to see.
const date = today()

await writeDay(await downloadDay(date))
console.log(`Prices for ${date} saved`)

await buildSite()
