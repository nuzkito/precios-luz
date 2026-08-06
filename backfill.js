import { setTimeout as wait } from 'node:timers/promises'
import { dayExists, downloadRange, writeDay } from './src/data.js'
import { datesBetween, daysInRange, isDate } from './src/dates.js'
import { maxRangeDays } from './src/ree.js'

const pauseBetweenRanges = 1000
const usage = 'Usage: npm run backfill -- <YYYY-MM-DD> [YYYY-MM-DD] [--force]'

// Downloads past days to fill the history. The days already saved are skipped
// unless `--force` is passed, and one failed day does not stop the rest. The
// days are asked for in ranges of `maxRangeDays`, so four weeks cost the same
// two requests as a single day.
async function backfill({ start, end, force }) {
    const failed = []
    const pending = []
    let downloaded = 0
    let skipped = 0

    for (const date of datesBetween(start, end)) {
        if (!force && await dayExists(date)) {
            skipped++
        } else {
            pending.push(date)
        }
    }

    for (const [index, range] of ranges(pending).entries()) {
        // Waiting before each range, and not after, keeps the API at ease
        // without pausing for nothing once the last one is done.
        if (index > 0) {
            await wait(pauseBetweenRanges)
        }

        for (const { date, error } of await saveRange(range)) {
            if (error) {
                failed.push(date)
                console.error(`${date} failed: ${error.message}`)
            } else {
                downloaded++
                console.log(`${date} saved`)
            }
        }
    }

    return { downloaded, skipped, failed }
}

// A failed request loses the whole range, so its days are reported as failed
// one by one, the same as the days that come back broken.
async function saveRange(range) {
    let results

    try {
        results = await downloadRange(range.at(0), range.at(-1))
    } catch (error) {
        return range.map(date => ({ date, error }))
    }

    const wanted = new Set(range)
    const saved = []

    for (const { date, day, error } of results) {
        // A range skips over the days that already exist, and those are the only
        // ones of its span that are not asked for.
        if (!wanted.has(date)) {
            continue
        }

        if (error) {
            saved.push({ date, error })
            continue
        }

        try {
            await writeDay(day)
            saved.push({ date })
        } catch (error) {
            saved.push({ date, error })
        }
    }

    return saved
}

// The days to download, grouped into the fewest ranges the API accepts. The
// days already saved are missing from the list, and a range may jump over them
// as long as it does not grow past `maxRangeDays` from end to end.
function ranges(dates) {
    const groups = []

    for (const date of dates) {
        const current = groups.at(-1)

        if (current && daysInRange(current.at(0), date) <= maxRangeDays) {
            current.push(date)
        } else {
            groups.push([date])
        }
    }

    return groups
}

// A single date is a range of one day. These dates are also in order when
// compared as text, so an inverted range is a mistake and not an empty run.
function parseArguments(argv) {
    const force = argv.includes('--force')
    const [start, end = start] = argv.filter(argument => !argument.startsWith('--'))

    if (!isDate(start) || !isDate(end) || start > end) {
        return null
    }

    return { start, end, force }
}

const options = parseArguments(process.argv.slice(2))

if (!options) {
    console.error(usage)
    process.exit(1)
}

const { downloaded, skipped, failed } = await backfill(options)

console.log(`Downloaded ${downloaded} days, ${skipped} already existed, ${failed.length} failed`)

if (failed.length > 0) {
    console.error(`Failed days: ${failed.join(', ')}`)
    process.exit(1)
}
