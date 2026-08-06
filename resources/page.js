const mainlandTimeZone = 'Europe/Madrid'

const regions = [
    { id: 'peninsula', label: 'Península', timeZone: mainlandTimeZone },
    { id: 'baleares', label: 'Baleares', timeZone: mainlandTimeZone },
    { id: 'canarias', label: 'Canarias', timeZone: 'Atlantic/Canary' },
    { id: 'ceuta', label: 'Ceuta', timeZone: mainlandTimeZone },
    { id: 'melilla', label: 'Melilla', timeZone: mainlandTimeZone }
]

const defaultRegion = regions[0]
const defaultDate = today()
const loadedDays = new Map()
const regionButtons = new Map()

// The days of the history, the day being shown —kept whole, so that changing
// region does not ask for it again—, its region, and when the site was built.
let dates = []
let currentDay = null
let currentRegion = defaultRegion
let builtAt = null

const dayInfo = document.getElementById('dayInfo')
const dayError = document.getElementById('dayError')
const daySelector = document.getElementById('daySelector')
const previousDay = document.getElementById('previousDay')
const nextDay = document.getElementById('nextDay')
const regionSelector = document.getElementById('regionSelector')
const tableBody = document.querySelector('#priceTable tbody')
const chart = createChart(document.getElementById('priceChart'))

// The table and the chart are the same ones for every region, so changing region
// only repaints them.
function buildRegions() {
    regions.forEach(region => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'region-button'
        button.textContent = region.label
        button.addEventListener('click', () => goToRegion(region))

        regionButtons.set(region.id, button)
        regionSelector.append(button)
    })
}

function createChart(canvas) {
    return new Chart(canvas, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Precio (€/kWh)',
                    data: [],
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => formatPrice(value)
                    }
                }
            }
        }
    })
}

// The prices of the day being shown, in the selected region. It is called both
// when the day changes and when the region does, so until a day is loaded there
// is nothing to draw.
function renderPrices() {
    if (currentDay === null) {
        return
    }

    const prices = priceRows(currentDay, currentRegion)

    tableBody.innerHTML = prices
        .map(price => `<tr class="${price.level}"><td>${price.hour}:00</td><td>${formatPrice(price.kwh)}</td></tr>`)
        .join('')

    chart.data.labels = prices.map(price => `${price.hour}:00`)
    chart.data.datasets[0].data = prices.map(price => price.kwh)
    chart.update()
}

// What depends on the day and not on the region.
function renderDay() {
    document.title = `Precios de la luz - ${formatDate(currentDay.date)}`
    dayInfo.textContent = `Fecha: ${formatDate(currentDay.date)}${buildInfo()}`
    daySelector.value = currentDay.date
    previousDay.disabled = !neighbourDate(-1)
    nextDay.disabled = !neighbourDate(1)
}

// The stored day before or after the one being shown, which is what the arrows
// navigate to. The days of the history need not be consecutive, so they are
// walked by position and not by date.
function neighbourDate(offset) {
    const index = dates.indexOf(currentDay?.date)

    return index < 0 ? undefined : dates[index + offset]
}

// When the site was published, which is what the page reports as its update
// time. It says nothing about the prices, which the API publishes the evening
// before at a time that never changes: it tells whether the page being read is
// the one of today or an old one kept by the browser.
function buildInfo() {
    return builtAt === null ? '' : ` (Actualizado a las ${formatTime(builtAt)})`
}

// The stored days, used by the arrows and by the limits of the date input, and
// the moment the site was built. If it cannot be
// read the page keeps working with the date of the day alone, which is the part
// that matters.
async function loadSite() {
    try {
        const response = await fetch('site.json')

        return response.ok ? await response.json() : {}
    } catch {
        return {}
    }
}

async function loadDay(date) {
    if (loadedDays.has(date)) {
        return loadedDays.get(date)
    }

    try {
        const response = await fetch(`data/${date}.json`)

        if (!response.ok) {
            return null
        }

        const day = await response.json()
        loadedDays.set(date, day)

        return day
    } catch {
        return null
    }
}

async function showDay(date) {
    if (date === currentDay?.date) {
        return true
    }

    // The history is already known, so the days that are not in it are answered
    // without asking for them.
    const day = dates.includes(date) ? await loadDay(date) : null

    if (day === null) {
        showDayError()

        return false
    }

    dayError.hidden = true
    currentDay = day
    renderDay()
    renderPrices()

    return true
}

// The day that was asked for cannot be shown, so the page keeps the one it had,
// or stays empty if there was none.
function showDayError() {
    dayError.hidden = false
    daySelector.value = currentDay?.date ?? ''

    if (currentDay === null) {
        dayInfo.textContent = ''
    }
}

function selectRegion(region) {
    currentRegion = region

    regionButtons.forEach((button, id) => {
        const selected = id === region.id

        button.classList.toggle('active', selected)
        button.setAttribute('aria-pressed', selected)
    })

    renderPrices()
}

// Today is the day shown by default, but its prices may not be published yet:
// in that case it falls back to the most recent stored day instead of showing an
// empty page. Any other day missing from the history is a mistake and shows the
// error.
function availableDate(date) {
    return date === defaultDate && !dates.includes(date) ? dates.at(-1) ?? date : date
}

function buildUrl() {
    const url = new URL(window.location)

    if (currentRegion === defaultRegion) {
        url.searchParams.delete('de')
    } else {
        url.searchParams.set('de', currentRegion.id)
    }

    if (currentDay === null || currentDay.date === defaultDate) {
        url.searchParams.delete('dia')
    } else {
        url.searchParams.set('dia', currentDay.date)
    }

    return url
}

function pushUrl() {
    window.history.pushState({}, '', buildUrl())
}

function replaceUrl() {
    window.history.replaceState({}, '', buildUrl())
}

// The url only records what is being shown, so it is not touched when the day
// cannot be shown.
async function goToDay(date) {
    if (await showDay(date)) {
        pushUrl()
    }
}

function goToRegion(region) {
    selectRegion(region)
    pushUrl()
}

async function applyUrl() {
    const params = new URLSearchParams(window.location.search)

    selectRegion(findRegion(params.get('de')) ?? defaultRegion)
    await showDay(availableDate(params.get('dia') ?? defaultDate))
}

function findRegion(id) {
    return regions.find(region => region.id === id)
}

// Turns the stored data of a day into the rows shown for a region.
function priceRows(day, region) {
    const prices = day.prices[region.id]
    const thresholds = calculateThresholds(prices)

    return prices.map((kwh, index) => ({
        hour: formatHour(day.datetimes[index], region.timeZone),
        kwh,
        level: level(kwh, thresholds)
    }))
}

// The current day in mainland time, which is the day the page shows by default
// and the one the daily execution downloads.
function today() {
    const parts = new Intl.DateTimeFormat('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: mainlandTimeZone
    }).formatToParts(new Date())

    const part = type => parts.find(item => item.type === type).value

    return `${part('year')}-${part('month')}-${part('day')}`
}

function formatDate(date) {
    const [year, month, dayOfMonth] = date.split('-')

    return `${dayOfMonth}/${month}/${year}`
}

function formatTime(instant) {
    return new Intl.DateTimeFormat('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: mainlandTimeZone
    }).format(new Date(instant))
}

function formatPrice(kwh) {
    return `${kwh.toFixed(4)} €`
}

// Prices are stored in mainland time. The Canary Islands show those same hours
// in their own time zone, so their table starts at 23:00 of the previous day.
function formatHour(datetime, timeZone) {
    return new Intl.DateTimeFormat('es-ES', {
        hour: '2-digit',
        hourCycle: 'h23',
        timeZone
    }).format(new Date(datetime))
}

function calculateThresholds(prices) {
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const priceRange = maxPrice - minPrice

    return {
        low: minPrice + (priceRange * 0.33),
        high: minPrice + (priceRange * 0.66)
    }
}

function level(kwh, thresholds) {
    if (kwh <= thresholds.low) return 'low'
    if (kwh <= thresholds.high) return 'medium'

    return 'high'
}

daySelector.addEventListener('change', () => goToDay(daySelector.value))
previousDay.addEventListener('click', () => goToDay(neighbourDate(-1)))
nextDay.addEventListener('click', () => goToDay(neighbourDate(1)))
window.addEventListener('popstate', applyUrl)

buildRegions()

const site = await loadSite()

dates = site.dates ?? []
builtAt = site.builtAt ?? null
daySelector.min = dates[0] ?? ''
daySelector.max = dates.at(-1) ?? ''

await applyUrl()
replaceUrl()
