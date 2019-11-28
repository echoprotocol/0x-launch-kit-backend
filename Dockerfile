FROM node:8-alpine
WORKDIR /usr/src/app

COPY package.json yarn.lock ./

RUN apk update && \
    apk upgrade && \
    apk add --no-cache --virtual build-dependencies bash git openssh python make g++ musl-dev \
    gcc python3-dev libusb-dev eudev-dev linux-headers libc-dev
RUN git clone https://github.com/echoprotocol/0x-monorepo.git

COPY . .

RUN cd ./0x-monorepo && yarn install && yarn build && yarn workspaces run link
RUN yarn link 0x.js @0x/assert @0x/connect @0x/json-schemas @0x/order-watcher @0x/tslint-config @0x/types @0x/typescript-typings @0x/utils @0x/web3-wrapper
   
RUN yarn --no-cache
RUN yarn build
EXPOSE 3000

RUN apk del build-dependencies
    # yarn cache clean

CMD [ "./node_modules/.bin/forever", "ts/lib/index.js" ]