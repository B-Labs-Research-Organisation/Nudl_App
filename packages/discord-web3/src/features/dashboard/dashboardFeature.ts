import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Interaction,
  MessageFlags,
  PermissionsBitField,
} from "discord.js";

export async function handleDashboardCommand(
  interaction: Interaction,
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
): Promise<boolean> {
  if (!interaction.isButton()) return false;

  if (interaction.customId === "dash:user") {
    await (interaction as ButtonInteraction).reply({
      content: "User dashboard (TODO): manage your addresses across chains.",
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

    await (interaction as ButtonInteraction).reply({
      content:
        "Admin dashboard (TODO): manage tokens/safes, payouts, and missing-address announcements.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  return false;
}
