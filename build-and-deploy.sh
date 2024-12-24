#!/bin/bash

set -xe
AWS_REGION=${AWS_REGION:-us-east-1}

ECR_REPOSITORY="openmeet-ecr/openmeet-api"
DEPLOYMENT_NAMESPACE="openmeet-api-dev"
GIT_REVISION=$(git rev-parse HEAD)
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
IMAGE_TAG=$GIT_REVISION

echo "Logging into AWS ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin "$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$AWS_REGION.amazonaws.com"

ECR_REGISTRY="$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$AWS_REGION.amazonaws.com"

# Build and push Docker image
echo "Building image with tag: $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG"
PACKAGE_JSON_B64=$(cat package.json | base64 -w 0)
docker build --build-arg GIT_REVISION=$GIT_REVISION \
            --build-arg GIT_BRANCH=$GIT_BRANCH \
            --build-arg PACKAGE_JSON_B64=$PACKAGE_JSON_B64 \
            -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .

echo "Pushing images to ECR..."
docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

# Update EKS configuration
echo "Updating kubeconfig..."
aws eks update-kubeconfig --name openmeet-dev --region $AWS_REGION

# Deploy to EKS
echo "Deploying to EKS..."
kubectl set image --namespace $DEPLOYMENT_NAMESPACE deployment/openmeet-api openmeet-api=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
kubectl rollout restart --namespace $DEPLOYMENT_NAMESPACE deployment/openmeet-api
kubectl rollout status --namespace $DEPLOYMENT_NAMESPACE deployment/openmeet-api

echo "Deployment complete!"