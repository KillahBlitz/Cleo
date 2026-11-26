#!/usr/bin/env bash
set -euo pipefail
set +x

case "${DEPLOY_NAMESPACE:-}" in
  cleo-dev) manifest_dir=devel; cluster_environment=preproduction; expected_ip=192.168.50.123; public_url=https://cleo-dev.kinasisdev.com ;;
  cleo) manifest_dir=prod; cluster_environment=production; expected_ip=192.168.50.128; public_url=https://cleo.kinasisdev.com ;;
  *) echo 'DEPLOY_NAMESPACE debe ser cleo-dev o cleo.' >&2; exit 1 ;;
esac

# Reuse the infrastructure access already installed for the runner's Linux user.
export KUBECONFIG="$HOME/.kube/kinasis/$cluster_environment.yaml"
if [[ ! -r "$KUBECONFIG" ]]; then
  echo "El usuario del runner no puede leer $KUBECONFIG. Revisa el acceso existente de kinasis-eye; no necesitas un secret KUBE_CONFIG en GitHub." >&2
  exit 1
fi
kube=(kubectl --kubeconfig "$KUBECONFIG" --context "kinasis-$cluster_environment")

python3 - <<'PY'
import os, re
for name in ['MONGODB_URI', 'NUXT_SESSION_PASSWORD', 'IMAGE', 'RELEASE_ID']:
    if not os.environ.get(name):
        raise SystemExit(f'Falta {name} en el despliegue.')
if len(os.environ['NUXT_SESSION_PASSWORD']) < 32:
    raise SystemExit('NUXT_SESSION_PASSWORD requiere al menos 32 caracteres.')
if not re.fullmatch(r'ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}', os.environ['IMAGE']):
    raise SystemExit('IMAGE debe ser una imagen GHCR fijada por digest sha256.')
if not re.fullmatch(r'[A-Za-z0-9._-]+', os.environ['RELEASE_ID']):
    raise SystemExit('RELEASE_ID inválido.')
if not os.environ['MONGODB_URI'].startswith(('mongodb://', 'mongodb+srv://')):
    raise SystemExit('MONGODB_URI no tiene formato MongoDB.')
PY

# Select the context explicitly; never change the user's current context.
actual_server=$("${kube[@]}" config view --minify -o 'jsonpath={.clusters[0].cluster.server}')
if [[ "$actual_server" != "https://$expected_ip:6443" ]]; then
  echo 'El acceso local no corresponde al clúster esperado para este entorno.' >&2
  exit 1
fi
if ! "${kube[@]}" --request-timeout=20s -n "$DEPLOY_NAMESPACE" get secret cleo-tunnel -o name >/dev/null 2>&1; then
  echo "No se pudo leer el Secret cleo-tunnel en $DEPLOY_NAMESPACE. Configura el token de Cloudflare una vez según docs/DEPLOYMENT.md y comprueba el acceso al clúster." >&2
  exit 1
fi

umask 077
deploy_tmp=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/cleo-deploy.XXXXXX")
export DEPLOY_TMP="$deploy_tmp"
trap 'rm -rf "$deploy_tmp"' EXIT
python3 - <<'PY'
import base64, json, os, pathlib
root = pathlib.Path(os.environ['DEPLOY_TMP'])
namespace = os.environ['DEPLOY_NAMESPACE']
secret = {'apiVersion': 'v1', 'kind': 'Secret', 'metadata': {'name': 'cleo-runtime', 'namespace': namespace},
          'type': 'Opaque', 'data': {k: base64.b64encode(os.environ[k].encode()).decode()
                                   for k in ['MONGODB_URI', 'NUXT_SESSION_PASSWORD']}}
(root / 'secrets.json').write_text(json.dumps(secret))
PY

"${kube[@]}" --request-timeout=30s apply -f "k8s/$manifest_dir/namespace.yaml"
if ! "${kube[@]}" --request-timeout=30s -n "$DEPLOY_NAMESPACE" apply --server-side --field-manager=cleo-actions -f "$deploy_tmp/secrets.json" >"$deploy_tmp/secret-output" 2>&1; then
  echo 'No se pudo actualizar cleo-runtime. Revisa conectividad y permisos del acceso local de kinasis-eye; no se muestran credenciales.' >&2
  exit 1
fi

# Copy only the selected environment; each folder is self-contained.
cp -R "k8s/$manifest_dir" "$deploy_tmp/manifests"
python3 - <<'PY'
import json, os, pathlib
image, digest = os.environ['IMAGE'].split('@')
path = pathlib.Path(os.environ['DEPLOY_TMP']) / 'manifests/kustomization.yaml'
with path.open('a') as f:
    f.write('\nimages:\n  - name: cleo\n    newName: ' + image + '\n    digest: ' + digest + '\n')
    # Also rolls pods on a retry/secret rotation, even if the image digest is unchanged.
    patch = [{'op': 'add', 'path': '/spec/template/metadata/annotations', 'value': {'kinasis.dev/release': os.environ['RELEASE_ID']}}]
    f.write('patches:\n  - target:\n      kind: Deployment\n      name: cleo\n    patch: |\n      ' + json.dumps(patch) + '\n')
PY
"${kube[@]}" kustomize "$deploy_tmp/manifests" > "$deploy_tmp/release.yaml"
"${kube[@]}" --request-timeout=30s -n "$DEPLOY_NAMESPACE" apply -f "$deploy_tmp/release.yaml"
if ! "${kube[@]}" -n "$DEPLOY_NAMESPACE" rollout status deployment/cleo --timeout=600s; then
  "${kube[@]}" -n "$DEPLOY_NAMESPACE" get pods -l app.kubernetes.io/name=cleo
  echo 'El rollout falló; revisa eventos, MongoDB e imagen. No se revierte la base ni los secretos automáticamente.' >&2
  exit 1
fi
"${kube[@]}" -n "$DEPLOY_NAMESPACE" rollout status deployment/cleo-tunnel --timeout=120s
# Check the actual public route and TLS, not just the pod or a Cloudflare login page.
curl --fail --silent --show-error --retry 8 --retry-all-errors --retry-delay 5 \
  --connect-timeout 10 --max-time 20 "$public_url/api/health/ready" > "$deploy_tmp/health.json"
python3 - <<'PY'
import json, os, pathlib
result = json.loads((pathlib.Path(os.environ['DEPLOY_TMP']) / 'health.json').read_text())
if result != {'status': 'ok'}:
    raise SystemExit('El dominio no devuelve la respuesta de salud de Cleo.')
print('Despliegue verificado por HTTPS y MongoDB.')
PY
