import axios from 'axios'
import dayjs from 'dayjs'
import fs from 'fs/promises'
import ejs from 'ejs'

async function getPrices() {
    const today = dayjs()
    const startDate = today.format('YYYY-MM-DD')
    const endDate = today.add(1, 'day').format('YYYY-MM-DD')
    const url = `https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=${startDate}T00:00&end_date=${endDate}T00:00&time_trunc=hour`

    try {
        const response = await axios.get(url)
        return response.data
    } catch (error) {
        console.error('Error downloading data:', error.message)
        process.exit(1)
    }
}

function processData(rawData) {
    const today = dayjs()
    const pvpcData = rawData.included.find(item => item.type === 'PVPC')

    if (!pvpcData) {
        throw new Error('PVPC data not found in the input data')
    }

    const prices = pvpcData.attributes.values.map(item => {
        const datetime = dayjs(item.datetime)
        if (datetime.format('YYYY-MM-DD') === today.format('YYYY-MM-DD')) {
            return {
                hour: datetime.format('HH'),
                kwh: Number((item.value / 1000).toFixed(4))
            }
        }
    }).filter(Boolean)

    const thresholds = calculateThresholds(prices)
    const pricesWithColors = prices.map(price => ({
        ...price,
        range: range(price.kwh, thresholds)
    }))

    return pricesWithColors.sort((a, b) => a.hour.localeCompare(b.hour))
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
    const today = dayjs()

    try {
        const template = await fs.readFile('template.html', 'utf8')
        const html = ejs.render(template, {
            prices: prices,
            currentDate: today.format('DD/MM/YYYY')
        })

        await fs.writeFile('index.html', html)
        console.log('HTML generated successfully')
    } catch (error) {
        console.error('Error generating HTML:', error.message)
        process.exit(1)
    }
}

async function updatePrices() {
    try {
        const rawData = await getPrices()
        const prices = processData(rawData)
        await generateHtml(prices)
    } catch (error) {
        console.error('Error updating prices:', error.message)
        process.exit(1)
    }
}

updatePrices()
