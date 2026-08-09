import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { describe, it } from 'node:test'
import { dayExists, directory, downloadDay, downloadRange, listDates, writeDay } from '../src/data.js'
import {
    answerSeries,
    ceutaGeoId,
    datetimesOf,
    fallBackDate,
    fallBackDatetimes,
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

describe('downloadDay', () => {
    it('gives the day of a range of one', async () => {
        const datetimes = datetimesOf('2026-07-29')

        publish(datetimes)

        assert.deepEqual((await downloadDay('2026-07-29')).datetimes, datetimes)
    })

    it('throws the error of a day that cannot be built', async () => {
        publish(datetimesOf('2026-07-28'))

        await assert.rejects(() => downloadDay('2026-07-29'), /The prices of 2026-07-29 have 0 hours/)
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
