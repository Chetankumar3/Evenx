#!/bin/bash
REGISTRY="${1:-us-central1-docker.pkg.dev/project-cdd074dc-6291-4d7f-a2a/evenx}"
VERSION="${2:-1.0}"

set -euo pipefail

cd "$(dirname "$0")"
export DOCKER_BUILDKIT=1

build_and_push() {
  local service_name="$1"
  local image_name="$2"
  local dockerfile="$3"
  local context="$4"

  echo "Starting ${service_name} build/push"
  local build_args=()

  DOCKER_BUILDKIT=1 docker build --progress=auto \
    "${build_args[@]}" \
    -t "${REGISTRY}/${image_name}:${VERSION}" \
    -f "${dockerfile}" \
    "${context}" && \
  docker push "${REGISTRY}/${image_name}:${VERSION}" && \
  echo "${service_name} pushed successfully"
}

build_and_push "Main service" "evenx-main" "microservices/main/Dockerfile" "microservices/main" &
pid_main=$!

build_and_push "Restorer service" "evenx-restorer" "microservices/restorer/Dockerfile" "microservices/restorer" &
pid_res=$!

build_and_push "Statesync service" "evenx-statesync" "microservices/statesync/Dockerfile" "microservices/statesync" &
pid_statesync=$!

status=0
for pid in "$pid_main" "$pid_res" "$pid_statesync"; do
  if ! wait "$pid"; then
    status=1
  fi
done

if [ "$status" -ne 0 ]; then
  echo "One or more image builds/pushes failed" >&2
  exit 1
fi

sudo systemctl stop docker.service docker.socket