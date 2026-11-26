# Desplegar Cleo con GitHub Actions y K3s

## Resultado y estado

| Entorno | Rama | GitHub Environment / namespace | Clúster documentado | Dominio |
| --- | --- | --- | --- | --- |
| Preproducción | `devel` | `cleo-dev` | `kinasis-preproduction`, `192.168.50.123` | `https://cleo-dev.kinasisdev.com` |
| Producción | `main` | `cleo` | `kinasis-production`, `192.168.50.128` | `https://cleo.kinasisdev.com` |

La rama local `devel` está creada. Este paquete prepara el despliegue; todavía debes conectar el repositorio, registrar el ejecutor y configurar los secretos y túneles. Las direcciones y los contextos proceden de los paquetes anteriores de infraestructura; deben verificarse en los servidores antes de aplicar.

Todos los manifiestos se organizan en dos carpetas independientes:

```text
k8s/
├── devel/   → preproducción, namespace cleo-dev
└── prod/    → producción, namespace cleo
```

Cada carpeta contiene `deployment.yaml`, `service.yaml`, `network-policy.yaml`, `kustomization.yaml`, `namespace.yaml`, `deployer-rbac.yaml`, `deployer-token.yaml` y `cloudflared.yaml`. Puedes modificar un entorno directamente en su carpeta. Los archivos tienen su namespace explícito y no dependen de archivos del otro entorno.

Actions selecciona `k8s/devel` para la rama `devel` y `k8s/prod` para `main`. El `kustomization.yaml` de cada carpeta incluye únicamente la aplicación, su configuración y su política de red. El namespace, los permisos y el túnel se preparan con los pasos administrativos de esta guía; no se aplica la carpeta completa con `kubectl apply -f`.

Los K3s anteriores desactivan Traefik y ServiceLB. Aquí usamos **Cloudflare Tunnel → Service `cleo:3000` → pod Nuxt → MongoDB**, todo administrado por Kubernetes. No hace falta instalar un controlador Ingress, cert-manager ni abrir puertos del router. Cloudflare entrega el certificado HTTPS público; el salto desde cloudflared hasta Cleo usa HTTP dentro del clúster. Los túneles de Cleo son independientes del túnel y de Cloudflare Access de `management.kinasisdev.com`.

Las pruebas y la construcción se ejecutan en GitHub. Solo el despliegue utiliza un runner —un servicio que recibe trabajos de GitHub— en `kinasis-eye`, porque las APIs de Kubernetes están en la LAN privada. No necesitas Docker en eye ni en los nodos K3s.

## 1. Crear el repositorio y preparar las herramientas

En GitHub crea un repositorio **privado**, por ejemplo `Cleo`, sin README inicial. Sustituye `TU_ORGANIZACION/Cleo` por su nombre real. En tu Mac:

```sh
cd /Users/jmonroy/Documents/MyProjects/Cleo
gh auth login
git remote add origin https://github.com/TU_ORGANIZACION/Cleo.git
```

Si ya existe `origin`, consulta `git remote -v` y conserva el correcto. Todavía no hagas push: completa primero la configuración siguiente. No agregues `.env`, kubeconfigs ni contraseñas a Git.

En `kinasis-eye`, con el usuario habitual, verifica lo que ya habíamos preparado:

```sh
~/.local/bin/kinasis-kubectl preproduction get nodes
~/.local/bin/kinasis-kubectl production get nodes
~/.local/bin/kinasis-kubectl preproduction -n data-services get pods,svc
~/.local/bin/kinasis-kubectl production -n data-services get pods,svc
```

Ambos nodos y sus MongoDB deben estar listos. El paquete de acceso previo debe haber creado `~/.kube/kinasis/preproduction.yaml` y `production.yaml`. No envíes estos kubeconfigs administrativos a GitHub.

Copia únicamente la configuración a eye. Desde el Mac:

```sh
cd /Users/jmonroy/Documents/MyProjects/Cleo
tar -czf /tmp/cleo-deploy-setup.tar.gz k8s scripts/bootstrap-k8s.py docs/DEPLOYMENT.md
scp /tmp/cleo-deploy-setup.tar.gz kinasis-eye@kinasis-eye:~/
```

En eye:

```sh
mkdir -p ~/cleo-setup
cd ~/cleo-setup
tar -xzf ~/cleo-deploy-setup.tar.gz
python3 scripts/bootstrap-k8s.py cleo-dev
python3 scripts/bootstrap-k8s.py cleo
```

Cada comando selecciona su clúster, crea el namespace, habilita sus etiquetas de acceso a MongoDB y crea un usuario de Kubernetes con permisos limitados a ese namespace. Guarda dos credenciales separadas en `~/.config/cleo-deploy/cleo-dev.kubeconfig` y `cleo.kubeconfig`, con permisos privados. El rol permite gestionar el aplicativo, no administrar el clúster; dentro de su namespace un desplegador sigue siendo una identidad de confianza.

Se usa un token persistente de ServiceAccount para estos K3s privados sin proveedor de identidad. Rótalo periódicamente: elimina únicamente `secret/cleo-deployer-token` en el namespace correspondiente con el administrador, reejecuta bootstrap y reemplaza `KUBE_CONFIG`. Al configurar OIDC en el futuro, sustituye este mecanismo por credenciales de corta duración.

## 2. Separar MongoDB de pruebas y producción

Ambos clústeres tienen su propio MongoDB. Por eso ambos pueden usar `cleo_db` y el mismo DNS interno sin compartir datos:

```text
mongodb.data-services.svc.cluster.local:27017
```

**La conexión local actual de Cleo usa el administrador de infraestructura. No la copies directamente a GitHub.** Crea un usuario exclusivo `cleo_app` con `readWrite` sobre `cleo_db` en cada MongoDB, con contraseñas distintas. Se conservan los datos existentes de preproducción; no se copian automáticamente a producción.

En eye, abre la consola de MongoDB de preproducción:

```sh
~/.local/bin/kinasis-kubectl preproduction -n data-services exec -it mongodb-0 -c mongodb -- mongosh --norc --quiet
```

Dentro de `mongosh`, pega este bloque. Lee la credencial administrativa ya montada sin mostrarla y solicita de forma oculta una contraseña **nueva para el usuario de Cleo**. Guárdala en tu gestor de contraseñas:

```js
const fs = require('fs');
const adminDb = db.getSiblingDB('admin');
adminDb.auth(
  fs.readFileSync('/run/secrets/mongodb/username', 'utf8').trim(),
  fs.readFileSync('/run/secrets/mongodb/password', 'utf8').trim()
);
const cleoDb = db.getSiblingDB('cleo_db');
if (cleoDb.getUser('cleo_app')) {
  print('cleo_app ya existe; se conservó su contraseña.');
} else {
  cleoDb.createUser({ user: 'cleo_app', pwd: passwordPrompt(), roles: [{ role: 'readWrite', db: 'cleo_db' }] });
}
```

Sal con `exit`. Repite en `production`, usando otra contraseña. No borres usuarios, bases ni volúmenes para repetir la preparación.

La URI para el secreto de cada Environment es:

```text
mongodb://cleo_app:CONTRASENA_CODIFICADA@mongodb.data-services.svc.cluster.local:27017/cleo_db?authSource=cleo_db
```

Usa codificación URL para caracteres especiales en usuario/contraseña, o una contraseña aleatoria hexadecimal suficientemente larga. `authSource=cleo_db` corresponde al lugar donde creaste **el usuario de conexión MongoDB**; la colección `cleo_db.admin` sigue guardando los administradores que entran a la aplicación.

Los manifests incluyen las dos etiquetas exigidas por la NetworkPolicy existente de MongoDB: namespace `kinasis.dev/mongodb-access=true` y pod `kinasis.dev/mongodb-client=true`. No abras MongoDB a Internet.

## 3. Crear los dos túneles y los dominios

En Cloudflare One / Zero Trust → Networks / Networking → Tunnels, crea dos túneles de tipo Cloudflared:

| Túnel | Public hostname | Tipo y servicio de destino |
| --- | --- | --- |
| `cleo-dev` | `cleo-dev.kinasisdev.com` | HTTP, `cleo.cleo-dev.svc.cluster.local:3000` |
| `cleo` | `cleo.kinasisdev.com` | HTTP, `cleo.cleo.svc.cluster.local:3000` |

Cloudflare crea el registro DNS de cada hostname al guardar la ruta. Si ya existe un registro con ese nombre, resuelve el conflicto de ese hostname antes de continuar. No apuntes registros A a las IP privadas `192.168.50.*`.

En los ajustes HTTP de cada ruta fija **HTTP Host Header** al hostname correspondiente (`cleo-dev.kinasisdev.com` o `cleo.kinasisdev.com`). Activa **Always Use HTTPS** en el dominio si esa es ya la política del dominio, o crea una regla de redirección HTTP→HTTPS limitada a estos dos hostnames. Comprueba que Universal SSL está activo. No uses reglas de caché de tipo Cache Everything para HTML o `/api/*`; esas respuestas incluyen sesiones y datos que cambian.

Copia el token de cada túnel. No ejecutes el comando de instalación mostrado por Cloudflare: el conector se ejecutará en Kubernetes. En eye, como usuario habitual, guarda el token en una entrada oculta. Para preproducción:

```bash
umask 077
token_file=$(mktemp)
read -rsp 'Token del túnel cleo-dev: ' tunnel_token; printf '\n'
printf '%s' "$tunnel_token" > "$token_file"
unset tunnel_token
~/.local/bin/kinasis-kubectl preproduction -n cleo-dev create secret generic cleo-tunnel \
  --from-file=token="$token_file" --dry-run=client -o yaml \
  | ~/.local/bin/kinasis-kubectl preproduction -n cleo-dev apply --server-side --field-manager=cleo-bootstrap -f -
rm -f "$token_file"
~/.local/bin/kinasis-kubectl preproduction -n cleo-dev apply -f ~/cleo-setup/k8s/devel/cloudflared.yaml
~/.local/bin/kinasis-kubectl preproduction -n cleo-dev rollout status deployment/cleo-tunnel --timeout=180s
```

Repite el bloque para producción sustituyendo `preproduction` por `production`, `cleo-dev` por `cleo`, la carpeta `k8s/devel` por `k8s/prod` y pegando **su otro token**. El nombre Kubernetes `cleo-tunnel` se conserva en ambos namespaces. En futuras rotaciones del token, después de actualizar el Secret, ejecuta `rollout restart deployment/cleo-tunnel` en ese entorno.

Los nodos deben permitir salida DNS y TCP 7844 hacia Cloudflare; el conector usa HTTP/2. No necesita entrada desde Internet. El túnel puede aparecer conectado y aun devolver 502 hasta desplegar Cleo en el paso 7.

La configuración supone que ambos dominios llegan directamente a Cleo. No reutilices la aplicación Access exclusiva de `management`. Si más adelante proteges preproducción con Access, adapta también la comprobación HTTPS de Actions con un service token de Access; de lo contrario fallará al recibir la pantalla de Cloudflare.

## 4. Registrar el ejecutor de despliegues en eye

En GitHub → repositorio → Settings → Actions → Runners → New self-hosted runner, selecciona **Linux / x64**. GitHub mostrará las instrucciones y un token de registro temporal.

En eye crea un usuario exclusivo, sin acceso a los kubeconfigs administrativos ni al Vault:

```sh
sudo adduser --disabled-password --gecos '' cleo-runner
sudo -iu cleo-runner
mkdir -p ~/actions-runner
cd ~/actions-runner
```

Sigue los comandos de descarga y verificación que muestre GitHub. En su comando `./config.sh`, añade `--name kinasis-eye-cleo --labels kinasis-deploy`. Conserva URL y token tal como los entregue GitHub. No ejecutes el runner como root ni agregues el usuario a sudo/docker.

Después de configurarlo, sal al usuario administrador e instala el servicio:

```sh
exit
cd /home/cleo-runner/actions-runner
sudo ./svc.sh install cleo-runner
sudo ./svc.sh start
sudo ./svc.sh status
```

Debe aparecer **Idle** en GitHub y tener las etiquetas `self-hosted`, `linux`, `x64`, `kinasis-deploy`. Asegura `git`, `curl`, `python3` y certificados CA en eye; usa una versión actual del runner compatible con las Actions fijadas. El workflow descarga kubectl. El runner necesita salida HTTPS a GitHub y acceso LAN a ambas APIs K3s, TCP 6443. La configuración previa permite esa entrada desde eye.

Solo el job de despliegue usa este ejecutor. Los pull requests se comprueban en máquinas de GitHub, sin los secretos de los entornos. Protege `main` y `devel` contra cambios no revisados, especialmente en `.github/workflows/` y `scripts/deploy-k8s.sh`.

## 5. Configurar los GitHub Environments y secretos

Settings → Environments: crea **`cleo-dev`** y **`cleo`**. En deployment branches permite únicamente `devel` para `cleo-dev` y `main` para `cleo`. Para producción configura un revisor requerido si tu plan lo permite.

En **cada Environment** crea estos cinco secrets (mismos nombres, valores por entorno):

| Secret | Contenido |
| --- | --- |
| `KUBE_CONFIG` | Contenido completo del kubeconfig limitado del paso 1, sin codificarlo de nuevo en base64. |
| `MONGODB_URI` | URI interna del paso 2, con la contraseña de ese MongoDB. |
| `NUXT_SESSION_PASSWORD` | Cadena aleatoria de al menos 32 caracteres, distinta por entorno. |
| `GHCR_USERNAME` | Usuario GitHub propietario del token que puede leer el paquete. |
| `GHCR_READ_TOKEN` | Personal access token **classic** con `read:packages`, autorizado para el paquete y SSO si aplica. |

La imagen se publica con `GITHUB_TOKEN`, que GitHub genera automáticamente. El token de lectura separado permite a los pods descargar la imagen privada incluso después de terminar el workflow. No uses `GITHUB_TOKEN` como credencial persistente de Kubernetes.

Desde el Mac autenticado con `gh`, situado en el repositorio, puedes cargar los kubeconfigs sin copiarlos al chat:

```sh
scp kinasis-eye@kinasis-eye:~/.config/cleo-deploy/cleo-dev.kubeconfig /tmp/cleo-dev.kubeconfig
scp kinasis-eye@kinasis-eye:~/.config/cleo-deploy/cleo.kubeconfig /tmp/cleo.kubeconfig
chmod 600 /tmp/cleo-dev.kubeconfig /tmp/cleo.kubeconfig
gh secret set KUBE_CONFIG --env cleo-dev < /tmp/cleo-dev.kubeconfig
gh secret set KUBE_CONFIG --env cleo < /tmp/cleo.kubeconfig
rm -f /tmp/cleo-dev.kubeconfig /tmp/cleo.kubeconfig
openssl rand -hex 32 | gh secret set NUXT_SESSION_PASSWORD --env cleo-dev
openssl rand -hex 32 | gh secret set NUXT_SESSION_PASSWORD --env cleo
```

Genera cada secreto de sesión una sola vez; cambiarlo invalida las cookies actuales. Para los demás secrets usa la pantalla de GitHub o `gh secret set NOMBRE --env cleo-dev`, que solicita el valor, y repite para `cleo`. Nunca guardes el contenido en un workflow o comando con contraseña literal.

Después de la primera construcción revisa el paquete en GitHub Packages: debe estar vinculado al repositorio y el usuario del token debe tener permiso de lectura. Si tu organización restringe la creación de paquetes, habilita esa capacidad para este repositorio.

## 6. Inicializar el administrador de la aplicación

Preproducción ya contiene tus datos; comprueba si ya tiene el administrador y categorías. Los scripts existentes son idempotentes y no sustituyen una contraseña ya guardada.

Para producción, inicializa `cleo_db.admin` y las categorías en **su propio MongoDB** antes de entrar a `/login`. Desde el Mac conectado por Tailscale, usa un archivo privado para la carga inicial. El DNS `*.svc.cluster.local` solo funciona dentro del clúster: aquí utiliza la dirección Tailscale de MongoDB de producción y el acceso privado preparado anteriormente, con el usuario `cleo_app` y `authSource=cleo_db`.

En el repositorio, ejecuta este bloque. Solicita de forma oculta la URI y la contraseña del administrador web; genera un hash scrypt compatible y guarda el archivo ignorado por Git:

```sh
python3 - <<'PY'
from pathlib import Path
import getpass, hashlib, json, os, secrets
uri = getpass.getpass('URI Tailscale de MongoDB PRODUCCIÓN (usuario cleo_app): ')
username = input('Usuario administrador de Cleo: ').strip()
password = getpass.getpass('Contraseña del administrador web: ')
if not username or len(password) < 12:
    raise SystemExit('Se requiere usuario y contraseña de al menos 12 caracteres.')
if password != getpass.getpass('Repite la contraseña: '):
    raise SystemExit('Las contraseñas no coinciden.')
salt = secrets.token_hex(16)
hash_value = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()
folder = Path('.deployment'); folder.mkdir(mode=0o700, exist_ok=True)
values = {'MONGODB_URI': uri, 'NUXT_ADMIN_USERNAME': username, 'NUXT_ADMIN_PASSWORD_HASH': salt + ':' + hash_value}
fd = os.open(folder / 'production-seed.env', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as output:
    output.write('\n'.join(k + '=' + json.dumps(v) for k, v in values.items()) + '\n')
print('Archivo privado creado; no se mostró ninguna credencial.')
PY
node --env-file=.deployment/production-seed.env scripts/seed-admin.mjs
node --env-file=.deployment/production-seed.env scripts/seed-types.mjs
```

Si el archivo ya existe, se conserva: reutilízalo o revísalo antes de reemplazarlo. Estos scripts escriben en `cleo_db` del servidor indicado: verifica que la URI sea de **producción**. Guarda las credenciales en tu gestor y elimina `.deployment/production-seed.env` cuando termines. El usuario y hash de carga inicial no van en el contenedor ni en sus secretos de ejecución.

## 7. Subir y desplegar preproducción

En el Mac, los cambios están en `devel`. Revisa también tus cambios previos de iconos antes de agregarlos:

```sh
cd /Users/jmonroy/Documents/MyProjects/Cleo
git status
git diff
# .env y .deployment están ignorados; confirma que no haya otros secretos.
git add .
git diff --cached --stat
git commit -m "Preparar CI/CD de Cleo para K3s"
git push -u origin devel
```

GitHub Actions ejecutará **Cleo CI/CD**:

1. Instala las dependencias del lockfile, valida TypeScript y compila Nuxt.
2. Ejecuta las pruebas de catálogo y despliegue en un MongoDB temporal de GitHub.
3. Construye Linux amd64, publica `ghcr.io/organizacion/repositorio` y prueba que el contenedor arranque sin privilegios y con disco de solo lectura.
4. En eye, aplica secretos y recursos únicamente a `cleo-dev` del clúster de preproducción, usando la imagen por su digest inmutable.
5. Espera el rollout y verifica `https://cleo-dev.kinasisdev.com/api/health/ready` y su respuesta JSON exacta.

El primer push puede necesitar habilitar la creación/lectura del paquete GHCR. Corrige permisos y reejecuta el workflow si aparece `ImagePullBackOff`. No hace falta cambiar el nombre de la imagen en archivos: se deriva del repositorio.

Prueba portada, `/login`, panel, carga de fotos, pujas y compras en preproducción. No ejecutes las pruebas automáticas contra la base real; crean datos en bases temporales y el usuario `cleo_app` solo tiene acceso a `cleo_db`.

## 8. Publicar producción

Cuando preproducción funcione:

```sh
git switch main
git merge --ff-only devel
git push -u origin main
```

En el primer despliegue esto incorpora la preparación a `main`; si las ramas han divergido, revisa y fusiona mediante pull request. Configura `main` como rama predeterminada en GitHub. A partir de entonces trabaja en `devel`, prueba y abre un pull request de `devel` hacia `main` para cada versión.

El push a `main` vuelve a construir y probar el código de esa rama, después despliega en **`cleo` del clúster de producción**, con los secretos de `cleo` y el dominio `cleo.kinasisdev.com`. No promociona automáticamente los datos de pruebas ni reutiliza el digest de preproducción: cada ejecución genera su imagen y despliega por digest. Si hay revisor requerido, aprueba el job de producción en GitHub.

Una vez que el workflow existe en la rama predeterminada, también puedes usar Actions → Cleo CI/CD → Run workflow y elegir `devel` o `main`. Otras ramas solo ejecutan verificaciones, sin publicar/desplegar.

## 9. Verificación, diagnóstico y vuelta a una versión anterior

En eye, para preproducción:

```sh
~/.local/bin/kinasis-kubectl preproduction -n cleo-dev get deploy,pods,svc
~/.local/bin/kinasis-kubectl preproduction -n cleo-dev get events --sort-by=.metadata.creationTimestamp
~/.local/bin/kinasis-kubectl preproduction -n cleo-dev logs deployment/cleo --tail=80
~/.local/bin/kinasis-kubectl preproduction -n cleo-dev logs deployment/cleo-tunnel --tail=80
curl -fsS https://cleo-dev.kinasisdev.com/api/health/ready
```

Para producción cambia `preproduction` por `production`, `cleo-dev` por `cleo` y el dominio. `/api/health/live` verifica el proceso; `/api/health/ready` verifica además el secreto de sesión y acceso de lectura a MongoDB. Una caída de MongoDB quita el pod del tráfico, pero no dispara reinicios por liveness. Los endpoints no revelan credenciales ni mensajes del driver.

| Síntoma | Revisar |
| --- | --- |
| Job esperando runner | Servicio en eye, etiqueta `kinasis-deploy`, conectividad GitHub. |
| Timeout Kubernetes | Runner en eye, kubeconfig del entorno y acceso LAN TCP 6443. |
| Forbidden al aplicar | Haber ejecutado bootstrap con el administrador; no confundir namespaces. |
| ImagePullBackOff | Permisos del paquete, `GHCR_READ_TOKEN`, usuario y caducidad del token. |
| Pod Running pero no Ready / HTTP 503 | URI interna, contraseña, `authSource=cleo_db`, MongoDB y ambas etiquetas de red. |
| Cloudflare 1033 | Conector desconectado: token, salida TCP 7844, pod del túnel. |
| Cloudflare 502 | Servicio de destino, namespace, puerto 3000, NetworkPolicy, pod listo. |
| Login devuelve 403 | Origin HTTPS y `NUXT_APP_ORIGIN` del entorno. |
| Login devuelve 401 | Administrador en `cleo_db.admin`; no es la contraseña de conexión MongoDB. |

Para volver a la revisión anterior del Deployment:

```sh
~/.local/bin/kinasis-kubectl production -n cleo rollout history deployment/cleo
~/.local/bin/kinasis-kubectl production -n cleo rollout undo deployment/cleo
~/.local/bin/kinasis-kubectl production -n cleo rollout status deployment/cleo --timeout=600s
```

Esto recupera la imagen/configuración de la revisión, **no restaura MongoDB ni contraseñas de Secrets**. Si cambiaste credenciales, coordina su restauración por separado. Después corrige o revierte el commit y despliega por Actions para mantener Git y Kubernetes alineados. Conserva en GHCR las imágenes de revisiones que quieras recuperar. Los ConfigMaps llevan hash para permitir rollback; no los borres mientras alguna revisión conservada los use.

El despliegue usa una réplica por entorno porque el límite de login aún está en memoria. Durante una actualización pueden coexistir dos pods; el contador se reinicia al reemplazar procesos. Antes de escalar de forma permanente, comparte ese contador entre réplicas. Los clústeres y MongoDB actuales son de un solo nodo: esto no agrega alta disponibilidad. Las fotos y los datos viven en MongoDB, no en el disco del pod; prepara y prueba respaldos de MongoDB antes de aceptar información real en producción.

## Verificaciones realizadas localmente

El 26 de noviembre de 2026 pasaron `npm run typecheck`, la compilación de producción sin cargar el `.env` privado, todas las pruebas existentes del catálogo y `scripts/check-deployment.mjs`, usando MongoDB 8.0.38 temporal en esta computadora. Después de separar `k8s/devel` y `k8s/prod`, se verificaron actionlint, los 20 recursos Kubernetes, el renderizado equivalente de ambos entornos y las pruebas simuladas del script de despliegue (separación de entornos, digest inmutable y rechazo de una página Access como resultado de salud).

Todavía no se ejecutaron el build de Docker ni el workflow en GitHub, ni se consultaron/modificaron los clústeres reales o Cloudflare. La prueba del contenedor está incluida en Actions y debe pasar antes de desplegar. La disponibilidad final de los dos dominios queda pendiente de completar esta guía.

## Referencias

- [Nuxt: servidor Node y variables de ejecución](https://nuxt.com/docs/4.x/getting-started/deployment).
- [Cloudflare: túneles en Kubernetes](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/deployment-guides/kubernetes/).
- [GitHub: añadir un runner propio](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners).
- [GitHub: autenticación en GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).
- [Kubernetes: cuentas de servicio y credenciales](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/).
- [Kubernetes: probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/).
