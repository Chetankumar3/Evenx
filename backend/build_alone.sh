docker build -t us-central1-docker.pkg.dev/project-cdd074dc-6291-4d7f-a2a/evenx/evenx-main:1.0 -f microservices/main/Dockerfile microservices/main
docker push us-central1-docker.pkg.dev/project-cdd074dc-6291-4d7f-a2a/evenx/evenx-main:1.0

docker build -t us-central1-docker.pkg.dev/project-cdd074dc-6291-4d7f-a2a/evenx/evenx-restorer:1.0 -f microservices/restorer/Dockerfile microservices/restorer
docker push us-central1-docker.pkg.dev/project-cdd074dc-6291-4d7f-a2a/evenx/evenx-restorer:1.0

docker build -t us-central1-docker.pkg.dev/project-cdd074dc-6291-4d7f-a2a/evenx/evenx-statesync:1.0 -f microservices/statesync/Dockerfile microservices/statesync
docker push us-central1-docker.pkg.dev/project-cdd074dc-6291-4d7f-a2a/evenx/evenx-statesync:1.0