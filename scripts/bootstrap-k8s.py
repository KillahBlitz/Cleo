#!/usr/bin/env python3
"""Run manually on kinasis-eye with its existing administrator kubeconfig."""
import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser(description='Preparar namespace y acceso limitado de GitHub Actions.')
parser.add_argument('namespace', choices=['cleo-dev', 'cleo'])
args = parser.parse_args()
environment = 'preproduction' if args.namespace == 'cleo-dev' else 'production'
context = 'kinasis-' + environment
config = Path.home() / '.kube/kinasis' / (environment + '.yaml')
binary = Path.home() / '.local/bin/kubectl'
if not config.is_file() or not binary.is_file():
    raise SystemExit('Falta el acceso de kinasis-eye. Completa 04-kubectl y 05-cluster-access del proyecto de infraestructura.')
command = [str(binary), '--kubeconfig', str(config), '--context', context, '--request-timeout=20s']
root = Path(__file__).resolve().parent.parent
manifest_dir = root / 'k8s' / ('devel' if args.namespace == 'cleo-dev' else 'prod')

def read_json(*arguments):
    # Capture output: kubeconfigs and tokens must never be printed.
    result = subprocess.run(command + list(arguments) + ['-o', 'json'], capture_output=True, text=True)
    if result.returncode:
        raise SystemExit('No se pudo consultar Kubernetes. Revisa el contexto y los permisos administrativos.')
    return json.loads(result.stdout)

cluster = read_json('config', 'view', '--minify', '--flatten', '--raw')['clusters'][0]['cluster']
expected_ip = '192.168.50.123' if args.namespace == 'cleo-dev' else '192.168.50.128'
if cluster['server'] != f'https://{expected_ip}:6443' or not cluster.get('certificate-authority-data'):
    raise SystemExit('El kubeconfig no coincide con el clúster LAN documentado para este entorno.')
subprocess.run(command + ['apply', '-f', str(manifest_dir / 'namespace.yaml')], check=True)
for filename in ['deployer-rbac.yaml', 'deployer-token.yaml']:
    subprocess.run(command + ['-n', args.namespace, 'apply', '-f', str(manifest_dir / filename)], check=True)
for _ in range(30):
    secret = read_json('-n', args.namespace, 'get', 'secret', 'cleo-deployer-token')
    if secret.get('data', {}).get('token'):
        break
    time.sleep(1)
else:
    raise SystemExit('Kubernetes todavía no emitió el token. Reejecuta este comando.')
token = base64.b64decode(secret['data']['token']).decode()
name = args.namespace + '-deployer'
config_data = {
    'apiVersion': 'v1', 'kind': 'Config',
    'clusters': [{'name': context, 'cluster': {'server': cluster['server'], 'certificate-authority-data': cluster['certificate-authority-data']}}],
    'users': [{'name': name, 'user': {'token': token}}],
    'contexts': [{'name': name, 'context': {'cluster': context, 'user': name, 'namespace': args.namespace}}],
    'current-context': name,
}
directory = Path.home() / '.config/cleo-deploy'
directory.mkdir(parents=True, exist_ok=True, mode=0o700)
directory.chmod(0o700)
output = directory / (args.namespace + '.kubeconfig')
fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.fchmod(fd, 0o600)
with os.fdopen(fd, 'w') as file:
    json.dump(config_data, file)
print(f'Acceso limitado guardado en {output}. Cárgalo en el secreto KUBE_CONFIG del Environment {args.namespace}.')
print('Es un token persistente de ServiceAccount: rótalo periódicamente; no contiene el certificado de administrador.')
