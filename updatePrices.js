import axios from 'axios'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import fs from 'fs/promises'
import ejs from 'ejs'

dayjs.extend(utc)
dayjs.extend(timezone)

const url = process.env.url ?? 'http://localhost:3000/_site'

class GeoId {
    #value

    constructor(value) {
        this.#value = value
    }

    value() {
        return this.#value
    }

    static ceuta() {
        return new GeoId(8744)
    }

    static peninsula() {
        return new GeoId(8741)
    }
}

class TimeZone {
    #value

    constructor(value) {
        this.#value = value
    }

    value() {
        return this.#value
    }

    static madrid() {
        return new TimeZone('Europe/Madrid')
    }

    static canary() {
        return new TimeZone('Atlantic/Canary')
    }
}

async function getPrices(geoId) {
    const today = dayjs().tz('Europe/Madrid')
    const startDate = today.format('YYYY-MM-DD')
    const endDate = today.add(1, 'day').format('YYYY-MM-DD')
    const url = `https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=${startDate}T00:00&end_date=${endDate}T00:00&time_trunc=hour&geo_ids=${geoId.value()}`

    try {
        const response = await axios.get(url)
        return response.data
    } catch (error) {
        console.error('Error downloading data:', error.message)
        process.exit(1)
    }
}

function processData(rawData, timeZone) {
    const today = dayjs().tz('Europe/Madrid')
    const pvpcData = rawData.included.find(item => item.type === 'PVPC')

    if (!pvpcData) {
        throw new Error('PVPC data not found in the input data')
    }

    const prices = pvpcData.attributes.values.map(item => {
        const datetime = dayjs(item.datetime).tz('Europe/Madrid')

        if (datetime.isSame(today, 'day')) {
            return {
                hour: datetime.tz(timeZone.value()).format('HH'),
                kwh: Number((item.value / 1000).toFixed(4))
            }
        }
    }).filter(Boolean)

    return prices.map(price => ({
        ...price,
        range: range(price.kwh, calculateThresholds(prices))
    }))
}

function calculateThresholds(prices) {
    const allPrices = prices.map(p => p.kwh)
    const minPrice = Math.min(...allPrices)
    const maxPrice = Math.max(...allPrices)
    const priceRange = maxPrice - minPrice

    return {
        low: minPrice + (priceRange * 0.33),
        high: minPrice + (priceRange * 0.66)
    }
}

function range(kwh, thresholds) {
    if (kwh <= thresholds.low) return 'low'
    if (kwh <= thresholds.high) return 'medium'
    return 'high'
}

async function generateHtml(prices) {
    const currentDateTime = dayjs().tz('Europe/Madrid')

    try {
        const template = await fs.readFile('template.html', 'utf8')
        const html = ejs.render(template, { prices, currentDateTime, url })

        await fs.mkdir('_site', { recursive: true })
        await fs.writeFile('_site/index.html', html)
        await fs.cp('resources', '_site', { recursive: true })

        console.log('HTML generated successfully')
    } catch (error) {
        console.error('Error generating HTML:', error.message)
        process.exit(1)
    }
}

async function updatePrices() {
    try {
        const peninsulaData = await getPrices(GeoId.peninsula())
        const peninsulaPrices = processData(peninsulaData, TimeZone.madrid())

        const ceutaData = await getPrices(GeoId.ceuta())
        const ceutaPrices = processData(ceutaData, TimeZone.madrid())

        const canariasPrices = processData(peninsulaData, TimeZone.canary())

        const allPrices = {
            peninsula: peninsulaPrices,
            canarias: canariasPrices,
            ceutaMelilla: ceutaPrices
        }

        await generateHtml(allPrices)
    } catch (error) {
        console.error('Error updating prices:', error.message)
        process.exit(1)
    }
}

updatePrices()
