FROM node:22

ENV NODE_ENV=development
WORKDIR /app

# Copy the app
COPY . .

RUN touch commit.txt

# Install dependencies and clean cache to reduce image size
RUN yarn install && yarn cache clean

# Build the application
RUN yarn run build

# Common dev port (adjust if your dev script uses another)
EXPOSE 3000

# Run the development server
CMD ["yarn", "run", "dev"]

