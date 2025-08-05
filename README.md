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

# Start dependencies with Docker Compose V1
docker-compose -f docker-compose-dev.yml up --build

# Start dependencies with Docker Compose V2
docker compose -f docker-compose-dev.yml up --build

# Load environment variables
export $( grep -v "#" ".env" | xargs)

# Install Node.js dependencies
npm install

# prep the database
npm run migration:run:tenants
npm run seed:run:prod

# Start development server
npm run start:dev
```

### Testing

In the env file you should set the `TEST_TENANT_ID` to the id of the tenant you want to use for testing, and that tenant must exist in the `TENANTS_B64` variable described below.

#### Oauth

For testing bluesky locally with oauth logins, we need to run ngrok to expose our local server to the internet.

    ngrok http 3000

This will expose your local server to the internet and provide a public url for the oauth callback.

You'll need to update the `BACKEND_DOMAIN` in the `.env` file to the ngrok url.

Also update  CSP in the `quasar.config.js` file to allow the ngrok url.

Finally, update the `config.json` for the frontend to set frontendDomain to the localhost url for the platform.


#### Env setup

###### ngrok for Oauth and other testing

```bash
ngrok http 3000
```

Copy the new endpoint url into you configuration:
- .env
- quasar.config.js
- config.json



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
    "name": "OpenMeet",
    "companyDomain": "https://openmeet.net",
    "frontendDomain": "https://dev.openmeet.net",
    "logoUrl": "https://dev.openmeet.net/openmeet-logo.png",
    "mailDefaultEmail": "no-reply@openmeet.net",
    "mailDefaultName": "OpenMeet",
    "googleClientId": "",
    "googleClientSecret": "",
    "githubClientId": "",
    "githubClientSecret": ""
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

#### Admin user

The admin user is created with the following environment variables at database seeding.

- ADMIN_EMAIL
- ADMIN_PASSWORD


