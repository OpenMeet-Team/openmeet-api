# ---- Base Node ----
FROM node:18.16.1-alpine3.17 AS base
# Set working directory
WORKDIR /usr/src/app
# Copy project file
COPY package*.json ./

# Copy ts config
COPY tsconfig.json ./


# ---- Dependencies ----
FROM base AS dependencies
# Install production dependencies 
RUN npm ci
RUN npm install -g ts-node


# ---- Copy Files/Build ----
FROM dependencies AS build 
# Copy app files
COPY . . 

# Build app
RUN npm run build 

# # Remove devDependencies
RUN npm prune --production

# ---- Release ----
FROM base AS release 
# Copy production dependencies
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
# Copy build files from build stage
COPY --from=build /usr/src/app/dist ./dist

# Expose port
EXPOSE 3000

CMD npm run migration:run:prod && npm run seed:run:prod && npm run start:prod
# CMD  npm run start:prod