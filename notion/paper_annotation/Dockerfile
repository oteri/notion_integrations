FROM node:18

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

CMD [ "node", "notion_data_extractor.js" ]