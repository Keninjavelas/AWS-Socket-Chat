# Use lightweight Node image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Expose port 80 to the outside world
EXPOSE 80

# Command to run the app
CMD [ "node", "server.js" ]