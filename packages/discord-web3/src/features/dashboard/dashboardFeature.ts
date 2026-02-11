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

import { Chains, ChainsById, renderUser } from "../../utils";

export type DashboardDeps = {
  userModel: {
    getUser(
      userId: string,
      guildId: string,
    ): Promise<{ chainId: number; address: string }[]>;
  };
};

export async function handleDashboardCommand(
  interaction: Interaction,
  deps: DashboardDeps,
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

    // We can’t easily build a GuildMember here without fetch; keep simple text list for now.
    const lines = addresses
      .map(({ chainId, address }) => {
        const chainName = ChainsById[chainId]?.name ?? String(chainId);
        return `- **${chainName}** (${chainId}): \`${address}\``;
      })
      .join("\n");

    await (interaction as ButtonInteraction).reply({
      content: `**Your addresses**\n${lines}`,
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

    // Use existing feature customIds so the current handlers work.
    const rows = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("manageTokens")
          .setLabel("Manage tokens")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("manageSafe")
          .setLabel("Manage safes")
          .setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:admin:payout")
          .setLabel("Payouts (next)")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
      ),
    ];

    await (interaction as ButtonInteraction).update({
      content:
        "**Admin dashboard**\n\n" +
        "- Manage tokens/safes via UI\n" +
        "- Payout wizard coming next\n",
      components: rows,
    });

    return true;
  }

  return false;
}

export async function handleDashboardSelectMenu(
  interaction: Interaction,
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

  return false;
}
