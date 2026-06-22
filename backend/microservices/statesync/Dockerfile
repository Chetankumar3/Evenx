# Self-contained -- this folder is the whole build context, no shared_folder.

FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /statesync ./cmd/statesync

FROM alpine:3.20
COPY --from=builder /statesync /statesync
EXPOSE 8080
ENTRYPOINT ["/statesync"]
