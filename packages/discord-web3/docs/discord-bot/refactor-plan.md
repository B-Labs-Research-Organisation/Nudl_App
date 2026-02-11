# Discord Bot Refactor Plan

_Last updated: 2026-02-01_

## 1. Current State Overview (`src/main.ts`)

`main.ts` currently owns every major responsibility:

- **Environment & configuration**
  - Loads `.env` via `dotenv`
  - Reads `REDIS_URL`, `DISCORD_TOKEN`, `CLIENT_ID`
- **Discord client bootstrap**
  - Instantiates `Client` with `Guilds` + `GuildMembers` intents
  - Registers global slash commands via `REST` on the `ready` event
- **Data stores and models**
  - Creates user, token, safe stores (Redis-backed if available, otherwise in-memory `MapStore`)
  - Exposes `Users` and `Tokens` models closing over those stores
  - Holds process-wide mutable maps (`manageSafes`, `safeGenerations`, `dispersePayouts`, `csvAirdropPayouts`, `payouts`) for multi-step workflows
- **Interaction handling**
  - A single `interactionCreate` listener branches on command names, buttons, modals, and select menus via long `if / else` blocks
  - Business logic, validation, persistence operations, and view rendering intermingle in each branch
- **Helpers inline**
  - ad-hoc parsing of custom IDs, CSV parsing, viem contract queries, embed/message construction directly in the interaction handler

This monolithic setup makes it hard to reason about dependencies, reuse responses, or add new interaction types without modifying the giant conditional tree.

## 2. Shared State & Dependencies

| Concern | Current Form | Notes |
| --- | --- | --- |
| Discord client | `client` in outer scope | Needed by all handlers |
| REST API | `rest` created inside `ready` event | Used only for slash-command registration |
| Models | `userModel`, `safeModel`, `tokenModel` | Passed implicitly through closure |
| Session maps | `safeGenerations`, `dispersePayouts`, `csvAirdropPayouts`, `manageSafes`, `payouts` | Unstructured `Record<string, ...>` objects |
| Utilities | Imported from `utils.ts`, `router.ts`, `api.ts`, etc. | Handlers import directly |
| External services | Redis (optional), viem RPC per command | Connection setup scattered |

## 3. Proposed `BotContext`

Centralize all shared dependencies so handlers receive an explicit context:

```ts
export interface BotContext {
  client: Client;
  rest: REST;
  config: {
    chains: ChainSummary[];
  };
  models: {
    users: ReturnType<typeof Users>;
    safes: ReturnType<typeof Users>;
    tokens: ReturnType<typeof Tokens>;
  };
  stores: {
    manageSafes: ManageSafesStore;
    safeGenerations: SafeGenerationStore;
    dispersePayouts: DispersePayoutStore;
    csvAirdropPayouts: CsvAirdropPayoutStore;
    payouts: PayoutStore;
  };
  logger: Logger;
}
```

- `…Store` types can initially be thin wrappers around `Map<string, Session>`; later we can provide Redis-backed implementations.
- `logger` can be a lightweight console wrapper for now.

## 4. Boot Sequence Outline

1. **Load configuration** (`dotenv`, runtime env validation)
2. **Initialize data stores**
   - Build Redis or in-memory stores based on env
   - Construct model instances (`Users`, `Tokens`)
   - Instantiate store wrappers for session state
3. **Create Discord client** with intents
4. **Build REST client** using token
5. **Assemble `BotContext`** from the above pieces
6. **Register slash commands** with REST using definitions exported from the command registry
7. **Attach event listeners**
   - `client.once("ready", …)` for logging + optional warmups
   - `client.on("interactionCreate", interactionDispatcher(context))`
8. **Login** via `client.login(DISCORD_TOKEN)`

`src/main.ts` can become a minimal entrypoint that constructs the context via a `createBot()` helper and calls `start()`.

## 5. Interaction Types to Support

- **Slash commands** (`ChatInputCommandInteraction`)
- **Autocomplete** (`AutocompleteInteraction`)
- **Modals** (`ModalSubmitInteraction`)
- **Buttons** (`ButtonInteraction`)
- **Select menus** (strings now, potentially multi-select later)

Each should have its own registry keyed by identifier, with shared parsing helpers for composite IDs (e.g., `safePayoutModal_<id>`).

## 6. Next Steps

- Draft dispatcher & registry design (P2-T1)
- Implement bootstrap extraction (P1-T2)
- Migrate one command into new handler pattern to validate approach (P2-T2)

Future phases will expand the registry and move remaining commands, introduce better session-store abstractions, and clean up view rendering.
