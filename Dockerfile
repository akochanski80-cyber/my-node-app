FROM node:22

WORKDIR /usr/src/app

COPY package*.json ./

RUN apt-get update && apt-get install -y libsecret-1-0
RUN npm install

COPY . .

CMD ["node", "app.js"]
