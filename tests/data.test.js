import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { describe, it } from 'node:test'
import { datesBetween } from '../src/dates.js'
import { dayExists, directory, downloadDates, downloadRange, listDates, missingDates, rangesOf, writeDay } from '../src/data.js'
import {
    answerSeries,
    ceutaGeoId,
    datetimesOf,
    fallBackDate,
    fallBackDatetimes,
    jsonResponse,
    mainlandGeoId,
    pricesOf,
    springForwardDate,
    springForwardDatetimes,
    useFakeFetch,
    useTemporaryDirectory,
    valuesOf
} from './helpers.js'

const api = useFakeFetch()

useTemporaryDirectory()

// The answer of a whole range, with a different price for each series so that
// it is clear which one every region is given.
function publish(datetimes) {
    const mainland = valuesOf(datetimes, 100)
    const ceuta = valuesOf(datetimes, 500)

    api.answer = answerSeries({ [mainlandGeoId]: mainland, [ceutaGeoId]: ceuta })

    return { mainland, ceuta }
}

describe('downloadRange', () => {
    it('asks for the two series and spreads them over the five regions', async () => {
        const datetimes = datetimesOf('2026-07-29')
        const { mainland, ceuta } = publish(datetimes)

        const days = await downloadRange('2026-07-29', '2026-07-29')

        assert.equal(api.calls.length, 2)
        assert.deepEqual(days, [{
            date: '2026-07-29',
            day: {
                date: '2026-07-29',
                datetimes,
                prices: {
                    peninsula: pricesOf(mainland),
                    baleares: pricesOf(mainland),
                    canarias: pricesOf(mainland),
                    ceuta: pricesOf(ceuta),
                    melilla: pricesOf(ceuta)
                }
            }
        }])
    })

    it('gives one entry per day of the range, in order and with its own hours', async () => {
        const datetimes = ['2026-07-27', '2026-07-28', '2026-07-29'].flatMap(date => datetimesOf(date))

        publish(datetimes)

        const days = await downloadRange('2026-07-27', '2026-07-29')

        assert.deepEqual(days.map(({ date }) => date), ['2026-07-27', '2026-07-28', '2026-07-29'])

        days.forEach(({ day }, index) => {
            assert.deepEqual(day.datetimes, datetimes.slice(index * 24, index * 24 + 24))
            assert.equal(day.prices.peninsula.length, 24)
        })

        // The prices follow their hours and are not restarted on each day.
        assert.equal(days[1].day.prices.peninsula[0], (100 + 24) / 1000)
    })

    it('leaves out the days that are not in the range', async () => {
        publish(['2026-07-28', '2026-07-29', '2026-07-30'].flatMap(date => datetimesOf(date)))

        const days = await downloadRange('2026-07-29', '2026-07-29')

        assert.deepEqual(days.map(({ date }) => date), ['2026-07-29'])
    })

    it('takes the 23 and the 25 hours of the DST changes', async () => {
        publish(springForwardDatetimes)

        const [springForward] = await downloadRange(springForwardDate, springForwardDate)

        assert.equal(springForward.error, undefined)
        assert.equal(springForward.day.datetimes.length, 23)

        publish(fallBackDatetimes)

        const [fallBack] = await downloadRange(fallBackDate, fallBackDate)

        assert.equal(fallBack.error, undefined)
        assert.equal(fallBack.day.datetimes.length, 25)
    })

    it('fails the day that the API has not published yet and saves the rest', async () => {
        publish(['2026-07-28', '2026-07-29'].flatMap(date => datetimesOf(date)))

        const days = await downloadRange('2026-07-28', '2026-07-30')

        assert.equal(days[0].error, undefined)
        assert.equal(days[1].error, undefined)
        assert.match(days[2].error.message, /The prices of 2026-07-30 have 0 hours/)
        assert.equal(days[2].day, undefined)
    })

    it('fails a day that does not have all of its hours', async () => {
        publish(datetimesOf('2026-07-29').slice(0, 20))

        const [{ error }] = await downloadRange('2026-07-29', '2026-07-29')

        assert.match(error.message, /The prices of 2026-07-29 have 20 hours/)
    })

    it('fails a day whose two series do not cover the same hours', async () => {
        const datetimes = datetimesOf('2026-07-29')

        api.answer = answerSeries({
            [mainlandGeoId]: valuesOf(datetimes),
            [ceutaGeoId]: valuesOf(datetimes.slice(0, 23), 500)
        })

        const [{ error }] = await downloadRange('2026-07-29', '2026-07-29')

        assert.match(error.message, /The series of 2026-07-29 do not have the same hours/)
    })

    it('fails a day whose two series have the same hours in a different offset', async () => {
        const datetimes = datetimesOf('2026-07-29')

        api.answer = answerSeries({
            [mainlandGeoId]: valuesOf(datetimes),
            [ceutaGeoId]: valuesOf(datetimesOf('2026-07-29', '+01:00'), 500)
        })

        const [{ error }] = await downloadRange('2026-07-29', '2026-07-29')

        assert.match(error.message, /The series of 2026-07-29 do not have the same hours/)
    })
})

describe('writeDay', () => {
    it('saves the day as JSON in the history, creating the folders of the year and the month', async () => {
        const day = { date: '2026-07-29', datetimes: ['2026-07-29T00:00:00.000+02:00'], prices: { peninsula: [0.1] } }

        await writeDay(day)

        assert.deepEqual(JSON.parse(await fs.readFile(`${directory}/2026/07/29.json`, 'utf8')), day)
    })

    it('overwrites the day that was already saved', async () => {
        await writeDay({ date: '2026-07-29', datetimes: [], prices: {} })
        await writeDay({ date: '2026-07-29', datetimes: ['2026-07-29T00:00:00.000+02:00'], prices: {} })

        const saved = JSON.parse(await fs.readFile(`${directory}/2026/07/29.json`, 'utf8'))

        assert.deepEqual(saved.datetimes, ['2026-07-29T00:00:00.000+02:00'])
    })
})

describe('dayExists', () => {
    it('tells whether the day is already in the history', async () => {
        assert.equal(await dayExists('2026-07-29'), false)

        await writeDay({ date: '2026-07-29', datetimes: [], prices: {} })

        assert.equal(await dayExists('2026-07-29'), true)
        assert.equal(await dayExists('2026-07-30'), false)
    })
})

describe('listDates', () => {
    const seed = async date => {
        const [year, month, day] = date.split('-')

        await fs.mkdir(`${directory}/${year}/${month}`, { recursive: true })
        await fs.writeFile(`${directory}/${year}/${month}/${day}.json`, '{}')
    }

    it('gives the days of the history in order, across the folders of the years and the months', async () => {
        for (const date of ['2026-07-30', '2025-01-02', '2026-07-28']) {
            await seed(date)
        }

        assert.deepEqual(await listDates(), ['2025-01-02', '2026-07-28', '2026-07-30'])
    })

    it('leaves out whatever is not a day, folders included', async () => {
        await seed('2026-07-29')
        await seed('2026-02-30')
        await fs.writeFile(`${directory}/README.md`, '')

        assert.deepEqual(await listDates(), ['2026-07-29'])
    })

    it('gives nothing when there is no history at all', async () => {
        assert.deepEqual(await listDates(), [])
    })
})

describe('missingDates', () => {
    async function seed(date) {
        const [year, month, day] = date.split('-')

        await fs.mkdir(`${directory}/${year}/${month}`, { recursive: true })
        await fs.writeFile(`${directory}/${year}/${month}/${day}.json`, '{}')
    }

    it('gives the days after the last one saved, up to the end', async () => {
        await seed('2026-08-26')

        assert.deepEqual(
            await missingDates('2026-08-30', '2026-08-31'),
            ['2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31']
        )
    })

    it('does not ask again for the gaps before the last day saved', async () => {
        await seed('2026-08-20')
        await seed('2026-08-26')

        assert.deepEqual(await missingDates('2026-08-27', '2026-08-27'), ['2026-08-27'])
    })

    it('gives only tomorrow when today is already saved', async () => {
        await seed('2026-08-30')

        assert.deepEqual(await missingDates('2026-08-30', '2026-08-31'), ['2026-08-31'])
    })

    it('gives nothing when the end is already saved', async () => {
        await seed('2026-08-31')

        assert.deepEqual(await missingDates('2026-08-30', '2026-08-31'), [])
    })

    it('starts from the given day when there is no history', async () => {
        assert.deepEqual(await missingDates('2026-08-30', '2026-08-31'), ['2026-08-30', '2026-08-31'])
    })
})

describe('rangesOf', () => {
    it('keeps the days that fit the API in one range', () => {
        assert.deepEqual(rangesOf(['2026-08-01', '2026-08-02']), [['2026-08-01', '2026-08-02']])
    })

    it('starts a new range when one would grow past 28 days', () => {
        const dates = [...datesBetween('2026-08-01', '2026-09-05')]
        const ranges = rangesOf(dates)

        assert.deepEqual(ranges.map(range => range.length), [28, 8])
        assert.equal(ranges[1].at(0), '2026-08-29')
    })

    it('gives nothing for no days', () => {
        assert.deepEqual(rangesOf([]), [])
    })
})

describe('downloadDates', () => {
    it('gives only the days of the range', async () => {
        publish([...datetimesOf('2026-07-28'), ...datetimesOf('2026-07-29')])

        const days = await downloadDates(['2026-07-29'], '2026-07-28')

        assert.deepEqual(days.map(({ date }) => date), ['2026-07-29'])
    })

    it('asks for today too when every day of the range comes after it', async () => {
        api.answer = url => {
            const start = new URL(url).searchParams.get('start_date')

            return start.startsWith('2026-07-29')
                ? answerSeries({ [mainlandGeoId]: valuesOf(datetimesOf('2026-07-29')), [ceutaGeoId]: valuesOf(datetimesOf('2026-07-29')) })(url)
                : jsonResponse({ errors: [{ status: '502', detail: 'Not available' }] })
        }

        const days = await downloadDates(['2026-07-30'], '2026-07-29')

        assert.equal(new URL(api.calls[0]).searchParams.get('start_date'), '2026-07-29T00:00')
        assert.equal(days.length, 1)
        assert.equal(days[0].date, '2026-07-30')
        assert.match(days[0].error.message, /0 hours/)
    })

    it('keeps the start of a range that includes today', async () => {
        publish(datetimesOf('2026-07-29'))

        await downloadDates(['2026-07-29', '2026-07-30'], '2026-07-29')

        assert.equal(new URL(api.calls[0]).searchParams.get('start_date'), '2026-07-29T00:00')
    })
})
