FROM node:24-alpine

RUN apk add --no-cache bash
RUN npm i -g @nestjs/cli typescript ts-node

COPY package*.json /tmp/app/
# Vendored @atmo-dev/contrail* tarballs referenced by file: deps; required for
# npm install. Drops out when upstream publishes (PR #44 follow-up).
COPY vendor/ /tmp/app/vendor/
RUN cd /tmp/app && npm install

COPY . /usr/src/app

COPY ./wait-for-it.sh /opt/wait-for-it.sh
RUN chmod +x /opt/wait-for-it.sh
COPY ./startup.relational.test.sh /opt/startup.relational.test.sh
RUN chmod +x /opt/startup.relational.test.sh
RUN sed -i 's/\r//g' /opt/wait-for-it.sh
RUN sed -i 's/\r//g' /opt/startup.relational.test.sh

WORKDIR /usr/src/app

RUN echo "" > .env

CMD ["/opt/startup.relational.test.sh"]
