const mainlandTimeZone = 'Europe/Madrid'

// The current day in mainland time, which is the one the daily execution
// downloads and the one the page shows by default.
export function today() {
    const parts = new Intl.DateTimeFormat('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: mainlandTimeZone
    }).formatToParts(new Date())

    const part = type => parts.find(item => item.type === type).value

    return `${part('year')}-${part('month')}-${part('day')}`
}

// Every date handled here is a `YYYY-MM-DD` day of the history. Parsing one and
// formatting it back rejects the wrong shapes and also the days that do not
// exist, because `2025-02-30` is read as the 2nd of March.
export function isDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false
    }

    const date = parse(value)

    return !Number.isNaN(date.getTime()) && format(date) === value
}

// Every day of the range, both ends included. Days are added in UTC, where
// there are no DST changes that would turn one of them into 23 or 25 hours.
export function* datesBetween(start, end) {
    const date = parse(start)
    const last = parse(end)

    while (date <= last) {
        yield format(date)

        date.setUTCDate(date.getUTCDate() + 1)
    }
}

// How many days a range covers, both ends included. Counted in UTC, where every
// day lasts the same and the DST changes do not round to a day and a half.
export function daysInRange(start, end) {
    const day = 24 * 60 * 60 * 1000

    return (parse(end) - parse(start)) / day + 1
}

function parse(date) {
    return new Date(`${date}T00:00:00Z`)
}

function format(date) {
    return date.toISOString().slice(0, 10)
}
