import { setTimeout as wait } from 'node:timers/promises'

const endpoint = 'https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real'
const maxAttempts = 3
const retryDelay = 5000

// What the API accepts is a month of calendar from `start_date`, not a number of
// days: asking from the 1st of June to the 1st of July is answered with a 400,
// while the same 31 days from the 1st of January are not. So the longest range
// that works whatever the starting day is 28, which never reaches the next month
// even starting on the 1st of February. The hours do not count: a range with the
// 25 of the DST change is as good as any other.
export const maxRangeDays = 28

// Downloads the hours of a range of days, both ends included. Asking from 00:00
// of the first to 23:59 of the last returns exactly their hours, including the
// 23 or 25 of the DST changes. The days that are not published yet are simply
// missing from the answer.
//
// One geo_id per request: asking for the two of them at once, separated by a
// comma, is answered with an error.
export async function fetchRange(start, end, geoId) {
    const url = `${endpoint}?start_date=${start}T00:00&end_date=${end}T23:59&time_trunc=hour&geo_ids=${geoId}`
    const data = await request(url)
    const pvpc = data.included?.find(item => item.type === 'PVPC')

    if (!pvpc) {
        throw new Error(`PVPC data not found for ${start}..${end} (geo_id ${geoId})`)
    }

    return pvpc.attributes.values.map(value => ({
        datetime: value.datetime,
        kwh: Number((value.value / 1000).toFixed(4))
    }))
}

// The API returns 502 intermittently, so requests are retried before failing.
async function request(url) {
    let lastError

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await requestOnce(url)
        } catch (error) {
            lastError = error

            if (attempt < maxAttempts) {
                console.warn(`Attempt ${attempt} failed (${error.message}), retrying...`)
                await wait(retryDelay)
            }
        }
    }

    throw lastError
}

async function requestOnce(url) {
    const response = await fetch(url)
    const data = await response.json().catch(() => null)

    // Errors arrive as an `errors` body, sometimes with a 200 status code.
    if (!response.ok || !data || data.errors) {
        const detail = data?.errors?.[0]?.detail ?? `status code ${response.status}`

        throw new Error(`Request failed: ${detail}`)
    }

    return data
}
