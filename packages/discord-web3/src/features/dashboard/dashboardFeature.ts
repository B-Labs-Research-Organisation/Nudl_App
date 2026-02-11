import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Interaction,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import assert from "assert";

import { Chains, ChainsById, getAdminManageSafesDisplay, getAdminManageTokensDisplay } from "../../utils";

export type DashboardDeps = {
  userModel: {
    getUser(
      userId: string,
      guildId: string,
    ): Promise<{ chainId: number; address: string }[]>;
    deleteAddress(
      userId: string,
      guildId: string,
      chainId: number,
    ): Promise<boolean>;
  };
  tokenModel: {
    getTokensByGuild(guildId: string): Promise<any[]>;
  };
  safeModel: {
    getAllAddresses(guildId: string): Promise<any[]>;
  };
  stores: {
    payouts: Record<string, any>;
  };
};

export async function handleDashboardCommand(
  interaction: Interaction,
  _deps: DashboardDeps,
): Promise<boolean> {
  if (!interaction.isChatInputCommand()) return false;
  if (interaction.commandName !== "nudl") return false;

  const rows = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:user")
        .setLabel("My Addresses")
        .setStyle(ButtonStyle.Primary),
    ),
  ];

  await interaction.reply({
    content:
      "**nudl**\n\n" +
      "UI-first dashboard.\n" +
      "Admins: use `/nudl-admin`.\n",
    components: rows,
    flags: MessageFlags.Ephemeral,
  });

  return true;
}

export async function handleDashboardAdminCommand(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.isChatInputCommand()) return false;
  if (interaction.commandName !== "nudl-admin") return false;

  if (
    !interaction.memberPermissions?.has(
      PermissionsBitField.Flags.Administrator,
    )
  ) {
    await interaction.reply({
      content: "Admin dashboard requires Administrator permission.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const rows = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:admin")
        .setLabel("Backoffice")
        .setStyle(ButtonStyle.Primary),
    ),
  ];

  await interaction.reply({
    content:
      "**nudl admin**\n\n" +
      "Admin dashboard (WIP): manage tokens/safes, payouts, donation opt-in, and missing-address announcements.",
    components: rows,
    flags: MessageFlags.Ephemeral,
  });

  return true;
}

export async function handleDashboardButton(
  interaction: Interaction,
  deps: DashboardDeps,
): Promise<boolean> {
  if (!interaction.isButton()) return false;

  if (interaction.customId === "dash:user") {
    const rows = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:user:view")
          .setLabel("View my addresses")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("dash:user:add")
          .setLabel("Add / update address")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("dash:user:remove")
          .setLabel("Remove address")
          .setStyle(ButtonStyle.Danger),
      ),
    ];

    await (interaction as ButtonInteraction).update({
      content:
        "**My Addresses**\n\n" +
        "- View your saved addresses\n" +
        "- Add/update an address via guided UI\n",
      components: rows,
    });
    return true;
  }

  if (interaction.customId === "dash:user:view") {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    const addresses = await deps.userModel.getUser(userId, guildId);
    if (!addresses.length) {
      await (interaction as ButtonInteraction).reply({
        content: "No addresses set yet.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    // nicer formatting
    const lines = addresses
      .map(({ chainId, address }) => {
        const chainName = ChainsById[chainId]?.name ?? String(chainId);
        return `• **${chainName}** (${chainId}) — \`${address}\``;
      })
      .join("\n");

    await (interaction as ButtonInteraction).reply({
      content: `**Your addresses**\n\n${lines}`,
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  if (interaction.customId === "dash:user:remove") {
    const networkRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("dash:user:remove:network")
        .setPlaceholder("Select a network to remove...")
        .addOptions(
          Chains.map((c) => ({
            label: c.name,
            value: String(c.chainId),
            description: c.shortName ? `(${c.shortName})` : undefined,
          })),
        ),
    );

    await (interaction as ButtonInteraction).reply({
      content: "Pick a network to remove:",
      components: [networkRow],
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  if (interaction.customId === "dash:user:add") {
    // Select a network first (UI replacement for slash command options)
    const networkRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("dash:user:add:network")
        .setPlaceholder("Select a network...")
        .addOptions(
          Chains.map((c) => ({
            label: c.name,
            value: String(c.chainId),
            description: c.shortName ? `(${c.shortName})` : undefined,
          })),
        ),
    );

    await (interaction as ButtonInteraction).reply({
      content: "Pick a network to add/update:",
      components: [networkRow],
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  // confirm removal
  if (interaction.customId.startsWith("dash:user:remove:confirm:")) {
    const chainId = Number(interaction.customId.split(":")[3]);
    assert(chainId, "Invalid chain");

    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    await deps.userModel.deleteAddress(userId, guildId, chainId);

    const chainName = ChainsById[chainId]?.name ?? String(chainId);

    await (interaction as ButtonInteraction).reply({
      content: `✅ Removed your address for **${chainName}** (${chainId}).`,
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  if (interaction.customId === "dash:admin") {
    if (
      !interaction.memberPermissions?.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      await (interaction as ButtonInteraction).reply({
        content: "Admin dashboard requires Administrator permission.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const rows = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:admin:tokens")
          .setLabel("Manage tokens")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("dash:admin:safes")
          .setLabel("Manage safes")
          .setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:admin:payout:start")
          .setLabel("Start payout")
          .setStyle(ButtonStyle.Success),
      ),
    ];

    await (interaction as ButtonInteraction).update({
      content: "**Admin dashboard**\n\nChoose a category:",
      components: rows,
    });

    return true;
  }

  if (interaction.customId === "dash:admin:tokens") {
    const guild = interaction.guild;
    assert(guild, "This command can only be used within a guild.");

    const allTokens = await deps.tokenModel.getTokensByGuild(guild.id);
    const view = getAdminManageTokensDisplay({ allTokens });

    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:admin")
        .setLabel("← Back to Backoffice")
        .setStyle(ButtonStyle.Secondary),
    );

    await (interaction as ButtonInteraction).update({
      ...view,
      components: [...(view.components ?? []), backRow],
    });

    return true;
  }

  if (interaction.customId === "dash:admin:safes") {
    const guild = interaction.guild;
    assert(guild, "This command can only be used within a guild.");

    const allSafes = await deps.safeModel.getAllAddresses(guild.id);
    const view = getAdminManageSafesDisplay({ allSafes });

    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:admin")
        .setLabel("← Back to Backoffice")
        .setStyle(ButtonStyle.Secondary),
    );

    await (interaction as ButtonInteraction).update({
      ...view,
      components: [...(view.components ?? []), backRow],
    });

    return true;
  }

  if (interaction.customId === "dash:admin:payout:start") {
    if (
      !interaction.memberPermissions?.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      await (interaction as ButtonInteraction).reply({
        content: "Admin dashboard requires Administrator permission.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    // Create a payout session and reuse existing payoutModal_<id> handler
    const payoutId = String(Date.now());
    deps.stores.payouts[payoutId] = {
      id: payoutId,
      list: [],
      csvData: "",
    };

    const modal = new ModalBuilder()
      .setCustomId(`payoutModal_${payoutId}`)
      .setTitle("Paste payout CSV");

    const input = new TextInputBuilder()
      .setCustomId(`csvInput`)
      .setLabel("Paste CSV (discordid,amount per line)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );

    await (interaction as ButtonInteraction).showModal(modal);
    return true;
  }

  return false;
}

export async function handleDashboardSelectMenu(
  interaction: Interaction,
  deps: DashboardDeps,
): Promise<boolean> {
  if (!interaction.isStringSelectMenu()) return false;

  if (interaction.customId === "dash:user:add:network") {
    const chainId = Number(interaction.values[0]);
    assert(chainId, "Invalid chain");

    const chainName = ChainsById[chainId]?.name ?? String(chainId);

    // Reuse existing modal submit handling by using the legacy customId: addAddress_<chainId>
    const modal = new ModalBuilder()
      .setCustomId(`addAddress_${chainId}`)
      .setTitle(`Add Address for ${chainName} (${chainId})`);

    const input = new TextInputBuilder()
      .setCustomId("addressInput")
      .setLabel("Enter your address")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );

    await (interaction as StringSelectMenuInteraction).showModal(modal);
    return true;
  }

  if (interaction.customId === "dash:user:remove:network") {
    const chainId = Number(interaction.values[0]);
    assert(chainId, "Invalid chain");

    const chainName = ChainsById[chainId]?.name ?? String(chainId);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`dash:user:remove:confirm:${chainId}`)
        .setLabel(`Remove ${chainName}`)
        .setStyle(ButtonStyle.Danger),
    );

    await (interaction as StringSelectMenuInteraction).reply({
      content: `Confirm removal for **${chainName}** (${chainId})?`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  return false;
}
