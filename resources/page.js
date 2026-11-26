const mainlandTimeZone = 'Europe/Madrid'
const anHour = 60 * 60 * 1000

// The chart never reaches less than this price, so that a cheap day is drawn
// low and an expensive one high instead of every day filling the same height.
const minimumTop = 0.5

// The space between two bars, in CSS pixels.
const barGap = 3

const regions = [
    { id: 'peninsula', label: 'Península', timeZone: mainlandTimeZone },
    { id: 'baleares', label: 'Baleares', timeZone: mainlandTimeZone },
    { id: 'canarias', label: 'Canarias', timeZone: 'Atlantic/Canary' },
    { id: 'ceuta', label: 'Ceuta', timeZone: mainlandTimeZone },
    { id: 'melilla', label: 'Melilla', timeZone: mainlandTimeZone }
]

// What the page can be shown as: the chart or the table. The first one is
// shown when none was chosen, or when the one remembered no longer exists.
const views = [
    { id: 'chart', chart: true, table: false },
    { id: 'table', chart: false, table: true }
]

const themes = ['auto', 'light', 'dark']

const levelNames = {
    low: 'Hora barata',
    medium: 'Hora media',
    high: 'Hora cara'
}

const defaultRegion = regions[0]
const defaultDate = today()
const loadedDays = new Map()

// The days of the history, the day being shown —kept whole, so that changing
// region does not ask for it again—, its region, and when the site was built.
let dates = []
let currentDay = null
let currentRegion = defaultRegion
let builtAt = null
let currentView = null
// The hour going on, while the day shown is today.
let nowHour = null

const dayError = document.getElementById('dayError')
const updateInfo = document.getElementById('updateInfo')
const daySelector = document.getElementById('daySelector')
const previousDay = document.getElementById('previousDay')
const nextDay = document.getElementById('nextDay')
const regionSelector = document.getElementById('regionSelector')
const viewButtons = [...document.getElementById('viewSelector').children]
const themeButtons = [...document.getElementById('themeSelector').children]
const chartView = document.getElementById('chartView')
const tableView = document.getElementById('tableView')
const chartBars = document.getElementById('chartBars')
const hourLabels = document.getElementById('hourLabels')
const nowLegend = document.getElementById('nowLegend')
const yMax = document.getElementById('yMax')
const yMid = document.getElementById('yMid')
const nowPanel = document.getElementById('nowPanel')
const nowRange = document.getElementById('nowRange')
const nowPrice = document.getElementById('nowPrice')
const nowLevel = document.getElementById('nowLevel')
const priceTable = document.getElementById('priceTable')

function buildRegions() {
    regionSelector.innerHTML = regions
        .map(region => `<option value="${region.id}">${region.label}</option>`)
        .join('')
}

// The chart and the table are the same ones for every region, so changing region
// only repaints them.
function renderPrices() {
    if (currentDay === null) {
        return
    }

    const rows = priceRows(currentDay, currentRegion)

    renderNow(rows)
    renderChart(rows)
    renderTable(rows)
}

// The price of the hour being lived, which only exists while the day shown is
// the one going on.
function renderNow(rows) {
    const row = rows.find(row => row.isNow)

    nowPanel.hidden = row === undefined

    if (row === undefined) {
        return
    }

    nowRange.textContent = row.range
    nowPrice.textContent = formatPrice(row.kwh)
    nowLevel.textContent = levelNames[row.level]
    nowLevel.className = `badge ${row.level}`
}

// The chart has one bar for each hour, coloured by how cheap or expensive the
// hour is. Prices are measured against a top that leaves some room above the
// highest one, which is also what the two labels of the grid say. The bars and
// the hour labels below them are spaced the same, so that each label stays
// under its bar.
function renderChart(rows) {
    const top = Math.max(Math.max(...rows.map(row => row.kwh)) / 0.92, minimumTop)
    const height = kwh => kwh / top * 100

    yMax.textContent = formatAxisPrice(top)
    yMid.textContent = formatAxisPrice(top / 2)

    chartBars.innerHTML = rows
        .map(row => `<div class="bar ${row.level}${row.isNow ? ' now' : ''}" title="${row.range} · ${formatPrice(row.kwh)} €/kWh" style="height: ${height(row.kwh).toFixed(2)}%"></div>`)
        .join('')

    // Every hour has its label. On a narrow screen they are turned upright, so
    // that they fit under their bars without piling up.
    hourLabels.innerHTML = rows
        .map(row => `<span class="${row.isNow ? 'now' : ''}">${row.hour}</span>`)
        .join('')

    fitBars()

    nowHour = rows.find(row => row.isNow)?.hour ?? null

    renderNowLegend()
}

// The current hour is marked by a triangle above its bar in the chart and at
// the left of its row in the table, so the legend draws the one of the view
// being shown. It is drawn by the page and not written as a character, which
// some fonts lack and some systems turn into a coloured emoji.
function renderNowLegend() {
    nowLegend.hidden = nowHour === null
    nowLegend.dataset.view = currentView?.id ?? ''
    nowLegend.textContent = `= hora actual (${nowHour}:00)`
}

// A bar whose edges fall between two screen pixels is painted blurred, and the
// gaps around it look wider or narrower than the rest. So the bars and the gaps
// get a whole number of screen pixels, the first bar starts on a whole pixel,
// and the few pixels left over are shared at both sides of the chart. The bars
// are measured on their own, without the column of the price labels.
function fitBars() {
    const hours = chartBars.children.length

    if (hours === 0 || chartBars.clientWidth === 0) {
        return
    }

    const ratio = window.devicePixelRatio || 1
    const left = chartBars.getBoundingClientRect().left * ratio
    const width = chartBars.clientWidth * ratio
    const gap = Math.max(1, Math.round(barGap * ratio))
    const bar = Math.floor((width - gap * (hours - 1)) / hours)
    const spare = width - bar * hours - gap * (hours - 1)
    const offset = Math.round(left + spare / 2) - left

    chartView.style.setProperty('--hours', hours)
    chartView.style.setProperty('--bar-width', `${bar / ratio}px`)
    chartView.style.setProperty('--bar-gap', `${gap / ratio}px`)
    chartView.style.setProperty('--bar-offset', `${offset / ratio}px`)
}

// The hours are read in two columns, the first half of the day next to the
// second one. Each price also has a bar, measured against the most expensive
// hour of the day, so that both columns share the same scale.
function renderTable(rows) {
    const half = Math.ceil(rows.length / 2)
    const highest = Math.max(...rows.map(row => row.kwh))

    priceTable.innerHTML = [rows.slice(0, half), rows.slice(half)]
        .map(column => `<div class="table-column">${tableHead()}${column.map(row => tableRow(row, highest)).join('')}</div>`)
        .join('')
}

function tableHead() {
    return '<div class="table-head"><span>Hora</span><span></span><span>€/kWh</span></div>'
}

function tableRow(row, highest) {
    const width = highest > 0 ? Math.max(row.kwh, 0) / highest * 100 : 0

    return `<div class="table-row ${row.level}${row.isNow ? ' now' : ''}"${row.isNow ? ' title="Hora actual" aria-current="time"' : ''}>`
        + `<span class="hour">${row.range}</span>`
        + `<span class="price-bar" aria-hidden="true"><span style="width: ${width.toFixed(2)}%"></span></span>`
        + `<span class="price">${formatPrice(row.kwh)}</span>`
        + '</div>'
}

// What depends on the day and not on the region.
function renderDay() {
    document.title = `Precios de la luz - ${formatDate(currentDay.date)}`
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
// time, below the prices. It says nothing about the prices, which the API
// publishes the evening before at a time that never changes: it tells whether
// the page being read is the one of today or an old one kept by the browser.
function showBuildInfo() {
    updateInfo.textContent = `Última actualización el ${formatInstantDate(builtAt)} a las ${formatTime(builtAt)}`
    updateInfo.hidden = builtAt === null
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

function dayFile(date) {
    const [year, month, day] = date.split('-')

    return `data/${year}/${month}/${day}.json`
}

async function loadDay(date) {
    if (loadedDays.has(date)) {
        return loadedDays.get(date)
    }

    try {
        const response = await fetch(dayFile(date))

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
}

function selectRegion(region) {
    currentRegion = region
    regionSelector.value = region.id
    renderPrices()
}

// Whether the chart or the table is shown. It is a way of reading the
// same day, so it is kept in the browser and not in the url, which only records
// which prices are being shown.
function selectView(id) {
    const view = views.find(view => view.id === id) ?? views[0]

    currentView = view

    chartView.hidden = !view.chart
    tableView.hidden = !view.table

    viewButtons.forEach(button => {
        const selected = button.dataset.view === view.id

        button.classList.toggle('active', selected)
        button.setAttribute('aria-pressed', selected)
    })

    renderNowLegend()
    remember('vista', view.id)
}

// `auto` follows the system, which is where the page starts. The choice is
// applied by the small script of the page before it is painted, so that a dark
// page is never shown light first.
function selectTheme(id) {
    const theme = themes.includes(id) ? id : themes[0]

    document.documentElement.dataset.theme = theme

    themeButtons.forEach(button => {
        const selected = button.dataset.theme === theme

        button.classList.toggle('active', selected)
        button.setAttribute('aria-pressed', selected)
    })

    remember('tema', theme)
}

// The theme and the view are remembered between visits. A browser that refuses
// to store them just forgets them, and the page opens with its defaults.
function remember(key, value) {
    try {
        localStorage.setItem(key, value)
    } catch {
        // Nothing to do: the choice only lasts for this visit.
    }
}

function remembered(key) {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
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
    const now = Date.now()

    return prices.map((kwh, index) => {
        const start = new Date(day.datetimes[index])
        const end = new Date(start.getTime() + anHour)
        const hour = formatHour(start, region.timeZone)

        return {
            hour,
            range: `${hour}:00–${formatHour(end, region.timeZone)}:00`,
            kwh,
            level: level(kwh, thresholds),
            // Every price covers one real hour, so the one being lived is found
            // by the instant it started and not by the date of the day, which
            // the Canary Islands do not share with the rest.
            isNow: now >= start.getTime() && now < end.getTime()
        }
    })
}

// The current day in mainland time, which is the day the page shows by default.
// The day after is in the history too from 21:00, and the arrows reach it.
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

function formatInstantDate(instant) {
    return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: mainlandTimeZone
    }).format(new Date(instant))
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
    return kwh.toFixed(4).replace('.', ',')
}

// The labels of the chart only mark the scale, so two decimals are enough.
function formatAxisPrice(kwh) {
    return kwh.toFixed(2).replace('.', ',')
}

// Prices are stored in mainland time. The Canary Islands show those same hours
// in their own time zone, so their table starts at 23:00 of the previous day.
function formatHour(instant, timeZone) {
    return new Intl.DateTimeFormat('es-ES', {
        hour: '2-digit',
        hourCycle: 'h23',
        timeZone
    }).format(instant)
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
regionSelector.addEventListener('change', () => goToRegion(findRegion(regionSelector.value)))
viewButtons.forEach(button => button.addEventListener('click', () => selectView(button.dataset.view)))
themeButtons.forEach(button => button.addEventListener('click', () => selectTheme(button.dataset.theme)))
window.addEventListener('popstate', applyUrl)
// The border box of the bars is set by the chart alone, while their content box
// changes with the offset that fitBars sets, so only the first one is watched.
new ResizeObserver(fitBars).observe(chartBars, { box: 'border-box' })

// The hour being lived changes while the page is open, so whatever marks it is
// repainted every minute.
setInterval(renderPrices, 60 * 1000)

buildRegions()
selectRegion(currentRegion)
selectView(remembered('vista') ?? views[0].id)
selectTheme(remembered('tema') ?? themes[0])

const site = await loadSite()

dates = site.dates ?? []
builtAt = site.builtAt ?? null
showBuildInfo()
daySelector.min = dates[0] ?? ''
daySelector.max = dates.at(-1) ?? ''

await applyUrl()
replaceUrl()
