# NivalonFrontend

## Requirements

Node version 20+
Yarn version 1.22

## Setup

Create a file in the repo root named: commit.txt

## Install dependencies
```
npm i --legacy-peer deps
```

```
yarn install
```

## Running

```
yarn run dev
```

## Docker

You can build and run a docker container from this project using:
```
docker build -t nivalon-frontend:dev .
```

After building, you can run it using:
```
docker run -p 3000:3000 -d nivalon-frontend:dev
```

## Docker compose

This requires you to have built the nivalon-backend and nivalon-frontend docker images upfront.
