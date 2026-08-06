import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { series } from '../src/regions.js'

describe('series', () => {
    it('are the two the API publishes, with the regions each one covers', () => {
        assert.deepEqual(series, [
            { geoId: 8741, regions: ['peninsula', 'baleares', 'canarias'] },
            { geoId: 8744, regions: ['ceuta', 'melilla'] }
        ])
    })

    it('do not share a region, so every region has a single price', () => {
        const regions = series.flatMap(serie => serie.regions)

        assert.equal(new Set(regions).size, regions.length)
    })

    it('name the regions the way the page and the stored prices do', () => {
        const regions = series.flatMap(serie => serie.regions)

        assert.deepEqual(regions.toSorted(), [
            'baleares',
            'canarias',
            'ceuta',
            'melilla',
            'peninsula'
        ])
    })
})
