# Precios de la electricidad en España

Este repositorio descarga diariamente los precios de la electricidad en España desde la API de la REE https://www.ree.es/es/datos/apidatos, genera un HTML con esos datos, y los publica.

Los datos se actualizan todos los días a las 00:00.

## Desarrollo

Las dependencias se gestionan con el contenedor de Node 24 definido en `docker-compose.yml`:

```sh
docker compose run --rm node npm install
docker compose run --rm node npm install <paquete>
docker compose run --rm node npm run update
```

Si cambia el `Dockerfile`, reconstruye la imagen con `docker compose build`.
