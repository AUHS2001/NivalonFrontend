FROM node:20

ENV NODE_ENV=development
WORKDIR /app

# Copy manifest files first (improves layer caching when possible)
COPY package.json preinstall.js ./
# commit.txt file is required
RUN touch commit.txt

# Install with npm using legacy peer deps (as requested)
RUN npm i --legacy-peer-deps

# Ensure Yarn via Corepack and install workspace deps
RUN yarn install

# Copy the rest of the app
COPY . .

# Common dev port (adjust if your dev script uses another)
EXPOSE 3000

# Run the development server
CMD ["yarn", "run", "dev"]

