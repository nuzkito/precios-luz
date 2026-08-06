import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import {
    datetimesOf,
    jsonResponse,
    mainlandGeoId,
    pvpcResponse,
    useFakeFetch,
    useSilentConsole,
    valuesOf
} from './helpers.js'

// A failed request waits five seconds before trying again. Replacing the module
// keeps the tests instant and shows how long they would have waited. It has to
// be mocked before `ree.js` is loaded, which is why the module is imported here
// and not at the top of the file.
const waits = []

mock.module('node:timers/promises', {
    exports: { setTimeout: async milliseconds => void waits.push(milliseconds) }
})

const { fetchRange, maxRangeDays } = await import('../src/ree.js')

const api = useFakeFetch()

// The retries are announced with a `console.warn`.
useSilentConsole('warn')

describe('maxRangeDays', () => {
    it('is the longest range the API accepts whatever the day it starts on', () => {
        assert.equal(maxRangeDays, 28)
    })
})

describe('fetchRange', () => {
    it('asks for the whole range at once, hour by hour and for a single geo_id', async () => {
        api.answer = () => jsonResponse(pvpcResponse(valuesOf(datetimesOf('2026-07-27'))))

        await fetchRange('2026-07-27', '2026-07-30', mainlandGeoId)

        assert.deepEqual(api.calls, [
            'https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real'
                + '?start_date=2026-07-27T00:00&end_date=2026-07-30T23:59'
                + '&time_trunc=hour&geo_ids=8741'
        ])
    })

    it('turns the €/MWh of the answer into the €/kWh that are stored', async () => {
        const datetimes = datetimesOf('2026-07-29')

        api.answer = () => jsonResponse(pvpcResponse([
            { datetime: datetimes[0], value: 187.6 },
            { datetime: datetimes[1], value: 0 },
            { datetime: datetimes[2], value: 1234.5 }
        ]))

        assert.deepEqual(await fetchRange('2026-07-29', '2026-07-29', mainlandGeoId), [
            { datetime: datetimes[0], kwh: 0.1876 },
            { datetime: datetimes[1], kwh: 0 },
            { datetime: datetimes[2], kwh: 1.2345 }
        ])
    })

    it('rounds the price to four decimals', async () => {
        const [datetime] = datetimesOf('2026-07-29')

        api.answer = () => jsonResponse(pvpcResponse([
            { datetime, value: 187.64999 },
            { datetime, value: 187.65001 }
        ]))

        const hours = await fetchRange('2026-07-29', '2026-07-29', mainlandGeoId)

        assert.deepEqual(hours.map(hour => hour.kwh), [0.1876, 0.1877])
    })

    it('reads the prices and ignores whatever else the API publishes', async () => {
        const datetimes = datetimesOf('2026-07-29')
        const spot = { type: 'Precio mercado spot', attributes: { values: valuesOf(datetimes, 900) } }

        api.answer = () => jsonResponse(pvpcResponse(valuesOf(datetimes), [spot]))

        const hours = await fetchRange('2026-07-29', '2026-07-29', mainlandGeoId)

        assert.deepEqual(hours.map(hour => hour.kwh), valuesOf(datetimes).map(value => value.value / 1000))
    })

    it('fails when the answer does not carry the prices', async () => {
        api.answer = () => jsonResponse({ included: [{ type: 'Precio mercado spot', attributes: {} }] })

        await assert.rejects(
            () => fetchRange('2026-07-29', '2026-07-29', mainlandGeoId),
            /PVPC data not found for 2026-07-29..2026-07-29 \(geo_id 8741\)/
        )

        api.answer = () => jsonResponse({ data: {} })

        await assert.rejects(
            () => fetchRange('2026-07-29', '2026-07-29', mainlandGeoId),
            /PVPC data not found/
        )
    })

    it('fails when the status code is not a good one', async () => {
        api.answer = () => jsonResponse({}, 502)

        await assert.rejects(
            () => fetchRange('2026-07-29', '2026-07-29', mainlandGeoId),
            /Request failed: status code 502/
        )
    })

    it('fails when the body is an error, even if the status code is a good one', async () => {
        api.answer = () => jsonResponse({ errors: [{ detail: 'No hay datos para el rango' }] })

        await assert.rejects(
            () => fetchRange('2026-07-29', '2026-07-29', mainlandGeoId),
            /Request failed: No hay datos para el rango/
        )
    })

    it('fails when the answer is not JSON', async () => {
        api.answer = () => new Response('<html>Gateway timeout</html>', { status: 200 })

        await assert.rejects(
            () => fetchRange('2026-07-29', '2026-07-29', mainlandGeoId),
            /Request failed: status code 200/
        )
    })

    describe('retries', () => {
        it('tries again when a request fails and keeps what the next one answers', async () => {
            waits.length = 0

            const datetimes = datetimesOf('2026-07-29')

            api.answer = (url, call) => call === 1
                ? jsonResponse({}, 502)
                : jsonResponse(pvpcResponse(valuesOf(datetimes)))

            const hours = await fetchRange('2026-07-29', '2026-07-29', mainlandGeoId)

            assert.equal(hours.length, 24)
            assert.equal(api.calls.length, 2)
            assert.deepEqual(waits, [5000])
        })

        it('gives up after three attempts and fails with the last error', async () => {
            waits.length = 0

            api.answer = (url, call) => {
                throw new Error(`network is down (${call})`)
            }

            await assert.rejects(
                () => fetchRange('2026-07-29', '2026-07-29', mainlandGeoId),
                /network is down \(3\)/
            )

            assert.equal(api.calls.length, 3)
            assert.deepEqual(waits, [5000, 5000])
        })

        it('does not try again when the answer is good', async () => {
            waits.length = 0

            api.answer = () => jsonResponse(pvpcResponse(valuesOf(datetimesOf('2026-07-29'))))

            await fetchRange('2026-07-29', '2026-07-29', mainlandGeoId)

            assert.equal(api.calls.length, 1)
            assert.deepEqual(waits, [])
        })
    })
})
