import { buildSite } from './src/buildSite.js'
import { downloadRange, writeDay } from './src/data.js'
import { today, tomorrow } from './src/dates.js'

// Downloads the prices of today and tomorrow and publishes them. The REE
// publishes the prices of a day shortly before 21:00 of the day before, which
// is when the daily execution runs, so that the page shows tomorrow as soon as
// it exists.
//
// Today has to be there: failing to download it is left to Node, which prints
// the error whole —trace included— and exits with an error code, which is what
// the workflow needs to see. Tomorrow is not published all day long, and a run
// before 21:00 —a push to `main`, for instance— has to publish the site anyway,
// so its absence is only reported.
const start = today()
const days = await downloadRange(start, tomorrow())

for (const { date, day, error } of days) {
    if (error) {
        if (date === start) {
            throw error
        }

        console.log(`Prices for ${date} are not published yet (${error.message})`)

        continue
    }

    await writeDay(day)
    console.log(`Prices for ${date} saved`)
}

await buildSite()
