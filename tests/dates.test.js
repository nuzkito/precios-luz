import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { datesBetween, daysInRange, isDate, today, tomorrow } from '../src/dates.js'

// The dates are handled in UTC so that the DST changes do not turn a day into
// 23 or 25 hours. Running in a timezone that does change is what makes these
// tests notice it: in UTC, which is where the container and the workflow run,
// any way of counting days would look right.
process.env.TZ = 'Europe/Madrid'

// The day depends on the clock, so it is fixed for every case. The instants are
// written in UTC to make the offset of the mainland visible.
function todayAt(instant) {
    return at(instant, today)
}

function tomorrowAt(instant) {
    return at(instant, tomorrow)
}

function at(instant, day) {
    mock.timers.enable({ apis: ['Date'], now: new Date(instant).getTime() })

    try {
        return day()
    } finally {
        mock.timers.reset()
    }
}

describe('today', () => {
    it('is the day in mainland time and not the one in UTC', () => {
        // Summer, when the mainland is two hours ahead of UTC.
        assert.equal(todayAt('2026-07-29T22:30:00Z'), '2026-07-30')
        assert.equal(todayAt('2026-07-29T21:30:00Z'), '2026-07-29')

        // Winter, when it is only one.
        assert.equal(todayAt('2026-01-15T23:30:00Z'), '2026-01-16')
        assert.equal(todayAt('2026-01-15T22:30:00Z'), '2026-01-15')
    })

    it('pads the month and the day, which is how the history is named', () => {
        assert.equal(todayAt('2026-03-05T12:00:00Z'), '2026-03-05')
    })
})

describe('tomorrow', () => {
    it('is the day after today in mainland time', () => {
        // The daily execution runs at 21:00 of the mainland, which is 19:00 UTC
        // in summer and 20:00 in winter.
        assert.equal(tomorrowAt('2026-07-29T19:00:00Z'), '2026-07-30')
        assert.equal(tomorrowAt('2026-01-15T20:00:00Z'), '2026-01-16')

        // Past midnight of the mainland the day after is already another one.
        assert.equal(tomorrowAt('2026-07-29T22:30:00Z'), '2026-07-31')
    })

    it('crosses months and years', () => {
        assert.equal(tomorrowAt('2026-02-28T19:00:00Z'), '2026-03-01')
        assert.equal(tomorrowAt('2025-12-31T19:00:00Z'), '2026-01-01')
    })

    it('does not skip nor repeat a day on the DST changes', () => {
        assert.equal(tomorrowAt('2026-03-28T19:00:00Z'), '2026-03-29')
        assert.equal(tomorrowAt('2026-03-29T19:00:00Z'), '2026-03-30')
        assert.equal(tomorrowAt('2025-10-25T19:00:00Z'), '2025-10-26')
        assert.equal(tomorrowAt('2025-10-26T20:00:00Z'), '2025-10-27')
    })
})

describe('isDate', () => {
    it('accepts a day of the history', () => {
        assert.equal(isDate('2026-07-29'), true)
        assert.equal(isDate('2024-02-29'), true)
    })

    it('rejects anything that is not exactly `YYYY-MM-DD`', () => {
        assert.equal(isDate('2026-7-29'), false)
        assert.equal(isDate('26-07-29'), false)
        assert.equal(isDate('2026-07-29T00:00'), false)
        assert.equal(isDate('2026-07-29 '), false)
        assert.equal(isDate('index'), false)
        assert.equal(isDate(''), false)
        assert.equal(isDate(undefined), false)
    })

    it('rejects the days that do not exist', () => {
        assert.equal(isDate('2026-02-30'), false)
        assert.equal(isDate('2025-02-29'), false)
        assert.equal(isDate('2026-13-01'), false)
        assert.equal(isDate('2026-00-10'), false)
        assert.equal(isDate('2026-01-32'), false)
    })
})

describe('datesBetween', () => {
    it('gives both ends of the range', () => {
        assert.deepEqual([...datesBetween('2026-07-27', '2026-07-30')], [
            '2026-07-27',
            '2026-07-28',
            '2026-07-29',
            '2026-07-30'
        ])
    })

    it('gives a single day when the range is one day long', () => {
        assert.deepEqual([...datesBetween('2026-07-29', '2026-07-29')], ['2026-07-29'])
    })

    it('crosses months and years', () => {
        assert.deepEqual([...datesBetween('2026-02-27', '2026-03-02')], [
            '2026-02-27',
            '2026-02-28',
            '2026-03-01',
            '2026-03-02'
        ])

        assert.deepEqual([...datesBetween('2025-12-31', '2026-01-01')], ['2025-12-31', '2026-01-01'])
    })

    it('does not skip nor repeat a day on the DST changes', () => {
        assert.deepEqual([...datesBetween('2026-03-28', '2026-03-30')], [
            '2026-03-28',
            '2026-03-29',
            '2026-03-30'
        ])

        assert.deepEqual([...datesBetween('2025-10-25', '2025-10-27')], [
            '2025-10-25',
            '2025-10-26',
            '2025-10-27'
        ])
    })

    it('gives nothing when the range is inverted', () => {
        assert.deepEqual([...datesBetween('2026-07-30', '2026-07-29')], [])
    })
})

describe('daysInRange', () => {
    it('counts both ends', () => {
        assert.equal(daysInRange('2026-07-29', '2026-07-29'), 1)
        assert.equal(daysInRange('2026-07-29', '2026-07-30'), 2)
    })

    it('counts the 28 days of the longest range the API accepts', () => {
        assert.equal(daysInRange('2026-02-01', '2026-02-28'), 28)
    })

    it('counts whole days on the DST changes', () => {
        assert.equal(daysInRange('2026-03-28', '2026-03-30'), 3)
        assert.equal(daysInRange('2025-10-25', '2025-10-27'), 3)
    })

    it('crosses months and years', () => {
        assert.equal(daysInRange('2026-01-01', '2026-03-01'), 60)
        assert.equal(daysInRange('2025-12-31', '2026-01-01'), 2)
    })
})
