FROM node:22

WORKDIR /usr/src/app

COPY package*.json ./

# Install libsecret so keytar can build
RUN apt-get update && apt-get install -y libsecret-1-0 build-essential

RUN npm install

COPY . .

CMD ["node", "server.js"]
