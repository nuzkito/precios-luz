import { buildSite } from './src/buildSite.js'
import { downloadDates, missingDates, rangesOf, writeDay } from './src/data.js'
import { today, tomorrow } from './src/dates.js'

// Downloads the prices the history lacks, up to tomorrow, and publishes them.
// The REE publishes the prices of a day shortly before 21:00 of the day before,
// which is when the daily execution runs. If an execution was missed, the days
// since the last one saved are downloaded too.
//
// Today and any day before it have to be there: failing to download one is left
// to Node, which prints the error whole —trace included— and exits with an
// error code, which is what the workflow needs to see. The run stops at the
// first failure so the history never gets a gap. Tomorrow is not published all
// day long, and a run before 21:00 —a push to `main`, for instance— has to
// publish the site anyway, so its absence is only reported.
const start = today()
const end = tomorrow()

for (const range of rangesOf(await missingDates(start, end))) {
    for (const { date, day, error } of await downloadDates(range, start)) {
        if (error) {
            if (date !== end) {
                throw error
            }

            console.log(`Prices for ${date} are not published yet (${error.message})`)

            continue
        }

        await writeDay(day)
        console.log(`Prices for ${date} saved`)
    }
}

await buildSite()
