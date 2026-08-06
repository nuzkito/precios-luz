# Precios de la electricidad en España

El precio de la luz en España cambia cada hora. La REE —Red Eléctrica de España, quien opera la red— publica los datos cada día a las 21:00. Este proyecto recoge los datos y los muestra en una web para facilitar el acceso a la información.

Todos los días a las 00:00 descarga los precios desde la API de la REE, los guarda en `data/<YYYY-MM-DD>.json` y publica una web estática que los muestra. En la web se pueden consultar los precios de un día concreto.

**La web publicada está en https://precioluz.nuzkito.es** y el histórico, en [`data/`](data/). La documentación de la API de REE está en https://www.ree.es/es/datos/apidatos.

## Entorno de desarrollo

El entorno de desarrollo utiliza Docker con Compose: Node se ejecuta dentro del contenedor que describe el `Dockerfile`.

Para probar la web el local, descarga los precios de hoy y construye el sitio en `_site`:

```sh
docker compose run --rm node npm run update
```

Termina con dos líneas que dicen que el día se ha guardado y cuántos hay ya en el histórico:

```
Prices for 2026-08-02 saved
Site built (9 days in the history)
```

Ahora levanta el servidor para verlo en el navegador:

```sh
docker compose up --detach server
```

La web se publica en http://localhost:3000, con la tabla y la gráfica del día que acabas de descargar. Para apagar el servidor de la web:

```sh
docker compose down
```

Es necesario servidor la web por HTTP: la página lee `data/` con `fetch` e importa módulos. Abrir `_site/index.html` directamente no funciona.

## Comandos

Descargar los precios de hoy y construir `_site`:

```sh
docker compose run --rm node npm run update
```

Rellenar días pasados. Las dos fechas son el primer y el último día, ambos incluidos; cámbialas por el rango que quieras:

```sh
docker compose run --rm node npm run backfill -- 2025-01-01 2025-12-31
```

También se puede solicitar un solo día, pasando únicamente una fecha:

```sh
docker compose run --rm node npm run backfill -- 2025-01-01
```

El backfill salta los días que ya existen, salvo que se le pase `--force`, Si un día falla, se continúa descargando el resto. Los datos se piden en rangos de 28 días por limitaciones de la API. Al acabar resume cuántos días ha bajado, cuántos ya estaban y cuántos han fallado, y se indica un error si falló alguno.

Tampoco construye el sitio: para ver los días nuevos en el navegador hay que lanzar `npm run update` después.

Ejecutar tests de `src/`:

```sh
docker compose run --rm node npm test
```

Si cambia el `Dockerfile`, reconstruye la imagen:

```sh
docker compose build
```

## Estructura del proyecto

```
updatePrices.js      ejecución diaria: descarga el día y construye el sitio
backfill.js          rellena días pasados
src/ree.js           peticiones a la API de REE
src/data.js          valida, guarda y lista los días de `data/`
src/dates.js         el día de hoy en hora peninsular y los rangos de fechas
src/regions.js       equivalencia entre región y `geo_id`
src/buildSite.js     copia `resources/` y `data/` a `_site`
resources/           recursos de la web
data/<fecha>.json    el histórico de precios
tests/               un archivo por cada módulo de `src/`, más un `helpers.js` con funciones utilitarias
```

## Tests

Usan el sistema de testing nativo de Node, sin dependencias, uno por cada módulo de `src/`. Ninguno llama a la API de la REE: `useFakeFetch()` sustituye el `fetch` global por un doble que responde lo que pida cada test.

Como `src/` trabaja con rutas relativas —`data` y `_site` cuelgan de donde se arranque Node—, los tests que tocan el disco se mueven a un directorio temporal con `useTemporaryDirectory()`.

Dos cosas no se pueden probar tal cual y el runner necesita saberlo:

- Los cinco segundos que `ree.js` espera entre reintentos. `tests/ree.test.js` sustituye `node:timers/promises` con `mock.module()`, que pide `--experimental-test-module-mocks`, y de paso comprueba cuánto se habría esperado. Por eso importa `src/ree.js` con un `import()` en vez de arriba del archivo: el módulo hay que sustituirlo antes de cargarlo.
- La zona horaria. `tests/dates.test.js` fija `process.env.TZ` en `Europe/Madrid`, porque en UTC —donde corren el contenedor y el workflow— contar los días en local o en UTC da lo mismo y los cambios de hora no delatan nada.

## Formato de los datos

Cada día es un archivo `data/<YYYY-MM-DD>.json` con este formato — Ejemplo: [`data/2026-07-29.json`](data/2026-07-29.json):

```json
{
    "date": "2026-07-29",
    "datetimes": ["2026-07-29T00:00:00.000+02:00", "..."],
    "prices": {
        "peninsula": [0.1876, "..."],
        "baleares": [0.1876, "..."],
        "canarias": [0.1876, "..."],
        "ceuta": [0.1876, "..."],
        "melilla": [0.1876, "..."]
    }
}
```

Los precios están en €/kWh y comparten el eje de `datetimes`, siempre en hora peninsular. La API solo publica dos series distintas —una para península, Baleares y Canarias, y otra para Ceuta y Melilla—, así que bastan dos peticiones por rango. Cada una se pide con su `geo_id`, que es como la API nombra las zonas del sistema eléctrico, y los dos no se pueden pedir juntos en la misma petición.

Una petición puede abarcar un mes de calendario desde `start_date`, no un número de días: del 1 de enero al 31 de enero se responde, y del 1 de junio al 1 de julio no, aunque los dos rangos sean de 31 días. Por eso `maxRangeDays` son 28, el rango más largo que vale empiece el día que empiece. El cambio de hora no influye. `downloadRange()` reparte las horas de la respuesta entre los días del rango y arma cada uno por separado, para que uno roto no estropee a los demás.

Un día se guarda solo si viene completo, para que no quede en el histórico un archivo vacío que luego se salte por existir. Falla si:

- no trae 23, 24 o 25 horas —los dos extremos son los cambios de hora—,
- las dos series no cubren exactamente las mismas horas.

La API deja fuera del rango los días que todavía no ha publicado, que así se quedan en cero horas, y devuelve 502 de vez en cuando: cada petición se reintenta 3 veces antes de fallar.

De la respuesta solo se guardan las horas y sus precios.

## La web

Muestra el día actual y, si todavía no está publicado, el último guardado. La url refleja lo que se ve, con las mismas claves que `prices`:

```
https://precioluz.nuzkito.es/?dia=2026-07-29&de=canarias
```

Península es la región por defecto y se omite del parámetro. Las flechas y el selector se mueven por la lista de días guardados que escribe `buildSite.js` en `site.json`.

Los precios se guardan en hora peninsular y cada región los pinta en la suya, así que la tabla de Canarias empieza a las 23:00 del día anterior.

## Despliegue

`.github/workflows/deploy.yml` descarga los precios, guarda los archivos nuevos de `data/` en el repositorio y publica `_site` en GitHub Pages, que lo sirve en el dominio del archivo `CNAME`. Se ejecuta a las 00:00 de Europe/Madrid —el cron se lanza a las 22 y 23 UTC para tener en cuenta los horarios de verano e invierno, y un primer job descarta la hora que no toca— y también en cada push a `main`, salvo los que solo tocan `data/`, para que su propio commit no encadene otra ejecución.
