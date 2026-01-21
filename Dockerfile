FROM node:20

ENV NODE_ENV=development
WORKDIR /app

# Copy manifest files first (improves layer caching when possible)
COPY package.json preinstall.js ./
# commit.txt file is required
RUN touch commit.txt

# Install dependencies
RUN yarn install

# Copy the rest of the app
COPY . .

# Build the application
RUN yarn run build

# Common dev port (adjust if your dev script uses another)
EXPOSE 3000

# Run the development server
CMD ["yarn", "run", "dev"]

