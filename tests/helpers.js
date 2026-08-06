import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach } from 'node:test'

// The two series of `src/regions.js`. They are written down again here so that
// the tests fail if they ever change without meaning to.
export const mainlandGeoId = 8741
export const ceutaGeoId = 8744

const at = (date, hour, offset) => `${date}T${String(hour).padStart(2, '0')}:00:00.000${offset}`

// The 24 hours of an ordinary day, in the mainland time the API answers with.
export function datetimesOf(date, offset = '+02:00') {
    return Array.from({ length: 24 }, (value, hour) => at(date, hour, offset))
}

// The 23 hours of the day the clocks go forward: there is no 02:00.
export const springForwardDate = '2026-03-29'
export const springForwardDatetimes = [
    at(springForwardDate, 0, '+01:00'),
    at(springForwardDate, 1, '+01:00'),
    ...Array.from({ length: 21 }, (value, index) => at(springForwardDate, index + 3, '+02:00'))
]

// The 25 hours of the day the clocks go back: 02:00 happens twice, once in each
// offset.
export const fallBackDate = '2025-10-26'
export const fallBackDatetimes = [
    at(fallBackDate, 0, '+02:00'),
    at(fallBackDate, 1, '+02:00'),
    at(fallBackDate, 2, '+02:00'),
    ...Array.from({ length: 22 }, (value, index) => at(fallBackDate, index + 2, '+01:00'))
]

// A series as it travels in the answer: one value per hour, in €/MWh.
export function valuesOf(datetimes, firstPrice = 100) {
    return datetimes.map((datetime, index) => ({ datetime, value: firstPrice + index }))
}

// The same series once stored, in €/kWh.
export function pricesOf(values) {
    return values.map(value => value.value / 1000)
}

// The shape of the answer: the prices live in the `PVPC` entry of `included`,
// next to the other things the API publishes for the same range.
export function pvpcResponse(values, otherEntries = []) {
    return { included: [...otherEntries, { type: 'PVPC', attributes: { values } }] }
}

export function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    })
}

// A double of the API. `answer` is what the next request gets and `calls` are
// the urls that were asked for, one per request and retry.
export function useFakeFetch() {
    const original = globalThis.fetch
    const api = {
        calls: [],
        answer: () => jsonResponse(pvpcResponse([]))
    }

    beforeEach(() => {
        api.calls = []
        globalThis.fetch = async url => {
            api.calls.push(url)

            return api.answer(url, api.calls.length)
        }
    })

    afterEach(() => {
        globalThis.fetch = original
    })

    return api
}

// One geo_id per request, so the double answers with the series that belongs to
// the one being asked for.
export function answerSeries(valuesByGeoId) {
    return url => {
        const geoId = new URL(url).searchParams.get('geo_ids')

        return jsonResponse(pvpcResponse(valuesByGeoId[geoId] ?? []))
    }
}

// `src` works with paths relative to where Node was started —the history is
// `data` and the site is `_site`—, so the tests that touch the disk run each in
// a folder of its own and leave nothing behind.
export function useTemporaryDirectory() {
    const original = process.cwd()
    let directory

    beforeEach(async () => {
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'precios-luz-'))
        process.chdir(directory)
    })

    afterEach(async () => {
        process.chdir(original)
        await fs.rm(directory, { recursive: true, force: true })
    })

    return () => directory
}

// Silences what the code prints so that the report of the tests stays readable.
export function useSilentConsole(method = 'log') {
    const original = console[method]

    beforeEach(() => {
        console[method] = () => {}
    })

    afterEach(() => {
        console[method] = original
    })
}
