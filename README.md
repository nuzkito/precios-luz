# Precios de la electricidad en España

El precio de la luz en España cambia cada hora. La REE —Red Eléctrica de España— publica los datos cada día a las 21:00. Este proyecto descarga esos datos, los guarda en el histórico y publica una web para consultar los precios.

Todos los días a las 21:00 se descargan los precios del próximo día desde la API de la REE, los guarda en `data/<YYYY>/<MM>/<DD>.json` y publica una web estática que los muestra. En la web se pueden consultar los precios de un día concreto.

**La web publicada está en https://precioluz.nuzkito.es**. El histórico se guarda en [`data/`](data/). La documentación de la API de REE está en https://www.ree.es/es/datos/apidatos.

## Desarrollo

El entorno de desarrollo utiliza Docker con Compose: Node se ejecuta dentro del contenedor que describe el `Dockerfile`.

### Descargar precios y construir la web

Para probar la web en local, descarga los precios de hoy y de mañana (si están disponibles) y construye el sitio en `_site`:

```sh
docker compose run --rm node npm run update
```

Termina diciendo qué días se han guardado y cuántos hay ya en el histórico:

```
Prices for 2026-08-02 saved
Prices for 2026-08-03 saved
Site built (10 days in the history)
```

Antes de las 21:00 los precios de mañana todavía no existen, así que solo se guarda el día de hoy y se avisa de que faltan:

```
Prices for 2026-08-02 saved
Prices for 2026-08-03 are not published yet (The prices of 2026-08-03 have 0 hours)
Site built (9 days in the history)
```

Si falla la descarga del día de hoy se cancela la ejecución.

### Ver la web en el navegador

Levanta el servidor:

```sh
docker compose up --detach server
```

La web se publica en http://localhost:3000, con la tabla y la gráfica del día que acabas de descargar.

Para apagar el servidor:

```sh
docker compose down
```

### Descargar días pasados

Las dos fechas son el primer y el último día, ambos incluidos; cámbialas por el rango que quieras:

```sh
docker compose run --rm node npm run backfill -- 2025-01-01 2025-12-31
```

También se puede solicitar un solo día:

```sh
docker compose run --rm node npm run backfill -- 2025-01-01
```

El script de backfill omite los días que ya existen, salvo que se le pase `--force`. Si un día falla, se continúa descargando el resto. Los datos se piden en rangos de 28 días por limitaciones de la API. Al acabar resume cuántos días ha bajado, cuántos ya estaban y cuántos han fallado, y se indica un error si falló alguno.

Para ver los días nuevos en el navegador hay que lanzar `npm run update`.

### Ejecutar tests

```sh
docker compose run --rm node npm test
```

### Reconstruir la imagen Docker

Si cambia el `Dockerfile`:

```sh
docker compose build
```

## Tests

Usan el sistema de testing nativo de Node, sin dependencias. Se mockean las peticiones a la API de la REE y los accesos al disco se hacen en un directorio temporal.

## Formato de los datos

Cada día es un archivo `data/<YYYY>/<MM>/<DD>.json`: el histórico se guarda en carpetas por año y por mes. Ejemplo: [`data/2026/07/29.json`](data/2026/07/29.json):

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

Los precios están en €/kWh.


## Despliegue

`.github/workflows/deploy.yml` descarga los precios, guarda los archivos nuevos en el repositorio y publica `_site` en GitHub Pages. Se ejecuta a las 21:00 de Europe/Madrid, cuando la REE ya ha publicado los precios del día siguiente, y también en cada push a `main`, salvo los que solo tocan `data/`.
