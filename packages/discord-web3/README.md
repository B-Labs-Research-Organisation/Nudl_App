# Discord Web3 Bot

This document provides instructions on how to set up and start the Discord Web3 bot.

## Prerequisites

- Ensure you have [Node.js](https://nodejs.org/) installed (version 18 or higher).
- Ensure you have [pnpm](https://pnpm.io/) installed as the package manager.

## Setup Instructions

1. **Clone the Repository**

   Clone the repository to your local machine using the following command:

   ```bash
   git clone <repository-url>
   ```

2. **Navigate to the Project Directory**

   Change into the project directory:

   ```bash
   cd packages/discord-web3
   ```

3. **Install Dependencies**

   Use pnpm to install the necessary dependencies:

   ```bash
   pnpm install
   ```

4. **Create a Discord Bot**

   To create a Discord bot, follow these steps:

   - Go to the [Discord Developer Portal](https://discord.com/developers/applications).
   - Click on "New Application" and give your application a name.
   - Navigate to the "Bot" tab on the left and click "Add Bot".
   - Under the "Token" section, click "Copy" to copy your bot token. You will need this token to configure your environment variables.

5. **Configure Redis for Persistent Data Storage**

   To ensure that your Redis instance stores data to the hard drive and can be restarted without losing data, follow these steps:

   - **Install Redis**: Download and install Redis from the [official Redis website](https://redis.io/download).

   - **Configure Redis for Persistence**: Edit the Redis configuration file, typically named `redis.conf`. Locate the following settings and ensure they are configured as shown:

     - **Snapshotting**: Enable snapshotting by setting the `save` directive. This will create a dump of the dataset at specified intervals. For example:

       ```plaintext
       save 900 1   # Save the DB if at least 1 key changed in 900 seconds (15 minutes)
       save 300 10  # Save the DB if at least 10 keys changed in 300 seconds (5 minutes)
       save 60 10000 # Save the DB if at least 10000 keys changed in 60 seconds
       ```

     - **Append-only File (AOF)**: Enable AOF to log every write operation. This provides a more durable persistence mechanism:

       ```plaintext
       appendonly yes
       ```

     - **AOF Rewrite**: Configure AOF rewrite settings to manage file size and performance:

       ```plaintext
       auto-aof-rewrite-percentage 100
       auto-aof-rewrite-min-size 64mb
       ```

   - **Start Redis Server**: Launch the Redis server with the configured settings by running:

     ```bash
     redis-server /path/to/redis.conf
     ```

   - **Configure Environment Variables**: Ensure that the Redis server is running on the default port `6379`. If you are using a different port or a cloud-based Redis service, update the `REDIS_URL` in your `.env` file accordingly. The `REDIS_URL` should be in the format `redis://<host>:<port>`.

   By configuring Redis with these persistence settings, your data will be stored on the hard drive, allowing you to restart the Redis instance without data loss.

6. **Configure Environment Variables**

   Create a `.env` file in the `packages/discord-web3` directory and add the following environment variables:

   ```plaintext
   DISCORD_TOKEN=your_discord_bot_token
   CLIENT_ID=your_discord_client_id
   REDIS_URL=redis://localhost:6379  // optional redis persistence. if not set, data is lost on restart.
   ```

   Replace `your_discord_bot_token` and `your_discord_client_id` with your actual Discord bot token and client ID.

7. **Start the Bot**

   Run the following command to start the bot:

   ```bash
   pnpm run start
   ```

   The bot should now be running and connected to your Discord server.

## Discord Commands

- **/ping**: This command makes the bot respond with "Pong!".
- **/openmodal**: Opens a modal to capture user input.
- **/set_address**: Sets the address for a specific chainId. Requires two options:
  - `chainid`: The chain ID (required).
  - `address`: The address to set (required, with autocomplete enabled).
- **/remove_address**: Removes the address for a specific chainId. Requires two options:
  - `chainid`: The chain ID (required).
  - `address`: The address to remove (required, with autocomplete enabled).
- **/list_addresses**: Lists all addresses for the user.
- **/admin_list_missing_addresses**: Lists all missing addresses for a given chainId (Admin only). Optionally takes:
  - `chainid`: The chain ID (optional).
- **/admin_list_addresses**: Lists all addresses for a given chainId (Admin only). Options include:
  - `chainid`: The chain ID (optional).
  - `user`: The user to search for addresses (optional).
  - `role`: The role to filter addresses by (optional).
  - `export`: Whether to export the addresses to a file (optional).

Ensure your bot has the necessary permissions to interact with your Discord server.

## Contributing

For any issues or contributions, please refer to the repository's issue tracker or contact the maintainers.
