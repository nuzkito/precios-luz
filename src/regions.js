// The API only publishes two distinct price series, even though it accepts all
// five geo_ids: 8741 is shared by mainland Spain, the Balearic and the Canary
// Islands, and 8744 is shared by Ceuta and Melilla. Hence two requests per day.
// The region names are the keys of `prices` in the stored JSON, so the page uses
// these same ones in `resources/page.js`.
export const series = [
    { geoId: 8741, regions: ['peninsula', 'baleares', 'canarias'] },
    { geoId: 8744, regions: ['ceuta', 'melilla'] }
]
