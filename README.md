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
- **Testing**: 
  - Run unit tests: `npm run test`
  - Run e2e tests: `npm run test:e2e`
  - View coverage: `npm run test:coverage`

All contributions should include appropriate test coverage. Check our testing guide for more details.

## Operating the Codebase as a System

Deploy and manage your own OpenMeet instance with these key features:

- **Quick Setup**: Simple deployment using Docker or cloud services
- **Community Management**: Create and manage multiple communities with custom settings
- **Event Tools**: Organize virtual and in-person events effortlessly
- **Privacy First**: Built-in privacy controls and data sovereignty
- **Analytics**: Track engagement and community health metrics

For detailed setup instructions, see our [Deployment Guide](#deployment-guide).

### Deployment Guide

API is deployed via kubernetes deployment using kustomize from repo [openmeet-infrastructure](https://github.com/OpenMeet-Team/openmeet-infrastructure/tree/main/k8s/api).

API is deployed behind an ALB and ingress.


