#!/usr/bin/env bash
set -euo pipefail
set +x

case "${DEPLOY_NAMESPACE:-}" in
  cleo-dev) manifest_dir=devel; expected_cluster=kinasis-preproduction; public_url=https://cleo-dev.kinasisdev.com ;;
  cleo) manifest_dir=prod; expected_cluster=kinasis-production; public_url=https://cleo.kinasisdev.com ;;
  *) echo 'DEPLOY_NAMESPACE debe ser cleo-dev o cleo.' >&2; exit 1 ;;
esac
export EXPECTED_CLUSTER="$expected_cluster"

python3 - <<'PY'
import os, re
for name in ['KUBE_CONFIG', 'MONGODB_URI', 'NUXT_SESSION_PASSWORD', 'GHCR_USERNAME', 'GHCR_READ_TOKEN', 'IMAGE', 'RELEASE_ID']:
    if not os.environ.get(name):
        raise SystemExit(f'Falta configurar {name} en el Environment de GitHub.')
if len(os.environ['NUXT_SESSION_PASSWORD']) < 32:
    raise SystemExit('NUXT_SESSION_PASSWORD requiere al menos 32 caracteres.')
if not re.fullmatch(r'ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}', os.environ['IMAGE']):
    raise SystemExit('IMAGE debe ser una imagen GHCR fijada por digest sha256.')
if not re.fullmatch(r'[A-Za-z0-9._-]+', os.environ['RELEASE_ID']):
    raise SystemExit('RELEASE_ID inválido.')
if not os.environ['MONGODB_URI'].startswith(('mongodb://', 'mongodb+srv://')):
    raise SystemExit('MONGODB_URI no tiene formato MongoDB.')
PY

umask 077
deploy_tmp=$(mktemp -d)
export DEPLOY_TMP="$deploy_tmp"
trap 'rm -rf "$deploy_tmp"' EXIT
export KUBECONFIG="$deploy_tmp/kubeconfig"
python3 - <<'PY'
import base64, json, os, pathlib
root = pathlib.Path(os.environ['DEPLOY_TMP'])
(root / 'kubeconfig').write_text(os.environ['KUBE_CONFIG'])
namespace = os.environ['DEPLOY_NAMESPACE']
auth = base64.b64encode((os.environ['GHCR_USERNAME'] + ':' + os.environ['GHCR_READ_TOKEN']).encode()).decode()
registry = json.dumps({'auths': {'ghcr.io': {'auth': auth}}})
def secret(name, data, kind='Opaque'):
    return {'apiVersion': 'v1', 'kind': 'Secret', 'metadata': {'name': name, 'namespace': namespace},
            'type': kind, 'data': {k: base64.b64encode(v.encode()).decode() for k, v in data.items()}}
secrets = [secret('cleo-runtime', {k: os.environ[k] for k in ['MONGODB_URI', 'NUXT_SESSION_PASSWORD']}),
           secret('ghcr-pull', {'.dockerconfigjson': registry}, 'kubernetes.io/dockerconfigjson')]
(root / 'secrets.json').write_text(json.dumps({'apiVersion': 'v1', 'kind': 'List', 'items': secrets}))
PY

# A kubeconfig for the other environment must never be accepted accidentally.
actual_namespace=$(kubectl config view --minify -o 'jsonpath={.contexts[0].context.namespace}')
actual_cluster=$(kubectl config view --minify -o 'jsonpath={.contexts[0].context.cluster}')
if [[ "$actual_namespace" != "$DEPLOY_NAMESPACE" || "$actual_cluster" != "$EXPECTED_CLUSTER" ]]; then
  echo 'El kubeconfig no corresponde al namespace/clúster esperado. Usa bootstrap-k8s.py.' >&2
  exit 1
fi
kubectl --request-timeout=20s -n "$DEPLOY_NAMESPACE" get deployment cleo-tunnel -o name

if ! kubectl --request-timeout=30s apply --server-side --field-manager=cleo-actions -f "$deploy_tmp/secrets.json" >"$deploy_tmp/secret-output" 2>&1; then
  echo 'No se pudieron actualizar los Secrets. Revisa conectividad y el Role cleo-deployer; no se muestran credenciales.' >&2
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
kubectl kustomize "$deploy_tmp/manifests" > "$deploy_tmp/release.yaml"
kubectl --request-timeout=30s -n "$DEPLOY_NAMESPACE" apply -f "$deploy_tmp/release.yaml"
if ! kubectl -n "$DEPLOY_NAMESPACE" rollout status deployment/cleo --timeout=600s; then
  kubectl -n "$DEPLOY_NAMESPACE" get pods -l app.kubernetes.io/name=cleo
  echo 'El rollout falló; revisa eventos, MongoDB e imagen. No se revierte la base ni los secretos automáticamente.' >&2
  exit 1
fi
kubectl -n "$DEPLOY_NAMESPACE" rollout status deployment/cleo-tunnel --timeout=120s
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
