# Use the official Node.js image
FROM node:14

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the application code
COPY . .

# Expose the application ports
EXPOSE 3001
EXPOSE 3002

# Command to run the application
CMD ["node", "index.js"]
