Welcome to the OpenMeet API repository! Whether you’re a developer looking to build new features or someone interested in running OpenMeet as a platform, this document will help you get up to speed quickly.

# About OpenMeet

OpenMeet is an open-source platform designed to help people organize and connect, whether it's for grassroots movements, community building, or event management. The platform 
focuses on privacy, decentralization, and empowering users to take control of their data and interactions.

## What You Can Do with OpenMeet

We anticipate two main use cases:
## Developing Features and Navigating the Code

OpenMeet is built with extensibility in mind, making it easy for developers to contribute and customize:

- **Feature Development**: Add new features through our modular architecture
- **Customization**: Adapt the platform for different community types and needs
- **API Integration**: Connect with external tools via our comprehensive API

#### Running api service locally

### Local Development

```bash
# Copy example config
cp env-example-relational .env

# Start dependencies
docker-compose -f docker-compose-dev.yml up --build

# Load environment variables
export $( grep -v "#" ".env" | xargs)

# Start development server
npm run start:dev
```

### Testing

#### Env setup

```bash
# Copy example config
cp env-example-relational .env
```

Then set the environment variables in the .env file.

##### Tenants Configuration

Additionally, you may place a file  at `./config/tenants.json` to configure tenants, or use the `TENANTS_B64` environment variable to provide a base64 encoded json string of the same file contents.  Order of precedence is `TENANTS_B64` > `./config/tenants.json`.

`./config/tenants.json` example:
```json
[
  {
    "id": "",
    "name": "Public"
  },
  {
    "id": "1",
    "name": "OpenMeet"
  },
  {
    "id": "2",
    "name": "Testing"
  }
]
```

`TENANTS_B64` example:
```bash
export TENANTS_B64=WwogIHsKICAgICJpZCI6ICIiLAogICAgIm5hbWUiOiAiUHVibGljIgogIH0sCiAgewogICAgImlkIjogIjEiLAogICAgIm5hbWUiOiAiT3Blbk1lZXQiCiAgfSwKICB7CiAgICAiaWQiOiAidGVzdGluZyIsCiAgICAibmFtZSI6ICJUZXN0aW5nIgogIH0KXQ==
```

#### Run unit tests

``` bash
npm install
npm run test
```

#### Run e2e tests

This requires a running database and a local api service, and create a file `.env` which should should be set similar to the example in env-relational-example.

``` bash
npm install
# setup database for testing
docker-compose -f docker-compose-dev.yml up --build
# start api service
npm run start:dev &

# prepare environment variables your environment, see env-relational-example
npm run test:e2e
```

#### View coverage

All contributions should include appropriate test coverage.

## Operating the Codebase as a System

Deploy and manage your own OpenMeet instance.

### Deployment Guide

#### In Production

API is deployed via kubernetes deployment using kustomize from repo [openmeet-infrastructure](https://github.com/OpenMeet-Team/openmeet-infrastructure/tree/main/k8s/api).

API is deployed behind an ALB and ingress.

