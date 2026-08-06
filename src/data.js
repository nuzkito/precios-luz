import fs from 'node:fs/promises'
import path from 'node:path'
import { datesBetween, isDate } from './dates.js'
import { series } from './regions.js'
import { fetchRange } from './ree.js'

export const directory = 'data'

// A day has 24 hours, or 23 and 25 the days of the DST changes.
const possibleHours = [23, 24, 25]

// Downloads the two series of a range of days, both ends included, and expands
// them into the five regions. Two requests are enough for the whole range, but
// each day is built on its own so that a broken one does not spoil the rest:
// the answer has one entry per day of the range, with either the day or the
// error that made it unusable.
//
// The range may not be longer than `maxRangeDays`, which is up to the caller.
export async function downloadRange(start, end) {
    const downloaded = await Promise.all(series.map(serie => fetchRange(start, end, serie.geoId)))
    const hours = downloaded.map(hoursByDate)

    return [...datesBetween(start, end)].map(date => {
        try {
            return { date, day: buildDay(date, hours) }
        } catch (error) {
            return { date, error }
        }
    })
}

export async function downloadDay(date) {
    const [{ day, error }] = await downloadRange(date, date)

    if (error) {
        throw error
    }

    return day
}

function buildDay(date, hours) {
    const datetimes = (hours[0].get(date) ?? []).map(value => value.datetime)

    // The API leaves out the days it has not published yet, and the hours of
    // any other day are already dropped by `hoursByDate`. Without this the day
    // would be stored as an empty table, and from then on `dayExists` would
    // keep it that way.
    if (!possibleHours.includes(datetimes.length)) {
        throw new Error(`The prices of ${date} have ${datetimes.length} hours`)
    }

    const prices = {}

    hours.forEach((serieHours, index) => {
        const values = serieHours.get(date) ?? []

        // The stored prices share a single axis of datetimes, so the two series
        // are only usable together if they cover the very same hours.
        if (!sameHours(values, datetimes)) {
            throw new Error(`The series of ${date} do not have the same hours`)
        }

        series[index].regions.forEach(region => {
            prices[region] = values.map(value => value.kwh)
        })
    })

    return { date, datetimes, prices }
}

// The values of a series split by the day they belong to, in mainland time,
// which is the one their datetimes are written in.
function hoursByDate(values) {
    const hours = new Map()

    for (const value of values) {
        const date = value.datetime.slice(0, 10)

        hours.set(date, [...hours.get(date) ?? [], value])
    }

    return hours
}

export async function writeDay(day) {
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(filePath(day.date), JSON.stringify(day))
}

export async function dayExists(date) {
    try {
        await fs.access(filePath(date))

        return true
    } catch {
        return false
    }
}

export async function listDates() {
    try {
        const files = await fs.readdir(directory)

        return files
            .map(file => path.basename(file, '.json'))
            .filter(isDate)
            .sort()
    } catch {
        return []
    }
}

function sameHours(values, datetimes) {
    return values.length === datetimes.length
        && values.every((value, hour) => value.datetime === datetimes[hour])
}

function filePath(date) {
    return path.join(directory, `${date}.json`)
}
