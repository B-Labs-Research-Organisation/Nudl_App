import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Interaction,
  MessageFlags,
  TextChannel,
} from "discord.js";
import assert from "assert";

import { ChainsById } from "../../utils";

export type AddressModalFlowDeps = {
  client: Client;
  userModel: {
    setAddress(
      userId: string,
      guildId: string,
      chainId: number,
      address: string,
    ): Promise<void>;
    getAddress(
      userId: string,
      guildId: string,
      chainId: number,
    ): Promise<string | undefined>;
    getUser(
      userId: string,
      guildId: string,
    ): Promise<{ chainId: number; address: string }[]>;
  };
  ui: {
    lastUserAddressesHub: Record<string, { channelId: string; messageId: string }>;
    pendingAddressOverride: Record<string, { chainId: number; address: string }>;
  };
};

function renderAddressesHub(params: {
  guildId: string;
  userId: string;
  addresses: { chainId: number; address: string }[];
  notice?: string;
}) {
  const { addresses, notice } = params;
  const addressLines = addresses.length
    ? addresses
        .map(({ chainId, address }) => {
          const chainName = ChainsById[chainId]?.name ?? String(chainId);
          return `• **${chainName}** (${chainId}) — \`${address}\``;
        })
        .join("\n")
    : "_No addresses set yet._";

  const content = [notice ? `✅ ${notice}` : null, `**Addresses**`, "", addressLines]
    .filter(Boolean)
    .join("\n");

  const components = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:user:add")
        .setLabel("Add / update")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("dash:user:remove")
        .setLabel("Remove")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("dash:home")
        .setLabel("← Back")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { content, components };
}

export async function handleAddAddressModalSubmit(
  interaction: Interaction,
  deps: AddressModalFlowDeps,
): Promise<boolean> {
  if (!interaction.isModalSubmit()) return false;
  if (!interaction.customId.startsWith("addAddress_")) return false;

  const chainId = Number(interaction.customId.split("_")[1]);
  assert(chainId, "Invalid chain id");

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const newAddress = interaction.fields.getTextInputValue("addressInput");
  assert(newAddress, "Address is required");

  const existing = await deps.userModel.getAddress(userId, guildId, chainId);

  // If different existing value, confirm override
  if (existing && existing !== newAddress) {
    const key = `${guildId}:${userId}`;
    deps.ui.pendingAddressOverride[key] = { chainId, address: newAddress };

    const chainName = ChainsById[chainId]?.name ?? String(chainId);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`dash:user:override:confirm`)
        .setLabel("Yes, override")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`dash:user`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary),
    );

    // Prefer editing the hub message if we have it.
    const hub = deps.ui.lastUserAddressesHub[key];
    if (hub) {
      try {
        const channel = await deps.client.channels.fetch(hub.channelId);
        if (channel && channel.isTextBased()) {
          const msg = await (channel as any).messages.fetch(hub.messageId);
          await msg.edit({
            content:
              `**Confirm override** — ${chainName} (${chainId})\n\n` +
              `Current: \`${existing}\`\n` +
              `New: \`${newAddress}\`\n\n` +
              `Override this address?`,
            components: [row],
          });
        }
      } catch {
        // fallback to replying
        await interaction.reply({
          content:
            `**Confirm override** — ${chainName} (${chainId})\n\n` +
            `Current: \`${existing}\`\n` +
            `New: \`${newAddress}\`\n\n` +
            `Override this address?`,
          components: [row],
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
    }

    // Ack the modal submit so Discord doesn't show "interaction failed"
    await interaction.reply({
      content: "Got it — check the dashboard message to confirm override.",
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  // No existing, or same value
  await deps.userModel.setAddress(userId, guildId, chainId, newAddress);

  const addresses = await deps.userModel.getUser(userId, guildId);
  const hubView = renderAddressesHub({
    guildId,
    userId,
    addresses,
    notice: `Saved address for ${ChainsById[chainId]?.name ?? chainId}`,
  });

  const key = `${guildId}:${userId}`;
  const hub = deps.ui.lastUserAddressesHub[key];

  if (hub) {
    try {
      const channel = await deps.client.channels.fetch(hub.channelId);
      if (channel && channel.isTextBased()) {
        const msg = await (channel as any).messages.fetch(hub.messageId);
        await msg.edit(hubView);
      }
      await interaction.reply({
        content: "Saved — returning you to the Addresses hub.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    } catch {
      // fall through
    }
  }

  await interaction.reply({
    ...hubView,
    flags: MessageFlags.Ephemeral,
  });

  return true;
}

export async function handleConfirmOverrideButton(
  interaction: Interaction,
  deps: AddressModalFlowDeps,
): Promise<boolean> {
  if (!interaction.isButton()) return false;
  if (interaction.customId !== "dash:user:override:confirm") return false;

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const key = `${guildId}:${userId}`;
  const pending = deps.ui.pendingAddressOverride[key];
  assert(pending, "No pending override found");

  await deps.userModel.setAddress(userId, guildId, pending.chainId, pending.address);
  delete deps.ui.pendingAddressOverride[key];

  const addresses = await deps.userModel.getUser(userId, guildId);
  const chainName = ChainsById[pending.chainId]?.name ?? String(pending.chainId);

  const hubView = renderAddressesHub({
    guildId,
    userId,
    addresses,
    notice: `Updated address for ${chainName}`,
  });

  await (interaction as any).update(hubView);
  return true;
}
