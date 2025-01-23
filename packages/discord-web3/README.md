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

4. **Configure Environment Variables**

   Create a `.env` file in the `packages/discord-web3` directory and add the following environment variables:

   ```plaintext
   DISCORD_TOKEN=your_discord_bot_token
   CLIENT_ID=your_discord_client_id
   ```

   Replace `your_discord_bot_token` and `your_discord_client_id` with your actual Discord bot token and client ID.

5. **Start the Bot**

   Run the following command to start the bot:

   ```bash
   pnpm run start
   ```

   The bot should now be running and connected to your Discord server.

## Additional Information

- The bot is configured to respond to the `/ping` command with "Pong!" and to open a modal with the `/openmodal` command.
- Ensure your bot has the necessary permissions to interact with your Discord server.

For any issues or contributions, please refer to the repository's issue tracker or contact the maintainers.
