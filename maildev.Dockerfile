FROM node:24-alpine

RUN npm i -g maildev@2.0.5

CMD maildev
